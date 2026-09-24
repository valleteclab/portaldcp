import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { DisputaService } from './disputa.service';
import { SigiloDisputaService, VisaoDisputa } from './sigilo-disputa.service';
import { WsAutenticador, atorDoSocket } from '../auth/acesso/ws-autenticador';
import { AcessoLicitacaoService, ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { ehFornecedor } from '../auth/acesso/ator';

/**
 * ============================================================================
 * DISPUTA GATEWAY V2
 * ============================================================================
 *
 * WebSocket Gateway para comunicação em tempo real da Sala de Disputa
 * Baseado no modelo do Comprasnet
 *
 * AUTORIZAÇÃO (E1a):
 *  - handshake autenticado (WsAutenticador): token inválido recusa a conexão;
 *  - identidade e papel vêm SÓ do token — `tipo`, `usuarioId` e `usuarioNome`
 *    do payload são ignorados (um `usuarioId` diferente do fornecedor do token
 *    é recusado com 'acesso_negado');
 *  - entrar na sala exige relação com a licitação: órgão dono / admin
 *    (PREGOEIRO) ou fornecedor com proposta válida (FORNECEDOR). Anônimo e
 *    logado sem relação: 'acesso_negado' (as telas da sala exigem login);
 *  - cada ação vale só para a sessão em que o cliente entrou;
 *  - broadcasts sem id/razão social/CNPJ de outros licitantes durante a
 *    disputa (código anônimo). Alertas do pregoeiro só para a sala do órgão.
 * ============================================================================
 */

interface ClienteConectado {
  socketId: string;
  sessaoId: string;
  licitacaoId: string;
  tipo: 'PREGOEIRO' | 'FORNECEDOR';
  /** Fornecedor: id do token. Pregoeiro: `sub` do token. */
  usuarioId: string;
  /** Nome real (para registro/ata) — NUNCA difundido aos outros durante a disputa. */
  usuarioNome: string;
}

/** Sala só do órgão dono (eventos com dados que não são públicos). */
export const salaOrgao = (sessaoId: string) => `sessao:${sessaoId}:orgao`;

@WebSocketGateway({
  namespace: '/disputa-v2',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class DisputaGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Namespace;

  private clientes: Map<string, ClienteConectado> = new Map();

  constructor(
    private readonly disputaService: DisputaService,
    private readonly wsAuth: WsAutenticador,
    private readonly acesso: AcessoLicitacaoService,
    private readonly sigilo: SigiloDisputaService,
  ) {}

  afterInit(server: Namespace) {
    this.wsAuth.instalar(server);
  }

  // ============================================================================
  // CONEXÃO / DESCONEXÃO
  // ============================================================================

  handleConnection(client: Socket) {
    console.log(`[Disputa-v2] Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`[Disputa-v2] Cliente desconectado: ${client.id}`);
    this.clientes.delete(client.id);
  }

  /** Visão do cliente para os dados que ele recebe. */
  private visaoDe(info: ClienteConectado | undefined): VisaoDisputa {
    if (info?.tipo === 'PREGOEIRO') return { tipo: 'ORGAO' };
    if (info?.tipo === 'FORNECEDOR') return { tipo: 'FORNECEDOR', fornecedorId: info.usuarioId };
    return { tipo: 'PUBLICO' };
  }

  /** Cliente na sala desta sessão (qualquer papel) — senão emite 'erro'. */
  private clienteDaSessao(client: Socket, sessaoId: string | undefined): ClienteConectado | null {
    const info = this.clientes.get(client.id);
    if (!info || !sessaoId || info.sessaoId !== sessaoId) {
      client.emit('erro', { mensagem: 'Entre na sala desta sessão antes de agir' });
      return null;
    }
    return info;
  }

  /** Pregoeiro (órgão dono) na sala desta sessão — senão emite 'erro'. */
  private pregoeiroDaSessao(client: Socket, sessaoId: string | undefined, acao: string): ClienteConectado | null {
    const info = this.clientes.get(client.id);
    if (!info || info.tipo !== 'PREGOEIRO' || !sessaoId || info.sessaoId !== sessaoId) {
      client.emit('erro', { mensagem: `Apenas o pregoeiro pode ${acao}` });
      return null;
    }
    return info;
  }

  /**
   * Emite para cada cliente da sala os itens na visão dele (usado também pelo
   * relógio da disputa ao encerrar item).
   */
  async emitirItensPorVisao(sessaoId: string, licitacaoId: string | null, evento: string, extra: Record<string, any>) {
    const licId = licitacaoId || (await this.acesso.donoDaSessao(sessaoId))?.licitacaoId;
    if (!licId) return;
    const aplicar = await this.sigilo.aplicador(licId, sessaoId);
    const sockets = await this.server.in(`sessao:${sessaoId}`).fetchSockets();
    for (const s of sockets) {
      const visao = this.visaoDe(this.clientes.get(s.id));
      const itens = await this.disputaService.getItensPorStatus(
        sessaoId,
        visao.tipo === 'FORNECEDOR' ? visao.fornecedorId : undefined,
      );
      // `extra` (ex.: vencedor do item encerrado) segue como antes; os itens na visão do cliente
      s.emit(evento, { ...extra, itens: aplicar(itens, visao) });
    }
  }

  // ============================================================================
  // ENTRAR NA SALA
  // ============================================================================

  @SubscribeMessage('entrar_sala')
  async handleEntrarSala(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      sessaoId: string;
      /** Ignorados (legado): identidade e papel vêm do token. */
      tipo?: 'PREGOEIRO' | 'FORNECEDOR';
      usuarioId?: string;
      usuarioNome?: string;
    },
  ) {
    const sessaoId = data?.sessaoId;

    try {
      const ator = atorDoSocket(client);
      const negar = (mensagem: string, codigo: string) => {
        client.emit('acesso_negado', { mensagem, codigo });
        client.disconnect();
      };
      if (!ator) return negar('Faça login para entrar na sala de disputa.', 'NAO_AUTENTICADO');
      const dono = ehUuid(sessaoId) ? await this.acesso.donoDaSessao(sessaoId) : null;
      if (!dono) return negar('Sessão não encontrada.', 'SESSAO_INEXISTENTE');

      const relacao = await this.acesso.relacaoComLicitacao(ator, dono.licitacaoId);
      if (!relacao) return negar('Você não participa desta licitação.', 'SEM_RELACAO');

      let tipo: 'PREGOEIRO' | 'FORNECEDOR';
      let usuarioId: string;
      let usuarioNome: string;
      if (relacao === 'FORNECEDOR_PARTICIPANTE' && ehFornecedor(ator)) {
        // Um usuarioId declarado diferente do token é tentativa de agir por outro
        if (data?.usuarioId && data.usuarioId !== ator.fornecedorId) {
          console.log(`[Disputa-v2] ACESSO NEGADO: token de ${ator.fornecedorId} declarou usuarioId ${data.usuarioId}`);
          return negar('O fornecedor informado não confere com o usuário autenticado.', 'IDENTIDADE_DIVERGENTE');
        }
        // VALIDAÇÃO: Fornecedor deve ter proposta classificada
        const elegibilidade = await this.disputaService.verificarElegibilidadeFornecedor(sessaoId, ator.fornecedorId);
        if (!elegibilidade.elegivel) {
          return negar(elegibilidade.motivo || 'Sem proposta classificada.', 'SEM_PROPOSTA_CLASSIFICADA');
        }
        tipo = 'FORNECEDOR';
        usuarioId = ator.fornecedorId;
        usuarioNome = await this.disputaService.nomeDoFornecedor(ator.fornecedorId);
      } else {
        tipo = 'PREGOEIRO';
        usuarioId = ator.id;
        usuarioNome = (data?.usuarioNome && String(data.usuarioNome).slice(0, 120)) || 'Pregoeiro';
      }

      // Troca de sala: sai da anterior
      const anterior = this.clientes.get(client.id);
      if (anterior && anterior.sessaoId !== sessaoId) {
        client.leave(`sessao:${anterior.sessaoId}`);
        client.leave(salaOrgao(anterior.sessaoId));
      }

      this.clientes.set(client.id, {
        socketId: client.id,
        sessaoId,
        licitacaoId: dono.licitacaoId,
        tipo,
        usuarioId,
        usuarioNome,
      });

      client.join(`sessao:${sessaoId}`);
      if (tipo === 'PREGOEIRO') client.join(salaOrgao(sessaoId));

      console.log(`[Disputa-v2] ${tipo} entrou na sessão ${sessaoId}`);

      // Dados iniciais na visão do cliente
      const visao = this.visaoDe(this.clientes.get(client.id));
      const sessao = await this.disputaService.getSessao(sessaoId);
      const itens = await this.disputaService.getItensPorStatus(
        sessaoId,
        visao.tipo === 'FORNECEDOR' ? visao.fornecedorId : undefined,
      );
      client.emit('dados_iniciais', await this.sigilo.aplicarVisao({ sessao, itens }, dono.licitacaoId, visao, { sessaoId }));

      // Notificar os outros — sem identidade do licitante
      client.to(`sessao:${sessaoId}`).emit('participante_entrou', {
        tipo,
        nome: tipo === 'PREGOEIRO' ? 'Pregoeiro' : 'Licitante',
      });
    } catch (error) {
      console.error(`[Disputa-v2] Erro ao entrar na sala:`, error.message);
      client.emit('erro', { mensagem: error.message });
    }
  }

  // ============================================================================
  // AÇÕES DO PREGOEIRO
  // ============================================================================

  @SubscribeMessage('iniciar_itens')
  async handleIniciarItens(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string; itensIds: string[] },
  ) {
    const info = this.pregoeiroDaSessao(client, data?.sessaoId, 'iniciar itens');
    if (!info) return;

    try {
      const resultado = await this.disputaService.iniciarDisputa(data.sessaoId, Array.isArray(data.itensIds) ? data.itensIds : []);
      await this.emitirItensPorVisao(data.sessaoId, info.licitacaoId, 'itens_iniciados', {
        itensIniciados: resultado.itensIniciados,
      });
    } catch (error) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  @SubscribeMessage('encerrar_item')
  async handleEncerrarItem(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string; itemId: string },
  ) {
    const info = this.pregoeiroDaSessao(client, data?.sessaoId, 'encerrar itens');
    if (!info) return;

    try {
      const resultado = await this.disputaService.encerrarItem(data.sessaoId, data.itemId);
      // Item encerrado: o vencedor pode ser revelado (fim da disputa do item)
      await this.emitirItensPorVisao(data.sessaoId, info.licitacaoId, 'item_encerrado', {
        itemId: data.itemId,
        vencedor: resultado.vencedor,
      });
    } catch (error) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  @SubscribeMessage('suspender_sessao')
  async handleSuspenderSessao(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      sessaoId: string;
      motivo: 'ADMINISTRATIVO' | 'CAUTELAR' | 'JUDICIAL';
      justificativa: string;
      dataReabertura?: string;
    },
  ) {
    const info = this.pregoeiroDaSessao(client, data?.sessaoId, 'suspender a sessão');
    if (!info) return;

    try {
      await this.disputaService.suspenderSessao(
        data.sessaoId,
        data.motivo,
        data.justificativa,
        data.dataReabertura ? new Date(data.dataReabertura) : undefined,
      );

      const sessao = await this.disputaService.getSessao(data.sessaoId);

      this.server.to(`sessao:${data.sessaoId}`).emit('sessao_suspensa', {
        sessao,
        motivo: data.motivo,
        justificativa: data.justificativa,
      });
    } catch (error) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  @SubscribeMessage('retomar_sessao')
  async handleRetomarSessao(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string },
  ) {
    const info = this.pregoeiroDaSessao(client, data?.sessaoId, 'retomar a sessão');
    if (!info) return;

    try {
      await this.disputaService.retomarSessao(data.sessaoId);

      const sessao = await this.disputaService.getSessao(data.sessaoId);

      this.server.to(`sessao:${data.sessaoId}`).emit('sessao_retomada', {
        sessao,
      });
    } catch (error) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  @SubscribeMessage('reiniciar_sessao')
  async handleReiniciarSessao(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string; justificativa: string },
  ) {
    const info = this.pregoeiroDaSessao(client, data?.sessaoId, 'reiniciar a sessão');
    if (!info) return;

    try {
      const resultado = await this.disputaService.reiniciarSessao(data.sessaoId, data.justificativa);

      const sessao = await this.disputaService.getSessao(data.sessaoId);
      await this.emitirItensPorVisao(data.sessaoId, info.licitacaoId, 'sessao_reiniciada', {
        sessao,
        lancesCancelados: resultado.lancesCancelados,
        itensReiniciados: resultado.itensReiniciados,
      });
    } catch (error) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  @SubscribeMessage('enviar_mensagem')
  async handleEnviarMensagem(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string; conteudo: string },
  ) {
    const info = this.clienteDaSessao(client, data?.sessaoId);
    if (!info) return;
    const conteudo = typeof data.conteudo === 'string' ? data.conteudo.trim() : '';
    if (!conteudo) {
      client.emit('erro', { mensagem: 'Mensagem vazia' });
      return;
    }

    try {
      // Registro com o nome real (ata); difusão com o código anônimo
      await this.disputaService.enviarMensagem(data.sessaoId, info.usuarioNome, conteudo);

      let remetente = info.usuarioNome;
      if (info.tipo === 'FORNECEDOR') {
        remetente = await this.disputaService.codigoAnonimoSeguro(data.sessaoId, info.usuarioId);
      }

      this.server.to(`sessao:${data.sessaoId}`).emit('nova_mensagem', {
        tipo: info.tipo === 'PREGOEIRO' ? 'PREGOEIRO' : 'FORNECEDOR',
        remetente,
        conteudo,
        dataHora: new Date(),
      });
    } catch (error) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  // ============================================================================
  // AÇÕES DO FORNECEDOR
  // ============================================================================

  @SubscribeMessage('enviar_lance')
  async handleEnviarLance(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      sessaoId: string;
      itemId: string;
      valor: number;
    },
  ) {
    const info = this.clientes.get(client.id);
    if (!info || info.tipo !== 'FORNECEDOR') {
      client.emit('erro', { mensagem: 'Apenas fornecedores podem enviar lances' });
      return;
    }
    if (data?.sessaoId !== info.sessaoId) {
      client.emit('erro', { mensagem: 'Entre na sala desta sessão antes de dar lance' });
      return;
    }

    try {
      const lance = await this.disputaService.registrarLance(
        data.sessaoId,
        data.itemId,
        info.usuarioId,
        info.usuarioNome,
        data.valor,
        client.handshake.address,
      );

      // Lances do item (anonimizados durante a disputa)
      const lances = await this.disputaService.getTodosLances(data.itemId, data.sessaoId);
      const codigo = lances.find((l) => l.id === lance.id)?.fornecedorNome || 'Licitante';

      // Notificar cada cliente na sala com dados personalizados (visão de cada um)
      const aplicar = await this.sigilo.aplicador(info.licitacaoId, data.sessaoId);
      const clientesNaSala = await this.server.in(`sessao:${data.sessaoId}`).fetchSockets();
      for (const socketCliente of clientesNaSala) {
        const visao = this.visaoDe(this.clientes.get(socketCliente.id));
        const itensCliente = await this.disputaService.getItensPorStatus(
          data.sessaoId,
          visao.tipo === 'FORNECEDOR' ? visao.fornecedorId : undefined,
        );

        socketCliente.emit(
          'novo_lance',
          aplicar(
            {
              itemId: data.itemId,
              lance: {
                id: lance.id,
                valor: lance.valor,
                fornecedorNome: codigo,
                dataHora: lance.created_at,
              },
              lances,
              itens: itensCliente,
            },
            visao,
          ),
        );
      }

      // Confirmar para o fornecedor
      client.emit('lance_confirmado', {
        itemId: data.itemId,
        valor: lance.valor,
      });

      // =========================================================================
      // ALERTA 5%: Verificar diferença entre os dois melhores lances
      // Lei 14.133/2021 - Art. 61: Pregoeiro deve ser alertado (só a sala do órgão)
      // =========================================================================
      const diferencaLances = await this.disputaService.verificarDiferencaLances(data.itemId);

      if (diferencaLances.alertaAtivo) {
        const itens = await this.disputaService.getItensPorStatus(data.sessaoId);
        const todosItens = [...itens.aguardando, ...itens.emDisputa, ...itens.encerrados];
        const itemInfo = todosItens.find(i => i.id === data.itemId);

        this.server.to(salaOrgao(data.sessaoId)).emit('alerta_diferenca_5_porcento', {
          itemId: data.itemId,
          itemNumero: itemInfo?.numero || 0,
          diferencaPercentual: diferencaLances.diferencaPercentual,
          primeiroLance: diferencaLances.primeiroLance,
          segundoLance: diferencaLances.segundoLance,
          mensagem: `Atenção: A diferença entre o 1º e 2º colocado no Item ${itemInfo?.numero || ''} é de apenas ${diferencaLances.diferencaPercentual?.toFixed(2)}%. Considere reiniciar a disputa ou finalizar.`,
        });
      }
    } catch (error) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  // ============================================================================
  // BUSCAR DADOS
  // ============================================================================

  /**
   * Lances de um item da sessão em que o cliente está. A fase do item (e,
   * portanto, se as identidades podem aparecer) vem do servidor — o antigo
   * `itemEncerrado` do payload é ignorado.
   */
  @SubscribeMessage('buscar_lances_item')
  async handleBuscarLancesItem(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { itemId: string; tipo: 'propostas' | 'melhores' | 'todos' },
  ) {
    const info = this.clientes.get(client.id);
    if (!info) {
      client.emit('erro', { mensagem: 'Entre na sala antes de consultar lances' });
      return;
    }

    try {
      const dono = await this.acesso.donoDoItem(data?.itemId);
      if (!dono || dono.licitacaoId !== info.licitacaoId) {
        client.emit('erro', { mensagem: 'Item não pertence a esta sessão' });
        return;
      }
      const visao = this.visaoDe(info);
      const opts = { visaoOrgao: visao.tipo === 'ORGAO' };
      let resultado;

      switch (data.tipo) {
        case 'propostas':
          resultado = await this.disputaService.getPropostasIniciais(data.itemId, info.sessaoId, opts);
          break;
        case 'melhores':
          resultado = await this.disputaService.getMelhoresValoresPorFornecedor(data.itemId, info.sessaoId, opts);
          break;
        case 'todos':
        default:
          resultado = await this.disputaService.getTodosLances(data.itemId, info.sessaoId, opts);
      }

      const encerrado = await this.sigilo.itemEncerrado(data.itemId);
      client.emit('lances_item', {
        itemId: data.itemId,
        tipo: data.tipo,
        dados: await this.sigilo.aplicarVisao(resultado, info.licitacaoId, visao, {
          sessaoId: info.sessaoId,
          identidades: !encerrado,
        }),
      });
    } catch (error) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  @SubscribeMessage('buscar_mensagens')
  async handleBuscarMensagens(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string },
  ) {
    const info = this.clienteDaSessao(client, data?.sessaoId);
    if (!info) return;
    try {
      const mensagens = await this.disputaService.getMensagens(data.sessaoId);
      const reveladas = await this.sigilo.identidadesReveladas(data.sessaoId);

      client.emit('mensagens', {
        mensagens: await this.sigilo.aplicarVisao(mensagens, info.licitacaoId, this.visaoDe(info), {
          sessaoId: data.sessaoId,
          identidades: !reveladas,
        }),
      });
    } catch (error) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  // ============================================================================
  // ATUALIZAÇÃO PERIÓDICA (TIMER)
  // ============================================================================

  @SubscribeMessage('solicitar_atualizacao')
  async handleSolicitarAtualizacao(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string },
  ) {
    const info = this.clienteDaSessao(client, data?.sessaoId);
    if (!info) return;
    try {
      const visao = this.visaoDe(info);
      const itens = await this.disputaService.getItensPorStatus(
        data.sessaoId,
        visao.tipo === 'FORNECEDOR' ? visao.fornecedorId : undefined,
      );

      client.emit('atualizacao_itens', {
        itens: await this.sigilo.aplicarVisao(itens, info.licitacaoId, visao, { sessaoId: data.sessaoId }),
      });
    } catch (error) {
      client.emit('erro', { mensagem: error.message });
    }
  }
}

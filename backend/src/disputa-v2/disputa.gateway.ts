import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DisputaService } from './disputa.service';

/**
 * ============================================================================
 * DISPUTA GATEWAY V2
 * ============================================================================
 * 
 * WebSocket Gateway para comunicação em tempo real da Sala de Disputa
 * Baseado no modelo do Comprasnet
 * ============================================================================
 */

interface ClienteConectado {
  socketId: string;
  sessaoId: string;
  tipo: 'PREGOEIRO' | 'FORNECEDOR';
  usuarioId: string;
  usuarioNome: string;
}

@WebSocketGateway({
  namespace: '/disputa-v2',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class DisputaGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private clientes: Map<string, ClienteConectado> = new Map();

  constructor(private readonly disputaService: DisputaService) {}

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

  // ============================================================================
  // ENTRAR NA SALA
  // ============================================================================

  @SubscribeMessage('entrar_sala')
  async handleEntrarSala(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      sessaoId: string;
      tipo: 'PREGOEIRO' | 'FORNECEDOR';
      usuarioId: string;
      usuarioNome: string;
    },
  ) {
    const { sessaoId, tipo, usuarioId, usuarioNome } = data;

    try {
      // =========================================================================
      // VALIDAÇÃO DE SEGURANÇA: Fornecedor deve ter proposta classificada
      // =========================================================================
      if (tipo === 'FORNECEDOR') {
        const elegibilidade = await this.disputaService.verificarElegibilidadeFornecedor(sessaoId, usuarioId);
        
        if (!elegibilidade.elegivel) {
          console.log(`[Disputa-v2] ❌ ACESSO NEGADO: Fornecedor ${usuarioNome} (${usuarioId}) tentou entrar sem proposta classificada`);
          client.emit('acesso_negado', {
            mensagem: elegibilidade.motivo,
            codigo: 'SEM_PROPOSTA_CLASSIFICADA',
          });
          client.disconnect();
          return;
        }
        
        console.log(`[Disputa-v2] ✅ Fornecedor ${usuarioNome} elegível com ${elegibilidade.propostasClassificadas} proposta(s) classificada(s)`);
      }

      // Registrar cliente
      this.clientes.set(client.id, {
        socketId: client.id,
        sessaoId,
        tipo,
        usuarioId,
        usuarioNome,
      });

      // Entrar na sala do socket.io
      client.join(`sessao:${sessaoId}`);

      console.log(`[Disputa-v2] ${tipo} ${usuarioNome} entrou na sessão ${sessaoId}`);

      // Buscar dados iniciais
      const sessao = await this.disputaService.getSessao(sessaoId);
      // Se for fornecedor, passa o ID para buscar dados específicos dele
      const fornecedorId = tipo === 'FORNECEDOR' ? usuarioId : undefined;
      const itens = await this.disputaService.getItensPorStatus(sessaoId, fornecedorId);

      client.emit('dados_iniciais', {
        sessao,
        itens,
      });

      // Notificar outros participantes
      client.to(`sessao:${sessaoId}`).emit('participante_entrou', {
        tipo,
        nome: usuarioNome,
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
    const clienteInfo = this.clientes.get(client.id);
    if (!clienteInfo || clienteInfo.tipo !== 'PREGOEIRO') {
      client.emit('erro', { mensagem: 'Apenas o pregoeiro pode iniciar itens' });
      return;
    }

    try {
      const resultado = await this.disputaService.iniciarDisputa(data.sessaoId, data.itensIds);

      // Buscar itens atualizados
      const itens = await this.disputaService.getItensPorStatus(data.sessaoId);

      // Notificar todos na sala
      this.server.to(`sessao:${data.sessaoId}`).emit('itens_iniciados', {
        itensIniciados: resultado.itensIniciados,
        itens,
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
    const clienteInfo = this.clientes.get(client.id);
    if (!clienteInfo || clienteInfo.tipo !== 'PREGOEIRO') {
      client.emit('erro', { mensagem: 'Apenas o pregoeiro pode encerrar itens' });
      return;
    }

    try {
      const resultado = await this.disputaService.encerrarItem(data.sessaoId, data.itemId);

      // Buscar itens atualizados
      const itens = await this.disputaService.getItensPorStatus(data.sessaoId);

      // Notificar todos na sala
      this.server.to(`sessao:${data.sessaoId}`).emit('item_encerrado', {
        itemId: data.itemId,
        vencedor: resultado.vencedor,
        itens,
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
    const clienteInfo = this.clientes.get(client.id);
    if (!clienteInfo || clienteInfo.tipo !== 'PREGOEIRO') {
      client.emit('erro', { mensagem: 'Apenas o pregoeiro pode suspender a sessão' });
      return;
    }

    try {
      await this.disputaService.suspenderSessao(
        data.sessaoId,
        data.motivo,
        data.justificativa,
        data.dataReabertura ? new Date(data.dataReabertura) : undefined,
      );

      const sessao = await this.disputaService.getSessao(data.sessaoId);

      // Notificar todos na sala
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
    const clienteInfo = this.clientes.get(client.id);
    if (!clienteInfo || clienteInfo.tipo !== 'PREGOEIRO') {
      client.emit('erro', { mensagem: 'Apenas o pregoeiro pode retomar a sessão' });
      return;
    }

    try {
      await this.disputaService.retomarSessao(data.sessaoId);

      const sessao = await this.disputaService.getSessao(data.sessaoId);

      // Notificar todos na sala
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
    const clienteInfo = this.clientes.get(client.id);
    if (!clienteInfo || clienteInfo.tipo !== 'PREGOEIRO') {
      client.emit('erro', { mensagem: 'Apenas o pregoeiro pode reiniciar a sessão' });
      return;
    }

    try {
      const resultado = await this.disputaService.reiniciarSessao(data.sessaoId, data.justificativa);

      const sessao = await this.disputaService.getSessao(data.sessaoId);
      const itens = await this.disputaService.getItensPorStatus(data.sessaoId);

      // Notificar todos na sala
      this.server.to(`sessao:${data.sessaoId}`).emit('sessao_reiniciada', {
        sessao,
        itens,
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
    const clienteInfo = this.clientes.get(client.id);
    if (!clienteInfo) {
      client.emit('erro', { mensagem: 'Cliente não identificado' });
      return;
    }

    try {
      await this.disputaService.enviarMensagem(
        data.sessaoId,
        clienteInfo.usuarioNome,
        data.conteudo,
      );

      // Notificar todos na sala
      this.server.to(`sessao:${data.sessaoId}`).emit('nova_mensagem', {
        tipo: clienteInfo.tipo === 'PREGOEIRO' ? 'PREGOEIRO' : 'FORNECEDOR',
        remetente: clienteInfo.usuarioNome,
        conteudo: data.conteudo,
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
    const clienteInfo = this.clientes.get(client.id);
    if (!clienteInfo || clienteInfo.tipo !== 'FORNECEDOR') {
      client.emit('erro', { mensagem: 'Apenas fornecedores podem enviar lances' });
      return;
    }

    try {
      const lance = await this.disputaService.registrarLance(
        data.sessaoId,
        data.itemId,
        clienteInfo.usuarioId,
        clienteInfo.usuarioNome,
        data.valor,
        client.handshake.address,
      );

      // Buscar lances atualizados do item para atualização em tempo real (com anonimização)
      const lances = await this.disputaService.getTodosLances(data.itemId, data.sessaoId);

      // Notificar cada cliente na sala com dados personalizados
      const clientesNaSala = await this.server.in(`sessao:${data.sessaoId}`).fetchSockets();
      for (const socketCliente of clientesNaSala) {
        const infoCliente = this.clientes.get(socketCliente.id);
        const fornecedorIdCliente = infoCliente?.tipo === 'FORNECEDOR' ? infoCliente.usuarioId : undefined;
        const itensCliente = await this.disputaService.getItensPorStatus(data.sessaoId, fornecedorIdCliente);
        
        socketCliente.emit('novo_lance', {
          itemId: data.itemId,
          lance: {
            id: lance.id,
            valor: lance.valor,
            fornecedorNome: clienteInfo.usuarioNome,
            dataHora: lance.created_at,
          },
          lances,
          itens: itensCliente,
        });
      }

      // Confirmar para o fornecedor
      client.emit('lance_confirmado', {
        itemId: data.itemId,
        valor: lance.valor,
      });

      // =========================================================================
      // ALERTA 5%: Verificar diferença entre os dois melhores lances
      // Lei 14.133/2021 - Art. 61: Pregoeiro deve ser alertado
      // =========================================================================
      const diferencaLances = await this.disputaService.verificarDiferencaLances(data.itemId);
      
      if (diferencaLances.alertaAtivo) {
        // Buscar item para incluir número no alerta
        const itens = await this.disputaService.getItensPorStatus(data.sessaoId);
        const todosItens = [...itens.aguardando, ...itens.emDisputa, ...itens.encerrados];
        const itemInfo = todosItens.find(i => i.id === data.itemId);

        // Emitir alerta apenas para o pregoeiro
        for (const socketCliente of clientesNaSala) {
          const infoCliente = this.clientes.get(socketCliente.id);
          if (infoCliente?.tipo === 'PREGOEIRO') {
            socketCliente.emit('alerta_diferenca_5_porcento', {
              itemId: data.itemId,
              itemNumero: itemInfo?.numero || 0,
              diferencaPercentual: diferencaLances.diferencaPercentual,
              primeiroLance: diferencaLances.primeiroLance,
              segundoLance: diferencaLances.segundoLance,
              mensagem: `Atenção: A diferença entre o 1º e 2º colocado no Item ${itemInfo?.numero || ''} é de apenas ${diferencaLances.diferencaPercentual?.toFixed(2)}%. Considere reiniciar a disputa ou finalizar.`,
            });
          }
        }
      }
    } catch (error) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  // ============================================================================
  // BUSCAR DADOS
  // ============================================================================

  @SubscribeMessage('buscar_lances_item')
  async handleBuscarLancesItem(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { itemId: string; tipo: 'propostas' | 'melhores' | 'todos'; itemEncerrado?: boolean },
  ) {
    const clienteInfo = this.clientes.get(client.id);
    const itemEncerrado = data.itemEncerrado ?? false;
    
    try {
      let resultado;

      switch (data.tipo) {
        case 'propostas':
          resultado = await this.disputaService.getPropostasIniciais(data.itemId, clienteInfo?.sessaoId, itemEncerrado);
          break;
        case 'melhores':
          resultado = await this.disputaService.getMelhoresValoresPorFornecedor(data.itemId, clienteInfo?.sessaoId, itemEncerrado);
          break;
        case 'todos':
        default:
          resultado = await this.disputaService.getTodosLances(data.itemId, clienteInfo?.sessaoId, itemEncerrado);
      }

      client.emit('lances_item', {
        itemId: data.itemId,
        tipo: data.tipo,
        dados: resultado,
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
    try {
      const mensagens = await this.disputaService.getMensagens(data.sessaoId);

      client.emit('mensagens', {
        mensagens,
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
    try {
      const itens = await this.disputaService.getItensPorStatus(data.sessaoId);

      client.emit('atualizacao_itens', {
        itens,
      });
    } catch (error) {
      client.emit('erro', { mensagem: error.message });
    }
  }
}

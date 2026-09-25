import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { SessaoDisputa, StatusSessao, EtapaSessao } from '../sessao/entities/sessao-disputa.entity';
import { EventoSessao, TipoEvento } from '../sessao/entities/evento-sessao.entity';
import { StatusDisputaItem } from '../itens/entities/item-licitacao.entity';
import { DisputaService, TIPOS_CHAT } from './disputa.service';
import { DisputaGateway } from './disputa.gateway';
import { AnonimizacaoService } from './anonimizacao.service';
import { OrigemLance } from './modelo-lance';
import { calcularRelogioJanela } from './relogio-disputa';
import { exigirLicitacaoAtiva } from '../sessao/licitacao-ativa';

/**
 * ============================================================================
 * JANELA DE LANCES DA DISPENSA ELETRÔNICA — modo JANELA do motor único
 * (Lei 14.133 art. 75 §3º; IN SEGES 67/2021) — plano E2 item 7
 * ============================================================================
 *
 * A dispensa é um PROCEDIMENTO do mesmo motor (decisão de 24/09/2026): a camada
 * de processo (instrução art. 72, divulgação, sigilo, PNCP, julgamento,
 * contrato) continua em `LicitacoesService`; o que é da SALA vive aqui:
 *
 *  - sala = uma `SessaoDisputa` da licitação (criada na 1ª necessidade: abrir a
 *    janela ou 1ª mensagem do chat);
 *  - lance = `DisputaService.registrarLance` com origem JANELA_DISPENSA (trava,
 *    regra "reduz o PRÓPRIO valor", valor UNITÁRIO, tabela única `lances`);
 *  - relógio = `calcularRelogioJanela` / `prorrogacaoDaJanela` (relogio-disputa.ts)
 *    e o encerramento pelo DisputaTimerService — não há outro timer;
 *  - chat = eventos da sessão (MENSAGEM_*), com a anonimização única
 *    (`mapeamento_anonimo`: "Fornecedor A") enquanto a janela está aberta;
 *  - tempo real = gateway único `/disputa`, sala pública da licitação
 *    (`licitacao:<id>` — painel anônimo) — os gateways `/dispensa` e `/sessao`
 *    foram removidos.
 *
 * As tabelas `dispensa_lances` e `dispensa_mensagens` NÃO são mais escritas
 * (migração: `migracao-dispensa.ts`).
 */

/** Status de proposta que não participam (mesma regra do acolhimento da dispensa). */
const STATUS_PROPOSTA_INVALIDA = ['RASCUNHO', 'DESCLASSIFICADA', 'CANCELADA'];

const fmtBrasilia = (d: Date) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

export interface EstadoJanela {
  licitacaoId: string;
  modalidade: string;
  numeroProcesso: string | null;
  dataHomologacao: Date | null;
  corteSigilo: Date | null;
  inicio: Date | null;
  fim: Date | null;
  prorrogacaoMinutos: number;
}

export interface LanceDaJanela {
  item_licitacao_id: string;
  fornecedor_id: string;
  valor_unitario: string;
}

@Injectable()
export class JanelaDispensaService {
  private readonly logger = new Logger(JanelaDispensaService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly disputa: DisputaService,
    private readonly anonimizacao: AnonimizacaoService,
    private readonly gateway: DisputaGateway,
  ) {}

  // ==========================================================================
  // ESTADO DA JANELA E SALA
  // ==========================================================================

  async estado(licitacaoId: string, m: EntityManager = this.dataSource.manager, travar = false): Promise<EstadoJanela> {
    const [l] = await m.query(
      `SELECT id, modalidade::text AS modalidade, numero_processo, data_homologacao,
              COALESCE(data_fim_acolhimento, data_abertura_sessao) AS corte,
              dispensa_lances_inicio, dispensa_lances_fim, dispensa_lances_prorrogacao_min
         FROM licitacoes WHERE id = $1${travar ? ' FOR UPDATE' : ''}`,
      [licitacaoId],
    );
    if (!l) throw new NotFoundException('Licitação não encontrada');
    return {
      licitacaoId: l.id,
      modalidade: l.modalidade,
      numeroProcesso: l.numero_processo ?? null,
      dataHomologacao: l.data_homologacao ? new Date(l.data_homologacao) : null,
      corteSigilo: l.corte ? new Date(l.corte) : null,
      inicio: l.dispensa_lances_inicio ? new Date(l.dispensa_lances_inicio) : null,
      fim: l.dispensa_lances_fim ? new Date(l.dispensa_lances_fim) : null,
      prorrogacaoMinutos: Number(l.dispensa_lances_prorrogacao_min) || 0,
    };
  }

  /** A janela está aberta agora? (relógio único) */
  janelaAberta(e: Pick<EstadoJanela, 'inicio' | 'fim'>, agora = Date.now()): boolean {
    return calcularRelogioJanela({ inicio: e.inicio, fim: e.fim, agora }).aberta;
  }

  /** Sessão (sala) da dispensa; cria na primeira necessidade (serializado por licitação). */
  async sessaoDaDispensa(licitacaoId: string, m?: EntityManager): Promise<SessaoDisputa> {
    const executar = async (tx: EntityManager) => {
      await tx.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`sessao-dispensa:${licitacaoId}`]);
      const existente = await tx.findOne(SessaoDisputa, { where: { licitacao_id: licitacaoId }, order: { created_at: 'DESC' } });
      if (existente) return existente;
      return tx.save(
        tx.create(SessaoDisputa, {
          licitacao_id: licitacaoId,
          status: StatusSessao.AGUARDANDO_INICIO,
          etapa: EtapaSessao.ABERTURA_SESSAO,
          disputa_por_item: true,
          modo_aberto: true,
          pregoeiro_nome: 'Agente de contratação',
          observacoes: 'Sala da dispensa eletrônica (janela de lances — IN SEGES 67/2021)',
        }),
      );
    };
    return m ? executar(m) : this.dataSource.transaction(executar);
  }

  /** Sessão existente (sem criar) — leituras. */
  private async sessaoExistente(licitacaoId: string): Promise<SessaoDisputa | null> {
    return this.dataSource.manager.findOne(SessaoDisputa, { where: { licitacao_id: licitacaoId }, order: { created_at: 'DESC' } });
  }

  // ==========================================================================
  // ABRIR A JANELA
  // ==========================================================================

  /**
   * Abre a janela (a camada de processo — modalidade, ATIVA, homologação, fim
   * do acolhimento — já foi validada por LicitacoesService). Duração em
   * [5, 1440] min; prorrogação opcional em [0, 60] min (0 = encerramento seco).
   */
  async abrir(licitacaoId: string, duracaoMinutos: number, prorrogacaoMinutos?: number) {
    const duracao = Math.max(5, Math.min(24 * 60, Number(duracaoMinutos) || 360));
    const prorrogacao = Math.max(0, Math.min(60, Number(prorrogacaoMinutos ?? 0)));

    const r = await this.dataSource.transaction(async (m) => {
      const atual = await this.estado(licitacaoId, m, true);
      if (atual.modalidade !== 'DISPENSA_ELETRONICA') {
        throw new BadRequestException('Fase de lances disponível apenas para Dispensa Eletrônica');
      }
      if (this.janelaAberta(atual)) throw new BadRequestException('Já existe uma fase de lances aberta');
      const inicio = new Date();
      const fim = new Date(inicio.getTime() + duracao * 60_000);
      // Dispensa: lance sempre no valor UNITÁRIO (base do motor)
      await m.query(
        `UPDATE licitacoes
            SET dispensa_lances_inicio = $2, dispensa_lances_fim = $3, dispensa_lances_prorrogacao_min = $4,
                base_lance = 'UNITARIO'
          WHERE id = $1`,
        [licitacaoId, inicio, fim, prorrogacao || null],
      );
      const sessao = await this.sessaoDaDispensa(licitacaoId, m);
      await m.update(SessaoDisputa, sessao.id, {
        status: StatusSessao.MODO_ABERTO,
        etapa: EtapaSessao.DISPUTA_LANCES,
        data_hora_inicio_real: inicio,
        data_hora_encerramento: null as any,
      });
      await m.query(
        `UPDATE itens_licitacao
            SET status_disputa = $2, disputa_iniciada_em = $3, disputa_encerrada_em = NULL, ultimo_lance_em = NULL
          WHERE licitacao_id = $1`,
        [licitacaoId, StatusDisputaItem.EM_DISPUTA, inicio],
      );
      // Regra da sessão registrada nos autos (o chat entra na ata)
      const fimStr = fmtBrasilia(fim);
      const mensagem = await m.save(
        m.create(EventoSessao, {
          sessao_id: sessao.id,
          tipo: TipoEvento.MENSAGEM_SISTEMA,
          descricao: prorrogacao
            ? `Fase de lances aberta até ${fimStr} (horário de Brasília). Regra da sessão: lance recebido nos últimos ${prorrogacao} min prorroga automaticamente a janela por mais ${prorrogacao} min, sucessivamente, até não haver novos lances.`
            : `Fase de lances aberta até ${fimStr} (horário de Brasília). Encerramento no horário previsto, sem prorrogação automática (modelo IN SEGES 67/2021).`,
          dados_adicionais: { origem: 'JANELA_DISPENSA', abertura: true, duracao_minutos: duracao, prorrogacao_minutos: prorrogacao || null },
          usuario_nome: 'Sistema',
          is_sistema: true,
        }),
      );
      await m.save(
        m.create(EventoSessao, {
          sessao_id: sessao.id,
          tipo: TipoEvento.DISPUTA_INICIADA,
          descricao: `Janela de lances da dispensa aberta por ${duracao} min (prorrogação: ${prorrogacao ? `${prorrogacao} min` : 'sem'})`,
          usuario_nome: 'SISTEMA',
          is_sistema: true,
        }),
      );
      return { sessao, inicio, fim, mensagem, numero: atual.numeroProcesso };
    });

    // Códigos anônimos dos licitantes (chat anônimo durante a janela)
    const participantes: Array<{ fornecedor_id: string }> = await this.dataSource.query(
      `SELECT DISTINCT fornecedor_id FROM propostas
        WHERE licitacao_id = $1 AND status::text <> ALL($2::text[]) ORDER BY fornecedor_id`,
      [licitacaoId, STATUS_PROPOSTA_INVALIDA],
    );
    await this.anonimizacao
      .atribuirCodigos(r.sessao.id, participantes.map((p) => String(p.fornecedor_id)))
      .catch((e) => this.logger.warn(`Códigos anônimos da dispensa ${licitacaoId}: ${e?.message ?? e}`));

    this.gateway.emitirJanelaDispensa(licitacaoId, { dispensa_lances_inicio: r.inicio, dispensa_lances_fim: r.fim, aberta: true });
    this.gateway.emitirChatDispensa(licitacaoId, this.mensagemParaTela(r.mensagem, null));
    this.logger.log(
      `Dispensa ${r.numero}: fase de lances aberta por ${duracao}min (até ${r.fim.toISOString()}, prorrogação=${prorrogacao || 'sem'})`,
    );
    return {
      dispensa_lances_inicio: r.inicio,
      dispensa_lances_fim: r.fim,
      duracao_minutos: duracao,
      prorrogacao_minutos: prorrogacao || null,
    };
  }

  // ==========================================================================
  // LANCE — pelo motor (registrarLance, origem JANELA_DISPENSA)
  // ==========================================================================

  async registrarLance(
    licitacaoId: string,
    cmd: { itemId: string; fornecedorId: string; valorUnitario: number; ip?: string },
  ) {
    await exigirLicitacaoAtiva(this.dataSource.manager, licitacaoId);
    const sessao = await this.sessaoExistente(licitacaoId);
    if (!sessao) throw new ConflictException('A fase de lances não está aberta');

    const r = await this.disputa.registrarLanceComResultado({
      sessaoId: sessao.id,
      itemId: cmd.itemId,
      fornecedorId: cmd.fornecedorId,
      valor: Number(cmd.valorUnitario),
      ip: cmd.ip,
      origem: OrigemLance.JANELA_DISPENSA,
    });

    // Tempo real (best-effort — o lance já está gravado; o polling cobre)
    try {
      if (r.janela?.prorrogada) {
        this.gateway.emitirJanelaDispensa(licitacaoId, {
          dispensa_lances_inicio: r.janela.inicio,
          dispensa_lances_fim: r.janela.fim,
          aberta: true,
        });
        if (r.janela.mensagemSistema) this.gateway.emitirChatDispensa(licitacaoId, this.mensagemParaTela(r.janela.mensagemSistema, null));
        this.logger.log(`Dispensa ${licitacaoId}: janela de lances prorrogada até ${r.janela.fim.toISOString()}`);
      }
      const [agregado] = await this.agregadoPorItem(licitacaoId, cmd.itemId);
      this.gateway.emitirPainelDispensa(licitacaoId, {
        item_licitacao_id: cmd.itemId,
        menor_valor: agregado?.menor != null ? Number(agregado.menor) : null,
        total_lances: Number(agregado?.n_lances || 0),
      });
    } catch (e: any) {
      this.logger.warn(`Push da dispensa ${licitacaoId} falhou (lance gravado): ${e?.message ?? e}`);
    }

    return {
      ok: true,
      valor_unitario: Number(cmd.valorUnitario),
      seu_valor_anterior: r.valorAnterior,
      ...(r.janela?.prorrogada ? { dispensa_lances_fim: r.janela.fim, prorrogada: true } : {}),
    };
  }

  /** Menor valor (proposta válida ∪ lances da janela) e nº de lances, por item. */
  private agregadoPorItem(licitacaoId: string, itemId?: string): Promise<Array<{ item_licitacao_id: string; menor: string | null; n_lances: string }>> {
    return this.dataSource.query(
      `SELECT x.item_licitacao_id, MIN(x.valor) AS menor, COUNT(*) FILTER (WHERE x.origem = 'LANCE') AS n_lances
         FROM (
           SELECT pi.item_licitacao_id::text AS item_licitacao_id, pi.valor_unitario AS valor, 'PROPOSTA' AS origem
             FROM proposta_itens pi JOIN propostas p ON p.id = pi.proposta_id
            WHERE p.licitacao_id = $1 AND p.status::text <> ALL($3::text[])
           UNION ALL
           SELECT l.item_id::text, l.valor_unitario, 'LANCE'
             FROM lances l
            WHERE l.licitacao_id::text = $1::text AND l.origem = 'JANELA_DISPENSA' AND l.cancelado = false
         ) x
        WHERE ($2::text IS NULL OR x.item_licitacao_id = $2::text)
        GROUP BY x.item_licitacao_id`,
      [licitacaoId, itemId ?? null, STATUS_PROPOSTA_INVALIDA],
    );
  }

  // ==========================================================================
  // LEITURAS: painel, lances para julgamento e ata
  // ==========================================================================

  /**
   * Painel público (ANÔNIMO) da janela: menor valor atual e nº de lances por
   * item; `fornecedorId` (só o do TOKEN — o controller garante) inclui o
   * valor atual do próprio fornecedor. Sigilo até o fim do acolhimento.
   */
  async painel(licitacaoId: string, fornecedorId?: string) {
    const e = await this.estado(licitacaoId);
    const agora = new Date();
    const emSigilo = !!e.corteSigilo && agora < e.corteSigilo;
    const itens: any[] = await this.dataSource.query(
      `SELECT id, numero_item, descricao_resumida, descricao_detalhada, quantidade
         FROM itens_licitacao WHERE licitacao_id = $1 ORDER BY numero_item ASC`,
      [licitacaoId],
    );
    const menores = new Map((await this.agregadoPorItem(licitacaoId)).map((r) => [String(r.item_licitacao_id), r]));
    const meus = new Map<string, number>();
    if (fornecedorId) {
      const rows = await this.dataSource.query(
        `SELECT x.item_licitacao_id, MIN(x.valor) AS meu_valor
           FROM (
             SELECT pi.item_licitacao_id::text AS item_licitacao_id, pi.valor_unitario AS valor
               FROM proposta_itens pi JOIN propostas p ON p.id = pi.proposta_id
              WHERE p.licitacao_id = $1 AND p.fornecedor_id::text = $2 AND p.status::text <> ALL($3::text[])
             UNION ALL
             SELECT l.item_id::text, l.valor_unitario
               FROM lances l
              WHERE l.licitacao_id::text = $1::text AND l.fornecedor_id = $2
                AND l.origem = 'JANELA_DISPENSA' AND l.cancelado = false
           ) x GROUP BY x.item_licitacao_id`,
        [licitacaoId, fornecedorId, STATUS_PROPOSTA_INVALIDA],
      );
      for (const r of rows) if (r.meu_valor != null) meus.set(String(r.item_licitacao_id), Number(r.meu_valor));
    }
    return {
      aberta: this.janelaAberta(e, agora.getTime()),
      // Relógio do SERVIDOR: o cliente calcula o offset do countdown
      server_time: agora.toISOString(),
      dispensa_lances_inicio: e.inicio,
      dispensa_lances_fim: e.fim,
      itens: itens.map((i) => {
        const g = menores.get(String(i.id));
        return {
          item_licitacao_id: i.id,
          numero_item: i.numero_item,
          descricao: i.descricao_resumida || i.descricao_detalhada,
          quantidade: i.quantidade,
          menor_valor: !emSigilo && g?.menor != null ? Number(g.menor) : null,
          total_lances: emSigilo ? 0 : Number(g?.n_lances || 0),
          meu_valor: meus.get(String(i.id)),
        };
      }),
    };
  }

  /** Lances ATIVOS da janela (valor unitário, 4 casas) — o julgamento lê min(proposta, próprios lances). */
  lancesDaJanela(licitacaoId: string): Promise<LanceDaJanela[]> {
    return this.dataSource.query(
      `SELECT item_id::text AS item_licitacao_id, fornecedor_id, valor_unitario
         FROM lances
        WHERE licitacao_id::text = $1::text AND origem = 'JANELA_DISPENSA' AND cancelado = false
        ORDER BY created_at ASC`,
      [licitacaoId],
    );
  }

  /** Linhas da ata: lances com autoria e chat completo (identidades reais — a ata é posterior ao julgamento). */
  async dadosAta(licitacaoId: string): Promise<{ lances: any[]; mensagens: any[] }> {
    const lances = await this.dataSource.query(
      `SELECT l.created_at, il.numero_item, f.razao_social, l.valor_unitario
         FROM lances l
         JOIN itens_licitacao il ON il.id::text = l.item_id::text
         JOIN fornecedores f ON f.id::text = l.fornecedor_id
        WHERE l.licitacao_id::text = $1::text AND l.origem = 'JANELA_DISPENSA' AND l.cancelado = false
        ORDER BY l.created_at ASC`,
      [licitacaoId],
    );
    const mensagens = await this.dataSource.query(
      `SELECT e.created_at,
              CASE WHEN e.tipo::text = 'MENSAGEM_FORNECEDOR' THEN 'FORNECEDOR' ELSE 'ORGAO' END AS autor_tipo,
              e.usuario_nome AS autor_nome, e.descricao AS mensagem
         FROM eventos_sessao e JOIN sessoes_disputa s ON s.id = e.sessao_id
        WHERE s.licitacao_id::text = $1::text AND e.tipo::text = ANY($2::text[])
        ORDER BY e.created_at ASC`,
      [licitacaoId, TIPOS_CHAT],
    );
    return { lances, mensagens };
  }

  // ==========================================================================
  // CHAT — eventos da sessão (armazenamento único)
  // ==========================================================================

  /** Forma da tela da dispensa (`autor_tipo`/`autor_nome`/`mensagem`). */
  private mensagemParaTela(e: EventoSessao, codigo: string | null, revelar = false) {
    const fornecedor = e.tipo === TipoEvento.MENSAGEM_FORNECEDOR;
    return {
      id: e.id,
      autor_tipo: fornecedor ? 'FORNECEDOR' : 'ORGAO',
      autor_nome: fornecedor && !revelar ? codigo || 'Fornecedor' : e.usuario_nome || (e.tipo === TipoEvento.MENSAGEM_SISTEMA ? 'Sistema' : 'Órgão'),
      ...(fornecedor && revelar ? { fornecedor_id: e.fornecedor_id } : {}),
      mensagem: e.descricao,
      created_at: e.created_at,
    };
  }

  /**
   * Chat (lista pública): enquanto a janela está aberta, a autoria do
   * fornecedor sai com o código anônimo da sessão ("Fornecedor A") e sem id;
   * fora da janela, com o nome registrado.
   */
  async listarMensagens(licitacaoId: string): Promise<any[]> {
    const e = await this.estado(licitacaoId);
    const aberta = this.janelaAberta(e);
    const eventos: EventoSessao[] = await this.dataSource.manager
      .createQueryBuilder(EventoSessao, 'e')
      .innerJoin(SessaoDisputa, 's', 's.id = e.sessao_id')
      .where('s.licitacao_id = :lic', { lic: licitacaoId })
      .andWhere('e.tipo IN (:...tipos)', { tipos: TIPOS_CHAT })
      .orderBy('e.created_at', 'ASC')
      .take(500)
      .getMany();
    const codigos = new Map<string, string>();
    if (aberta) {
      for (const ev of eventos) {
        if (ev.tipo !== TipoEvento.MENSAGEM_FORNECEDOR || !ev.fornecedor_id || codigos.has(`${ev.sessao_id}|${ev.fornecedor_id}`)) continue;
        codigos.set(`${ev.sessao_id}|${ev.fornecedor_id}`, await this.disputa.codigoAnonimoSeguro(ev.sessao_id, ev.fornecedor_id));
      }
    }
    return eventos.map((ev) => this.mensagemParaTela(ev, codigos.get(`${ev.sessao_id}|${ev.fornecedor_id}`) ?? null, !aberta));
  }

  /** Envio (órgão dono ou fornecedor com proposta válida — o controller garante a identidade pelo token). */
  async enviarMensagem(
    licitacaoId: string,
    dto: { autor_tipo: 'ORGAO' | 'FORNECEDOR'; fornecedor_id?: string; autor_nome?: string; mensagem: string },
  ) {
    const e = await this.estado(licitacaoId);
    const texto = (dto.mensagem || '').trim();
    if (!texto) throw new BadRequestException('Mensagem vazia');
    if (texto.length > 1000) throw new BadRequestException('Mensagem muito longa (máx. 1000 caracteres)');
    if (e.dataHomologacao) throw new BadRequestException('Licitação já homologada — chat encerrado');

    let nome = (dto.autor_nome || '').trim().slice(0, 200);
    if (dto.autor_tipo === 'FORNECEDOR') {
      if (!dto.fornecedor_id) throw new BadRequestException('fornecedor_id obrigatório');
      const prop = await this.dataSource.query(
        `SELECT f.razao_social FROM propostas p JOIN fornecedores f ON f.id = p.fornecedor_id
          WHERE p.licitacao_id = $1 AND p.fornecedor_id = $2 AND p.status::text <> ALL($3::text[]) LIMIT 1`,
        [licitacaoId, dto.fornecedor_id, STATUS_PROPOSTA_INVALIDA],
      );
      if (!prop.length) throw new BadRequestException('Apenas fornecedores com proposta válida podem enviar mensagens');
      nome = prop[0].razao_social;
    } else if (!nome) {
      nome = 'Órgão';
    }

    const sessao = await this.sessaoDaDispensa(licitacaoId);
    const evento = await this.disputa.enviarMensagem(
      sessao.id,
      dto.autor_tipo === 'FORNECEDOR'
        ? { tipo: 'FORNECEDOR', nome, fornecedorId: dto.fornecedor_id }
        : { tipo: 'PREGOEIRO', nome },
      texto,
    );

    // Push com a mesma regra de anonimato da lista
    const aberta = this.janelaAberta(e);
    const codigo =
      dto.autor_tipo === 'FORNECEDOR' && aberta ? await this.disputa.codigoAnonimoSeguro(sessao.id, dto.fornecedor_id!) : null;
    const publico = this.mensagemParaTela(evento, codigo, !aberta);
    delete (publico as any).fornecedor_id;
    this.gateway.emitirChatDispensa(licitacaoId, publico);
    return { ok: true, id: evento.id };
  }

  // ==========================================================================
  // RELÓGIO — chamado pelo DisputaTimerService (o único timer)
  // ==========================================================================

  /**
   * Tique do relógio para a sala de uma dispensa. Devolve false se a sessão
   * não é de dispensa (o timer segue o fluxo do pregão).
   */
  async processarRelogio(sessao: SessaoDisputa): Promise<boolean> {
    const e = await this.estado(sessao.licitacao_id).catch(() => null);
    if (!e || e.modalidade !== 'DISPENSA_ELETRONICA') return false;
    const r = calcularRelogioJanela({ inicio: e.inicio, fim: e.fim });
    if (r.encerrada) await this.encerrarJanela(sessao.licitacao_id);
    return true;
  }

  /**
   * Encerra a janela vencida (idempotente): itens EM_DISPUTA → ENCERRADO, sala
   * sai da etapa de lances (→ NEGOCIACAO: chat com o melhor classificado) e o
   * painel é avisado. Não muda a fase da licitação (o julgamento é ato do órgão).
   */
  async encerrarJanela(licitacaoId: string): Promise<boolean> {
    const r = await this.dataSource.transaction(async (m) => {
      const e = await this.estado(licitacaoId, m, true);
      if (!e.fim || this.janelaAberta(e)) return null;
      await m.query(
        `UPDATE itens_licitacao SET status_disputa = $2, disputa_encerrada_em = $3
          WHERE licitacao_id = $1 AND status_disputa = $4`,
        [licitacaoId, StatusDisputaItem.ENCERRADO, e.fim, StatusDisputaItem.EM_DISPUTA],
      );
      const sessoes = await m.query(
        `UPDATE sessoes_disputa SET status = 'EM_ANDAMENTO', etapa = 'NEGOCIACAO', data_hora_encerramento = $2
          WHERE licitacao_id = $1 AND status = 'MODO_ABERTO' RETURNING id`,
        [licitacaoId, e.fim],
      );
      const linhas: Array<{ id: string }> = Array.isArray(sessoes?.[0]) ? sessoes[0] : sessoes;
      if (!linhas?.length) return null;
      for (const s of linhas) {
        await m.save(
          m.create(EventoSessao, {
            sessao_id: s.id,
            tipo: TipoEvento.DISPUTA_ENCERRADA,
            descricao: `Janela de lances da dispensa encerrada em ${fmtBrasilia(e.fim)} (horário de Brasília). Segue o julgamento.`,
            usuario_nome: 'SISTEMA',
            is_sistema: true,
          }),
        );
      }
      return e;
    });
    if (!r) return false;
    this.gateway.emitirJanelaDispensa(licitacaoId, { dispensa_lances_inicio: r.inicio, dispensa_lances_fim: r.fim, aberta: false });
    this.logger.log(`Dispensa ${r.numeroProcesso}: janela de lances encerrada pelo relógio`);
    return true;
  }
}

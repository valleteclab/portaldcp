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

/** IN SEGES 67/2021, art. 11: etapa de lances de 6 a 10 horas. */
export const DURACAO_MINIMA_JANELA_MIN = 360;
export const DURACAO_MAXIMA_JANELA_MIN = 600;

/** Fases sem divulgação oficial confirmada (sem chat, sem prazo). */
const FASES_SEM_DIVULGACAO = ['PLANEJAMENTO', 'TERMO_REFERENCIA', 'PESQUISA_PRECOS', 'ANALISE_JURIDICA', 'APROVACAO_INTERNA', 'AGUARDANDO_DIVULGACAO'];

/** Quem lê/escreve o chat (resolvido do TOKEN no controller). null = público. */
export type LeitorChat = { tipo: 'ORGAO' } | { tipo: 'FORNECEDOR'; id: string } | null;

export type ModoChatDispensa = 'FECHADO' | 'AVISOS' | 'LANCES' | 'NEGOCIACAO' | 'ENCERRADO';

export interface RegrasChatDispensa {
  modo: ModoChatDispensa;
  rotulo: string;
  explicacao: string;
  orgao_pode_enviar: boolean;
  fornecedor_pode_enviar: boolean;
  /** Órgão no prazo de propostas: aviso formal (assunto + texto). */
  exige_assunto: boolean;
  /** Mensagens deste modo são privadas (negociação: órgão × vencedor). */
  privado: boolean;
  /** Negociação: vencedores com quem o órgão pode falar (só para o órgão). */
  interlocutores: Array<{ fornecedor_id: string; razao_social: string }>;
}

/** Mensagem da negociação (canal privado) só para o órgão e o fornecedor negociado. */
function podeLer(ev: EventoSessao, leitor: LeitorChat): boolean {
  const d = (ev.dados_adicionais ?? {}) as Record<string, any>;
  if (d.canal !== 'NEGOCIACAO') return true;
  if (leitor?.tipo === 'ORGAO') return true;
  return leitor?.tipo === 'FORNECEDOR' && String(d.fornecedor_id) === leitor.id;
}

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
   * do acolhimento — já foi validada por LicitacoesService). Duração de 6 a
   * 10 horas (IN SEGES 67/2021, art. 11; padrão 6 h); prorrogação opcional em
   * [0, 60] min (0 = encerramento seco).
   */
  async abrir(licitacaoId: string, duracaoMinutos: number, prorrogacaoMinutos?: number) {
    // IN SEGES 67/2021, art. 11: a etapa de lances dura de 6 a 10 horas
    const informada = duracaoMinutos === undefined || duracaoMinutos === null || (duracaoMinutos as any) === '' ? null : Number(duracaoMinutos);
    if (informada !== null && !(informada >= DURACAO_MINIMA_JANELA_MIN && informada <= DURACAO_MAXIMA_JANELA_MIN)) {
      throw new BadRequestException(
        `A etapa de lances da dispensa eletrônica dura de 6 a 10 horas (IN SEGES 67/2021, art. 11) — informe entre ${DURACAO_MINIMA_JANELA_MIN} e ${DURACAO_MAXIMA_JANELA_MIN} minutos.`,
      );
    }
    const duracao = informada ?? DURACAO_MINIMA_JANELA_MIN;
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
  async dadosAta(licitacaoId: string, incluirNegociacao = true): Promise<{ lances: any[]; mensagens: any[] }> {
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
          AND ($3::boolean OR COALESCE(e.dados_adicionais->>'canal', '') <> 'NEGOCIACAO')
        ORDER BY e.created_at ASC`,
      [licitacaoId, TIPOS_CHAT, incluirNegociacao],
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
   * REGRAS DO CHAT DA DISPENSA POR FASE (IN SEGES 67/2021) — decididas aqui,
   * no backend; a tela só mostra:
   *  - antes da divulgação confirmada no PNCP: FECHADO (não há procedimento
   *    público ainda);
   *  - prazo de propostas: AVISOS — a comunicação é por mensagens do sistema
   *    (art. 10; na dispensa NÃO há impugnação/esclarecimento formal — o art.
   *    164 da Lei é do edital de licitação). O órgão publica avisos formais
   *    (assunto + texto); o fornecedor que já enviou proposta pode perguntar,
   *    sem identificação para os demais (sigilo até a abertura — Lei art. 13
   *    par. único I);
   *  - etapa de lances (art. 11): LANCES — órgão e fornecedores com proposta
   *    válida, fornecedores sem identificação (art. 13);
   *  - entre o fim do prazo e o julgamento, fora da janela: só o órgão;
   *  - julgado (art. 15): NEGOCIACAO (art. 16) — órgão × VENCEDOR, pelo
   *    sistema, SEM acompanhamento dos demais (canal privado: só o órgão e o
   *    vencedor leem); desclassificado o vencedor, o rejulgamento chama o
   *    próximo classificado, na ordem (art. 16 §1º). O registro vai para a ata
   *    anexada aos autos (art. 16 §2º — ata da sessão);
   *  - homologada: ENCERRADO.
   */
  async regrasChat(licitacaoId: string, leitor: LeitorChat = null): Promise<RegrasChatDispensa> {
    const [l] = await this.dataSource.query(
      `SELECT fase::text AS fase, data_homologacao, COALESCE(data_fim_acolhimento, data_abertura_sessao) AS fim,
              dispensa_lances_inicio, dispensa_lances_fim
         FROM licitacoes WHERE id::text = $1`,
      [licitacaoId],
    );
    if (!l) throw new NotFoundException('Licitação não encontrada');
    const agora = new Date();
    const aberta = this.janelaAberta({ inicio: l.dispensa_lances_inicio ? new Date(l.dispensa_lances_inicio) : null, fim: l.dispensa_lances_fim ? new Date(l.dispensa_lances_fim) : null });
    const vencedores: Array<{ fornecedor_id: string; razao_social: string }> = await this.dataSource.query(
      `SELECT DISTINCT i.fornecedor_vencedor_id::text AS fornecedor_id, f.razao_social
         FROM itens_licitacao i JOIN fornecedores f ON f.id::text = i.fornecedor_vencedor_id::text
        WHERE i.licitacao_id::text = $1 AND i.fornecedor_vencedor_id IS NOT NULL`,
      [licitacaoId],
    );
    const base = { exige_assunto: false, privado: false, interlocutores: [] as Array<{ fornecedor_id: string; razao_social: string }> };
    const eh = (modo: ModoChatDispensa, rotulo: string, explicacao: string, orgao: boolean, fornecedor: boolean, extra: Partial<RegrasChatDispensa> = {}): RegrasChatDispensa => ({
      ...base,
      modo,
      rotulo,
      explicacao,
      orgao_pode_enviar: orgao,
      fornecedor_pode_enviar: fornecedor,
      ...extra,
    });
    if (l.data_homologacao) return eh('ENCERRADO', 'Chat encerrado', 'Contratação homologada — o chat está encerrado.', false, false);
    if (FASES_SEM_DIVULGACAO.includes(l.fase)) {
      return eh('FECHADO', 'Chat indisponível', 'Aviso ainda não publicado no PNCP — o chat abre com a divulgação oficial (IN SEGES 67/2021, art. 7º).', false, false);
    }
    if (l.fase === 'ADJUDICACAO') {
      const souVencedor = leitor?.tipo === 'FORNECEDOR' && vencedores.some((v) => v.fornecedor_id === leitor.id);
      return eh(
        'NEGOCIACAO',
        'Negociação com o vencedor',
        'Negociação pelo sistema com o fornecedor vencedor (IN SEGES 67/2021, art. 16), sem acompanhamento dos demais fornecedores; o registro integra a ata anexada aos autos (art. 16, §2º).',
        true,
        souVencedor,
        { privado: true, interlocutores: leitor?.tipo === 'ORGAO' ? vencedores : [] },
      );
    }
    if (aberta) {
      return eh('LANCES', 'Mensagens da etapa de lances', 'Etapa de lances (IN SEGES 67/2021, art. 11): os fornecedores não são identificados (art. 13).', true, true);
    }
    if (l.fim && agora < new Date(l.fim)) {
      return eh(
        'AVISOS',
        'Avisos e mensagens do prazo de propostas',
        'Na dispensa eletrônica não há impugnação nem pedido de esclarecimento formal: a comunicação é pelas mensagens do sistema (IN SEGES 67/2021, art. 10). O órgão publica avisos formais (assunto e texto); o fornecedor que já enviou proposta pode enviar mensagem, sem identificação para os demais.',
        true,
        true,
        { exige_assunto: true },
      );
    }
    return eh('AVISOS', 'Avisos do órgão', 'Prazo de propostas encerrado: até o julgamento, só o órgão envia mensagens (a etapa de lances reabre a participação dos fornecedores).', true, false);
  }

  /**
   * Chat (lista): autoria do fornecedor anônima no prazo de propostas e na
   * etapa de lances (código "Fornecedor A" ou "Fornecedor"); mensagens da
   * NEGOCIAÇÃO só para o órgão e o fornecedor negociado.
   */
  async listarMensagens(licitacaoId: string, leitor: LeitorChat = null): Promise<any[]> {
    const e = await this.estado(licitacaoId);
    const anonimo = this.janelaAberta(e) || (!!e.corteSigilo && new Date() < e.corteSigilo);
    const eventos: EventoSessao[] = await this.dataSource.manager
      .createQueryBuilder(EventoSessao, 'e')
      .innerJoin(SessaoDisputa, 's', 's.id = e.sessao_id')
      .where('s.licitacao_id = :lic', { lic: licitacaoId })
      .andWhere('e.tipo IN (:...tipos)', { tipos: TIPOS_CHAT })
      .orderBy('e.created_at', 'ASC')
      .take(500)
      .getMany();
    const visiveis = eventos.filter((ev) => podeLer(ev, leitor));
    const codigos = new Map<string, string>();
    if (anonimo) {
      for (const ev of visiveis) {
        if (ev.tipo !== TipoEvento.MENSAGEM_FORNECEDOR || !ev.fornecedor_id || codigos.has(`${ev.sessao_id}|${ev.fornecedor_id}`)) continue;
        codigos.set(`${ev.sessao_id}|${ev.fornecedor_id}`, await this.disputa.codigoAnonimoSeguro(ev.sessao_id, ev.fornecedor_id));
      }
    }
    return visiveis.map((ev) => this.mensagemParaTela(ev, codigos.get(`${ev.sessao_id}|${ev.fornecedor_id}`) ?? null, !anonimo));
  }

  /** Envio (órgão dono ou fornecedor — o controller garante a identidade pelo token); regras por fase em `regrasChat`. */
  async enviarMensagem(
    licitacaoId: string,
    dto: { autor_tipo: 'ORGAO' | 'FORNECEDOR'; fornecedor_id?: string; autor_nome?: string; mensagem: string; assunto?: string; fornecedor_destino_id?: string },
  ) {
    const e = await this.estado(licitacaoId);
    let texto = (dto.mensagem || '').trim();
    if (!texto) throw new BadRequestException('Mensagem vazia');
    if (texto.length > 1000) throw new BadRequestException('Mensagem muito longa (máx. 1000 caracteres)');
    if (e.dataHomologacao) throw new BadRequestException('Licitação já homologada — chat encerrado');

    const leitor: LeitorChat = dto.autor_tipo === 'FORNECEDOR' ? { tipo: 'FORNECEDOR', id: String(dto.fornecedor_id || '') } : { tipo: 'ORGAO' };
    const regras = await this.regrasChat(licitacaoId, leitor);
    const pode = dto.autor_tipo === 'FORNECEDOR' ? regras.fornecedor_pode_enviar : regras.orgao_pode_enviar;
    if (!pode) {
      throw new ConflictException(
        regras.modo === 'NEGOCIACAO'
          ? 'Negociação da dispensa: só o fornecedor vencedor conversa com o órgão (IN SEGES 67/2021, art. 16).'
          : `${regras.rotulo}: ${regras.explicacao}`,
      );
    }

    let nome = (dto.autor_nome || '').trim().slice(0, 200);
    let canal: Record<string, unknown> | null = null;
    if (dto.autor_tipo === 'FORNECEDOR') {
      if (!dto.fornecedor_id) throw new BadRequestException('fornecedor_id obrigatório');
      const prop = await this.dataSource.query(
        `SELECT f.razao_social FROM propostas p JOIN fornecedores f ON f.id = p.fornecedor_id
          WHERE p.licitacao_id = $1 AND p.fornecedor_id = $2 AND p.status::text <> ALL($3::text[]) LIMIT 1`,
        [licitacaoId, dto.fornecedor_id, STATUS_PROPOSTA_INVALIDA],
      );
      if (!prop.length) throw new BadRequestException('Apenas fornecedores com proposta válida podem enviar mensagens');
      nome = prop[0].razao_social;
      if (regras.modo === 'NEGOCIACAO') canal = { canal: 'NEGOCIACAO', fornecedor_id: dto.fornecedor_id };
    } else {
      if (!nome) nome = 'Órgão';
      if (regras.exige_assunto) {
        const assunto = (dto.assunto || '').trim();
        if (assunto.length < 5 || texto.length < 20) {
          throw new BadRequestException(
            'No prazo de propostas o órgão publica AVISOS formais: informe o assunto (mínimo 5 caracteres) e o texto do aviso (mínimo 20 caracteres) — IN SEGES 67/2021, art. 10.',
          );
        }
        texto = `AVISO — ${assunto.slice(0, 120)}: ${texto}`;
      }
      if (regras.modo === 'NEGOCIACAO') {
        const destino = dto.fornecedor_destino_id
          ? regras.interlocutores.find((v) => v.fornecedor_id === dto.fornecedor_destino_id)
          : regras.interlocutores.length === 1
            ? regras.interlocutores[0]
            : null;
        if (!destino) {
          throw new BadRequestException(
            regras.interlocutores.length
              ? 'Indique o fornecedor vencedor com quem negociar (fornecedor_destino_id) — a negociação é com o vencedor (IN SEGES 67/2021, art. 16).'
              : 'Nenhum vencedor para negociar — julgue as propostas antes.',
          );
        }
        canal = { canal: 'NEGOCIACAO', fornecedor_id: destino.fornecedor_id };
      }
    }

    const sessao = await this.sessaoDaDispensa(licitacaoId);
    const evento = await this.disputa.enviarMensagem(
      sessao.id,
      dto.autor_tipo === 'FORNECEDOR'
        ? { tipo: 'FORNECEDOR', nome, fornecedorId: dto.fornecedor_id }
        : { tipo: 'PREGOEIRO', nome },
      texto,
      { viaDispensa: true },
    );
    if (canal) {
      await this.dataSource.query(`UPDATE eventos_sessao SET dados_adicionais = $2::jsonb WHERE id = $1`, [evento.id, JSON.stringify(canal)]);
      evento.dados_adicionais = canal as any;
    }

    // Negociação é privada (sem acompanhamento dos demais — IN 67 art. 16):
    // não vai para a sala pública; órgão e vencedor leem pela lista.
    if (!canal) {
      const anonimo = this.janelaAberta(e) || (!!e.corteSigilo && new Date() < e.corteSigilo);
      const codigo =
        dto.autor_tipo === 'FORNECEDOR' && anonimo ? await this.disputa.codigoAnonimoSeguro(sessao.id, dto.fornecedor_id!) : null;
      const publico = this.mensagemParaTela(evento, codigo, !anonimo);
      delete (publico as any).fornecedor_id;
      this.gateway.emitirChatDispensa(licitacaoId, publico);
    }
    return { ok: true, id: evento.id, modo: regras.modo };
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

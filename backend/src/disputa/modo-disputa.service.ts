import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { randomInt } from 'crypto';
import { ItemLicitacao, StatusDisputaItem } from '../itens/entities/item-licitacao.entity';
import { LoteLicitacao } from '../lotes/entities/lote-licitacao.entity';
import { SessaoDisputa, StatusSessao } from '../sessao/entities/sessao-disputa.entity';
import { EventoSessao, TipoEvento } from '../sessao/entities/evento-sessao.entity';
import { Lance } from './entities/lance.entity';
import { EstadoModoItem } from './entities/estado-modo-item.entity';
import { BaseLance, LanceRecusado, OrigemLance, centavos, referenciaNaBase } from './modelo-lance';
import { ParametrosDisputa } from './parametros-disputa';
import { EstadoUnidadeDisputa, TipoUnidadeDisputa } from './unidade-disputa';
import {
  AcaoExpiracao,
  DirecaoLance,
  FaseModo,
  ModoDisputaMotor,
  PADROES_MODOS,
  SaidaRelogioModo,
  calcularRelogioModo,
  descontoPercentual,
  direcaoDoCriterio,
  melhorQue,
  modoDoMotor,
  motivoModoCriterioInvalido,
  ordemSql,
  percentualFaixa,
  selecionarClassificados,
  sortearTempoAleatorioSegundos,
} from './modos-disputa';
import { exigirLicitacaoAtiva } from '../sessao/licitacao-ativa';
import type { AtorTransicao } from '../licitacoes/transicoes/transicoes.tipos';

/**
 * ============================================================================
 * MODO DE DISPUTA — estratégias do motor único (plano E2.4)
 * ============================================================================
 *
 * Regras puras em `modos-disputa.ts`; aqui o que toca banco. Opera sobre a
 * UNIDADE DE DISPUTA (`unidade-disputa.ts`): o ITEM ou o LOTE — as duas têm as
 * mesmas colunas de disputa; o estado do modo fica em
 * `disputa_estado_modo_item`, chaveado pelo id da unidade (`tipo_unidade`).
 * No lote, o que muda na unidade é espelhado nos itens do lote (como faz o
 * DisputaLoteService), e o lance fechado é o valor GLOBAL do lote (rateado
 * por item pelo `rateio-lote.ts`, como todo lance de lote).
 *
 * Usado por:
 *  - DisputaService / DisputaLoteService: início da unidade (`aoIniciarUnidade`),
 *    regra do lance (`regraDoLance`), leituras (`enriquecerItens`, `direcao`),
 *    encerramento (`antesDeEncerrar`/`aposEncerrar`);
 *  - DisputaTimerService: relógio por modo (`relogiosDaSessao`) e troca de
 *    fase (`avancarFase`: aberta → aleatório → fechada);
 *  - ModosDisputaController: reinício para as demais colocações.
 *
 * NÃO depende do DisputaService (sem ciclo de injeção): só DataSource.
 */

export interface ContextoModo {
  modo: ModoDisputaMotor;
  criterio: string;
  direcao: DirecaoLance;
  margemPreferencia: boolean;
}

export interface TemposModo {
  etapaAbertaHibridaMinutos: number;
  lanceFinalFechadoMinutos: number;
  aleatorioMinMinutos: number;
  aleatorioMaxMinutos: number;
}

/** Unidade de disputa (item ou lote) com o estado comum. */
export type UnidadeRelogio = EstadoUnidadeDisputa & { id: string };

interface UnidadeModo extends UnidadeRelogio {
  tipo: TipoUnidadeDisputa;
  licitacao_id: string;
  numero: number;
}

/** Decisão da estratégia sobre um lance pedido. */
export interface RegraLanceModo {
  /** Origem efetiva (LANCE vira LANCE_FECHADO na etapa fechada). */
  origem: OrigemLance;
  /** Status que o validador puro deve considerar (tempo aleatório = etapa aberta). */
  statusParaValidacao: string | null | undefined;
  /** Conferência adicional do valor (reinício: não pode alcançar a 1ª colocação). */
  conferir(valor: number): void;
}

/** Campos que a estratégia acrescenta ao item da sala (ItemDisputa). */
export interface CamposModoItem {
  modoDisputa?: ModoDisputaMotor;
  /** AGUARDANDO | ABERTA | ALEATORIO | FECHADA | REINICIO_DEMAIS | ENCERRADA */
  faseModo?: string;
  /** Tempo restante não pode ser mostrado (tempo aleatório — sigiloso). */
  tempoOculto?: boolean;
  /** Etapa fechada: fim do prazo do lance final (ISO). */
  fimFaseEm?: string | null;
  /** A fase restringe quem dá lance (classificados). */
  participacaoRestrita?: boolean;
  /** Quantos licitantes estão classificados para a fase restrita. */
  classificadosFase?: number | null;
  /** Visão do fornecedor: pode dar lance nesta fase. */
  possoDarLance?: boolean;
  /** Visão do fornecedor: o próprio lance final fechado (só ele vê). */
  meuLanceFechado?: number | null;
  /** Visão do órgão: quantos lances finais fechados chegaram (sem valores). */
  lancesFechadosRecebidos?: number | null;
  /** Reinício para as demais colocações: valor da 1ª colocação (limite). */
  valorPrimeiraColocacao?: number | null;
}

export interface MudancaFase {
  itemId: string;
  itemNumero: number;
  tipoUnidade: TipoUnidadeDisputa;
  fase: FaseModo;
  evento: 'fechamento_iminente' | 'etapa_fechada_iniciada';
  mensagem: EventoSessao;
  /** Etapa fechada: fim do prazo (ISO). */
  terminaEm?: string;
}

const STATUS_FECHADO = ['ENCERRADO', 'NEGOCIACAO'];
const rotulo = (u: { tipo: TipoUnidadeDisputa; numero: number }) => `${u.tipo === 'LOTE' ? 'Lote' : 'Item'} ${u.numero}`;

@Injectable()
export class ModoDisputaService {
  private readonly logger = new Logger(ModoDisputaService.name);

  constructor(private readonly dataSource: DataSource) {}

  // ==========================================================================
  // CONTEXTO
  // ==========================================================================

  async contexto(licitacaoId: string, manager?: EntityManager): Promise<ContextoModo> {
    const m = manager ?? this.dataSource.manager;
    const [l] = await m.query(
      `SELECT l.modo_disputa::text AS modo, l.criterio_julgamento::text AS criterio, l.margem_preferencia,
              EXISTS (SELECT 1 FROM itens_licitacao i WHERE i.licitacao_id = l.id AND i.margem_preferencia = true) AS margem_item
         FROM licitacoes l WHERE l.id = $1`,
      [licitacaoId],
    );
    const criterio = l?.criterio || 'MENOR_PRECO';
    return {
      modo: modoDoMotor(l?.modo),
      criterio,
      direcao: direcaoDoCriterio(criterio),
      margemPreferencia: !!(l?.margem_preferencia || l?.margem_item),
    };
  }

  /** Direção do ranking da licitação (MENOR/MAIOR). */
  async direcao(licitacaoId: string, manager?: EntityManager): Promise<DirecaoLance> {
    return (await this.contexto(licitacaoId, manager)).direcao;
  }

  /** Tempos dos modos: sessão → parâmetro do órgão → sistema → padrão legal. */
  async tempos(sessaoId: string, manager?: EntityManager): Promise<TemposModo> {
    const m = manager ?? this.dataSource.manager;
    const [s] = await m.query(
      `SELECT s.etapa_aberta_minutos_hibrido, s.lance_final_fechado_minutos, s.tempo_aleatorio_min_minutos,
              s.tempo_aleatorio_max_minutos, l.orgao_id
         FROM sessoes_disputa s JOIN licitacoes l ON l.id = s.licitacao_id WHERE s.id = $1`,
      [sessaoId],
    );
    const params: any[] = await m.query(
      `SELECT orgao_id, etapa_aberta_hibrida_minutos, lance_final_fechado_minutos
         FROM parametros_licitacao WHERE orgao_id IS NULL OR orgao_id = $1`,
      [s?.orgao_id ?? null],
    );
    const orgao = params.find((p) => p.orgao_id && p.orgao_id === s?.orgao_id);
    const sistema = params.find((p) => !p.orgao_id);
    const primeiro = (...v: any[]) => {
      for (const x of v) if (x !== null && x !== undefined && Number(x) > 0) return Number(x);
      return 0;
    };
    return {
      etapaAbertaHibridaMinutos: primeiro(
        s?.etapa_aberta_minutos_hibrido,
        orgao?.etapa_aberta_hibrida_minutos,
        sistema?.etapa_aberta_hibrida_minutos,
        PADROES_MODOS.etapaAbertaHibridaMinutos,
      ),
      lanceFinalFechadoMinutos: primeiro(
        s?.lance_final_fechado_minutos,
        orgao?.lance_final_fechado_minutos,
        sistema?.lance_final_fechado_minutos,
        PADROES_MODOS.lanceFinalFechadoMinutos,
      ),
      aleatorioMinMinutos: Number(s?.tempo_aleatorio_min_minutos) || 0,
      aleatorioMaxMinutos: Math.min(
        PADROES_MODOS.tempoAleatorioMaxMinutos,
        Number(s?.tempo_aleatorio_max_minutos) || PADROES_MODOS.tempoAleatorioMaxMinutos,
      ),
    };
  }

  async estados(unidadeIds: string[], manager?: EntityManager): Promise<Map<string, EstadoModoItem>> {
    const m = manager ?? this.dataSource.manager;
    if (!unidadeIds.length) return new Map();
    const rows = await m.getRepository(EstadoModoItem).createQueryBuilder('e').where('e.item_id IN (:...ids)', { ids: unidadeIds }).getMany();
    return new Map(rows.map((r) => [String(r.item_id), r]));
  }

  // ==========================================================================
  // UNIDADE (item ou lote)
  // ==========================================================================

  /** Carrega a unidade pelo id (item ou lote), opcionalmente travada (FOR UPDATE). */
  private async unidade(m: EntityManager, id: string, travar = false): Promise<UnidadeModo | null> {
    if (travar) await m.query(`SET LOCAL lock_timeout = '10s'`);
    const lock = travar ? { lock: { mode: 'pessimistic_write' as const } } : {};
    const lote = await m.findOne(LoteLicitacao, { where: { id }, ...lock });
    if (lote) return { ...(lote as any), id: lote.id, tipo: 'LOTE', licitacao_id: lote.licitacao_id, numero: lote.numero };
    const item = await m.findOne(ItemLicitacao, { where: { id }, ...lock });
    if (item) return { ...(item as any), id: item.id, tipo: 'ITEM', licitacao_id: item.licitacao_id, numero: item.numero_item };
    return null;
  }

  /** Grava o estado de disputa na unidade; no lote, os itens espelham (como o DisputaLoteService). */
  private async gravarUnidade(m: EntityManager, u: Pick<UnidadeModo, 'id' | 'tipo'>, dados: Record<string, any>): Promise<void> {
    if (u.tipo === 'LOTE') {
      await m.update(LoteLicitacao, u.id, dados);
      await m.update(ItemLicitacao, { lote_id: u.id }, dados);
    } else {
      await m.update(ItemLicitacao, u.id, dados);
    }
  }

  /** Referência da unidade na base do lance (lote = soma dos totais estimados dos itens). */
  private async referencia(m: EntityManager, u: UnidadeModo, base: BaseLance): Promise<number> {
    if (u.tipo === 'ITEM') return referenciaNaBase(u as any, base);
    const itens = await m.find(ItemLicitacao, { where: { lote_id: u.id } });
    return centavos(itens.reduce((s, i) => s + referenciaNaBase(i, BaseLance.TOTAL_ITEM), 0));
  }

  /** Filtro das linhas de lance da unidade (lote: só o lance do lote, sem o rateio). */
  private static filtroUnidade(tipo: TipoUnidadeDisputa): string {
    return tipo === 'LOTE' ? 'lote_id = $1 AND item_id IS NULL' : 'item_id = $1';
  }

  // ==========================================================================
  // MODO × CRITÉRIO (Lei 14.133 art. 56 §§1º e 2º)
  // ==========================================================================

  /** 400 com a mensagem da vedação legal. */
  exigirModoCriterio(modo: string | null | undefined, criterio: string | null | undefined): void {
    const motivo = motivoModoCriterioInvalido(modo, criterio);
    if (motivo) throw new BadRequestException(motivo);
  }

  /** Confere a combinação gravada na licitação (início da sessão/itens). */
  async exigirModoCriterioDaLicitacao(licitacaoId: string, manager?: EntityManager): Promise<ContextoModo> {
    const ctx = await this.contexto(licitacaoId, manager);
    this.exigirModoCriterio(ctx.modo, ctx.criterio);
    return ctx;
  }

  // ==========================================================================
  // INÍCIO DA UNIDADE
  // ==========================================================================

  /** Item (compatibilidade): ver `aoIniciarUnidade`. */
  aoIniciarItem(m: EntityManager, sessaoId: string, item: ItemLicitacao, base: BaseLance, agora: Date) {
    return this.aoIniciarUnidade(m, sessaoId, item.id, base, agora);
  }

  /**
   * Chamado DENTRO da transação da unidade (travada), depois de converter as
   * propostas em lances.
   *  - ABERTO: nada (sem restrição).
   *  - FECHADO: a unidade encerra na hora — só propostas (Lei art. 56 I).
   *  - ABERTO_FECHADO: fase ABERTA (etapa de duração fixa, art. 24 caput).
   *  - FECHADO_ABERTO: classificação automática melhor + até 10%/20% (mín. 3)
   *    para a etapa aberta (IN 73 art. 25); as demais ficam no ranking pela proposta.
   */
  async aoIniciarUnidade(
    m: EntityManager,
    sessaoId: string,
    unidadeId: string,
    base: BaseLance,
    agora: Date,
  ): Promise<{ encerrarImediatamente: boolean }> {
    const u = await this.unidade(m, unidadeId);
    if (!u) return { encerrarImediatamente: false };
    const ctx = await this.contexto(u.licitacao_id, m);
    // Reinício total da sessão (reiniciarSessao) → limpa o estado anterior
    await m.delete(EstadoModoItem, { item_id: u.id });
    if (ctx.modo === 'FECHADO') return { encerrarImediatamente: true };
    if (ctx.modo === 'ABERTO') return { encerrarImediatamente: false };

    let participantes: string[] | null = null;
    let faixa: number | null = null;
    if (ctx.modo === 'FECHADO_ABERTO') {
      faixa = percentualFaixa(ctx.margemPreferencia);
      const ofertas = await this.melhoresOfertas(m, u, ctx.direcao, { soPropostas: true });
      const r = selecionarClassificados(ofertas, {
        percentual: faixa,
        direcao: ctx.direcao,
        criterio: ctx.criterio,
        referencia: await this.referencia(m, u, base),
      });
      participantes = r.classificados;
      await this.registrarChat(
        m,
        sessaoId,
        u,
        `${rotulo(u)}: classificação automática para a etapa de lances (modo fechado e aberto — IN SEGES 73/2022, art. 25): ` +
          `${r.classificados.length} de ${ofertas.length} proposta(s) classificada(s) — a melhor proposta e as até ${faixa}% ` +
          `${ctx.criterio === 'MAIOR_DESCONTO' ? 'inferiores em desconto' : ctx.direcao === 'MAIOR' ? 'inferiores' : 'superiores'}` +
          `${r.completadoPeloMinimo ? ', completadas pelas melhores seguintes até o mínimo de três (art. 25 §1º)' : ''}. ` +
          'As demais propostas permanecem na classificação, sem participar dos lances.',
        { ato: 'CLASSIFICACAO_FECHADO_ABERTO', classificados: r.classificados.length, total: ofertas.length, faixa },
      );
    }

    await m.save(
      m.create(EstadoModoItem, {
        item_id: u.id,
        tipo_unidade: u.tipo,
        sessao_id: sessaoId,
        modo: ctx.modo,
        fase: 'ABERTA',
        participantes,
        faixa_percentual: faixa,
        fase_iniciada_em: agora,
        fase_termina_em: null,
        aleatorio_iniciado_em: null,
        aleatorio_sorteado_segundos: null,
        primeiro_fornecedor_id: null,
        primeiro_valor: null,
        reinicios: 0,
      }),
    );
    return { encerrarImediatamente: false };
  }

  // ==========================================================================
  // REGRA DO LANCE POR MODO
  // ==========================================================================

  /**
   * Decide a origem e as restrições do lance conforme o modo/fase da unidade.
   * Chamada pelo `registrarLance` (item ou lote) com a unidade TRAVADA.
   */
  async regraDoLance(
    m: EntityManager,
    p: {
      item: { id: string; status_disputa: string | null | undefined };
      tipo?: TipoUnidadeDisputa;
      fornecedorId: string;
      origem: OrigemLance;
      ctx: ContextoModo;
    },
  ): Promise<RegraLanceModo> {
    const tipo = p.tipo ?? 'ITEM';
    const nomeUnidade = tipo === 'LOTE' ? 'lote' : 'item';
    const livre: RegraLanceModo = { origem: p.origem, statusParaValidacao: p.item.status_disputa, conferir: () => undefined };
    // Desempate ME/EPP e negociação acontecem depois do encerramento — fora das estratégias
    if (p.origem !== OrigemLance.LANCE && p.origem !== OrigemLance.LANCE_FECHADO) return livre;

    if (p.ctx.modo === 'FECHADO') {
      throw new LanceRecusado(
        'No modo de disputa fechado não há etapa de lances: a classificação é feita pelas propostas (Lei 14.133/2021, art. 56).',
        'MODO_FECHADO_SEM_LANCES',
        true,
      );
    }
    const est = await m.findOne(EstadoModoItem, { where: { item_id: p.item.id } });
    const status = p.item.status_disputa;

    // Aberto-fechado, etapa fechada: o lance vira o lance FINAL FECHADO (art. 24 §§2º–4º)
    if (p.ctx.modo === 'ABERTO_FECHADO' && est?.fase === 'FECHADA' && status === StatusDisputaItem.EM_DISPUTA) {
      if (!(est.participantes ?? []).includes(p.fornecedorId)) {
        throw new LanceRecusado(
          'Você não está entre os licitantes convocados para o lance final fechado (autor da melhor oferta e das ofertas ' +
            `até ${Number(est.faixa_percentual) || 10}% dela, ou os melhores seguintes até três — IN SEGES 73/2022, art. 24 §§2º e 4º).`,
          'NAO_CLASSIFICADO_FECHADO',
          true,
        );
      }
      if (est.fase_termina_em && Date.now() >= new Date(est.fase_termina_em).getTime()) {
        throw new LanceRecusado('O prazo do lance final fechado terminou.', 'FECHADO_FORA_DO_PRAZO', true);
      }
      const ja = await m.count(Lance, {
        where:
          tipo === 'LOTE'
            ? { lote_id: p.item.id, item_id: IsNull(), fornecedor_id: p.fornecedorId, origem: OrigemLance.LANCE_FECHADO, cancelado: false }
            : { item_id: p.item.id, fornecedor_id: p.fornecedorId, origem: OrigemLance.LANCE_FECHADO, cancelado: false },
      });
      if (ja > 0) {
        throw new LanceRecusado('O lance final fechado é único e já foi enviado (IN SEGES 73/2022, art. 24 §2º).', 'FECHADO_JA_ENVIADO', true);
      }
      return { origem: OrigemLance.LANCE_FECHADO, statusParaValidacao: StatusDisputaItem.EM_DISPUTA, conferir: () => undefined };
    }
    if (p.origem === OrigemLance.LANCE_FECHADO) {
      throw new LanceRecusado(`O ${nomeUnidade} não está na etapa de lance final fechado.`, 'FECHADO_FORA_DO_PRAZO', true);
    }

    // Aberto-fechado, tempo aleatório: a etapa aberta continua recebendo lances (art. 24 §1º)
    if (p.ctx.modo === 'ABERTO_FECHADO' && status === StatusDisputaItem.TEMPO_ALEATORIO) {
      return { origem: OrigemLance.LANCE, statusParaValidacao: StatusDisputaItem.EM_DISPUTA, conferir: () => undefined };
    }

    // Etapa aberta com participantes restritos (fechado-aberto, reinício)
    if (est && (est.fase === 'ABERTA' || est.fase === 'REINICIO_DEMAIS') && Array.isArray(est.participantes)) {
      if (!est.participantes.includes(p.fornecedorId)) {
        throw est.fase === 'REINICIO_DEMAIS'
          ? new LanceRecusado(
              'O reinício da disputa é só para as demais colocações (Lei 14.133/2021, art. 56 §4º): a 1ª colocação já está definida.',
              'REINICIO_SO_DEMAIS',
              true,
            )
          : new LanceRecusado(
              `Sua proposta não foi classificada para a etapa de lances (melhor proposta e as até ${Number(est.faixa_percentual) || 10}% dela, ` +
                'ou as melhores seguintes até três — IN SEGES 73/2022, art. 25). Ela continua na classificação pelo valor proposto.',
              'NAO_CLASSIFICADO_ETAPA_ABERTA',
              true,
            );
      }
    }
    if (est?.fase === 'REINICIO_DEMAIS' && est.primeiro_valor != null) {
      const piso = Number(est.primeiro_valor);
      const direcao = p.ctx.direcao;
      return {
        ...livre,
        conferir: (valor: number) => {
          if (!melhorQue(piso, valor, direcao)) {
            throw new LanceRecusado(
              `No reinício para as demais colocações o lance não pode igualar nem superar a 1ª colocação (R$ ${centavos(piso).toFixed(2)}), ` +
                'já definida (Lei 14.133/2021, art. 56 §4º).',
              'REINICIO_ALCANCA_PRIMEIRO',
            );
          }
        },
      };
    }
    return livre;
  }

  // ==========================================================================
  // LEITURAS — sigilo do lance fechado + campos do modo
  // ==========================================================================

  /**
   * Linha de lance visível nas leituras? O lance final fechado é sigiloso até o
   * FIM do prazo (IN 73 art. 24 §2º: "sigiloso até o encerramento deste
   * prazo") — para todos, inclusive o pregoeiro (decisão: a IN não abre
   * exceção ao agente; ele vê só a CONTAGEM). Unidade encerrada → visível.
   */
  static lanceVisivel(origem: string | null | undefined, statusUnidade: string | null | undefined): boolean {
    return origem !== OrigemLance.LANCE_FECHADO || STATUS_FECHADO.includes(String(statusUnidade));
  }

  /**
   * Fragmento SQL (alias `l` = lances, `i` = itens_licitacao) do mesmo filtro.
   * Vale também para as linhas de RATEIO do lote: o item do lote espelha o
   * status do lote (só fica ENCERRADO quando o lote encerra).
   */
  static readonly SQL_LANCE_VISIVEL = `(l.origem <> 'LANCE_FECHADO' OR i.status_disputa::text IN ('ENCERRADO','NEGOCIACAO'))`;

  /** Mesmo filtro para o lance do LOTE (alias `l` = lances; status lido do lote). */
  static readonly SQL_LANCE_LOTE_VISIVEL =
    `(l.origem <> 'LANCE_FECHADO' OR EXISTS (SELECT 1 FROM lotes_licitacao lt WHERE lt.id = l.lote_id AND lt.status_disputa::text IN ('ENCERRADO','NEGOCIACAO')))`;

  /**
   * Relógios de todas as unidades (itens ou lotes) de uma sessão
   * (DisputaTimerService e board) — carrega contexto, tempos e estados uma vez.
   */
  async relogiosDaSessao(
    sessao: Pick<SessaoDisputa, 'id' | 'licitacao_id'>,
    unidades: UnidadeRelogio[],
    params: ParametrosDisputa,
    agora: number = Date.now(),
  ): Promise<Map<string, SaidaRelogioModo>> {
    const ctx = await this.contexto(sessao.licitacao_id);
    const tempos = await this.tempos(sessao.id);
    const estados = await this.estados(unidades.map((i) => i.id));
    const out = new Map<string, SaidaRelogioModo>();
    for (const u of unidades) out.set(u.id, this.relogioDoItem(u, estados.get(u.id), ctx, params, tempos, agora));
    return out;
  }

  relogioDoItem(
    u: UnidadeRelogio,
    est: EstadoModoItem | undefined,
    ctx: ContextoModo,
    params: ParametrosDisputa,
    tempos: TemposModo,
    agora: number = Date.now(),
  ): SaidaRelogioModo {
    return calcularRelogioModo({
      modo: (est?.modo as ModoDisputaMotor) || ctx.modo,
      fase: (est?.fase as FaseModo) ?? null,
      status: u.status_disputa,
      disputaIniciadaEm: u.disputa_iniciada_em,
      ultimoLanceEm: u.ultimo_lance_em,
      tempoInicialMinutos: params.tempoInicialMinutos,
      prorrogacaoMinutos: params.prorrogacaoMinutos,
      etapaAbertaHibridaMinutos: tempos.etapaAbertaHibridaMinutos,
      inicioAleatorio: est?.aleatorio_iniciado_em ?? u.inicio_tempo_aleatorio,
      aleatorioSorteadoSegundos: est?.aleatorio_sorteado_segundos ?? null,
      fimFaseEm: est?.fase_termina_em ?? null,
      agora,
    });
  }

  /**
   * Acrescenta às unidades da sala (itens ou lotes) os campos do modo e corrige
   * o relógio (etapa aberta fixa do aberto-fechado, tempo aleatório OCULTO,
   * prazo do lance fechado). Chamado no fim do `getItensPorStatus`.
   */
  async enriquecerItens<T extends { id: string; status: string; tempoRestante: number; emProrrogacao: boolean }>(
    sessao: Pick<SessaoDisputa, 'id' | 'licitacao_id'>,
    unidadesDb: UnidadeRelogio[],
    saida: Array<T & CamposModoItem>,
    params: ParametrosDisputa,
    opts: { fornecedorId?: string; visaoOrgao?: boolean },
  ): Promise<void> {
    if (!saida.length) return;
    const ctx = await this.contexto(sessao.licitacao_id);
    const tempos = await this.tempos(sessao.id);
    const estados = await this.estados(unidadesDb.map((i) => i.id));
    // Lances fechados por UNIDADE (item, ou o lance do lote — sem as linhas de rateio)
    const fechados: Array<{ unidade_id: string; fornecedor_id: string; valor: string }> = await this.dataSource.query(
      `SELECT COALESCE(item_id, lote_id)::text AS unidade_id, fornecedor_id, valor FROM lances
        WHERE licitacao_id = $1 AND origem = 'LANCE_FECHADO' AND cancelado = false AND lance_lote_id IS NULL`,
      [sessao.licitacao_id],
    );
    const porId = new Map(unidadesDb.map((i) => [String(i.id), i]));
    const agora = Date.now();

    for (const it of saida) {
      const db = porId.get(String(it.id));
      if (!db) continue;
      const est = estados.get(String(it.id));
      const modo = (est?.modo as ModoDisputaMotor) || ctx.modo;
      it.modoDisputa = modo;
      const st = db.status_disputa;
      it.faseModo =
        st === StatusDisputaItem.TEMPO_ALEATORIO
          ? 'ALEATORIO'
          : st === StatusDisputaItem.EM_DISPUTA
            ? est?.fase || 'ABERTA'
            : st && STATUS_FECHADO.includes(st)
              ? 'ENCERRADA'
              : 'AGUARDANDO';

      if (st === StatusDisputaItem.EM_DISPUTA || st === StatusDisputaItem.TEMPO_ALEATORIO) {
        const r = this.relogioDoItem(db, est, ctx, params, tempos, agora);
        it.tempoRestante = r.oculto ? 0 : r.restanteSegundos;
        it.emProrrogacao = r.emProrrogacao;
        it.tempoOculto = r.oculto;
        it.fimFaseEm = est?.fase === 'FECHADA' && est.fase_termina_em ? new Date(est.fase_termina_em).toISOString() : null;
      }

      const ativa = st === StatusDisputaItem.EM_DISPUTA || st === StatusDisputaItem.TEMPO_ALEATORIO;
      const restrita = ativa && !!est && Array.isArray(est.participantes) && ['ABERTA', 'FECHADA', 'REINICIO_DEMAIS'].includes(est.fase);
      it.participacaoRestrita = restrita;
      it.classificadosFase = restrita ? est!.participantes!.length : null;
      it.valorPrimeiraColocacao = ativa && est?.fase === 'REINICIO_DEMAIS' && est.primeiro_valor != null ? Number(est.primeiro_valor) : null;

      const daUnidade = fechados.filter((f) => f.unidade_id === String(it.id));
      if (opts.fornecedorId) {
        // No lote, a elegibilidade de base (cotou todos os itens) já vem em `possoDarLance`
        const base = it.possoDarLance !== false;
        it.possoDarLance = base && modo !== 'FECHADO' && ativa && (!restrita || est!.participantes!.includes(opts.fornecedorId));
        const meu = daUnidade.find((f) => f.fornecedor_id === opts.fornecedorId);
        it.meuLanceFechado = meu ? parseFloat(meu.valor) : null;
        if (est?.fase === 'FECHADA' && meu) it.possoDarLance = false; // lance final único
      }
      if (opts.visaoOrgao) {
        it.lancesFechadosRecebidos = modo === 'ABERTO_FECHADO' ? daUnidade.length : null;
      }
    }
  }

  // ==========================================================================
  // TROCA DE FASE PELO RELÓGIO (aberto-fechado)
  // ==========================================================================

  /**
   * Relógio da fase zerou e a ação não é encerrar: aberta → aleatório
   * (aviso de fechamento iminente, art. 24 §1º) ou aleatório → fechada
   * (convocação para o lance final fechado, art. 24 §§2º–4º). Idempotente
   * (trava da unidade + conferência da fase). Devolve o que difundir ou null.
   */
  async avancarFase(sessao: Pick<SessaoDisputa, 'id' | 'licitacao_id'>, unidadeId: string, acao: AcaoExpiracao): Promise<MudancaFase | null> {
    if (acao === 'ENCERRAR') return null;
    const base = await this.baseDaLicitacao(sessao.licitacao_id);
    return this.dataSource.transaction(async (m) => {
      const u = await this.unidade(m, unidadeId, true);
      if (!u) return null;
      const ctx = await this.contexto(u.licitacao_id, m);
      if (ctx.modo !== 'ABERTO_FECHADO') return null;
      const est = await m.findOne(EstadoModoItem, { where: { item_id: unidadeId } });
      const tempos = await this.tempos(sessao.id, m);
      const agora = new Date();
      const novo = { item_id: unidadeId, tipo_unidade: u.tipo, sessao_id: sessao.id, modo: ctx.modo, participantes: null, reinicios: 0 };

      if (acao === 'INICIAR_ALEATORIO') {
        if (u.status_disputa !== StatusDisputaItem.EM_DISPUTA || (est && est.fase !== 'ABERTA')) return null;
        const sorteado = sortearTempoAleatorioSegundos(tempos.aleatorioMinMinutos, tempos.aleatorioMaxMinutos, () => randomInt(0, 1_000_000) / 1_000_000);
        // A duração sorteada NÃO vai para a unidade (as rotas de item/lote a exporiam)
        await this.gravarUnidade(m, u, {
          status_disputa: StatusDisputaItem.TEMPO_ALEATORIO,
          inicio_tempo_aleatorio: agora,
          tempo_aleatorio_sorteado: null,
        });
        await m.save(
          m.create(EstadoModoItem, {
            ...(est ?? novo),
            fase: 'ALEATORIO',
            aleatorio_iniciado_em: agora,
            aleatorio_sorteado_segundos: sorteado,
          }),
        );
        await m.save(
          m.create(EventoSessao, {
            sessao_id: sessao.id,
            tipo: TipoEvento.TEMPO_ALEATORIO_INICIADO,
            descricao: `${rotulo(u)}: fim da etapa aberta de ${tempos.etapaAbertaHibridaMinutos} min — aviso de fechamento iminente (IN 73 art. 24 §1º).`,
            item_id: u.tipo === 'ITEM' ? u.id : undefined,
            dados_adicionais: { ato: 'AVISO_FECHAMENTO_IMINENTE', unidade_id: u.id, tipo_unidade: u.tipo },
            usuario_nome: 'SISTEMA',
            is_sistema: true,
          }),
        );
        const mensagem = await this.registrarChat(
          m,
          sessao.id,
          u,
          `${rotulo(u)}: AVISO DE FECHAMENTO IMINENTE. A recepção de lances será encerrada automaticamente em até ` +
            `${PADROES_MODOS.tempoAleatorioMaxMinutos} minutos, em momento aleatório determinado pelo sistema (IN SEGES 73/2022, art. 24 §1º). ` +
            'Em seguida, os licitantes classificados poderão enviar um lance final e fechado.',
          { ato: 'AVISO_FECHAMENTO_IMINENTE' },
        );
        return { itemId: u.id, itemNumero: u.numero, tipoUnidade: u.tipo, fase: 'ALEATORIO', evento: 'fechamento_iminente', mensagem };
      }

      // INICIAR_FECHADA
      if (u.status_disputa !== StatusDisputaItem.TEMPO_ALEATORIO) return null;
      const faixa = percentualFaixa(ctx.margemPreferencia);
      const ofertas = await this.melhoresOfertas(m, u, ctx.direcao, { soPropostas: false });
      const r = selecionarClassificados(ofertas, {
        percentual: faixa,
        direcao: ctx.direcao,
        criterio: ctx.criterio,
        referencia: await this.referencia(m, u, base),
      });
      const termina = new Date(agora.getTime() + tempos.lanceFinalFechadoMinutos * 60_000);
      await this.gravarUnidade(m, u, { status_disputa: StatusDisputaItem.EM_DISPUTA });
      await m.save(
        m.create(EstadoModoItem, {
          ...(est ?? novo),
          fase: 'FECHADA',
          participantes: r.classificados,
          faixa_percentual: faixa,
          fase_iniciada_em: agora,
          fase_termina_em: termina,
        }),
      );
      await m.save(
        m.create(EventoSessao, {
          sessao_id: sessao.id,
          tipo: TipoEvento.DISPUTA_ITEM_INICIADA,
          descricao:
            `${rotulo(u)}: etapa aberta encerrada (tempo aleatório). Etapa de lance final fechado aberta para ` +
            `${r.classificados.length} licitante(s) até ${termina.toISOString()} (IN 73 art. 24 §§2º–4º).`,
          item_id: u.tipo === 'ITEM' ? u.id : undefined,
          dados_adicionais: {
            ato: 'ETAPA_LANCE_FECHADO',
            unidade_id: u.id,
            tipo_unidade: u.tipo,
            classificados: r.classificados.length,
            na_faixa: r.naFaixa,
            completado_pelo_minimo: r.completadoPeloMinimo,
            faixa,
          },
          usuario_nome: 'SISTEMA',
          is_sistema: true,
        }),
      );
      const mensagem = await this.registrarChat(
        m,
        sessao.id,
        u,
        `${rotulo(u)}: encerrada a recepção de lances abertos. ${r.classificados.length} licitante(s) — autor da melhor oferta e ` +
          `das ofertas até ${faixa}% dela${r.completadoPeloMinimo ? ', completados pelos melhores seguintes até três' : ''} — ` +
          `podem enviar UM lance final e fechado${u.tipo === 'LOTE' ? ' (valor global do lote)' : ''} em até ${tempos.lanceFinalFechadoMinutos} minutos, ` +
          'sigiloso até o fim do prazo (IN SEGES 73/2022, art. 24 §§2º a 4º). Quem não enviar mantém o último lance da etapa aberta.',
        { ato: 'ETAPA_LANCE_FECHADO', classificados: r.classificados.length },
      );
      return {
        itemId: u.id,
        itemNumero: u.numero,
        tipoUnidade: u.tipo,
        fase: 'FECHADA',
        evento: 'etapa_fechada_iniciada',
        mensagem,
        terminaEm: termina.toISOString(),
      };
    });
  }

  // ==========================================================================
  // ENCERRAMENTO
  // ==========================================================================

  /**
   * No aberto-fechado o encerramento é AUTOMÁTICO (art. 24): o pregoeiro não
   * encerra a unidade no meio da etapa aberta, do tempo aleatório ou do prazo
   * do lance fechado — isso tiraria dos licitantes a etapa fechada. Só o
   * relógio (ator SISTEMA) encerra — e o encerramento forçado do suporte (ADMIN).
   */
  async antesDeEncerrar(licitacaoId: string, unidadeId: string, ator: AtorTransicao | null | undefined): Promise<void> {
    // Relógio (SISTEMA) e o encerramento forçado do suporte (ADMIN, monitoramento) passam
    if (ator?.tipo === 'SISTEMA' || ator?.tipo === 'ADMIN') return;
    const ctx = await this.contexto(licitacaoId);
    if (ctx.modo !== 'ABERTO_FECHADO') return;
    const [it] = await this.dataSource.query(
      `SELECT status_disputa::text AS s FROM lotes_licitacao WHERE id = $1
       UNION ALL SELECT status_disputa::text FROM itens_licitacao WHERE id = $1`,
      [unidadeId],
    );
    if (it && (it.s === 'EM_DISPUTA' || it.s === 'TEMPO_ALEATORIO')) {
      throw new ConflictException(
        'No modo aberto e fechado o encerramento das etapas é automático (IN SEGES 73/2022, art. 24): ' +
          'etapa aberta → aviso de fechamento iminente → tempo aleatório → lance final fechado.',
      );
    }
  }

  /**
   * Depois de encerrar a unidade: fase ENCERRADA e, se era o reinício para as
   * demais colocações com a etapa de lances da sessão já concluída, a sessão
   * volta ao estado anterior (EM_ANDAMENTO).
   */
  async aposEncerrar(sessaoId: string, licitacaoId: string, unidadeId: string): Promise<void> {
    const est = await this.dataSource.manager.findOne(EstadoModoItem, { where: { item_id: unidadeId } });
    if (!est) return;
    const eraReinicio = est.fase === 'REINICIO_DEMAIS';
    await this.dataSource.manager.update(EstadoModoItem, { item_id: unidadeId }, { fase: 'ENCERRADA' });
    if (eraReinicio) {
      await this.dataSource.query(
        `UPDATE sessoes_disputa SET status = 'EM_ANDAMENTO'
          WHERE id = $1 AND status = 'MODO_ABERTO' AND etapa::text NOT IN ('DISPUTA_LANCES','RANDOM_ENCERRAMENTO')
            AND NOT EXISTS (SELECT 1 FROM itens_licitacao WHERE licitacao_id = $2
                             AND status_disputa::text IN ('EM_DISPUTA','TEMPO_ALEATORIO'))
            AND NOT EXISTS (SELECT 1 FROM lotes_licitacao WHERE licitacao_id = $2
                             AND status_disputa::text IN ('EM_DISPUTA','TEMPO_ALEATORIO'))`,
        [sessaoId, licitacaoId],
      );
    }
  }

  // ==========================================================================
  // REINÍCIO PARA AS DEMAIS COLOCAÇÕES (Lei 14.133 art. 56 §4º)
  // ==========================================================================

  /**
   * Ato do pregoeiro sobre unidade (item ou lote) ENCERRADA: "Após a definição
   * da melhor proposta, se a diferença em relação à proposta classificada em
   * segundo lugar for de pelo menos 5% (cinco por cento), a Administração
   * poderá admitir o reinício da disputa aberta, nos termos estabelecidos no
   * instrumento de licitação, para a definição das demais colocações."
   *
   * Decisões (a lei/IN não detalham):
   *  - só nos modos com disputa ABERTA final (aberto; fechado-aberto) — no
   *    aberto-fechado a etapa final é fechada;
   *  - uma vez por unidade; justificativa obrigatória;
   *  - a 1ª colocação fica de fora e nenhum lance pode igualá-la ou superá-la
   *    (ela está "definida"); participam as demais colocações que estavam na
   *    etapa aberta (no fechado-aberto, só as classificadas para ela);
   *  - relógio do art. 23 do zero (10 min + prorrogações); nenhum lance é
   *    cancelado — os valores anteriores continuam valendo;
   *  - se a etapa de lances da licitação já tinha terminado, ela NÃO volta:
   *    o julgamento do 1º colocado segue; a sessão volta a MODO_ABERTO só para
   *    o relógio desta unidade e retorna a EM_ANDAMENTO quando ela encerra.
   */
  async reiniciarDemaisColocacoes(
    sessaoId: string,
    unidadeId: string,
    justificativa: string,
    alerta: { diferencaPercentual: number; percentualMinimo: number; primeiroLance: { valor: number; fornecedorId: string } } | null,
    ranking: Array<{ fornecedorId: string; melhorValor: number }>,
    ator: AtorTransicao,
  ): Promise<{ itemNumero: number; participantes: number; diferencaPercentual: number; mensagem: EventoSessao }> {
    const motivo = typeof justificativa === 'string' ? justificativa.trim() : '';
    if (!motivo) throw new BadRequestException('Justificativa do reinício é obrigatória');

    return this.dataSource.transaction(async (m) => {
      const sessao = await m.findOne(SessaoDisputa, { where: { id: sessaoId }, lock: { mode: 'pessimistic_write' } });
      if (!sessao) throw new NotFoundException('Sessão não encontrada');
      await exigirLicitacaoAtiva(m, sessao.licitacao_id, { bloquear: true });
      if (sessao.status === StatusSessao.SUSPENSA) throw new ConflictException('Sessão está suspensa');
      const u = await this.unidade(m, unidadeId, true);
      if (!u || u.licitacao_id !== sessao.licitacao_id) throw new BadRequestException('Item/lote não pertence à licitação desta sessão');
      const ctx = await this.contexto(sessao.licitacao_id, m);
      if (ctx.modo !== 'ABERTO' && ctx.modo !== 'FECHADO_ABERTO') {
        throw new ConflictException(
          'O reinício para as demais colocações é da disputa ABERTA (Lei 14.133/2021, art. 56 §4º) — disponível nos modos aberto e fechado-aberto.',
        );
      }
      if (u.status_disputa !== StatusDisputaItem.ENCERRADO) {
        throw new ConflictException('O reinício para as demais colocações só cabe com a disputa encerrada (melhor proposta definida).');
      }
      const est = await m.findOne(EstadoModoItem, { where: { item_id: unidadeId } });
      if ((est?.reinicios ?? 0) > 0) throw new ConflictException('A disputa desta unidade já foi reiniciada para as demais colocações.');
      if (!alerta) {
        throw new ConflictException(
          'A diferença entre a 1ª e a 2ª colocação é menor que o percentual do edital — o reinício não é admitido (Lei 14.133/2021, art. 56 §4º).',
        );
      }
      const primeiro = alerta.primeiroLance;
      let participantes = ranking.map((r) => r.fornecedorId).filter((f) => f !== primeiro.fornecedorId);
      if (ctx.modo === 'FECHADO_ABERTO' && Array.isArray(est?.participantes)) {
        participantes = participantes.filter((f) => est!.participantes!.includes(f));
      }
      if (!participantes.length) throw new ConflictException('Não há demais colocações para disputar.');

      const agora = new Date();
      await this.gravarUnidade(m, u, {
        status_disputa: StatusDisputaItem.EM_DISPUTA,
        disputa_iniciada_em: agora,
        ultimo_lance_em: agora,
        disputa_encerrada_em: null,
      });
      await m.save(
        m.create(EstadoModoItem, {
          ...(est ?? { item_id: unidadeId, faixa_percentual: null, aleatorio_iniciado_em: null, aleatorio_sorteado_segundos: null }),
          tipo_unidade: u.tipo,
          sessao_id: sessaoId,
          modo: ctx.modo,
          fase: 'REINICIO_DEMAIS',
          participantes,
          fase_iniciada_em: agora,
          fase_termina_em: null,
          primeiro_fornecedor_id: primeiro.fornecedorId,
          primeiro_valor: primeiro.valor,
          reinicios: (est?.reinicios ?? 0) + 1,
        }),
      );
      if (sessao.status !== StatusSessao.MODO_ABERTO) await m.update(SessaoDisputa, sessaoId, { status: StatusSessao.MODO_ABERTO });

      await m.save(
        m.create(EventoSessao, {
          sessao_id: sessaoId,
          tipo: TipoEvento.DISPUTA_ITEM_INICIADA,
          descricao:
            `${rotulo(u)}: reinício da disputa aberta para as demais colocações (Lei 14.133 art. 56 §4º). ` +
            `Diferença entre 1º e 2º: ${alerta.diferencaPercentual.toFixed(2)}% (mínimo ${alerta.percentualMinimo}%). Justificativa: ${motivo}`,
          item_id: u.tipo === 'ITEM' ? u.id : undefined,
          dados_adicionais: {
            ato: 'REINICIO_DEMAIS_COLOCACOES',
            unidade_id: u.id,
            tipo_unidade: u.tipo,
            diferenca_percentual: alerta.diferencaPercentual,
            percentual_minimo: alerta.percentualMinimo,
            participantes: participantes.length,
            ator,
          },
          usuario_nome: 'PREGOEIRO',
          is_sistema: false,
        }),
      );
      const mensagem = await this.registrarChat(
        m,
        sessaoId,
        u,
        `${rotulo(u)}: a disputa aberta foi reiniciada para a definição das demais colocações (Lei 14.133/2021, art. 56 §4º). ` +
          `A 1ª colocação está mantida; ${participantes.length} licitante(s) podem dar lances, sem alcançar o valor da 1ª colocação. ` +
          `Justificativa do pregoeiro: ${motivo}`,
        { ato: 'REINICIO_DEMAIS_COLOCACOES' },
      );
      return { itemNumero: u.numero, participantes: participantes.length, diferencaPercentual: alerta.diferencaPercentual, mensagem };
    });
  }

  // ==========================================================================
  // AUXILIARES
  // ==========================================================================

  /** Melhor oferta ATIVA de cada licitante na unidade (propostas e lances abertos; nunca lances fechados). */
  private async melhoresOfertas(
    m: EntityManager,
    u: Pick<UnidadeModo, 'id' | 'tipo'>,
    direcao: DirecaoLance,
    opts: { soPropostas: boolean },
  ): Promise<Array<{ fornecedorId: string; valor: number; registradoEm: Date }>> {
    const rows: any[] = await m.query(
      `SELECT DISTINCT ON (fornecedor_id) fornecedor_id, valor, created_at
         FROM lances
        WHERE ${ModoDisputaService.filtroUnidade(u.tipo)} AND cancelado = false AND fornecedor_id IS NOT NULL AND origem <> 'LANCE_FECHADO'
          ${opts.soPropostas ? `AND origem = 'PROPOSTA'` : ''}
        ORDER BY fornecedor_id, valor ${ordemSql(direcao)}, created_at ASC`,
      [u.id],
    );
    return rows.map((r) => ({ fornecedorId: String(r.fornecedor_id), valor: parseFloat(r.valor), registradoEm: new Date(r.created_at) }));
  }

  private async baseDaLicitacao(licitacaoId: string): Promise<BaseLance> {
    const [l] = await this.dataSource.query(`SELECT base_lance FROM licitacoes WHERE id = $1`, [licitacaoId]);
    return (Object.values(BaseLance) as string[]).includes(l?.base_lance) ? (l.base_lance as BaseLance) : BaseLance.TOTAL_ITEM;
  }

  /** Mensagem de sistema no chat da sala (único armazenamento: eventos da sessão). */
  private async registrarChat(
    m: EntityManager,
    sessaoId: string,
    u: Pick<UnidadeModo, 'id' | 'tipo'> | null,
    texto: string,
    dados: Record<string, any>,
  ): Promise<EventoSessao> {
    return m.save(
      m.create(EventoSessao, {
        sessao_id: sessaoId,
        tipo: TipoEvento.MENSAGEM_SISTEMA,
        descricao: texto.slice(0, 2000),
        item_id: u?.tipo === 'ITEM' ? u.id : undefined,
        dados_adicionais: { ...dados, ...(u ? { unidade_id: u.id, tipo_unidade: u.tipo } : {}) },
        usuario_nome: 'SISTEMA',
        is_sistema: true,
      }),
    );
  }

  /** Quantos lances finais fechados ativos a unidade tem (o órgão vê a contagem, nunca os valores). */
  async contarLancesFechados(unidadeId: string): Promise<number> {
    const [{ n }] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS n FROM lances
        WHERE (item_id = $1 OR (lote_id = $1 AND item_id IS NULL)) AND origem = 'LANCE_FECHADO' AND cancelado = false`,
      [unidadeId],
    );
    return Number(n);
  }

  /** Desconto equivalente (%) para exibição no maior desconto. */
  static desconto(valor: number, referencia: number): number {
    return Math.round(descontoPercentual(valor, referencia) * 100) / 100;
  }
}

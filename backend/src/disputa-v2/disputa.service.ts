import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource, EntityManager } from 'typeorm';
import { createHash } from 'crypto';
import { SessaoDisputa, StatusSessao, EtapaSessao } from '../sessao/entities/sessao-disputa.entity';
import { EventoSessao, TipoEvento } from '../sessao/entities/evento-sessao.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { ItemLicitacao, StatusDisputaItem } from '../itens/entities/item-licitacao.entity';
import { Lance } from './entities/lance.entity';
import { AtaSessaoSnapshot } from './entities/ata-sessao-snapshot.entity';
import { Proposta } from '../propostas/entities/proposta.entity';
import { PropostaItem } from '../propostas/entities/proposta-item.entity';
import { AnonimizacaoService } from './anonimizacao.service';
import { ParametrosDisputaService } from './parametros-disputa.service';
import { ParametrosDisputa } from './parametros-disputa';
import {
  BaseLance,
  LanceRecusado,
  OrigemLance,
  centavos,
  referenciaNaBase,
  validarLance,
  valorAtualNaJanela,
  valoresDoLance,
  valorPropostaNaBase,
} from './modelo-lance';
import { calcularRelogio, calcularRelogioJanela, prorrogacaoDaJanela } from './relogio-disputa';
import { idAnonimo } from './sigilo-disputa.service';
import { ModoDisputaService, CamposModoItem } from './modo-disputa.service';
import { melhorQue, ordemSql } from './modos-disputa';
import { exigirRetomadaPermitida, retomarRelogiosDaSessao } from './desconexao-pregoeiro.service';
import { ContextoLeituraLote, DisputaLoteService } from './disputa-lote.service';
import { podeExcluirLanceDireto } from './unidade-disputa';
import { TransicoesService } from '../licitacoes/transicoes/transicoes.service';
import { AtoLicitacao, AtorTransicao } from '../licitacoes/transicoes/transicoes.tipos';
import { exigirLicitacaoAtiva, licitacaoEstaAtiva } from '../sessao/licitacao-ativa';
import { pedirEncerramentoDisputa } from '../sessao/transicoes-sessao';
import { registrarLicitantesDaUnidade, reiniciarJulgamentoDaLicitacao } from '../julgamento/licitantes-unidade.sql';
import { motivoForaDoBeneficioMpe } from '../julgamento/me-epp/beneficio-mpe.sql';
import { pendenciaJulgamentoTecnico } from '../julgamento/julgamento-tecnico.sql';

/**
 * ============================================================================
 * MOTOR DE DISPUTA (disputa-v2) — ÚNICO caminho de lance do pregão/concorrência
 * ============================================================================
 *
 * Lei 14.133/2021 art. 56; IN SEGES 73/2022 arts. 21–23.
 *
 *  - `registrarLance` é o ÚNICO método que grava lance (REST, socket, desempate
 *    ME/EPP pela sala /sessao). Trava pessimista no item: a ordem de registro é
 *    a ordem da trava. Regras puras em `modelo-lance.ts` (validarLance).
 *  - Conversão proposta→lance só em `converterPropostasEmLances` (origem
 *    PROPOSTA; índice único parcial impede duplicata).
 *  - Parâmetros (tempos, diferença mínima, exclusão em 15 s, % de reinício,
 *    base do lance) SÓ pelo resolvedor (`ParametrosDisputaService`).
 *  - Relógio: uma fórmula (`relogio-disputa.ts`); o dono do tempo é o
 *    DisputaTimerService.
 *  - Reinício: retrato congelado + cancelamento lógico — nunca DELETE.
 *  - Chat: eventos da sessão (MENSAGEM_*), respeitando `chat_desabilitado`.
 *
 * PONTOS DE EXTENSÃO (modos/lote/dispensa): `OrigemLance` (LANCE_FECHADO,
 * JANELA_DISPENSA), unidade LOTE (`BaseLance.TOTAL_LOTE` → DisputaLoteService), status TEMPO_ALEATORIO
 * no relógio, `validarLance` por origem.
 * ============================================================================
 */

/** Campos do modo de disputa (fase, elegibilidade, lance fechado) — `CamposModoItem` (E2.4). */
export interface ItemDisputa extends CamposModoItem {
  id: string;
  numero: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  /** Valor de referência na unidade da base do lance (comparável com os lances). */
  valorReferencia: number;
  /** Valor unitário estimado (sempre unitário). */
  valorReferenciaUnitario: number;
  baseLance: BaseLance;
  valorMaximoAceitavel?: number;
  status: 'AGUARDANDO' | 'EM_DISPUTA' | 'ENCERRADO';
  tempoRestante: number;
  emProrrogacao: boolean;
  melhorLance?: {
    valor: number;
    fornecedorId: string;
    fornecedorNome: string;
  };
  meuMelhorLance?: number;
  minhaPosicao?: number;
  minhaPropostaInicial?: number;
  totalPropostas: number;
  totalLances: number;
  /**
   * Unidade de disputa (`unidade-disputa.ts`): ITEM (padrão, ausente) ou LOTE
   * (base TOTAL_LOTE — `id` é o id do lote, valores são o global do lote).
   */
  tipoUnidade?: 'ITEM' | 'LOTE';
  /** LOTE: itens do lote (referência por item e, para o fornecedor, a própria cotação). */
  itensDoLote?: Array<{
    id: string;
    numero: number;
    descricao: string;
    quantidade: number;
    unidade: string;
    valorReferencia: number;
    minhaProposta?: { valorUnitario: number | null; valorTotal: number | null };
  }>;
  /** LOTE, visão do fornecedor: cotou todos os itens do lote (senão não disputa o lote). */
  elegivel?: boolean;
  itensNaoCotados?: number[];
}

/** Quem lê: `visaoOrgao` = órgão dono da licitação (ou admin). Padrão: público/fornecedor. */
export interface OpcoesVisaoDisputa {
  visaoOrgao?: boolean;
}

export interface LanceRegistrado {
  id: string;
  valor: number;
  valorUnitario: number | null;
  valorTotal: number | null;
  fornecedorId: string;
  fornecedorNome: string;
  dataHora: Date;
  origem: OrigemLance;
}

export interface MensagemChat {
  id: string;
  tipo: 'SISTEMA' | 'PREGOEIRO' | 'FORNECEDOR';
  remetente: string;
  conteudo: string;
  dataHora: Date;
}

export interface RemetenteChat {
  tipo: 'PREGOEIRO' | 'FORNECEDOR';
  nome: string;
  fornecedorId?: string;
  usuarioId?: string;
}

export interface LancePainelCancelamentoV3 {
  id: string;
  valor: number;
  criadoEm: string;
  cancelado: boolean;
  solicitacaoPendente: boolean;
  podeCancelarDireto: boolean;
  segundosRestantesCancelamentoDireto: number;
}

export interface SolicitacaoCancelamentoPendenteV3 {
  lanceId: string;
  itemId: string;
  itemNumero: number;
  fornecedorId: string;
  fornecedorNome: string;
  valor: number;
  motivo: string | null;
  solicitadoEm: string;
}

export interface ComandoLance {
  sessaoId: string;
  /** Id da UNIDADE de disputa: item (ou lote — ver `loteId`). */
  itemId: string;
  /** Disputa por lote: id do lote (ou o próprio `itemId`, se for de lote). */
  loteId?: string;
  /** SEMPRE do token (nunca do corpo/payload). */
  fornecedorId: string;
  valor: number;
  ip?: string;
  origem?: OrigemLance;
}

export interface AlertaReinicio {
  itemId: string;
  itemNumero: number;
  diferencaPercentual: number;
  percentualMinimo: number;
  primeiroLance: { valor: number; fornecedorId: string; fornecedorNome: string };
  segundoLance: { valor: number; fornecedorId: string; fornecedorNome: string };
}

export interface ResultadoEncerramento {
  vencedor?: { fornecedorId: string; fornecedorNome: string; valor: number };
  etapaDeLancesEncerrada: boolean;
  itemNumero?: number;
  jaEstavaEncerrado?: boolean;
  alertaReinicio?: AlertaReinicio | null;
}

/** Tipos de evento que são CHAT (o resto é trilha de auditoria da sessão). */
export const TIPOS_CHAT = [TipoEvento.MENSAGEM_PREGOEIRO, TipoEvento.MENSAGEM_FORNECEDOR, TipoEvento.MENSAGEM_SISTEMA];

/** Status de item que mantêm a etapa de lances aberta. */
const STATUS_ETAPA_ABERTA = ['AGUARDANDO', 'EM_DISPUTA', 'TEMPO_ALEATORIO'];

interface LinhaLanceAtivo {
  id: string;
  fornecedor_id: string;
  valor: string;
  valor_unitario?: string | null;
  origem: OrigemLance;
  created_at: Date;
}

/** Resultado do registro de lance (o `registrarLance` devolve só o `lance`). */
export interface ResultadoRegistroLance {
  lance: Lance;
  /** Valor atual do fornecedor ANTES deste lance (na base do lance). */
  valorAnterior: number | null;
  /** JANELA_DISPENSA: estado da janela depois do lance. */
  janela?: {
    inicio: Date | null;
    fim: Date;
    prorrogada: boolean;
    /** Mensagem de sistema registrada no chat (prorrogação automática). */
    mensagemSistema?: EventoSessao;
  };
}

/**
 * GANCHO do benefício ME/EPP (LC 123/2006 arts. 44/45 — plano E3 item 3),
 * registrado pelo módulo de julgamento (o motor não o importa):
 *  - `aposEncerrarUnidade`: fim da etapa de lances da unidade → apura o
 *    empate ficto e convoca a ME/EPP (falha só é logada);
 *  - `temDesempatePendente`: a sala vai para BENEFICIO_MPE (e não para a
 *    aceitação) enquanto houver desempate em curso.
 */
export interface GanchoBeneficioMpe {
  aposEncerrarUnidade(p: { sessaoId: string; licitacaoId: string; tipoUnidade: 'ITEM' | 'LOTE'; unidadeId: string }): Promise<void>;
  temDesempatePendente(licitacaoId: string): Promise<boolean>;
}

/** Status de proposta que NÃO habilitam lance na dispensa (mesma regra do acolhimento). */
const STATUS_PROPOSTA_INVALIDA_DISPENSA = ['RASCUNHO', 'DESCLASSIFICADA', 'CANCELADA'];

@Injectable()
export class DisputaService {
  private readonly logger = new Logger(DisputaService.name);
  private ganchoMpe: GanchoBeneficioMpe | null = null;

  /** Registro do gancho ME/EPP (julgamento/me-epp — MeEppService). */
  registrarGanchoBeneficioMpe(g: GanchoBeneficioMpe): void {
    this.ganchoMpe = g;
  }

  private async aposEncerrarUnidadeMpe(sessaoId: string, licitacaoId: string, tipoUnidade: 'ITEM' | 'LOTE', unidadeId: string): Promise<void> {
    if (!this.ganchoMpe) return;
    try {
      await this.ganchoMpe.aposEncerrarUnidade({ sessaoId, licitacaoId, tipoUnidade, unidadeId });
    } catch (e: any) {
      this.logger.error(`Benefício ME/EPP da unidade ${unidadeId} não apurado no encerramento: ${e?.message ?? e}`);
    }
  }

  constructor(
    @InjectRepository(SessaoDisputa)
    private readonly sessaoRepo: Repository<SessaoDisputa>,
    @InjectRepository(EventoSessao)
    private readonly eventoRepo: Repository<EventoSessao>,
    @InjectRepository(Licitacao)
    private readonly licitacaoRepo: Repository<Licitacao>,
    @InjectRepository(ItemLicitacao)
    private readonly itemRepo: Repository<ItemLicitacao>,
    @InjectRepository(Lance)
    private readonly lanceRepo: Repository<Lance>,
    @InjectRepository(Proposta)
    private readonly propostaRepo: Repository<Proposta>,
    @InjectRepository(PropostaItem)
    private readonly propostaItemRepo: Repository<PropostaItem>,
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => AnonimizacaoService))
    private readonly anonimizacaoService: AnonimizacaoService,
    private readonly transicoes: TransicoesService,
    private readonly parametros: ParametrosDisputaService,
    private readonly modos: ModoDisputaService,
    @Inject(forwardRef(() => DisputaLoteService))
    private readonly lotes: DisputaLoteService,
  ) {}

  // ============================================================================
  // GUARDA DA SALA (plano E1): todo ato exige a licitação ATIVA (409)
  // ============================================================================

  private async sessaoParaAto(sessaoId: string): Promise<SessaoDisputa> {
    const sessao = await this.sessaoRepo.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessão não encontrada');
    await exigirLicitacaoAtiva(this.licitacaoRepo, sessao.licitacao_id);
    return sessao;
  }

  /** Relógio da disputa: não mexe em itens de licitação suspensa/encerrada. */
  async licitacaoAtiva(licitacaoId: string): Promise<boolean> {
    return licitacaoEstaAtiva(this.dataSource.manager, licitacaoId);
  }

  /** Parâmetros efetivos da disputa (resolvedor único). */
  parametrosDaSessao(sessaoId: string, manager?: EntityManager): Promise<ParametrosDisputa> {
    return this.parametros.daSessao(sessaoId, manager);
  }

  /**
   * A etapa de lances da licitação acabou (nenhum item aguardando/em disputa)?
   * Só a partir daí a identidade dos licitantes pode ser revelada a quem não é
   * o órgão dono (E1a/E2 — sem risco de conluio entre itens).
   */
  async etapaDeLancesEncerrada(licitacaoId: string, manager?: EntityManager): Promise<boolean> {
    const m = manager ?? this.dataSource.manager;
    const [{ restantes, total }] = await m.query(
      `SELECT COUNT(*) FILTER (WHERE status_disputa IS NULL OR status_disputa::text = ANY($2))::int AS restantes,
              COUNT(*)::int AS total
         FROM itens_licitacao WHERE licitacao_id = $1`,
      [licitacaoId, STATUS_ETAPA_ABERTA],
    );
    return Number(total) > 0 && Number(restantes) === 0;
  }

  /**
   * Fim da etapa de lances: com TODOS os itens encerrados, a sessão sai da
   * etapa de lances (→ ACEITACAO_PROPOSTA — plano E3: lances encerrados →
   * [desempate ME/EPP] → aceitação → [negociação] → habilitação) e a
   * licitação vai a julgamento (ENCERRAR_DISPUTA). Idempotente.
   * GANCHO ME/EPP: a etapa do desempate (BENEFICIO_MPE) entra aqui, antes da
   * aceitação, quando houver empate ficto; a aceitação recusa convocar
   * enquanto o gancho da ME/EPP indicar pendência na unidade.
   */
  private async concluirEtapaDeLancesSeTerminou(sessaoId: string, licitacaoId: string, ator: AtorTransicao): Promise<boolean> {
    if (!(await this.etapaDeLancesEncerrada(licitacaoId))) return false;

    // Desempate ME/EPP em curso (LC 123 art. 45): a sala vai para BENEFICIO_MPE antes da aceitação
    const pendenteMpe = this.ganchoMpe ? await this.ganchoMpe.temDesempatePendente(licitacaoId).catch(() => false) : false;
    const r = await this.sessaoRepo
      .createQueryBuilder()
      .update(SessaoDisputa)
      .set({ status: StatusSessao.EM_ANDAMENTO, etapa: pendenteMpe ? EtapaSessao.BENEFICIO_MPE : EtapaSessao.ACEITACAO_PROPOSTA })
      .where('id = :id', { id: sessaoId })
      .andWhere('etapa IN (:...etapas)', { etapas: [EtapaSessao.DISPUTA_LANCES, EtapaSessao.RANDOM_ENCERRAMENTO] })
      .execute();
    if (r.affected) {
      await this.registrarEvento(
        sessaoId,
        TipoEvento.DISPUTA_ENCERRADA,
        'Etapa de lances encerrada: todos os itens foram finalizados. Segue o julgamento das propostas.',
      );
    }
    await pedirEncerramentoDisputa(this.transicoes, licitacaoId, ator);
    return true;
  }

  // ============================================================================
  // DADOS DA SESSÃO
  // ============================================================================

  async getSessao(sessaoId: string) {
    const sessao = await this.sessaoRepo.findOne({ where: { id: sessaoId }, relations: ['licitacao'] });
    if (!sessao) throw new NotFoundException('Sessão não encontrada');

    return {
      id: sessao.id,
      licitacaoId: sessao.licitacao_id,
      status: sessao.status,
      etapa: sessao.etapa,
      // Modo da LICITAÇÃO (Lei 14.133 art. 56) — os booleanos da sessão são legado
      modoDisputa: (await this.modos.contexto(sessao.licitacao_id)).modo,
      disputaPorItem: sessao.disputa_por_item,
      pregoeiro: { id: sessao.pregoeiro_id, nome: sessao.pregoeiro_nome },
      tempoInatividade: sessao.tempo_inatividade_minutos,
      tempoAleatorioMin: sessao.tempo_aleatorio_min_minutos,
      tempoAleatorioMax: sessao.tempo_aleatorio_max_minutos,
      chatDesabilitado: sessao.chat_desabilitado,
      suspensa: sessao.status === StatusSessao.SUSPENSA,
      motivoSuspensao: sessao.motivo_suspensao,
      licitacao: sessao.licitacao
        ? { id: sessao.licitacao.id, numero: sessao.licitacao.numero_edital, objeto: sessao.licitacao.objeto }
        : null,
    };
  }

  /** Código anônimo do fornecedor na sessão ("Fornecedor B"); nunca lança. */
  async codigoAnonimoSeguro(sessaoId: string, fornecedorId: string): Promise<string> {
    try {
      return await this.anonimizacaoService.obterCodigoAnonimo(sessaoId, fornecedorId);
    } catch (e: any) {
      this.logger.warn(`Código anônimo indisponível (sessão ${sessaoId}): ${e?.message ?? e}`);
      const mapa = await this.anonimizacaoService.obterMapeamentoSessao(sessaoId).catch(() => new Map<string, string>());
      return mapa.get(fornecedorId) || 'Licitante';
    }
  }

  /** Razão social do fornecedor (identidade do lance vem do token, o nome do cadastro). */
  async nomeDoFornecedor(fornecedorId: string): Promise<string> {
    return this.nomeDoFornecedorNa(this.dataSource.manager, fornecedorId);
  }

  private async nomeDoFornecedorNa(m: EntityManager, fornecedorId: string): Promise<string> {
    const r = await m.query(`SELECT razao_social FROM fornecedores WHERE id::text = $1`, [fornecedorId]);
    return r[0]?.razao_social || 'Fornecedor';
  }

  async getSessaoPorLicitacao(licitacaoId: string) {
    const sessao = await this.sessaoRepo.findOne({ where: { licitacao_id: licitacaoId }, order: { created_at: 'DESC' } });
    if (!sessao) throw new NotFoundException('Sessão não encontrada para esta licitação');
    return this.getSessao(sessao.id);
  }

  // ============================================================================
  // ELEGIBILIDADE
  // ============================================================================

  /** Fornecedor com proposta CLASSIFICADA/RECEBIDA na licitação pode entrar na sala. */
  async verificarElegibilidadeFornecedor(sessaoId: string, fornecedorId: string): Promise<{
    elegivel: boolean;
    motivo?: string;
    propostasClassificadas: number;
  }> {
    const sessao = await this.sessaoRepo.findOne({ where: { id: sessaoId } });
    if (!sessao) return { elegivel: false, motivo: 'Sessão não encontrada', propostasClassificadas: 0 };

    const propostasClassificadas = await this.propostaRepo.count({
      where: { licitacao_id: sessao.licitacao_id, fornecedor_id: fornecedorId, status: In(['CLASSIFICADA', 'RECEBIDA']) },
    });
    if (propostasClassificadas === 0) {
      return {
        elegivel: false,
        motivo:
          'Você não possui proposta classificada para esta licitação. Apenas fornecedores com propostas classificadas podem participar da fase de lances.',
        propostasClassificadas: 0,
      };
    }
    return { elegivel: true, propostasClassificadas };
  }

  /** Item da proposta válida do fornecedor (CLASSIFICADA/RECEBIDA). */
  /**
   * Dispensa (JANELA_DISPENSA): proposta VÁLIDA do fornecedor no item — enviada
   * e não desclassificada/cancelada (a dispensa não tem etapa de classificação
   * antes dos lances).
   */
  private async propostaValidaDispensaNoItem(m: EntityManager, itemId: string, fornecedorId: string): Promise<PropostaItem | null> {
    return m
      .createQueryBuilder(PropostaItem, 'pi')
      .innerJoin('pi.proposta', 'p')
      .where('pi.item_licitacao_id = :itemId', { itemId })
      .andWhere('p.fornecedor_id = :fornecedorId', { fornecedorId })
      .andWhere('p.status::text NOT IN (:...status)', { status: STATUS_PROPOSTA_INVALIDA_DISPENSA })
      .getOne();
  }

  /** Estado da janela da dispensa com a linha da licitação travada (FOR UPDATE). */
  private async travarJanelaDispensa(
    m: EntityManager,
    licitacaoId: string,
  ): Promise<{ inicio: Date | null; fim: Date | null; prorrogacaoMinutos: number }> {
    const [l] = await m.query(
      `SELECT modalidade::text AS modalidade, dispensa_lances_inicio, dispensa_lances_fim, dispensa_lances_prorrogacao_min
         FROM licitacoes WHERE id = $1 FOR UPDATE`,
      [licitacaoId],
    );
    if (!l) throw new NotFoundException('Licitação não encontrada');
    if (l.modalidade !== 'DISPENSA_ELETRONICA') {
      throw new ConflictException('Janela de lances disponível apenas para Dispensa Eletrônica');
    }
    return {
      inicio: l.dispensa_lances_inicio ? new Date(l.dispensa_lances_inicio) : null,
      fim: l.dispensa_lances_fim ? new Date(l.dispensa_lances_fim) : null,
      prorrogacaoMinutos: Number(l.dispensa_lances_prorrogacao_min) || 0,
    };
  }

  private async propostaDoFornecedorNoItem(m: EntityManager, itemId: string, fornecedorId: string): Promise<PropostaItem | null> {
    return m
      .createQueryBuilder(PropostaItem, 'pi')
      .innerJoin('pi.proposta', 'p')
      .where('pi.item_licitacao_id = :itemId', { itemId })
      .andWhere('p.fornecedor_id = :fornecedorId', { fornecedorId })
      .andWhere('p.status IN (:...status)', { status: ['CLASSIFICADA', 'RECEBIDA'] })
      .getOne();
  }

  // ============================================================================
  // ITENS (3 ABAS)
  // ============================================================================

  /**
   * Itens da sessão nas 3 abas. Leitura em LOTE (poucas consultas por
   * chamada, qualquer que seja o número de itens): é chamada para cada socket
   * a cada lance difundido, então não pode fazer N consultas por item.
   */
  async getItensPorStatus(sessaoId: string, fornecedorId?: string, opts: OpcoesVisaoDisputa = {}): Promise<{
    aguardando: ItemDisputa[];
    emDisputa: ItemDisputa[];
    encerrados: ItemDisputa[];
  }> {
    const sessao = await this.sessaoRepo.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessão não encontrada');
    const m = this.dataSource.manager;

    const itens = await this.itemRepo.find({ where: { licitacao_id: sessao.licitacao_id }, order: { numero_item: 'ASC' } });
    const params = await this.parametros.daSessao(sessaoId);
    const anonimizar = await this.deveAnonimizar(sessao, opts);
    if (params.baseLance === BaseLance.TOTAL_LOTE) {
      // Disputa por LOTE: a unidade da sala é o lote (disputa-lote.service.ts)
      const codigosLote = anonimizar ? await this.anonimizacaoService.obterMapeamentoSessao(sessao.id) : new Map<string, string>();
      const unidades = await this.lotes.unidades(sessao, params, anonimizar, codigosLote, fornecedorId);
      // Estratégia do modo no LOTE (E2.4): fase, relógio da fase, elegibilidade, lance fechado próprio
      const lotesDb = await m.query(
        `SELECT id::text AS id, status_disputa::text AS status_disputa, disputa_iniciada_em, ultimo_lance_em, inicio_tempo_aleatorio
           FROM lotes_licitacao WHERE licitacao_id = $1`,
        [sessao.licitacao_id],
      );
      await this.modos.enriquecerItens(sessao, lotesDb, unidades, params, { fornecedorId, visaoOrgao: opts.visaoOrgao });
      return {
        aguardando: unidades.filter((u) => u.status === 'AGUARDANDO'),
        emDisputa: unidades.filter((u) => u.status === 'EM_DISPUTA'),
        encerrados: unidades.filter((u) => u.status === 'ENCERRADO'),
      };
    }

    const ativos: Array<{ item_id: string; fornecedor_id: string | null; fornecedor_identificador: string | null; fornecedor_nome: string | null; valor: string; created_at: Date }> =
      await m.query(
        // Lance final fechado: sigiloso até o fim do prazo (IN 73 art. 24 §2º) — fora das leituras
        `SELECT l.item_id, l.fornecedor_id, l.fornecedor_identificador, l.fornecedor_nome, l.valor, l.created_at
           FROM lances l JOIN itens_licitacao i ON i.id = l.item_id
          WHERE l.licitacao_id = $1 AND l.cancelado = false AND ${ModoDisputaService.SQL_LANCE_VISIVEL}
          ORDER BY l.valor ${ordemSql(await this.modos.direcao(sessao.licitacao_id))}, l.created_at ASC`,
        [sessao.licitacao_id],
      );
    const porItem = new Map<string, typeof ativos>();
    for (const l of ativos) {
      const k = String(l.item_id);
      if (!porItem.has(k)) porItem.set(k, []);
      porItem.get(k)!.push(l);
    }
    const contagemPropostas = new Map<string, number>(
      (
        await m.query(
          `SELECT pi.item_licitacao_id AS item_id, COUNT(*)::int AS n
             FROM proposta_itens pi JOIN propostas p ON p.id = pi.proposta_id
            WHERE p.licitacao_id = $1 GROUP BY 1`,
          [sessao.licitacao_id],
        )
      ).map((r: any) => [String(r.item_id), Number(r.n)]),
    );
    const minhasPropostas = new Map<string, any>();
    if (fornecedorId) {
      const rows = await m.query(
        `SELECT pi.item_licitacao_id AS item_id, pi.valor_unitario, pi.valor_total
           FROM proposta_itens pi JOIN propostas p ON p.id = pi.proposta_id
          WHERE p.licitacao_id = $1 AND p.fornecedor_id::text = $2 AND p.status IN ('CLASSIFICADA','RECEBIDA')`,
        [sessao.licitacao_id, fornecedorId],
      );
      for (const r of rows) minhasPropostas.set(String(r.item_id), r);
    }
    const codigos = anonimizar ? await this.anonimizacaoService.obterMapeamentoSessao(sessao.id) : new Map<string, string>();

    const aguardando: ItemDisputa[] = [];
    const emDisputa: ItemDisputa[] = [];
    const encerrados: ItemDisputa[] = [];
    for (const item of itens) {
      const itemDisputa = await this.mapearItemParaDisputa(item, sessao, params, anonimizar, codigos, {
        lances: porItem.get(String(item.id)) ?? [],
        totalPropostas: contagemPropostas.get(String(item.id)) ?? 0,
        minhaProposta: minhasPropostas.get(String(item.id)),
      }, fornecedorId);
      if (itemDisputa.status === 'EM_DISPUTA') emDisputa.push(itemDisputa);
      else if (itemDisputa.status === 'ENCERRADO') encerrados.push(itemDisputa);
      else aguardando.push(itemDisputa);
    }
    // Estratégia do modo (E2.4): fase, relógio da fase (aleatório OCULTO), elegibilidade, lance fechado próprio
    await this.modos.enriquecerItens(sessao, itens, [...aguardando, ...emDisputa, ...encerrados], params, {
      fornecedorId,
      visaoOrgao: opts.visaoOrgao,
    });
    return { aguardando, emDisputa, encerrados };
  }

  /**
   * Anonimizar o melhor lance nas visões? Para o público e fornecedores:
   * sempre, até o fim da etapa de lances da licitação inteira (IN 73 art. 21
   * §6º). Para o órgão dono: segue o interruptor `anonimizacao_ativa`.
   */
  private async deveAnonimizar(sessao: SessaoDisputa, opts: OpcoesVisaoDisputa): Promise<boolean> {
    if (opts.visaoOrgao) return this.anonimizacaoService.isAnonimizacaoAtiva(sessao.id);
    return !(await this.etapaDeLancesEncerrada(sessao.licitacao_id));
  }

  /**
   * Trava o item (FOR UPDATE) com tempo-limite: nenhum ato da sala espera uma
   * trava indefinidamente.
   */
  private async travarItem(m: EntityManager, itemId: string): Promise<ItemLicitacao | null> {
    await m.query(`SET LOCAL lock_timeout = '10s'`);
    try {
      return await m.findOne(ItemLicitacao, { where: { id: itemId }, lock: { mode: 'pessimistic_write' } });
    } catch (e: any) {
      if (e?.code === '55P03') throw new ConflictException('A sala está ocupada processando outro ato neste item. Tente novamente.');
      throw e;
    }
  }

  private async melhorLanceAtivo(m: EntityManager, itemId: string): Promise<Lance | null> {
    const doItem = await m.findOne(ItemLicitacao, { where: { id: itemId }, select: ['id', 'licitacao_id'] });
    const direcao = doItem ? await this.modos.direcao(doItem.licitacao_id, m) : 'MENOR';
    return m.findOne(Lance, {
      where: { item_id: itemId, cancelado: false },
      order: { valor: ordemSql(direcao), created_at: 'ASC' },
    });
  }

  /** Monta o item a partir dos dados já carregados em lote (sem consultas por item). */
  private async mapearItemParaDisputa(
    item: ItemLicitacao,
    sessao: SessaoDisputa,
    params: ParametrosDisputa,
    anonimizar: boolean,
    codigos: Map<string, string>,
    dados: {
      /** Lances ativos do item, já em ordem (valor, registro). */
      lances: Array<{ fornecedor_id: string | null; fornecedor_identificador: string | null; fornecedor_nome: string | null; valor: string }>;
      totalPropostas: number;
      minhaProposta?: { valor_unitario: any; valor_total: any };
    },
    fornecedorId?: string,
  ): Promise<ItemDisputa> {
    const quantidade = parseFloat(String(item.quantidade)) || 1;
    const melhorLance = dados.lances[0];

    let meuMelhorLance: number | undefined;
    let minhaPosicao: number | undefined;
    let minhaPropostaInicial: number | undefined;
    if (fornecedorId) {
      const meu = dados.lances.find((l) => l.fornecedor_id === fornecedorId);
      if (meu) meuMelhorLance = parseFloat(meu.valor);
      if (dados.minhaProposta) {
        minhaPropostaInicial = valorPropostaNaBase(dados.minhaProposta, params.baseLance, quantidade);
        if (!meuMelhorLance) meuMelhorLance = minhaPropostaInicial;
      }
      if (meu) {
        // posição = ordem do melhor valor de cada fornecedor (lances já ordenados)
        const vistos: string[] = [];
        for (const l of dados.lances) {
          const f = l.fornecedor_id || '';
          if (f && !vistos.includes(f)) vistos.push(f);
        }
        const pos = vistos.indexOf(fornecedorId);
        if (pos >= 0) minhaPosicao = pos + 1;
      }
    }

    const relogio = calcularRelogio({
      status: item.status_disputa,
      disputaIniciadaEm: item.disputa_iniciada_em,
      ultimoLanceEm: item.ultimo_lance_em,
      tempoInicialMinutos: params.tempoInicialMinutos,
      prorrogacaoMinutos: params.prorrogacaoMinutos,
      inicioTempoAleatorio: item.inicio_tempo_aleatorio,
      tempoAleatorioSorteadoSegundos: item.tempo_aleatorio_sorteado,
    });

    let status: ItemDisputa['status'] = 'AGUARDANDO';
    if (item.status_disputa === StatusDisputaItem.EM_DISPUTA || item.status_disputa === StatusDisputaItem.TEMPO_ALEATORIO) {
      status = 'EM_DISPUTA';
    } else if (item.status_disputa === StatusDisputaItem.ENCERRADO || item.status_disputa === StatusDisputaItem.NEGOCIACAO) {
      status = 'ENCERRADO';
    }

    let melhor = melhorLance
      ? {
          valor: parseFloat(String(melhorLance.valor)),
          fornecedorId: melhorLance.fornecedor_id || melhorLance.fornecedor_identificador || '',
          fornecedorNome: melhorLance.fornecedor_nome || 'Fornecedor',
        }
      : undefined;
    if (melhor && anonimizar && melhor.fornecedorId) {
      const codigo = codigos.get(melhor.fornecedorId) ?? (await this.codigoAnonimoSeguro(sessao.id, melhor.fornecedorId));
      melhor = { ...melhor, fornecedorId: idAnonimo(codigo), fornecedorNome: codigo };
    }

    return {
      id: item.id,
      numero: item.numero_item,
      descricao: item.descricao_resumida || item.descricao_detalhada || '',
      quantidade,
      unidade: item.unidade_medida || 'UN',
      valorReferencia: referenciaNaBase(item, params.baseLance),
      valorReferenciaUnitario: parseFloat(String(item.valor_unitario_estimado)) || 0,
      baseLance: params.baseLance,
      valorMaximoAceitavel: undefined,
      status,
      tempoRestante: status === 'EM_DISPUTA' ? relogio.restanteSegundos : 0,
      emProrrogacao: status === 'EM_DISPUTA' ? relogio.emProrrogacao : false,
      melhorLance: melhor,
      meuMelhorLance,
      minhaPosicao,
      minhaPropostaInicial,
      totalPropostas: dados.totalPropostas,
      totalLances: dados.lances.length,
    };
  }

  /**
   * Ranking do item: melhor valor ATIVO de cada fornecedor, em ordem crescente;
   * empate de valor (só possível entre propostas) → registrado primeiro.
   */
  async rankingDoItem(itemId: string, manager?: EntityManager): Promise<Array<{
    fornecedorId: string;
    fornecedorNome: string;
    melhorValor: number;
    registradoEm: Date;
    totalLances: number;
  }>> {
    const m = manager ?? this.dataSource.manager;
    // Unidade LOTE: ranking pelo lance do lote
    if (await this.lotes.ehLote(itemId, m)) return this.lotes.ranking(itemId, m);
    // Direção do critério (maior lance em ordem decrescente) e sigilo do lance fechado em curso
    const [linhaItem] = await m.query(`SELECT licitacao_id FROM itens_licitacao WHERE id = $1`, [itemId]);
    const direcaoRanking = linhaItem ? await this.modos.direcao(linhaItem.licitacao_id, m) : 'MENOR';
    const rows: any[] = await m.query(
      `WITH ativos AS (
         SELECT l.*, COUNT(*) OVER (PARTITION BY l.fornecedor_id) AS total
           FROM lances l JOIN itens_licitacao i ON i.id = l.item_id
          WHERE l.item_id = $1 AND l.cancelado = false AND l.fornecedor_id IS NOT NULL
            AND ${ModoDisputaService.SQL_LANCE_VISIVEL}
       )
       SELECT DISTINCT ON (a.fornecedor_id)
              a.fornecedor_id, COALESCE(f.razao_social, a.fornecedor_nome) AS nome,
              a.valor, a.created_at, a.total
         FROM ativos a LEFT JOIN fornecedores f ON f.id::text = a.fornecedor_id
        ORDER BY a.fornecedor_id, a.valor ${ordemSql(direcaoRanking)}, a.created_at ASC`,
      [itemId],
    );
    const sinal = direcaoRanking === 'MAIOR' ? -1 : 1;
    return rows
      .map((r) => ({
        fornecedorId: String(r.fornecedor_id),
        fornecedorNome: r.nome || 'Fornecedor',
        melhorValor: parseFloat(r.valor),
        registradoEm: new Date(r.created_at),
        totalLances: Number(r.total),
      }))
      .sort((a, b) => sinal * (a.melhorValor - b.melhorValor) || a.registradoEm.getTime() - b.registradoEm.getTime());
  }

  // ============================================================================
  // INICIAR DISPUTA DE ITENS
  // ============================================================================

  /**
   * Inicia a disputa de um ou mais itens (converte as propostas em lances de
   * origem PROPOSTA e atribui os códigos anônimos da sessão).
   */
  async iniciarDisputa(sessaoId: string, itensIds: string[], ator: AtorTransicao): Promise<{ itensIniciados: number; lotesIniciados?: number }> {
    const sessao = await this.sessaoParaAto(sessaoId);
    if (sessao.status === StatusSessao.SUSPENSA) {
      throw new BadRequestException('Sessão está suspensa. Não é possível iniciar novos itens.');
    }
    if (sessao.data_hora_inicio_prevista) {
      const dataAbertura = new Date(sessao.data_hora_inicio_prevista);
      if (new Date() < dataAbertura) {
        const dataFormatada = dataAbertura.toLocaleString('pt-BR', {
          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
        });
        throw new BadRequestException(`A disputa só pode ser iniciada a partir de ${dataFormatada}. Aguarde a data de abertura programada.`);
      }
    }

    const params = await this.parametros.daSessao(sessaoId);
    // Modo × critério (Lei 14.133 art. 56 §§1º-2º) conferidos antes de abrir lances (item e lote)
    await this.modos.exigirModoCriterioDaLicitacao(sessao.licitacao_id);
    // Critérios técnicos: a etapa de preços só abre com as notas técnicas publicadas (Lei 14.133 art. 36 §2º)
    const pendenciaTecnica = await pendenciaJulgamentoTecnico(this.dataSource.manager, sessao.licitacao_id);
    if (pendenciaTecnica) throw new ConflictException(pendenciaTecnica);
    if (params.baseLance === BaseLance.TOTAL_LOTE) {
      // Disputa por LOTE: ids de lote (ou de itens → seus lotes) — disputa-lote.service.ts
      const r = await this.lotes.iniciar(sessao, itensIds, ator);
      // Modo FECHADO: o lote encerra na abertura com o ranking das propostas
      for (const loteId of r.encerrarNaAbertura) await this.encerrarItem(sessaoId, loteId, ator);
      return { itensIniciados: r.itensIniciados, lotesIniciados: r.lotesIniciados };
    }
    const encerrarNaAbertura: string[] = [];

    const aIniciar: ItemLicitacao[] = [];
    for (const itemId of itensIds) {
      const item = await this.itemRepo.findOneBy({ id: itemId });
      if (!item || item.licitacao_id !== sessao.licitacao_id) continue;
      if (item.status_disputa && item.status_disputa !== StatusDisputaItem.AGUARDANDO) continue;
      aIniciar.push(item);
    }
    if (!aIniciar.length) return { itensIniciados: 0 };

    // Primeiro item em disputa = abertura da etapa de lances (INICIAR_DISPUTA, idempotente)
    await this.transicoes.executar(sessao.licitacao_id, AtoLicitacao.INICIAR_DISPUTA, {
      ator,
      ignorarSeJaAplicado: true,
      registro: { origem: 'disputa-v2', sessao_id: sessaoId },
    });

    // Códigos anônimos atribuídos de uma vez, antes de qualquer difusão (simulador 5c)
    const participantes: Array<{ fornecedor_id: string }> = await this.dataSource.query(
      `SELECT DISTINCT fornecedor_id FROM propostas
        WHERE licitacao_id = $1 AND status IN ('CLASSIFICADA','RECEBIDA') ORDER BY fornecedor_id`,
      [sessao.licitacao_id],
    );
    await this.anonimizacaoService.atribuirCodigos(sessaoId, participantes.map((p) => String(p.fornecedor_id)));

    let itensIniciados = 0;
    for (const alvo of aIniciar) {
      const iniciado = await this.dataSource.transaction(async (m) => {
        const item = await this.travarItem(m, alvo.id);
        if (!item || (item.status_disputa && item.status_disputa !== StatusDisputaItem.AGUARDANDO)) return false;
        await this.converterPropostasEmLances(m, item, params.baseLance);
        const agora = new Date();
        // Estratégia do modo: fechado encerra na hora; aberto-fechado/fechado-aberto gravam a fase
        const inicioModo = await this.modos.aoIniciarItem(m, sessaoId, item, params.baseLance, agora);
        if (inicioModo.encerrarImediatamente) encerrarNaAbertura.push(item.id);
        await m.update(ItemLicitacao, item.id, {
          status_disputa: StatusDisputaItem.EM_DISPUTA,
          disputa_iniciada_em: agora,
          ultimo_lance_em: agora,
          inicio_tempo_aleatorio: null as any,
          tempo_aleatorio_sorteado: null as any,
          disputa_encerrada_em: null as any,
        });
        await m.save(
          m.create(EventoSessao, {
            sessao_id: sessaoId,
            tipo: TipoEvento.DISPUTA_ITEM_INICIADA,
            descricao: `Disputa iniciada para o Item ${item.numero_item}`,
            item_id: item.id,
            usuario_nome: 'SISTEMA',
            is_sistema: true,
          }),
        );
        return true;
      });
      if (iniciado) itensIniciados++;
    }

    if (itensIniciados > 0) {
      await this.sessaoRepo.update(sessaoId, { status: StatusSessao.MODO_ABERTO, etapa: EtapaSessao.DISPUTA_LANCES });
    }
    // Modo FECHADO (Lei 14.133 art. 56 I): sem lances — o item encerra com o ranking das propostas
    for (const itemId of encerrarNaAbertura) {
      await this.encerrarItem(sessaoId, itemId, ator);
    }
    return { itensIniciados };
  }

  /**
   * ÚNICO ponto de conversão proposta→lance (origem PROPOSTA). Roda com o item
   * travado; a checagem de existência + o índice único parcial
   * `UQ_lances_proposta_ativa` garantem uma proposta ativa por item+fornecedor.
   */
  private async converterPropostasEmLances(m: EntityManager, item: ItemLicitacao, base: BaseLance): Promise<number> {
    const itensProposta = await m.find(PropostaItem, {
      where: { item_licitacao_id: item.id },
      relations: ['proposta', 'proposta.fornecedor'],
    });
    const quantidade = Number(item.quantidade) || 1;
    let criados = 0;
    for (const ip of itensProposta) {
      const proposta = ip.proposta;
      if (!proposta || (proposta.status !== 'CLASSIFICADA' && proposta.status !== 'RECEBIDA')) continue;
      const fornecedorId = String(proposta.fornecedor_id);
      // Item exclusivo/cota de ME/EPP: proposta de quem não é ME/EPP não entra na disputa (art. 48)
      if (await motivoForaDoBeneficioMpe(m, item.id, fornecedorId)) continue;
      const existe = await m.count(Lance, {
        where: { item_id: item.id, fornecedor_id: fornecedorId, origem: OrigemLance.PROPOSTA, cancelado: false },
      });
      if (existe) continue;
      const valor = centavos(valorPropostaNaBase(ip, base, quantidade));
      if (!(valor > 0)) continue;
      await m.save(
        m.create(Lance, {
          licitacao_id: item.licitacao_id,
          item_id: item.id,
          fornecedor_id: fornecedorId,
          fornecedor_nome: proposta.fornecedor?.razao_social || 'Fornecedor',
          valor,
          ...valoresDoLance(valor, base, quantidade),
          base_lance: base,
          origem: OrigemLance.PROPOSTA,
          ip_origem: 'SISTEMA',
          cancelado: false,
          created_at: new Date(),
        } as Partial<Lance>),
      );
      criados++;
    }
    return criados;
  }

  // ============================================================================
  // REGISTRAR LANCE — ÚNICO caminho de escrita
  // ============================================================================

  /**
   * Registra um lance (LANCE, DESEMPATE_MPE, NEGOCIACAO). Transação com trava
   * pessimista no item: dois lances do mesmo item são processados em fila, e a
   * ordem da trava é a ordem de registro (regra de lances iguais).
   * Recusa → 400 (valor) ou 409 (estado do processo).
   *
   * JANELA_DISPENSA (dispensa eletrônica, IN 67): mesmo caminho, com a janela
   * da licitação travada (FOR UPDATE), valor UNITÁRIO, regra "reduz o próprio
   * valor" (`validarJanelaDispensa`) e prorrogação da janela pelo relógio único
   * (`prorrogacaoDaJanela`) DENTRO da transação do lance.
   */
  async registrarLance(cmd: ComandoLance): Promise<Lance> {
    return (await this.registrarLanceComResultado(cmd)).lance;
  }

  /** `registrarLance` com o contexto do registro (valor anterior e, na dispensa, a janela). */
  async registrarLanceComResultado(cmd: ComandoLance): Promise<ResultadoRegistroLance> {
    // Unidade LOTE (id de lote no comando): mesmo motor, trava no lote — disputa-lote.service.ts
    const loteId = cmd.loteId ?? ((await this.lotes.ehLote(cmd.itemId)) ? cmd.itemId : null);
    if (loteId) {
      const lance = await this.lotes.registrarLance({
        sessaoId: cmd.sessaoId,
        loteId,
        fornecedorId: cmd.fornecedorId,
        valor: cmd.valor,
        ip: cmd.ip,
        origem: cmd.origem,
      });
      return { lance, valorAnterior: null };
    }
    let origem = cmd.origem ?? OrigemLance.LANCE;
    const valor = Number(cmd.valor);
    try {
      return await this.dataSource.transaction(async (m) => {
        const item = await this.travarItem(m, cmd.itemId);
        if (!item) throw new NotFoundException('Item não encontrado');

        const sessao = await m.findOne(SessaoDisputa, { where: { id: cmd.sessaoId } });
        if (!sessao) throw new NotFoundException('Sessão não encontrada');
        if (item.licitacao_id !== sessao.licitacao_id) {
          throw new BadRequestException('Item não pertence à licitação desta sessão');
        }
        // JANELA_DISPENSA: trava a licitação (FOR UPDATE) ANTES do FOR SHARE abaixo —
        // o lance pode prorrogar a janela (UPDATE na mesma linha); sem isto, dois
        // lances concorrentes em itens diferentes disputariam a promoção da trava.
        const janela = origem === OrigemLance.JANELA_DISPENSA ? await this.travarJanelaDispensa(m, sessao.licitacao_id) : null;
        // E1: licitação ATIVA (FOR SHARE: um SUSPENDER concorrente espera este lance)
        await exigirLicitacaoAtiva(m, sessao.licitacao_id, { bloquear: true });

        const params = await this.parametros.daSessao(cmd.sessaoId, m);
        if (janela && params.baseLance !== BaseLance.UNITARIO) {
          throw new ConflictException('Janela de lances da dispensa exige lance por valor UNITÁRIO (base_lance UNITARIO).');
        }
        if (params.baseLance === BaseLance.TOTAL_LOTE) {
          throw new ConflictException('Esta licitação é disputada por LOTE: o lance é dado no lote (valor global), não no item.');
        }
        // Unidade exclusiva/cota de ME/EPP (LC 123 art. 48 I e III): só ME/EPP enquadrada dá lance
        if (!janela) {
          const foraMpe = await motivoForaDoBeneficioMpe(m, item.id, cmd.fornecedorId);
          if (foraMpe) throw new LanceRecusado(foraMpe, 'EXCLUSIVO_MPE');
        }
        const quantidade = Number(item.quantidade) || 1;
        const propostaItem = janela
          ? await this.propostaValidaDispensaNoItem(m, item.id, cmd.fornecedorId)
          : await this.propostaDoFornecedorNoItem(m, item.id, cmd.fornecedorId);

        // Estratégia do modo de disputa (E2.4): origem efetiva (lance fechado),
        // participantes da fase, tempo aleatório = etapa aberta, piso do reinício
        const ctxModo = janela ? null : await this.modos.contexto(sessao.licitacao_id, m);
        const regraModo = ctxModo ? await this.modos.regraDoLance(m, { item, fornecedorId: cmd.fornecedorId, origem, ctx: ctxModo }) : null;
        if (regraModo) origem = regraModo.origem;

        const ativos: LinhaLanceAtivo[] = await m.query(
          `SELECT id, fornecedor_id, valor, valor_unitario, origem, created_at FROM lances
            WHERE item_id = $1 AND cancelado = false
            ORDER BY valor ${ordemSql(ctxModo?.direcao ?? 'MENOR')}, created_at ASC`,
          [item.id],
        );
        const meus = ativos
          .filter((l) => l.fornecedor_id === cmd.fornecedorId)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const melhor = ativos[0];
        const agora = new Date();

        validarLance({
          origem,
          valor,
          statusItem: regraModo ? regraModo.statusParaValidacao : item.status_disputa,
          direcao: ctxModo?.direcao,
          sessaoSuspensa: sessao.status === StatusSessao.SUSPENSA,
          propostaNaBase: propostaItem ? valorPropostaNaBase(propostaItem, params.baseLance, quantidade) : null,
          meuUltimo: meus[0]
            ? {
                // janela (base UNITARIO): o unitário com 4 casas — `valor` guarda só 2
                valor: parseFloat(janela ? String(meus[0].valor_unitario ?? meus[0].valor) : meus[0].valor),
                origem: meus[0].origem,
                criadoEm: new Date(meus[0].created_at),
              }
            : null,
          melhor: melhor ? { valor: parseFloat(melhor.valor), fornecedorId: melhor.fornecedor_id } : null,
          valoresDeOutros: ativos.filter((l) => l.fornecedor_id !== cmd.fornecedorId).map((l) => parseFloat(l.valor)),
          diferencaMinima: params.diferencaMinima,
          intervaloProprioSegundos: params.intervaloProprioSegundos,
          agora,
          janelaAberta: janela ? calcularRelogioJanela({ inicio: janela.inicio, fim: janela.fim, agora: agora.getTime() }).aberta : undefined,
        });
        regraModo?.conferir(valor);
        const propostaBase = propostaItem ? valorPropostaNaBase(propostaItem, params.baseLance, quantidade) : null;
        const valorAnterior = janela
          ? valorAtualNaJanela(propostaBase ?? Infinity, meus.map((l) => parseFloat(String(l.valor_unitario ?? l.valor))))
          : meus[0]
            ? parseFloat(meus[0].valor)
            : propostaBase;

        const fornecedorNome = await this.nomeDoFornecedorNa(m, cmd.fornecedorId);
        const lance = await m.save(
          m.create(Lance, {
            licitacao_id: sessao.licitacao_id,
            item_id: item.id,
            fornecedor_id: cmd.fornecedorId,
            fornecedor_nome: fornecedorNome,
            valor,
            ...valoresDoLance(valor, params.baseLance, quantidade),
            base_lance: params.baseLance,
            origem,
            ip_origem: cmd.ip || null,
            cancelado: false,
            created_at: agora,
          } as Partial<Lance>),
        );

        // Janela da dispensa: as propostas não viram lances (o julgamento lê
        // proposta ∪ lances), então "melhor lance" do item não se aplica.
        // Lance final fechado não mexe no melhor lance do item (sigiloso até o fim do prazo)
        const novoMelhor =
          !janela &&
          origem !== OrigemLance.LANCE_FECHADO &&
          (!melhor || melhorQue(valor, parseFloat(melhor.valor), ctxModo?.direcao ?? 'MENOR'));
        await m.update(ItemLicitacao, item.id, {
          ...(origem === OrigemLance.LANCE || janela ? { ultimo_lance_em: agora } : {}),
          ...(novoMelhor ? { melhor_lance_valor: valor, melhor_lance_fornecedor_id: cmd.fornecedorId } : {}),
        });

        // Prorrogação automática da janela (regra anunciada na abertura) — relógio único
        let resultadoJanela: ResultadoRegistroLance['janela'];
        if (janela) {
          const novoFim = prorrogacaoDaJanela({ fim: janela.fim, prorrogacaoMinutos: janela.prorrogacaoMinutos, agora: agora.getTime() });
          let mensagemSistema: EventoSessao | undefined;
          if (novoFim) {
            await m.query(`UPDATE licitacoes SET dispensa_lances_fim = $2 WHERE id = $1`, [sessao.licitacao_id, novoFim]);
            mensagemSistema = await m.save(
              m.create(EventoSessao, {
                sessao_id: cmd.sessaoId,
                tipo: TipoEvento.MENSAGEM_SISTEMA,
                descricao:
                  `⏱ Janela prorrogada automaticamente até ${novoFim.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} — ` +
                  `lance recebido nos últimos ${janela.prorrogacaoMinutos} min (regra da sessão).`,
                item_id: item.id,
                dados_adicionais: { origem: 'JANELA_DISPENSA', prorrogacao: true, fim: novoFim.toISOString() },
                usuario_nome: 'Sistema',
                is_sistema: true,
              }),
            );
          }
          resultadoJanela = { inicio: janela.inicio, fim: novoFim ?? janela.fim!, prorrogada: !!novoFim, mensagemSistema };
        }

        await m.save(
          m.create(EventoSessao, {
            sessao_id: cmd.sessaoId,
            tipo: origem === OrigemLance.DESEMPATE_MPE ? TipoEvento.LANCE_MPE_REGISTRADO : TipoEvento.LANCE_REGISTRADO,
            descricao:
              origem === OrigemLance.DESEMPATE_MPE
                ? `ME/EPP exerceu o direito de preferência com lance de R$ ${valor.toFixed(2)} no Item ${item.numero_item} (LC 123, art. 45)`
                : origem === OrigemLance.LANCE_FECHADO
                  ? `Lance final fechado recebido no Item ${item.numero_item} (sigiloso até o fim do prazo — IN 73 art. 24 §2º)`
                  : `Lance de R$ ${valor.toFixed(2)} registrado no Item ${item.numero_item}`,
            item_id: item.id,
            fornecedor_id: cmd.fornecedorId,
            lance_id: lance.id,
            // O valor do lance fechado fica só na tabela de lances até o fim do prazo
            valor: origem === OrigemLance.LANCE_FECHADO ? undefined : valor,
            dados_adicionais: { origem, base_lance: params.baseLance },
            usuario_nome: 'SISTEMA',
            is_sistema: true,
          }),
        );
        return { lance, valorAnterior, janela: resultadoJanela };
      });
    } catch (e) {
      if (e instanceof LanceRecusado) {
        throw e.estado ? new ConflictException(e.message) : new BadRequestException(e.message);
      }
      throw e;
    }
  }

  // ============================================================================
  // ENCERRAR DISPUTA DE ITEM
  // ============================================================================

  /**
   * Encerra a disputa do item (idempotente). Devolve o melhor lance e, se a
   * diferença para o 2º colocado atingir o parâmetro, o aviso de reinício
   * possível (Lei 14.133 art. 56 §4º) — só para o órgão.
   */
  async encerrarItem(sessaoId: string, itemId: string, ator: AtorTransicao): Promise<ResultadoEncerramento> {
    const sessao = await this.sessaoParaAto(sessaoId);
    // Unidade LOTE: o id é do lote, ou é item de licitação disputada por lote (encerra o lote dele)
    const loteId = (await this.lotes.ehLote(itemId))
      ? itemId
      : (await this.parametros.daSessao(sessaoId)).baseLance === BaseLance.TOTAL_LOTE
        ? await this.lotes.loteDoItem(itemId)
        : null;
    // Aberto-fechado: encerramento só pelo relógio (IN 73 art. 24) — item ou lote
    await this.modos.antesDeEncerrar(sessao.licitacao_id, loteId ?? itemId, ator);
    if (loteId) return this.encerrarLote(sessao, loteId, ator);

    const r = await this.dataSource.transaction(async (m) => {
      const item = await this.travarItem(m, itemId);
      if (!item) throw new NotFoundException('Item não encontrado');
      if (item.licitacao_id !== sessao.licitacao_id) {
        throw new BadRequestException('Item não pertence à licitação desta sessão');
      }
      if (item.status_disputa === StatusDisputaItem.ENCERRADO || item.status_disputa === StatusDisputaItem.NEGOCIACAO) {
        return { item, melhor: null as Lance | null, jaEstavaEncerrado: true };
      }
      const melhor = await this.melhorLanceAtivo(m, itemId);
      await m.update(ItemLicitacao, itemId, {
        status_disputa: StatusDisputaItem.ENCERRADO,
        disputa_encerrada_em: new Date(),
        melhor_lance_valor: melhor ? melhor.valor : (null as any),
        melhor_lance_fornecedor_id: melhor ? melhor.fornecedor_id : (null as any),
      });
      await m.save(
        m.create(EventoSessao, {
          sessao_id: sessaoId,
          tipo: TipoEvento.DISPUTA_ITEM_ENCERRADA,
          descricao: melhor
            ? `Item ${item.numero_item} encerrado. Melhor lance: R$ ${Number(melhor.valor).toFixed(2)} (${melhor.fornecedor_nome})`
            : `Item ${item.numero_item} encerrado sem lances (DESERTO)`,
          item_id: itemId,
          fornecedor_id: melhor?.fornecedor_id,
          valor: melhor ? Number(melhor.valor) : undefined,
          usuario_nome: 'SISTEMA',
          is_sistema: true,
        }),
      );
      return { item, melhor, jaEstavaEncerrado: false };
    });

    if (r.jaEstavaEncerrado) {
      return {
        etapaDeLancesEncerrada: await this.etapaDeLancesEncerrada(sessao.licitacao_id),
        itemNumero: r.item.numero_item,
        jaEstavaEncerrado: true,
      };
    }

    await this.registrarLicitantesAposEncerrar(sessao.licitacao_id, 'ITEM', itemId);
    await this.aposEncerrarUnidadeMpe(sessaoId, sessao.licitacao_id, 'ITEM', itemId);
    const etapaDeLancesEncerrada = await this.concluirEtapaDeLancesSeTerminou(sessaoId, sessao.licitacao_id, ator);
    await this.modos.aposEncerrar(sessaoId, sessao.licitacao_id, itemId);
    const alertaReinicio = await this.avaliarReinicio(sessaoId, r.item).catch(() => null);

    return {
      etapaDeLancesEncerrada,
      itemNumero: r.item.numero_item,
      alertaReinicio,
      vencedor: r.melhor
        ? { fornecedorId: r.melhor.fornecedor_id, fornecedorNome: r.melhor.fornecedor_nome, valor: Number(r.melhor.valor) }
        : undefined,
    };
  }

  /**
   * Fim da etapa de lances da UNIDADE: o ranking final entra em
   * `licitantes_unidade` (CLASSIFICADO) — base do julgamento (E3). Idempotente;
   * falha só é logada (o encerramento nunca é desfeito por isso: o julgamento
   * recompõe as linhas ao ler a unidade).
   */
  private async registrarLicitantesAposEncerrar(licitacaoId: string, tipoUnidade: 'ITEM' | 'LOTE', unidadeId: string): Promise<void> {
    try {
      const ranking = await this.rankingDoItem(unidadeId);
      await registrarLicitantesDaUnidade(this.dataSource.manager, { licitacaoId, tipoUnidade, unidadeId, ranking });
    } catch (e: any) {
      this.logger.warn(`Licitantes da unidade ${unidadeId} não registrados no encerramento: ${e?.message ?? e}`);
    }
  }

  /** Encerramento da unidade LOTE: mesmo pós-ato do item (fim da etapa de lances, aviso de reinício). */
  private async encerrarLote(sessao: SessaoDisputa, loteId: string, ator: AtorTransicao): Promise<ResultadoEncerramento> {
    const r = await this.lotes.encerrar(sessao, loteId);
    if (r.jaEstavaEncerrado) {
      return {
        etapaDeLancesEncerrada: await this.etapaDeLancesEncerrada(sessao.licitacao_id),
        itemNumero: r.lote.numero,
        jaEstavaEncerrado: true,
      };
    }
    await this.registrarLicitantesAposEncerrar(sessao.licitacao_id, 'LOTE', r.lote.id);
    await this.aposEncerrarUnidadeMpe(sessao.id, sessao.licitacao_id, 'LOTE', r.lote.id);
    const etapaDeLancesEncerrada = await this.concluirEtapaDeLancesSeTerminou(sessao.id, sessao.licitacao_id, ator);
    await this.modos.aposEncerrar(sessao.id, sessao.licitacao_id, r.lote.id);
    const alertaReinicio = await this.avaliarReinicio(sessao.id, { id: r.lote.id, numero_item: r.lote.numero }).catch(() => null);
    return {
      etapaDeLancesEncerrada,
      itemNumero: r.lote.numero,
      alertaReinicio,
      vencedor: r.melhor
        ? { fornecedorId: r.melhor.fornecedor_id, fornecedorNome: r.melhor.fornecedor_nome, valor: Number(r.melhor.valor) }
        : undefined,
    };
  }

  /**
   * Lei 14.133 art. 56 §4º: definida a melhor proposta, se a diferença para a
   * 2ª colocada for de pelo menos X% (parâmetro, padrão 5), a Administração
   * poderá admitir o reinício da disputa aberta para as demais colocações.
   */
  async avaliarReinicio(sessaoId: string, item: Pick<ItemLicitacao, 'id' | 'numero_item'>): Promise<AlertaReinicio | null> {
    const params = await this.parametros.daSessao(sessaoId);
    const ranking = await this.rankingDoItem(item.id);
    if (ranking.length < 2 || !(params.percentualReinicioDisputa > 0)) return null;
    const [p, s] = ranking;
    // |2º − 1º| / 1º — vale nas duas direções (menor preço e maior lance)
    const diferencaPercentual = (Math.abs(s.melhorValor - p.melhorValor) / p.melhorValor) * 100;
    if (diferencaPercentual < params.percentualReinicioDisputa) return null;
    return {
      itemId: item.id,
      itemNumero: item.numero_item,
      diferencaPercentual: Math.round(diferencaPercentual * 100) / 100,
      percentualMinimo: params.percentualReinicioDisputa,
      primeiroLance: { valor: p.melhorValor, fornecedorId: p.fornecedorId, fornecedorNome: p.fornecedorNome },
      segundoLance: { valor: s.melhorValor, fornecedorId: s.fornecedorId, fornecedorNome: s.fornecedorNome },
    };
  }

  // ============================================================================
  // SUSPENDER / RETOMAR SESSÃO
  // ============================================================================

  async suspenderSessao(
    sessaoId: string,
    motivo: 'ADMINISTRATIVO' | 'CAUTELAR' | 'JUDICIAL',
    justificativa: string,
    _dataReabertura?: Date,
  ): Promise<void> {
    await this.sessaoParaAto(sessaoId);
    await this.sessaoRepo.update(sessaoId, { status: StatusSessao.SUSPENSA, motivo_suspensao: `${motivo}: ${justificativa}` });
    await this.registrarEvento(sessaoId, TipoEvento.SESSAO_SUSPENSA, `Sessão suspensa. Motivo: ${motivo}. ${justificativa}`);
  }

  async retomarSessao(sessaoId: string): Promise<void> {
    const sessao = await this.sessaoParaAto(sessaoId);
    if (sessao.status !== StatusSessao.SUSPENSA) throw new BadRequestException('Sessão não está suspensa');
    // Suspensa por desconexão do agente: só 24 h após a comunicação (IN 73 art. 27 §1º).
    // Relógios de itens e lotes: recomeçam (desconexão) ou são deslocados pela pausa (demais suspensões)
    const retomada = await exigirRetomadaPermitida(this.dataSource.manager, sessaoId);
    await retomarRelogiosDaSessao(this.dataSource.manager, sessaoId, sessao.licitacao_id, retomada.porDesconexao);
    await this.sessaoRepo.update(sessaoId, { status: StatusSessao.MODO_ABERTO, motivo_suspensao: undefined });
    await this.registrarEvento(sessaoId, TipoEvento.SESSAO_RETOMADA, 'Sessão retomada');
  }

  // ============================================================================
  // REINICIAR SESSÃO — retrato congelado + cancelamento lógico (nunca DELETE)
  // ============================================================================

  /**
   * Reinicia a etapa de lances (plano E2 item 9):
   *  1. grava o retrato congelado da sessão (`sessao_atas_snapshots`, SHA-256);
   *  2. cancela LOGICAMENTE todos os lances ativos (cancelado_por = REINICIO,
   *     motivo = justificativa) — nenhuma linha é apagada;
   *  3. itens voltam a AGUARDANDO e a sessão à análise de propostas; os códigos
   *     anônimos são mantidos (o licitante continua "Fornecedor B").
   * Tudo numa transação com a sessão travada.
   */
  async reiniciarSessao(
    sessaoId: string,
    justificativa: string,
    ator?: AtorTransicao,
  ): Promise<{ itensReiniciados: number; lancesCancelados: number; snapshotId: string; hash: string }> {
    const motivo = typeof justificativa === 'string' ? justificativa.trim() : '';
    await this.sessaoParaAto(sessaoId);
    if (!motivo) throw new BadRequestException('Justificativa do reinício é obrigatória');

    return this.dataSource.transaction(async (m) => {
      const sessao = await m.findOne(SessaoDisputa, { where: { id: sessaoId }, lock: { mode: 'pessimistic_write' } });
      if (!sessao) throw new NotFoundException('Sessão não encontrada');
      await exigirLicitacaoAtiva(m, sessao.licitacao_id, { bloquear: true });

      const conteudo = await this.montarRetratoSessao(m, sessao);
      const hash = hashCanonico(conteudo);
      const snapshot = await m.save(
        m.create(AtaSessaoSnapshot, {
          sessao_id: sessaoId,
          licitacao_id: sessao.licitacao_id,
          motivo_ato: 'REINICIO_DISPUTA',
          justificativa: motivo,
          conteudo,
          hash_sha256: hash,
          ator_tipo: ator?.tipo ?? 'SISTEMA',
          ator_id: ator?.id ?? null,
        }),
      );

      const cancelados = await m
        .createQueryBuilder()
        .update(Lance)
        .set({
          cancelado: true,
          cancelado_em: new Date(),
          cancelado_por: 'REINICIO',
          cancelado_motivo: `Reinício da disputa (retrato ${snapshot.id}): ${motivo}`,
          solicitacao_cancelamento_pendente: false,
        })
        .where('licitacao_id = :lic AND cancelado = false', { lic: sessao.licitacao_id })
        .execute();

      const itens = await m.update(
        ItemLicitacao,
        { licitacao_id: sessao.licitacao_id },
        {
          status_disputa: StatusDisputaItem.AGUARDANDO,
          disputa_iniciada_em: null as any,
          disputa_encerrada_em: null as any,
          ultimo_lance_em: null as any,
          inicio_tempo_aleatorio: null as any,
          tempo_aleatorio_sorteado: null as any,
          melhor_lance_valor: null as any,
          melhor_lance_fornecedor_id: null as any,
        },
      );

      await m.update(SessaoDisputa, sessaoId, { status: StatusSessao.AGUARDANDO_INICIO, etapa: EtapaSessao.ANALISE_PROPOSTAS });
      await this.lotes.reiniciarLotes(m, sessao.licitacao_id);
      // Julgamento (E3) recomeça: convocações de aceitação canceladas, situações descartadas
      await reiniciarJulgamentoDaLicitacao(m, sessao.licitacao_id, motivo);
      const lancesCancelados = cancelados.affected || 0;
      const itensReiniciados = itens.affected || 0;
      await m.save(
        m.create(EventoSessao, {
          sessao_id: sessaoId,
          tipo: TipoEvento.SESSAO_RETOMADA,
          descricao:
            `Sessão reiniciada pelo pregoeiro. Justificativa: ${motivo}. ${lancesCancelados} lances cancelados (sem exclusão), ` +
            `${itensReiniciados} itens reiniciados. Retrato congelado ${snapshot.id} (SHA-256 ${hash}).`,
          dados_adicionais: { snapshot_id: snapshot.id, hash, lancesCancelados, itensReiniciados },
          usuario_nome: 'PREGOEIRO',
          is_sistema: false,
        }),
      );
      return { itensReiniciados, lancesCancelados, snapshotId: snapshot.id, hash };
    });
  }

  /** Conteúdo do retrato congelado: tudo o que a ata da etapa de lances precisa. */
  private async montarRetratoSessao(m: EntityManager, sessao: SessaoDisputa): Promise<Record<string, any>> {
    const itens = await m.query(
      `SELECT id, numero_item, quantidade, valor_unitario_estimado, status_disputa, disputa_iniciada_em,
              disputa_encerrada_em, melhor_lance_valor, melhor_lance_fornecedor_id
         FROM itens_licitacao WHERE licitacao_id = $1 ORDER BY numero_item`,
      [sessao.licitacao_id],
    );
    const lances = await m.query(
      `SELECT id, item_id, fornecedor_id, fornecedor_nome, valor, valor_unitario, valor_total, base_lance, origem,
              cancelado, cancelado_por, cancelado_motivo, created_at
         FROM lances WHERE licitacao_id = $1 ORDER BY created_at, id`,
      [sessao.licitacao_id],
    );
    const eventos = await m.query(
      `SELECT id, tipo, descricao, item_id, fornecedor_id, valor, usuario_nome, created_at
         FROM eventos_sessao WHERE sessao_id = $1 ORDER BY created_at, id`,
      [sessao.id],
    );
    const mapeamento = await m.query(
      `SELECT fornecedor_id, codigo_anonimo FROM mapeamento_anonimo WHERE sessao_id = $1 ORDER BY indice`,
      [sessao.id],
    );
    return {
      versao: 1,
      sessao: { id: sessao.id, licitacao_id: sessao.licitacao_id, status: sessao.status, etapa: sessao.etapa },
      itens,
      lances,
      eventos,
      mapeamento_anonimo: mapeamento,
    };
  }

  // ============================================================================
  // CONFIGURAÇÃO DA SESSÃO
  // ============================================================================

  async configurarSessao(
    sessaoId: string,
    config: {
      tempo_inatividade_minutos?: number;
      tempo_prorrogacao_minutos?: number;
      intervalo_minimo_lances_minutos?: number;
      tempo_aleatorio_min_minutos?: number;
      tempo_aleatorio_max_minutos?: number;
      chat_desabilitado?: boolean;
    },
  ): Promise<void> {
    const sessao = await this.sessaoRepo.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessão não encontrada');

    if (config.tempo_inatividade_minutos !== undefined && config.tempo_inatividade_minutos < 1) {
      throw new BadRequestException('Tempo de inatividade deve ser pelo menos 1 minuto');
    }
    if (config.tempo_prorrogacao_minutos !== undefined && config.tempo_prorrogacao_minutos < 1) {
      throw new BadRequestException('Tempo de prorrogação deve ser pelo menos 1 minuto');
    }
    if (config.intervalo_minimo_lances_minutos !== undefined && config.intervalo_minimo_lances_minutos < 0) {
      throw new BadRequestException('Intervalo mínimo entre lances não pode ser negativo');
    }

    await this.sessaoRepo.update(sessaoId, {
      ...(config.tempo_inatividade_minutos !== undefined && { tempo_inatividade_minutos: config.tempo_inatividade_minutos }),
      ...(config.tempo_prorrogacao_minutos !== undefined && { tempo_prorrogacao_minutos: config.tempo_prorrogacao_minutos }),
      ...(config.intervalo_minimo_lances_minutos !== undefined && { intervalo_minimo_lances_minutos: config.intervalo_minimo_lances_minutos }),
      ...(config.tempo_aleatorio_min_minutos !== undefined && { tempo_aleatorio_min_minutos: config.tempo_aleatorio_min_minutos }),
      ...(config.tempo_aleatorio_max_minutos !== undefined && { tempo_aleatorio_max_minutos: config.tempo_aleatorio_max_minutos }),
      ...(config.chat_desabilitado !== undefined && { chat_desabilitado: config.chat_desabilitado }),
    });

    await this.registrarEvento(sessaoId, TipoEvento.MENSAGEM_SISTEMA, 'Configurações da sessão atualizadas pelo pregoeiro');
  }

  async getConfiguracoesSessao(sessaoId: string) {
    const sessao = await this.sessaoRepo.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessão não encontrada');
    const p = await this.parametros.daSessao(sessaoId);
    return {
      tempo_inatividade_minutos: sessao.tempo_inatividade_minutos,
      tempo_prorrogacao_minutos: sessao.tempo_prorrogacao_minutos,
      intervalo_minimo_lances_minutos: sessao.intervalo_minimo_lances_minutos,
      tempo_aleatorio_min_minutos: sessao.tempo_aleatorio_min_minutos,
      tempo_aleatorio_max_minutos: sessao.tempo_aleatorio_max_minutos,
      chat_desabilitado: sessao.chat_desabilitado,
      modo_aberto: sessao.modo_aberto,
      modo_aberto_fechado: sessao.modo_aberto_fechado,
      disputa_por_item: sessao.disputa_por_item,
      // Efetivos (resolvedor): regras que não são da sessão
      cancelamento_direto_segundos: p.cancelamentoDiretoSegundos,
      percentual_reinicio_disputa: p.percentualReinicioDisputa,
      diferenca_minima_lances: p.diferencaMinima,
      base_lance: p.baseLance,
    };
  }

  // ============================================================================
  // LANCES E PROPOSTAS DO ITEM (leituras)
  // ============================================================================

  /**
   * Sessão do item e se as identidades devem ser escondidas nesta leitura:
   * sim para público/fornecedores até o fim da etapa de lances da licitação;
   * para o órgão, conforme o interruptor da sessão.
   */
  private async contextoLeituraItem(
    itemId: string,
    sessaoId: string | undefined,
    opts: OpcoesVisaoDisputa,
  ): Promise<{ sessaoId?: string; anonimizar: boolean; base: BaseLance; quantidade: number }> {
    const item = await this.itemRepo.findOne({ where: { id: itemId }, select: ['id', 'licitacao_id', 'quantidade'] });
    let sid = sessaoId;
    if (!sid && item) {
      const s = await this.sessaoRepo.findOne({ where: { licitacao_id: item.licitacao_id }, order: { created_at: 'DESC' }, select: ['id'] });
      sid = s?.id;
    }
    if (!item || !sid) return { sessaoId: sid, anonimizar: true, base: BaseLance.TOTAL_ITEM, quantidade: 1 };
    const params = await this.parametros.daSessao(sid);
    const anonimizar = opts.visaoOrgao
      ? await this.anonimizacaoService.isAnonimizacaoAtiva(sid)
      : !(await this.etapaDeLancesEncerrada(item.licitacao_id));
    return { sessaoId: sid, anonimizar, base: params.baseLance, quantidade: Number(item.quantidade) || 1 };
  }

  /**
   * Leitura de uma unidade LOTE: null = o id não é de lote; false = lote sem
   * sessão (sigilo: nada); senão o contexto (mesma regra de anonimização do item).
   */
  private async contextoLeituraLote(id: string, sessaoId: string | undefined, opts: OpcoesVisaoDisputa): Promise<ContextoLeituraLote | null | false> {
    const lote = await this.lotes.buscarLote(id);
    if (!lote) return null;
    const sid =
      sessaoId ??
      (await this.sessaoRepo.findOne({ where: { licitacao_id: lote.licitacao_id }, order: { created_at: 'DESC' }, select: ['id'] }))?.id;
    if (!sid) return false;
    const anonimizar = opts.visaoOrgao
      ? await this.anonimizacaoService.isAnonimizacaoAtiva(sid)
      : !(await this.etapaDeLancesEncerrada(lote.licitacao_id));
    return { sessaoId: sid, anonimizar, anonimo: (f: string) => this.anonimo(sid, f) };
  }

  private async anonimo(sessaoId: string, fornecedorId: string) {
    const codigo = await this.codigoAnonimoSeguro(sessaoId, fornecedorId);
    return { fornecedorId: idAnonimo(codigo), fornecedorNome: codigo };
  }

  /** Propostas iniciais do item (na base do lance). Sem sessão aberta: sigilo (nada). */
  async getPropostasIniciais(itemId: string, sessaoId?: string, opts: OpcoesVisaoDisputa = {}): Promise<any[]> {
    const lote = await this.contextoLeituraLote(itemId, sessaoId, opts);
    if (lote !== null) return lote ? this.lotes.propostasIniciais(itemId, lote) : [];
    const ctx = await this.contextoLeituraItem(itemId, sessaoId, opts);
    if (!ctx.sessaoId) return [];

    const itensProposta = await this.propostaItemRepo.find({
      where: { item_licitacao_id: itemId },
      relations: ['proposta', 'proposta.fornecedor'],
    });
    const linhas = itensProposta
      .map((ip) => ({ ip, valor: valorPropostaNaBase(ip, ctx.base, ctx.quantidade) }))
      .sort((a, b) => a.valor - b.valor);

    return Promise.all(
      linhas.map(async ({ ip, valor }, index) => {
        let fornecedorNome = ip.proposta?.fornecedor?.razao_social || `Fornecedor ${index + 1}`;
        let fornecedorId = ip.proposta?.fornecedor_id || '';
        if (ctx.anonimizar && fornecedorId) ({ fornecedorId, fornecedorNome } = await this.anonimo(ctx.sessaoId!, fornecedorId));
        return {
          posicao: index + 1,
          fornecedorId,
          fornecedorNome,
          valor,
          valorUnitario: Number(ip.valor_unitario),
          valorTotal: Number(ip.valor_total),
          marca: ip.marca,
          modelo: ip.modelo,
          dataEnvio: ip.proposta?.data_envio,
        };
      }),
    );
  }

  /** Ranking (melhor valor de cada fornecedor). */
  async getMelhoresValoresPorFornecedor(itemId: string, sessaoId?: string, opts: OpcoesVisaoDisputa = {}): Promise<any[]> {
    const lote = await this.contextoLeituraLote(itemId, sessaoId, opts);
    if (lote !== null) return lote ? this.lotes.melhoresPorFornecedor(itemId, lote) : [];
    const ctx = await this.contextoLeituraItem(itemId, sessaoId, opts);
    if (!ctx.sessaoId) return [];
    const ranking = await this.rankingDoItem(itemId);
    return Promise.all(
      ranking.map(async (r, index) => {
        let { fornecedorId, fornecedorNome } = r;
        if (ctx.anonimizar) ({ fornecedorId, fornecedorNome } = await this.anonimo(ctx.sessaoId!, r.fornecedorId));
        return { posicao: index + 1, fornecedorId, fornecedorNome, melhorValor: r.melhorValor, totalLances: r.totalLances };
      }),
    );
  }

  /** Todos os lances ativos do item (propostas convertidas incluídas, com a origem real). */
  async getTodosLances(itemId: string, sessaoId?: string, opts: OpcoesVisaoDisputa = {}): Promise<LanceRegistrado[]> {
    const lote = await this.contextoLeituraLote(itemId, sessaoId, opts);
    if (lote !== null) return lote ? this.lotes.lances(itemId, lote) : [];
    const ctx = await this.contextoLeituraItem(itemId, sessaoId, opts);
    if (!ctx.sessaoId) return [];

    const statusDoItem = (await this.itemRepo.findOne({ where: { id: itemId }, select: ['id', 'status_disputa'] }))?.status_disputa;
    const lances = (await this.lanceRepo.find({ where: { item_id: itemId, cancelado: false }, order: { created_at: 'DESC' } }))
      // Lance final fechado: sigiloso até o fim do prazo (IN 73 art. 24 §2º)
      .filter((l) => ModoDisputaService.lanceVisivel(l.origem, statusDoItem));
    const saida: LanceRegistrado[] = await Promise.all(
      lances.map(async (l) => {
        let fornecedorId = l.fornecedor_id || l.fornecedor_identificador || '';
        let fornecedorNome = l.fornecedor_nome || 'Fornecedor';
        if (ctx.anonimizar && fornecedorId) ({ fornecedorId, fornecedorNome } = await this.anonimo(ctx.sessaoId!, fornecedorId));
        return {
          id: l.id,
          valor: parseFloat(String(l.valor)),
          valorUnitario: l.valor_unitario != null ? Number(l.valor_unitario) : null,
          valorTotal: l.valor_total != null ? Number(l.valor_total) : null,
          fornecedorId,
          fornecedorNome,
          dataHora: l.created_at,
          origem: l.origem || OrigemLance.LANCE,
        };
      }),
    );
    if (saida.length) return saida;

    // Item ainda não aberto: as propostas (sem lances) — mesma forma
    const propostas = await this.getPropostasIniciais(itemId, ctx.sessaoId, opts);
    return propostas.map((p) => ({
      id: `proposta-${p.fornecedorId}`,
      valor: p.valor,
      valorUnitario: p.valorUnitario,
      valorTotal: p.valorTotal,
      fornecedorId: p.fornecedorId,
      fornecedorNome: p.fornecedorNome,
      dataHora: p.dataEnvio,
      origem: OrigemLance.PROPOSTA,
    }));
  }

  // ============================================================================
  // CHAT — um só armazenamento: eventos da sessão (MENSAGEM_*)
  // ============================================================================

  /** Só mensagens de chat (pregoeiro, fornecedores, sistema) — lances e atos ficam na trilha de eventos. */
  async getMensagens(sessaoId: string, limite: number = 50): Promise<MensagemChat[]> {
    const eventos = await this.eventoRepo.find({
      where: { sessao_id: sessaoId, tipo: In(TIPOS_CHAT) },
      order: { created_at: 'DESC' },
      take: limite,
    });
    return eventos.map((e) => ({
      id: e.id,
      tipo:
        e.tipo === TipoEvento.MENSAGEM_FORNECEDOR ? 'FORNECEDOR' : e.tipo === TipoEvento.MENSAGEM_PREGOEIRO ? 'PREGOEIRO' : 'SISTEMA',
      remetente: e.usuario_nome || 'SISTEMA',
      conteudo: e.descricao,
      dataHora: e.created_at,
    }));
  }

  /**
   * Mensagem no chat. Fornecedor só com o chat habilitado (`chat_desabilitado`
   * vale para os licitantes; o pregoeiro sempre fala). O registro guarda o nome
   * real (ata); a difusão aos não-donos usa o código anônimo.
   */
  async enviarMensagem(sessaoId: string, remetente: RemetenteChat, conteudo: string): Promise<EventoSessao> {
    const texto = typeof conteudo === 'string' ? conteudo.trim() : '';
    if (!texto) throw new BadRequestException('Mensagem vazia');
    const sessao = await this.sessaoRepo.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessão não encontrada');
    if (remetente.tipo === 'FORNECEDOR' && sessao.chat_desabilitado) {
      throw new ForbiddenException('O chat está desabilitado pelo pregoeiro.');
    }
    return this.eventoRepo.save(
      this.eventoRepo.create({
        sessao_id: sessaoId,
        tipo: remetente.tipo === 'FORNECEDOR' ? TipoEvento.MENSAGEM_FORNECEDOR : TipoEvento.MENSAGEM_PREGOEIRO,
        descricao: texto.slice(0, 2000),
        fornecedor_id: remetente.fornecedorId,
        usuario_id: remetente.usuarioId,
        usuario_nome: remetente.nome,
        is_sistema: false,
      }),
    );
  }

  /** Liga/desliga o chat dos licitantes. */
  async definirChat(sessaoId: string, habilitado: boolean): Promise<void> {
    await this.sessaoParaAto(sessaoId);
    await this.sessaoRepo.update(sessaoId, { chat_desabilitado: !habilitado });
    await this.registrarEvento(sessaoId, TipoEvento.MENSAGEM_SISTEMA, habilitado ? 'Chat habilitado pelo pregoeiro' : 'Chat desabilitado pelo pregoeiro');
  }

  // ============================================================================
  // DADOS PARA FORNECEDOR
  // ============================================================================

  async getItensParaFornecedor(sessaoId: string, fornecedorId: string): Promise<{ itens: any[]; sessao: any }> {
    const sessao = await this.getSessao(sessaoId);
    const { aguardando, emDisputa, encerrados } = await this.getItensPorStatus(sessaoId, fornecedorId);
    const itens = [...aguardando, ...emDisputa, ...encerrados].map((i) => ({
      ...i,
      meuMelhorLance: i.meuMelhorLance ?? null,
      minhaPosicao: i.minhaPosicao ?? null,
    }));
    return { itens, sessao };
  }

  // ============================================================================
  // CANCELAMENTO DE LANCE (IN 73 art. 21 §3º e §4º)
  // ============================================================================

  private async sincronizarUltimoLanceNoItem(m: EntityManager, itemId: string): Promise<void> {
    const ultimo = await m.findOne(Lance, {
      where: { item_id: itemId, cancelado: false, origem: OrigemLance.LANCE },
      order: { created_at: 'DESC' },
    });
    const item = await m.findOne(ItemLicitacao, { where: { id: itemId } });
    const melhor = await this.melhorLanceAtivo(m, itemId);
    await m.update(ItemLicitacao, itemId, {
      ultimo_lance_em: (ultimo?.created_at ?? item?.disputa_iniciada_em ?? null) as any,
      melhor_lance_valor: melhor ? melhor.valor : (null as any),
      melhor_lance_fornecedor_id: melhor ? melhor.fornecedor_id : (null as any),
    });
  }

  /**
   * Pode excluir direto? Só o ÚLTIMO lance do próprio fornecedor no item, uma
   * única vez por item, dentro do prazo do parâmetro (IN 73 art. 21 §3º).
   */
  private podeExcluirDireto(
    lance: Lance,
    ultimoProprioId: string | null,
    jaExcluiu: boolean,
    prazoSegundos: number,
    agora: number,
  ): { pode: boolean; segundosRestantes: number; motivo?: string } {
    // Regra pura comum a item e lote (unidade-disputa.ts)
    return podeExcluirLanceDireto(lance, ultimoProprioId, jaExcluiu, prazoSegundos, agora);
  }

  private async estadoExclusao(m: EntityManager, itemId: string, fornecedorId: string) {
    const ultimo = await m.findOne(Lance, {
      where: { item_id: itemId, fornecedor_id: fornecedorId, cancelado: false, origem: OrigemLance.LANCE },
      order: { created_at: 'DESC' },
    });
    const jaExcluiu = (await m.count(Lance, { where: { item_id: itemId, fornecedor_id: fornecedorId, cancelado_por: 'FORNECEDOR' } })) > 0;
    return { ultimoProprioId: ultimo?.id ?? null, jaExcluiu };
  }

  async listarLancesFornecedorParaCancelamentoV3(sessaoId: string, itemId: string, fornecedorId: string): Promise<LancePainelCancelamentoV3[]> {
    if (await this.lotes.ehLote(itemId)) {
      return this.lotes.listarMeusLances(sessaoId, itemId, fornecedorId, (await this.parametros.daSessao(sessaoId)).cancelamentoDiretoSegundos);
    }
    const sessao = await this.sessaoRepo.findOne({ where: { id: sessaoId } });
    if (!sessao) throw new NotFoundException('Sessão não encontrada');
    const item = await this.itemRepo.findOne({ where: { id: itemId } });
    if (!item || item.licitacao_id !== sessao.licitacao_id) throw new BadRequestException('Item inválido para esta sessão');

    const params = await this.parametros.daSessao(sessaoId);
    const lances = await this.lanceRepo.find({
      where: { item_id: itemId, fornecedor_id: fornecedorId, origem: OrigemLance.LANCE },
      order: { created_at: 'DESC' },
      take: 30,
    });
    const estado = await this.estadoExclusao(this.dataSource.manager, itemId, fornecedorId);
    const emDisputa = item.status_disputa === StatusDisputaItem.EM_DISPUTA;
    const agora = Date.now();

    return lances.map((l) => {
      const e = this.podeExcluirDireto(l, estado.ultimoProprioId, estado.jaExcluiu, params.cancelamentoDiretoSegundos, agora);
      const pode = emDisputa && !l.cancelado && !l.solicitacao_cancelamento_pendente && e.pode;
      return {
        id: l.id,
        valor: parseFloat(String(l.valor)),
        criadoEm: new Date(l.created_at).toISOString(),
        cancelado: l.cancelado,
        solicitacaoPendente: l.solicitacao_cancelamento_pendente,
        podeCancelarDireto: pode,
        segundosRestantesCancelamentoDireto: pode ? e.segundosRestantes : 0,
      };
    });
  }

  async listarSolicitacoesCancelamentoPendentesV3(sessaoId: string): Promise<SolicitacaoCancelamentoPendenteV3[]> {
    const sessao = await this.sessaoRepo.findOne({ where: { id: sessaoId } });
    if (!sessao) throw new NotFoundException('Sessão não encontrada');
    const pendentes = await this.lanceRepo.find({
      where: { licitacao_id: sessao.licitacao_id, solicitacao_cancelamento_pendente: true, cancelado: false },
      relations: ['item'],
      order: { solicitacao_cancelamento_em: 'ASC' },
    });
    return pendentes.map((l) => ({
      lanceId: l.id,
      itemId: l.item_id ?? (l.lote_id as string),
      itemNumero: l.item?.numero_item ?? 0,
      fornecedorId: l.fornecedor_id || '',
      fornecedorNome: l.fornecedor_nome || 'Fornecedor',
      valor: parseFloat(String(l.valor)),
      motivo: l.solicitacao_cancelamento_motivo ?? null,
      solicitadoEm: l.solicitacao_cancelamento_em ? new Date(l.solicitacao_cancelamento_em).toISOString() : '',
    }));
  }

  /** Trava o item e confere sessão/item/lance para os atos de cancelamento. */
  private async prepararCancelamento(m: EntityManager, sessaoId: string, itemId: string, lanceId: string) {
    const sessao = await m.findOne(SessaoDisputa, { where: { id: sessaoId } });
    if (!sessao) throw new NotFoundException('Sessão não encontrada');
    await exigirLicitacaoAtiva(m, sessao.licitacao_id, { bloquear: true });
    const item = await this.travarItem(m, itemId);
    if (!item || item.licitacao_id !== sessao.licitacao_id) throw new BadRequestException('Item inválido para esta sessão');
    if (item.status_disputa !== StatusDisputaItem.EM_DISPUTA) throw new BadRequestException('Item não está em disputa');
    const lance = await m.findOne(Lance, { where: { id: lanceId } });
    if (!lance || lance.item_id !== itemId) throw new NotFoundException('Lance não encontrado');
    if (lance.cancelado) throw new BadRequestException('Lance já está cancelado');
    return { sessao, item, lance };
  }

  async cancelarLanceFornecedorImediatoV3(sessaoId: string, itemId: string, lanceId: string, fornecedorId: string): Promise<{ ok: true }> {
    if (await this.lotes.ehLote(itemId)) {
      const p = await this.parametros.daSessao(sessaoId);
      await this.lotes.cancelarProprio(sessaoId, itemId, lanceId, fornecedorId, p.cancelamentoDiretoSegundos);
      await this.registrarEvento(
        sessaoId,
        TipoEvento.LANCE_CANCELADO,
        `Lance de lote excluído pelo próprio fornecedor (até ${p.cancelamentoDiretoSegundos}s — IN 73 art. 21 §3º)`,
        undefined,
        fornecedorId,
      );
      return { ok: true };
    }
    const params = await this.parametros.daSessao(sessaoId);
    await this.dataSource.transaction(async (m) => {
      const { lance } = await this.prepararCancelamento(m, sessaoId, itemId, lanceId);
      if (lance.fornecedor_id !== fornecedorId) throw new ForbiddenException('Este lance não pertence ao fornecedor');
      if (lance.solicitacao_cancelamento_pendente) {
        throw new BadRequestException('Já existe solicitação de cancelamento pendente para este lance');
      }
      const estado = await this.estadoExclusao(m, itemId, fornecedorId);
      const e = this.podeExcluirDireto(lance, estado.ultimoProprioId, estado.jaExcluiu, params.cancelamentoDiretoSegundos, Date.now());
      if (!e.pode) throw new BadRequestException(e.motivo);

      await m.update(Lance, lance.id, {
        cancelado: true,
        cancelado_em: new Date(),
        cancelado_por: 'FORNECEDOR',
        cancelado_motivo: 'Exclusão do próprio último lance (IN 73 art. 21 §3º)',
      });
      await this.sincronizarUltimoLanceNoItem(m, itemId);
    });

    await this.registrarEvento(
      sessaoId,
      TipoEvento.LANCE_CANCELADO,
      `Lance excluído pelo próprio fornecedor (até ${params.cancelamentoDiretoSegundos}s — IN 73 art. 21 §3º)`,
      itemId,
      fornecedorId,
    );
    return { ok: true };
  }

  async solicitarCancelamentoLanceV3(
    sessaoId: string,
    itemId: string,
    lanceId: string,
    fornecedorId: string,
    motivo?: string,
  ): Promise<{ ok: true }> {
    if (await this.lotes.ehLote(itemId)) {
      const p = await this.parametros.daSessao(sessaoId);
      await this.lotes.solicitarCancelamento(sessaoId, itemId, lanceId, fornecedorId, p.cancelamentoDiretoSegundos, motivo);
      await this.registrarEvento(
        sessaoId,
        TipoEvento.MENSAGEM_SISTEMA,
        `Fornecedor solicitou cancelamento de lance de lote (aguardando pregoeiro). Motivo: ${motivo?.trim() || 'não informado'}`,
        undefined,
        fornecedorId,
      );
      return { ok: true };
    }
    const params = await this.parametros.daSessao(sessaoId);
    await this.dataSource.transaction(async (m) => {
      const { lance } = await this.prepararCancelamento(m, sessaoId, itemId, lanceId);
      if (lance.fornecedor_id !== fornecedorId) throw new ForbiddenException('Este lance não pertence ao fornecedor');
      if (lance.solicitacao_cancelamento_pendente) throw new BadRequestException('Solicitação de cancelamento já registrada');
      const estado = await this.estadoExclusao(m, itemId, fornecedorId);
      if (this.podeExcluirDireto(lance, estado.ultimoProprioId, estado.jaExcluiu, params.cancelamentoDiretoSegundos, Date.now()).pode) {
        throw new BadRequestException(`Ainda dentro do prazo de ${params.cancelamentoDiretoSegundos} segundos: use a exclusão direta.`);
      }
      await m.update(Lance, lance.id, {
        solicitacao_cancelamento_pendente: true,
        solicitacao_cancelamento_em: new Date(),
        solicitacao_cancelamento_motivo: motivo?.trim() || null,
      });
    });

    await this.registrarEvento(
      sessaoId,
      TipoEvento.MENSAGEM_SISTEMA,
      `Fornecedor solicitou cancelamento de lance (aguardando pregoeiro). Motivo: ${motivo?.trim() || 'não informado'}`,
      itemId,
      fornecedorId,
    );
    return { ok: true };
  }

  /** IN 73 art. 21 §4º: exclusão excepcional pelo agente de contratação, com motivo. */
  async pregoeiroCancelarLanceV3(sessaoId: string, itemId: string, lanceId: string, orgaoId: string, justificativa: string): Promise<{ ok: true }> {
    const j = justificativa?.trim();
    if (!j) throw new BadRequestException('Justificativa é obrigatória');
    if (await this.lotes.ehLote(itemId)) {
      await this.lotes.pregoeiroCancelar(sessaoId, itemId, lanceId, orgaoId, j);
      await this.registrarEvento(sessaoId, TipoEvento.LANCE_CANCELADO, `Lance de lote cancelado pelo pregoeiro/órgão. ${j}`, undefined, undefined, 'PREGOEIRO');
      return { ok: true };
    }

    await this.dataSource.transaction(async (m) => {
      const { sessao, lance } = await this.prepararCancelamento(m, sessaoId, itemId, lanceId);
      const licitacao = await m.findOne(Licitacao, { where: { id: sessao.licitacao_id } });
      if (!licitacao || licitacao.orgao_id !== orgaoId) {
        throw new ForbiddenException('Apenas o órgão da licitação pode cancelar lances');
      }
      await m.update(Lance, lance.id, {
        cancelado: true,
        cancelado_em: new Date(),
        cancelado_por: 'PREGOEIRO',
        cancelado_motivo: j,
        solicitacao_cancelamento_pendente: false,
      });
      await this.sincronizarUltimoLanceNoItem(m, itemId);
    });

    await this.registrarEvento(sessaoId, TipoEvento.LANCE_CANCELADO, `Lance cancelado pelo pregoeiro/órgão. ${j}`, itemId, undefined, 'PREGOEIRO');
    return { ok: true };
  }

  // ============================================================================
  // UTILITÁRIOS
  // ============================================================================

  private async registrarEvento(
    sessaoId: string,
    tipo: TipoEvento,
    descricao: string,
    itemId?: string,
    fornecedorId?: string,
    usuario?: string,
  ): Promise<void> {
    await this.eventoRepo.save(
      this.eventoRepo.create({
        sessao_id: sessaoId,
        tipo,
        descricao,
        item_id: itemId,
        fornecedor_id: fornecedorId,
        usuario_nome: usuario || 'SISTEMA',
        is_sistema: !usuario || usuario === 'SISTEMA',
      }),
    );
  }
}

/** SHA-256 do JSON canônico (chaves ordenadas). */
export function hashCanonico(valor: unknown): string {
  const canonico = (v: any): any => {
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(canonico);
    if (v && typeof v === 'object') {
      return Object.keys(v)
        .sort()
        .reduce((o: any, k) => ((o[k] = canonico(v[k])), o), {});
    }
    return v;
  };
  return createHash('sha256').update(JSON.stringify(canonico(valor))).digest('hex');
}

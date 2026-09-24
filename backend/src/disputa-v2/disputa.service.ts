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
  valoresDoLance,
  valorPropostaNaBase,
} from './modelo-lance';
import { calcularRelogio } from './relogio-disputa';
import { idAnonimo } from './sigilo-disputa.service';
import { TransicoesService } from '../licitacoes/transicoes/transicoes.service';
import { AtoLicitacao, AtorTransicao } from '../licitacoes/transicoes/transicoes.tipos';
import { exigirLicitacaoAtiva, licitacaoEstaAtiva } from '../sessao/licitacao-ativa';
import { pedirEncerramentoDisputa } from '../sessao/transicoes-sessao';

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
 * JANELA_DISPENSA), `BaseLance.TOTAL_LOTE` (hoje 409), status TEMPO_ALEATORIO
 * no relógio, `validarLance` por origem.
 * ============================================================================
 */

export interface ItemDisputa {
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
  itemId: string;
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
  origem: OrigemLance;
  created_at: Date;
}

@Injectable()
export class DisputaService {
  private readonly logger = new Logger(DisputaService.name);

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
   * etapa de lances (→ NEGOCIACAO) e a licitação vai a julgamento
   * (ENCERRAR_DISPUTA). Idempotente.
   */
  private async concluirEtapaDeLancesSeTerminou(sessaoId: string, licitacaoId: string, ator: AtorTransicao): Promise<boolean> {
    if (!(await this.etapaDeLancesEncerrada(licitacaoId))) return false;

    const r = await this.sessaoRepo
      .createQueryBuilder()
      .update(SessaoDisputa)
      .set({ status: StatusSessao.EM_ANDAMENTO, etapa: EtapaSessao.NEGOCIACAO })
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
      modoDisputa: sessao.modo_aberto ? 'ABERTO' : 'FECHADO',
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

    const ativos: Array<{ item_id: string; fornecedor_id: string | null; fornecedor_identificador: string | null; fornecedor_nome: string | null; valor: string; created_at: Date }> =
      await m.query(
        `SELECT item_id, fornecedor_id, fornecedor_identificador, fornecedor_nome, valor, created_at
           FROM lances WHERE licitacao_id = $1 AND cancelado = false
          ORDER BY valor ASC, created_at ASC`,
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
    return m.findOne(Lance, {
      where: { item_id: itemId, cancelado: false },
      order: { valor: 'ASC', created_at: 'ASC' },
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
    const rows: any[] = await m.query(
      `WITH ativos AS (
         SELECT l.*, COUNT(*) OVER (PARTITION BY l.fornecedor_id) AS total
           FROM lances l
          WHERE l.item_id = $1 AND l.cancelado = false AND l.fornecedor_id IS NOT NULL
       )
       SELECT DISTINCT ON (a.fornecedor_id)
              a.fornecedor_id, COALESCE(f.razao_social, a.fornecedor_nome) AS nome,
              a.valor, a.created_at, a.total
         FROM ativos a LEFT JOIN fornecedores f ON f.id::text = a.fornecedor_id
        ORDER BY a.fornecedor_id, a.valor ASC, a.created_at ASC`,
      [itemId],
    );
    return rows
      .map((r) => ({
        fornecedorId: String(r.fornecedor_id),
        fornecedorNome: r.nome || 'Fornecedor',
        melhorValor: parseFloat(r.valor),
        registradoEm: new Date(r.created_at),
        totalLances: Number(r.total),
      }))
      .sort((a, b) => a.melhorValor - b.melhorValor || a.registradoEm.getTime() - b.registradoEm.getTime());
  }

  // ============================================================================
  // INICIAR DISPUTA DE ITENS
  // ============================================================================

  /**
   * Inicia a disputa de um ou mais itens (converte as propostas em lances de
   * origem PROPOSTA e atribui os códigos anônimos da sessão).
   */
  async iniciarDisputa(sessaoId: string, itensIds: string[], ator: AtorTransicao): Promise<{ itensIniciados: number }> {
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
    if (params.baseLance === BaseLance.TOTAL_LOTE) {
      throw new ConflictException('Esta licitação disputa por LOTE — disponível na disputa por lote (motor de lote, próxima etapa).');
    }

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
   */
  async registrarLance(cmd: ComandoLance): Promise<Lance> {
    const origem = cmd.origem ?? OrigemLance.LANCE;
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
        // E1: licitação ATIVA (FOR SHARE: um SUSPENDER concorrente espera este lance)
        await exigirLicitacaoAtiva(m, sessao.licitacao_id, { bloquear: true });

        const params = await this.parametros.daSessao(cmd.sessaoId, m);
        if (params.baseLance === BaseLance.TOTAL_LOTE) {
          throw new ConflictException('Lance por lote: disponível na disputa por lote (motor de lote, próxima etapa).');
        }
        const quantidade = Number(item.quantidade) || 1;
        const propostaItem = await this.propostaDoFornecedorNoItem(m, item.id, cmd.fornecedorId);

        const ativos: LinhaLanceAtivo[] = await m.query(
          `SELECT id, fornecedor_id, valor, origem, created_at FROM lances
            WHERE item_id = $1 AND cancelado = false
            ORDER BY valor ASC, created_at ASC`,
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
          statusItem: item.status_disputa,
          sessaoSuspensa: sessao.status === StatusSessao.SUSPENSA,
          propostaNaBase: propostaItem ? valorPropostaNaBase(propostaItem, params.baseLance, quantidade) : null,
          meuUltimo: meus[0]
            ? { valor: parseFloat(meus[0].valor), origem: meus[0].origem, criadoEm: new Date(meus[0].created_at) }
            : null,
          melhor: melhor ? { valor: parseFloat(melhor.valor), fornecedorId: melhor.fornecedor_id } : null,
          valoresDeOutros: ativos.filter((l) => l.fornecedor_id !== cmd.fornecedorId).map((l) => parseFloat(l.valor)),
          diferencaMinima: params.diferencaMinima,
          intervaloProprioSegundos: params.intervaloProprioSegundos,
          agora,
        });

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

        const novoMelhor = !melhor || valor < parseFloat(melhor.valor);
        await m.update(ItemLicitacao, item.id, {
          ...(origem === OrigemLance.LANCE ? { ultimo_lance_em: agora } : {}),
          ...(novoMelhor ? { melhor_lance_valor: valor, melhor_lance_fornecedor_id: cmd.fornecedorId } : {}),
        });

        await m.save(
          m.create(EventoSessao, {
            sessao_id: cmd.sessaoId,
            tipo: origem === OrigemLance.DESEMPATE_MPE ? TipoEvento.LANCE_MPE_REGISTRADO : TipoEvento.LANCE_REGISTRADO,
            descricao:
              origem === OrigemLance.DESEMPATE_MPE
                ? `ME/EPP exerceu o direito de preferência com lance de R$ ${valor.toFixed(2)} no Item ${item.numero_item} (LC 123, art. 45)`
                : `Lance de R$ ${valor.toFixed(2)} registrado no Item ${item.numero_item}`,
            item_id: item.id,
            fornecedor_id: cmd.fornecedorId,
            lance_id: lance.id,
            valor,
            dados_adicionais: { origem, base_lance: params.baseLance },
            usuario_nome: 'SISTEMA',
            is_sistema: true,
          }),
        );
        return lance;
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

    const etapaDeLancesEncerrada = await this.concluirEtapaDeLancesSeTerminou(sessaoId, sessao.licitacao_id, ator);
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
   * Lei 14.133 art. 56 §4º: definida a melhor proposta, se a diferença para a
   * 2ª colocada for de pelo menos X% (parâmetro, padrão 5), a Administração
   * poderá admitir o reinício da disputa aberta para as demais colocações.
   */
  async avaliarReinicio(sessaoId: string, item: Pick<ItemLicitacao, 'id' | 'numero_item'>): Promise<AlertaReinicio | null> {
    const params = await this.parametros.daSessao(sessaoId);
    const ranking = await this.rankingDoItem(item.id);
    if (ranking.length < 2 || !(params.percentualReinicioDisputa > 0)) return null;
    const [p, s] = ranking;
    const diferencaPercentual = ((s.melhorValor - p.melhorValor) / p.melhorValor) * 100;
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

  private async anonimo(sessaoId: string, fornecedorId: string) {
    const codigo = await this.codigoAnonimoSeguro(sessaoId, fornecedorId);
    return { fornecedorId: idAnonimo(codigo), fornecedorNome: codigo };
  }

  /** Propostas iniciais do item (na base do lance). Sem sessão aberta: sigilo (nada). */
  async getPropostasIniciais(itemId: string, sessaoId?: string, opts: OpcoesVisaoDisputa = {}): Promise<any[]> {
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
    const ctx = await this.contextoLeituraItem(itemId, sessaoId, opts);
    if (!ctx.sessaoId) return [];

    const lances = await this.lanceRepo.find({ where: { item_id: itemId, cancelado: false }, order: { created_at: 'DESC' } });
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
    const restante = Math.max(0, Math.floor((new Date(lance.created_at).getTime() + prazoSegundos * 1000 - agora) / 1000));
    if (lance.origem !== OrigemLance.LANCE) return { pode: false, segundosRestantes: 0, motivo: 'Só lances da etapa aberta podem ser excluídos' };
    if (lance.id !== ultimoProprioId) return { pode: false, segundosRestantes: 0, motivo: 'Só o seu último lance pode ser excluído (IN 73 art. 21 §3º)' };
    if (jaExcluiu) return { pode: false, segundosRestantes: 0, motivo: 'A exclusão do próprio lance só pode ser feita uma única vez (IN 73 art. 21 §3º)' };
    if (restante <= 0) return { pode: false, segundosRestantes: 0, motivo: `Prazo de ${prazoSegundos} segundos para exclusão direta expirou. Solicite ao pregoeiro.` };
    return { pode: true, segundosRestantes: restante };
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
      itemId: l.item_id,
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

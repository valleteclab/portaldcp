import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { EtapaSessao } from '../../sessao/entities/sessao-disputa.entity';
import { EventoSessao, TipoEvento } from '../../sessao/entities/evento-sessao.entity';
import { DisputaService } from '../../disputa/disputa.service';
import { DisputaGateway, salaFornecedor, salaOrgao } from '../../disputa/disputa.gateway';
import { OrigemLance } from '../../disputa/modelo-lance';
import { ParametrosLicitacaoService } from '../../parametros-licitacao/parametros-licitacao.service';
import { AtorTransicao, atorSistema } from '../../licitacoes/transicoes/transicoes.tipos';
import { exigirLicitacaoAtiva } from '../../sessao/licitacao-ativa';
import { AceitacaoService } from '../aceitacao.service';
import { RankingService, UnidadeJulgamento } from '../ranking.service';
import { SituacaoLicitante, ehExcluida } from '../regras-julgamento';
import { DesempateMpe } from './entities/desempate-mpe.entity';
import { ConvocacaoDesempateMpe } from './entities/convocacao-desempate-mpe.entity';
import { beneficioDaUnidadeSql, conferenciaArt48Sql, fornecedoresMpeDaLicitacao } from './beneficio-mpe.sql';
import {
  CHAVE_LIMITE_EXCLUSIVO_MPE,
  LIMITE_EXCLUSIVO_MPE,
  PRAZO_DESEMPATE_MPE_MINUTOS,
  ResultadoAnalise,
  StatusConvocacaoMpe,
  StatusDesempateMpe,
  analisarEmpateFicto,
  estadoDoPrazoMpe,
  tempoSuspenso,
  MarcoSuspensao,
  ehPorteMpe,
  motivoExclusivoAcimaDoLimite,
  pendenciasPublicacaoArt48,
  JUSTIFICATIVA_ART49_MINIMO,
  motivoNaoExerce,
  motivoPercentualCotaInvalido,
  percentualEmpateFicto,
  prazoConvocacaoAte,
  quantidadeDaCota,
} from './regras-me-epp';

const brl = (v: number) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;
const hora = (d: Date) =>
  new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const rotulo = (u: Pick<UnidadeJulgamento, 'tipo' | 'numero'>) => `${u.tipo === 'LOTE' ? 'Lote' : 'Item'} ${u.numero}`;

const SUSPENSA =
  'A sessão/licitação está suspensa: o prazo do desempate ME/EPP está PAUSADO e volta a correr na retomada — nenhum ato até lá.';

/** Fases a partir das quais a estrutura da licitação (itens/lotes) não muda mais. */
const FASES_SEM_COTA = ['EM_DISPUTA', 'JULGAMENTO', 'HABILITACAO', 'RECURSO', 'ADJUDICACAO', 'HOMOLOGACAO', 'CONCLUIDO'];

/** Notificação a difundir DEPOIS do commit (nunca antes do ato estar gravado). */
interface Aviso {
  sessaoId: string | null;
  fornecedorId?: string;
  evento: string;
  payload: Record<string, any>;
  publico?: Record<string, any>;
}

/**
 * ============================================================================
 * BENEFÍCIO ME/EPP (plano E3 item 3 — LC 123/2006 arts. 44–48; Lei 14.133
 * art. 4º)
 * ============================================================================
 *
 * Etapa BENEFICIO_MPE de cada UNIDADE (item ou lote), entre a etapa de lances
 * e a aceitação:
 *   lances encerrados → [EMPATE FICTO: ME/EPP convocada, 5 min] → aceitação
 *
 *  - o motor chama `aposEncerrarUnidade` (gancho `GanchoBeneficioMpe`): o
 *    empate ficto é apurado com o RANKING ÚNICO (arts. 44/45 — regras puras em
 *    `regras-me-epp.ts`) e a melhor ME/EPP do intervalo é convocada
 *    automaticamente (situação CONVOCADO_DESEMPATE);
 *  - a ME/EPP responde SOZINHA, pelo token: oferta estritamente inferior à
 *    melhor (lance DESEMPATE_MPE no motor → passa a 1ª) ou declina; prazo
 *    vencido (cron a cada 5 s + verificação nas leituras) = precluso; a
 *    seguinte do intervalo é convocada, na ordem (iguais: sorteio auditável);
 *  - a ACEITAÇÃO da unidade fica bloqueada enquanto o desempate estiver em
 *    curso (`registrarGanchoAntesDaConvocacao`);
 *  - art. 48: exclusivo (I) e cota reservada (III) — a cota é uma unidade
 *    própria gerada pela ação `gerarCotas` (item/lote clonado com a
 *    quantidade da cota); a participação é barrada na proposta e no lance.
 * Cada ato vira evento da sessão (ata), sem identificar o licitante na
 * descrição (as leituras públicas anonimizam os ids).
 */
@Injectable()
export class MeEppService implements OnModuleInit {
  private readonly logger = new Logger(MeEppService.name);
  private processando = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ranking: RankingService,
    private readonly aceitacao: AceitacaoService,
    private readonly disputa: DisputaService,
    private readonly gateway: DisputaGateway,
    private readonly parametros: ParametrosLicitacaoService,
  ) {}

  onModuleInit(): void {
    this.disputa.registrarGanchoBeneficioMpe({
      aposEncerrarUnidade: async (p) => {
        await this.aposEncerrarUnidade(p.sessaoId, p.unidadeId);
      },
      temDesempatePendente: (licitacaoId) => this.temDesempatePendente(licitacaoId),
    });
    this.aceitacao.registrarGanchoAntesDaConvocacao((ctx) => this.ganchoAntesDaAceitacao(ctx));
  }

  // ==========================================================================
  // APURAÇÃO DO EMPATE FICTO (fim da etapa de lances da unidade)
  // ==========================================================================

  private async evento(
    m: EntityManager,
    e: { sessaoId: string | null; tipo: TipoEvento; descricao: string; u: Pick<UnidadeJulgamento, 'tipo' | 'id'>; fornecedorId?: string | null; valor?: number | null; dados?: Record<string, any>; usuario?: string; sistema?: boolean },
  ): Promise<void> {
    if (!e.sessaoId) return;
    await m.save(
      m.create(EventoSessao, {
        sessao_id: e.sessaoId,
        tipo: e.tipo,
        descricao: e.descricao,
        item_id: e.u.tipo === 'ITEM' ? e.u.id : undefined,
        fornecedor_id: e.fornecedorId ?? undefined,
        fornecedor_identificador: e.fornecedorId ?? undefined,
        valor: e.valor ?? undefined,
        usuario_nome: e.usuario ?? 'SISTEMA',
        is_sistema: e.sistema ?? true,
        dados_adicionais: { ...(e.dados ?? {}), unidade_id: e.u.id, tipo_unidade: e.u.tipo, lc123: true },
      }),
    );
  }

  private async sessaoDaLicitacao(m: EntityManager, licitacaoId: string): Promise<string | null> {
    const [s] = await m.query(`SELECT id FROM sessoes_disputa WHERE licitacao_id = $1 ORDER BY created_at DESC LIMIT 1`, [licitacaoId]);
    return s?.id ?? null;
  }

  /** Instante do encerramento da unidade (entrada pública do sorteio do art. 45 III). */
  private async encerradaEm(m: EntityManager, u: UnidadeJulgamento): Promise<Date> {
    const tabela = u.tipo === 'LOTE' ? 'lotes_licitacao' : 'itens_licitacao';
    const [r] = await m.query(`SELECT disputa_encerrada_em FROM ${tabela} WHERE id = $1`, [u.id]);
    return r?.disputa_encerrada_em ? new Date(r.disputa_encerrada_em) : new Date(0);
  }

  private async prazoMinutos(m: EntityManager, licitacaoId: string): Promise<number> {
    const [l] = await m.query(`SELECT orgao_id FROM licitacoes WHERE id = $1`, [licitacaoId]);
    const p: any = await this.parametros.resolver(l?.orgao_id).catch(() => null);
    const v = Number(p?.prazo_desempate_mpe_minutos);
    return Number.isFinite(v) && v > 0 ? v : PRAZO_DESEMPATE_MPE_MINUTOS;
  }

  /** Análise do empate ficto da unidade (sem gravar). */
  async analisar(m: EntityManager, u: UnidadeJulgamento): Promise<ResultadoAnalise> {
    const [lic] = await m.query(`SELECT modalidade::text AS modalidade, orgao_id FROM licitacoes WHERE id = $1`, [u.licitacaoId]);
    const params: any = await this.parametros.resolver(lic?.orgao_id).catch(() => null);
    const ranking = await this.ranking.ranking(u, m);
    const beneficio = await beneficioDaUnidadeSql(m, u.id);
    return analisarEmpateFicto({
      ranking: ranking.map((e) => ({ fornecedorId: e.fornecedorId, valor: e.melhorValor, posicao: e.posicao ?? 0, excluido: e.excluido })),
      mpe: await fornecedoresMpeDaLicitacao(m, u.licitacaoId),
      percentual: percentualEmpateFicto(lic?.modalidade, params),
      direcao: await this.ranking.direcao(u.licitacaoId, m),
      modalidade: lic?.modalidade,
      beneficio: beneficio?.beneficio ?? { empateFicto: true, somenteMpe: false },
      sorteio: { licitacaoId: u.licitacaoId, unidadeId: u.id, atoEm: await this.encerradaEm(m, u) },
    });
  }

  /** Grava o resultado da análise (NAO_APLICAVEL, ou EM_CURSO + 1ª convocação). */
  private async gravarAnalise(
    m: EntityManager,
    sessaoId: string | null,
    u: UnidadeJulgamento,
    r: ResultadoAnalise,
    avisos: Aviso[],
  ): Promise<DesempateMpe> {
    if (!r.aplica) {
      return m.save(
        m.create(DesempateMpe, {
          licitacao_id: u.licitacaoId,
          sessao_id: sessaoId,
          tipo_unidade: u.tipo,
          unidade_id: u.id,
          status: StatusDesempateMpe.NAO_APLICAVEL,
          motivo: r.motivo,
          melhor_fornecedor_id: r.melhor?.fornecedorId ?? null,
          melhor_valor: r.melhor?.valor ?? null,
          concluido_em: new Date(),
        }),
      );
    }
    const prazo = await this.prazoMinutos(m, u.licitacaoId);
    const d = await m.save(
      m.create(DesempateMpe, {
        licitacao_id: u.licitacaoId,
        sessao_id: sessaoId,
        tipo_unidade: u.tipo,
        unidade_id: u.id,
        status: StatusDesempateMpe.EM_CURSO,
        percentual: r.percentual,
        melhor_fornecedor_id: r.melhor.fornecedorId,
        melhor_valor: r.melhor.valor,
        limite_valor: r.limite,
        candidatos: r.candidatos,
        sorteio: r.sorteio as any,
        prazo_minutos: prazo,
      }),
    );
    await this.evento(m, {
      sessaoId,
      tipo: TipoEvento.EMPATE_FICTO_DETECTADO,
      u,
      descricao:
        `${rotulo(u)}: EMPATE FICTO (LC 123/2006, art. 44) — ${r.candidatos.length} ME/EPP com oferta até ${r.percentual}% acima da melhor ` +
        `(${brl(r.melhor.valor)}; limite ${brl(r.limite)}). As ME/EPP serão convocadas, na ordem de classificação, a apresentar oferta ` +
        `inferior à melhor em ${prazo} minuto(s) (art. 45, I, II e §3º).` +
        (r.sorteio
          ? ` Ofertas iguais entre ME/EPP ordenadas por sorteio (art. 45, III) — algoritmo ${r.sorteio.grupos[0].algoritmo}, ` +
            `semente(s) ${r.sorteio.grupos.map((g) => g.semente.slice(0, 16)).join(', ')}….`
          : ''),
      valor: r.melhor.valor,
      dados: { desempate_id: d.id, percentual: r.percentual, limite: r.limite, candidatos: r.candidatos.length, sorteio: r.sorteio },
    });
    await this.convocarProxima(m, d, u, avisos);
    return d;
  }

  /**
   * Gancho do motor: a unidade acabou de encerrar a etapa de lances. Apura o
   * empate ficto (idempotente: uma apuração por unidade) e convoca.
   */
  async aposEncerrarUnidade(sessaoId: string | null, unidadeId: string): Promise<DesempateMpe | null> {
    const avisos: Aviso[] = [];
    const d = await this.dataSource.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`mpe:${unidadeId}`]);
      const existente = await m.findOne(DesempateMpe, { where: { unidade_id: unidadeId } });
      if (existente) return existente;
      const u = await this.ranking.unidade(unidadeId, m);
      if (!u || !u.encerrada) return null;
      const sessao = sessaoId ?? (await this.sessaoDaLicitacao(m, u.licitacaoId));
      const r = await this.analisar(m, u);
      const gravado = await this.gravarAnalise(m, sessao, u, r, avisos);
      if (gravado.status === StatusDesempateMpe.EM_CURSO && sessao) {
        // Desempate apurado depois do fim da etapa de lances (dado legado): a sala volta ao benefício
        await m.query(`UPDATE sessoes_disputa SET etapa = $2 WHERE id = $1 AND etapa::text = $3`, [
          sessao,
          EtapaSessao.BENEFICIO_MPE,
          EtapaSessao.ACEITACAO_PROPOSTA,
        ]);
      }
      return gravado;
    });
    this.difundir(avisos);
    return d;
  }

  async temDesempatePendente(licitacaoId: string, manager?: EntityManager): Promise<boolean> {
    const n = await (manager ?? this.dataSource.manager).count(DesempateMpe, {
      where: { licitacao_id: licitacaoId, status: StatusDesempateMpe.EM_CURSO },
    });
    return n > 0;
  }

  /**
   * GANCHO da aceitação (IN 73 art. 29 × LC 123 art. 45): não se convoca a
   * aceitação enquanto o desempate ME/EPP da unidade estiver em curso. Unidade
   * sem apuração (dado anterior à E3): apura agora — sem empate, segue; com
   * empate, a ME/EPP é convocada e a aceitação espera.
   */
  private async ganchoAntesDaAceitacao(ctx: { unidade: UnidadeJulgamento; manager: EntityManager; sessaoId: string }): Promise<string | null> {
    const m = ctx.manager;
    const u = ctx.unidade;
    const d = await m.findOne(DesempateMpe, { where: { unidade_id: u.id } });
    const pendente = `${rotulo(u)}: desempate ME/EPP em curso (LC 123/2006, art. 45) — a aceitação aguarda a resposta da ME/EPP convocada ou o fim do prazo.`;
    if (d) return d.status === StatusDesempateMpe.EM_CURSO ? pendente : null;
    if (!u.encerrada) return null;
    const r = await this.analisar(m, u);
    if (!r.aplica) {
      await this.gravarAnalise(m, ctx.sessaoId, u, r, []);
      return null;
    }
    // Empate ficto: a apuração é gravada FORA desta transação (que será desfeita pela recusa)
    setTimeout(() => {
      this.aposEncerrarUnidade(ctx.sessaoId, u.id).catch((e) => this.logger.error(`Desempate ME/EPP de ${u.id}: ${e?.message ?? e}`));
    }, 50);
    return `${rotulo(u)}: há empate ficto com ME/EPP (LC 123/2006, art. 44) — a ME/EPP está sendo convocada; a aceitação aguarda o desempate.`;
  }

  // ==========================================================================
  // CONVOCAÇÃO, RESPOSTA E PRAZO
  // ==========================================================================

  /**
   * Convoca a próxima ME/EPP da fila (art. 45 II) — ou encerra o desempate
   * sem exercício (mantida a melhor oferta original). Mesma transação do ato.
   */
  private async convocarProxima(m: EntityManager, d: DesempateMpe, u: UnidadeJulgamento, avisos: Aviso[]): Promise<ConvocacaoDesempateMpe | null> {
    const feitas = await m.find(ConvocacaoDesempateMpe, { where: { desempate_id: d.id } });
    const chamados = new Set(feitas.map((c) => c.fornecedor_id));
    const situacoes = await this.ranking.situacoes(u.id, m);
    const fila = [...(d.candidatos ?? [])].sort((a, b) => a.ordem - b.ordem);
    const proxima = fila.find((c) => !chamados.has(c.fornecedorId) && !ehExcluida(situacoes.get(c.fornecedorId)));
    const agora = new Date();
    if (!proxima) {
      d.status = StatusDesempateMpe.NAO_EXERCIDO;
      d.concluido_em = agora;
      d.motivo = 'Nenhuma ME/EPP do intervalo exerceu o direito de preferência — mantida a melhor oferta original (LC 123/2006, art. 45, §1º).';
      await m.save(d);
      await this.evento(m, {
        sessaoId: d.sessao_id,
        tipo: TipoEvento.LANCE_MPE_NAO_REGISTRADO,
        u,
        descricao: `${rotulo(u)}: desempate ME/EPP encerrado sem exercício — mantida a melhor oferta original (LC 123/2006, art. 45, §1º).`,
        dados: { desempate_id: d.id, resultado: d.status },
      });
      avisos.push({
        sessaoId: d.sessao_id,
        evento: 'mpe_desempate',
        payload: { unidadeId: u.id, tipoUnidade: u.tipo, numero: u.numero, status: d.status },
        publico: { unidadeId: u.id, tipoUnidade: u.tipo, numero: u.numero, status: d.status },
      });
      return null;
    }
    const minutos = Number(d.prazo_minutos) || PRAZO_DESEMPATE_MPE_MINUTOS;
    const c = await m.save(
      m.create(ConvocacaoDesempateMpe, {
        desempate_id: d.id,
        licitacao_id: d.licitacao_id,
        sessao_id: d.sessao_id,
        tipo_unidade: u.tipo,
        unidade_id: u.id,
        fornecedor_id: proxima.fornecedorId,
        ordem: proxima.ordem,
        status: StatusConvocacaoMpe.AGUARDANDO,
        valor_a_cobrir: Number(d.melhor_valor),
        valor_proprio: proxima.valor,
        convocada_em: agora,
        prazo_minutos: minutos,
        prazo_ate: prazoConvocacaoAte(agora, minutos),
      }),
    );
    await this.ranking.definirSituacao(m, u, proxima.fornecedorId, SituacaoLicitante.CONVOCADO_DESEMPATE, {
      motivo: `Convocada para o desempate ficto (LC 123/2006, art. 45) até ${hora(c.prazo_ate)}`,
      ator: atorSistema('me-epp'),
    });
    await this.evento(m, {
      sessaoId: d.sessao_id,
      tipo: TipoEvento.LANCE_MPE_SOLICITADO,
      u,
      fornecedorId: proxima.fornecedorId,
      descricao:
        `${rotulo(u)}: ${proxima.ordem}ª ME/EPP do intervalo convocada a apresentar oferta inferior a ${brl(Number(d.melhor_valor))} ` +
        `até ${hora(c.prazo_ate)} (${minutos} min — LC 123/2006, art. 45, I e §3º).`,
      valor: Number(d.melhor_valor),
      dados: { desempate_id: d.id, convocacao_id: c.id, ordem: c.ordem, prazo_ate: c.prazo_ate },
    });
    const payload = {
      convocacaoId: c.id,
      unidadeId: u.id,
      tipoUnidade: u.tipo,
      numero: u.numero,
      valorACobrir: Number(d.melhor_valor),
      prazoAte: c.prazo_ate,
      status: c.status,
    };
    avisos.push({
      sessaoId: d.sessao_id,
      fornecedorId: proxima.fornecedorId,
      evento: 'mpe_convocado',
      payload,
      publico: { unidadeId: u.id, tipoUnidade: u.tipo, numero: u.numero, status: StatusDesempateMpe.EM_CURSO, ordem: c.ordem, prazoAte: c.prazo_ate },
    });
    return c;
  }

  /** Difusão (depois do commit): privada à ME/EPP convocada, anônima à sala, completa ao órgão. */
  private difundir(avisos: Aviso[]): void {
    const server: any = (this.gateway as any)?.server;
    if (!server) return;
    for (const a of avisos) {
      if (!a.sessaoId) continue;
      try {
        if (a.fornecedorId) server.to(salaFornecedor(a.sessaoId, a.fornecedorId)).emit(a.evento, a.payload);
        if (a.publico) server.to(`sessao:${a.sessaoId}`).emit('mpe_desempate', a.publico);
        server.to(salaOrgao(a.sessaoId)).emit('mpe_atualizado', { ...a.payload, fornecedorId: a.fornecedorId ?? null });
      } catch (e: any) {
        this.logger.warn(`Aviso ME/EPP não difundido: ${e?.message ?? e}`);
      }
    }
  }

  /** Sem desempate em curso na licitação → a sala segue da etapa BENEFICIO_MPE para a aceitação. */
  private async atualizarEtapa(m: EntityManager, licitacaoId: string, sessaoId: string | null): Promise<void> {
    if (!sessaoId || (await this.temDesempatePendente(licitacaoId, m))) return;
    await m.query(`UPDATE sessoes_disputa SET etapa = $2 WHERE id = $1 AND etapa::text = $3`, [
      sessaoId,
      EtapaSessao.ACEITACAO_PROPOSTA,
      EtapaSessao.BENEFICIO_MPE,
    ]);
  }

  private async convocacaoTravada(m: EntityManager, sessaoId: string, convocacaoId: string, fornecedorId?: string): Promise<ConvocacaoDesempateMpe> {
    const c = await m.findOne(ConvocacaoDesempateMpe, { where: { id: convocacaoId, sessao_id: sessaoId }, lock: { mode: 'pessimistic_write' } });
    // Convocação de outra ME/EPP: 404 (não revela a existência)
    if (!c || (fornecedorId && c.fornecedor_id !== fornecedorId)) throw new NotFoundException('Convocação não encontrada nesta sessão');
    return c;
  }

  /** Encerra uma convocação sem exercício (DECLINADA/EXPIRADA) e chama a próxima. */
  private async encerrarSemExercicio(
    m: EntityManager,
    c: ConvocacaoDesempateMpe,
    status: StatusConvocacaoMpe.DECLINADA | StatusConvocacaoMpe.EXPIRADA,
    avisos: Aviso[],
  ): Promise<void> {
    const u = await this.ranking.unidade(c.unidade_id, m);
    const d = await m.findOne(DesempateMpe, { where: { id: c.desempate_id }, lock: { mode: 'pessimistic_write' } });
    c.status = status;
    c.respondida_em = new Date();
    c.motivo =
      status === StatusConvocacaoMpe.DECLINADA
        ? 'A ME/EPP declinou do direito de preferência.'
        : 'Prazo encerrado sem oferta — direito precluso (LC 123/2006, art. 45, §3º).';
    await m.save(c);
    if (!u || !d) return;
    await this.ranking.definirSituacao(m, u, c.fornecedor_id, SituacaoLicitante.CLASSIFICADO, {
      motivo: c.motivo,
      ator: status === StatusConvocacaoMpe.DECLINADA ? { tipo: 'FORNECEDOR', id: c.fornecedor_id } : atorSistema('me-epp'),
    });
    await this.evento(m, {
      sessaoId: c.sessao_id,
      tipo: TipoEvento.LANCE_MPE_NAO_REGISTRADO,
      u,
      fornecedorId: c.fornecedor_id,
      descricao: `${rotulo(u)}: a ${c.ordem}ª ME/EPP convocada ${status === StatusConvocacaoMpe.DECLINADA ? 'declinou do desempate' : 'não ofertou no prazo (precluso)'}.`,
      sistema: status !== StatusConvocacaoMpe.DECLINADA,
      usuario: status === StatusConvocacaoMpe.DECLINADA ? c.fornecedor_id : undefined,
      dados: { desempate_id: d.id, convocacao_id: c.id, status },
    });
    if (d.status === StatusDesempateMpe.EM_CURSO) await this.convocarProxima(m, d, u, avisos);
  }

  /**
   * PRAZO EFETIVO da convocação (devido processo): o tempo em que a SESSÃO ou
   * a LICITAÇÃO esteve suspensa não conta — suspensa, a convocação não expira
   * e ninguém responde; retomada, o restante volta a correr (mesma ideia do
   * deslocamento dos relógios em `retomarRelogiosDaSessao`). Marcos: eventos
   * SESSAO_SUSPENSA/SESSAO_RETOMADA e transições de/para SUSPENSA. Instantes
   * em epoch pelo relógio do BANCO (todas as colunas lidas no mesmo relógio);
   * a duração do prazo vem de `prazo_ate − convocada_em`.
   */
  private async estadoDoPrazo(m: EntityManager, c: ConvocacaoDesempateMpe) {
    const [t] = await m.query(
      `SELECT extract(epoch from now()) * 1000 AS agora, extract(epoch from c.created_at) * 1000 AS criada,
              s.status::text AS status_sessao, l.situacao::text AS situacao
         FROM convocacoes_desempate_mpe c
         LEFT JOIN sessoes_disputa s ON s.id = c.sessao_id
         LEFT JOIN licitacoes l ON l.id = c.licitacao_id
        WHERE c.id = $1`,
      [c.id],
    );
    const marcos: MarcoSuspensao[] = [];
    if (c.sessao_id) {
      const ev: any[] = await m.query(
        `SELECT extract(epoch from created_at) * 1000 AS em, tipo::text AS tipo FROM eventos_sessao
          WHERE sessao_id = $1 AND tipo::text IN ('SESSAO_SUSPENSA','SESSAO_RETOMADA')`,
        [c.sessao_id],
      );
      for (const e of ev) marcos.push({ emMs: Number(e.em), fonte: 'SESSAO', suspende: e.tipo === 'SESSAO_SUSPENSA' });
    }
    const tr: any[] = await m.query(
      `SELECT extract(epoch from created_at) * 1000 AS em, situacao_para FROM licitacao_transicoes
        WHERE licitacao_id = $1 AND (situacao_para = 'SUSPENSA' OR situacao_de = 'SUSPENSA')`,
      [c.licitacao_id],
    );
    for (const x of tr) marcos.push({ emMs: Number(x.em), fonte: 'LICITACAO', suspende: x.situacao_para === 'SUSPENSA' });
    const agoraMs = Number(t?.agora ?? Date.now());
    const convocadaMs = Number(t?.criada ?? agoraMs);
    const pausa = tempoSuspenso(marcos, convocadaMs, agoraMs, {
      sessao: t?.status_sessao === 'SUSPENSA',
      licitacao: t?.situacao === 'SUSPENSA',
    });
    return estadoDoPrazoMpe({
      totalMs: new Date(c.prazo_ate).getTime() - new Date(c.convocada_em).getTime(),
      convocadaMs,
      agoraMs,
      pausadoMs: pausa.pausadoMs,
      suspensaAgora: pausa.suspensaAgora,
    });
  }

  /**
   * Prazos vencidos (cron a cada 5 s e antes de toda leitura/ato): convocação
   * AGUARDANDO com prazo passado → EXPIRADA e a próxima ME/EPP é convocada.
   */
  async processarPrazos(licitacaoId?: string): Promise<number> {
    const agora = new Date();
    const vencidas: Array<{ id: string; sessao_id: string; unidade_id: string; licitacao_id: string }> = await this.dataSource.query(
      `SELECT id, sessao_id, unidade_id, licitacao_id FROM convocacoes_desempate_mpe
        WHERE status = $1 AND prazo_ate < $2 ${licitacaoId ? 'AND licitacao_id = $3' : ''}`,
      licitacaoId ? [StatusConvocacaoMpe.AGUARDANDO, agora, licitacaoId] : [StatusConvocacaoMpe.AGUARDANDO, agora],
    );
    let n = 0;
    for (const v of vencidas) {
      const avisos: Aviso[] = [];
      await this.dataSource.transaction(async (m) => {
        await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`mpe:${v.unidade_id}`]);
        const c = await m.findOne(ConvocacaoDesempateMpe, { where: { id: v.id }, lock: { mode: 'pessimistic_write' } });
        if (!c || c.status !== StatusConvocacaoMpe.AGUARDANDO) return;
        // suspensa: o prazo está pausado — nunca expira durante a suspensão
        if (!(await this.estadoDoPrazo(m, c)).expirada) return;
        await this.encerrarSemExercicio(m, c, StatusConvocacaoMpe.EXPIRADA, avisos);
        await this.atualizarEtapa(m, c.licitacao_id, c.sessao_id);
        n++;
      });
      this.difundir(avisos);
    }
    return n;
  }

  @Cron('*/5 * * * * *', { name: 'me-epp-prazos-desempate' })
  async cronPrazos(): Promise<void> {
    if (this.processando) return;
    this.processando = true;
    try {
      await this.processarPrazos();
    } catch (e: any) {
      this.logger.error(`Prazos do desempate ME/EPP: ${e?.message ?? e}`);
    } finally {
      this.processando = false;
    }
  }

  // ==========================================================================
  // ATOS DA ME/EPP CONVOCADA (sempre o fornecedor do TOKEN)
  // ==========================================================================

  /**
   * A ME/EPP convocada oferece valor ESTRITAMENTE inferior à melhor oferta
   * (art. 45 I): lance DESEMPATE_MPE pelo motor (única escrita de lance) e a
   * ME/EPP passa a 1ª da unidade.
   */
  async exercer(sessaoId: string, convocacaoId: string, fornecedorId: string, valor: unknown) {
    // 1) reserva a convocação (AGUARDANDO → PROCESSANDO) — o prazo não a vence durante o registro
    const reserva = await this.dataSource.transaction(async (m) => {
      const pre = await this.convocacaoTravada(m, sessaoId, convocacaoId, fornecedorId);
      await exigirLicitacaoAtiva(m, pre.licitacao_id, { bloquear: true });
      const prazo = await this.estadoDoPrazo(m, pre);
      if (pre.status === StatusConvocacaoMpe.AGUARDANDO && prazo.suspensa) throw new ConflictException(SUSPENSA);
      if (pre.status === StatusConvocacaoMpe.AGUARDANDO && prazo.expirada) return { expirada: true as const, c: pre };
      const erro = motivoNaoExerce({ status: pre.status, prazo_ate: new Date(Date.now() + prazo.restanteMs + 1000) }, valor, Number(pre.valor_a_cobrir));
      if (erro) {
        if (pre.status !== StatusConvocacaoMpe.AGUARDANDO) throw new ConflictException(erro);
        throw new BadRequestException(erro);
      }
      pre.status = StatusConvocacaoMpe.PROCESSANDO;
      await m.save(pre);
      return { expirada: false as const, c: pre };
    });
    if (reserva.expirada) {
      await this.processarPrazos(reserva.c.licitacao_id);
      throw new ConflictException('O prazo para a oferta de desempate terminou (LC 123/2006, art. 45, §3º) — direito precluso.');
    }
    const c = reserva.c;

    // 2) lance pelo motor (valida de novo: unidade encerrada, abaixo do melhor lance ATUAL)
    let lance;
    try {
      lance = await this.disputa.registrarLance({
        sessaoId,
        itemId: c.unidade_id,
        loteId: c.tipo_unidade === 'LOTE' ? c.unidade_id : undefined,
        fornecedorId,
        valor: Number(valor),
        ip: 'ME-EPP',
        origem: OrigemLance.DESEMPATE_MPE,
      });
    } catch (e) {
      await this.dataSource.query(`UPDATE convocacoes_desempate_mpe SET status = $2, updated_at = now() WHERE id = $1 AND status = $3`, [
        c.id,
        StatusConvocacaoMpe.AGUARDANDO,
        StatusConvocacaoMpe.PROCESSANDO,
      ]);
      throw e;
    }

    // 3) registra o exercício e encerra o desempate da unidade
    const avisos: Aviso[] = [];
    const final = await this.dataSource.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`mpe:${c.unidade_id}`]);
      const conv = await this.convocacaoTravada(m, sessaoId, convocacaoId, fornecedorId);
      conv.status = StatusConvocacaoMpe.EXERCIDA;
      conv.respondida_em = new Date();
      conv.valor_ofertado = Number(valor);
      conv.lance_id = lance.id;
      await m.save(conv);
      const d = await m.findOne(DesempateMpe, { where: { id: conv.desempate_id }, lock: { mode: 'pessimistic_write' } });
      const u = await this.ranking.unidade(conv.unidade_id, m);
      if (d && u) {
        d.status = StatusDesempateMpe.EXERCIDO;
        d.vencedor_fornecedor_id = fornecedorId;
        d.valor_vencedor = Number(valor);
        d.concluido_em = new Date();
        d.motivo = `ME/EPP convocada ofertou ${brl(Number(valor))}, inferior à melhor oferta (${brl(Number(d.melhor_valor))}), e passou a 1ª colocada (LC 123/2006, art. 45, I).`;
        await m.save(d);
        await this.ranking.definirSituacao(m, u, fornecedorId, SituacaoLicitante.CLASSIFICADO, {
          motivo: 'Exerceu o direito de preferência (LC 123/2006, art. 45, I)',
          ator: { tipo: 'FORNECEDOR', id: fornecedorId },
        });
        await this.evento(m, {
          sessaoId,
          tipo: TipoEvento.BENEFICIO_MPE_APLICADO,
          u,
          fornecedorId,
          descricao: `${rotulo(u)}: ME/EPP exerceu o direito de preferência com ${brl(Number(valor))} e passou a 1ª colocada (LC 123/2006, art. 45, I).`,
          valor: Number(valor),
          usuario: fornecedorId,
          sistema: false,
          dados: { desempate_id: d.id, convocacao_id: conv.id, lance_id: lance.id },
        });
        avisos.push({
          sessaoId,
          evento: 'mpe_desempate',
          payload: { unidadeId: u.id, tipoUnidade: u.tipo, numero: u.numero, status: d.status },
          publico: { unidadeId: u.id, tipoUnidade: u.tipo, numero: u.numero, status: d.status, valor: Number(valor) },
        });
      }
      await this.atualizarEtapa(m, conv.licitacao_id, sessaoId);
      return conv;
    });
    this.difundir(avisos);
    await this.gateway.difundirNovoLance(sessaoId, c.licitacao_id, lance).catch(() => undefined);
    return this.visaoConvocacao(final, await this.prazosDe([final]));
  }

  /** A ME/EPP convocada declina: a seguinte do intervalo é convocada (art. 45 II). */
  async declinar(sessaoId: string, convocacaoId: string, fornecedorId: string) {
    const avisos: Aviso[] = [];
    const r = await this.dataSource.transaction(async (m) => {
      const pre = await this.convocacaoTravada(m, sessaoId, convocacaoId, fornecedorId);
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`mpe:${pre.unidade_id}`]);
      await exigirLicitacaoAtiva(m, pre.licitacao_id, { bloquear: true });
      const c = await this.convocacaoTravada(m, sessaoId, convocacaoId, fornecedorId);
      if (c.status !== StatusConvocacaoMpe.AGUARDANDO) throw new ConflictException('Esta convocação para o desempate ME/EPP não está aberta.');
      const prazo = await this.estadoDoPrazo(m, c);
      if (prazo.suspensa) throw new ConflictException(SUSPENSA);
      await this.encerrarSemExercicio(m, c, prazo.expirada ? StatusConvocacaoMpe.EXPIRADA : StatusConvocacaoMpe.DECLINADA, avisos);
      await this.atualizarEtapa(m, c.licitacao_id, sessaoId);
      return c;
    });
    this.difundir(avisos);
    return this.visaoConvocacao(r, await this.prazosDe([r]));
  }

  // ==========================================================================
  // LEITURAS
  // ==========================================================================

  /** Prazo efetivo (pausa da suspensão) das convocações AGUARDANDO. */
  private async prazosDe(convs: ConvocacaoDesempateMpe[]): Promise<Map<string, { restanteMs: number; suspensa: boolean; expirada: boolean }>> {
    const saida = new Map<string, { restanteMs: number; suspensa: boolean; expirada: boolean }>();
    for (const c of convs) {
      if (c.status === StatusConvocacaoMpe.AGUARDANDO) saida.set(c.id, await this.estadoDoPrazo(this.dataSource.manager, c));
    }
    return saida;
  }

  private visaoConvocacao(
    c: ConvocacaoDesempateMpe,
    prazos: Map<string, { restanteMs: number; suspensa: boolean; expirada: boolean }> = new Map(),
    agora = new Date(),
  ) {
    const p = prazos.get(c.id);
    const aberta = c.status === StatusConvocacaoMpe.AGUARDANDO;
    return {
      id: c.id,
      unidadeId: c.unidade_id,
      tipoUnidade: c.tipo_unidade,
      fornecedorId: c.fornecedor_id,
      ordem: c.ordem,
      status: c.status,
      valorACobrir: Number(c.valor_a_cobrir),
      valorProprio: c.valor_proprio != null ? Number(c.valor_proprio) : null,
      convocadaEm: c.convocada_em,
      prazoMinutos: c.prazo_minutos,
      // Prazo EFETIVO: deslocado pelo tempo de suspensão; suspensa → pausado com o restante guardado
      prazoAte: aberta && p ? new Date(agora.getTime() + p.restanteMs) : c.prazo_ate,
      prazoPausado: aberta && !!p?.suspensa,
      segundosRestantes: aberta ? Math.floor((p ? p.restanteMs : Math.max(0, new Date(c.prazo_ate).getTime() - agora.getTime())) / 1000) : 0,
      respondidaEm: c.respondida_em,
      valorOfertado: c.valor_ofertado != null ? Number(c.valor_ofertado) : null,
      motivo: c.motivo,
    };
  }

  private async sessaoLicitacao(sessaoId: string): Promise<string> {
    const [s] = await this.dataSource.query(`SELECT licitacao_id FROM sessoes_disputa WHERE id = $1`, [sessaoId]);
    if (!s) throw new NotFoundException('Sessão não encontrada');
    return String(s.licitacao_id);
  }

  /** Painel do agente (órgão dono): por unidade, o intervalo, a fila, a convocação atual e o histórico. */
  async painel(sessaoId: string) {
    const licitacaoId = await this.sessaoLicitacao(sessaoId);
    await this.processarPrazos(licitacaoId);
    const [sessao] = await this.dataSource.query(`SELECT etapa::text AS etapa FROM sessoes_disputa WHERE id = $1`, [sessaoId]);
    const unidades = await this.ranking.unidades(licitacaoId);
    const desempates = await this.dataSource.manager.find(DesempateMpe, { where: { licitacao_id: licitacaoId } });
    const convocacoes = await this.dataSource.manager.find(ConvocacaoDesempateMpe, {
      where: { licitacao_id: licitacaoId },
      order: { convocada_em: 'ASC' },
    });
    const prazos = await this.prazosDe(convocacoes);
    const ids = [
      ...new Set([
        ...desempates.flatMap((d) => [d.melhor_fornecedor_id, ...(d.candidatos ?? []).map((c) => c.fornecedorId)]),
      ].filter(Boolean) as string[]),
    ];
    const cadastro = new Map<string, { razaoSocial: string; porte: string | null }>();
    if (ids.length) {
      const rows: any[] = await this.dataSource.query(`SELECT id::text AS id, razao_social, porte::text AS porte FROM fornecedores WHERE id::text = ANY($1)`, [ids]);
      for (const r of rows) cadastro.set(r.id, { razaoSocial: r.razao_social, porte: r.porte });
    }
    const agora = new Date();
    const saida = [];
    for (const u of unidades) {
      const d = desempates.find((x) => x.unidade_id === u.id);
      const beneficio = await beneficioDaUnidadeSql(this.dataSource.manager, u.id);
      const convs = convocacoes.filter((c) => c.unidade_id === u.id);
      const atual = convs.find((c) => c.status === StatusConvocacaoMpe.AGUARDANDO || c.status === StatusConvocacaoMpe.PROCESSANDO) ?? null;
      saida.push({
        tipo: u.tipo,
        id: u.id,
        numero: u.numero,
        descricao: u.descricao,
        encerrada: u.encerrada,
        beneficio: beneficio?.beneficio ?? null,
        desempate: d
          ? {
              id: d.id,
              status: d.status,
              motivo: d.motivo,
              percentual: d.percentual != null ? Number(d.percentual) : null,
              limite: d.limite_valor != null ? Number(d.limite_valor) : null,
              prazoMinutos: d.prazo_minutos,
              melhor: d.melhor_fornecedor_id
                ? {
                    fornecedorId: d.melhor_fornecedor_id,
                    razaoSocial: cadastro.get(d.melhor_fornecedor_id)?.razaoSocial ?? null,
                    valor: d.melhor_valor != null ? Number(d.melhor_valor) : null,
                  }
                : null,
              candidatos: (d.candidatos ?? []).map((c) => ({
                ...c,
                razaoSocial: cadastro.get(c.fornecedorId)?.razaoSocial ?? null,
                porte: cadastro.get(c.fornecedorId)?.porte ?? null,
                convocacao: convs.find((x) => x.fornecedor_id === c.fornecedorId)?.status ?? null,
              })),
              sorteio: d.sorteio,
              vencedor: d.vencedor_fornecedor_id
                ? { fornecedorId: d.vencedor_fornecedor_id, razaoSocial: cadastro.get(d.vencedor_fornecedor_id)?.razaoSocial ?? null, valor: Number(d.valor_vencedor) }
                : null,
              concluidoEm: d.concluido_em,
            }
          : null,
        convocacaoAtual: atual ? { ...this.visaoConvocacao(atual, prazos, agora), razaoSocial: cadastro.get(atual.fornecedor_id)?.razaoSocial ?? null } : null,
        historico: convs.map((c) => ({ ...this.visaoConvocacao(c, prazos, agora), razaoSocial: cadastro.get(c.fornecedor_id)?.razaoSocial ?? null })),
      });
    }
    return {
      sessaoId,
      licitacaoId,
      etapa: sessao?.etapa ?? null,
      emCurso: saida.filter((u) => u.desempate?.status === StatusDesempateMpe.EM_CURSO).map((u) => `${u.tipo === 'LOTE' ? 'Lote' : 'Item'} ${u.numero}`),
      unidades: saida,
    };
  }

  /** Visão da ME/EPP: só as próprias convocações (unidade, valor a cobrir, prazo). */
  async minhas(sessaoId: string, fornecedorId: string) {
    const licitacaoId = await this.sessaoLicitacao(sessaoId);
    await this.processarPrazos(licitacaoId);
    const lista = await this.dataSource.manager.find(ConvocacaoDesempateMpe, {
      where: { sessao_id: sessaoId, fornecedor_id: fornecedorId },
      order: { convocada_em: 'ASC' },
    });
    const unidades = await this.ranking.unidades(licitacaoId);
    const agora = new Date();
    const prazos = await this.prazosDe(lista);
    return {
      sessaoId,
      licitacaoId,
      convocacoes: lista.map((c) => {
        const u = unidades.find((x) => x.id === c.unidade_id);
        return {
          ...this.visaoConvocacao(c, prazos, agora),
          podeResponder: c.status === StatusConvocacaoMpe.AGUARDANDO && !!prazos.get(c.id) && !prazos.get(c.id)!.suspensa && !prazos.get(c.id)!.expirada,
          unidade: u ? { tipo: u.tipo, id: u.id, numero: u.numero, descricao: u.descricao } : null,
        };
      }),
    };
  }

  // ==========================================================================
  // ART. 48: PARTICIPAÇÃO, CONFERÊNCIA E COTA RESERVADA
  // ==========================================================================

  /**
   * Participação do fornecedor (token) por item — para a tela da proposta
   * avisar ANTES do envio: itens exclusivos/cota exigem porte ME/EPP/MEI no
   * cadastro + declaração (a proposta é barrada no backend de qualquer forma).
   */
  async participacao(licitacaoId: string, fornecedorId: string) {
    const [f] = await this.dataSource.query(`SELECT porte::text AS porte FROM fornecedores WHERE id::text = $1`, [fornecedorId]);
    const itens: any[] = await this.dataSource.query(
      `SELECT id, numero_item FROM itens_licitacao WHERE licitacao_id = $1 ORDER BY numero_item`,
      [licitacaoId],
    );
    const porte: string | null = f?.porte ?? null;
    const saida = [];
    for (const i of itens) {
      const u = await beneficioDaUnidadeSql(this.dataSource.manager, i.id);
      saida.push({
        itemId: String(i.id),
        numero: Number(i.numero_item),
        tipo: u?.beneficio.tipo ?? 'NENHUM',
        ehCota: !!u?.beneficio.ehCota,
        somenteMpe: !!u?.beneficio.somenteMpe,
      });
    }
    return { licitacaoId, porte, porteMpe: ehPorteMpe(porte), itens: saida };
  }

  /**
   * Conferência do art. 48 na licitação: por unidade, o benefício resolvido,
   * exclusivo acima do limite do inciso I (parâmetro `MPE_EXCLUSIVO_ITEM`,
   * R$ 80.000) e cotas reservadas ainda não geradas.
   */
  async conferencia(licitacaoId: string) {
    const [lic] = await this.dataSource.query(
      `SELECT orgao_id, justificativa_nao_exclusividade_mpe FROM licitacoes WHERE id = $1`,
      [licitacaoId],
    );
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    const limite = (await this.parametros.valorVigente(CHAVE_LIMITE_EXCLUSIVO_MPE, lic.orgao_id).catch(() => null)) ?? LIMITE_EXCLUSIVO_MPE;
    const unidades = await this.ranking.unidades(licitacaoId);
    const cotas: any[] = await this.dataSource.query(
      `SELECT item_cota_origem_id::text AS origem FROM itens_licitacao WHERE licitacao_id = $1 AND item_cota_origem_id IS NOT NULL
        UNION SELECT lote_cota_origem_id::text FROM lotes_licitacao WHERE licitacao_id = $1 AND lote_cota_origem_id IS NOT NULL`,
      [licitacaoId],
    );
    const comCota = new Set(cotas.map((c) => c.origem));
    const problemas: string[] = [];
    const saida = [];
    for (const u of unidades) {
      const b = await beneficioDaUnidadeSql(this.dataSource.manager, u.id);
      const valor = u.itens.reduce((s, i) => s + Number(i.valorTotalEstimado || 0), 0);
      const r = rotulo(u);
      // Lote: o limite do art. 48 I vale sobre o valor TOTAL do lote (mesma regra do PUBLICAR)
      if (b?.beneficio.tipo === 'EXCLUSIVO' && !b.beneficio.ehCota) {
        const p = motivoExclusivoAcimaDoLimite(valor, limite, r);
        if (p) problemas.push(p);
      }
      if (b?.beneficio.tipo === 'COTA_RESERVADA' && !comCota.has(u.id) && !u.itens.some((i) => comCota.has(i.id))) {
        problemas.push(`${r}: cota reservada a ME/EPP ainda não gerada (LC 123/2006, art. 48, III) — use "Gerar cotas reservadas".`);
      }
      saida.push({ tipo: u.tipo, id: u.id, numero: u.numero, descricao: u.descricao, valorEstimado: valor, beneficio: b?.beneficio ?? null });
    }
    // Mesma regra do ato PUBLICAR (pré-condição `exclusividadeMpeArt48`)
    const art48 = await conferenciaArt48Sql(this.dataSource.manager, licitacaoId);
    const semJustificativa = pendenciasPublicacaoArt48(art48, null);
    const comJustificativa = pendenciasPublicacaoArt48(art48, lic.justificativa_nao_exclusividade_mpe);
    return {
      licitacaoId,
      limiteExclusivo: limite,
      problemas,
      /** Pendências que hoje impedem o PUBLICAR (considerando a justificativa gravada). */
      bloqueiosPublicacao: comJustificativa,
      /** Há itens até o limite sem exclusividade: publicar exige a justificativa do art. 49. */
      exigeJustificativaArt49: semJustificativa.length > pendenciasPublicacaoArt48(art48, 'x'.repeat(JUSTIFICATIVA_ART49_MINIMO)).length,
      justificativaArt49: lic.justificativa_nao_exclusividade_mpe ?? null,
      unidades: saida,
    };
  }

  /**
   * COTA RESERVADA (LC 123/2006 art. 48 III, até 25% — parâmetro
   * `percentual_cota_maxima_mpe`): cada unidade marcada COTA_RESERVADA ganha
   * uma unidade-COTA própria (item — ou lote com os seus itens, na disputa por
   * lote) com a quantidade da cota, EXCLUSIVA de ME/EPP; a unidade principal
   * fica com o restante e segue AMPLA (com empate ficto). Idempotente; só antes
   * do recebimento de propostas (a estrutura do objeto não muda depois).
   */
  async gerarCotas(licitacaoId: string, ator: AtorTransicao) {
    return this.dataSource.transaction(async (m) => {
      const [lic] = await m.query(
        `SELECT id, orgao_id, fase::text AS fase, COALESCE(base_lance, 'TOTAL_ITEM') AS base_lance, modo_beneficio_mpe,
                percentual_cota_reservada FROM licitacoes WHERE id = $1 FOR UPDATE`,
        [licitacaoId],
      );
      if (!lic) throw new NotFoundException('Licitação não encontrada');
      if (FASES_SEM_COTA.includes(lic.fase)) {
        throw new ConflictException(`A cota reservada é definida na preparação do edital; a licitação está em ${lic.fase}.`);
      }
      const [{ n }] = await m.query(`SELECT COUNT(*)::int AS n FROM propostas WHERE licitacao_id = $1`, [licitacaoId]);
      if (Number(n) > 0) {
        throw new ConflictException('Já há propostas recebidas: a cota reservada precisa ser gerada antes do acolhimento de propostas.');
      }
      const params: any = await this.parametros.resolver(lic.orgao_id).catch(() => null);
      const maximo = Number(params?.percentual_cota_maxima_mpe) || 25;
      const criadas: Array<{ tipo: 'ITEM' | 'LOTE'; origemId: string; cotaId: string; numero: number; percentual: number }> = [];

      if (lic.base_lance === 'TOTAL_LOTE') {
        const lotes: any[] = await m.query(
          `SELECT id, numero, descricao, percentual_cota_reservada FROM lotes_licitacao
            WHERE licitacao_id = $1 AND lote_cota_origem_id IS NULL
              AND NOT EXISTS (SELECT 1 FROM lotes_licitacao c WHERE c.lote_cota_origem_id = lotes_licitacao.id)
            ORDER BY numero`,
          [licitacaoId],
        );
        for (const lote of lotes) {
          const b = await beneficioDaUnidadeSql(m, lote.id);
          if (b?.beneficio.tipo !== 'COTA_RESERVADA') continue;
          const pct = Number(lote.percentual_cota_reservada ?? lic.percentual_cota_reservada);
          const erro = motivoPercentualCotaInvalido(pct, maximo);
          if (erro) throw new BadRequestException(`Lote ${lote.numero}: ${erro}`);
          const [{ max }] = await m.query(`SELECT COALESCE(MAX(numero), 0)::int AS max FROM lotes_licitacao WHERE licitacao_id = $1`, [licitacaoId]);
          const numeroLote = Number(max) + 1;
          const novoLote = await clonarLinha(m, 'lotes_licitacao', lote.id, {
            numero: numeroLote,
            descricao: `${lote.descricao || `Lote ${lote.numero}`} — COTA RESERVADA ME/EPP (${pct}%)`.slice(0, 250),
            tipo_beneficio_mpe: 'EXCLUSIVO',
            exclusivo_mpe: true,
            percentual_cota_reservada: null,
            lote_cota_origem_id: lote.id,
            status_disputa: null,
          });
          const itens: any[] = await m.query(`SELECT id FROM itens_licitacao WHERE lote_id = $1 ORDER BY numero_item`, [lote.id]);
          for (const it of itens) await this.clonarItemCota(m, licitacaoId, it.id, pct, { lote_id: novoLote, numero_lote: numeroLote });
          criadas.push({ tipo: 'LOTE', origemId: lote.id, cotaId: novoLote, numero: numeroLote, percentual: pct });
        }
      } else {
        const itens: any[] = await m.query(
          `SELECT i.id, i.numero_item, lo.percentual_cota_reservada AS pct_lote FROM itens_licitacao i
             LEFT JOIN lotes_licitacao lo ON lo.id = i.lote_id
            WHERE i.licitacao_id = $1 AND i.item_cota_origem_id IS NULL
              AND NOT EXISTS (SELECT 1 FROM itens_licitacao c WHERE c.item_cota_origem_id = i.id)
            ORDER BY i.numero_item`,
          [licitacaoId],
        );
        for (const it of itens) {
          const b = await beneficioDaUnidadeSql(m, it.id);
          if (b?.beneficio.tipo !== 'COTA_RESERVADA') continue;
          const pct = Number(lic.modo_beneficio_mpe === 'POR_LOTE' ? it.pct_lote ?? lic.percentual_cota_reservada : lic.percentual_cota_reservada);
          const erro = motivoPercentualCotaInvalido(pct, maximo);
          if (erro) throw new BadRequestException(`Item ${it.numero_item}: ${erro}`);
          const c = await this.clonarItemCota(m, licitacaoId, it.id, pct, {});
          criadas.push({ tipo: 'ITEM', origemId: it.id, cotaId: c.id, numero: c.numero, percentual: pct });
        }
      }
      if (criadas.length) {
        this.logger.log(`Cotas reservadas ME/EPP geradas na licitação ${licitacaoId} por ${ator.tipo}:${ator.id}: ${criadas.length}`);
      }
      return { licitacaoId, percentualMaximo: Math.min(maximo, 25), criadas };
    });
  }

  /** Item-COTA: clone do item com a quantidade da cota; o principal fica com o restante. */
  private async clonarItemCota(
    m: EntityManager,
    licitacaoId: string,
    itemId: string,
    percentual: number,
    extras: Record<string, any>,
  ): Promise<{ id: string; numero: number }> {
    const [it] = await m.query(
      `SELECT id, numero_item, descricao_resumida, quantidade, valor_unitario_estimado FROM itens_licitacao WHERE id = $1 FOR UPDATE`,
      [itemId],
    );
    const q = quantidadeDaCota(it.quantidade, percentual);
    if (!(q.cota > 0) || !(q.principal > 0)) {
      throw new BadRequestException(
        `Item ${it.numero_item}: quantidade ${Number(it.quantidade)} não comporta cota de ${percentual}% (a cota e a parcela principal precisam ser maiores que zero).`,
      );
    }
    const unit = Number(it.valor_unitario_estimado) || 0;
    const [{ max }] = await m.query(`SELECT COALESCE(MAX(numero_item), 0)::int AS max FROM itens_licitacao WHERE licitacao_id = $1`, [licitacaoId]);
    const numero = Number(max) + 1;
    const id = await clonarLinha(m, 'itens_licitacao', itemId, {
      numero_item: numero,
      quantidade: q.cota,
      valor_total_estimado: Math.round(unit * q.cota * 100) / 100,
      tipo_participacao: 'EXCLUSIVO_MPE',
      item_cota_origem_id: itemId,
      descricao_resumida: `${it.descricao_resumida} — COTA RESERVADA ME/EPP (${percentual}%)`.slice(0, 250),
      ...extras,
    });
    await m.query(`UPDATE itens_licitacao SET quantidade = $2, valor_total_estimado = $3, updated_at = now() WHERE id = $1`, [
      itemId,
      q.principal,
      Math.round(unit * q.principal * 100) / 100,
    ]);
    return { id, numero };
  }
}

/**
 * Copia uma linha da tabela (todas as colunas menos id/created_at/updated_at)
 * com valores sobrescritos — cast pelo tipo da coluna (enum incluso).
 */
async function clonarLinha(m: EntityManager, tabela: string, id: string, sobrescrever: Record<string, any>): Promise<string> {
  const colunas: Array<{ column_name: string; udt_name: string }> = await m.query(
    `SELECT column_name, udt_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`,
    [tabela],
  );
  const usar = colunas.filter((c) => !['id', 'created_at', 'updated_at'].includes(c.column_name));
  const params: any[] = [id];
  const selecao = usar.map((c) => {
    if (Object.prototype.hasOwnProperty.call(sobrescrever, c.column_name)) {
      params.push(sobrescrever[c.column_name]);
      return `$${params.length}::"${c.udt_name}"`;
    }
    return `"${c.column_name}"`;
  });
  const [r] = await m.query(
    `INSERT INTO "${tabela}" (${usar.map((c) => `"${c.column_name}"`).join(', ')})
     SELECT ${selecao.join(', ')} FROM "${tabela}" WHERE id = $1 RETURNING id`,
    params,
  );
  return String(r.id);
}

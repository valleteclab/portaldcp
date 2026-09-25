import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { FaseLicitacao } from '../licitacoes/entities/licitacao.entity';
import { EventoSessao, TipoEvento } from '../sessao/entities/evento-sessao.entity';
import { exigirLicitacaoAtiva } from '../sessao/licitacao-ativa';
import { AtorTransicao, atorSistema } from '../licitacoes/transicoes/transicoes.tipos';
import { DisputaService } from '../disputa-v2/disputa.service';
import { ModoDisputaService } from '../disputa-v2/modo-disputa.service';
import { Lance } from '../disputa-v2/entities/lance.entity';
import { BaseLance, OrigemLance, valoresDoLance } from '../disputa-v2/modelo-lance';
import { ratearLanceLote } from '../disputa-v2/rateio-lote';
import type { DirecaoLance } from '../disputa-v2/modos-disputa';
import { Desempate, DesempateOferta, StatusDesempate } from './entities/desempate.entity';
import { RankingService, UnidadeJulgamento } from './ranking.service';
import { AceitacaoService } from './aceitacao.service';
import { EntradaRanking, desempatePorRegistro } from './regras-julgamento';
import { CASAS_INDICE, chaveDaEntrada, ehCriterioPontuado } from './criterios-julgamento';
import {
  CRITERIOS_ART60,
  PRAZO_DISPUTA_FINAL_PADRAO_MINUTOS,
  aplicarCriteriosAutomaticos,
  blocosPorChave,
  empateResolvido,
  motivoOfertaDisputaFinalInvalida,
  motivoPrazoDisputaFinalInvalido,
} from './desempate-regras';
import { criterioDecisivo, dadosParaDesempate, passoDisputaFinal, sortearBlocos } from './desempate.sql';
import { criterioDaLicitacao } from './julgamento-tecnico.sql';
import { DESCRICAO_ALGORITMO_SORTEIO, conferirSorteio } from './sorteio';

const STATUS_ABERTOS = [StatusDesempate.EM_DISPUTA_FINAL, StatusDesempate.AGUARDANDO_SORTEIO] as string[];
const brl = (v: number) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;
const dataHora = (d: Date | string) =>
  new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

/**
 * Motivo da disputa final NÃO se aplicar ao critério (documentado):
 *  - melhor técnica: o empate é de NOTA TÉCNICA; "nova proposta em ato
 *    contínuo" seria nova proposta técnica, incompatível com a avaliação por
 *    banca (art. 37) — e o preço é o fixado no edital (art. 35);
 *  - maior retorno econômico: limite do modelo mínimo (a nova proposta
 *    seria outra proposta de trabalho/percentual) — segue para os demais critérios.
 */
function motivoSemDisputaFinal(criterio: string): string | null {
  if (criterio === 'MELHOR_TECNICA') {
    return 'Não aplicável — no critério melhor técnica o empate é de nota técnica atribuída pela banca (art. 37) e o preço é o fixado no edital (art. 35).';
  }
  if (criterio === 'MAIOR_RETORNO_ECONOMICO') {
    return 'Não aplicável neste sistema ao maior retorno econômico (nova proposta de trabalho em ato contínuo não suportada) — seguem os demais critérios.';
  }
  return null;
}

interface GrupoEmpatado {
  chave: 'VALOR' | 'PONTUACAO';
  valor: number;
  entradas: EntradaRanking[];
  pendente: boolean;
  etapa: string;
  desempateId: string | null;
}

/**
 * ============================================================================
 * DESEMPATE (Lei 14.133/2021 art. 60; IN SEGES 73/2022 art. 28)
 * ============================================================================
 *
 * Plugado no ranking único (`RankingService.definirDesempatador`): quando dois
 * ou mais licitantes empatam no valor final (propostas iguais sem lances,
 * modo fechado, lances fechados iguais) — ou na pontuação, nos critérios
 * técnica e preço/melhor técnica/maior retorno — o grupo só tem ordem
 * DEFINITIVA depois do rito do art. 60, registrado em `desempates`:
 *   1. o agente INICIA o desempate do grupo: convoca os empatados para a
 *      DISPUTA FINAL (I) com prazo em minutos (ato contínuo) — cada um pode
 *      mandar UMA nova proposta SELADA, melhor que o seu valor atual;
 *   2. no fim do prazo (ou quando todos enviaram) as propostas viram lances
 *      DISPUTA_FINAL e o ranking é refeito; o que continuar empatado passa
 *      pelos critérios II..§1º IV (desempate-regras.ts; sem dado = não
 *      aplicável, registrado);
 *   3. persistindo, o agente pratica o SORTEIO em ato público: o instante do
 *      ato é gravado ANTES do cálculo e entra na semente (sorteio.ts) —
 *      entrada, semente, algoritmo e ordem ficam no registro e no evento da
 *      sala, e qualquer participante confere (`conferir`).
 * Enquanto o grupo está pendente, a ordem provisória é a do registro e a
 * ACEITAÇÃO não convoca o licitante na vez (gancho da AceitacaoService).
 */
@Injectable()
export class DesempateService implements OnModuleInit {
  private readonly logger = new Logger(DesempateService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ranking: RankingService,
    private readonly aceitacao: AceitacaoService,
    private readonly disputa: DisputaService,
    private readonly modos: ModoDisputaService,
  ) {}

  onModuleInit(): void {
    this.ranking.definirDesempatador((grupo, ctx) => this.desempatar(grupo, ctx));
    this.aceitacao.registrarGanchoAntesDaConvocacao(({ unidade, primeiro }) =>
      primeiro.desempate?.pendente
        ? `${unidade.tipo === 'LOTE' ? 'Lote' : 'Item'} ${unidade.numero}: há EMPATE na vez da aceitação — ` +
          'conclua o desempate (Lei 14.133/2021, art. 60: disputa final, critérios e, persistindo, sorteio — IN 73 art. 28) antes de convocar.'
        : null,
    );
  }

  // ==========================================================================
  // DESEMPATADOR (gancho do ranking)
  // ==========================================================================

  async desempatar(grupo: EntradaRanking[], ctx: { licitacaoId: string | null; unidadeId: string }): Promise<EntradaRanking[]> {
    const base = await desempatePorRegistro(grupo, ctx);
    if (!ctx.unidadeId) return base;
    const ids = grupo.map((g) => g.fornecedorId);
    let rows: any[] = [];
    try {
      rows = await this.dataSource.query(
        `SELECT id, status, fornecedores, ordem_final, criterio_decisivo FROM desempates
          WHERE unidade_id::text = $1 AND status <> 'CANCELADO' ORDER BY created_at DESC`,
        [ctx.unidadeId],
      );
    } catch (e: any) {
      this.logger.warn(`Desempates da unidade ${ctx.unidadeId} não lidos: ${e?.message ?? e}`);
    }
    const cobre = (lista: unknown) => Array.isArray(lista) && ids.every((id) => (lista as string[]).includes(id));
    const resolvido = rows.find((r) => r.status === StatusDesempate.RESOLVIDO && cobre(r.ordem_final));
    if (resolvido) {
      const ordem: string[] = resolvido.ordem_final;
      return [...grupo]
        .sort((a, b) => ordem.indexOf(a.fornecedorId) - ordem.indexOf(b.fornecedorId))
        .map((e) => ({
          ...e,
          desempate: { pendente: false, desempateId: String(resolvido.id), etapa: StatusDesempate.RESOLVIDO, criterioDecisivo: resolvido.criterio_decisivo },
        }));
    }
    const aberto = rows.find((r) => STATUS_ABERTOS.includes(r.status) && cobre(r.fornecedores));
    return base.map((e) => ({
      ...e,
      desempate: aberto
        ? { pendente: true, desempateId: String(aberto.id), etapa: String(aberto.status) }
        : { pendente: true, desempateId: null, etapa: 'AGUARDANDO_DISPUTA_FINAL' },
    }));
  }

  // ==========================================================================
  // APOIO
  // ==========================================================================

  private async sessao(sessaoId: string, m?: EntityManager): Promise<{ id: string; licitacao_id: string }> {
    const [s] = await (m ?? this.dataSource.manager).query(`SELECT id, licitacao_id FROM sessoes_disputa WHERE id = $1`, [sessaoId]);
    if (!s) throw new NotFoundException('Sessão não encontrada');
    return { id: String(s.id), licitacao_id: String(s.licitacao_id) };
  }

  private rotulo(u: Pick<UnidadeJulgamento, 'tipo' | 'numero'>) {
    return `${u.tipo === 'LOTE' ? 'Lote' : 'Item'} ${u.numero}`;
  }

  private async nomes(ids: string[], m?: EntityManager): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows: any[] = await (m ?? this.dataSource.manager).query(
      `SELECT id::text AS id, razao_social FROM fornecedores WHERE id::text = ANY($1::text[])`,
      [[...new Set(ids)]],
    );
    return new Map(rows.map((r) => [String(r.id), String(r.razao_social)]));
  }

  private async evento(
    m: EntityManager,
    e: { sessaoId: string | null; descricao: string; itemId?: string | null; dados?: Record<string, any>; usuario?: string; sistema?: boolean },
  ) {
    if (!e.sessaoId) return;
    await m.save(
      m.create(EventoSessao, {
        sessao_id: e.sessaoId,
        tipo: TipoEvento.MENSAGEM_SISTEMA,
        descricao: e.descricao,
        item_id: e.itemId ?? undefined,
        dados_adicionais: { origem: 'DESEMPATE_ART60', ...(e.dados ?? {}) },
        usuario_nome: e.usuario ?? 'Sistema',
        is_sistema: e.sistema ?? true,
      }),
    );
  }

  /** Ato do agente: licitação ATIVA (FOR SHARE) em JULGAMENTO + trava da unidade. */
  private async prepararAto(m: EntityManager, licitacaoId: string, unidadeId: string) {
    const lic = await exigirLicitacaoAtiva(m, licitacaoId, { bloquear: true });
    if (lic.fase !== FaseLicitacao.JULGAMENTO) {
      throw new ConflictException(`O desempate ocorre no julgamento (depois da etapa de lances); a licitação está em ${lic.fase}.`);
    }
    await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`desempate:${unidadeId}`]);
  }

  private async desempateTravado(m: EntityManager, id: string, licitacaoId: string): Promise<Desempate> {
    const d = await m.findOne(Desempate, { where: { id, licitacao_id: licitacaoId }, lock: { mode: 'pessimistic_write' } });
    if (!d) throw new NotFoundException('Desempate não encontrado nesta licitação');
    return d;
  }

  /** Grupos empatados do ranking (entradas não excluídas, consecutivas, com a mesma chave). */
  gruposEmpatados(ranking: EntradaRanking[]): GrupoEmpatado[] {
    const validas = ranking.filter((e) => !e.excluido && e.empatado);
    const grupos: GrupoEmpatado[] = [];
    for (const e of validas) {
      const pontuado = e.criterio?.pontuacao != null;
      const casas = pontuado ? CASAS_INDICE : 2;
      const k = Math.round(chaveDaEntrada(e) * 10 ** casas);
      const ult = grupos[grupos.length - 1];
      const ultK = ult ? Math.round(ult.valor * 10 ** casas) : null;
      const contiguo = ult && ranking.indexOf(ult.entradas[ult.entradas.length - 1]) === ranking.indexOf(e) - 1;
      if (ult && contiguo && ultK === k) {
        ult.entradas.push(e);
      } else {
        grupos.push({
          chave: pontuado ? 'PONTUACAO' : 'VALOR',
          valor: chaveDaEntrada(e),
          entradas: [e],
          pendente: !!e.desempate?.pendente,
          etapa: e.desempate?.etapa ?? 'AGUARDANDO_DISPUTA_FINAL',
          desempateId: e.desempate?.desempateId ?? null,
        });
      }
    }
    return grupos.filter((g) => g.entradas.length > 1);
  }

  private visao(d: Desempate, nomes: Map<string, string>, ofertas: DesempateOferta[], paraFornecedor?: string) {
    const encerrada = !!d.disputa_final_encerrada_em;
    const agora = Date.now();
    return {
      id: d.id,
      status: d.status,
      tipoUnidade: d.tipo_unidade,
      unidadeId: d.unidade_id,
      chave: d.chave,
      valorEmpatado: Number(d.valor_empatado),
      fornecedores: (d.fornecedores ?? []).map((id) => ({ fornecedorId: id, razaoSocial: nomes.get(id) ?? null })),
      disputaFinal: {
        aplicada: !d.disputa_final_nao_aplicada,
        motivoNaoAplicada: d.disputa_final_nao_aplicada,
        convocadaEm: d.disputa_final_convocada_em,
        prazoMinutos: d.disputa_final_prazo_minutos,
        prazoAte: d.disputa_final_prazo_ate,
        prazoExpirado: d.disputa_final_prazo_ate ? new Date(d.disputa_final_prazo_ate).getTime() <= agora : null,
        encerradaEm: d.disputa_final_encerrada_em,
        ofertasRecebidas: ofertas.length,
        // Sigilo: valores só depois do encerramento; antes, o licitante vê só a própria
        ofertas: encerrada
          ? ofertas.map((o) => ({ fornecedorId: o.fornecedor_id, razaoSocial: nomes.get(o.fornecedor_id) ?? null, valor: Number(o.valor), enviadaEm: o.enviada_em }))
          : null,
        minhaOferta: paraFornecedor
          ? (() => {
              const o = ofertas.find((x) => x.fornecedor_id === paraFornecedor);
              return o ? { valor: Number(o.valor), enviadaEm: o.enviada_em } : null;
            })()
          : undefined,
      },
      trilha: d.trilha ?? [],
      blocos: d.blocos,
      ordemFinal: d.ordem_final ? d.ordem_final.map((id, i) => ({ posicao: i + 1, fornecedorId: id, razaoSocial: nomes.get(id) ?? null })) : null,
      criterioDecisivo: d.criterio_decisivo,
      sorteio: d.sorteio_ato_em
        ? { atoEm: d.sorteio_ato_em, algoritmo: d.sorteio_algoritmo, descricaoAlgoritmo: DESCRICAO_ALGORITMO_SORTEIO, registros: d.sorteio ?? [] }
        : null,
      resolvidoEm: d.resolvido_em,
    };
  }

  private async ofertasDe(ids: string[], m?: EntityManager): Promise<DesempateOferta[]> {
    if (!ids.length) return [];
    return (m ?? this.dataSource.manager)
      .getRepository(DesempateOferta)
      .createQueryBuilder('o')
      .where('o.desempate_id IN (:...ids)', { ids })
      .orderBy('o.enviada_em', 'ASC')
      .getMany();
  }

  // ==========================================================================
  // LEITURAS
  // ==========================================================================

  /** Painel do agente (órgão dono): por unidade encerrada, grupos empatados e desempates registrados. */
  async painel(sessaoId: string) {
    const sessao = await this.sessao(sessaoId);
    await this.encerrarVencidos(sessao.licitacao_id);
    const criterio = await criterioDaLicitacao(this.dataSource.manager, sessao.licitacao_id);
    const rankings = await this.ranking.rankingsDaLicitacao(sessao.licitacao_id);
    const registros = await this.dataSource.getRepository(Desempate).find({
      where: { licitacao_id: sessao.licitacao_id },
      order: { created_at: 'ASC' },
    });
    const ofertas = await this.ofertasDe(registros.map((r) => r.id));
    const ids = [...rankings.flatMap((r) => r.ranking.map((e) => e.fornecedorId)), ...registros.flatMap((r) => r.fornecedores ?? [])];
    const nomes = await this.nomes(ids);
    return {
      sessaoId,
      licitacaoId: sessao.licitacao_id,
      criterio,
      disputaFinalAplicavel: !motivoSemDisputaFinal(criterio),
      motivoSemDisputaFinal: motivoSemDisputaFinal(criterio),
      prazoPadraoMinutos: PRAZO_DISPUTA_FINAL_PADRAO_MINUTOS,
      criterios: CRITERIOS_ART60,
      unidades: rankings
        .filter(({ unidade }) => unidade.encerrada)
        .map(({ unidade, ranking }) => {
          const grupos = this.gruposEmpatados(ranking);
          const doUnidade = registros.filter((r) => r.unidade_id === unidade.id);
          return {
            tipo: unidade.tipo,
            id: unidade.id,
            numero: unidade.numero,
            descricao: unidade.descricao,
            gruposEmpatados: grupos.map((g) => ({
              chave: g.chave,
              valor: g.valor,
              pendente: g.pendente,
              etapa: g.etapa,
              desempateId: g.desempateId,
              licitantes: g.entradas.map((e) => ({
                fornecedorId: e.fornecedorId,
                razaoSocial: nomes.get(e.fornecedorId) ?? e.fornecedorNome,
                posicao: e.posicao,
                melhorValor: e.melhorValor,
                pontuacao: e.criterio?.pontuacao ?? null,
              })),
            })),
            podeIniciar: grupos.some((g) => g.pendente && !g.desempateId) && !doUnidade.some((r) => STATUS_ABERTOS.includes(r.status)),
            desempates: doUnidade.map((d) => this.visao(d, nomes, ofertas.filter((o) => o.desempate_id === d.id))),
          };
        }),
    };
  }

  /** Licitante: os desempates de que participa (sem valores de terceiros antes do encerramento). */
  async minhas(sessaoId: string, fornecedorId: string) {
    const sessao = await this.sessao(sessaoId);
    await this.encerrarVencidos(sessao.licitacao_id);
    const registros = (
      await this.dataSource.getRepository(Desempate).find({ where: { licitacao_id: sessao.licitacao_id }, order: { created_at: 'ASC' } })
    ).filter((d) => (d.fornecedores ?? []).includes(fornecedorId) && d.status !== StatusDesempate.CANCELADO);
    const ofertas = await this.ofertasDe(registros.map((r) => r.id));
    const nomes = await this.nomes(registros.flatMap((r) => r.fornecedores ?? []));
    const numeros = await this.numerosDasUnidades(registros.map((r) => r.unidade_id));
    return {
      sessaoId,
      desempates: registros.map((d) => ({
        ...this.visao(d, nomes, ofertas.filter((o) => o.desempate_id === d.id), fornecedorId),
        unidadeNumero: numeros.get(d.unidade_id) ?? null,
        convocadoDisputaFinal:
          d.status === StatusDesempate.EM_DISPUTA_FINAL &&
          !ofertas.some((o) => o.desempate_id === d.id && o.fornecedor_id === fornecedorId) &&
          !!d.disputa_final_prazo_ate &&
          new Date(d.disputa_final_prazo_ate).getTime() > Date.now(),
      })),
    };
  }

  private async numerosDasUnidades(ids: string[]): Promise<Map<string, number>> {
    if (!ids.length) return new Map();
    const rows: any[] = await this.dataSource.query(
      `SELECT id::text AS id, numero_item AS n FROM itens_licitacao WHERE id::text = ANY($1::text[])
        UNION ALL SELECT id::text, numero FROM lotes_licitacao WHERE id::text = ANY($1::text[])`,
      [ids],
    );
    return new Map(rows.map((r) => [String(r.id), Number(r.n)]));
  }

  /** Confere os sorteios registrados (refaz a conta a partir da entrada pública). */
  async conferir(sessaoId: string, desempateId: string) {
    const sessao = await this.sessao(sessaoId);
    const d = await this.dataSource.getRepository(Desempate).findOne({ where: { id: desempateId, licitacao_id: sessao.licitacao_id } });
    if (!d) throw new NotFoundException('Desempate não encontrado nesta licitação');
    const registros = (d.sorteio ?? []).map((r: any) => ({ ...r, conferido: conferirSorteio(r) }));
    return {
      desempateId: d.id,
      algoritmo: d.sorteio_algoritmo,
      descricaoAlgoritmo: DESCRICAO_ALGORITMO_SORTEIO,
      atoEm: d.sorteio_ato_em,
      registros,
      conferido: registros.length > 0 && registros.every((r: any) => r.conferido),
    };
  }

  // ==========================================================================
  // ATOS DO AGENTE
  // ==========================================================================

  /**
   * Inicia o desempate do 1º grupo empatado PENDENTE da unidade: convoca a
   * DISPUTA FINAL (art. 60 I) com prazo em minutos — ou, quando ela não se
   * aplica ao critério, já aplica os critérios II..§1º IV.
   */
  async iniciar(sessaoId: string, unidadeId: string, opts: { prazoMinutos?: number | null }, ator: AtorTransicao, usuarioNome?: string) {
    const sessao = await this.sessao(sessaoId);
    const u = await this.ranking.unidade(unidadeId);
    if (!u || u.licitacaoId !== sessao.licitacao_id) throw new NotFoundException('Unidade não encontrada nesta licitação');
    const invalido = motivoPrazoDisputaFinalInvalido(opts.prazoMinutos);
    if (invalido) throw new BadRequestException(invalido);
    const minutos = opts.prazoMinutos != null ? Number(opts.prazoMinutos) : PRAZO_DISPUTA_FINAL_PADRAO_MINUTOS;

    const id = await this.dataSource.transaction(async (m) => {
      await this.prepararAto(m, u.licitacaoId, u.id);
      if (!u.encerrada) throw new ConflictException(`${this.rotulo(u)}: a etapa de lances ainda não terminou`);
      const aberto = await m.query(`SELECT 1 FROM desempates WHERE unidade_id = $1 AND status = ANY($2) LIMIT 1`, [u.id, STATUS_ABERTOS]);
      if (aberto.length) throw new ConflictException(`${this.rotulo(u)}: já há um desempate em andamento`);
      const ranking = await this.ranking.ranking(u, m);
      const grupo = this.gruposEmpatados(ranking).find((g) => g.pendente && !g.desempateId);
      if (!grupo) throw new ConflictException(`${this.rotulo(u)}: não há empate pendente`);
      const ids = grupo.entradas.map((e) => e.fornecedorId).sort();
      const criterio = await criterioDaLicitacao(m, u.licitacaoId);
      const semDisputaFinal = motivoSemDisputaFinal(criterio);
      const agora = new Date();
      const d = await m.save(
        m.create(Desempate, {
          licitacao_id: u.licitacaoId,
          sessao_id: sessao.id,
          tipo_unidade: u.tipo,
          unidade_id: u.id,
          status: StatusDesempate.EM_DISPUTA_FINAL,
          fornecedores: ids,
          valor_empatado: grupo.valor,
          chave: grupo.chave,
          ator_tipo: ator.tipo,
          ator_id: ator.id,
          ...(semDisputaFinal
            ? { disputa_final_nao_aplicada: semDisputaFinal }
            : {
                disputa_final_convocada_em: agora,
                disputa_final_prazo_minutos: minutos,
                disputa_final_prazo_ate: new Date(agora.getTime() + minutos * 60_000),
              }),
        }),
      );
      const valorTxt = grupo.chave === 'VALOR' ? brl(grupo.valor) : `pontuação ${grupo.valor.toFixed(CASAS_INDICE)}`;
      if (semDisputaFinal) {
        await this.evento(m, {
          sessaoId: sessao.id,
          itemId: u.tipo === 'ITEM' ? u.id : null,
          usuario: usuarioNome,
          sistema: false,
          descricao: `${this.rotulo(u)}: empate entre ${ids.length} licitantes (${valorTxt}). Desempate pelo art. 60 da Lei 14.133/2021 — disputa final: ${semDisputaFinal}`,
          dados: { desempate_id: d.id, unidade_id: u.id },
        });
        await this.aplicarCriterios(m, d, u, [ids], [passoDisputaFinal({ aplicada: false, motivo: semDisputaFinal, blocos: [ids] })]);
      } else {
        await this.evento(m, {
          sessaoId: sessao.id,
          itemId: u.tipo === 'ITEM' ? u.id : null,
          usuario: usuarioNome,
          sistema: false,
          descricao:
            `${this.rotulo(u)}: empate entre ${ids.length} licitantes (${valorTxt}). Convocados para a DISPUTA FINAL ` +
            `(Lei 14.133/2021, art. 60, I): nova proposta, sigilosa até o encerramento, até ${dataHora(d.disputa_final_prazo_ate!)} (${minutos} min).`,
          dados: { desempate_id: d.id, unidade_id: u.id, prazo_ate: d.disputa_final_prazo_ate, fornecedores: ids },
        });
      }
      return d.id;
    });
    return this.visaoPorId(id);
  }

  /** Critérios II..§1º IV sobre os blocos; resolve ou deixa AGUARDANDO_SORTEIO. */
  private async aplicarCriterios(m: EntityManager, d: Desempate, u: UnidadeJulgamento, blocos: string[][], trilhaInicial: any[]) {
    const { dados, ctx } = await dadosParaDesempate(m, u.licitacaoId, d.fornecedores);
    const auto = aplicarCriteriosAutomaticos(blocos, dados, ctx);
    const trilha = [...trilhaInicial, ...auto.trilha];
    d.trilha = trilha;
    d.blocos = auto.blocos;
    if (empateResolvido(auto.blocos)) {
      d.status = StatusDesempate.RESOLVIDO;
      d.ordem_final = auto.blocos.flat();
      d.criterio_decisivo = criterioDecisivo(trilha);
      d.resolvido_em = new Date();
    } else {
      d.status = StatusDesempate.AGUARDANDO_SORTEIO;
    }
    await m.save(d);
    const nomes = await this.nomes(d.fornecedores, m);
    const resumo = auto.trilha
      .map((p) => `${p.baseLegal}: ${p.aplicavel ? (p.desempatou ? 'desempatou' : 'sem efeito') : 'não aplicável'}`)
      .join('; ');
    await this.evento(m, {
      sessaoId: d.sessao_id,
      itemId: u.tipo === 'ITEM' ? u.id : null,
      descricao:
        `${this.rotulo(u)}: critérios de desempate aplicados (${resumo}). ` +
        (d.status === StatusDesempate.RESOLVIDO
          ? `Ordem final: ${d.ordem_final!.map((id, i) => `${i + 1}º ${nomes.get(id) ?? id}`).join(', ')}.`
          : 'Persistindo o empate, será realizado SORTEIO em ato público (IN SEGES 73/2022, art. 28, §2º).'),
      dados: { desempate_id: d.id, trilha, status: d.status },
    });
  }

  /** Grava a nova proposta da disputa final como lance DISPUTA_FINAL (item, ou lote + rateio). */
  private async gravarLance(m: EntityManager, u: UnidadeJulgamento, fornecedorId: string, valor: number, quando: Date): Promise<string> {
    const [f] = await m.query(`SELECT razao_social FROM fornecedores WHERE id::text = $1`, [fornecedorId]);
    const nome = f?.razao_social ?? 'Fornecedor';
    if (u.tipo === 'ITEM') {
      const base = await this.ranking.baseDaLicitacao(u.licitacaoId, m);
      const lance = await m.save(
        m.create(Lance, {
          licitacao_id: u.licitacaoId,
          item_id: u.id,
          fornecedor_id: fornecedorId,
          fornecedor_nome: nome,
          valor,
          ...valoresDoLance(valor, base, u.itens[0]?.quantidade ?? 1),
          base_lance: base,
          origem: OrigemLance.DISPUTA_FINAL,
          ip_origem: 'SISTEMA',
          cancelado: false,
          created_at: quando,
        } as Partial<Lance>),
      );
      return lance.id;
    }
    const itens: any[] = await m.query(
      `SELECT pi.item_licitacao_id::text AS item_id, pi.valor_unitario, pi.valor_total
         FROM proposta_itens pi JOIN propostas p ON p.id = pi.proposta_id
        WHERE p.licitacao_id = $1 AND p.fornecedor_id::text = $2 AND p.status::text IN ('CLASSIFICADA','RECEBIDA','ENVIADA','ACEITA','VENCEDORA')
          AND pi.item_licitacao_id::text = ANY($3::text[])`,
      [u.licitacaoId, fornecedorId, u.itens.map((i) => i.id)],
    );
    const parcelas = ratearLanceLote(
      u.itens.map((i) => {
        const pi = itens.find((x) => x.item_id === i.id);
        const total = Number(pi?.valor_total) > 0 ? Number(pi.valor_total) : Math.round(Number(pi?.valor_unitario ?? 0) * i.quantidade * 100) / 100;
        return { itemId: i.id, numero: i.numero, quantidade: i.quantidade, valorTotalProposta: total };
      }),
      valor,
    );
    const comum = {
      licitacao_id: u.licitacaoId,
      lote_id: u.id,
      fornecedor_id: fornecedorId,
      fornecedor_nome: nome,
      valor,
      base_lance: BaseLance.TOTAL_LOTE,
      origem: OrigemLance.DISPUTA_FINAL,
      ip_origem: 'SISTEMA',
      cancelado: false,
      created_at: quando,
    };
    const pai = await m.save(
      m.create(Lance, { ...comum, item_id: null as any, lance_lote_id: null, valor_total: valor, valor_unitario: null } as Partial<Lance>),
    );
    await m.save(
      parcelas.map((p) =>
        m.create(Lance, { ...comum, item_id: p.itemId, lance_lote_id: pai.id, valor_total: p.valor_total, valor_unitario: p.valor_unitario } as Partial<Lance>),
      ),
    );
    return pai.id;
  }

  /**
   * Encerra a disputa final (prazo vencido ou todos enviaram): propostas →
   * lances DISPUTA_FINAL, ranking refeito, critérios II..§1º IV no que
   * continuar empatado. `automatico` = encerramento pelo prazo (leituras).
   */
  async encerrarDisputaFinal(sessaoId: string | null, desempateId: string, ator: AtorTransicao, opts: { automatico?: boolean; usuarioNome?: string } = {}) {
    const [d0] = await this.dataSource.query(`SELECT licitacao_id, unidade_id FROM desempates WHERE id = $1`, [desempateId]);
    if (!d0) throw new NotFoundException('Desempate não encontrado');
    if (sessaoId) {
      const s = await this.sessao(sessaoId);
      if (s.licitacao_id !== String(d0.licitacao_id)) throw new NotFoundException('Desempate não encontrado nesta licitação');
    }
    const u = await this.ranking.unidade(String(d0.unidade_id));
    if (!u) throw new NotFoundException('Unidade não encontrada');
    await this.dataSource.transaction(async (m) => {
      await this.prepararAto(m, u.licitacaoId, u.id);
      const d = await this.desempateTravado(m, desempateId, u.licitacaoId);
      if (d.status !== StatusDesempate.EM_DISPUTA_FINAL || d.disputa_final_encerrada_em) {
        if (opts.automatico) return;
        throw new ConflictException('A disputa final deste desempate não está em andamento');
      }
      const ofertas = await m.find(DesempateOferta, { where: { desempate_id: d.id }, order: { enviada_em: 'ASC' } });
      const vencido = !!d.disputa_final_prazo_ate && new Date(d.disputa_final_prazo_ate).getTime() <= Date.now();
      const todos = d.fornecedores.every((id) => ofertas.some((o) => o.fornecedor_id === id));
      if (!vencido && !todos) {
        if (opts.automatico) return;
        throw new ConflictException(
          `A disputa final está no prazo (até ${dataHora(d.disputa_final_prazo_ate!)}) e nem todos os empatados enviaram nova proposta.`,
        );
      }
      const agora = new Date();
      for (const o of ofertas) {
        o.lance_id = await this.gravarLance(m, u, o.fornecedor_id, Number(o.valor), agora);
        await m.save(o);
      }
      d.disputa_final_encerrada_em = agora;

      // Ranking refeito com as novas propostas: blocos pela chave (valor ou pontuação)
      const ranking = await this.ranking.ranking(u, m);
      const membros = ranking.filter((e) => !e.excluido && d.fornecedores.includes(e.fornecedorId));
      const pontuado = d.chave === 'PONTUACAO';
      const direcao: DirecaoLance = pontuado ? 'MAIOR' : await this.modos.direcao(u.licitacaoId, m);
      const blocos = blocosPorChave(
        membros.map((e) => ({ fornecedorId: e.fornecedorId, chave: chaveDaEntrada(e), registradoEm: e.registradoEm.getTime() })),
        direcao,
        pontuado ? CASAS_INDICE : 2,
      );
      const nomes = await this.nomes(d.fornecedores, m);
      const listaOfertas = ofertas.map((o) => ({ fornecedorId: o.fornecedor_id, valor: Number(o.valor) }));
      await this.evento(m, {
        sessaoId: d.sessao_id,
        itemId: u.tipo === 'ITEM' ? u.id : null,
        usuario: opts.usuarioNome,
        sistema: !!opts.automatico,
        descricao:
          `${this.rotulo(u)}: disputa final encerrada (${vencido ? 'fim do prazo' : 'todos enviaram'}). ` +
          (listaOfertas.length
            ? `Novas propostas: ${listaOfertas.map((o) => `${nomes.get(o.fornecedorId) ?? o.fornecedorId} ${brl(o.valor)}`).join('; ')}.`
            : 'Nenhuma nova proposta.'),
        dados: { desempate_id: d.id, ofertas: listaOfertas },
      });
      await this.aplicarCriterios(m, d, u, blocos, [passoDisputaFinal({ aplicada: true, blocos, ofertas: listaOfertas })]);
    });
    return this.visaoPorId(desempateId);
  }

  /** Encerra, pelo prazo, as disputas finais vencidas da licitação (chamado nas leituras). */
  async encerrarVencidos(licitacaoId: string): Promise<void> {
    // Prazo comparado no JS (timestamp sem fuso: mesma conversão da gravação)
    const abertos = await this.dataSource.getRepository(Desempate).find({
      where: { licitacao_id: licitacaoId, status: StatusDesempate.EM_DISPUTA_FINAL },
      select: { id: true, disputa_final_prazo_ate: true, disputa_final_encerrada_em: true },
    });
    const vencidos = abertos.filter(
      (d) => !d.disputa_final_encerrada_em && d.disputa_final_prazo_ate && new Date(d.disputa_final_prazo_ate).getTime() <= Date.now(),
    );
    for (const v of vencidos) {
      try {
        await this.encerrarDisputaFinal(null, String(v.id), atorSistema('desempate'), { automatico: true });
      } catch (e: any) {
        this.logger.warn(`Disputa final ${v.id} não encerrada pelo prazo: ${e?.message ?? e}`);
      }
    }
  }

  /**
   * SORTEIO em ato público (IN 73 art. 28 §2º): grava o instante do ato,
   * sorteia cada bloco ainda empatado (sorteio.ts) e registra entrada,
   * semente, algoritmo e ordem — no desempate e no evento da sala.
   */
  async sortear(sessaoId: string, desempateId: string, ator: AtorTransicao, usuarioNome?: string) {
    const sessao = await this.sessao(sessaoId);
    const [d0] = await this.dataSource.query(`SELECT unidade_id FROM desempates WHERE id = $1 AND licitacao_id = $2`, [desempateId, sessao.licitacao_id]);
    if (!d0) throw new NotFoundException('Desempate não encontrado nesta licitação');
    const u = await this.ranking.unidade(String(d0.unidade_id));
    if (!u) throw new NotFoundException('Unidade não encontrada');
    await this.dataSource.transaction(async (m) => {
      await this.prepararAto(m, u.licitacaoId, u.id);
      const d = await this.desempateTravado(m, desempateId, u.licitacaoId);
      if (d.status !== StatusDesempate.AGUARDANDO_SORTEIO) {
        throw new ConflictException(
          d.status === StatusDesempate.EM_DISPUTA_FINAL
            ? 'O sorteio só ocorre depois da disputa final e dos demais critérios do art. 60'
            : 'Este desempate não aguarda sorteio',
        );
      }
      // 1. Instante do ato público, registrado ANTES do cálculo (entra na semente)
      const atoEm = new Date();
      await m.query(`UPDATE desempates SET sorteio_ato_em = $2, updated_at = now() WHERE id = $1`, [d.id, atoEm]);
      d.sorteio_ato_em = atoEm;
      // 2. Sorteio de cada bloco ainda empatado
      const s = sortearBlocos(u.licitacaoId, u.id, d.blocos ?? [d.fornecedores], atoEm);
      d.sorteio_algoritmo = s.registros[0]?.algoritmo ?? null;
      d.sorteio = s.registros;
      d.trilha = [...(d.trilha ?? []), s.passo];
      d.blocos = s.blocos;
      d.ordem_final = s.blocos.flat();
      d.criterio_decisivo = 'SORTEIO';
      d.status = StatusDesempate.RESOLVIDO;
      d.resolvido_em = new Date();
      await m.save(d);
      const nomes = await this.nomes(d.fornecedores, m);
      await this.evento(m, {
        sessaoId: d.sessao_id,
        itemId: u.tipo === 'ITEM' ? u.id : null,
        usuario: usuarioNome,
        sistema: false,
        descricao:
          `${this.rotulo(u)}: SORTEIO em ato público (IN SEGES 73/2022, art. 28, §2º) realizado em ${dataHora(atoEm)}. ` +
          `Resultado: ${d.ordem_final.map((id, i) => `${i + 1}º ${nomes.get(id) ?? id}`).join(', ')}. ` +
          s.registros.map((r) => `Entrada pública: "${r.entrada}" · semente SHA-256 ${r.semente} · algoritmo ${r.algoritmo}`).join(' | '),
        dados: { desempate_id: d.id, sorteio: s.registros, ato_em: atoEm.toISOString(), algoritmo: DESCRICAO_ALGORITMO_SORTEIO },
      });
    });
    return this.visaoPorId(desempateId);
  }

  // ==========================================================================
  // ATO DO LICITANTE
  // ==========================================================================

  /** Nova proposta SELADA na disputa final — uma por licitante, melhor que o seu valor atual. */
  async enviarOferta(sessaoId: string, desempateId: string, fornecedorId: string, valor: number) {
    const sessao = await this.sessao(sessaoId);
    let todosEnviaram = false;
    await this.dataSource.transaction(async (m) => {
      await exigirLicitacaoAtiva(m, sessao.licitacao_id, { bloquear: true });
      const d = await m.findOne(Desempate, { where: { id: desempateId, licitacao_id: sessao.licitacao_id }, lock: { mode: 'pessimistic_write' } });
      if (!d || !(d.fornecedores ?? []).includes(fornecedorId)) throw new NotFoundException('Convocação para disputa final não encontrada');
      if (d.status !== StatusDesempate.EM_DISPUTA_FINAL || d.disputa_final_encerrada_em || d.disputa_final_nao_aplicada) {
        throw new ConflictException('A disputa final deste desempate não está aberta');
      }
      if (!d.disputa_final_prazo_ate || new Date(d.disputa_final_prazo_ate).getTime() <= Date.now()) {
        throw new ConflictException('O prazo da disputa final terminou');
      }
      const ja = await m.findOne(DesempateOferta, { where: { desempate_id: d.id, fornecedor_id: fornecedorId } });
      if (ja) throw new ConflictException('A nova proposta da disputa final é única e já foi enviada');
      // Referência: o valor ATUAL do licitante (na técnica e preço a chave é o índice, a proposta é preço)
      const ofertas = await this.disputa.rankingDoItem(d.unidade_id, m);
      const atual = ofertas.find((o) => o.fornecedorId === fornecedorId);
      if (!atual) throw new ConflictException('Licitante sem oferta ativa nesta unidade');
      const direcao = await this.modos.direcao(sessao.licitacao_id, m);
      const erro = motivoOfertaDisputaFinalInvalida(Number(valor), atual.melhorValor, direcao);
      if (erro) throw new BadRequestException(erro);
      await m.save(m.create(DesempateOferta, { desempate_id: d.id, fornecedor_id: fornecedorId, valor: Number(valor), enviada_em: new Date() }));
      const total = await m.count(DesempateOferta, { where: { desempate_id: d.id } });
      todosEnviaram = total >= d.fornecedores.length;
      await this.evento(m, {
        sessaoId: d.sessao_id,
        descricao: `Disputa final: nova proposta recebida (${total} de ${d.fornecedores.length}) — sigilosa até o encerramento.`,
        dados: { desempate_id: d.id, recebidas: total },
      });
    });
    if (todosEnviaram) {
      await this.encerrarDisputaFinal(sessaoId, desempateId, atorSistema('desempate'), { automatico: true }).catch((e) =>
        this.logger.warn(`Encerramento da disputa final ${desempateId}: ${e?.message ?? e}`),
      );
    }
    return (await this.minhas(sessaoId, fornecedorId)).desempates.find((x) => x.id === desempateId) ?? null;
  }

  private async visaoPorId(id: string) {
    const d = await this.dataSource.getRepository(Desempate).findOne({ where: { id } });
    if (!d) throw new NotFoundException('Desempate não encontrado');
    const ofertas = await this.ofertasDe([d.id]);
    return this.visao(d, await this.nomes(d.fornecedores ?? []), ofertas);
  }

  /** Critério pontuado da licitação? (usado pela tela para rótulos) */
  static criterioPontuado(c: string) {
    return ehCriterioPontuado(c);
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RankingService, UnidadeJulgamento } from './ranking.service';
import { EntradaRanking } from './regras-julgamento';
import { FaseLote, ORDEM_FASES_LOTE, ROTULO_FASE_LOTE, anexoVisivel, faseDoLote } from './visao-lotes.regras';
import { STATUS_RECURSO_PENDENTES } from '../sessao/regras-recursos';
import { ModoDisputaService } from '../disputa/modo-disputa.service';

/** Quantos lances a lista ao vivo devolve (os mais recentes). */
const LIMITE_LANCES_AO_VIVO = 60;

/** Quem olha a sala: o órgão dono ou um licitante (pelo token). */
export type VisaoSala = { tipo: 'ORGAO' } | { tipo: 'FORNECEDOR'; fornecedorId: string };

const SEM_RESULTADO = ['DESERTO', 'FRACASSADO', 'CANCELADO'];

/**
 * SALA POR FASES (dono, 09/11/2026 — organização de referência: BLL):
 *  - `visao`: cada lote/item com a fase, o início da fase, o 1º colocado e o
 *    melhor lance; para o licitante, a posição dele (Vencendo/Perdendo);
 *  - `classificacao`: todos os participantes da unidade (troféu), com o
 *    melhor valor, ME/EPP, situação e os anexos visíveis a quem olha.
 * Identidades: até o fim da etapa de lances, licitantes veem só os códigos
 * (Fornecedor A, B…); o órgão também, se a anonimização da sessão estiver ativa.
 */
@Injectable()
export class VisaoLotesService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly ranking: RankingService,
  ) {}

  private async contexto(sessaoId: string, licitacaoId: string, visao: VisaoSala) {
    const unidades = await this.ranking.unidades(licitacaoId);
    const [sessao] = await this.ds.query(`SELECT anonimizacao_ativa FROM sessoes_disputa WHERE id::text = $1`, [sessaoId]);
    const lancesEncerrados = unidades.every((u) => u.encerrada || (u.itens.length > 0 && u.itens.every((i) => SEM_RESULTADO.includes(String(i.status)))));
    const anonimizar = !lancesEncerrados && (visao.tipo === 'FORNECEDOR' || !!sessao?.anonimizacao_ativa);
    const codigos = new Map<string, string>(
      (await this.ds.query(`SELECT fornecedor_id::text AS f, codigo_anonimo AS c FROM mapeamento_anonimo WHERE sessao_id::text = $1`, [sessaoId])).map(
        (r: any) => [String(r.f), String(r.c)],
      ),
    );
    return { unidades, lancesEncerrados, anonimizar, codigos };
  }

  private async rankingDe(u: UnidadeJulgamento): Promise<EntradaRanking[]> {
    return u.encerrada ? this.ranking.ranking(u) : this.ranking.rankingAoVivo(u);
  }

  /**
   * A fase de recursos dura enquanto houver recurso pendente, a janela de intenção estiver aberta
   * ou a janela final ainda não tiver sido aberta pela pregoeira. Antes, neste último caso o lote
   * aparecia "Em adjudicação" sem poder ser adjudicado (pregão 2026/00072) — e continuava aparecendo
   * assim enquanto outros itens ainda estavam em habilitação, porque a sessão só entra na etapa de
   * intenção quando todos são habilitados (ensaio com 20 itens, pregão 2026/00082).
   */
  private async recursosPendentes(licitacaoId: string): Promise<boolean> {
    const [r] = await this.ds.query(
      `SELECT (SELECT COUNT(*) FROM recursos_administrativos WHERE licitacao_id::text = $1 AND status::text = ANY($2::text[]))::int AS pendentes,
              (SELECT COUNT(*) FROM sessoes_disputa s
                WHERE s.licitacao_id::text = $1
                  AND NOT EXISTS (SELECT 1 FROM janelas_intencao_recurso j WHERE j.licitacao_id::text = $1 AND j.superada_em IS NULL
                                    AND COALESCE(j.momento, 'FINAL') <> 'HABILITACAO_PREVIA'))::int AS aguarda_janela`,
      [licitacaoId, [...STATUS_RECURSO_PENDENTES]],
    );
    if (Number(r?.pendentes) > 0 || Number(r?.aguarda_janela) > 0) return true;
    // O fim da janela é comparado aqui, como no serviço de recursos — e não com o now() do banco, cujo
    // fuso pode diferir do servidor: no Railway a janela aberta aparecia como encerrada (pregão 2026/00072)
    const janelas: Array<{ fecha_em: Date }> = await this.ds.query(
      `SELECT fecha_em FROM janelas_intencao_recurso WHERE licitacao_id::text = $1 AND superada_em IS NULL`,
      [licitacaoId],
    );
    const agora = Date.now();
    return janelas.some((j) => new Date(j.fecha_em).getTime() > agora);
  }

  private async estadoDisputa(licitacaoId: string): Promise<Map<string, { status: string | null; iniciada: Date | null; encerrada: Date | null }>> {
    const linhas: any[] = await this.ds.query(
      `SELECT id::text AS id, status_disputa::text AS status, disputa_iniciada_em AS iniciada, disputa_encerrada_em AS encerrada FROM itens_licitacao WHERE licitacao_id::text = $1
       UNION ALL
       SELECT id::text, status_disputa::text, disputa_iniciada_em, NULL FROM lotes_licitacao WHERE licitacao_id::text = $1`,
      [licitacaoId],
    );
    return new Map(linhas.map((l) => [l.id, { status: l.status ?? null, iniciada: l.iniciada ?? null, encerrada: l.encerrada ?? null }]));
  }

  private nome(fornecedorId: string, razao: string | undefined, ctx: { anonimizar: boolean; codigos: Map<string, string> }, souEu: boolean): string {
    if (souEu) return razao ?? 'Você';
    if (ctx.anonimizar) return ctx.codigos.get(fornecedorId) ?? 'Fornecedor';
    return razao ?? ctx.codigos.get(fornecedorId) ?? 'Fornecedor';
  }

  private async cadastro(ids: string[]): Promise<Map<string, { razao: string; me: boolean }>> {
    if (!ids.length) return new Map();
    const rows: any[] = await this.ds.query(`SELECT id::text AS id, razao_social, porte::text AS porte FROM fornecedores WHERE id::text = ANY($1::text[])`, [ids]);
    return new Map(rows.map((r) => [r.id, { razao: r.razao_social ?? '', me: ['ME', 'EPP', 'MEI'].includes(String(r.porte ?? '').toUpperCase()) }]));
  }

  async visao(sessaoId: string, licitacaoId: string, visao: VisaoSala) {
    const ctx = await this.contexto(sessaoId, licitacaoId, visao);
    const [disputa, recursos] = await Promise.all([this.estadoDisputa(licitacaoId), this.recursosPendentes(licitacaoId)]);
    const rankings = await Promise.all(ctx.unidades.map((u) => this.rankingDe(u)));
    const nomes = await this.cadastro([...new Set(rankings.flat().map((e) => e.fornecedorId))]);
    const eu = visao.tipo === 'FORNECEDOR' ? visao.fornecedorId : null;

    const lotes = ctx.unidades.map((u, i) => {
      const ranking = rankings[i];
      const d = disputa.get(u.id);
      const fase: FaseLote = faseDoLote({
        encerrada: u.encerrada,
        statusDisputa: d?.status ?? null,
        itensStatus: u.itens.map((it) => it.status),
        ranking: ranking.map((e) => ({ situacao: e.situacao, excluido: e.excluido, desempatePendente: !!e.desempate?.pendente })),
        recursosPendentes: recursos,
      });
      const ativos = ranking.filter((e) => !e.excluido);
      const lider = ativos[0] ?? null;
      const minha = eu ? ativos.findIndex((e) => e.fornecedorId === eu) : -1;
      const participo = eu ? ranking.some((e) => e.fornecedorId === eu) : true;
      return {
        id: u.id,
        tipo: u.tipo,
        numero: u.numero,
        descricao: u.descricao,
        fase,
        faseRotulo: ROTULO_FASE_LOTE[fase],
        inicioFase: fase === 'DISPUTA' ? d?.iniciada ?? null : null,
        valorEstimado: u.itens.reduce((s, it) => s + Number(it.valorTotalEstimado || 0), 0),
        participantes: ranking.length,
        primeiro: lider
          ? { nome: this.nome(lider.fornecedorId, nomes.get(lider.fornecedorId)?.razao, ctx, lider.fornecedorId === eu), valor: lider.melhorValor, souEu: lider.fornecedorId === eu }
          : null,
        melhorLance: lider?.melhorValor ?? null,
        ...(eu ? { participo, minhaPosicao: minha >= 0 ? minha + 1 : null, vencendo: minha === 0 } : {}),
      };
    });

    const contagem = Object.fromEntries(ORDEM_FASES_LOTE.map((f) => [f, lotes.filter((l) => l.fase === f).length])) as Record<FaseLote, number>;
    return {
      lancesEncerrados: ctx.lancesEncerrados,
      identidades: !ctx.anonimizar,
      fases: ORDEM_FASES_LOTE.map((f) => ({ fase: f, rotulo: ROTULO_FASE_LOTE[f], total: contagem[f] })),
      lotes: eu ? lotes.filter((l: any) => l.participo !== false) : lotes,
    };
  }

  async classificacao(sessaoId: string, licitacaoId: string, unidadeId: string, visao: VisaoSala) {
    const ctx = await this.contexto(sessaoId, licitacaoId, visao);
    const u = ctx.unidades.find((x) => x.id === unidadeId);
    if (!u) throw new NotFoundException('Lote/item não encontrado nesta sessão');
    const ranking = await this.rankingDe(u);
    const eu = visao.tipo === 'FORNECEDOR' ? visao.fornecedorId : null;
    if (eu && !ranking.some((e) => e.fornecedorId === eu)) throw new NotFoundException('Lote/item não encontrado nesta sessão');
    const ids = ranking.map((e) => e.fornecedorId);
    const nomes = await this.cadastro(ids);

    // Proposta adequada mais recente de cada licitante na unidade
    const aceitacoes: any[] = ids.length
      ? await this.ds.query(
          `SELECT DISTINCT ON (fornecedor_id) id::text AS id, fornecedor_id::text AS fornecedor_id, status::text AS status, arquivo_nome
             FROM aceitacoes_proposta WHERE unidade_id::text = $1 AND arquivo_nome IS NOT NULL
            ORDER BY fornecedor_id, created_at DESC`,
          [unidadeId],
        )
      : [];
    // Documentos de habilitação (por licitante) e o status da habilitação
    const docs: any[] = ids.length
      ? await this.ds.query(
          `SELECT d.id::text AS id, d.fornecedor_id::text AS fornecedor_id, COALESCE(d.arquivo_nome, d.cadastro->>'nomeArquivo', e.descricao) AS nome,
                  e.descricao AS exigencia, d.analise, h.status::text AS status_habilitacao
             FROM documentos_habilitacao d
             JOIN exigencias_habilitacao e ON e.id = d.exigencia_id
             JOIN habilitacoes_licitante h ON h.id = d.habilitacao_id
            WHERE d.licitacao_id::text = $1 AND d.fornecedor_id::text = ANY($2::text[])
            ORDER BY e.ordem, d.enviado_em`,
          [licitacaoId, ids],
        )
      : [];
    const souOrgao = visao.tipo === 'ORGAO';

    const participantes = ranking.map((e) => {
      const souDono = e.fornecedorId === eu;
      const ac = aceitacoes.find((a) => a.fornecedor_id === e.fornecedorId);
      const meusDocs = docs.filter((d) => d.fornecedor_id === e.fornecedorId);
      const propostaVisivel = !!ac && anexoVisivel({ tipo: 'PROPOSTA_ADEQUADA', souOrgao, souDono, statusAceitacao: ac.status });
      const habVisivel = meusDocs.length > 0 && anexoVisivel({ tipo: 'HABILITACAO', souOrgao, souDono, statusHabilitacao: meusDocs[0].status_habilitacao });
      return {
        posicao: e.posicao,
        participante: ctx.codigos.get(e.fornecedorId) ?? null,
        nome: this.nome(e.fornecedorId, nomes.get(e.fornecedorId)?.razao, ctx, souDono),
        souEu: souDono,
        melhorValor: e.melhorValor,
        me: nomes.get(e.fornecedorId)?.me ?? false,
        situacao: e.situacao,
        excluido: e.excluido,
        propostaAdequada: propostaVisivel ? { aceitacaoId: ac.id, nome: ac.arquivo_nome, status: ac.status } : null,
        documentos: habVisivel ? meusDocs.map((d) => ({ id: d.id, nome: d.nome, exigencia: d.exigencia, analise: d.analise })) : [],
        documentosOcultos: !habVisivel && meusDocs.length > 0 ? meusDocs.length : 0,
      };
    });
    const grupo = (sit: string[]) => participantes.filter((p) => sit.includes(p.situacao));
    return {
      unidade: { id: u.id, tipo: u.tipo, numero: u.numero, descricao: u.descricao },
      identidades: !ctx.anonimizar,
      classificados: participantes.filter((p) => !p.excluido),
      inabilitados: grupo(['INABILITADO']),
      desclassificados: grupo(['DESCLASSIFICADO', 'RECUSADO']),
    };
  }

  /**
   * LANCES AO VIVO da unidade (dono, 09/11/2026: "os fornecedores devem ver os
   * lances e a posição de cada um, respeitando a anonimização" — quem mira o 4º
   * lugar precisa saber quanto vale o 4º): a colocação de todos os participantes
   * e os últimos lances, na ordem em que entraram.
   *  - identidades: códigos (Fornecedor A, B…) até o fim da etapa de lances; o
   *    licitante se vê como "Você";
   *  - lance final fechado em curso continua sigiloso (mesmo filtro do ranking);
   *  - lances cancelados não aparecem.
   */
  async lancesAoVivo(sessaoId: string, licitacaoId: string, unidadeId: string, visao: VisaoSala) {
    const ctx = await this.contexto(sessaoId, licitacaoId, visao);
    const u = ctx.unidades.find((x) => x.id === unidadeId);
    if (!u) throw new NotFoundException('Lote/item não encontrado nesta sessão');
    const ranking = await this.rankingDe(u);
    const eu = visao.tipo === 'FORNECEDOR' ? visao.fornecedorId : null;
    if (eu && !ranking.some((e) => e.fornecedorId === eu)) throw new NotFoundException('Lote/item não encontrado nesta sessão');
    const nomes = await this.cadastro(ranking.map((e) => e.fornecedorId));
    const rotulo = (fornecedorId: string) => this.nome(fornecedorId, nomes.get(fornecedorId)?.razao, ctx, fornecedorId === eu);

    const linhas: any[] =
      u.tipo === 'LOTE'
        ? await this.ds.query(
            `SELECT l.id::text AS id, l.fornecedor_id::text AS f, l.valor, l.created_at, l.origem::text AS origem
               FROM lances l
              WHERE l.lote_id::text = $1 AND l.item_id IS NULL AND l.cancelado = false AND l.fornecedor_id IS NOT NULL
                AND ${ModoDisputaService.SQL_LANCE_LOTE_VISIVEL}
              ORDER BY l.created_at DESC LIMIT ${LIMITE_LANCES_AO_VIVO}`,
            [unidadeId],
          )
        : await this.ds.query(
            `SELECT l.id::text AS id, l.fornecedor_id::text AS f, l.valor, l.created_at, l.origem::text AS origem
               FROM lances l JOIN itens_licitacao i ON i.id = l.item_id
              WHERE l.item_id::text = $1 AND l.cancelado = false AND l.fornecedor_id IS NOT NULL
                AND ${ModoDisputaService.SQL_LANCE_VISIVEL}
              ORDER BY l.created_at DESC LIMIT ${LIMITE_LANCES_AO_VIVO}`,
            [unidadeId],
          );
    const posicaoDe = new Map(ranking.filter((e) => !e.excluido).map((e, i) => [e.fornecedorId, i + 1]));
    return {
      unidade: { id: u.id, tipo: u.tipo, numero: u.numero },
      identidades: !ctx.anonimizar,
      encerrada: u.encerrada,
      classificacao: ranking
        .filter((e) => !e.excluido)
        .map((e, i) => ({
          posicao: i + 1,
          participante: rotulo(e.fornecedorId),
          souEu: e.fornecedorId === eu,
          melhorValor: e.melhorValor,
          me: nomes.get(e.fornecedorId)?.me ?? false,
        })),
      lances: linhas.map((l) => ({
        id: l.id,
        participante: rotulo(String(l.f)),
        souEu: String(l.f) === eu,
        valor: parseFloat(l.valor),
        em: new Date(l.created_at).toISOString(),
        origem: l.origem,
        posicaoAtual: posicaoDe.get(String(l.f)) ?? null,
      })),
    };
  }

  /** Arquivo de anexo de OUTRO licitante: só se já for visível (decisão tomada). */
  async podeVerAnexo(tipo: 'PROPOSTA_ADEQUADA' | 'HABILITACAO', id: string, fornecedorId: string): Promise<boolean> {
    if (tipo === 'PROPOSTA_ADEQUADA') {
      const [a] = await this.ds.query(`SELECT fornecedor_id::text AS f, status::text AS status FROM aceitacoes_proposta WHERE id::text = $1`, [id]);
      return !!a && anexoVisivel({ tipo, souOrgao: false, souDono: a.f === fornecedorId, statusAceitacao: a.status });
    }
    const [d] = await this.ds.query(
      `SELECT d.fornecedor_id::text AS f, h.status::text AS status FROM documentos_habilitacao d JOIN habilitacoes_licitante h ON h.id = d.habilitacao_id WHERE d.id::text = $1`,
      [id],
    );
    return !!d && anexoVisivel({ tipo, souOrgao: false, souDono: d.f === fornecedorId, statusHabilitacao: d.status });
  }
}

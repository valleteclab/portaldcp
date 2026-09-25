import { FaseLicitacao, Licitacao } from '../entities/licitacao.entity';
import { AtoLicitacao, ContextoTransicao, DefinicaoAto, Efeito, EfeitoPersistido, Precondicao } from './transicoes.tipos';

/**
 * ============================================================================
 * FLUXOS DAS MODALIDADES ESPECIAIS (plano E7c) — leilão, concurso e diálogo
 * ============================================================================
 *
 * Montados a partir dos MESMOS atos do rito completo (`definicoes.ts` entrega
 * as definições base ao `montarFluxosEspeciais` — sem import circular). O que
 * cada modalidade acrescenta são pré-condições com a base legal e, quando a
 * lei cria um ato próprio, um ato nomeado:
 *
 *  LEILÃO (art. 31; Decreto 11.461/2023 como referência operacional)
 *    publicar (edital com bens, avaliação, preço mínimo, pagamento, leiloeiro
 *    — art. 31 §2º; 15 dias úteis — art. 55 III) → propostas (lance inicial
 *    ≥ preço mínimo) → disputa (maior lance) → JULGAMENTO (arrematante
 *    declarado) → recurso (art. 165; Dec. 11.461 art. 25) → pagamento →
 *    ADJUDICAR (arrematações pagas — art. 31 §4º; Dec. 11.461 art. 27) →
 *    HOMOLOGAR → termo de arrematação → CONCLUIR. Sem habilitação (art. 31 §4º).
 *  CONCURSO (art. 30)
 *    publicar (regulamento — art. 30 I a III; 35 dias úteis — art. 55 IV) →
 *    inscrições com trabalho sob código (sigilo de autoria) → banca (≥ 3 —
 *    art. 37 §1º) → JULGAR_CONCURSO (notas publicadas, autoria revelada) →
 *    qualificação do vencedor → recurso → ADJUDICAR → HOMOLOGAR → premiação
 *    e cessão de direitos (art. 30 parágrafo único; art. 93) → CONCLUIR.
 *  DIÁLOGO COMPETITIVO (art. 32)
 *    publicar (necessidades, exigências, critérios de pré-seleção — §1º I e
 *    II; 25 dias úteis) → manifestações de interesse → pré-seleção → diálogo
 *    (reuniões com ata e gravação — §1º VI; comissão ≥ 3 efetivos — §1º XI) →
 *    CONCLUIR_DIALOGO (decisão fundamentada — §1º V; juntada — §1º VIII) →
 *    ABRIR_FASE_COMPETITIVA (edital da solução, critérios, ≥ 60 dias úteis —
 *    §1º VIII) → rito da concorrência só com os pré-selecionados.
 *
 * As pendências vêm de `ctx.consultas.pendenciasModalidade(chave)` —
 * implementação SQL em `modalidades-especiais/pendencias.sql.ts`.
 */

/** Pré-condição por chave (SQL sem DI). */
export const pendenciaDaModalidade =
  (chave: string): Precondicao =>
  async (ctx: ContextoTransicao) => {
    if (!ctx.consultas.pendenciasModalidade) return null;
    return ctx.consultas.pendenciasModalidade(chave, { dados: ctx.dados, agora: ctx.agora, somenteAvaliacao: ctx.somenteAvaliacao });
  };

/**
 * Janela de intenção de recurso aberta e ENCERRADA sobre o resultado atual,
 * quando o resultado é declarado no JULGAMENTO (leilão/concurso). Mesma regra
 * do `janelaDeIntencaoEncerrada` do rito completo, na fase própria.
 */
export const janelaRecursalDoResultadoEncerrada: Precondicao = async (ctx) => {
  if (ctx.licitacao.fase !== FaseLicitacao.JULGAMENTO) return null;
  if (!ctx.consultas.estadoRecursal) return null;
  const e = await ctx.consultas.estadoRecursal();
  if (e.janelaEncerrada || e.janelaAberta) return null;
  return 'Abra o prazo de intenção de recurso (mínimo de 10 minutos) sobre o resultado declarado antes de seguir (art. 165 §1º I, Lei 14.133/2021; Decreto 11.461/2023, art. 25).';
};

/** Grava etapa/campos do diálogo na transação do ato. */
const sqlDialogo =
  (sql: string, params: (lic: Licitacao, ctx: ContextoTransicao) => any[]): EfeitoPersistido =>
  async (lic, m, ctx) => {
    await m.query(sql, params(lic, ctx));
  };

/** ABRIR_FASE_COMPETITIVA: cronograma e critério da fase competitiva passam a ser os da licitação. */
const gravarFaseCompetitiva: Efeito = (lic, ctx) => {
  const d = ctx.dados || {};
  for (const c of ['data_inicio_acolhimento', 'data_fim_acolhimento', 'data_abertura_sessao'] as const) {
    if (d[c]) (lic as any)[c] = new Date(d[c]);
  }
  // Novo edital: o limite de impugnação é o do art. 164 contado da nova abertura (ou o informado)
  (lic as any).data_limite_impugnacao = d.data_limite_impugnacao ? new Date(d.data_limite_impugnacao) : null;
  if (d.criterio_julgamento) (lic as any).criterio_julgamento = d.criterio_julgamento;
  if (d.modo_disputa) (lic as any).modo_disputa = d.modo_disputa;
};

function faseAposAbrirCompetitiva(_lic: Licitacao, ctx?: ContextoTransicao): FaseLicitacao {
  const inicio = ctx?.dados?.data_inicio_acolhimento ? new Date(ctx.dados.data_inicio_acolhimento) : null;
  return inicio && inicio.getTime() > (ctx?.agora ?? new Date()).getTime() ? FaseLicitacao.PUBLICADO : FaseLicitacao.ACOLHIMENTO_PROPOSTAS;
}

/** Definições base do rito completo, entregues por `definicoes.ts`. */
export interface AtosBase {
  etapasInternas: DefinicaoAto[];
  concluirFaseInterna: DefinicaoAto;
  publicar: DefinicaoAto;
  cancelarPublicacao: DefinicaoAto;
  retificarEdital: DefinicaoAto;
  iniciarAcolhimento: DefinicaoAto;
  encerrarAcolhimento: DefinicaoAto;
  iniciarDisputa: DefinicaoAto;
  encerrarDisputa: DefinicaoAto;
  iniciarHabilitacao: DefinicaoAto;
  abrirPrazoRecursal: DefinicaoAto;
  adjudicar: DefinicaoAto;
  decidirRecursos: DefinicaoAto;
  retornarJulgamento: DefinicaoAto;
  retornarHabilitacao: DefinicaoAto;
  homologar: DefinicaoAto;
  /** Atos de situação (suspender, retomar, revogar, anular, deserta, fracassada, concluir). */
  situacao: DefinicaoAto[];
  semRecursoPendente: Precondicao;
  efeitosDosRecursosAplicados: Precondicao;
  marcarDataAdjudicacao: Efeito;
}

const A = AtoLicitacao;
const F = FaseLicitacao;

export function montarFluxosEspeciais(b: AtosBase): { leilao: DefinicaoAto[]; concurso: DefinicaoAto[]; dialogo: DefinicaoAto[] } {
  const comPendencia = (def: DefinicaoAto, chave: string, antes = false): DefinicaoAto => ({
    ...def,
    precondicoes: antes ? [pendenciaDaModalidade(chave), ...(def.precondicoes ?? [])] : [...(def.precondicoes ?? []), pendenciaDaModalidade(chave)],
  });
  const situacaoCom = (chaveConcluir: string) =>
    b.situacao.map((d) =>
      d.ato === A.CONCLUIR
        ? { ...d, rotulo: 'Concluir processo', precondicoes: [pendenciaDaModalidade(chaveConcluir)] }
        : d,
    );

  // Resultado declarado no JULGAMENTO (leilão e concurso) — fase recursal a partir dele
  const abrirPrazoRecursalDoResultado: DefinicaoAto = { ...b.abrirPrazoRecursal, de: [F.JULGAMENTO] };
  const decidirRecursosDoResultado: DefinicaoAto = {
    ...b.decidirRecursos,
    rotulo: 'Decidir recursos (segue para pagamento/adjudicação)',
    // sem habilitação (art. 31 §4º / art. 30 I): o resultado é o declarado
    precondicoes: [b.semRecursoPendente, b.efeitosDosRecursosAplicados],
  };
  const retornarJulgamento: DefinicaoAto = { ...b.retornarJulgamento, de: [F.RECURSO, F.ADJUDICACAO] };

  // --- LEILÃO ---
  const leilao: DefinicaoAto[] = [
    ...b.etapasInternas,
    b.concluirFaseInterna,
    comPendencia(b.publicar, 'LEILAO_EDITAL'),
    b.cancelarPublicacao,
    b.retificarEdital,
    b.iniciarAcolhimento,
    b.encerrarAcolhimento,
    b.iniciarDisputa,
    b.encerrarDisputa,
    abrirPrazoRecursalDoResultado,
    decidirRecursosDoResultado,
    retornarJulgamento,
    {
      ...b.adjudicar,
      rotulo: 'Adjudicar (arrematações pagas)',
      de: [F.JULGAMENTO, F.ADJUDICACAO],
      precondicoes: [
        pendenciaDaModalidade('LEILAO_ARREMATACOES_PAGAS'),
        b.semRecursoPendente,
        b.efeitosDosRecursosAplicados,
        janelaRecursalDoResultadoEncerrada,
      ],
      efeitos: [b.marcarDataAdjudicacao],
    },
    comPendencia(b.homologar, 'LEILAO_ARREMATACOES_PAGAS'),
    ...situacaoCom('LEILAO_TERMOS'),
  ];

  // --- CONCURSO ---
  const concurso: DefinicaoAto[] = [
    ...b.etapasInternas,
    b.concluirFaseInterna,
    comPendencia(b.publicar, 'CONCURSO_EDITAL'),
    b.cancelarPublicacao,
    b.retificarEdital,
    b.iniciarAcolhimento,
    b.encerrarAcolhimento,
    {
      ato: A.JULGAR_CONCURSO,
      rotulo: 'Publicar o julgamento da banca (revela a autoria)',
      de: [F.ANALISE_PROPOSTAS],
      para: F.JULGAMENTO,
      principal: true,
      requerDados: true,
      endpoint: 'POST /concurso/licitacao/:id/julgar',
      precondicoes: [pendenciaDaModalidade('CONCURSO_JULGAMENTO')],
    },
    abrirPrazoRecursalDoResultado,
    decidirRecursosDoResultado,
    retornarJulgamento,
    {
      ...b.adjudicar,
      rotulo: 'Adjudicar (trabalho vencedor)',
      de: [F.JULGAMENTO, F.ADJUDICACAO],
      precondicoes: [
        pendenciaDaModalidade('CONCURSO_RESULTADO_DECLARADO'),
        b.semRecursoPendente,
        b.efeitosDosRecursosAplicados,
        janelaRecursalDoResultadoEncerrada,
      ],
      efeitos: [b.marcarDataAdjudicacao],
    },
    b.homologar,
    ...situacaoCom('CONCURSO_PREMIACAO'),
  ];

  // --- DIÁLOGO COMPETITIVO ---
  const dialogo: DefinicaoAto[] = [
    ...b.etapasInternas,
    b.concluirFaseInterna,
    comPendencia(b.publicar, 'DIALOGO_EDITAL'),
    b.cancelarPublicacao,
    b.retificarEdital,
    b.iniciarAcolhimento,
    b.encerrarAcolhimento,
    {
      ato: A.CONCLUIR_DIALOGO,
      rotulo: 'Concluir a fase de diálogo (decisão fundamentada)',
      de: [F.ANALISE_PROPOSTAS],
      requerMotivo: true,
      requerDados: true,
      endpoint: 'POST /dialogo-competitivo/licitacao/:id/concluir-dialogo',
      precondicoes: [pendenciaDaModalidade('DIALOGO_CONCLUIR')],
      efeitosPersistidos: [
        sqlDialogo(
          `UPDATE dialogo_competitivo SET etapa = 'CONCLUIDO', dialogo_concluido_em = $2, conclusao_motivacao = $3,
                  solucao_identificada = $4, registros_juntados_em = $2, updated_at = now()
            WHERE licitacao_id = $1`,
          (lic, ctx) => [lic.id, ctx.agora, String(ctx.motivo ?? '').trim(), String(ctx.dados?.solucao_identificada ?? '').trim()],
        ),
      ],
    },
    {
      ato: A.ABRIR_FASE_COMPETITIVA,
      rotulo: 'Abrir a fase competitiva (edital da solução — ≥ 60 dias úteis)',
      de: [F.ANALISE_PROPOSTAS],
      para: (lic, ctx) => faseAposAbrirCompetitiva(lic, ctx),
      requerDados: true,
      endpoint: 'POST /dialogo-competitivo/licitacao/:id/fase-competitiva',
      precondicoes: [pendenciaDaModalidade('DIALOGO_FASE_COMPETITIVA')],
      efeitos: [gravarFaseCompetitiva],
      efeitosPersistidos: [
        sqlDialogo(
          `UPDATE dialogo_competitivo SET etapa = 'COMPETITIVA', fase_competitiva_publicada_em = $2,
                  especificacao_solucao = $3, criterios_selecao = $4, updated_at = now()
            WHERE licitacao_id = $1`,
          (lic, ctx) => [lic.id, ctx.agora, String(ctx.dados?.especificacao_solucao ?? '').trim(), String(ctx.dados?.criterios_selecao ?? '').trim()],
        ),
      ],
    },
    comPendencia(b.iniciarDisputa, 'DIALOGO_DISPUTA', true),
    b.encerrarDisputa,
    b.iniciarHabilitacao,
    b.abrirPrazoRecursal,
    b.adjudicar,
    b.decidirRecursos,
    b.retornarJulgamento,
    b.retornarHabilitacao,
    b.homologar,
    ...b.situacao,
  ];

  return { leilao, concurso, dialogo };
}

import {
  FaseLicitacao,
  ModalidadeLicitacao,
  SituacaoLicitacao,
} from '../entities/licitacao.entity';
import {
  adicionarDiasUteis,
  FASES_ANTES_DA_HOMOLOGACAO,
  FASES_EXTERNAS_ATE_ADJUDICACAO,
  FASES_INTERNAS,
  formatarDataHora,
  ORDEM_FASES,
  ROTULO_FASE,
} from './fases';
import { avaliarRollupItens } from './rollup';
import { pendenciasPublicacaoArt48 } from '../../julgamento/me-epp/regras-me-epp';
import {
  AtoLicitacao,
  ContextoTransicao,
  DefinicaoAto,
  Efeito,
  FluxosPorModalidade,
  Precondicao,
} from './transicoes.tipos';

/**
 * ============================================================================
 * DEFINIÇÃO DECLARATIVA DA MÁQUINA DE ESTADOS DA LICITAÇÃO (plano E1)
 * ============================================================================
 *
 * Cada modalidade tem a sua lista de ATOS. Um ato diz:
 *   de            → fases em que pode ser praticado
 *   para          → fase de destino (ou mantém)
 *   situacoes*    → situação exigida / resultante
 *   precondicoes  → funções que devolvem PENDÊNCIAS (texto para a tela)
 *   efeitos       → datas/flags gravadas junto com a transição
 *
 * Nada aqui toca o banco diretamente: as pré-condições usam `ctx.consultas`
 * (o serviço entrega a versão do banco; o teste unitário, valores fixos).
 */

// ---------------------------------------------------------------------------
// Pré-condições reutilizáveis
// ---------------------------------------------------------------------------

const CONTRATACAO_DIRETA = [ModalidadeLicitacao.DISPENSA_ELETRONICA, ModalidadeLicitacao.INEXIGIBILIDADE];

const ehContratacaoDireta = (ctx: ContextoTransicao) => CONTRATACAO_DIRETA.includes(ctx.licitacao.modalidade);

/**
 * GATE DOCUMENTAL ÚNICO DA FASE INTERNA (plano E1.7) — vale para o
 * "avançar-fase" genérico, para os atos nomeados e para as telas da
 * fase-interna, em TODAS as modalidades:
 *  - contratação direta: instrução do art. 72 (DFD, estimativa, autorização;
 *    os "se for o caso" admitem "não se aplica" com justificativa);
 *  - rito completo (pregão, concorrência...): documentos obrigatórios de todas
 *    as etapas internas (art. 18) — DFD/ETP, TR/justificativa, pesquisa/mapa
 *    de preços, parecer jurídico, autorização/designação/dotação.
 * Usado em CONCLUIR_FASE_INTERNA e PUBLICAR. No rito completo, o PUBLICAR não
 * repete a checagem quando a fase interna já foi concluída pelo ato próprio.
 */
export const instrucaoCompleta: Precondicao = async (ctx) => {
  const direta = ehContratacaoDireta(ctx);
  if (!direta && ctx.ato === AtoLicitacao.PUBLICAR && ctx.licitacao.fase_interna_concluida) return null;
  const instrucao = await ctx.consultas.instrucaoProcesso();
  if (!instrucao || instrucao.pode_divulgar) return null;
  if (direta) {
    return `Instrução do processo incompleta (Art. 72 da Lei 14.133/2021). Pendências: ${instrucao.pendentes.join('; ')}`;
  }
  return instrucao.pendentes.map((p) => `Documento obrigatório da fase interna pendente: ${p}`);
};

/** @deprecated nome antigo (só contratação direta) — use `instrucaoCompleta`. */
export const instrucaoArt72Completa = instrucaoCompleta;

/**
 * Etapa interna do rito completo: os documentos obrigatórios DA ETAPA atual
 * precisam estar prontos para concluí-la. Contratação direta não tem rito por
 * etapas (instrução única do art. 72, cobrada em CONCLUIR_FASE_INTERNA/PUBLICAR).
 */
export const documentosDaEtapaProntos: Precondicao = async (ctx) => {
  if (ehContratacaoDireta(ctx)) return null;
  const etapa = ctx.licitacao.fase;
  const instrucao = await ctx.consultas.instrucaoProcesso(etapa);
  if (!instrucao || instrucao.pode_divulgar) return null;
  const rotulo = ROTULO_FASE[etapa] ?? etapa;
  return instrucao.pendentes.map((p) => `Documento obrigatório da etapa ${rotulo} pendente: ${p}`);
};

/** Dispensa eletrônica (art. 75 §3º): mínimo de 3 dias úteis de recebimento de propostas. */
export const prazoMinimoDispensa: Precondicao = (ctx) => {
  if (ctx.licitacao.modalidade !== ModalidadeLicitacao.DISPENSA_ELETRONICA) return null;
  const dados = ctx.dados || {};
  const corte = dados.data_fim_acolhimento || dados.data_abertura_sessao;
  if (!corte) return null; // sem cronograma no pedido (listagem de atos): avaliado ao publicar
  const minimo = adicionarDiasUteis(new Date(dados.data_publicacao_edital || ctx.agora), 3);
  if (new Date(corte) < minimo) {
    return (
      `Dispensa eletrônica exige no mínimo 3 dias úteis para recebimento de propostas (art. 75, §3º). ` +
      `Prazo mínimo: ${minimo.toLocaleDateString('pt-BR')}`
    );
  }
  return null;
};

/**
 * ME/EPP — LC 123/2006 art. 48 I (plano E3): exclusividade acima do limite
 * legal (`MPE_EXCLUSIVO_ITEM`, R$ 80.000; no lote, o valor total do lote)
 * BLOQUEIA a publicação; item até o limite sem exclusividade exige a
 * justificativa do art. 49 (`dados.justificativa_nao_exclusividade_mpe`,
 * registrada na transição). Regras puras em julgamento/me-epp/regras-me-epp.ts.
 */
export const exclusividadeMpeArt48: Precondicao = async (ctx) => {
  if (!ctx.consultas.conferenciaArt48) return null;
  const c = await ctx.consultas.conferenciaArt48();
  const justificativa = ctx.dados?.justificativa_nao_exclusividade_mpe ?? (ctx.licitacao as any).justificativa_nao_exclusividade_mpe;
  return pendenciasPublicacaoArt48(c, justificativa, !!ctx.somenteAvaliacao);
};

/** PUBLICAR: grava a justificativa do art. 49 informada no ato (também fica nos dados da transição). */
const gravarJustificativaArt49: Efeito = (lic, ctx) => {
  const j = String(ctx.dados?.justificativa_nao_exclusividade_mpe ?? '').trim();
  if (j) (lic as any).justificativa_nao_exclusividade_mpe = j;
};

/** O acolhimento só começa na data do edital. */
export const inicioAcolhimentoAlcancado: Precondicao = (ctx) => {
  const inicio = ctx.licitacao.data_inicio_acolhimento;
  if (inicio && ctx.agora < new Date(inicio)) {
    return `O recebimento de propostas só começa em ${formatarDataHora(inicio)} (data do edital).`;
  }
  return null;
};

/** O prazo de propostas precisa ter terminado. */
export const fimAcolhimentoAlcancado: Precondicao = (ctx) => {
  const corte = ctx.licitacao.data_fim_acolhimento || ctx.licitacao.data_abertura_sessao;
  if (corte && ctx.agora < new Date(corte)) {
    return `O prazo de recebimento de propostas ainda está aberto (encerra em ${new Date(corte).toLocaleString('pt-BR')})`;
  }
  return null;
};

/** A sessão pública só abre na data marcada. */
export const aberturaSessaoAlcancada: Precondicao = (ctx) => {
  const abertura = ctx.licitacao.data_abertura_sessao;
  if (abertura && ctx.agora < new Date(abertura)) {
    return `A sessão só pode ser iniciada a partir de ${formatarDataHora(abertura)}. Aguarde a data de abertura programada.`;
  }
  return null;
};

/** Disputa exige propostas aptas (regra que já existia no avançar genérico). */
export const haPropostasAptas: Precondicao = async (ctx) => {
  if ((await ctx.consultas.propostasAptasDisputa()) === 0) {
    return 'Não é possível iniciar a disputa sem propostas válidas. Verifique se há propostas classificadas.';
  }
  return null;
};

/** Dispensa: a janela de lances (se aberta) precisa ter terminado. */
export const janelaLancesDispensaEncerrada: Precondicao = (ctx) => {
  const fim = ctx.licitacao.dispensa_lances_fim;
  if (fim && ctx.agora < new Date(fim)) {
    return `A fase de lances está aberta até ${new Date(fim).toLocaleString('pt-BR')} — julgue após o encerramento`;
  }
  return null;
};

/** Revogar/anular: não com contrato assinado (desfazer/rescindir antes). */
export const semContratoAssinado: Precondicao = async (ctx) => {
  const n = await ctx.consultas.contratosAssinados();
  if (n > 0) {
    return `Há ${n} contrato(s) assinado(s) decorrente(s) desta licitação — rescinda/anule o(s) contrato(s) antes de ${ctx.ato === AtoLicitacao.ANULAR ? 'anular' : 'revogar'} a licitação.`;
  }
  return null;
};

/** Homologar exige ao menos um item com vencedor adjudicado. */
export const haItemAdjudicado: Precondicao = async (ctx) => {
  const itens = await ctx.consultas.itens();
  // E6: adjudicado = item ADJUDICADO/HOMOLOGADO com vencedor (gravado pelo
  // ResultadoService — sala, julgamento da dispensa ou resultado externo)
  if (!itens.some((i) => !!i.fornecedor_vencedor_id && ['ADJUDICADO', 'HOMOLOGADO'].includes(String(i.status)))) {
    return 'Nenhum item com vencedor adjudicado — registre o resultado antes de homologar (ou declare a licitação deserta/fracassada).';
  }
  return null;
};

/** Re-homologar (já em HOMOLOGACAO) só enquanto nenhum contrato/ata foi gerado. */
export const rehomologacaoSemContrato: Precondicao = async (ctx) => {
  if (ctx.licitacao.fase !== FaseLicitacao.HOMOLOGACAO) return null;
  if ((await ctx.consultas.contratosOuAtasGerados()) > 0) {
    return 'Licitação já homologada e com contrato/ata gerado — não é possível homologar de novo.';
  }
  return null;
};

/** Concluir exige contrato ou ata gerados a partir da homologação. */
export const haContratoOuAta: Precondicao = async (ctx) => {
  if ((await ctx.consultas.contratosOuAtasGerados()) === 0) {
    return 'Nenhum contrato ou ata de registro de preços gerado a partir da homologação.';
  }
  return null;
};

/** Deserta: nenhum interessado (sem propostas) OU todos os itens desertos. */
export const desertaPossivel: Precondicao = async (ctx) => {
  const [propostas, itens] = await Promise.all([ctx.consultas.propostasRecebidas(), ctx.consultas.itens()]);
  if (propostas === 0) return null;
  if (avaliarRollupItens(itens) === 'DESERTA') return null;
  return `Há ${propostas} proposta(s) recebida(s) — licitação deserta exige ausência de interessados (use "declarar fracassada" se nenhuma proposta for aproveitável).`;
};

/** Fracassada: houve interessados, mas nenhum item tem vencedor. */
export const fracassadaPossivel: Precondicao = async (ctx) => {
  const itens = await ctx.consultas.itens();
  if (itens.some((i) => !!i.fornecedor_vencedor_id || ['ADJUDICADO', 'HOMOLOGADO'].includes(String(i.status)))) {
    return 'Há item com vencedor adjudicado — a licitação não pode ser declarada fracassada.';
  }
  return null;
};

/** Cancelar a publicação só antes de haver propostas (depois disso é revogar/anular). */
export const semPropostasRecebidas: Precondicao = async (ctx) => {
  const n = await ctx.consultas.propostasRecebidas();
  if (n > 0) {
    return `Há ${n} proposta(s) recebida(s) — a publicação não pode ser simplesmente cancelada; revogue ou anule a licitação.`;
  }
  return null;
};

// ---------------------------------------------------------------------------
// Efeitos reutilizáveis
// ---------------------------------------------------------------------------

const marcarData =
  (campo: 'data_aprovacao_tr' | 'data_parecer_juridico' | 'data_autorizacao' | 'data_inicio_disputa' | 'data_fim_disputa' | 'data_adjudicacao' | 'data_homologacao'): Efeito =>
  (lic, ctx) => {
    (lic as any)[campo] = ctx.agora;
  };

const concluirFaseInterna: Efeito = (lic, ctx) => {
  lic.fase_interna_concluida = true;
  if (!lic.data_autorizacao) lic.data_autorizacao = ctx.agora;
};

const CAMPOS_CRONOGRAMA = [
  'data_publicacao_edital',
  'data_limite_impugnacao',
  'data_inicio_acolhimento',
  'data_fim_acolhimento',
  'data_abertura_sessao',
] as const;

/** PUBLICAR: grava o cronograma informado (data de publicação padrão = agora). */
const gravarCronogramaPublicacao: Efeito = (lic, ctx) => {
  const dados = ctx.dados || {};
  // A publicação encerra, por definição, a fase interna (art. 18 → fase externa).
  lic.fase_interna_concluida = true;
  for (const campo of CAMPOS_CRONOGRAMA) {
    if (dados[campo]) (lic as any)[campo] = new Date(dados[campo]);
  }
  if (!lic.data_publicacao_edital) lic.data_publicacao_edital = ctx.agora;
  if (dados.link_pncp) lic.link_pncp = dados.link_pncp;
};

/** RETOMAR: novas datas opcionais (reabertura de prazo após a suspensão). */
const reabrirCronograma: Efeito = (lic, ctx) => {
  const dados = ctx.dados || {};
  for (const campo of CAMPOS_CRONOGRAMA) {
    if (campo === 'data_publicacao_edital') continue;
    if (dados[campo]) (lic as any)[campo] = new Date(dados[campo]);
  }
};

/** Fase interna anterior à atual (DEVOLVER_FASE_INTERNA). */
function faseInternaAnterior(fase: FaseLicitacao): FaseLicitacao {
  const i = FASES_INTERNAS.indexOf(fase);
  return i > 0 ? FASES_INTERNAS[i - 1] : FaseLicitacao.PLANEJAMENTO;
}

// ---------------------------------------------------------------------------
// Atos
// ---------------------------------------------------------------------------

const A = AtoLicitacao;
const F = FaseLicitacao;
const S = SituacaoLicitacao;

/**
 * Etapas internas (todas as modalidades). Gate documental da etapa no rito
 * completo (E1.7); na contratação direta a instrução é única (art. 72).
 */
const ATOS_ETAPAS_INTERNAS: DefinicaoAto[] = [
  { ato: A.CONCLUIR_PLANEJAMENTO, rotulo: 'Concluir planejamento (ETP)', de: [F.PLANEJAMENTO], para: F.TERMO_REFERENCIA, principal: true, precondicoes: [documentosDaEtapaProntos] },
  { ato: A.CONCLUIR_TERMO_REFERENCIA, rotulo: 'Aprovar termo de referência', de: [F.TERMO_REFERENCIA], para: F.PESQUISA_PRECOS, principal: true, precondicoes: [documentosDaEtapaProntos], efeitos: [marcarData('data_aprovacao_tr')] },
  { ato: A.CONCLUIR_PESQUISA_PRECOS, rotulo: 'Concluir pesquisa de preços', de: [F.PESQUISA_PRECOS], para: F.ANALISE_JURIDICA, principal: true, precondicoes: [documentosDaEtapaProntos] },
  { ato: A.CONCLUIR_ANALISE_JURIDICA, rotulo: 'Registrar parecer jurídico', de: [F.ANALISE_JURIDICA], para: F.APROVACAO_INTERNA, principal: true, precondicoes: [documentosDaEtapaProntos], efeitos: [marcarData('data_parecer_juridico')] },
  {
    ato: A.DEVOLVER_FASE_INTERNA,
    rotulo: 'Devolver à etapa interna anterior',
    de: FASES_INTERNAS.filter((f) => f !== F.PLANEJAMENTO),
    para: (lic) => faseInternaAnterior(lic.fase),
    requerMotivo: true,
    retorno: true,
    // Devolvida a uma etapa anterior, a fase interna deixa de estar concluída
    // (o PUBLICAR do rito completo volta a exigir o gate documental).
    efeitos: [(lic) => { lic.fase_interna_concluida = false; }],
  },
];

/** Rito completo: pregão, concorrência (e, por ora, leilão/concurso/diálogo). */
const CONCLUIR_FASE_INTERNA_RITO_COMPLETO: DefinicaoAto = {
  ato: A.CONCLUIR_FASE_INTERNA,
  rotulo: 'Concluir fase interna (autorização)',
  de: [F.APROVACAO_INTERNA],
  para: F.APROVACAO_INTERNA,
  precondicoes: [instrucaoCompleta],
  efeitos: [concluirFaseInterna],
};

/** Contratação direta: instrução em etapa única (art. 72) — de qualquer etapa interna. */
const CONCLUIR_FASE_INTERNA_CONTRATACAO_DIRETA: DefinicaoAto = {
  ato: A.CONCLUIR_FASE_INTERNA,
  rotulo: 'Concluir instrução (art. 72)',
  de: FASES_INTERNAS,
  para: F.APROVACAO_INTERNA,
  precondicoes: [instrucaoCompleta],
  efeitos: [concluirFaseInterna],
};

const PUBLICAR: DefinicaoAto = {
  ato: A.PUBLICAR,
  rotulo: 'Publicar edital / divulgar aviso',
  de: [F.APROVACAO_INTERNA],
  para: F.PUBLICADO,
  requerDados: true,
  endpoint: 'PUT /licitacoes/:id/publicar-edital',
  principal: true,
  precondicoes: [instrucaoCompleta, prazoMinimoDispensa, exclusividadeMpeArt48],
  efeitos: [gravarCronogramaPublicacao, gravarJustificativaArt49],
  mensagemForaDaFase: () => 'Licitação precisa estar aprovada internamente para publicar edital',
};

const CANCELAR_PUBLICACAO: DefinicaoAto = {
  ato: A.CANCELAR_PUBLICACAO,
  rotulo: 'Cancelar publicação (compra excluída do PNCP)',
  de: [F.PUBLICADO, F.IMPUGNACAO, F.ACOLHIMENTO_PROPOSTAS],
  para: F.APROVACAO_INTERNA,
  requerMotivo: true,
  somenteSistema: true,
  precondicoes: [semPropostasRecebidas],
};

/*
 * ABRIR_IMPUGNACAO (PUBLICADO → IMPUGNACAO) SAIU DOS FLUXOS (E1 item 6):
 * o prazo de impugnação/esclarecimento do art. 164 (até 3 dias úteis antes da
 * abertura) é decidido pela DATA-limite (`impugnacoes/prazo-manifestacao.util`)
 * e corre em paralelo ao acolhimento — não é uma fase. A fase IMPUGNACAO
 * continua válida para linhas legadas (INICIAR_ACOLHIMENTO, ENCERRAR_ACOLHIMENTO
 * e CANCELAR_PUBLICACAO a aceitam como origem), mas ninguém entra mais nela.
 * O valor do enum AtoLicitacao fica para o histórico antigo.
 */

const INICIAR_ACOLHIMENTO: DefinicaoAto = {
  ato: A.INICIAR_ACOLHIMENTO,
  rotulo: 'Iniciar recebimento de propostas',
  de: [F.PUBLICADO, F.IMPUGNACAO],
  para: F.ACOLHIMENTO_PROPOSTAS,
  principal: true,
  precondicoes: [inicioAcolhimentoAlcancado],
};

const ENCERRAR_ACOLHIMENTO: DefinicaoAto = {
  ato: A.ENCERRAR_ACOLHIMENTO,
  rotulo: 'Encerrar recebimento de propostas',
  de: [F.PUBLICADO, F.IMPUGNACAO, F.ACOLHIMENTO_PROPOSTAS],
  para: F.ANALISE_PROPOSTAS,
  principal: true,
  precondicoes: [fimAcolhimentoAlcancado],
};

/**
 * INVERSÃO DE FASES (Lei 14.133 art. 17 §1º; plano E4): na concorrência com
 * `inversao_fases`, a habilitação de TODOS os licitantes é julgada antes da
 * etapa de lances — só os HABILITADOS disputam (os inabilitados têm a proposta
 * desclassificada). Sem inversão, não se aplica.
 */
export const habilitacaoPreviaJulgada: Precondicao = async (ctx) => {
  if (!(ctx.licitacao as any).inversao_fases || !ctx.consultas.habilitacaoPreviaPendente) return null;
  const pendentes = await ctx.consultas.habilitacaoPreviaPendente();
  if (!pendentes.length) return null;
  return `Inversão de fases (art. 17 §1º): julgue a habilitação de todos os licitantes antes da disputa — pendente(s): ${pendentes.join(', ')}`;
};

/**
 * ADJUDICAR / DECIDIR_RECURSOS (plano E4): toda unidade com proposta aceita
 * tem o licitante HABILITADO — o vencedor final nunca é quem não passou pela
 * habilitação (Lei 14.133 art. 62; fim do B3).
 */
export const licitantesAceitosHabilitados: Precondicao = async (ctx) => {
  if (!ctx.consultas.unidadesSemHabilitado) return null;
  const pendentes = await ctx.consultas.unidadesSemHabilitado();
  if (!pendentes.length) return null;
  return `Habilitação pendente (Lei 14.133/2021, art. 62) do licitante com proposta aceita: ${pendentes.join(', ')}`;
};

const INICIAR_DISPUTA: DefinicaoAto = {
  ato: A.INICIAR_DISPUTA,
  rotulo: 'Abrir sessão de disputa',
  de: [F.ANALISE_PROPOSTAS],
  para: F.EM_DISPUTA,
  principal: true,
  precondicoes: [aberturaSessaoAlcancada, haPropostasAptas, habilitacaoPreviaJulgada],
  efeitos: [marcarData('data_inicio_disputa')],
  mensagemForaDaFase: () => 'Licitação precisa estar na fase de análise de propostas',
};

const ENCERRAR_DISPUTA: DefinicaoAto = {
  ato: A.ENCERRAR_DISPUTA,
  rotulo: 'Encerrar disputa (ir a julgamento)',
  de: [F.EM_DISPUTA],
  para: F.JULGAMENTO,
  principal: true,
  efeitos: [marcarData('data_fim_disputa')],
  mensagemForaDaFase: () => 'Licitação não está em disputa',
};

/**
 * Julgamento concluído (plano E3): toda unidade com lances (item, ou lote na
 * disputa por lote) tem licitante com proposta ACEITA — ou está deserta/
 * fracassada. A aceitação da proposta (IN SEGES 73/2022 art. 29) precede a
 * habilitação (Lei 14.133 art. 17, V e art. 62).
 */
export const propostasAceitasEmTodasAsUnidades: Precondicao = async (ctx) => {
  const pendentes = (await ctx.consultas.unidadesSemPropostaAceita?.()) ?? [];
  if (!pendentes.length) return null;
  return `Aceitação da proposta pendente (IN SEGES 73/2022, art. 29): ${pendentes.join(', ')}`;
};

const INICIAR_HABILITACAO: DefinicaoAto = {
  ato: A.INICIAR_HABILITACAO,
  rotulo: 'Concluir julgamento e iniciar habilitação',
  de: [F.JULGAMENTO],
  para: F.HABILITACAO,
  principal: true,
  precondicoes: [propostasAceitasEmTodasAsUnidades],
};

// ---------------------------------------------------------------------------
// Recursos (plano E5 — Lei 14.133/2021 arts. 165 e 168; IN SEGES 73/2022 art. 40)
// ---------------------------------------------------------------------------

/**
 * O prazo recursal só se abre com INTENÇÃO ADMITIDA pelo agente (art. 165 §1º
 * I): sem recurso, a licitação segue da habilitação para a adjudicação.
 */
export const intencaoDeRecursoAdmitida: Precondicao = async (ctx) => {
  if (!ctx.consultas.estadoRecursal) return null;
  const e = await ctx.consultas.estadoRecursal();
  if (e.intencoesAdmitidas > 0) return null;
  return 'Não há intenção de recurso admitida (art. 165 §1º I, Lei 14.133/2021): o prazo recursal nasce da admissão da intenção manifestada pelo licitante na sala.';
};

/**
 * EFEITO SUSPENSIVO (art. 168): enquanto houver janela de intenção aberta,
 * intenção sem juízo de admissibilidade ou recurso sem decisão final, a
 * adjudicação e a homologação ficam bloqueadas.
 */
export const semRecursoPendente: Precondicao = async (ctx) => {
  if (!ctx.consultas.estadoRecursal) return null;
  const e = await ctx.consultas.estadoRecursal();
  const p: string[] = [];
  if (e.janelaAberta) p.push('Janela de intenção de recurso em curso (art. 165 §1º I; IN SEGES 73/2022, art. 40)');
  for (const r of e.pendentes) p.push(`Efeito suspensivo (art. 168, Lei 14.133/2021): ${r}`);
  return p;
};

/**
 * O provimento que alterou o resultado precisa levar a licitação ao ato de
 * fase próprio (retorno ao julgamento ou à habilitação) — não se adjudica o
 * resultado antigo (art. 165 §3º).
 */
export const efeitosDosRecursosAplicados: Precondicao = async (ctx) => {
  if (!ctx.consultas.estadoRecursal) return null;
  const e = await ctx.consultas.estadoRecursal();
  if (!e.providosSemDesfecho) return null;
  return 'Há recurso PROVIDO que alterou o resultado: a sala conclui a fase recursal com o retorno à etapa atingida (art. 165 §3º) — não é possível adjudicar o resultado anterior.';
};

/**
 * Sem recurso, a adjudicação exige que o direito de recorrer tenha sido dado
 * sobre o resultado ATUAL: janela de intenção aberta pelo agente e já
 * encerrada (preclusão — art. 165 §1º I; IN SEGES 73/2022, art. 40).
 */
export const janelaDeIntencaoEncerrada: Precondicao = async (ctx) => {
  // ADJUDICACAO → ADJUDICACAO (E6): a fase recursal já foi superada por um ato
  // (DECIDIR_RECURSOS); o que falta é gravar a adjudicação dos itens.
  if (ctx.licitacao.fase !== FaseLicitacao.HABILITACAO) return null;
  if (!ctx.consultas.estadoRecursal) return null;
  const e = await ctx.consultas.estadoRecursal();
  if (e.janelaEncerrada || e.janelaAberta) return null;
  return 'Abra na sala o prazo de intenção de recurso (mínimo de 10 minutos — IN SEGES 73/2022, art. 40) sobre o resultado da habilitação antes de adjudicar (art. 165 §1º I, Lei 14.133/2021).';
};

const ABRIR_PRAZO_RECURSAL: DefinicaoAto = {
  ato: A.ABRIR_PRAZO_RECURSAL,
  rotulo: 'Abrir prazo recursal',
  de: [F.HABILITACAO],
  para: F.RECURSO,
  principal: true,
  precondicoes: [intencaoDeRecursoAdmitida],
};

const DECIDIR_RECURSOS: DefinicaoAto = {
  ato: A.DECIDIR_RECURSOS,
  rotulo: 'Decidir recursos e adjudicar',
  de: [F.RECURSO],
  para: F.ADJUDICACAO,
  principal: true,
  endpoint: 'POST /resultado/licitacao/:id/adjudicar',
  precondicoes: [licitantesAceitosHabilitados, semRecursoPendente, efeitosDosRecursosAplicados],
  efeitos: [marcarData('data_adjudicacao')],
};

/**
 * ADJUDICAR (E6 — ResultadoService): grava vencedor (VENCEDOR) e itens
 * ADJUDICADO com os valores da proposta adequada aceita. De HABILITACAO (sem
 * recurso) ou ADJUDICACAO → ADJUDICACAO (a fase recursal já levou a licitação
 * à adjudicação por DECIDIR_RECURSOS e os itens ainda não foram gravados).
 */
const ADJUDICAR: DefinicaoAto = {
  ato: A.ADJUDICAR,
  rotulo: 'Adjudicar',
  de: [F.HABILITACAO, F.ADJUDICACAO],
  para: F.ADJUDICACAO,
  endpoint: 'POST /resultado/licitacao/:id/adjudicar',
  precondicoes: [licitantesAceitosHabilitados, semRecursoPendente, efeitosDosRecursosAplicados, janelaDeIntencaoEncerrada],
  efeitos: [marcarData('data_adjudicacao')],
};

const RETORNAR_JULGAMENTO: DefinicaoAto = {
  ato: A.RETORNAR_JULGAMENTO,
  rotulo: 'Retornar ao julgamento',
  de: [F.HABILITACAO, F.RECURSO, F.ADJUDICACAO],
  para: F.JULGAMENTO,
  requerMotivo: true,
  retorno: true,
};

/**
 * Recurso PROVIDO que refez o resultado da habilitação sem exigir novo
 * julgamento (ex.: inabilitação reformada — o recorrente volta HABILITADO):
 * a licitação sai de RECURSO de volta à HABILITACAO com o novo resultado e
 * segue a adjudicação (art. 165 §3º). Praticado só pela sala (recursos).
 */
const RETORNAR_HABILITACAO: DefinicaoAto = {
  ato: A.RETORNAR_HABILITACAO,
  rotulo: 'Retornar à habilitação (recurso provido)',
  de: [F.RECURSO],
  para: F.HABILITACAO,
  requerMotivo: true,
  somenteSistema: true,
  precondicoes: [semRecursoPendente],
};

const JULGAR_DISPENSA: DefinicaoAto = {
  ato: A.JULGAR_DISPENSA,
  rotulo: 'Julgar propostas (menor preço) e adjudicar',
  // Tolerante com dispensas antigas que o "avançar" genérico levou a
  // disputa/julgamento/habilitação; ADJUDICACAO → ADJUDICACAO = rejulgar.
  de: FASES_EXTERNAS_ATE_ADJUDICACAO,
  para: F.ADJUDICACAO,
  requerDados: false,
  endpoint: 'POST /licitacoes/:id/julgar-dispensa',
  principal: true,
  precondicoes: [fimAcolhimentoAlcancado, janelaLancesDispensaEncerrada],
  efeitos: [marcarData('data_adjudicacao')],
  mensagemForaDaFase: (lic) => (lic.fase === F.HOMOLOGACAO ? 'Licitação já homologada' : null),
};

const REGISTRAR_RESULTADO_EXTERNO: DefinicaoAto = {
  ato: A.REGISTRAR_RESULTADO_EXTERNO,
  rotulo: 'Registrar resultado externo',
  // Seleção feita fora do sistema (BLL, Compras.gov...): o processo pode estar
  // em qualquer fase antes da homologação (inclusive só com a fase interna).
  de: FASES_ANTES_DA_HOMOLOGACAO,
  para: F.ADJUDICACAO,
  requerDados: true,
  endpoint: 'POST /licitacoes/:id/resultado-externo',
  efeitos: [marcarData('data_adjudicacao')],
  mensagemForaDaFase: (lic) =>
    lic.fase === F.HOMOLOGACAO ? 'Licitação já homologada — não é possível alterar o resultado' : null,
};

const HOMOLOGAR: DefinicaoAto = {
  ato: A.HOMOLOGAR,
  rotulo: 'Homologar',
  // HOMOLOGACAO → HOMOLOGACAO: re-homologar enquanto nenhum contrato/ata foi
  // gerado (ex.: falha na geração do instrumento). Valor calculado (E6).
  de: [F.ADJUDICACAO, F.HOMOLOGACAO],
  para: F.HOMOLOGACAO,
  endpoint: 'POST /resultado/licitacao/:id/homologar',
  principal: true,
  precondicoes: [haItemAdjudicado, rehomologacaoSemContrato, semRecursoPendente],
  efeitos: [marcarData('data_homologacao')],
};

// --- Situação ---

const SUSPENDER: DefinicaoAto = {
  ato: A.SUSPENDER,
  rotulo: 'Suspender',
  de: FASES_EXTERNAS_ATE_ADJUDICACAO,
  situacaoPara: S.SUSPENSA,
  requerMotivo: true,
  mensagemForaDaFase: (lic) =>
    FASES_INTERNAS.includes(lic.fase)
      ? 'Processo ainda não divulgado — não há o que suspender (edite, devolva a etapa ou exclua).'
      : null,
};

const RETOMAR: DefinicaoAto = {
  ato: A.RETOMAR,
  rotulo: 'Retomar',
  de: ORDEM_FASES,
  situacoesOrigem: [S.SUSPENSA],
  situacaoPara: S.ATIVA,
  efeitos: [reabrirCronograma],
};

const REVOGAR: DefinicaoAto = {
  ato: A.REVOGAR,
  rotulo: 'Revogar (art. 71, II)',
  de: ORDEM_FASES,
  situacoesOrigem: [S.ATIVA, S.SUSPENSA],
  situacaoPara: S.REVOGADA,
  requerMotivo: true,
  precondicoes: [semContratoAssinado],
};

const ANULAR: DefinicaoAto = {
  ato: A.ANULAR,
  rotulo: 'Anular (art. 71, III)',
  de: ORDEM_FASES,
  situacoesOrigem: [S.ATIVA, S.SUSPENSA],
  situacaoPara: S.ANULADA,
  requerMotivo: true,
  precondicoes: [semContratoAssinado],
};

const DECLARAR_DESERTA: DefinicaoAto = {
  ato: A.DECLARAR_DESERTA,
  rotulo: 'Declarar deserta',
  de: FASES_EXTERNAS_ATE_ADJUDICACAO,
  situacaoPara: S.DESERTA,
  requerMotivo: true,
  precondicoes: [desertaPossivel],
};

const DECLARAR_FRACASSADA: DefinicaoAto = {
  ato: A.DECLARAR_FRACASSADA,
  rotulo: 'Declarar fracassada',
  de: FASES_EXTERNAS_ATE_ADJUDICACAO,
  situacaoPara: S.FRACASSADA,
  requerMotivo: true,
  precondicoes: [fracassadaPossivel],
};

const CONCLUIR: DefinicaoAto = {
  ato: A.CONCLUIR,
  rotulo: 'Concluir processo',
  de: [F.HOMOLOGACAO],
  situacaoPara: S.CONCLUIDA,
  principal: true,
  precondicoes: [haContratoOuAta],
};

const ATOS_SITUACAO: DefinicaoAto[] = [SUSPENDER, RETOMAR, REVOGAR, ANULAR, DECLARAR_DESERTA, DECLARAR_FRACASSADA, CONCLUIR];

// ---------------------------------------------------------------------------
// Fluxos por modalidade (a ordem define o "ato principal" do avançar-fase)
// ---------------------------------------------------------------------------

/** Rito completo (pregão/concorrência — e, por ora, leilão, concurso e diálogo). */
const FLUXO_COMPETITIVO: DefinicaoAto[] = [
  ...ATOS_ETAPAS_INTERNAS,
  CONCLUIR_FASE_INTERNA_RITO_COMPLETO,
  PUBLICAR,
  CANCELAR_PUBLICACAO,
  INICIAR_ACOLHIMENTO,
  ENCERRAR_ACOLHIMENTO,
  INICIAR_DISPUTA,
  ENCERRAR_DISPUTA,
  INICIAR_HABILITACAO,
  ABRIR_PRAZO_RECURSAL,
  ADJUDICAR,
  DECIDIR_RECURSOS,
  RETORNAR_JULGAMENTO,
  RETORNAR_HABILITACAO,
  REGISTRAR_RESULTADO_EXTERNO,
  HOMOLOGAR,
  ...ATOS_SITUACAO,
];

/** Dispensa eletrônica (art. 75 §3º; IN SEGES 67/2021). */
const FLUXO_DISPENSA: DefinicaoAto[] = [
  ...ATOS_ETAPAS_INTERNAS,
  CONCLUIR_FASE_INTERNA_CONTRATACAO_DIRETA,
  PUBLICAR,
  CANCELAR_PUBLICACAO,
  INICIAR_ACOLHIMENTO,
  ENCERRAR_ACOLHIMENTO,
  JULGAR_DISPENSA,
  REGISTRAR_RESULTADO_EXTERNO,
  HOMOLOGAR,
  ...ATOS_SITUACAO,
];

/** Inexigibilidade (art. 74): divulgação + registro do contratado + homologação. */
const FLUXO_INEXIGIBILIDADE: DefinicaoAto[] = [
  ...ATOS_ETAPAS_INTERNAS,
  CONCLUIR_FASE_INTERNA_CONTRATACAO_DIRETA,
  PUBLICAR,
  CANCELAR_PUBLICACAO,
  REGISTRAR_RESULTADO_EXTERNO,
  HOMOLOGAR,
  ...ATOS_SITUACAO,
];

export const FLUXOS: FluxosPorModalidade = {
  [ModalidadeLicitacao.PREGAO_ELETRONICO]: FLUXO_COMPETITIVO,
  [ModalidadeLicitacao.CONCORRENCIA]: FLUXO_COMPETITIVO,
  // Leilão, concurso e diálogo competitivo: rito genérico até a E7c.
  [ModalidadeLicitacao.LEILAO]: FLUXO_COMPETITIVO,
  [ModalidadeLicitacao.CONCURSO]: FLUXO_COMPETITIVO,
  [ModalidadeLicitacao.DIALOGO_COMPETITIVO]: FLUXO_COMPETITIVO,
  [ModalidadeLicitacao.DISPENSA_ELETRONICA]: FLUXO_DISPENSA,
  [ModalidadeLicitacao.INEXIGIBILIDADE]: FLUXO_INEXIGIBILIDADE,
};

export function fluxoDaModalidade(modalidade: ModalidadeLicitacao | string | null | undefined): DefinicaoAto[] {
  return FLUXOS[modalidade as ModalidadeLicitacao] ?? FLUXO_COMPETITIVO;
}

export function definicaoDoAto(
  modalidade: ModalidadeLicitacao | string | null | undefined,
  ato: AtoLicitacao,
): DefinicaoAto | undefined {
  return fluxoDaModalidade(modalidade).find((d) => d.ato === ato);
}

/** Todas as definições de um ato em alguma modalidade (para mensagens). */
export function atoExiste(ato: string): ato is AtoLicitacao {
  return (Object.values(AtoLicitacao) as string[]).includes(ato);
}

// Garantia de coerência (falha no boot/teste se alguém quebrar a tabela)
for (const [modalidade, fluxo] of Object.entries(FLUXOS)) {
  const vistos = new Set<string>();
  for (const d of fluxo) {
    if (vistos.has(d.ato)) throw new Error(`[transicoes] ato ${d.ato} repetido no fluxo ${modalidade}`);
    vistos.add(d.ato);
  }
}

export type { ContextoTransicao };

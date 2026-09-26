import {
  FaseLicitacao,
  ModalidadeLicitacao,
  SituacaoLicitacao,
} from '../entities/licitacao.entity';
import {
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
  avaliarPrazosDePublicacao,
  CAMPOS_EDITAL_RETIFICAVEIS,
  cronogramaDoCertameMudou,
  fimDoRecebimento,
  formatarDataBrasilia,
  MODALIDADES_COM_EDITAL,
  pendenciasDaRetificacao,
} from '../../publicacao/regras-publicacao';
import {
  concluirExtincaoSql,
  excluirPropostasNaoConfirmadasSql,
  marcarEditalPublicadoSql,
} from '../../publicacao/publicacao.sql';
import { montarFluxosEspeciais } from './definicoes-especiais';
import { pendenciasEditalCredenciamento } from '../../credenciamento/regras-credenciamento';
import { arquivarInscricoesPendentesSql } from '../../credenciamento/credenciamento.sql';
import { pendenciaItensParaPublicacao } from '../../itens/regras-itens-publicacao';
import {
  AtoLicitacao,
  ContextoTransicao,
  DefinicaoAto,
  Efeito,
  EfeitoPersistido,
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

/**
 * Instrução em etapa única (art. 72): contratação direta e, no plano E7b, o
 * CREDENCIAMENTO — cujas contratações são inexigibilidade (art. 74 IV); a
 * fase interna é a instrução da contratação direta + o edital de chamamento.
 */
const ehContratacaoDireta = (ctx: ContextoTransicao) =>
  CONTRATACAO_DIRETA.includes(ctx.licitacao.modalidade) || ctx.licitacao.modalidade === ModalidadeLicitacao.CREDENCIAMENTO;

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

/**
 * ITENS (todas as modalidades): concluir a fase interna e publicar exigem
 * pelo menos um item ativo com quantidade e valor unitário estimado > 0 —
 * sem item a compra não vai ao PNCP ("licitação deve ter pelo menos um item")
 * e não há o que disputar/contratar. Leilão: valor = preço mínimo do bem;
 * concurso: valor = prêmio (ambos gravados no item). Seleção externa: os
 * itens vêm da plataforma de origem — a regra vale do mesmo jeito.
 */
export const haItensComValorEstimado: Precondicao = async (ctx) => {
  if (!ctx.consultas.itensParaPublicacao) return null;
  return pendenciaItensParaPublicacao(await ctx.consultas.itensParaPublicacao());
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

/**
 * PRAZOS MÍNIMOS DE DIVULGAÇÃO (plano E7a) — PUBLICAR em todas as
 * modalidades: art. 55 da Lei 14.133/2021 (pregão, concorrência, leilão,
 * concurso; diálogo competitivo art. 32 §1º I) e art. 75 §3º (dispensa
 * eletrônica, 3 dias úteis), contados da divulgação no CALENDÁRIO DO ÓRGÃO
 * (art. 183), + ordem coerente das datas + art. 164. Regras puras em
 * `publicacao/regras-publicacao.ts`. O cronograma do pedido prevalece sobre o
 * da licitação (o PNCP publica com o cronograma já gravado). Seleção externa:
 * os prazos são os da plataforma de origem.
 */
export const prazosDePublicacao: Precondicao = (ctx) => {
  const lic = ctx.licitacao as any;
  if (lic.selecao_externa) return null;
  const dados = ctx.dados || {};
  const cronograma: Record<string, any> = {};
  for (const campo of CAMPOS_CRONOGRAMA) cronograma[campo] = dados[campo] || lic[campo] || null;
  if (ctx.somenteAvaliacao && !fimDoRecebimento(cronograma)) return null; // sem cronograma ainda: avaliado ao publicar
  const av = avaliarPrazosDePublicacao(
    {
      modalidade: lic.modalidade,
      tipo_contratacao: dados.tipo_contratacao ?? lic.tipo_contratacao,
      criterio_julgamento: dados.criterio_julgamento ?? lic.criterio_julgamento,
      regime_execucao: dados.regime_execucao ?? lic.regime_execucao,
      natureza_objeto: dados.natureza_objeto ?? lic.natureza_objeto,
      orgao_id: lic.orgao_id,
    },
    cronograma,
    ctx.agora,
    { exigirDatas: !ctx.somenteAvaliacao },
  );
  return av.pendencias;
};

/** @deprecated nome antigo (só a dispensa) — o gate vale para todas as modalidades: `prazosDePublicacao`. */
export const prazoMinimoDispensa = prazosDePublicacao;

/**
 * EDITAL REAL (plano E7a item 3): pregão, concorrência, leilão, concurso e
 * diálogo só se publicam com o edital anexado (documento EDITAL da licitação
 * ou "Edital aprovado" da fase interna com arquivo) — é ele que vai ao PNCP
 * (`EditalService.editalVigente`), nunca um PDF em branco.
 */
export const editalAnexado: Precondicao = async (ctx) => {
  const lic = ctx.licitacao as any;
  if (lic.selecao_externa) return null;
  if (!MODALIDADES_COM_EDITAL.includes(lic.modalidade)) return null;
  if (!ctx.consultas.editalVigente) return null;
  const edital = await ctx.consultas.editalVigente();
  if (edital) return null;
  return 'Anexe o edital (documento "Edital" da licitação ou o edital aprovado na fase interna) antes de publicar — art. 54 da Lei 14.133/2021.';
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

/**
 * Art. 55 §1º (plano E7a): impugnação ACOLHIDA que altera o edital exige a
 * RETIFICAÇÃO antes da sessão (a alteração precisa ser divulgada).
 */
export const impugnacoesAtendidasPorRetificacao: Precondicao = async (ctx) => {
  if (!ctx.consultas.impugnacoesSemRetificacao) return null;
  const pend = await ctx.consultas.impugnacoesSemRetificacao();
  if (!pend.length) return null;
  return `Impugnação acolhida altera o edital: retifique o edital antes de abrir a sessão (art. 55, §1º, Lei 14.133/2021) — ${pend.join(', ')}.`;
};

/**
 * Retificação que afetou as propostas (art. 55 §1º; plano E7a): enquanto o
 * novo prazo de recebimento corre, a sessão espera a confirmação dos
 * licitantes; vencido o prazo, as não confirmadas saem da disputa
 * (`excluirPropostasNaoConfirmadas`).
 */
export const propostasConfirmadasAposRetificacao: Precondicao = async (ctx) => {
  if (!ctx.consultas.propostasAguardandoConfirmacao) return null;
  const corte = fimDoRecebimento(ctx.licitacao as any);
  if (!corte || ctx.agora.getTime() >= new Date(corte).getTime()) return null;
  const n = await ctx.consultas.propostasAguardandoConfirmacao();
  if (!n) return null;
  return `${n} proposta(s) aguardando a confirmação do licitante depois da retificação do edital (art. 55, §1º) — prazo até ${formatarDataBrasilia(new Date(corte))}.`;
};

/** Fim do prazo de confirmação: proposta não confirmada sai da disputa. */
export const excluirPropostasNaoConfirmadas: EfeitoPersistido = async (lic, manager, ctx) => {
  const corte = fimDoRecebimento(lic as any);
  if (corte && ctx.agora.getTime() < new Date(corte).getTime()) return;
  await excluirPropostasNaoConfirmadasSql(manager, lic.id);
};

/**
 * ART. 71 §3º (plano E7a): "Nos casos de anulação e revogação, deverá ser
 * assegurada a prévia manifestação dos interessados". Havendo licitantes, o
 * REVOGAR/ANULAR exige a intenção do mesmo tipo com o prazo de manifestação
 * já decorrido (INTENCAO_REVOGAR / INTENCAO_ANULAR). Sem licitantes, não há
 * interessados a ouvir.
 */
export const manifestacaoPreviaAssegurada: Precondicao = async (ctx) => {
  if (!ctx.consultas.intencaoExtincaoAberta) return null;
  // Interessados = licitantes com proposta e, no credenciamento, inscritos/credenciados (E7b)
  const n = ctx.consultas.interessadosExtincao ? await ctx.consultas.interessadosExtincao() : await ctx.consultas.propostasRecebidas();
  if (n === 0) return null;
  const tipo = ctx.ato === AtoLicitacao.ANULAR ? 'ANULAR' : 'REVOGAR';
  const verbo = tipo === 'ANULAR' ? 'anular' : 'revogar';
  const i = await ctx.consultas.intencaoExtincaoAberta();
  if (!i || i.tipo !== tipo) {
    return (
      `Há ${n} interessado(s) (licitantes/inscritos): antes de ${verbo}, abra o prazo de manifestação prévia (art. 71, §3º, Lei 14.133/2021) ` +
      `— ato "Intenção de ${verbo}".`
    );
  }
  if (ctx.agora.getTime() <= new Date(i.prazo_fim).getTime()) {
    return `Prazo de manifestação prévia dos interessados (art. 71, §3º) em curso até ${formatarDataBrasilia(new Date(i.prazo_fim))}.`;
  }
  return null;
};

/** Só uma intenção de revogar/anular por vez. */
export const semIntencaoDeExtincaoAberta: Precondicao = async (ctx) => {
  if (!ctx.consultas.intencaoExtincaoAberta) return null;
  const i = await ctx.consultas.intencaoExtincaoAberta();
  if (!i) return null;
  return `Já há intenção de ${i.tipo === 'ANULAR' ? 'anular' : 'revogar'} com prazo de manifestação aberto (até ${formatarDataBrasilia(new Date(i.prazo_fim))}).`;
};

const concluirIntencaoDeExtincao =
  (tipo: 'REVOGAR' | 'ANULAR'): EfeitoPersistido =>
  async (lic, manager) => {
    await concluirExtincaoSql(manager, lic.id, tipo);
  };

/** RETIFICAR_EDITAL: dados completos e prazos do art. 55 recontados da retificação (se afetar propostas). */
export const retificacaoValida: Precondicao = (ctx) => {
  if (ctx.somenteAvaliacao) return null;
  const lic = ctx.licitacao as any;
  const dados = ctx.dados || {};
  const campos = (dados.campos || {}) as Record<string, any>;
  const atual: Record<string, any> = {};
  for (const c of CAMPOS_CRONOGRAMA) atual[c] = lic[c] ?? null;
  return pendenciasDaRetificacao(
    {
      modalidade: lic.modalidade,
      tipo_contratacao: campos.tipo_contratacao ?? lic.tipo_contratacao,
      criterio_julgamento: campos.criterio_julgamento ?? lic.criterio_julgamento,
      regime_execucao: campos.regime_execucao ?? lic.regime_execucao,
      natureza_objeto: campos.natureza_objeto ?? lic.natureza_objeto,
      orgao_id: lic.orgao_id,
    },
    atual,
    {
      afeta_propostas: dados.afeta_propostas,
      alteracoes: dados.alteracoes,
      justificativa_nao_afeta: dados.justificativa_nao_afeta,
      cronograma: dados.cronograma,
    },
    ctx.agora,
  );
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

/**
 * RETIFICAR_EDITAL: grava o cronograma republicado (a data de publicação
 * original fica — a da retificação vai para `retificacoes_edital`) e os
 * campos do edital alterados (lista fechada `CAMPOS_EDITAL_RETIFICAVEIS`).
 */
const gravarRetificacao: Efeito = (lic, ctx) => {
  const dados = ctx.dados || {};
  const cronograma = (dados.cronograma || {}) as Record<string, any>;
  // Nova abertura sem novo limite de impugnação: vale o art. 164 contado da nova data
  if (cronogramaDoCertameMudou(lic as any, cronograma) && !cronograma.data_limite_impugnacao) {
    (lic as any).data_limite_impugnacao = null;
  }
  for (const campo of CAMPOS_CRONOGRAMA) {
    if (campo === 'data_publicacao_edital') continue;
    if (cronograma[campo]) (lic as any)[campo] = new Date(cronograma[campo]);
  }
  const campos = (dados.campos || {}) as Record<string, any>;
  for (const c of CAMPOS_EDITAL_RETIFICAVEIS) {
    if (campos[c] !== undefined) (lic as any)[c] = campos[c];
  }
};

/**
 * Fase depois da retificação: só muda quando a alteração AFETA as propostas e
 * o recebimento já tinha terminado (ANALISE_PROPOSTAS) — os prazos reabrem:
 * volta ao recebimento (ou a PUBLICADO, se o novo início ainda não chegou).
 */
function faseAposRetificacao(lic: { fase: FaseLicitacao }, ctx?: ContextoTransicao): FaseLicitacao {
  const d = ctx?.dados || {};
  const afeta = d.afeta_propostas === true || d.afeta_propostas === 'true';
  if (!afeta || lic.fase !== FaseLicitacao.ANALISE_PROPOSTAS) return lic.fase;
  const inicio = d.cronograma?.data_inicio_acolhimento ? new Date(d.cronograma.data_inicio_acolhimento) : null;
  return inicio && inicio.getTime() > (ctx?.agora ?? new Date()).getTime()
    ? FaseLicitacao.PUBLICADO
    : FaseLicitacao.ACOLHIMENTO_PROPOSTAS;
}

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
  precondicoes: [instrucaoCompleta, haItensComValorEstimado],
  efeitos: [concluirFaseInterna],
};

/** Contratação direta: instrução em etapa única (art. 72) — de qualquer etapa interna. */
const CONCLUIR_FASE_INTERNA_CONTRATACAO_DIRETA: DefinicaoAto = {
  ato: A.CONCLUIR_FASE_INTERNA,
  rotulo: 'Concluir instrução (art. 72)',
  de: FASES_INTERNAS,
  para: F.APROVACAO_INTERNA,
  precondicoes: [instrucaoCompleta, haItensComValorEstimado],
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
  precondicoes: [instrucaoCompleta, haItensComValorEstimado, editalAnexado, prazosDePublicacao, exclusividadeMpeArt48],
  efeitos: [gravarCronogramaPublicacao, gravarJustificativaArt49],
  // o edital anexado vira o documento divulgado (E7a)
  efeitosPersistidos: [async (lic, m) => marcarEditalPublicadoSql(m, lic.id)],
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
  precondicoes: [fimAcolhimentoAlcancado, propostasConfirmadasAposRetificacao],
  efeitosPersistidos: [excluirPropostasNaoConfirmadas],
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
  precondicoes: [
    aberturaSessaoAlcancada,
    impugnacoesAtendidasPorRetificacao,
    propostasConfirmadasAposRetificacao,
    haPropostasAptas,
    habilitacaoPreviaJulgada,
  ],
  efeitos: [marcarData('data_inicio_disputa')],
  efeitosPersistidos: [excluirPropostasNaoConfirmadas],
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
  precondicoes: [
    fimAcolhimentoAlcancado,
    janelaLancesDispensaEncerrada,
    impugnacoesAtendidasPorRetificacao,
    propostasConfirmadasAposRetificacao,
  ],
  efeitos: [marcarData('data_adjudicacao')],
  efeitosPersistidos: [excluirPropostasNaoConfirmadas],
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
  precondicoes: [semContratoAssinado, manifestacaoPreviaAssegurada],
  efeitosPersistidos: [concluirIntencaoDeExtincao('REVOGAR')],
};

const ANULAR: DefinicaoAto = {
  ato: A.ANULAR,
  rotulo: 'Anular (art. 71, III)',
  de: ORDEM_FASES,
  situacoesOrigem: [S.ATIVA, S.SUSPENSA],
  situacaoPara: S.ANULADA,
  requerMotivo: true,
  precondicoes: [semContratoAssinado, manifestacaoPreviaAssegurada],
  efeitosPersistidos: [concluirIntencaoDeExtincao('ANULAR')],
};

/**
 * RETIFICAR_EDITAL (art. 55 §1º; plano E7a): depois da divulgação e antes da
 * sessão, toda alteração do edital é este ato — nova versão do edital
 * (EDITAL_RETIFICADO), motivo, o que mudou e a decisão "afeta a formulação
 * das propostas?" (afeta → prazos reabertos e propostas a confirmar). Cabe
 * também com a licitação suspensa (a retomada é outro ato). Endpoint próprio
 * (arquivo do edital).
 */
const RETIFICAR_EDITAL: DefinicaoAto = {
  ato: A.RETIFICAR_EDITAL,
  rotulo: 'Retificar edital (art. 55, §1º)',
  de: [F.PUBLICADO, F.IMPUGNACAO, F.ACOLHIMENTO_PROPOSTAS, F.ANALISE_PROPOSTAS],
  para: (lic, ctx) => faseAposRetificacao(lic, ctx),
  situacoesOrigem: [S.ATIVA, S.SUSPENSA],
  requerMotivo: true,
  requerDados: true,
  endpoint: 'POST /publicacao/licitacao/:id/retificar',
  precondicoes: [retificacaoValida],
  efeitos: [gravarRetificacao],
  mensagemForaDaFase: (lic) =>
    FASES_INTERNAS.includes(lic.fase)
      ? 'Edital ainda não divulgado — altere o cadastro normalmente (a retificação é depois da publicação).'
      : 'Sessão já aberta — o edital não se retifica mais (anule ou revogue, se for o caso).',
};

/** Intenção de revogar/anular (art. 71 §3º): abre o prazo de manifestação dos licitantes. */
const intencaoDeExtincao = (ato: AtoLicitacao.INTENCAO_REVOGAR | AtoLicitacao.INTENCAO_ANULAR): DefinicaoAto => ({
  ato,
  rotulo:
    ato === A.INTENCAO_REVOGAR
      ? 'Intenção de revogar (prazo de manifestação — art. 71, §3º)'
      : 'Intenção de anular (prazo de manifestação — art. 71, §3º)',
  de: ORDEM_FASES,
  situacoesOrigem: [S.ATIVA, S.SUSPENSA],
  requerMotivo: true,
  requerDados: true,
  endpoint: 'POST /publicacao/licitacao/:id/intencao-extincao',
  precondicoes: [semContratoAssinado, semIntencaoDeExtincaoAberta],
});
const INTENCAO_REVOGAR = intencaoDeExtincao(A.INTENCAO_REVOGAR);
const INTENCAO_ANULAR = intencaoDeExtincao(A.INTENCAO_ANULAR);


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

const ATOS_SITUACAO: DefinicaoAto[] = [
  SUSPENDER,
  RETOMAR,
  INTENCAO_REVOGAR,
  REVOGAR,
  INTENCAO_ANULAR,
  ANULAR,
  DECLARAR_DESERTA,
  DECLARAR_FRACASSADA,
  CONCLUIR,
];

// ---------------------------------------------------------------------------
// Fluxos por modalidade (a ordem define o "ato principal" do avançar-fase)
// ---------------------------------------------------------------------------

/** Rito completo (pregão/concorrência — e, por ora, leilão, concurso e diálogo). */
const FLUXO_COMPETITIVO: DefinicaoAto[] = [
  ...ATOS_ETAPAS_INTERNAS,
  CONCLUIR_FASE_INTERNA_RITO_COMPLETO,
  PUBLICAR,
  CANCELAR_PUBLICACAO,
  RETIFICAR_EDITAL,
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
  RETIFICAR_EDITAL,
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
  RETIFICAR_EDITAL,
  REGISTRAR_RESULTADO_EXTERNO,
  HOMOLOGAR,
  ...ATOS_SITUACAO,
];

// ---------------------------------------------------------------------------
// CREDENCIAMENTO (plano E7b — Lei 14.133 arts. 6º XLIII, 78 I, 79 e 74 IV)
// ---------------------------------------------------------------------------

/** Regras do edital de chamamento configuradas (hipótese × regra, vigência, condições, valor fixado). */
export const editalCredenciamentoConfigurado: Precondicao = async (ctx) => {
  if (!ctx.consultas.credenciamento) return null;
  return pendenciasEditalCredenciamento(await ctx.consultas.credenciamento(), ctx.agora);
};

/** Encerramento da vigência só no fim do prazo do edital (antes disso: revogar — art. 71). */
export const fimVigenciaCredenciamentoAlcancado: Precondicao = (ctx) => {
  const fim = ctx.licitacao.data_fim_acolhimento;
  if (fim && ctx.agora < new Date(fim)) {
    return `A vigência do edital de credenciamento vai até ${formatarDataHora(fim)} — para encerrá-lo antes, revogue o credenciamento (art. 71, II).`;
  }
  return null;
};

/** Contratar só durante a vigência (inscrições abertas). */
export const vigenciaCredenciamentoEmCurso: Precondicao = (ctx) => {
  const fim = ctx.licitacao.data_fim_acolhimento;
  if (fim && ctx.agora > new Date(fim)) return 'A vigência do edital de credenciamento terminou — não há novas contratações.';
  return null;
};

/**
 * PUBLICAR do credenciamento: a vigência do edital (configuração) vira o
 * período de inscrições da licitação (`data_inicio/fim_acolhimento`) — é o
 * que o PNCP recebe como abertura/encerramento e o que o relógio usa.
 */
const gravarVigenciaCredenciamento: EfeitoPersistido = async (lic, manager, ctx) => {
  const [c] = await manager.query(`SELECT vigencia_inicio, vigencia_fim FROM credenciamento_configuracoes WHERE licitacao_id::text = $1`, [lic.id]);
  lic.fase_interna_concluida = true;
  if (!lic.data_publicacao_edital) lic.data_publicacao_edital = ctx.agora;
  if (c?.vigencia_inicio) {
    const ini = new Date(c.vigencia_inicio);
    lic.data_inicio_acolhimento = ini.getTime() < ctx.agora.getTime() ? ctx.agora : ini;
  }
  if (c?.vigencia_fim) lic.data_fim_acolhimento = new Date(c.vigencia_fim);
  (lic as any).data_abertura_sessao = null;
};

const PUBLICAR_CREDENCIAMENTO: DefinicaoAto = {
  ato: A.PUBLICAR,
  rotulo: 'Publicar edital de credenciamento (chamamento público)',
  de: [F.APROVACAO_INTERNA],
  para: F.PUBLICADO,
  requerDados: true,
  endpoint: 'PATCH /credenciamento/:id/publicar',
  principal: true,
  // Sem prazo mínimo do art. 55 (não é modalidade de licitação); inscrições
  // abertas durante toda a vigência (art. 79 par. único I).
  precondicoes: [instrucaoCompleta, haItensComValorEstimado, editalAnexado, editalCredenciamentoConfigurado],
  efeitosPersistidos: [gravarVigenciaCredenciamento, async (lic, m) => marcarEditalPublicadoSql(m, lic.id)],
  mensagemForaDaFase: () => 'Conclua a instrução (fase interna) antes de publicar o edital de credenciamento',
};

const ABRIR_INSCRICOES_CREDENCIAMENTO: DefinicaoAto = {
  ato: A.INICIAR_ACOLHIMENTO,
  rotulo: 'Abrir inscrições (início da vigência do edital)',
  de: [F.PUBLICADO],
  para: F.ACOLHIMENTO_PROPOSTAS,
  principal: true,
  precondicoes: [inicioAcolhimentoAlcancado],
};

/** Fim da vigência (relógio — LicitacoesSchedulerService): processo CONCLUÍDO, inscrições pendentes arquivadas. */
const ENCERRAR_VIGENCIA_CREDENCIAMENTO: DefinicaoAto = {
  ato: A.ENCERRAR_ACOLHIMENTO,
  rotulo: 'Encerrar vigência do edital de credenciamento',
  de: [F.PUBLICADO, F.ACOLHIMENTO_PROPOSTAS],
  situacaoPara: S.CONCLUIDA,
  precondicoes: [fimVigenciaCredenciamentoAlcancado],
  efeitosPersistidos: [async (lic, m) => { await arquivarInscricoesPendentesSql(m, lic.id); }],
};

/** Atos do credenciamento que não mudam a fase (trava + histórico + evento). Só pelo CredenciamentoService. */
const atoDoCredenciamento = (ato: AtoLicitacao, rotulo: string, extra: Partial<DefinicaoAto> = {}): DefinicaoAto => ({
  ato,
  rotulo,
  de: [F.PUBLICADO, F.ACOLHIMENTO_PROPOSTAS],
  somenteSistema: true,
  requerDados: true,
  ...extra,
});

const FLUXO_CREDENCIAMENTO: DefinicaoAto[] = [
  ...ATOS_ETAPAS_INTERNAS,
  CONCLUIR_FASE_INTERNA_CONTRATACAO_DIRETA,
  PUBLICAR_CREDENCIAMENTO,
  CANCELAR_PUBLICACAO,
  ABRIR_INSCRICOES_CREDENCIAMENTO,
  ENCERRAR_VIGENCIA_CREDENCIAMENTO,
  atoDoCredenciamento(A.DEFERIR_CREDENCIAMENTO, 'Deferir inscrição (credenciar)', { endpoint: 'POST /credenciamento/inscricoes/:id/deferir' }),
  atoDoCredenciamento(A.INDEFERIR_CREDENCIAMENTO, 'Indeferir inscrição', { requerMotivo: true, endpoint: 'POST /credenciamento/inscricoes/:id/indeferir' }),
  atoDoCredenciamento(A.DECIDIR_RECURSO_CREDENCIAMENTO, 'Decidir recurso contra indeferimento (art. 165)', {
    requerMotivo: true,
    endpoint: 'POST /credenciamento/inscricoes/:id/recurso/decidir',
  }),
  atoDoCredenciamento(A.CONTRATAR_CREDENCIADO, 'Contratar credenciado (distribuição da demanda — art. 74 IV)', {
    de: [F.ACOLHIMENTO_PROPOSTAS],
    endpoint: 'POST /credenciamento/:id/contratacoes',
    precondicoes: [vigenciaCredenciamentoEmCurso],
  }),
  atoDoCredenciamento(A.DESCREDENCIAR, 'Descredenciar / denúncia (art. 79, parágrafo único, VI)', {
    requerMotivo: true,
    endpoint: 'POST /credenciamento/inscricoes/:id/descredenciar',
  }),
  SUSPENDER,
  RETOMAR,
  INTENCAO_REVOGAR,
  REVOGAR,
  INTENCAO_ANULAR,
  ANULAR,
];

/**
 * Leilão, concurso e diálogo competitivo (plano E7c): mesmos atos do rito
 * completo + atos/pré-condições próprios (`definicoes-especiais.ts`).
 */
const ESPECIAIS = montarFluxosEspeciais({
  etapasInternas: ATOS_ETAPAS_INTERNAS,
  concluirFaseInterna: CONCLUIR_FASE_INTERNA_RITO_COMPLETO,
  publicar: PUBLICAR,
  cancelarPublicacao: CANCELAR_PUBLICACAO,
  retificarEdital: RETIFICAR_EDITAL,
  iniciarAcolhimento: INICIAR_ACOLHIMENTO,
  encerrarAcolhimento: ENCERRAR_ACOLHIMENTO,
  iniciarDisputa: INICIAR_DISPUTA,
  encerrarDisputa: ENCERRAR_DISPUTA,
  iniciarHabilitacao: INICIAR_HABILITACAO,
  abrirPrazoRecursal: ABRIR_PRAZO_RECURSAL,
  adjudicar: ADJUDICAR,
  decidirRecursos: DECIDIR_RECURSOS,
  retornarJulgamento: RETORNAR_JULGAMENTO,
  retornarHabilitacao: RETORNAR_HABILITACAO,
  homologar: HOMOLOGAR,
  situacao: ATOS_SITUACAO,
  semRecursoPendente,
  efeitosDosRecursosAplicados,
  marcarDataAdjudicacao: marcarData('data_adjudicacao'),
});

export const FLUXOS: FluxosPorModalidade = {
  [ModalidadeLicitacao.PREGAO_ELETRONICO]: FLUXO_COMPETITIVO,
  [ModalidadeLicitacao.CONCORRENCIA]: FLUXO_COMPETITIVO,
  // Leilão, concurso e diálogo competitivo (plano E7c — definicoes-especiais.ts)
  [ModalidadeLicitacao.LEILAO]: ESPECIAIS.leilao,
  [ModalidadeLicitacao.CONCURSO]: ESPECIAIS.concurso,
  [ModalidadeLicitacao.DIALOGO_COMPETITIVO]: ESPECIAIS.dialogo,
  [ModalidadeLicitacao.DISPENSA_ELETRONICA]: FLUXO_DISPENSA,
  [ModalidadeLicitacao.INEXIGIBILIDADE]: FLUXO_INEXIGIBILIDADE,
  // Procedimento auxiliar (art. 78 I) — plano E7b
  [ModalidadeLicitacao.CREDENCIAMENTO]: FLUXO_CREDENCIAMENTO,
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

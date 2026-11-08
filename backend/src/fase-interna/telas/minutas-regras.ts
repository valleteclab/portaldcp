/**
 * MINUTAS GERADAS POR MODELO (Entrega 3B) — regras puras.
 *
 *  - Toda peça gerada pelo modelo guarda a "impressão" do texto gerado
 *    (`dados_estruturados._gerado.hash`). Se o texto atual das seções ainda é
 *    o gerado, a peça NÃO foi editada à mão e pode ser REGERADA quando o
 *    processo muda (fundamento legal, número, sigilo) — critério de aceite da
 *    SPEC: "mudar `fundamento_legal` atualiza as minutas geradas por modelo".
 *  - Editada à mão, assinada ou em assinatura: não se mexe no texto; a peça
 *    ganha o aviso "desatualizada — regerar?".
 *  - Conferência de vinculação (VINC-01) e enquadramento citado (ENQ-01):
 *    implementadas no motor de conformidade (`conformidade/texto.ts`, Entrega
 *    4) e reexportadas aqui — uma implementação só.
 */
import { createHash } from 'crypto';

/** Peças geradas pelo modelo que acompanham os dados do processo. */
export const TIPOS_REGERAVEIS = ['AA', 'RAG', 'ME', 'MC'] as const;
export type TipoRegeravel = (typeof TIPOS_REGERAVEIS)[number];

/** Seções (texto) de uma peça — ignora as chaves internas (`_…`) e as não-texto. */
export function secoesDaPeca(dados: unknown): Record<string, string> {
  if (!dados || typeof dados !== 'object') return {};
  const r: Record<string, string> = {};
  for (const [k, v] of Object.entries(dados as Record<string, unknown>)) {
    if (k.startsWith('_') || typeof v !== 'string') continue;
    if (['nao_se_aplica', 'justificativa_nao_se_aplica'].includes(k)) continue;
    r[k] = v;
  }
  return r;
}

/** Impressão estável do texto das seções (ordem das chaves não importa). */
export function hashSecoes(secoes: Record<string, string>): string {
  const ordenado = Object.keys(secoes)
    .sort()
    .map((k) => [k, String(secoes[k] ?? '').trim()]);
  return createHash('sha256').update(JSON.stringify(ordenado)).digest('hex');
}

export interface PecaParaRegerar {
  id: string;
  tipo: string;
  status: string;
  origem: string;
  dados_estruturados: any;
}

export type DecisaoRegeracao =
  | { acao: 'REGERAR' }
  | { acao: 'MARCAR_DESATUALIZADA'; motivo: 'EDITADA' | 'ASSINADA' | 'EM_ASSINATURA' | 'APROVADA' }
  | { acao: 'IGNORAR'; motivo: 'NAO_GERADA' | 'ANEXADA' | 'NAO_SE_APLICA' | 'SUBSTITUIDA' };

/** A peça foi editada à mão depois de gerada? */
export function pecaEditadaAMao(doc: Pick<PecaParaRegerar, 'dados_estruturados'>): boolean {
  const g = doc.dados_estruturados?._gerado;
  if (!g?.hash) return false;
  return hashSecoes(secoesDaPeca(doc.dados_estruturados)) !== g.hash;
}

/**
 * O que fazer com a peça quando o processo muda (fundamento, número, sigilo):
 *  - não gerada pelo modelo, anexada (feita fora), "não se aplica" ou versão
 *    antiga → nada;
 *  - assinada ou aguardando assinatura → aviso (não se reescreve peça assinada);
 *  - editada à mão → aviso "desatualizada, regerar?";
 *  - gerada e intocada → regerar.
 */
export function decidirRegeracao(doc: PecaParaRegerar): DecisaoRegeracao {
  const dados = doc.dados_estruturados || {};
  if (doc.status === 'SUBSTITUIDO') return { acao: 'IGNORAR', motivo: 'SUBSTITUIDA' };
  if (dados.nao_se_aplica) return { acao: 'IGNORAR', motivo: 'NAO_SE_APLICA' };
  if (doc.origem !== 'INTERNO') return { acao: 'IGNORAR', motivo: 'ANEXADA' };
  if (!dados._gerado?.hash) return { acao: 'IGNORAR', motivo: 'NAO_GERADA' };
  if (doc.status === 'ASSINADO') return { acao: 'MARCAR_DESATUALIZADA', motivo: 'ASSINADA' };
  if (doc.status === 'AGUARDANDO_ASSINATURA') return { acao: 'MARCAR_DESATUALIZADA', motivo: 'EM_ASSINATURA' };
  if (doc.status === 'APROVADO') return { acao: 'MARCAR_DESATUALIZADA', motivo: 'APROVADA' };
  if (pecaEditadaAMao(doc)) return { acao: 'MARCAR_DESATUALIZADA', motivo: 'EDITADA' };
  return { acao: 'REGERAR' };
}

/** Rótulo (do `MinutasSubscriber`) da mudança do modo de disputa da dispensa. */
export const CAMPO_DISPUTA_DISPENSA = 'disputa da dispensa (com/sem lances)';

/**
 * O que, da mudança do processo, afeta ESTA peça. Decisão do dono
 * (homologação 26/09/2026): com ou sem lances é escolha do agente de
 * contratação no processo (Lei 14.133/2021, art. 75, §3º — a condução da
 * seleção), não da autoridade — trocar o modo de disputa NÃO desatualiza o
 * despacho de autorização (art. 72, VIII: a autoridade autoriza o objeto, o
 * enquadramento, o teto e a dotação; o texto do despacho não cita a disputa).
 * A minuta do aviso continua acompanhando (ela cita a forma de disputa).
 */
export function camposQueAfetamAPeca(tipo: string, campos: string[]): string[] {
  if (tipo === 'AA') return campos.filter((c) => c !== CAMPO_DISPUTA_DISPENSA);
  return campos;
}

/** A marca "desatualizada" ainda vale para a peça? (a do despacho só pela disputa deixou de valer). */
export function desatualizacaoRelevante(tipo: string, marca: { campos?: unknown } | null | undefined): boolean {
  if (!marca) return false;
  if (!Array.isArray(marca.campos)) return true;
  return camposQueAfetamAPeca(tipo, marca.campos.map(String)).length > 0;
}

// ---------------------------------------------------------------------------
// Conferências de texto — a implementação é a do motor de conformidade
// (Entrega 4: `conformidade/texto.ts`); reexportadas aqui para quem já usava.
// ---------------------------------------------------------------------------

export { textoPuro, normalizarNumero, referenciasDivergentes, incisosDoArt75Citados } from '../conformidade/texto';

/**
 * Sigilo do orçamento (art. 24): sigiloso exige justificativa (mínimo 20
 * caracteres). Regra única — tela das minutas (`salvarSigilo`) e a entrada
 * "fase interna feita fora".
 */
export function motivoSigiloInvalido(sigiloso: boolean, justificativa: string | null | undefined): string | null {
  if (sigiloso && String(justificativa ?? '').trim().length < 20) return 'Justifique o sigilo do orçamento (art. 24 da Lei 14.133/2021).';
  return null;
}

/**
 * CLÁUSULAS PADRÃO DA MINUTA DO CONTRATO (homologação 07/11/2026: o modelo
 * deixava 8 cláusulas obrigatórias do art. 92 em branco e a minuta "pronta"
 * travava a publicação). Quando a seção do modelo vem vazia, a geração usa o
 * texto padrão abaixo e, onde o TR já define o assunto, junta o texto do TR
 * (modelo de execução, de gestão, medição e pagamento). Variáveis `{{…}}` são
 * as do modelo (substituídas pelo serviço). Texto do usuário nunca é trocado:
 * isto só vale na geração.
 */
export const CLAUSULAS_PADRAO_CONTRATO: Record<string, { texto: string; doTr?: string }> = {
  regime_execucao: {
    texto: '<p>O objeto será executado na forma do modelo de execução definido no termo de referência, que integra este contrato.</p>',
    doTr: 'modelo_execucao',
  },
  preco: {
    texto:
      '<p>O valor deste contrato é o da proposta da contratada, limitado ao valor estimado de {{licitacao.valor_estimado}}, e inclui todas as despesas necessárias à execução do objeto. O preço é fixo e irreajustável por 12 (doze) meses contados da data do orçamento estimado; depois desse prazo, poderá ser reajustado pelo IPCA/IBGE (art. 25, §7º, e art. 92, V, da Lei nº 14.133/2021).</p>',
  },
  pagamento: {
    texto:
      '<p>O pagamento será feito em até 30 (trinta) dias do recebimento definitivo e da nota fiscal atestada pelo fiscal do contrato, conforme os critérios de medição do termo de referência e a ordem cronológica do art. 141 da Lei nº 14.133/2021.</p>',
    doTr: 'pagamento',
  },
  prazos: {
    texto:
      '<p>Os prazos de vigência, de início, de execução e de recebimento do objeto são os definidos no termo de referência, contados da assinatura deste contrato ou da ordem de serviço ou de fornecimento, admitida a prorrogação nos termos dos arts. 105 a 114 da Lei nº 14.133/2021.</p>',
  },
  obrigacoes: {
    texto:
      '<p>Cabe à contratada executar o objeto conforme o termo de referência e a proposta; responder pelos danos causados à Administração ou a terceiros (art. 120); manter as condições de habilitação; e arcar com os encargos trabalhistas, previdenciários, fiscais e comerciais (art. 121 da Lei nº 14.133/2021). Cabe à contratante acompanhar e fiscalizar a execução, prestar as informações necessárias e pagar nas condições pactuadas.</p>',
  },
  penalidades: {
    texto:
      '<p>Pelas infrações do art. 155 da Lei nº 14.133/2021, a contratada fica sujeita às sanções do art. 156 — advertência, multa de 0,5% a 30% do valor do contrato, impedimento de licitar e contratar e declaração de inidoneidade —, aplicadas em processo com contraditório e ampla defesa (arts. 157 e 158).</p>',
  },
  gestao: {
    texto:
      '<p>A execução será acompanhada e fiscalizada pelo gestor e pelo fiscal do contrato designados pela Administração (art. 117 da Lei nº 14.133/2021), conforme o modelo de gestão do termo de referência.</p>',
    doTr: 'modelo_gestao',
  },
  extincao: {
    texto:
      '<p>Este contrato poderá ser extinto nas hipóteses dos arts. 137 a 139 da Lei nº 14.133/2021 — por ato unilateral da Administração, por acordo entre as partes ou por decisão arbitral ou judicial —, assegurados o contraditório e a ampla defesa.</p>',
  },
};

const temTexto = (v: unknown) => typeof v === 'string' && v.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0;

/**
 * Completa as cláusulas VAZIAS da minuta do contrato gerada pelo modelo: texto
 * padrão (com as variáveis já substituídas por `substituir`) e, quando houver,
 * o trecho correspondente do TR. Só mexe nas seções que o modelo tem.
 */
export function completarClausulasDoContrato(
  secoes: Record<string, string>,
  tr: Record<string, string> | null,
  substituir: (texto: string) => string,
): Record<string, string> {
  const r = { ...secoes };
  for (const [id, padrao] of Object.entries(CLAUSULAS_PADRAO_CONTRATO)) {
    if (!(id in r) || temTexto(r[id])) continue;
    const doTr = padrao.doTr && tr && temTexto(tr[padrao.doTr]) ? tr[padrao.doTr] : '';
    r[id] = substituir(padrao.texto) + (doTr ? `\n<p>Conforme o termo de referência:</p>\n${doTr}` : '');
  }
  return r;
}

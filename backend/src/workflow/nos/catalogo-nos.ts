/**
 * CATÁLOGO DE NÓS do fluxo de processo (decisão do dono de 06/10/2026: um só
 * motor, "tipo N8N", onde se desenha o fluxo e se acompanha a execução passo a
 * passo). Cada nó é uma etapa que o órgão arrasta para o desenho.
 *
 * O "o que é" do nó fica aqui; o "o que faz ao executar" fica no executor
 * registrado para o tipo (`ExecutorNo`, ver executor-no.ts). Tipo sem executor
 * funciona como tarefa simples: o responsável conclui e o fluxo avança.
 *
 * `obrigatoria_lei`: a etapa não pode ser removida do desenho nem pulada na
 * execução. `documento.aceita_externo`: além de gerar no sistema, o
 * responsável pode anexar o documento feito fora (pedido do dono).
 */

export type GrupoNo = 'CONTRATACAO' | 'GERAL';

export interface DefinicaoNo {
  tipo: string;
  rotulo: string;
  descricao: string;
  grupo: GrupoNo;
  documento: { produz: boolean; aceita_externo: boolean };
  obrigatoria_lei: { fundamento: string; dispensa: string | null } | null;
  /** Executa sozinho ao chegar (sem pessoa responsável) e o fluxo segue. */
  automatico: boolean;
  /** Fora da paleta enquanto o executor não existir. */
  disponivel: boolean;
}

const doc = (produz: boolean) => ({ produz, aceita_externo: produz });

export const CATALOGO_NOS: readonly DefinicaoNo[] = [
  { tipo: 'DEMANDA', rotulo: 'Demanda', descricao: 'Pedido do setor requisitante: o que precisa e por quê.', grupo: 'CONTRATACAO', documento: doc(true), obrigatoria_lei: null, automatico: false, disponivel: true },
  { tipo: 'APROVACAO', rotulo: 'Aprovação', descricao: 'Autoridade aprova, devolve ou indefere com motivo.', grupo: 'GERAL', documento: doc(false), obrigatoria_lei: null, automatico: false, disponivel: true },
  { tipo: 'DFD', rotulo: 'DFD', descricao: 'Documento de formalização da demanda; pode reunir demandas de vários setores.', grupo: 'CONTRATACAO', documento: doc(true), obrigatoria_lei: null, automatico: false, disponivel: true },
  { tipo: 'PESQUISA_PRECO', rotulo: 'Pesquisa de preço', descricao: 'Estimativa do valor com fontes do art. 23.', grupo: 'CONTRATACAO', documento: doc(true), obrigatoria_lei: null, automatico: false, disponivel: true },
  { tipo: 'ETP', rotulo: 'ETP', descricao: 'Estudo técnico preliminar com os elementos do art. 18, § 1º.', grupo: 'CONTRATACAO', documento: doc(true), obrigatoria_lei: null, automatico: false, disponivel: true },
  { tipo: 'MAPA_RISCOS', rotulo: 'Mapa de riscos', descricao: 'Riscos da contratação e respostas.', grupo: 'CONTRATACAO', documento: doc(true), obrigatoria_lei: null, automatico: false, disponivel: true },
  { tipo: 'TR', rotulo: 'TR', descricao: 'Termo de referência; define a modalidade.', grupo: 'CONTRATACAO', documento: doc(true), obrigatoria_lei: null, automatico: false, disponivel: true },
  { tipo: 'RESERVA_ORCAMENTARIA', rotulo: 'Reserva orçamentária', descricao: 'Indicação da dotação e reserva do valor.', grupo: 'CONTRATACAO', documento: doc(true), obrigatoria_lei: null, automatico: false, disponivel: true },
  { tipo: 'PARECER_JURIDICO', rotulo: 'Parecer jurídico', descricao: 'Controle prévio de legalidade.', grupo: 'CONTRATACAO', documento: doc(true), obrigatoria_lei: { fundamento: 'Lei 14.133, art. 53', dispensa: 'Hipóteses do § 5º, por ato da autoridade registrado nos autos.' }, automatico: false, disponivel: true },
  { tipo: 'CONTROLE_INTERNO', rotulo: 'Controle interno', descricao: 'Manifestação do controle interno.', grupo: 'CONTRATACAO', documento: doc(true), obrigatoria_lei: null, automatico: false, disponivel: true },
  { tipo: 'AUTORIZACAO', rotulo: 'Autorização', descricao: 'Autoridade competente autoriza a contratação.', grupo: 'CONTRATACAO', documento: doc(true), obrigatoria_lei: null, automatico: false, disponivel: true },
  { tipo: 'PUBLICACAO', rotulo: 'Publicação', descricao: 'Divulgação no PNCP e no mural do órgão.', grupo: 'CONTRATACAO', documento: doc(false), obrigatoria_lei: { fundamento: 'Lei 14.133, arts. 54 e 94', dispensa: null }, automatico: false, disponivel: true },
  { tipo: 'TAREFA', rotulo: 'Tarefa livre', descricao: 'Qualquer providência com responsável e prazo.', grupo: 'GERAL', documento: doc(false), obrigatoria_lei: null, automatico: false, disponivel: true },
  { tipo: 'FORMULARIO', rotulo: 'Formulário', descricao: 'Responsável preenche os campos definidos no fluxo.', grupo: 'GERAL', documento: doc(false), obrigatoria_lei: null, automatico: false, disponivel: true },
  { tipo: 'DOCUMENTO', rotulo: 'Documento', descricao: 'Redigir ou anexar um documento qualquer.', grupo: 'GERAL', documento: doc(true), obrigatoria_lei: null, automatico: false, disponivel: true },
  { tipo: 'OFICIO', rotulo: 'Ofício', descricao: 'Redigir, assinar e enviar um ofício.', grupo: 'GERAL', documento: doc(true), obrigatoria_lei: null, automatico: false, disponivel: false },
  { tipo: 'NOTIFICAR', rotulo: 'Notificar', descricao: 'Avisa pessoas ou setores por WhatsApp, e-mail ou Teams e segue.', grupo: 'GERAL', documento: doc(false), obrigatoria_lei: null, automatico: true, disponivel: true },
  { tipo: 'DECISAO', rotulo: 'Decisão', descricao: 'Escolhe o caminho conforme uma condição.', grupo: 'GERAL', documento: doc(false), obrigatoria_lei: null, automatico: false, disponivel: false },
];

const POR_TIPO = new Map(CATALOGO_NOS.map((n) => [n.tipo, n]));

export function definicaoDoNo(tipo: string | null | undefined): DefinicaoNo | null {
  return (tipo && POR_TIPO.get(String(tipo).toUpperCase())) || null;
}

export function tipoDeNoValido(tipo: string | null | undefined): boolean {
  return definicaoDoNo(tipo) !== null;
}

/** Texto da trava legal para exibir no nó (cadeado) — nulo quando a etapa não é exigida por lei. */
export function travaLegal(tipo: string | null | undefined): string | null {
  return definicaoDoNo(tipo)?.obrigatoria_lei?.fundamento ?? null;
}

/**
 * Etapas exigidas por lei que faltam num desenho. O desenho só é publicado
 * quando a lista vem vazia — `tiposExigidos` vem do tipo de processo (uma
 * contratação exige parecer e publicação; um ofício não exige nada).
 */
export function travasFaltando(tiposNoDesenho: string[], tiposExigidos: string[]): string[] {
  const presentes = new Set(tiposNoDesenho.map((t) => String(t).toUpperCase()));
  return tiposExigidos
    .map((t) => definicaoDoNo(t))
    .filter((d): d is DefinicaoNo => !!d && !!d.obrigatoria_lei && !presentes.has(d.tipo))
    .map((d) => `${d.rotulo} é obrigatória (${d.obrigatoria_lei!.fundamento}).`);
}

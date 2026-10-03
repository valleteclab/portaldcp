import { TipoProcesso } from './entities/processo.entity';
import { calcularEtapas } from './tipos/etapas-padrao';

/**
 * PAINEL DO GESTOR — regras puras: estado do processo pelo tempo parado,
 * etapas da licitação pela fase (leitura rápida, sem calcular o fluxo) e o
 * caminho dos pedidos (demandas).
 */
export type EstadoAndamento = 'OK' | 'LENTO' | 'PARADO' | 'CONCLUIDO';

/** Sem prazo definido na etapa, o alerta é 10 dias; "lento" a partir de 70% do limite. */
export const LIMITE_PADRAO_DIAS = 10;

export function diasEntre(desde: Date | string | null | undefined, agora = new Date()): number {
  if (!desde) return 0;
  const d = new Date(desde).getTime();
  if (!Number.isFinite(d)) return 0;
  return Math.max(0, Math.floor((agora.getTime() - d) / 86_400_000));
}

export function estadoPeloTempo(dias: number, limite: number | null | undefined, concluido = false): EstadoAndamento {
  if (concluido) return 'CONCLUIDO';
  const lim = limite && limite > 0 ? limite : LIMITE_PADRAO_DIAS;
  if (dias > lim) return 'PARADO';
  if (dias >= Math.ceil(lim * 0.7)) return 'LENTO';
  return 'OK';
}

export interface EtapaDoCaminho {
  chave: string;
  rotulo: string;
  estado: 'CONCLUIDA' | 'ATUAL' | 'FUTURA';
}

/** Fases da licitação na ordem do caminho (interna → externa). */
const FASES_LICITACAO: Array<[string, string]> = [
  ['PLANEJAMENTO', 'Planejamento'],
  ['TERMO_REFERENCIA', 'TR'],
  ['PESQUISA_PRECOS', 'Pesquisa de preços'],
  ['ANALISE_JURIDICA', 'Parecer'],
  ['APROVACAO_INTERNA', 'Autorização'],
  ['AGUARDANDO_DIVULGACAO', 'Publicação'],
  ['PUBLICADO', 'Publicado'],
  ['ACOLHIMENTO_PROPOSTAS', 'Propostas'],
  ['EM_DISPUTA', 'Disputa'],
  ['JULGAMENTO', 'Julgamento'],
  ['HABILITACAO', 'Habilitação'],
  ['RECURSO', 'Recurso'],
  ['ADJUDICACAO', 'Adjudicação'],
  ['HOMOLOGACAO', 'Homologação'],
];
const FASE_EQUIVALENTE: Record<string, string> = { IMPUGNACAO: 'PUBLICADO', ANALISE_PROPOSTAS: 'ACOLHIMENTO_PROPOSTAS' };

export function etapasDaLicitacao(fase: string | null | undefined, concluida = false): EtapaDoCaminho[] {
  const f = FASE_EQUIVALENTE[String(fase ?? '')] ?? String(fase ?? '');
  const idx = FASES_LICITACAO.findIndex(([c]) => c === f);
  return FASES_LICITACAO.map(([chave, rotulo], i) => ({
    chave,
    rotulo,
    estado: concluida || (idx >= 0 && i < idx) ? 'CONCLUIDA' : idx === i ? 'ATUAL' : 'FUTURA',
  }));
}

export function etapasDoProcessoProprio(tipo: TipoProcesso, chavesComPeca: Set<string>, temResultado: boolean, encerrado: boolean): EtapaDoCaminho[] {
  const calc = calcularEtapas(tipo, chavesComPeca, temResultado, encerrado);
  if (calc.length) return calc.map((e) => ({ chave: e.chave, rotulo: e.rotulo, estado: e.estado }));
  // AVULSO: sem etapas desenhadas
  return [
    { chave: 'AUTUACAO', rotulo: 'Autuação', estado: 'CONCLUIDA' },
    { chave: 'ANDAMENTO', rotulo: 'Em andamento', estado: encerrado ? 'CONCLUIDA' : 'ATUAL' },
    { chave: 'ENCERRAMENTO', rotulo: 'Encerramento', estado: encerrado ? 'CONCLUIDA' : 'FUTURA' },
  ];
}

/** Pedido (demanda): rascunho → enviado → aprovado → DFD → processo. */
export function etapasDoPedido(status: string, temDfd: boolean, temProcesso: boolean): EtapaDoCaminho[] {
  const ordem = ['RASCUNHO', 'ENVIADA', 'APROVADA', 'DFD', 'PROCESSO'];
  const atual = temProcesso ? 4 : temDfd ? 3 : status === 'APROVADA' || status === 'CONSOLIDADA' ? 2 : status === 'ENVIADA' || status === 'EM_ANALISE' ? 1 : 0;
  const rotulos: Record<string, string> = { RASCUNHO: 'Pedido', ENVIADA: 'Aprovação', APROVADA: 'Aprovado', DFD: 'DFD', PROCESSO: 'Processo' };
  return ordem.map((chave, i) => ({ chave, rotulo: rotulos[chave], estado: temProcesso ? 'CONCLUIDA' : i < atual ? 'CONCLUIDA' : i === atual ? 'ATUAL' : 'FUTURA' }));
}

export function rotuloTipoProcesso(tipo: string): string {
  switch (tipo) {
    case 'CONTRATACAO':
      return 'Licitação';
    case 'ADITIVO':
      return 'Aditivo';
    case 'RENOVACAO':
      return 'Renovação';
    case 'AVULSO':
      return 'Avulso';
    case 'PAGAMENTO':
      return 'Pagamento';
    case 'DEMANDA':
      return 'Pedido';
    default:
      return tipo;
  }
}

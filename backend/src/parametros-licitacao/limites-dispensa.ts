/**
 * LIMITES DA DISPENSA EM RAZÃO DO VALOR (art. 75, I e II da Lei 14.133/2021),
 * POR EXERCÍCIO — corrigidos todo ano por decreto (art. 182, IPCA).
 *
 * Tabela OFICIAL (conferida nos decretos):
 *  - 2021: valores originais da Lei 14.133/2021
 *  - 2022: Decreto 10.922/2021
 *  - 2023: Decreto 11.317/2022
 *  - 2024: Decreto 11.871/2023
 *  - 2025: Decreto 12.343/2024
 *  - 2026: Decreto 12.807/2025
 * O exercício seguinte é cadastrado pelo administrador da plataforma
 * (POST /parametros-licitacao/limites-dispensa) e fica em `limites_legais`
 * (coluna `exercicio`), que é a fonte usada em produção; esta tabela é a
 * semente e o fallback.
 *
 * Funções PURAS (testáveis) — o serviço lê o banco e chama estas funções.
 */
import type { IncisoLimiteDispensa } from '../licitacoes/fundamento-legal';

export type { IncisoLimiteDispensa };

export interface LimiteDispensaExercicio {
  exercicio: number;
  inciso: IncisoLimiteDispensa;
  valor: number;
  ato_normativo: string;
}

/** Chave em `limites_legais` de cada inciso (compatível com o que já existia). */
export const CHAVE_LIMITE_DO_INCISO: Record<IncisoLimiteDispensa, string> = {
  I: 'DISPENSA_OBRAS_ENGENHARIA',
  II: 'DISPENSA_COMPRAS_SERVICOS',
};

export const INCISO_DA_CHAVE: Record<string, IncisoLimiteDispensa> = {
  DISPENSA_OBRAS_ENGENHARIA: 'I',
  DISPENSA_COMPRAS_SERVICOS: 'II',
};

export const DESCRICAO_INCISO: Record<IncisoLimiteDispensa, string> = {
  I: 'Dispensa por valor — obras, serviços de engenharia e manutenção de veículos (art. 75, I)',
  II: 'Dispensa por valor — outros serviços e compras (art. 75, II)',
};

const L = (exercicio: number, i: number, ii: number, ato: string): LimiteDispensaExercicio[] => [
  { exercicio, inciso: 'I', valor: i, ato_normativo: ato },
  { exercicio, inciso: 'II', valor: ii, ato_normativo: ato },
];

export const LIMITES_DISPENSA_OFICIAIS: readonly LimiteDispensaExercicio[] = [
  ...L(2021, 100_000.0, 50_000.0, 'Lei 14.133/2021 (valores originais)'),
  ...L(2022, 108_040.82, 54_020.41, 'Dec. 10.922/2021'),
  ...L(2023, 114_416.65, 57_208.33, 'Dec. 11.317/2022'),
  ...L(2024, 119_812.02, 59_906.02, 'Dec. 11.871/2023'),
  ...L(2025, 125_451.15, 62_725.59, 'Dec. 12.343/2024'),
  ...L(2026, 130_984.2, 65_492.11, 'Dec. 12.807/2025'),
];

export interface ResultadoLimite extends LimiteDispensaExercicio {
  /** Exercício pedido. Pode diferir de `exercicio` quando o do ano ainda não foi cadastrado. */
  exercicio_pedido: number;
  /** true = o decreto do exercício pedido ainda não está na tabela; vale o último publicado. */
  provisorio: boolean;
}

/**
 * Limite do inciso no exercício. Sem o decreto do ano na tabela, vale o do
 * último exercício anterior cadastrado (o valor só muda com o decreto novo) —
 * marcado `provisorio`. Antes do primeiro exercício da tabela → null.
 */
export function limiteDispensa(
  exercicio: number,
  inciso: IncisoLimiteDispensa,
  tabela: readonly LimiteDispensaExercicio[] = LIMITES_DISPENSA_OFICIAIS,
): ResultadoLimite | null {
  const doInciso = tabela.filter((l) => l.inciso === inciso && l.exercicio <= exercicio);
  if (!doInciso.length) return null;
  const melhor = doInciso.reduce((a, b) => (b.exercicio > a.exercicio ? b : a));
  return { ...melhor, exercicio_pedido: exercicio, provisorio: melhor.exercicio !== exercicio };
}

// ---------------------------------------------------------------------------
// CONSUMO DO LIMITE (art. 75, §1º) — base do Portão A (Entrega 4)
// ---------------------------------------------------------------------------

/**
 * RAMO para o somatório do art. 75, §1º: "objetos de mesma natureza"
 * (mesmo ramo de atividade) na mesma UNIDADE GESTORA. O ramo é a CLASSE do
 * código CATMAT (bens) ou CATSER (serviços) + a unidade gestora (unidade
 * compradora do processo). Item sem classe conhecida cai no ramo do próprio
 * código (conservador); sem código, no ramo "SEM_CODIGO" do tipo.
 */
export interface Ramo {
  /** "MATERIAL:7510", "SERVICO:0859", "MATERIAL:COD:446820", "SERVICO:SEM_CODIGO". */
  classe: string;
  /** Unidade gestora (código da unidade compradora); '' = a do órgão. */
  unidade_gestora: string;
}

export function ramoDoItem(item: {
  tipo_item?: string | null;
  codigo_catmat?: string | null;
  codigo_catser?: string | null;
  codigo_catalogo?: string | null;
  classe?: string | null;
}, unidadeGestora?: string | null): Ramo {
  const tipo = item.codigo_catser ? 'SERVICO' : item.codigo_catmat ? 'MATERIAL' : String(item.tipo_item || '').toUpperCase() === 'SERVICO' ? 'SERVICO' : 'MATERIAL';
  const classe = String(item.classe ?? '').trim();
  const codigo = String(item.codigo_catmat || item.codigo_catser || item.codigo_catalogo || '').trim();
  const sufixo = classe ? classe : codigo ? `COD:${codigo}` : 'SEM_CODIGO';
  return { classe: `${tipo}:${sufixo}`, unidade_gestora: String(unidadeGestora ?? '').trim() };
}

export const mesmoRamo = (a: Ramo, b: Ramo) => a.classe === b.classe && a.unidade_gestora === b.unidade_gestora;

/** Item de dispensa já contratada ou em andamento, para o somatório. */
export interface RegistroConsumo {
  licitacao_id: string;
  orgao_id: string;
  exercicio: number;
  inciso: IncisoLimiteDispensa;
  ramo: Ramo;
  valor: number;
}

export interface ConsumoDoLimite {
  total: number;
  processos: Array<{ licitacao_id: string; valor: number }>;
}

/**
 * Soma as dispensas por valor do ÓRGÃO no EXERCÍCIO, no RAMO (classe + unidade
 * gestora) e no inciso (I e II têm limites distintos). Função pura: quem chama
 * entrega os registros (o serviço lê do banco; o teste monta à mão).
 */
export function consumoDoLimite(
  registros: readonly RegistroConsumo[],
  orgaoId: string,
  exercicio: number,
  ramo: Ramo,
  inciso?: IncisoLimiteDispensa,
): ConsumoDoLimite {
  const porProcesso = new Map<string, number>();
  for (const r of registros) {
    if (r.orgao_id !== orgaoId || r.exercicio !== exercicio || !mesmoRamo(r.ramo, ramo)) continue;
    if (inciso && r.inciso !== inciso) continue;
    const v = Number(r.valor) || 0;
    porProcesso.set(r.licitacao_id, (porProcesso.get(r.licitacao_id) ?? 0) + v);
  }
  const processos = [...porProcesso.entries()].map(([licitacao_id, valor]) => ({ licitacao_id, valor: arred2(valor) }));
  return { total: arred2(processos.reduce((s, p) => s + p.valor, 0)), processos };
}

export const arred2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Percentual do limite consumido, TRUNCADO em 1 casa (ex.: 98,45% → 98.4):
 * nunca arredonda para cima — 99,96% não aparece como "100%". A decisão de
 * excesso usa os valores (total > limite), não o percentual.
 */
export function percentualDoLimite(total: number, limite: number): number {
  if (!limite || limite <= 0) return 0;
  return Math.floor(Math.round((total / limite) * 1e6) / 1000) / 10;
}

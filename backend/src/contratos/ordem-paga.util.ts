/**
 * Casa as ordens de serviço que ainda não têm medição com os PAGAMENTOS que
 * aparecem no portal da transparência.
 *
 * Existe para o caso em que a execução foi paga só com a OS, sem o fornecedor
 * medir: sem a medição, o saldo do contrato no sistema fica maior que o real.
 * O lançamento retroativo só é liberado quando há pagamento correspondente,
 * para o sistema nunca registrar execução que a contabilidade não pagou.
 */

export interface PagamentoPortal {
  numero_empenho: string;
  data: string;
  valor: number;
  /** Nº da OS citada no histórico do portal, quando houver. */
  os_citada?: string;
  bem_servico?: string;
}

export interface OrdemSemMedicao {
  id: string;
  numero: string;
  valor: number;
  /** Empenhos que o órgão anotou na OS. */
  numeros_empenhos?: string[] | null;
}

export type CriterioPagamento = 'OS_CITADA' | 'EMPENHO_DA_OS' | 'VALOR';

export interface EvidenciaPagamento {
  criterio: CriterioPagamento;
  numero_empenho: string;
  data: string;
  valor: number;
  bem_servico?: string;
}

/** "OS-0242/2026", "OS nº 242/2026", "os 242" → "242/2026" / "242". */
export function normalizarNumeroOs(valor?: string | null): string {
  const texto = String(valor ?? '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!texto) return '';
  const m = texto.match(/(\d{1,6})\s*(?:\/\s*(\d{2,4}))?/);
  if (!m) return '';
  const numero = String(Number(m[1])); // tira zeros à esquerda: 0242 → 242
  return m[2] ? `${numero}/${m[2]}` : numero;
}

/** Iguais quando o número bate; o ano só é comparado se os dois tiverem. */
function mesmoNumeroOs(a: string, b: string): boolean {
  if (!a || !b) return false;
  const [na, aa] = a.split('/');
  const [nb, ab] = b.split('/');
  if (na !== nb) return false;
  return !aa || !ab || aa.slice(-2) === ab.slice(-2);
}

const cent = (v: unknown) => Math.round((Number(v) || 0) * 100);

/** Nº de empenho vem como "385/2026", "385-2026" ou "385": mesma regra da OS. */
const normalizarEmpenho = normalizarNumeroOs;

/**
 * Para cada ordem, devolve o pagamento correspondente (ou null). Cada pagamento
 * é usado por uma ordem só, e os critérios são tentados em ordem de confiança:
 * OS citada no histórico → empenho anotado na OS → valor exato.
 */
export function casarPagamentosComOrdens(
  ordens: OrdemSemMedicao[],
  pagamentos: PagamentoPortal[],
): Map<string, EvidenciaPagamento | null> {
  const resultado = new Map<string, EvidenciaPagamento | null>();
  const usados = new Set<number>();
  const disponiveis = pagamentos
    .map((p, indice) => ({ p, indice }))
    .filter(({ p }) => Number(p.valor) > 0);

  const registrar = (
    ordem: OrdemSemMedicao,
    achado: { p: PagamentoPortal; indice: number } | undefined,
    criterio: CriterioPagamento,
  ): boolean => {
    if (!achado) return false;
    usados.add(achado.indice);
    resultado.set(ordem.id, {
      criterio,
      numero_empenho: achado.p.numero_empenho,
      data: achado.p.data,
      valor: Number(achado.p.valor) || 0,
      bem_servico: achado.p.bem_servico,
    });
    return true;
  };

  const livres = () => disponiveis.filter(({ indice }) => !usados.has(indice));

  // 1) OS citada no histórico do pagamento
  for (const ordem of ordens) {
    const numero = normalizarNumeroOs(ordem.numero);
    const achado = livres().find(({ p }) =>
      mesmoNumeroOs(normalizarNumeroOs(p.os_citada), numero),
    );
    if (registrar(ordem, achado, 'OS_CITADA')) continue;
    resultado.set(ordem.id, null);
  }

  // 2) empenho anotado na OS
  for (const ordem of ordens) {
    if (resultado.get(ordem.id)) continue;
    const empenhos = (ordem.numeros_empenhos || []).map(normalizarEmpenho).filter(Boolean);
    if (!empenhos.length) continue;
    const achado = livres().find(({ p }) =>
      empenhos.some((e) => mesmoNumeroOs(e, normalizarEmpenho(p.numero_empenho))),
    );
    registrar(ordem, achado, 'EMPENHO_DA_OS');
  }

  // 3) valor exato
  for (const ordem of ordens) {
    if (resultado.get(ordem.id)) continue;
    const valor = cent(ordem.valor);
    if (valor <= 0) continue;
    const achado = livres().find(({ p }) => cent(p.valor) === valor);
    registrar(ordem, achado, 'VALOR');
  }

  return resultado;
}

export const ROTULO_CRITERIO: Record<CriterioPagamento, string> = {
  OS_CITADA: 'a OS está citada no histórico do pagamento',
  EMPENHO_DA_OS: 'o empenho anotado na OS foi pago',
  VALOR: 'há um pagamento com o valor exato da OS',
};

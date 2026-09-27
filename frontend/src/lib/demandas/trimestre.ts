/**
 * Trimestre do PCA a partir do "Para quando" da demanda (data só-dia AAAA-MM-DD,
 * sem fuso). Sem data (ou data inválida) → null: o usuário escolhe o trimestre
 * — nunca "1º" por padrão.
 */
export function trimestreDaData(data: string | null | undefined): 1 | 2 | 3 | 4 | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(data ?? '').trim())
  if (!m) return null
  const mes = Number(m[2])
  if (mes < 1 || mes > 12) return null
  return Math.ceil(mes / 3) as 1 | 2 | 3 | 4
}

/** Valor inicial do campo "trimestre" do item: o da data da demanda, senão vazio (obriga a escolher). */
export function trimestreInicialDoItem(dataDaDemanda: string | null | undefined): string {
  const t = trimestreDaData(dataDaDemanda)
  return t ? String(t) : ''
}

export interface PedidoSimulatorItem {
  id: string
  unidade_medida: string
  valor_unitario: number | string
  saldo_disponivel: number | string
}

export interface PedidoSimulatorSelecao {
  checked: boolean
  qty: number
}

const UNIDADES_METRO = ['METRO', 'M', 'ML', 'M²', 'M2', 'M³', 'M3']

export function isPedidoItemFracionavel(unidade: string) {
  return UNIDADES_METRO.includes((unidade ?? '').toUpperCase().trim())
}

function mdc(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y !== 0) {
    const resto = x % y
    x = y
    y = resto
  }
  return x || 1
}

export function gerarSugestaoPedido(
  items: PedidoSimulatorItem[],
  limite: number,
): Record<string, PedidoSimulatorSelecao> {
  const sorted = [...items].sort(
    (a, b) => Number(b.saldo_disponivel) - Number(a.saldo_disponivel),
  )
  let remaining = limite
  const result: Record<string, PedidoSimulatorSelecao> = {}

  for (const item of sorted) {
    const max = Number(item.saldo_disponivel)
    const preco = Number(item.valor_unitario)
    if (preco <= 0 || remaining < preco) {
      result[item.id] = { checked: false, qty: 0 }
      continue
    }

    const qty = isPedidoItemFracionavel(item.unidade_medida)
      ? Math.min(Math.round((remaining / preco) * 100) / 100, max)
      : Math.min(Math.floor(remaining / preco), max)

    result[item.id] = { checked: qty > 0, qty }
    remaining -= qty * preco
  }

  return result
}

export function gerarSugestaoPedidoExata(
  items: PedidoSimulatorItem[],
  valorAlvo: number,
): Record<string, PedidoSimulatorSelecao> | null {
  const alvoCentavos = Math.round(valorAlvo * 100)
  if (alvoCentavos <= 0) return {}

  const candidatos = items
    .map(item => ({
      id: item.id,
      fracionavel: isPedidoItemFracionavel(item.unidade_medida),
      saldoDisponivel: Math.max(0, Number(item.saldo_disponivel)),
      valorUnitarioCentavos: Math.round(Number(item.valor_unitario) * 100),
    }))
    .map(item => {
      if (item.fracionavel) {
        const passoQuantidadeCent = 100 / mdc(item.valorUnitarioCentavos, 100)
        const qtyStep = passoQuantidadeCent / 100
        const maxQty = Math.floor((item.saldoDisponivel + 0.000001) / qtyStep)
        const valorCentavos = (item.valorUnitarioCentavos * passoQuantidadeCent) / 100
        return {
          id: item.id,
          qtyStep,
          maxQty,
          valorCentavos,
        }
      }

      return {
        id: item.id,
        qtyStep: 1,
        maxQty: Math.max(0, Math.floor(item.saldoDisponivel)),
        valorCentavos: item.valorUnitarioCentavos,
      }
    })
    .filter(item => item.maxQty > 0 && item.valorCentavos > 0 && item.valorCentavos <= alvoCentavos)

  const chunks: Array<{ id: string; qty: number; valorCentavos: number }> = []
  for (const item of candidatos) {
    let bloco = 1
    let restante = item.maxQty
    while (restante > 0) {
      const multiplicador = Math.min(bloco, restante)
      chunks.push({
        id: item.id,
        qty: item.qtyStep * multiplicador,
        valorCentavos: item.valorCentavos * multiplicador,
      })
      restante -= multiplicador
      bloco *= 2
    }
  }

  const alcancavel = new Uint8Array(alvoCentavos + 1)
  const chunkPai = new Int32Array(alvoCentavos + 1)
  const somaAnterior = new Int32Array(alvoCentavos + 1)
  chunkPai.fill(-1)
  somaAnterior.fill(-1)
  alcancavel[0] = 1

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const chunk = chunks[chunkIndex]
    for (let soma = alvoCentavos; soma >= chunk.valorCentavos; soma -= 1) {
      if (alcancavel[soma] || !alcancavel[soma - chunk.valorCentavos]) continue
      alcancavel[soma] = 1
      chunkPai[soma] = chunkIndex
      somaAnterior[soma] = soma - chunk.valorCentavos
    }
  }

  if (!alcancavel[alvoCentavos]) return null

  const quantidades = new Map<string, number>()
  let somaAtual = alvoCentavos
  while (somaAtual > 0) {
    const indexChunk = chunkPai[somaAtual]
    if (indexChunk < 0) break
    const chunk = chunks[indexChunk]
    quantidades.set(chunk.id, (quantidades.get(chunk.id) ?? 0) + chunk.qty)
    somaAtual = somaAnterior[somaAtual]
  }

  const resultado: Record<string, PedidoSimulatorSelecao> = {}
  for (const item of items) {
    const qtyBruta = quantidades.get(item.id) ?? 0
    const qty = isPedidoItemFracionavel(item.unidade_medida)
      ? Math.round(qtyBruta * 100) / 100
      : Math.floor(qtyBruta)
    resultado[item.id] = { checked: qty > 0, qty }
  }

  return resultado
}

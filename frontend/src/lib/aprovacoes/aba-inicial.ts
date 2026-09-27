/**
 * Central de Aprovações: em que aba abrir. `?tab=` válido manda; senão, a
 * primeira aba (na ordem da tela) que tem pendência para o usuário; sem
 * pendência, a primeira aba que ele vê. Antes abria sempre em "Contratos" —
 * até para quem nem vê essa aba.
 */
export interface AbaDaCentral {
  valor: string
  visivel: boolean
  pendentes: number
}

export function abaInicialDaCentral(abas: AbaDaCentral[], pedida?: string | null): string {
  const visiveis = abas.filter(a => a.visivel)
  if (pedida && visiveis.some(a => a.valor === pedida)) return pedida
  return visiveis.find(a => a.pendentes > 0)?.valor ?? visiveis[0]?.valor ?? ''
}

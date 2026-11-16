/**
 * Os 4 passos da tela da pesquisa de preços (mockup aprovado em 13/10/2026):
 * Fontes consultadas → Cotações diretas → Valor de referência → Mapa e
 * certidão. Regra pura, sem React. Rodar: npm run test:unit
 */

export type TomPasso = "ok" | "atual" | "falta" | "neutro"

export interface PassoPesquisa {
  n: number
  nome: string
  situacao: string
  tom: TomPasso
}

/** O que os passos precisam da resposta de GET /pesquisa. */
export interface DadosDosPassos {
  parametros: Array<{ situacao_tela: "ATENDIDO" | "SEM_RETORNO" | "PENDENTE" }>
  propostas: Array<{ valida: boolean; alertas: Array<{ codigo: string }> }>
  resumo: { metodo: string | null; total_adotado: number | null; tres_precos: { atende: boolean } }
  justificativa_metodo: string
  pendencias: { bloqueios: string[] }
  certidao: { gerada_em: string } | null
  mapa: { tem_arquivo: boolean } | null
}

const ROTULO_METODO: Record<string, string> = { MENOR: "Menor preço", MEDIANA: "Mediana", MEDIA: "Média" }
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

/** "Emitir depois do passo 1" / "…dos passos 1 e 3" / "…dos passos anteriores". */
function depoisDos(ns: number[]): string {
  if (!ns.length) return "Emitir depois dos passos anteriores"
  if (ns.length === 1) return `Emitir depois do passo ${ns[0]}`
  return `Emitir depois dos passos ${ns.slice(0, -1).join(", ")} e ${ns[ns.length - 1]}`
}

export function passosDaPesquisa(d: DadosDosPassos): PassoPesquisa[] {
  const total = d.parametros.length
  const registradas = d.parametros.filter((p) => p.situacao_tela !== "PENDENTE").length
  const pendentes = d.parametros.filter((p) => p.situacao_tela === "PENDENTE").length
  const fontesOk = total > 0 && pendentes === 0

  const recebidas = d.propostas.length
  const validas = d.propostas.filter((p) => p.valida).length
  const vencemAntes = d.propostas.filter((p) => p.alertas.some((a) => a.codigo === "VENCE_ANTES_DA_PUBLICACAO")).length
  const cotacoesOk = recebidas > 0 && validas === recebidas

  const valorOk = !!d.resumo.metodo && d.justificativa_metodo.trim().length >= 10 && d.resumo.tres_precos.atende && d.resumo.total_adotado != null
  const emitido = !!d.certidao && !!d.mapa?.tem_arquivo

  return [
    {
      n: 1,
      nome: "Fontes consultadas",
      situacao: total === 0 ? "Sem fontes" : fontesOk ? `${registradas} de ${total} registradas` : `${registradas} de ${total} registradas · ${pendentes === 1 ? "falta 1" : `faltam ${pendentes}`}`,
      tom: fontesOk ? "ok" : registradas > 0 ? "falta" : "atual",
    },
    {
      n: 2,
      nome: "Cotações diretas",
      situacao:
        recebidas === 0
          ? "Nenhuma recebida"
          : `${recebidas} ${recebidas === 1 ? "recebida" : "recebidas"}${validas < recebidas ? ` · ${recebidas - validas} ${recebidas - validas === 1 ? "inválida" : "inválidas"}` : vencemAntes ? ` · ${vencemAntes} vence antes da publicação` : " · válidas"}`,
      tom: cotacoesOk ? (vencemAntes ? "falta" : "ok") : recebidas > 0 ? "falta" : "neutro",
    },
    {
      n: 3,
      nome: "Valor de referência",
      situacao: !d.resumo.metodo
        ? "Escolha o método"
        : d.resumo.total_adotado == null
          ? `${ROTULO_METODO[d.resumo.metodo] ?? d.resumo.metodo} · sem preços`
          : `${ROTULO_METODO[d.resumo.metodo] ?? d.resumo.metodo} · ${BRL.format(d.resumo.total_adotado)}${valorOk ? " · justificado" : d.justificativa_metodo.trim().length < 10 ? " · falta justificar" : " · menos de 3 preços"}`,
      tom: valorOk ? "ok" : d.resumo.metodo ? "falta" : "atual",
    },
    {
      n: 4,
      nome: "Mapa e certidão",
      situacao: emitido ? `Emitidos em ${new Date(d.certidao!.gerada_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : d.pendencias.bloqueios.length ? depoisDos([!fontesOk ? 1 : null, !cotacoesOk && recebidas > 0 ? 2 : null, !valorOk ? 3 : null].filter((x): x is number => x !== null)) : "Pronto para emitir",
      tom: emitido ? "ok" : d.pendencias.bloqueios.length ? "neutro" : "atual",
    },
  ]
}

/**
 * "Concluir etapa" na tela do documento (mockup "Tela do ETP no fluxo",
 * 12/10/2026) — regras puras, sem React. Rodar: npm run test:unit
 */
import type { Andamento, NoAndamento } from "./andamento"

/** Tela da fase interna de cada tipo de etapa — o mesmo mapa de ponte.ts (sem import: o teste roda no node puro). */
const ROTA: Record<string, string> = {
  DEMANDA: "dfd",
  DFD: "dfd",
  PESQUISA_PRECO: "pesquisa",
  ETP: "etp",
  MAPA_RISCOS: "etp",
  TR: "tr",
  RESERVA_ORCAMENTARIA: "reserva",
  PARECER_JURIDICO: "parecer",
  CONTROLE_INTERNO: "controle-interno",
  AUTORIZACAO: "autorizacao",
}

const telaDoTipoDeEtapa = (tipo: string | null | undefined): string | null => ROTA[String(tipo ?? "").toUpperCase()] ?? null

/** A etapa em andamento do fluxo é a desta tela e quem vê pode concluí-la? */
export function etapaDestaTela(andamento: Andamento | null | undefined, telaAtual: string): NoAndamento | null {
  if (!andamento || andamento.modo !== "FLUXO" || andamento.encerrado || !andamento.pode_agir) return null
  const atual = andamento.atual
  if (!atual?.tarefa_id || !andamento.instancia_id) return null
  return telaDoTipoDeEtapa(atual.tipo) === telaAtual ? atual : null
}

/** A etapa seguinte à atual no desenho (nula na última). */
export function proximaEtapa(andamento: Andamento, atual: NoAndamento): NoAndamento | null {
  const i = andamento.nos.findIndex((n) => n.chave === atual.chave)
  return i >= 0 ? andamento.nos[i + 1] ?? null : null
}

/** Para onde ir depois de concluir: a tela da próxima etapa (mesmo responsável) ou o processo. */
export function destinoAposConcluir(andamento: Andamento, atual: NoAndamento, licitacaoId: string, processoId: string): string {
  const proxima = proximaEtapa(andamento, atual)
  const tela = proxima ? telaDoTipoDeEtapa(proxima.tipo) : null
  if (proxima && tela && proxima.responsavel && proxima.responsavel === atual.responsavel) return `/orgao/processos/${licitacaoId}/fase-interna/${tela}`
  return `/orgao/processo/${processoId}`
}

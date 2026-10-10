/**
 * Ponte fluxo novo ↔ fase interna (espelho de backend/src/workflow/ponte):
 * na contratação, cada etapa abre a tela da fase interna que já existe.
 */

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

const ROTULO: Record<string, string> = {
  DEMANDA: "a demanda e o DFD",
  DFD: "o DFD",
  PESQUISA_PRECO: "a pesquisa de preço",
  ETP: "o ETP",
  MAPA_RISCOS: "a análise de riscos",
  TR: "o termo de referência",
  RESERVA_ORCAMENTARIA: "a reserva orçamentária",
  PARECER_JURIDICO: "o parecer jurídico",
  CONTROLE_INTERNO: "o controle interno",
  AUTORIZACAO: "a autorização",
  PUBLICACAO: "a publicação",
}

/** Link e rótulo da tela da fase interna para a etapa (nulo = etapa feita aqui mesmo, ex.: Aprovação). */
export function telaDaFaseInterna(tipoEtapa: string | null | undefined, licitacaoId: string): { href: string; rotulo: string } | null {
  const tipo = String(tipoEtapa ?? "").toUpperCase()
  if (tipo === "PUBLICACAO") return { href: `/orgao/processos/${licitacaoId}?detalhes=1#publicacao-edital`, rotulo: `Abrir ${ROTULO.PUBLICACAO} na tela da licitação` }
  const rota = ROTA[tipo]
  return rota ? { href: `/orgao/processos/${licitacaoId}/fase-interna/${rota}`, rotulo: `Abrir ${ROTULO[tipo]} na fase interna` } : null
}

/** Tela da fase interna (segmento da rota: "dfd", "pesquisa"…) de um tipo de etapa; nulo = sem tela própria. */
export function telaDoTipoDeEtapa(tipoEtapa: string | null | undefined): string | null {
  return ROTA[String(tipoEtapa ?? "").toUpperCase()] ?? null
}

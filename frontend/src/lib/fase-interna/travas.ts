/**
 * "TRAVAS DA LEI" (plano PLANO-FLUXO-TRAMITACAO.md, §3) — o nome que a tela
 * usa para o que o código chama de "portões" (A, B e C). Cada trava segura um
 * ato enquanto a lei não estiver cumprida. Só muda o TEXTO visível: códigos,
 * variáveis e rotas continuam "portao".
 *
 * Sem imports: é usado também pelo teste de unidade (node --test).
 */

export type LetraTrava = "A" | "B" | "C"

export interface Trava {
  /** O ato que ela segura, em poucas palavras. */
  ato: string
  /** Rótulo curto para a tela: "Trava da lei — concluir a pesquisa (…)". */
  rotulo: string
  /** O que ela exige (explicação curta do "?"). */
  exige: string
  base: string
}

export const TRAVAS_DA_LEI: Record<LetraTrava, Trava> = {
  A: {
    ato: "concluir a pesquisa",
    rotulo: "Trava da lei — concluir a pesquisa (limite da dispensa, art. 75, §1º)",
    exige: "a soma das dispensas do mesmo ramo no exercício não pode passar o limite (evita fracionamento)",
    base: "art. 75, §1º",
  },
  B: {
    ato: "autorizar",
    rotulo: "Trava da lei — autorizar (art. 72)",
    exige: "DFD e ETP/TR prontos, pesquisa de preços e reserva orçamentária",
    base: "art. 72, I, II e IV",
  },
  C: {
    ato: "publicar",
    rotulo: "Trava da lei — publicar",
    exige: "todas as peças citam o mesmo inciso e o número do processo; peças assinadas e datadas; marca só com \"ou similar\" ou justificativa",
    base: "arts. 72, 75 e 41, I",
  },
}

/** "do portão" → "da trava", "o portão" → "a trava"… (o nome muda de gênero). */
const ARTIGO: Record<string, string> = { do: "da", no: "na", pelo: "pela", ao: "à", o: "a" }

/**
 * Troca "Portão A/B/C (…)" das mensagens que vêm do servidor pelo rótulo da
 * trava. Ex.: "Portão A (limite e fracionamento) — LIM-01: …" →
 * "Trava da lei — concluir a pesquisa (limite da dispensa, art. 75, §1º) — LIM-01: …";
 * "Pendências do portão B (art. 72): …" → "Pendências da trava da lei — autorizar (art. 72): …".
 */
export function textoDaTrava(msg: string | null | undefined): string {
  if (!msg) return ""
  return String(msg).replace(
    /(?:\b(do|no|pelo|ao|o)\s+)?([pP])ort[ãa]o\s+([ABC])\b(\s*\([^)]*\))?/g,
    (_m, artigo: string | undefined, p: string, letra: string) => {
      const rotulo = TRAVAS_DA_LEI[letra as LetraTrava].rotulo
      const texto = p === "P" && !artigo ? rotulo : rotulo.charAt(0).toLowerCase() + rotulo.slice(1)
      return artigo ? `${ARTIGO[artigo] ?? artigo} ${texto}` : texto
    },
  )
}

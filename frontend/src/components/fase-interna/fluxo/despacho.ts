import { API_URL, authFetch } from "@/lib/api"
import { textoDaTrava } from "@/lib/fase-interna/travas"

/** Mensagem de erro do servidor (403/400/409 explicam o porquê) — nunca engolir. */
export async function mensagemDoErro(res: Response, padrao: string): Promise<string> {
  const j = await res.json().catch(() => null)
  const pend: string[] = Array.isArray(j?.pendencias) ? j.pendencias : []
  const msg = pend.length ? pend.join(" · ") : Array.isArray(j?.message) ? j.message.join(" ") : j?.message
  return textoDaTrava(msg || `${padrao} (HTTP ${res.status})`)
}

/**
 * Abre o PDF do despacho (folha dos autos) com a sessão do usuário. `url` é a
 * rota relativa que o servidor devolve (…/tramitacoes/:id/despacho).
 * Devolve a mensagem de erro, ou null.
 */
export async function abrirDespachoPdf(url: string): Promise<string | null> {
  const res = await authFetch(url.startsWith("http") ? url : `${API_URL}${url}`)
  if (!res.ok) return mensagemDoErro(res, "Despacho indisponível")
  const blob = URL.createObjectURL(await res.blob())
  const janela = window.open(blob, "_blank")
  if (!janela) {
    // Bloqueador de janelas: baixa o arquivo
    const a = document.createElement("a")
    a.href = blob
    a.download = "despacho.pdf"
    a.click()
  }
  setTimeout(() => URL.revokeObjectURL(blob), 60_000)
  return null
}

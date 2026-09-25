"use client"

/**
 * Peças comuns das telas das MODALIDADES ESPECIAIS (plano E7c — leilão,
 * concurso e diálogo competitivo): chamada autenticada com erro/pendências,
 * download autenticado, formatação e campos simples.
 */
import { useCallback, useEffect, useState } from "react"
import { API_URL, authFetch } from "@/lib/api"
import { erroDeExcecao, lerErro, type ErroBackend } from "@/lib/publicacao"

export const fmtMoeda = (v: number | string | null | undefined) =>
  v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

export const fmtDataHora = (v: string | Date | null | undefined) =>
  v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"

/** Carrega um painel (GET) e expõe recarregar + executor de atos com erro padronizado. */
export function usePainel<T>(url: string | null) {
  const [dados, setDados] = useState<T | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<ErroBackend | null>(null)
  const [executando, setExecutando] = useState<string | null>(null)

  const recarregar = useCallback(async () => {
    if (!url) return
    setCarregando(true)
    try {
      const r = await authFetch(url)
      if (!r.ok) {
        setErro(await lerErro(r, "Não foi possível carregar o painel"))
        setDados(null)
      } else {
        setErro(null)
        setDados(await r.json())
      }
    } catch (e) {
      setErro(erroDeExcecao(e))
    } finally {
      setCarregando(false)
    }
  }, [url])

  useEffect(() => {
    recarregar()
  }, [recarregar])

  /** Executa um ato (JSON ou FormData); devolve o corpo em caso de sucesso, null em caso de erro. */
  const executar = useCallback(
    async (chave: string, caminho: string, init: { method?: string; body?: any } = {}): Promise<any | null> => {
      setExecutando(chave)
      setErro(null)
      try {
        const corpo = init.body instanceof FormData ? init.body : init.body !== undefined ? JSON.stringify(init.body) : undefined
        const r = await authFetch(`${API_URL}${caminho}`, { method: init.method ?? "POST", body: corpo })
        if (!r.ok) {
          setErro(await lerErro(r))
          return null
        }
        const j = await r.json().catch(() => ({}))
        await recarregar()
        return j
      } catch (e) {
        setErro(erroDeExcecao(e))
        return null
      } finally {
        setExecutando(null)
      }
    },
    [recarregar],
  )

  return { dados, carregando, erro, setErro, executando, executar, recarregar }
}

/** Abre um arquivo protegido (token no header) numa nova aba. */
export async function abrirArquivo(caminho: string) {
  const r = await authFetch(`${API_URL}${caminho}`)
  if (!r.ok) {
    alertaSilencioso(`Arquivo indisponível (HTTP ${r.status})`)
    return
  }
  const blob = await r.blob()
  const url = URL.createObjectURL(blob)
  window.open(url, "_blank", "noopener,noreferrer")
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function alertaSilencioso(msg: string) {
  // sem alert(): registra no console; as telas mostram o botão desabilitado quando não há arquivo
  console.warn(msg)
}

export function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-slate-700">{rotulo}</span>
      {children}
      {dica && <span className="block text-[11px] text-slate-400">{dica}</span>}
    </label>
  )
}

export const classeInput = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"

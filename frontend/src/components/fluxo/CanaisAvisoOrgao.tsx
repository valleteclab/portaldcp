"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { apiFluxo } from "@/lib/fluxo/desenho"

interface CanaisAviso {
  whatsapp: boolean
  teams: Array<{ id: string; nome: string; webhook_mascarado: string }>
}

/**
 * CANAIS DE AVISO DO ÓRGÃO (mockup aprovado): o que já está conectado para os
 * avisos das etapas. Teams: canal criado pelo próprio órgão no app Workflows
 * do Teams ("Post to a channel when a webhook request is received"); a URL
 * fica cifrada no servidor e só volta mascarada. Cadastrar, testar e remover
 * é do administrador do órgão.
 */
export function CanaisAvisoOrgao() {
  const [canais, setCanais] = useState<CanaisAviso | null>(null)
  const [nome, setNome] = useState("")
  const [url, setUrl] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [aberto, setAberto] = useState(false)

  const carregar = useCallback(async () => {
    try {
      setCanais(await apiFluxo<CanaisAviso>("/canais-aviso"))
    } catch {
      setCanais({ whatsapp: false, teams: [] })
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function adicionar() {
    setEnviando(true)
    try {
      await apiFluxo("/teams-canais", { metodo: "POST", corpo: { nome: nome.trim(), webhook_url: url.trim() } })
      setNome("")
      setUrl("")
      setAberto(false)
      toast.success("Canal do Teams cadastrado. Use “Testar” para conferir.")
      await carregar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível cadastrar o canal.")
    } finally {
      setEnviando(false)
    }
  }

  async function testar(id: string) {
    try {
      const r = await apiFluxo<{ sucesso: boolean; mensagem: string }>(`/teams-canais/${id}/testar`, { metodo: "POST" })
      if (r.sucesso) toast.success(r.mensagem)
      else toast.error(r.mensagem)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível testar.")
    }
  }

  async function remover(id: string, nomeCanal: string) {
    if (!window.confirm(`Remover o canal do Teams “${nomeCanal}”? As etapas que avisam nele deixam de avisar pelo Teams.`)) return
    try {
      await apiFluxo(`/teams-canais/${id}`, { metodo: "DELETE" })
      await carregar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível remover.")
    }
  }

  const selo = (ok: boolean, texto: string) => (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ok ? "bg-[#E8F5EE] text-[#2E7A55]" : "bg-slate-100 text-slate-600"}`}>{texto}</span>
  )

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-[#E3E7EC] bg-white p-5" aria-labelledby="canais-aviso">
      <h2 id="canais-aviso" className="text-[15px] font-bold">
        Canais de aviso do órgão
      </h2>
      <div className="flex flex-col gap-2.5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span>WhatsApp</span>
          {canais ? selo(canais.whatsapp, canais.whatsapp ? "Conectado" : "Não configurado") : null}
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>E-mail</span>
          {selo(true, "Disponível")}
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>Microsoft Teams</span>
          {canais ? selo(canais.teams.length > 0, canais.teams.length ? `${canais.teams.length} ${canais.teams.length === 1 ? "canal" : "canais"}` : "Configurar") : null}
        </div>
        {(canais?.teams ?? []).map((t) => (
          <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#E3E7EC] px-3 py-2">
            <span>
              <b>{t.nome}</b> <span className="text-xs text-[#5A6675]">{t.webhook_mascarado}</span>
            </span>
            <span className="flex gap-2">
              <button type="button" onClick={() => testar(t.id)} className="text-sm font-semibold text-[#1B4A63] hover:underline">
                Testar
              </button>
              <button type="button" onClick={() => remover(t.id, t.nome)} className="text-sm text-red-700 hover:underline">
                Remover
              </button>
            </span>
          </div>
        ))}
      </div>
      {aberto ? (
        <div className="flex flex-col gap-2 border-t border-[#E3E7EC] pt-3">
          <p className="text-xs leading-relaxed text-[#5A6675]">
            No Teams, abra o canal → <b>Workflows</b> → “Postar em um canal quando uma solicitação de webhook for recebida” → copie a URL gerada e cole aqui.
          </p>
          <label htmlFor="teams-nome" className="text-[13px] font-semibold text-slate-700">
            Nome do canal
          </label>
          <input id="teams-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Jurídico" className="rounded-lg border border-[#CBD3DA] px-3 py-2 text-sm" />
          <label htmlFor="teams-url" className="text-[13px] font-semibold text-slate-700">
            URL do webhook
          </label>
          <input id="teams-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…logic.azure.com/… ou …powerplatform.com/…" className="rounded-lg border border-[#CBD3DA] px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button type="button" onClick={adicionar} disabled={enviando || nome.trim().length < 2 || !url.trim()} className="rounded-lg bg-[#1B4A63] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {enviando ? "Salvando…" : "Cadastrar canal"}
            </button>
            <button type="button" onClick={() => setAberto(false)} className="rounded-lg border border-[#CBD3DA] px-4 py-2 text-sm">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAberto(true)} className="w-fit text-sm font-semibold text-[#1B4A63] hover:underline">
          + Cadastrar canal do Teams
        </button>
      )}
    </section>
  )
}

"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { API_URL, authFetch } from "@/lib/api"
import { fmtBrasilia } from "@/lib/publicacao"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { MensagemDispensa, RegrasChat } from "./tipos"

/**
 * Mensagens da dispensa e as REGRAS da fase (IN SEGES 67/2021, arts. 10, 13 e
 * 16 — decididas no backend: GET .../dispensa/mensagens/regras). `atualizarA`
 * (ms) liga a atualização automática (etapa de lances).
 */
export function useMensagensDispensa(licitacaoId: string, ativo: boolean, atualizarA?: number, atualizacao?: unknown) {
  const [mensagens, setMensagens] = useState<MensagemDispensa[]>([])
  const [regras, setRegras] = useState<RegrasChat | null>(null)
  const recarregar = useCallback(async () => {
    try {
      const [res, rr] = await Promise.all([
        authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/dispensa/mensagens`),
        authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/dispensa/mensagens/regras`),
      ])
      if (res.ok) setMensagens(await res.json())
      if (rr.ok) setRegras(await rr.json())
    } catch { /* mantém */ }
  }, [licitacaoId])
  useEffect(() => {
    if (!ativo) return
    recarregar()
    if (!atualizarA) return
    const t = setInterval(recarregar, atualizarA)
    return () => clearInterval(t)
  }, [ativo, atualizarA, recarregar, atualizacao])
  return { mensagens, regras, recarregar }
}

/**
 * MENSAGENS / AVISOS DA DISPENSA (IN SEGES 67/2021, art. 10): na dispensa não
 * há impugnação nem esclarecimento formal (art. 164 é do edital de
 * licitação). No prazo: avisos oficiais do órgão (assunto + texto); depois do
 * julgamento: negociação PRIVADA só com o vencedor (art. 16). Tudo registrado.
 */
export function MensagensDispensa({
  licitacaoId,
  mensagens,
  regras,
  onEnviado,
}: {
  licitacaoId: string
  mensagens: MensagemDispensa[]
  regras: RegrasChat | null
  onEnviado: () => void
}) {
  const [texto, setTexto] = useState("")
  const [assunto, setAssunto] = useState("")
  const [destino, setDestino] = useState("")
  const [enviando, setEnviando] = useState(false)

  const enviar = async () => {
    const t = texto.trim()
    if (!t) return
    setEnviando(true)
    try {
      let autor = "Órgão"
      try {
        const u = JSON.parse(localStorage.getItem("usuario") || "{}")
        const o = JSON.parse(localStorage.getItem("orgao") || "{}")
        autor = u?.nome || o?.nome || "Órgão"
      } catch { /* padrão */ }
      const res = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/dispensa/mensagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Autoria (órgão) vem do token; autor_nome é só o rótulo exibido
        body: JSON.stringify({
          autor_nome: autor,
          mensagem: t,
          ...(regras?.exige_assunto ? { assunto } : {}),
          ...(regras?.modo === "NEGOCIACAO" && destino ? { fornecedor_destino_id: destino } : {}),
        }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`)
      setTexto("")
      setAssunto("")
      onEnviado()
    } catch (e: any) {
      toast.error(`Mensagem não enviada: ${e.message}`)
    } finally {
      setEnviando(false)
    }
  }

  const podeEnviar = !regras || regras.orgao_pode_enviar !== false

  return (
    <div id="mensagens-dispensa" className="border rounded-md bg-white">
      <div className="px-3 py-2 border-b">
        <p className="text-sm font-medium">{regras?.rotulo || "Mensagens do processo"}</p>
        {regras?.explicacao && <p className="text-xs text-gray-700">{regras.explicacao}</p>}
      </div>
      <ul className="p-3 max-h-56 overflow-y-auto space-y-1.5" aria-live="polite">
        {mensagens.length === 0 && <li className="text-xs text-gray-600">Nenhuma mensagem.</li>}
        {mensagens.map((m) => (
          <li key={m.id} className="text-xs">
            <span className={`font-medium ${m.autor_tipo === "ORGAO" ? "text-blue-800" : "text-gray-800"}`}>{m.autor_nome}</span>
            <span className="text-gray-600"> {m.created_at ? fmtBrasilia(m.created_at) : ""}: </span>
            {m.assunto && <span className="font-medium">{m.assunto} — </span>}
            <span>{m.mensagem}</span>
          </li>
        ))}
      </ul>
      {podeEnviar ? (
        <div className="flex items-center gap-2 p-2 border-t flex-wrap">
          {regras?.exige_assunto && (
            <Input aria-label="Assunto do aviso" placeholder="Assunto do aviso" value={assunto} onChange={(e) => setAssunto(e.target.value)} className="h-9 text-sm sm:w-48" maxLength={120} />
          )}
          {regras?.modo === "NEGOCIACAO" && (regras.interlocutores?.length ?? 0) > 1 && (
            <select aria-label="Negociar com" className="h-9 border rounded text-sm px-1 bg-white" value={destino} onChange={(e) => setDestino(e.target.value)}>
              <option value="">Negociar com…</option>
              {regras.interlocutores!.map((v) => (
                <option key={v.fornecedor_id} value={v.fornecedor_id}>{v.razao_social}</option>
              ))}
            </select>
          )}
          <Input
            aria-label={regras?.exige_assunto ? "Texto do aviso" : "Mensagem"}
            placeholder={regras?.exige_assunto ? "Texto do aviso (mínimo 20 caracteres)…" : "Mensagem (fica registrada)…"}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") enviar() }}
            className="h-9 text-sm flex-1 min-w-[180px]"
            maxLength={1000}
          />
          <Button size="sm" className="h-9" onClick={enviar} disabled={!texto.trim() || enviando}>
            {regras?.exige_assunto ? "Publicar aviso" : "Enviar"}
          </Button>
        </div>
      ) : (
        <p className="p-2 border-t text-xs text-gray-700">{regras?.explicacao || "Mensagens indisponíveis nesta fase."}</p>
      )}
    </div>
  )
}

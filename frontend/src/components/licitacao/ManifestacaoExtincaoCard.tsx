"use client"

/**
 * FORNECEDOR — manifestação sobre a intenção de revogar/anular (E7, art. 71 §3º).
 * Enquanto o prazo está aberto, o licitante registra (e pode editar) sua
 * manifestação. Fonte: GET /publicacao/licitacao/:id/extincao (visão do licitante:
 * intenções + a própria manifestação).
 */

import { useCallback, useEffect, useState } from "react"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Ban, Loader2 } from "lucide-react"
import { fmtBrasilia, lerErro, type ErroBackend, type IntencaoExtincao } from "@/lib/publicacao"
import { ErroPendencias } from "@/components/licitacao/ErroPendencias"

const MIN = 10

export function ManifestacaoExtincaoCard({ licitacaoId }: { licitacaoId: string }) {
  const [intencao, setIntencao] = useState<IntencaoExtincao | null>(null)
  const [texto, setTexto] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<ErroBackend | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/publicacao/licitacao/${licitacaoId}/extincao`)
      if (!res.ok) return
      const lista: IntencaoExtincao[] = await res.json()
      const aberta = (Array.isArray(lista) ? lista : []).find((i) => i.status === "ABERTA") || null
      setIntencao(aberta)
      const minha = aberta?.manifestacoes?.[0]
      if (minha) setTexto(minha.texto)
    } catch { /* sem card */ }
  }, [licitacaoId])

  useEffect(() => { carregar() }, [carregar])

  if (!intencao) return null
  const ato = intencao.tipo === "ANULAR" ? "anular" : "revogar"
  const minha = intencao.manifestacoes?.[0]

  const enviar = async () => {
    if (texto.trim().length < MIN) {
      setErro({ mensagem: `Manifestação: mínimo ${MIN} caracteres.`, pendencias: [] })
      return
    }
    setEnviando(true)
    setErro(null)
    setOk(null)
    try {
      const res = await authFetch(`${API_URL}/api/publicacao/licitacao/${licitacaoId}/extincao/manifestacao`, {
        method: "POST",
        body: JSON.stringify({ texto: texto.trim() }),
      })
      if (!res.ok) {
        setErro(await lerErro(res, "Não foi possível registrar a manifestação"))
        return
      }
      setOk("Manifestação registrada. Você pode alterá-la até o fim do prazo.")
      await carregar()
    } catch (e: any) {
      setErro({ mensagem: e.message || "Falha de comunicação com o servidor", pendencias: [] })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="border-2 border-red-200 bg-red-50/60 rounded-lg p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Ban className="w-6 h-6 text-red-600 shrink-0" />
        <div className="space-y-1 min-w-0">
          <p className="font-semibold text-red-900">O órgão pretende {ato} esta licitação</p>
          <p className="text-sm text-red-900"><span className="font-medium">Motivo:</span> {intencao.motivo}</p>
          <p className="text-xs text-red-800">
            {intencao.prazo_aberto
              ? <>Você pode se manifestar até <b>{fmtBrasilia(intencao.prazo_fim)}</b> (horário de Brasília) — art. 71, §3º da Lei 14.133/2021.</>
              : <>O prazo de manifestação terminou em {fmtBrasilia(intencao.prazo_fim)}.</>}
          </p>
        </div>
      </div>
      {intencao.prazo_aberto ? (
        <div className="space-y-2">
          <Textarea
            rows={4}
            className="bg-white"
            placeholder="Suas razões (ficam registradas no processo e são consideradas pela autoridade antes do ato)"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={5000}
          />
          <ErroPendencias erro={erro} />
          {ok && <p className="text-sm text-green-700">{ok}</p>}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs text-gray-500">
              {minha ? `Manifestação enviada em ${fmtBrasilia(minha.updated_at || minha.created_at)} — pode ser editada até o prazo.` : "Nenhuma manifestação enviada ainda."}
            </span>
            <Button size="sm" onClick={enviar} disabled={enviando}>
              {enviando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {minha ? "Atualizar manifestação" : "Enviar manifestação"}
            </Button>
          </div>
        </div>
      ) : (
        minha && (
          <div className="text-sm bg-white border rounded p-2">
            <p className="text-xs text-gray-500 mb-1">Sua manifestação ({fmtBrasilia(minha.updated_at || minha.created_at)}):</p>
            <p className="whitespace-pre-line">{minha.texto}</p>
          </div>
        )
      )}
    </div>
  )
}

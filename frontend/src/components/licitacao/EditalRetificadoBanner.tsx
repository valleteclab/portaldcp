"use client"

/**
 * FORNECEDOR — edital retificado (E7, art. 55 §1º).
 * Se a retificação afetou a formulação das propostas, a proposta já enviada
 * fica aguardando confirmação do licitante até o novo fim do recebimento;
 * sem confirmação, sai da disputa. Fonte: GET /publicacao/licitacao/:id/minha-proposta
 */

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { AlertTriangle, CheckCircle2, Download, Info, Loader2 } from "lucide-react"
import { abrirArquivoEdital, fmtBrasilia, lerErro, type ErroBackend } from "@/lib/publicacao"
import { ErroPendencias } from "@/components/licitacao/ErroPendencias"

interface MinhaSituacao {
  proposta_id: string | null
  status_proposta: string | null
  requer_confirmacao: boolean
  confirmada_em: string | null
  prazo_confirmacao: string | null
  ultima_retificacao: {
    id: string
    numero: number
    motivo: string
    alteracoes: string
    afeta_propostas: boolean
    data_divulgacao: string
    documento_id: string | null
  } | null
}

export function EditalRetificadoBanner({ licitacaoId, onConfirmada }: { licitacaoId: string; onConfirmada?: () => void }) {
  const [sit, setSit] = useState<MinhaSituacao | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState<ErroBackend | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/publicacao/licitacao/${licitacaoId}/minha-proposta`)
      if (res.ok) setSit(await res.json())
    } catch { /* sem banner */ }
  }, [licitacaoId])

  useEffect(() => { carregar() }, [carregar])

  const baixar = async (documentoId: string) => {
    setErro(null)
    try {
      await abrirArquivoEdital(licitacaoId, documentoId)
    } catch (e: any) {
      setErro({ mensagem: e.message || "Não foi possível abrir o edital", pendencias: [] })
    }
  }

  const confirmar = async () => {
    setConfirmando(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/publicacao/licitacao/${licitacaoId}/confirmar-proposta`, { method: "POST" })
      if (!res.ok) {
        setErro(await lerErro(res, "Não foi possível confirmar a proposta"))
        return
      }
      setOk("Proposta confirmada. Ela segue válida para a disputa com o edital retificado.")
      await carregar()
      onConfirmada?.()
    } catch (e: any) {
      setErro({ mensagem: e.message || "Falha de comunicação com o servidor", pendencias: [] })
    } finally {
      setConfirmando(false)
    }
  }

  const r = sit?.ultima_retificacao
  if (!sit || !r) return null

  if (sit.requer_confirmacao) {
    return (
      <div className="border-2 border-amber-400 bg-amber-50 rounded-lg p-4 space-y-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
          <div className="space-y-1 min-w-0">
            <p className="font-semibold text-amber-900">Edital retificado — confirme sua proposta</p>
            <p className="text-sm text-amber-900">
              A {r.numero}ª retificação (divulgada em {fmtBrasilia(r.data_divulgacao)}) afeta a formulação das
              propostas. Revise o edital e <b>confirme</b> sua proposta (ou ajuste-a)
              {sit.prazo_confirmacao ? <> até <b>{fmtBrasilia(sit.prazo_confirmacao)}</b> (horário de Brasília)</> : null}.
              Sem confirmação no prazo, a proposta sai da disputa.
            </p>
          </div>
        </div>
        <div className="text-sm bg-white/70 border border-amber-200 rounded p-3 space-y-1">
          <p><span className="font-medium">Motivo:</span> {r.motivo}</p>
          <p className="whitespace-pre-line"><span className="font-medium">O que mudou:</span> {r.alteracoes}</p>
        </div>
        <ErroPendencias erro={erro} />
        <div className="flex flex-wrap gap-2">
          {r.documento_id && (
            <Button variant="outline" size="sm" onClick={() => baixar(r.documento_id!)}>
              <Download className="w-4 h-4 mr-1" /> Baixar edital retificado
            </Button>
          )}
          {sit.proposta_id && (
            <Link href={`/fornecedor/propostas/${sit.proposta_id}`}>
              <Button variant="outline" size="sm">Revisar / editar proposta</Button>
            </Link>
          )}
          <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={confirmar} disabled={confirmando}>
            {confirmando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
            Confirmar proposta
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="border border-blue-200 bg-blue-50/60 rounded-lg p-3 flex items-start gap-2 text-sm text-blue-900">
      <Info className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="space-y-1 min-w-0">
        <p>
          Edital retificado ({r.numero}ª retificação, em {fmtBrasilia(r.data_divulgacao)}) — {r.motivo}
          {!r.afeta_propostas && <span className="text-blue-700"> · não afeta a formulação das propostas</span>}
        </p>
        {ok && <p className="text-green-700">{ok}</p>}
        {sit.confirmada_em && !ok && (
          <p className="text-green-700">Sua proposta foi confirmada em {fmtBrasilia(sit.confirmada_em)}.</p>
        )}
        {r.documento_id && (
          <button type="button" className="underline" onClick={() => baixar(r.documento_id!)}>
            Baixar edital retificado
          </button>
        )}
        <ErroPendencias erro={erro} />
      </div>
    </div>
  )
}

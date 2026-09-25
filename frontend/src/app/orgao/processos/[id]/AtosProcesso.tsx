"use client"

import { useState } from "react"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import { Loader2, ListChecks } from "lucide-react"

/** Ato disponível devolvido pelo backend (processo-completo.atos_disponiveis). */
export interface AtoDisponivel {
  ato: string
  rotulo: string
  fase_para: string | null
  situacao_para: string | null
  requer_motivo: boolean
  requer_dados: boolean
  endpoint: string | null
  disponivel: boolean
  pendencias: string[]
}

/**
 * Atos conduzidos na SALA da sessão pública (disputa, julgamento, habilitação,
 * recursos, adjudicação) — não viram botão solto no cockpit.
 */
const ATOS_DA_SALA = [
  "INICIAR_DISPUTA", "ENCERRAR_DISPUTA", "INICIAR_HABILITACAO", "ABRIR_PRAZO_RECURSAL",
  "DECIDIR_RECURSOS", "ADJUDICAR", "RETORNAR_JULGAMENTO",
]

/**
 * Revogar/anular (art. 71 §3º) têm card próprio no cockpit (ExtincaoLicitacao):
 * intenção → manifestação dos licitantes → ato.
 */
const ATOS_DE_EXTINCAO = ["REVOGAR", "ANULAR"]

/** Atos de situação/encerramento: botão com cor de alerta. */
const ATOS_CRITICOS = ["REVOGAR", "ANULAR", "DECLARAR_DESERTA", "DECLARAR_FRACASSADA"]

/**
 * ATOS DO PROCESSO (E1) — o backend diz quais atos cabem agora e o que falta
 * para cada um; a tela só pede o ato (POST /licitacoes/:id/atos/:ato).
 * Atos com formulário próprio (publicar, homologar, resultado externo,
 * julgamento da dispensa) continuam nos botões dedicados do cockpit.
 */
export function AtosProcesso({
  licitacaoId,
  atos,
  onAtualizado,
}: {
  licitacaoId: string
  atos: AtoDisponivel[] | undefined
  onAtualizado: () => void
}) {
  const [ato, setAto] = useState<AtoDisponivel | null>(null)
  const [motivo, setMotivo] = useState("")
  const [executando, setExecutando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const lista = (atos || []).filter(
    (a) => !a.requer_dados && !a.endpoint && !ATOS_DA_SALA.includes(a.ato) && !ATOS_DE_EXTINCAO.includes(a.ato),
  )
  if (lista.length === 0) return null

  const abrir = (a: AtoDisponivel) => {
    setAto(a)
    setMotivo("")
    setErro(null)
  }

  const executar = async () => {
    if (!ato) return
    if (ato.requer_motivo && !motivo.trim()) {
      setErro("Informe o motivo — ele fica registrado no histórico do processo.")
      return
    }
    setExecutando(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/atos/${ato.ato}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(motivo.trim() ? { motivo: motivo.trim() } : {}),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.message || `HTTP ${res.status}`)
      }
      setAto(null)
      onAtualizado()
    } catch (e: any) {
      setErro(e.message || "Falha ao executar o ato")
    } finally {
      setExecutando(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="w-4 h-4" /> Atos do processo
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {lista.map((a) => (
            <Button
              key={a.ato}
              size="sm"
              variant="outline"
              className={ATOS_CRITICOS.includes(a.ato) ? "text-red-700 border-red-300" : ""}
              disabled={!a.disponivel}
              title={a.disponivel ? a.rotulo : `Pendências: ${a.pendencias.join(" · ")}`}
              onClick={() => abrir(a)}
            >
              {a.rotulo}
            </Button>
          ))}
          {lista.some((a) => !a.disponivel) && (
            <p className="w-full text-xs text-gray-500">
              Botões desabilitados têm pendências — passe o mouse para ver o que falta.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!ato} onOpenChange={(v) => !v && setAto(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{ato?.rotulo}</DialogTitle>
            <DialogDescription>
              O ato fica registrado no histórico do processo (quem, quando e o motivo).
            </DialogDescription>
          </DialogHeader>
          {ato?.requer_motivo && (
            <Textarea
              placeholder="Motivo / fundamentação (obrigatório)"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={4}
            />
          )}
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAto(null)} disabled={executando}>
              Cancelar
            </Button>
            <Button onClick={executar} disabled={executando}>
              {executando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

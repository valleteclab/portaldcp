"use client"

/**
 * Termo do contrato na tela do fornecedor: quem já assinou e o botão
 * "Assinar contrato" (homologação 08/11/2026 — o link ia só por e-mail).
 * A sessão do fornecedor é a identidade: assina sem código.
 * Fonte: GET/POST /api/fornecedor/contratos/:id/assinatura | /assinar.
 */
import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, Circle, FileText, Loader2, PenLine } from "lucide-react"
import { toast } from "sonner"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

interface SituacaoAssinatura {
  termo_gerado: boolean
  pode_assinar: boolean
  ja_assinou: boolean
  arquivo_url: string | null
  arquivo_assinado_url: string | null
  assinaturas: Array<{ nome: string; papel: string | null; assinado: boolean; data: string | null }>
}

// Mesmo endereço do Portal de Assinaturas do órgão (`/api/uploads/<caminho>`)
const urlArquivo = (u: string | null) => (!u ? null : /^https?:/.test(u) ? u : `${API_URL}/api/uploads/${u.replace(/^\/?(uploads\/)?/, "")}`)

export function TermoContratoFornecedor({ contratoId, numero, onAssinado }: { contratoId: string; numero: string; onAssinado?: () => void }) {
  const [s, setS] = useState<SituacaoAssinatura | null>(null)
  const [confirmar, setConfirmar] = useState(false)
  const [assinando, setAssinando] = useState(false)

  const carregar = useCallback(async () => {
    const r = await authFetch(`${API_URL}/api/fornecedor/contratos/${contratoId}/assinatura`, { cache: "no-store" }).catch(() => null)
    if (r?.ok) setS(await r.json())
  }, [contratoId])
  useEffect(() => { carregar() }, [carregar])

  const assinar = async () => {
    setAssinando(true)
    try {
      const r = await authFetch(`${API_URL}/api/fornecedor/contratos/${contratoId}/assinar`, { method: "POST" })
      if (!r.ok) {
        const e = await r.json().catch(() => ({}))
        toast.error(e?.message || "Não foi possível assinar o contrato")
        return
      }
      toast.success("Contrato assinado.")
      setConfirmar(false)
      await carregar()
      onAssinado?.()
    } finally {
      setAssinando(false)
    }
  }

  if (!s) return null
  const pdf = urlArquivo(s.arquivo_assinado_url || s.arquivo_url)

  return (
    <Card className="border-blue-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <PenLine className="w-4 h-4 text-blue-700" aria-hidden="true" /> Termo do contrato {numero}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!s.termo_gerado ? (
          <p className="text-gray-700">O órgão ainda vai gerar o termo do contrato e enviá-lo para as assinaturas. Você será avisado.</p>
        ) : (
          <>
            <p className="text-gray-700">
              {s.ja_assinou
                ? "Você já assinou. O contrato passa a valer quando todos assinarem e é publicado no PNCP (art. 94 da Lei 14.133/2021)."
                : "Leia o termo e assine. O contrato passa a valer quando todos assinarem e é publicado no PNCP (art. 94 da Lei 14.133/2021)."}
            </p>
            <ul className="space-y-1">
              {s.assinaturas.map((a, i) => (
                <li key={i} className="flex items-center gap-2">
                  {a.assinado ? <CheckCircle2 className="w-4 h-4 text-green-600" aria-hidden="true" /> : <Circle className="w-4 h-4 text-gray-400" aria-hidden="true" />}
                  <span>{a.nome}{a.papel ? ` — ${a.papel}` : ""}</span>
                  <span className="text-gray-500">{a.assinado ? `assinou${a.data ? ` em ${new Date(a.data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}` : "aguardando"}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2 flex-wrap">
              {pdf && (
                <Button variant="outline" size="sm" asChild>
                  <a href={pdf} target="_blank" rel="noreferrer"><FileText className="w-4 h-4 mr-1" aria-hidden="true" />Ver o termo (PDF)</a>
                </Button>
              )}
              {s.pode_assinar && (
                <Button size="sm" onClick={() => setConfirmar(true)}>
                  <PenLine className="w-4 h-4 mr-1" aria-hidden="true" />Assinar contrato
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
      <Dialog open={confirmar} onOpenChange={setConfirmar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assinar o contrato {numero}</DialogTitle>
            <DialogDescription>
              Você assina como a empresa da sua conta. A assinatura eletrônica fica registrada com data, hora e endereço de acesso (Lei 14.063/2020).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmar(false)} disabled={assinando}>Cancelar</Button>
            <Button onClick={assinar} disabled={assinando}>
              {assinando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <PenLine className="w-4 h-4 mr-1" aria-hidden="true" />}
              Assinar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

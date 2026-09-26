"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Loader2 } from "lucide-react"
import { ErroPendencias } from "@/components/licitacao/ErroPendencias"
import { PainelPrazos } from "./PublicacaoEdital"
import {
  consultarPrazos, inputLocalParaISO, lerErro, erroDeExcecao, sugestaoAPartirDoMinimo,
  type ErroBackend, type PrazosPublicacao,
} from "@/lib/publicacao"

/**
 * DIVULGAR O AVISO DA DISPENSA (art. 75, §3º; IN SEGES 67/2021): escolhe o fim
 * do recebimento (prazo mínimo contado pelo backend com o calendário do
 * órgão), gera e confere o aviso de contratação direta (é o PDF que vai ao
 * PNCP) e divulga. O prazo só começa quando o PNCP confirmar (arts. 54 e 55).
 */
export function DivulgarAvisoDialog({
  licitacaoId,
  fase,
  aberto,
  onFechar,
  onAtualizado,
}: {
  licitacaoId: string
  fase: string
  aberto: boolean
  onFechar: () => void
  onAtualizado: () => void
}) {
  const [fimPropostas, setFimPropostas] = useState("")
  const [prazos, setPrazos] = useState<PrazosPublicacao | null>(null)
  const [calculando, setCalculando] = useState(false)
  const [erro, setErro] = useState<ErroBackend | null>(null)
  const [aviso, setAviso] = useState<{ documento_id: string; versao: number } | null>(null)
  const [gerando, setGerando] = useState(false)
  const [divulgando, setDivulgando] = useState(false)

  // Ao abrir: sugere o dia mínimo legal (feriados do órgão já descontados)
  useEffect(() => {
    if (!aberto) return
    setErro(null)
    setPrazos(null)
    setFimPropostas("")
    setAviso(null)
    consultarPrazos(licitacaoId, { data_publicacao_edital: new Date().toISOString() })
      .then((p) => setFimPropostas(sugestaoAPartirDoMinimo(p.data_minima_abertura)))
      .catch((e) => setErro(erroDeExcecao(e)))
  }, [aberto, licitacaoId])

  // Confere a data escolhida (pendências do backend se for cedo demais)
  useEffect(() => {
    if (!aberto || !fimPropostas) return
    let cancelado = false
    setCalculando(true)
    const t = setTimeout(async () => {
      try {
        const fim = inputLocalParaISO(fimPropostas)
        const p = await consultarPrazos(licitacaoId, {
          data_publicacao_edital: new Date().toISOString(),
          data_fim_acolhimento: fim,
          data_abertura_sessao: fim,
          data_limite_impugnacao: fim,
        })
        if (!cancelado) setPrazos(p)
      } catch {
        if (!cancelado) setPrazos(null)
      } finally {
        if (!cancelado) setCalculando(false)
      }
    }, 400)
    return () => { cancelado = true; clearTimeout(t) }
  }, [aberto, fimPropostas, licitacaoId])

  const cronograma = () => {
    const agora = new Date().toISOString()
    const fim = new Date(fimPropostas).toISOString()
    return { data_publicacao_edital: agora, data_limite_impugnacao: fim, data_inicio_acolhimento: agora, data_fim_acolhimento: fim, data_abertura_sessao: fim }
  }

  const gerarAviso = async () => {
    if (!fimPropostas) return
    setGerando(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/publicacao/licitacao/${licitacaoId}/aviso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cronograma()),
      })
      if (!res.ok) {
        setErro(await lerErro(res, "Erro ao gerar o aviso"))
        return
      }
      const a = await res.json()
      setAviso({ documento_id: a.documento_id, versao: a.versao })
    } catch (e) {
      setErro(erroDeExcecao(e))
    } finally {
      setGerando(false)
    }
  }

  const abrirAviso = async () => {
    if (!aviso) return
    const res = await authFetch(`${API_URL}/api/publicacao/licitacao/${licitacaoId}/aviso/${aviso.documento_id}/arquivo`)
    if (!res.ok) return toast.error("Não foi possível abrir o aviso")
    window.open(URL.createObjectURL(await res.blob()), "_blank")
  }

  const divulgar = async () => {
    if (!fimPropostas) return
    setDivulgando(true)
    setErro(null)
    try {
      // Etapa única da contratação direta: conclui a instrução se ainda não concluída
      if (fase !== "APROVACAO_INTERNA") {
        const ra = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/avancar`, { method: "PUT" })
        if (!ra.ok) {
          setErro(await lerErro(ra, "Erro ao concluir a instrução"))
          return
        }
      }
      const res = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/publicar-edital`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cronograma()),
      })
      if (!res.ok) {
        setErro(await lerErro(res, "Erro ao divulgar"))
        return
      }
      onFechar()
      toast.success("Aviso enviado ao PNCP. O prazo de propostas só começa quando o PNCP confirmar a publicação (arts. 54 e 55) — acompanhe no alerta do processo.")
      onAtualizado()
    } catch (e) {
      setErro(erroDeExcecao(e))
    } finally {
      setDivulgando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && !divulgando && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Divulgar aviso da dispensa</DialogTitle>
          <DialogDescription>
            A divulgação conclui a instrução e envia o aviso de contratação direta ao PNCP. O prazo de propostas começa quando o
            PNCP confirmar a publicação (se a confirmação atrasar, as datas são estendidas até o mínimo legal).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label htmlFor="fim-propostas" className="text-sm font-medium">Receber propostas até</label>
            <Input id="fim-propostas" type="datetime-local" value={fimPropostas} onChange={(e) => setFimPropostas(e.target.value)} className="mt-1" />
            <p className="text-xs text-gray-600 mt-1">
              Mínimo de 3 dias úteis (art. 75, §3º), descontados os feriados do órgão — já sugerido no campo. Horário de Brasília.
            </p>
          </div>
          <PainelPrazos prazos={prazos} carregando={calculando} />
          <div className="flex items-center gap-2 flex-wrap">
            <Button type="button" size="sm" variant="outline" onClick={gerarAviso} disabled={gerando || !fimPropostas}>
              {gerando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {aviso ? "Gerar de novo" : "Gerar aviso (PDF)"}
            </Button>
            {aviso ? (
              <button type="button" className="text-sm text-blue-700 hover:underline" onClick={abrirAviso}>
                Conferir aviso v{aviso.versao}
              </button>
            ) : (
              <span className="text-xs text-gray-600">Gere e confira o aviso antes de divulgar (é o documento publicado no PNCP).</span>
            )}
          </div>
          <ErroPendencias erro={erro} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={divulgando}>Cancelar</Button>
          <Button onClick={divulgar} disabled={divulgando || !fimPropostas || !aviso}>
            {divulgando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Divulgar agora
          </Button>
        </DialogFooter>
        {!aviso && <p className="text-xs text-gray-600 text-right">Divulgar agora: gere o aviso primeiro.</p>}
      </DialogContent>
    </Dialog>
  )
}

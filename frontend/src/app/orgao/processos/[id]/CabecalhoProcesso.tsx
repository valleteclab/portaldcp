"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { API_URL, authFetch } from "@/lib/api"
import { fmtBrasilia } from "@/lib/publicacao"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, ClipboardList, FileText, Loader2, Pencil } from "lucide-react"
import { SituacaoBadge } from "@/components/licitacao/SituacaoBadge"
import { FASES_INTERNAS, ROTULO_CRITERIO, corFase, rotuloFase, rotuloModalidade } from "@/lib/licitacao-rotulos"
import { MenuAcoes, type EntradaMenu } from "./MenuAcoes"
import type { LicitacaoProcesso } from "./tipos"

/**
 * CABEÇALHO: título, fase/situação reais, objeto, linha com fundamento legal /
 * critério / unidade / criação e, à direita, editar dados, baixar os autos em
 * PDF (GET /licitacoes/:id/processo-pdf) e o menu "Mais ações".
 */
export function CabecalhoProcesso({
  licitacao: l,
  entradasMenu,
  onAcao,
}: {
  licitacao: LicitacaoProcesso
  entradasMenu: EntradaMenu[]
  onAcao: (chave: string) => void
}) {
  const router = useRouter()
  const interna = FASES_INTERNAS.includes(l.fase)
  const [baixando, setBaixando] = useState(false)

  const baixarPdf = async () => {
    setBaixando(true)
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${l.id}/processo-pdf`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement("a")
      a.href = url
      a.download = `processo-${l.numero_processo?.replace(/\W+/g, "-") || l.id}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      toast.error(`Não foi possível gerar os autos agora: ${e.message}`)
    } finally {
      setBaixando(false)
    }
  }

  const meta = [
    l.fundamento_legal,
    l.criterio_julgamento ? ROTULO_CRITERIO[l.criterio_julgamento] || l.criterio_julgamento : null,
    l.unidade_compradora ? `Unidade: ${l.unidade_compradora}` : null,
    l.created_at ? `Criado em ${fmtBrasilia(l.created_at)}` : null,
  ].filter(Boolean) as string[]

  return (
    <header className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-2 min-w-0 flex-1">
        <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="Voltar">
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">
              {rotuloModalidade(l.modalidade)} {l.numero_processo}
            </h1>
            <Badge className={`${corFase(l.fase)} hover:opacity-100`}>{rotuloFase(l.fase)}</Badge>
            <SituacaoBadge licitacao={l} />
            {l.srp && <Badge variant="outline">SRP</Badge>}
            {l.selecao_externa && <Badge className="bg-indigo-100 text-indigo-900 hover:bg-indigo-100">Seleção externa</Badge>}
          </div>
          <p className="text-gray-800 mt-1 max-w-3xl">{l.objeto}</p>
          {meta.length > 0 && (
            <p className="text-sm text-gray-700 mt-1">
              {meta.map((m, i) => (
                <span key={m}>
                  {i > 0 && <span aria-hidden="true"> · </span>}
                  {m}
                </span>
              ))}
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-2 flex-wrap justify-end">
        {interna && (
          <Button variant="outline" asChild>
            <Link href={`/orgao/fase-interna/processos/${l.id}`}>
              <ClipboardList className="w-4 h-4 mr-2" aria-hidden="true" /> Fase interna
            </Link>
          </Button>
        )}
        <Button variant="outline" asChild>
          <Link href={`/orgao/processos/${l.id}/editar`}>
            <Pencil className="w-4 h-4 mr-2" aria-hidden="true" /> Editar dados
          </Link>
        </Button>
        <Button variant="outline" onClick={baixarPdf} disabled={baixando}>
          {baixando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" aria-hidden="true" />}
          Baixar processo (PDF)
        </Button>
        <MenuAcoes entradas={entradasMenu} onEscolher={onAcao} />
      </div>
    </header>
  )
}

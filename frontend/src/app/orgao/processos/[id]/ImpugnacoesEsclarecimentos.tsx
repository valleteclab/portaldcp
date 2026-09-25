"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { API_URL, authFetch } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FileWarning, HelpCircle } from "lucide-react"

interface Contagem { total: number; pendentes: number }

const contar = (lista: any[], pendentes: string[]): Contagem => ({
  total: lista.length,
  pendentes: lista.filter((x) => pendentes.includes(x?.status)).length,
})

/**
 * IMPUGNAÇÕES E ESCLARECIMENTOS (art. 164) — resumo no cockpit; a análise e a
 * resposta ficam nas sub-rotas do processo.
 */
export function ImpugnacoesEsclarecimentos({ licitacaoId }: { licitacaoId: string }) {
  const [imp, setImp] = useState<Contagem | null>(null)
  const [esc, setEsc] = useState<Contagem | null>(null)

  useEffect(() => {
    let vivo = true
    const ler = async (url: string) => {
      try {
        const r = await authFetch(url)
        if (!r.ok) return []
        const j = await r.json()
        return Array.isArray(j) ? j : []
      } catch { return [] }
    }
    Promise.all([
      ler(`${API_URL}/api/impugnacoes/licitacao/${licitacaoId}`),
      ler(`${API_URL}/api/esclarecimentos/licitacao/${licitacaoId}`),
    ]).then(([i, e]) => {
      if (!vivo) return
      setImp(contar(i, ["PENDENTE", "EM_ANALISE"]))
      setEsc(contar(e, ["PENDENTE"]))
    })
    return () => { vivo = false }
  }, [licitacaoId])

  const linha = (
    icone: ReactNode, titulo: string, c: Contagem | null, href: string,
  ) => (
    <div className="flex items-center justify-between gap-2 border rounded-md px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        {icone}
        <span className="font-medium">{titulo}</span>
        <span className="text-gray-500">{c ? c.total : "…"}</span>
        {c && c.pendentes > 0 && (
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{c.pendentes} a responder</Badge>
        )}
      </div>
      <Link href={href}>
        <Button size="sm" variant="outline">{c && c.pendentes > 0 ? "Responder" : "Abrir"}</Button>
      </Link>
    </div>
  )

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Impugnações e esclarecimentos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {linha(<FileWarning className="w-4 h-4 text-amber-600" />, "Impugnações", imp, `/orgao/processos/${licitacaoId}/impugnacoes`)}
        {linha(<HelpCircle className="w-4 h-4 text-blue-600" />, "Pedidos de esclarecimento", esc, `/orgao/processos/${licitacaoId}/esclarecimentos`)}
        <p className="text-[11px] text-gray-400">
          Lei 14.133/2021, art. 164: até 3 dias úteis antes da abertura; resposta em até 3 dias úteis. Impugnação acolhida que
          altera o edital exige a retificação antes da disputa.
        </p>
      </CardContent>
    </Card>
  )
}

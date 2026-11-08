"use client"

/**
 * Painel do fornecedor: licitações abertas e participações (homologação
 * 08/11/2026 — os dois cartões eram fixos: "Nenhuma licitação disponível"
 * com 21 licitações na lista). Fonte: GET /api/portal-fornecedor/licitacoes.
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, FileText } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { dataHoraBR } from "@/lib/licitacao-rotulos"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface Linha {
  id: string
  numero_edital?: string
  numero_processo: string
  objeto: string
  fase: string
  data_abertura_sessao: string | null
  orgao: { nome: string } | null
  minha_proposta: { status: string } | null
}

async function buscar(q: Record<string, string>): Promise<{ itens: Linha[]; total: number }> {
  const r = await authFetch(`${API_URL}/api/portal-fornecedor/licitacoes?${new URLSearchParams({ pagina: "1", limite: "5", ...q }).toString()}`).catch(() => null)
  if (!r?.ok) return { itens: [], total: 0 }
  const j = await r.json()
  return { itens: j.itens ?? [], total: j.total ?? 0 }
}

function Lista({ linhas, vazio, dica, icone }: { linhas: Linha[]; vazio: string; dica: string; icone: "doc" | "alerta" }) {
  if (!linhas.length) {
    const Icone = icone === "doc" ? FileText : AlertCircle
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Icone className="h-12 w-12 mx-auto mb-4 opacity-20" />
        <p>{vazio}</p>
        <p className="text-sm">{dica}</p>
      </div>
    )
  }
  return (
    <ul className="divide-y">
      {linhas.map((l) => (
        <li key={l.id} className="py-2">
          <Link href={`/fornecedor/licitacoes/${l.id}`} className="block hover:bg-slate-50 rounded px-1">
            <p className="text-sm font-medium truncate">{l.numero_edital || l.numero_processo} — {l.objeto}</p>
            <p className="text-xs text-muted-foreground">
              {l.orgao?.nome ?? ""}{l.data_abertura_sessao ? ` · abertura ${dataHoraBR(l.data_abertura_sessao)}` : ""}
              {l.minha_proposta ? ` · sua proposta: ${l.minha_proposta.status.toLowerCase()}` : ""}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function ResumoLicitacoesFornecedor() {
  const [abertas, setAbertas] = useState<{ itens: Linha[]; total: number } | null>(null)
  const [minhas, setMinhas] = useState<{ itens: Linha[]; total: number } | null>(null)
  useEffect(() => {
    buscar({ fase: "ACOLHIMENTO_PROPOSTAS" }).then(setAbertas)
    buscar({ participando: "true" }).then(setMinhas)
  }, [])
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Licitações Disponíveis</CardTitle>
          <CardDescription>
            Recebendo propostas{abertas && abertas.total > 0 ? ` · ${abertas.total}` : ""} · <Link className="underline" href="/fornecedor/licitacoes">ver todas</Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {abertas && <Lista linhas={abertas.itens} vazio="Nenhuma licitação recebendo propostas agora" dica="Novas licitações aparecerão aqui quando publicadas" icone="doc" />}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Minhas Participações</CardTitle>
          <CardDescription>
            Licitações em que você enviou proposta{minhas && minhas.total > 0 ? ` · ${minhas.total}` : ""} · <Link className="underline" href="/fornecedor/participacoes">ver todas</Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {minhas && <Lista linhas={minhas.itens} vazio="Você ainda não está participando de nenhuma licitação" dica="Envie uma proposta em Licitações Disponíveis" icone="alerta" />}
        </CardContent>
      </Card>
    </div>
  )
}

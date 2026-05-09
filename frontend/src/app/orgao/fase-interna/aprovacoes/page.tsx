"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  ChevronRight, Home, Check, Clock, AlertCircle, FileText,
  User, Calendar, MessageSquare, ExternalLink, CheckCircle2
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { API_URL, authFetch } from "@/lib/api"

interface ItemAprovacao {
  id: string
  processo: string
  objeto: string
  tipo_aprovacao: string
  responsavel: string
  data_limite: string
  status: "pendente" | "aprovado" | "rejeitado" | "aguardando"
  observacoes?: string
}

const ITENS_EXEMPLO: ItemAprovacao[] = [
  {
    id: "1",
    processo: "2026/0142",
    objeto: "Aquisição de licenças de GED",
    tipo_aprovacao: "Aprovação do Termo de Referência",
    responsavel: "Coordenadora Adm.",
    data_limite: "2026-05-15",
    status: "pendente",
  },
  {
    id: "2",
    processo: "2026/0138",
    objeto: "Contratação de serviços de manutenção predial",
    tipo_aprovacao: "Parecer Jurídico",
    responsavel: "Procuradoria Geral",
    data_limite: "2026-05-10",
    status: "aprovado",
    observacoes: "Processo aprovado sem ressalvas. Pode prosseguir com a publicação do edital.",
  },
  {
    id: "3",
    processo: "2026/0151",
    objeto: "Fornecimento de combustível — frota municipal",
    tipo_aprovacao: "Autorização da Autoridade",
    responsavel: "Secretário de Adm.",
    data_limite: "2026-05-12",
    status: "aguardando",
  },
]

const FLUXO_APROVACAO = [
  { id: "elaboracao", label: "Elaboração", icon: FileText, descricao: "Área técnica elabora documentos" },
  { id: "revisao_interna", label: "Revisão interna", icon: User, descricao: "Equipe revisa documentos" },
  { id: "juridico", label: "Análise jurídica", icon: MessageSquare, descricao: "Procuradoria emite parecer" },
  { id: "autoridade", label: "Autorização", icon: CheckCircle2, descricao: "Autoridade competente autoriza" },
  { id: "publicacao", label: "Publicação", icon: ExternalLink, descricao: "Publicação no PNCP/diário" },
]

const STATUS_INFO: Record<string, { label: string; bg: string; text: string; icon: any }> = {
  pendente: { label: "Pendente", bg: "bg-yellow-50", text: "text-yellow-700", icon: Clock },
  aprovado: { label: "Aprovado", bg: "bg-green-50", text: "text-green-700", icon: Check },
  rejeitado: { label: "Rejeitado", bg: "bg-red-50", text: "text-red-700", icon: AlertCircle },
  aguardando: { label: "Aguardando", bg: "bg-blue-50", text: "text-blue-700", icon: Clock },
}

function fmtData(d: string) {
  const dt = new Date(d)
  const hoje = new Date("2026-05-09")
  const diff = Math.ceil((dt.getTime() - hoje.getTime()) / 86400000)
  const fmt = dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
  return { fmt, diff, vencido: diff < 0, urgente: diff >= 0 && diff <= 3 }
}

export default function AprovacoesPage() {
  const [itens, setItens] = useState<ItemAprovacao[]>(ITENS_EXEMPLO)
  const [filtro, setFiltro] = useState<"todos" | "pendente" | "aprovado">("todos")

  const filtrados = filtro === "todos" ? itens : itens.filter((i) => i.status === filtro)
  const pendentes = itens.filter((i) => i.status === "pendente" || i.status === "aguardando").length
  const aprovados = itens.filter((i) => i.status === "aprovado").length

  const aprovar = (id: string) => {
    setItens((prev) => prev.map((i) => i.id === id ? { ...i, status: "aprovado" } : i))
  }

  return (
    <div className="p-6 pb-10 max-w-6xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-4">
        <Home className="w-3.5 h-3.5" />
        <ChevronRight className="w-3 h-3" />
        <Link href="/orgao/fase-interna" className="hover:text-[#1351b4]">Fase Interna</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-[#1351b4] font-medium">Aprovações</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Fluxo de Aprovações</h1>
          <p className="text-sm text-gray-500 mt-0.5">Tramitação e workflow de assinaturas da fase interna</p>
        </div>
        <div className="flex gap-2 text-sm">
          <span className="px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-full font-semibold text-xs">
            {pendentes} pendentes
          </span>
          <span className="px-3 py-1.5 bg-green-50 text-green-700 rounded-full font-semibold text-xs">
            {aprovados} aprovados
          </span>
        </div>
      </div>

      {/* Fluxo de aprovação (horizontal) */}
      <Card className="border-0 shadow-sm mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Fluxo padrão de aprovação</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-0">
            {FLUXO_APROVACAO.map((etapa, idx) => {
              const Icon = etapa.icon
              const isLast = idx === FLUXO_APROVACAO.length - 1
              return (
                <div key={etapa.id} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div className="w-10 h-10 rounded-full bg-[#ecf3fc] border-2 border-[#1351b4] flex items-center justify-center mb-2">
                      <Icon className="w-4 h-4 text-[#1351b4]" />
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-semibold text-gray-800">{etapa.label}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{etapa.descricao}</div>
                    </div>
                  </div>
                  {!isLast && (
                    <div className="h-0.5 w-8 bg-[#c5d4eb] mx-1 shrink-0 mt-[-20px]" />
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Filtros */}
      <div className="flex gap-2 mb-4">
        {(["todos", "pendente", "aprovado"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filtro === f ? "bg-[#1351b4] text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            {f === "todos" ? "Todos" : f === "pendente" ? "Pendentes" : "Aprovados"}
          </button>
        ))}
      </div>

      {/* Lista de itens */}
      <div className="space-y-3">
        {filtrados.map((item) => {
          const statusInfo = STATUS_INFO[item.status]
          const StatusIcon = statusInfo.icon
          const dataInfo = fmtData(item.data_limite)

          return (
            <Card key={item.id} className="border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${statusInfo.bg}`}>
                    <StatusIcon className={`w-5 h-5 ${statusInfo.text}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Link href={`/orgao/fase-interna/processos/${item.id}`} className="text-sm font-bold text-gray-900 hover:text-[#1351b4]">
                        {item.processo}
                      </Link>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusInfo.bg} ${statusInfo.text}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">{item.objeto}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" /> {item.tipo_aprovacao}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" /> {item.responsavel}
                      </span>
                      <span className={`flex items-center gap-1 font-medium ${
                        dataInfo.vencido ? "text-red-600" : dataInfo.urgente ? "text-yellow-600" : "text-gray-500"
                      }`}>
                        <Calendar className="w-3 h-3" />
                        {dataInfo.vencido ? `Vencido há ${Math.abs(dataInfo.diff)}d` : `Prazo: ${dataInfo.fmt}`}
                      </span>
                    </div>
                    {item.observacoes && (
                      <div className="mt-2 p-2.5 bg-green-50 rounded-lg border border-green-100">
                        <p className="text-xs text-green-700">{item.observacoes}</p>
                      </div>
                    )}
                  </div>

                  {(item.status === "pendente" || item.status === "aguardando") && (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50 h-8"
                      >
                        Rejeitar
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => aprovar(item.id)}
                        className="bg-[#168821] hover:bg-[#126b1a] text-white h-8"
                      >
                        <Check className="w-3.5 h-3.5 mr-1" /> Aprovar
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {filtrados.length === 0 && (
        <div className="py-16 text-center">
          <CheckCircle2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum item de aprovação encontrado.</p>
        </div>
      )}
    </div>
  )
}

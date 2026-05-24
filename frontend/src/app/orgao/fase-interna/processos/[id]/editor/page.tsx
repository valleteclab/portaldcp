"use client"

import { useState, useEffect, use } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import {
  ChevronRight,
  Home,
  Loader2,
} from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { TITULOS_TIPO } from "@/lib/fase-interna/secoes-template"

// Importação dinâmica — DocumentoSeccionado usa Tiptap (browser-only)
const DocumentoSeccionado = dynamic(
  () =>
    import("@/components/editor/DocumentoSeccionado").then((m) => ({
      default: m.DocumentoSeccionado,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-[#1351b4]" />
      </div>
    ),
  },
)

// ─── Types ─────────────────────────────────────────────────────────────────────

interface DocumentoFaseInterna {
  id?: string
  tipo: string
  titulo?: string
  descricao?: string
  dados_estruturados?: Record<string, unknown>
  status?: string
}

interface LicitacaoMini {
  numero_processo?: string
  objeto?: string
  modalidade?: string
  criterio_julgamento?: string
  valor_estimado?: number
  natureza_objeto?: string
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function EditorDocumentoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const searchParams = useSearchParams()
  const tipo = (searchParams.get("tipo") || "TR").toUpperCase()

  const [documento, setDocumento] = useState<DocumentoFaseInterna | null>(null)
  const [licitacao, setLicitacao] = useState<LicitacaoMini | null>(null)
  const [loading, setLoading] = useState(true)

  const tituloDocumento = TITULOS_TIPO[tipo] || tipo

  useEffect(() => {
    carregarTudo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tipo])

  const carregarTudo = async () => {
    setLoading(true)
    try {
      const [docRes, licRes] = await Promise.all([
        authFetch(`${API_URL}/api/fase-interna/${id}/documentos/${tipo}`),
        authFetch(`${API_URL}/api/licitacoes/${id}`),
      ])

      if (docRes.ok) {
        const data = await docRes.json()
        // Endpoint retorna array — pegar primeiro (versão atual)
        const docItem = Array.isArray(data) ? (data[0] ?? null) : (data ?? null)
        setDocumento(docItem)
      } else {
        setDocumento(null)
      }

      if (licRes.ok) {
        setLicitacao(await licRes.json())
      }
    } catch (e) {
      console.error("[editor] Erro ao carregar dados:", e)
      setDocumento(null)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-[#1351b4]" />
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: "100vh" }}>
      {/* ── Top bar: breadcrumb ── */}
      <div className="flex items-center justify-between px-5 py-2 bg-white border-b border-gray-200 shrink-0 z-10">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Home className="w-3.5 h-3.5" />
          <ChevronRight className="w-3 h-3" />
          <Link href="/orgao/fase-interna" className="hover:text-[#1351b4]">
            Fase Interna
          </Link>
          <ChevronRight className="w-3 h-3" />
          <Link
            href={`/orgao/fase-interna/processos/${id}`}
            className="hover:text-[#1351b4]"
          >
            {licitacao?.numero_processo || "Processo"}
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-[#1351b4] font-medium">{tituloDocumento}</span>
        </div>
      </div>

      {/* ── Barra azul: identificação do documento ── */}
      <div className="px-6 py-2.5 bg-gradient-to-r from-[#0c326f] to-[#1351b4] text-white shrink-0">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-white/15 backdrop-blur ring-1 ring-white/25">
            {tipo}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-semibold leading-tight truncate">
              {tituloDocumento}
            </h1>
            {licitacao?.objeto && (
              <p className="text-[11px] text-white/80 truncate mt-0.5">
                {licitacao.numero_processo
                  ? `${licitacao.numero_processo} · `
                  : ""}
                {licitacao.objeto}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Editor de seções guiadas (ocupa o restante) ── */}
      <div className="flex-1 overflow-hidden">
        <DocumentoSeccionado
          licitacaoId={id}
          tipo={tipo}
          documento={documento}
          licitacao={licitacao}
        />
      </div>
    </div>
  )
}

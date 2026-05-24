"use client"

import { useState, useEffect, use } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import {
  ChevronRight,
  Home,
  Eye,
  Loader2,
  Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { API_URL, authFetch } from "@/lib/api"

// Importação dinâmica com ssr: false — o editor Tiptap/Yjs/ProseMirror
// não pode rodar no servidor (usa APIs do browser e Y.Doc)
const DocumentEditor = dynamic(
  () => import("@/components/editor/DocumentEditor").then((m) => ({ default: m.DocumentEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-[#1351b4]" />
      </div>
    ),
  },
)

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocumentoFaseInterna {
  id: string
  tipo: string
  titulo: string
  descricao?: string
  dados_estruturados?: Record<string, unknown>
  status?: string
}

// ─── Templates de seções por tipo (para converter JSON → HTML) ───────────────

interface Secao {
  id: string
  titulo: string
}

const SECOES_POR_TIPO: Record<string, Secao[]> = {
  TR: [
    { id: "objeto", titulo: "1. Objeto" },
    { id: "fundamentacao", titulo: "2. Fundamentação Legal" },
    { id: "descricao", titulo: "3. Descrição da Solução" },
    { id: "requisitos", titulo: "4. Requisitos da Contratação" },
    { id: "modelo_execucao", titulo: "5. Modelo de Execução" },
    { id: "modelo_gestao", titulo: "6. Modelo de Gestão e Fiscalização" },
    { id: "pagamento", titulo: "7. Forma de Pagamento" },
    { id: "selecao_habilitacao", titulo: "8. Seleção e Habilitação" },
    { id: "estimativa_valor_tr", titulo: "9. Estimativa de Valor" },
    { id: "dotacao_orcamentaria_tr", titulo: "10. Dotação Orçamentária" },
  ],
  DFD: [
    { id: "descricao", titulo: "1. Descrição da Necessidade" },
    { id: "quantitativo", titulo: "2. Quantidade Estimada" },
    { id: "previsao", titulo: "3. Previsão no PCA" },
    { id: "prazo", titulo: "4. Data Prevista de Conclusão" },
  ],
  ETP: [
    { id: "necessidade", titulo: "1. Descrição da Necessidade" },
    { id: "previsao_pca", titulo: "2. Previsão no PCA" },
    { id: "requisitos", titulo: "3. Requisitos da Contratação" },
    { id: "estimativa", titulo: "4. Estimativa de Quantidades" },
    { id: "levantamento", titulo: "5. Levantamento de Mercado" },
    { id: "estimativa_valor", titulo: "6. Estimativa de Valor" },
    { id: "solucao", titulo: "7. Descrição da Solução Escolhida" },
    { id: "parcelamento", titulo: "8. Justificativa de Parcelamento" },
    { id: "beneficios", titulo: "9. Resultados Pretendidos" },
    { id: "providencias", titulo: "10. Providências Prévias" },
    { id: "correlatas", titulo: "11. Contratações Correlatas" },
    { id: "sustentabilidade", titulo: "12. Impactos Ambientais e Sustentabilidade" },
    { id: "viabilidade", titulo: "13. Posicionamento Conclusivo" },
  ],
  // ME = MINUTA_EDITAL (enum value 'ME')
  ME: [
    { id: "preambulo", titulo: "1. Preâmbulo" },
    { id: "objeto", titulo: "2. Objeto" },
    { id: "participacao", titulo: "3. Participação" },
    { id: "habilitacao", titulo: "4. Habilitação" },
    { id: "julgamento", titulo: "5. Julgamento" },
    { id: "recursos", titulo: "6. Recursos" },
    { id: "contratacao", titulo: "7. Contratação" },
  ],
  // legado — pode chegar via dados_estruturados antigos
  EDITAL: [
    { id: "preambulo", titulo: "1. Preâmbulo" },
    { id: "objeto", titulo: "2. Objeto" },
    { id: "participacao", titulo: "3. Participação" },
    { id: "habilitacao", titulo: "4. Habilitação" },
    { id: "julgamento", titulo: "5. Julgamento" },
    { id: "recursos", titulo: "6. Recursos" },
    { id: "contratacao", titulo: "7. Contratação" },
  ],
  AVISO_CONTRATACAO: [
    { id: "amparo_legal", titulo: "1. Amparo Legal" },
    { id: "objeto_contratacao", titulo: "2. Objeto da Contratação" },
    { id: "justificativa", titulo: "3. Justificativa" },
    { id: "caracterizacao", titulo: "4. Caracterização" },
  ],
}

const TITULOS_TIPO: Record<string, string> = {
  // Enum values (curtos) — usados nas URLs (?tipo=DFD, ?tipo=AA, etc.)
  DFD: "Documento de Formalização de Demanda",
  ETP: "Estudo Técnico Preliminar",
  AR: "Análise de Riscos",
  TR: "Termo de Referência",
  PP: "Pesquisa de Preços",
  PJ: "Parecer Jurídico",
  PT: "Parecer Técnico",
  AA: "Autorização para Abertura",
  ME: "Minuta do Edital",
  DO: "Dotação Orçamentária",
  // Nomes longos (chaves dos enums) — legado / compat
  TERMO_REFERENCIA: "Termo de Referência",
  DOCUMENTO_FORMALIZACAO_DEMANDA: "Documento de Formalização de Demanda",
  ESTUDO_TECNICO_PRELIMINAR: "Estudo Técnico Preliminar",
  ANALISE_RISCOS: "Análise de Riscos",
  PESQUISA_PRECOS: "Pesquisa de Preços",
  PARECER_JURIDICO: "Parecer Jurídico",
  AUTORIZACAO: "Autorização para Abertura",
  AUTORIZACAO_ABERTURA: "Autorização para Abertura",
  EDITAL: "Minuta do Edital",
  DOTACAO_ORCAMENTARIA: "Dotação Orçamentária",
  AVISO_CONTRATACAO: "Aviso de Contratação Direta",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converte dados_estruturados (JSON com seções do wizard) em HTML formatado.
 */
function secoesPraHtml(tipo: string, dados: Record<string, unknown>): string {
  const secoes = SECOES_POR_TIPO[tipo] || []
  const titulo = TITULOS_TIPO[tipo] || tipo
  let html = `<h1>${titulo}</h1>\n`

  if (secoes.length === 0) {
    // Fallback: exibe cada campo
    for (const [k, v] of Object.entries(dados)) {
      if (v && typeof v === 'string') {
        html += `<h2>${k}</h2>\n<p>${v}</p>\n`
      }
    }
    return html
  }

  for (const secao of secoes) {
    const conteudo = dados[secao.id] as string | undefined
    html += `<h2>${secao.titulo}</h2>\n`
    if (conteudo?.trim()) {
      const paragrafos = conteudo.split(/\n\n+/).filter(Boolean)
      if (paragrafos.length > 1) {
        html += paragrafos.map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('\n') + '\n'
      } else {
        html += `<p>${conteudo.replace(/\n/g, '<br/>')}</p>\n`
      }
    } else {
      html += `<p></p>\n`
    }
  }

  return html
}

/**
 * Detecta se uma string contém HTML rico do editor Tiptap
 * (headings, parágrafos, etc. — diferente de plain text simples).
 */
function isEditorHtml(s: string): boolean {
  return /<h[1-6]|<ul|<ol|<table|<blockquote/.test(s)
}

function getInitialHtml(doc: DocumentoFaseInterna | null): string | undefined {
  if (!doc) return undefined

  // 1. Conteúdo HTML rico salvo pelo editor Tiptap → usa diretamente
  if (doc.descricao?.trim() && isEditorHtml(doc.descricao)) {
    return doc.descricao
  }

  // 2. Dados estruturados do wizard → converte para HTML formatado com seções
  if (doc.dados_estruturados && Object.keys(doc.dados_estruturados).length > 0) {
    return secoesPraHtml(doc.tipo, doc.dados_estruturados as Record<string, unknown>)
  }

  // 3. Texto puro do wizard (ex: DFD, autorizacao, parecer) → formata com título
  if (doc.descricao?.trim()) {
    const titulo = TITULOS_TIPO[doc.tipo] || doc.tipo
    const paragrafos = doc.descricao.split(/\n\n+/).filter(Boolean)
    const body = paragrafos.length > 1
      ? paragrafos.map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('\n')
      : `<p>${doc.descricao.replace(/\n/g, '<br/>')}</p>`
    return `<h1>${titulo}</h1>\n${body}`
  }

  return undefined
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EditorDocumentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const searchParams = useSearchParams()
  const tipo = (searchParams.get("tipo") || "TR").toUpperCase()

  const [documento, setDocumento] = useState<DocumentoFaseInterna | null>(null)
  const [loading, setLoading] = useState(true)

  const tituloDocumento = TITULOS_TIPO[tipo] || tipo
  const initialHtml = getInitialHtml(documento)

  useEffect(() => {
    carregarDocumento()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tipo])

  const carregarDocumento = async () => {
    setLoading(true)
    try {
      const res = await authFetch(`${API_URL}/api/fase-interna/${id}/documentos/${tipo}`)
      if (res.ok) {
        const data = await res.json()
        // O endpoint retorna um array — pegar o primeiro documento (versão atual)
        const docItem = Array.isArray(data) ? (data[0] ?? null) : (data ?? null)
        setDocumento(docItem)
      } else {
        // Documento não existe ainda — editor inicia vazio
        setDocumento(null)
      }
    } catch (e) {
      console.error('[editor] Erro ao carregar documento:', e)
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
    <div className="flex flex-col" style={{ height: '100vh' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-white border-b border-gray-200 shrink-0 z-10">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Home className="w-3.5 h-3.5" />
          <ChevronRight className="w-3 h-3" />
          <Link href="/orgao/fase-interna" className="hover:text-[#1351b4]">
            Fase Interna
          </Link>
          <ChevronRight className="w-3 h-3" />
          <Link href={`/orgao/fase-interna/processos/${id}`} className="hover:text-[#1351b4]">
            Processo
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-[#1351b4] font-medium">{tituloDocumento}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <span className="text-xs bg-[#ecf3fc] text-[#1351b4] px-2 py-0.5 rounded font-semibold">
            {tipo}
          </span>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
            <Eye className="w-3.5 h-3.5" /> PDF
          </Button>
          <Button size="sm" className="h-7 text-xs gap-1.5 bg-[#1351b4] hover:bg-[#0c326f]">
            <Check className="w-3.5 h-3.5" /> Concluir revisão
          </Button>
        </div>
      </div>

      {/* Editor + AI Panel — ocupa o restante da tela */}
      <div className="flex-1 overflow-hidden">
        <DocumentEditor
          documentoId={documento?.id || `${id}-${tipo}`}
          licitacaoId={id}
          tipo={tipo}
          tituloDocumento={tituloDocumento}
          initialHtml={initialHtml}
        />
      </div>
    </div>
  )
}

"use client"

import { useState, use } from "react"
import Link from "next/link"
import {
  Check, Sparkles, ChevronRight, Home, Eye, Loader2
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { API_URL, authFetch } from "@/lib/api"

const SECOES = [
  { id: "objeto", titulo: "1. Objeto", status: "rascunho", art: "Art. 6º, XXIII" },
  { id: "justificativa", titulo: "2. Justificativa", status: "rascunho", art: "Art. 18, II" },
  { id: "fundamentacao", titulo: "3. Fundamentação Legal", status: "rascunho", art: "Art. 18" },
  { id: "requisitos", titulo: "4. Requisitos da Contratação", status: "rascunho", art: "Art. 40, I" },
  { id: "execucao", titulo: "5. Modelo de Execução", status: "rascunho", art: "Art. 40, §1º" },
  { id: "pagamento", titulo: "6. Condições de Pagamento", status: "rascunho", art: "Art. 40, XI" },
  { id: "prazo", titulo: "7. Prazo de Vigência", status: "rascunho", art: "Art. 40, III" },
]

const STATUS_COR: Record<string, { label: string; bg: string; text: string }> = {
  aprovado: { label: "Aprovado", bg: "bg-green-50", text: "text-green-700" },
  revisao: { label: "Em revisão", bg: "bg-yellow-50", text: "text-yellow-700" },
  rascunho: { label: "Rascunho", bg: "bg-gray-100", text: "text-gray-600" },
}

const CONTEUDO_INICIAL: Record<string, string> = Object.fromEntries(
  SECOES.map((secao) => [secao.id, ""])
)

export default function EditorDocumentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [secaoAtiva, setSecaoAtiva] = useState("requisitos")
  const [conteudos, setConteudos] = useState(CONTEUDO_INICIAL)
  const [gerandoIA, setGerandoIA] = useState(false)
  const [sugestaoIA, setSugestaoIA] = useState<string | null>(null)

  const secao = SECOES.find((s) => s.id === secaoAtiva)

  const gerarComIA = async () => {
    setGerandoIA(true)
    setSugestaoIA(null)
    try {
      const res = await authFetch(`${API_URL}/api/ia/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: `Sugira uma melhoria para a seguinte seção "${secao?.titulo}" de um Termo de Referência, baseada na Lei 14.133/2021:\n\n${conteudos[secaoAtiva] || "(seção vazia)"}\n\nApenas o texto da seção melhorada, sem explicações adicionais.`
          }],
          system: "Você é especialista em Termos de Referência conforme a Lei 14.133/2021. Forneça texto direto e objetivo.",
          max_tokens: 500,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setSugestaoIA(data.content?.[0]?.text || data.message || "")
      }
    } catch (e) {
      console.error(e)
    } finally {
      setGerandoIA(false)
    }
  }

  const aceitarSugestao = () => {
    if (sugestaoIA) {
      setConteudos((prev) => ({ ...prev, [secaoAtiva]: sugestaoIA }))
      setSugestaoIA(null)
    }
  }

  return (
    <div className="p-6 pb-10 max-w-6xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-4">
        <Home className="w-3.5 h-3.5" />
        <ChevronRight className="w-3 h-3" />
        <Link href="/orgao/fase-interna" className="hover:text-[#1351b4]">Fase Interna</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href={`/orgao/fase-interna/processos/${id}`} className="hover:text-[#1351b4]">Processo</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-[#1351b4] font-medium">Editor de documentos</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Termo de Referência</h1>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-xs text-gray-500">Processo #{id.slice(0, 8)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Eye className="w-3.5 h-3.5 mr-1.5" /> Visualizar PDF
          </Button>
          <Button size="sm" className="bg-[#1351b4] hover:bg-[#0c326f]">
            <Check className="w-3.5 h-3.5 mr-1.5" /> Submeter à revisão
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[200px_1fr] gap-5">
        {/* Sumário */}
        <div className="space-y-3">
          <Card className="border-0 shadow-sm sticky top-4">
            <CardHeader className="pb-2 pt-4 px-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Sumário</p>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              {SECOES.map((s) => {
                const cor = STATUS_COR[s.status]
                return (
                  <button
                    key={s.id}
                    onClick={() => setSecaoAtiva(s.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-colors ${
                      secaoAtiva === s.id ? "bg-[#ecf3fc] text-[#1351b4]" : "hover:bg-gray-50 text-gray-700"
                    }`}
                  >
                    <span className="flex-1 text-xs font-medium truncate">{s.titulo}</span>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      s.status === "aprovado" ? "bg-green-500" : s.status === "revisao" ? "bg-yellow-400" : "bg-gray-300"
                    }`} />
                  </button>
                )
              })}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm sticky top-72">
            <CardHeader className="pb-2 pt-4 px-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Conformidade</p>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-xs text-gray-400 leading-relaxed">
                Nenhuma análise de conformidade disponível para este documento.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Editor */}
        <div className="space-y-4">
          {secao && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{secao.titulo}</CardTitle>
                    <span className="text-xs bg-[#ecf3fc] text-[#1351b4] px-2 py-0.5 rounded mt-1 inline-block">
                      {secao.art}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COR[secao.status]?.bg} ${STATUS_COR[secao.status]?.text}`}>
                      {STATUS_COR[secao.status]?.label}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={gerarComIA}
                      disabled={gerandoIA}
                      className="text-[#1351b4] border-[#c5d4eb] hover:bg-[#ecf3fc]"
                    >
                      {gerandoIA ? (
                        <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Gerando…</>
                      ) : (
                        <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Sugestão da IA</>
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={conteudos[secaoAtiva] || ""}
                  onChange={(e) => setConteudos((prev) => ({ ...prev, [secaoAtiva]: e.target.value }))}
                  placeholder={`Escreva o conteúdo de "${secao.titulo}" aqui…`}
                  className="min-h-64 resize-none text-sm leading-relaxed border-gray-100 focus:border-[#1351b4]"
                />

                {/* Sugestão IA */}
                {sugestaoIA && (
                  <div className="mt-4 p-4 bg-[#f6f9fd] border border-[#dbe8fb] rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-[#1351b4]" />
                      <span className="text-xs font-semibold text-[#1351b4]">Sugestão do Procura+ AI</span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{sugestaoIA}</p>
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" onClick={aceitarSugestao} className="bg-[#1351b4] hover:bg-[#0c326f]">
                        <Check className="w-3.5 h-3.5 mr-1.5" /> Aceitar sugestão
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setSugestaoIA(null)}>
                        Descartar
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

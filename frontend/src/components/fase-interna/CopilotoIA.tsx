"use client"

import { useState, useRef, useEffect } from "react"
import { Sparkles, Send, X, ChevronDown, ChevronUp, Bot } from "lucide-react"
import { Button } from "@/components/ui/button"
import { API_URL, authFetch } from "@/lib/api"

interface Mensagem {
  role: "user" | "assistant"
  content: string
}

interface CopilotoIAProps {
  contexto?: string
  onClose?: () => void
}

const SUGESTOES_RAPIDAS = [
  "Revisar conformidade com a Lei 14.133/2021",
  "Quais documentos são obrigatórios nesta etapa?",
  "Gerar rascunho de justificativa",
  "Verificar artigos aplicáveis",
]

export function CopilotoIA({ contexto, onClose }: CopilotoIAProps) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [input, setInput] = useState("")
  const [carregando, setCarregando] = useState(false)
  const [minimizado, setMinimizado] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Rola SOMENTE o container do chat — scrollIntoView rolaria a página
    // inteira junto (a tela "pulava" a cada mensagem/clique).
    if (mensagens.length === 0) return
    const cont = endRef.current?.closest(".overflow-y-auto") as HTMLElement | null
    if (cont) cont.scrollTop = cont.scrollHeight
  }, [mensagens])

  const enviar = async (texto?: string) => {
    const msg = texto || input.trim()
    if (!msg || carregando) return
    setInput("")

    const novasMensagens: Mensagem[] = [...mensagens, { role: "user", content: msg }]
    setMensagens(novasMensagens)
    setCarregando(true)

    try {
      const system = `Você é o Procura+ AI, um assistente especializado na Lei nº 14.133/2021 (Nova Lei de Licitações).
Auxilia servidores públicos na elaboração da fase interna de licitações, revisando documentos,
sugerindo cláusulas e verificando conformidade legal. Responda sempre em português, de forma clara,
objetiva e fundamentada nos artigos da lei.${contexto ? `\n\nContexto atual: ${contexto}` : ""}`

      const mensagensComSistema = [
        { role: "user", content: system + "\n\n" + novasMensagens[0]?.content },
        ...novasMensagens.slice(1),
      ]

      const res = await authFetch(`${API_URL}/api/ia/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensagens: novasMensagens.map(m => ({ role: m.role, content: m.content })),
          tipoDocumento: "assistente_fase_interna",
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const resposta = data.resposta || data.sucesso && data.resposta || "Não foi possível obter resposta."
        setMensagens([...novasMensagens, { role: "assistant", content: resposta }])
      } else {
        setMensagens([...novasMensagens, { role: "assistant", content: "Erro ao conectar com a IA. Tente novamente." }])
      }
    } catch {
      setMensagens([...novasMensagens, { role: "assistant", content: "Erro de conexão. Verifique sua conexão e tente novamente." }])
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#1351b4] text-white shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="font-semibold text-sm">Procura+ AI</div>
            <div className="text-xs text-white/70">Especialista Lei 14.133/2021</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimizado(!minimizado)}
            className="w-7 h-7 rounded flex items-center justify-center hover:bg-white/15"
          >
            {minimizado ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="w-7 h-7 rounded flex items-center justify-center hover:bg-white/15"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {!minimizado && (
        <>
          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
            {mensagens.length === 0 ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full bg-[#ecf3fc] flex items-center justify-center mx-auto mb-3">
                  <Bot className="w-6 h-6 text-[#1351b4]" />
                </div>
                <p className="text-sm font-medium text-gray-700">Olá! Sou o Procura+ AI</p>
                <p className="text-xs text-gray-500 mt-1">
                  Especialista em fase interna de licitações conforme a Lei 14.133/2021.
                </p>
                <div className="mt-4 space-y-2">
                  {SUGESTOES_RAPIDAS.map((s) => (
                    <button
                      key={s}
                      onClick={() => enviar(s)}
                      className="w-full text-left text-xs px-3 py-2 rounded-lg border border-[#c5d4eb] bg-[#f6f9fd] hover:bg-[#ecf3fc] text-[#1351b4] transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              mensagens.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-6 h-6 rounded-full bg-[#1351b4] flex items-center justify-center mr-2 mt-1 shrink-0">
                      <Sparkles className="w-3 h-3 text-white" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      msg.role === "user"
                        ? "bg-[#1351b4] text-white rounded-tr-sm"
                        : "bg-[#f6f9fd] text-gray-800 rounded-tl-sm border border-[#dbe8fb]"
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              ))
            )}
            {carregando && (
              <div className="flex justify-start">
                <div className="w-6 h-6 rounded-full bg-[#1351b4] flex items-center justify-center mr-2 mt-1 shrink-0">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
                <div className="bg-[#f6f9fd] border border-[#dbe8fb] rounded-2xl rounded-tl-sm px-3 py-2">
                  <div className="flex gap-1 items-center h-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1351b4] animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1351b4] animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1351b4] animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-100 shrink-0">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && enviar()}
                placeholder="Pergunte sobre a Lei 14.133/2021…"
                className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-[#1351b4] focus:ring-1 focus:ring-[#1351b4] bg-gray-50"
              />
              <Button
                size="icon"
                onClick={() => enviar()}
                disabled={!input.trim() || carregando}
                className="rounded-xl bg-[#1351b4] hover:bg-[#0c326f] shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

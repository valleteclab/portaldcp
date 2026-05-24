"use client"

import { useState, useRef, useEffect } from 'react'
import {
  Sparkles,
  Send,
  Bot,
  PlusSquare,
  CheckCircle,
  XCircle,
  AlertCircle,
  Database,
  RefreshCw,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { API_URL, authFetch } from '@/lib/api'
import type { SecaoTemplate } from '@/lib/fase-interna/secoes-template'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Mensagem {
  role: 'user' | 'assistant'
  content: string
}

interface ItemChecklist {
  secao: string
  label: string
  valido: boolean
  mensagem?: string
}

interface DadosProcesso {
  objeto?: string
  modalidade?: string
  valor_estimado?: number
  criterio_julgamento?: string
  numero_processo?: string
  natureza_objeto?: string
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PainelIAProps {
  /** Tipo do documento (DFD, ETP, TR, etc.) */
  tipoDocumento: string
  /** ID da licitação (para análise de conformidade) */
  licitacaoId: string
  /** ID do documento (para chamada do /validar) */
  documentoId?: string
  /** Dados atuais das seções para contexto da IA */
  secoes: SecaoTemplate[]
  conteudoSecoes: Record<string, string>
  /** Dados do processo para aba Dados */
  dadosProcesso?: DadosProcesso
  /** Callback para inserir texto em uma seção específica */
  onInserirNaSecao: (secaoId: string, html: string) => void
}

// ─── Sugestões rápidas por tipo ───────────────────────────────────────────────

const SUGESTOES_RAPIDAS: Record<string, string[]> = {
  DFD: [
    'Verificar conformidade com o Art. 18, I',
    'Sugerir justificativa da necessidade',
    'Revisar quantitativo estimado',
    'Melhorar linguagem administrativa',
  ],
  ETP: [
    'Verificar Art. 18, §1º (incisos I–XIII)',
    'Completar levantamento de mercado',
    'Sugerir análise de alternativas técnicas',
    'Revisar estimativa de valor referencial',
  ],
  TR: [
    'Verificar alíneas a–j do Art. 6º, XXIII',
    'Melhorar descrição da solução',
    'Sugerir critérios de habilitação técnica',
    'Revisar modelo de execução do objeto',
  ],
  PJ: [
    'Verificar artigos aplicáveis ao processo',
    'Verificar regularidade da fase interna',
    'Sugerir condicionantes ao parecer',
    'Revisar fundamentação jurídica',
  ],
  AA: [
    'Elaborar autorização da autoridade competente',
    'Verificar condições para abertura',
    'Sugerir texto formal de autorização',
  ],
  ME: [
    'Verificar conformidade com Art. 25',
    'Revisar critérios de habilitação do edital',
    'Sugerir condições de participação',
  ],
  DEFAULT: [
    'Revisar conformidade com a Lei 14.133/2021',
    'Quais documentos são obrigatórios nesta etapa?',
    'Gerar rascunho de justificativa',
    'Verificar artigos aplicáveis',
  ],
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2 text-xs font-medium transition-colors ${
        active
          ? 'text-[#1351b4] border-b-2 border-[#1351b4]'
          : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

// ─── Aba Chat ─────────────────────────────────────────────────────────────────

function AbaChat({
  tipoDocumento,
  secoes,
  conteudoSecoes,
  onInserirNaSecao,
}: {
  tipoDocumento: string
  secoes: SecaoTemplate[]
  conteudoSecoes: Record<string, string>
  onInserirNaSecao: (secaoId: string, html: string) => void
}) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [input, setInput] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [ultimaResposta, setUltimaResposta] = useState<string | null>(null)
  const [secaoAlvo, setSecaoAlvo] = useState<string>(secoes[0]?.id || '')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  const getSugestoes = () => {
    const key = tipoDocumento.toUpperCase() as keyof typeof SUGESTOES_RAPIDAS
    return SUGESTOES_RAPIDAS[key] || SUGESTOES_RAPIDAS.DEFAULT
  }

  const enviar = async (texto?: string) => {
    const msg = texto || input.trim()
    if (!msg || carregando) return
    setInput('')
    setUltimaResposta(null)

    const novasMensagens: Mensagem[] = [...mensagens, { role: 'user', content: msg }]
    setMensagens(novasMensagens)
    setCarregando(true)

    try {
      // Conteúdo atual da seção alvo como contexto
      const conteudoAtual = secaoAlvo ? conteudoSecoes[secaoAlvo] : ''
      const secaoInfo = secoes.find((s) => s.id === secaoAlvo)

      const system = `Você é o Procura+ AI, especialista na Lei nº 14.133/2021 (Nova Lei de Licitações).
Auxilia servidores públicos na elaboração da fase interna de licitações, revisando documentos,
sugerindo cláusulas e verificando conformidade legal. Responda em português, de forma clara,
objetiva e fundamentada nos artigos da lei. Quando sugerir textos para inserção no documento,
escreva o texto diretamente sem introduções como "Aqui está o texto:".
Tipo de documento: ${tipoDocumento}
${secaoInfo ? `Seção atual: ${secaoInfo.titulo} (${secaoInfo.fundamentoLegal})` : ''}
${conteudoAtual ? `Conteúdo atual da seção:\n${conteudoAtual.replace(/<[^>]+>/g, ' ')}` : ''}`

      const res = await authFetch(`${API_URL}/api/ia/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensagens: [
            { role: 'user', content: system + '\n\n' + novasMensagens[0]?.content },
            ...novasMensagens
              .slice(1)
              .map((m) => ({ role: m.role, content: m.content })),
          ],
          tipoDocumento: tipoDocumento || 'assistente_fase_interna',
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const resposta =
          data.resposta || 'Não foi possível obter resposta.'
        setMensagens([...novasMensagens, { role: 'assistant', content: resposta }])
        setUltimaResposta(resposta)
      } else {
        setMensagens([
          ...novasMensagens,
          { role: 'assistant', content: 'Erro ao conectar com a IA. Tente novamente.' },
        ])
      }
    } catch {
      setMensagens([
        ...novasMensagens,
        { role: 'assistant', content: 'Erro de conexão. Verifique sua conexão e tente novamente.' },
      ])
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Seletor de seção alvo */}
      {secoes.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 shrink-0">
          <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
            Seção alvo para inserção
          </label>
          <div className="relative">
            <select
              value={secaoAlvo}
              onChange={(e) => setSecaoAlvo(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white pr-6 appearance-none focus:border-[#1351b4] focus:outline-none"
            >
              {secoes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.titulo}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>
      )}

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {mensagens.length === 0 ? (
          <div className="text-center py-4">
            <div className="w-10 h-10 rounded-full bg-[#ecf3fc] flex items-center justify-center mx-auto mb-3">
              <Bot className="w-5 h-5 text-[#1351b4]" />
            </div>
            <p className="text-xs font-medium text-gray-700">Procura+ AI</p>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Especialista em Lei 14.133/2021
            </p>
            <div className="mt-3 space-y-1.5">
              {getSugestoes().map((s) => (
                <button
                  key={s}
                  onClick={() => enviar(s)}
                  className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg border border-[#c5d4eb] bg-[#f6f9fd] hover:bg-[#ecf3fc] text-[#1351b4] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          mensagens.map((msg, i) => {
            const isLast = i === mensagens.length - 1
            const isAssistant = msg.role === 'assistant'
            return (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {isAssistant && (
                  <div className="w-5 h-5 rounded-full bg-[#1351b4] flex items-center justify-center mr-1.5 mt-1 shrink-0">
                    <Sparkles className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
                <div className="max-w-[92%] space-y-1.5">
                  <div
                    className={`rounded-xl px-2.5 py-2 text-xs ${
                      msg.role === 'user'
                        ? 'bg-[#1351b4] text-white rounded-tr-sm'
                        : 'bg-[#f6f9fd] text-gray-800 rounded-tl-sm border border-[#dbe8fb]'
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                  {isAssistant && isLast && ultimaResposta === msg.content && (
                    <button
                      onClick={() => {
                        if (secaoAlvo) {
                          onInserirNaSecao(secaoAlvo, msg.content)
                        }
                        setUltimaResposta(null)
                      }}
                      className="flex items-center gap-1 text-xs text-[#1351b4] hover:text-[#0c326f] font-medium transition-colors ml-1"
                    >
                      <PlusSquare className="w-3 h-3" />
                      Inserir na seção
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}

        {carregando && (
          <div className="flex justify-start">
            <div className="w-5 h-5 rounded-full bg-[#1351b4] flex items-center justify-center mr-1.5 mt-1 shrink-0">
              <Sparkles className="w-2.5 h-2.5 text-white" />
            </div>
            <div className="bg-[#f6f9fd] border border-[#dbe8fb] rounded-xl rounded-tl-sm px-3 py-2">
              <div className="flex gap-1 items-center h-3">
                <span className="w-1 h-1 rounded-full bg-[#1351b4] animate-bounce [animation-delay:0ms]" />
                <span className="w-1 h-1 rounded-full bg-[#1351b4] animate-bounce [animation-delay:150ms]" />
                <span className="w-1 h-1 rounded-full bg-[#1351b4] animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-100 shrink-0">
        <div className="flex gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && enviar()}
            placeholder="Pergunte sobre a Lei 14.133/2021…"
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#1351b4] focus:ring-1 focus:ring-[#1351b4] bg-gray-50"
          />
          <Button
            size="icon"
            onClick={() => enviar()}
            disabled={!input.trim() || carregando}
            className="rounded-lg bg-[#1351b4] hover:bg-[#0c326f] shrink-0 w-8 h-8"
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Aba Análise ──────────────────────────────────────────────────────────────

function AbaAnalise({
  secoes,
  conteudoSecoes,
}: {
  secoes: SecaoTemplate[]
  conteudoSecoes: Record<string, string>
}) {
  const [analisando, setAnalisando] = useState(false)
  const [checklist, setChecklist] = useState<ItemChecklist[] | null>(null)

  const analisar = () => {
    setAnalisando(true)

    // Análise local: verificar quais seções obrigatórias estão vazias
    setTimeout(() => {
      const items: ItemChecklist[] = secoes.map((s) => {
        const conteudo = conteudoSecoes[s.id] || ''
        const hasContent = conteudo.replace(/<[^>]+>/g, '').trim().length > 20

        if (s.obrigatorio && !hasContent) {
          return {
            secao: s.id,
            label: s.titulo.replace(/\s*\*$/, ''),
            valido: false,
            mensagem: `Seção obrigatória (${s.fundamentoLegal}) está vazia ou muito curta.`,
          }
        }
        return {
          secao: s.id,
          label: s.titulo.replace(/\s*\*$/, ''),
          valido: hasContent,
          mensagem: hasContent ? undefined : `Seção não preenchida (${s.fundamentoLegal}).`,
        }
      })
      setChecklist(items)
      setAnalisando(false)
    }, 600)
  }

  const total = checklist?.length || 0
  const validos = checklist?.filter((i) => i.valido).length || 0
  const pct = total > 0 ? Math.round((validos / total) * 100) : 0

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-100 shrink-0">
        <Button
          size="sm"
          onClick={analisar}
          disabled={analisando}
          className="w-full text-xs h-8 bg-[#1351b4] hover:bg-[#0c326f]"
        >
          {analisando ? (
            <>
              <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" /> Analisando…
            </>
          ) : (
            <>
              <CheckCircle className="w-3 h-3 mr-1.5" /> Analisar conformidade
            </>
          )}
        </Button>

        {checklist && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-600 font-medium">Completude</span>
              <span
                className={`font-bold ${
                  pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-amber-500' : 'text-red-500'
                }`}
              >
                {pct}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              {validos}/{total} seções preenchidas
            </p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-0">
        {!checklist && (
          <div className="text-center py-8">
            <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-gray-400">
              Clique em "Analisar conformidade" para verificar o preenchimento das seções.
            </p>
          </div>
        )}

        {checklist?.map((item) => (
          <div
            key={item.secao}
            className={`flex items-start gap-2 p-2 rounded-lg text-xs ${
              item.valido ? 'bg-green-50' : 'bg-red-50'
            }`}
          >
            {item.valido ? (
              <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <p
                className={`font-medium leading-tight ${
                  item.valido ? 'text-green-700' : 'text-red-600'
                }`}
              >
                {item.label}
              </p>
              {item.mensagem && (
                <p className="text-gray-500 mt-0.5 leading-tight">{item.mensagem}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Aba Dados ────────────────────────────────────────────────────────────────

function AbaDados({
  dadosProcesso,
  secoes,
  onInserirNaSecao,
}: {
  dadosProcesso?: DadosProcesso
  secoes: SecaoTemplate[]
  onInserirNaSecao: (secaoId: string, html: string) => void
}) {
  const [secaoAlvo, setSecaoAlvo] = useState<string>(secoes[0]?.id || '')

  const formatarValor = (v?: number) => {
    if (!v) return '—'
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  const cartoes = [
    { label: 'Objeto', value: dadosProcesso?.objeto, icon: '📋' },
    { label: 'Modalidade', value: dadosProcesso?.modalidade, icon: '⚖️' },
    { label: 'Critério de julgamento', value: dadosProcesso?.criterio_julgamento, icon: '🏆' },
    { label: 'Valor estimado', value: formatarValor(dadosProcesso?.valor_estimado), icon: '💰' },
    { label: 'Nº do processo', value: dadosProcesso?.numero_processo, icon: '🔢' },
    { label: 'Natureza do objeto', value: dadosProcesso?.natureza_objeto, icon: '📦' },
  ].filter((c) => c.value && c.value !== '—')

  return (
    <div className="flex flex-col h-full">
      {secoes.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 shrink-0">
          <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
            Inserir em
          </label>
          <div className="relative">
            <select
              value={secaoAlvo}
              onChange={(e) => setSecaoAlvo(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white pr-6 appearance-none focus:border-[#1351b4] focus:outline-none"
            >
              {secoes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.titulo}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {cartoes.length === 0 ? (
          <div className="text-center py-8">
            <Database className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-gray-400">Dados do processo não disponíveis.</p>
          </div>
        ) : (
          cartoes.map((c) => (
            <div
              key={c.label}
              className="bg-white rounded-lg border border-gray-200 p-2.5 flex items-start justify-between gap-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{c.icon}</span>
                  <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                    {c.label}
                  </span>
                </div>
                <p className="text-xs text-gray-800 mt-0.5 leading-snug">{c.value}</p>
              </div>
              <button
                type="button"
                title="Inserir na seção"
                onClick={() => onInserirNaSecao(secaoAlvo, `<p>${c.value}</p>`)}
                className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md bg-[#ecf3fc] text-[#1351b4] hover:bg-[#1351b4] hover:text-white transition-colors"
              >
                <PlusSquare className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function PainelIA({
  tipoDocumento,
  secoes,
  conteudoSecoes,
  dadosProcesso,
  onInserirNaSecao,
}: PainelIAProps) {
  const [abaAtiva, setAbaAtiva] = useState<'chat' | 'analise' | 'dados'>('chat')

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-[#1351b4] text-white shrink-0">
        <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5" />
        </div>
        <div>
          <div className="font-semibold text-sm">Procura+ AI</div>
          <div className="text-[10px] text-white/70">Lei 14.133/2021</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 shrink-0">
        <TabBtn active={abaAtiva === 'chat'} onClick={() => setAbaAtiva('chat')}>
          💬 Chat
        </TabBtn>
        <TabBtn active={abaAtiva === 'analise'} onClick={() => setAbaAtiva('analise')}>
          ✓ Análise
        </TabBtn>
        <TabBtn active={abaAtiva === 'dados'} onClick={() => setAbaAtiva('dados')}>
          📋 Dados
        </TabBtn>
      </div>

      {/* Conteúdo das abas */}
      <div className="flex-1 overflow-hidden">
        {abaAtiva === 'chat' && (
          <AbaChat
            tipoDocumento={tipoDocumento}
            secoes={secoes}
            conteudoSecoes={conteudoSecoes}
            onInserirNaSecao={onInserirNaSecao}
          />
        )}
        {abaAtiva === 'analise' && (
          <AbaAnalise secoes={secoes} conteudoSecoes={conteudoSecoes} />
        )}
        {abaAtiva === 'dados' && (
          <AbaDados
            dadosProcesso={dadosProcesso}
            secoes={secoes}
            onInserirNaSecao={onInserirNaSecao}
          />
        )}
      </div>
    </div>
  )
}

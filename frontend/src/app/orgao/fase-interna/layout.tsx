"use client"

import { useState, useSyncExternalStore } from "react"
import { Sparkles } from "lucide-react"
import { FaseInternaNav } from "@/components/fase-interna/FaseInternaNav"
import { CopilotoIA } from "@/components/fase-interna/CopilotoIA"
import { usePathname } from "next/navigation"

/**
 * Preferência do painel Procura+ AI (por navegador). Homologação 26/09/2026:
 * o painel abria sozinho e cobria os cartões de "Minhas tarefas" — agora começa
 * FECHADO e só abre quando o usuário pede (e fica aberto se ele deixou aberto).
 */
const CHAVE_COPILOTO = "fase-interna:procura-ai-aberto"

function lerPreferencia(): boolean {
  try {
    return localStorage.getItem(CHAVE_COPILOTO) === "1"
  } catch {
    return false
  }
}

function gravarPreferencia(aberto: boolean) {
  try {
    localStorage.setItem(CHAVE_COPILOTO, aberto ? "1" : "0")
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}

const semAssinatura = () => () => {}

export default function FaseInternaLayout({ children }: { children: React.ReactNode }) {
  // Preferência gravada (no servidor: fechado) e a escolha feita nesta visita
  const preferenciaGravada = useSyncExternalStore(semAssinatura, lerPreferencia, () => false)
  const [escolha, setEscolha] = useState<boolean | null>(null)
  const copilotoAberto = escolha ?? preferenciaGravada
  const pathname = usePathname()

  const alternarCopiloto = (aberto: boolean) => {
    setEscolha(aberto)
    gravarPreferencia(aberto)
  }

  // Telas com assistente de IA EMBUTIDA (ex.: editor de documentos tem o
  // Procura+ AI próprio, com contexto do documento) — não duplicar o chat.
  const temAssistentePropria = pathname.includes("/editor")

  const contexto = (() => {
    if (pathname.includes("/editor")) return "Usuário está editando um documento da fase interna."
    if (pathname.includes("/riscos")) return "Usuário está no Mapa de Riscos."
    if (pathname.includes("/precos")) return "Usuário está na Pesquisa de Preços (Art. 23 + IN 65/2021)."
    if (pathname.includes("/aprovacoes")) return "Usuário está no fluxo de aprovações."
    if (pathname.includes("/processos")) return "Usuário está vendo processos da fase interna."
    return "Usuário está no painel de fase interna de licitações (Lei 14.133/2021)."
  })()

  return (
    <div className="flex h-[calc(100vh-64px)] -m-6 overflow-hidden">
      {/* Sidebar fase-interna */}
      <FaseInternaNav />

      {/* Conteúdo principal */}
      <main className="flex-1 min-w-0 overflow-y-auto bg-slate-50">
        {children}
      </main>

      {/* Copiloto IA (oculto onde a tela já tem o assistente embutido). Aberto,
          ocupa uma coluna própria (não sobrepõe o conteúdo); fechado, vira uma
          aba na borda direita — longe do botão do assistente geral (canto inferior). */}
      {!temAssistentePropria && (copilotoAberto ? (
        <div className="w-80 shrink-0 flex flex-col overflow-hidden">
          <CopilotoIA contexto={contexto} onClose={() => alternarCopiloto(false)} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => alternarCopiloto(true)}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-40 flex items-center gap-1.5 rounded-l-lg bg-[#1351b4] hover:bg-[#0c326f] text-white px-2 py-3 shadow-lg [writing-mode:vertical-rl] text-xs font-semibold"
          title="Abrir Procura+ AI"
          aria-label="Abrir o assistente Procura+ AI"
        >
          <Sparkles className="w-4 h-4" aria-hidden="true" /> Procura+ AI
        </button>
      ))}
    </div>
  )
}

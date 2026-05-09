"use client"

import { useState } from "react"
import { Sparkles, X } from "lucide-react"
import { FaseInternaNav } from "@/components/fase-interna/FaseInternaNav"
import { CopilotoIA } from "@/components/fase-interna/CopilotoIA"
import { usePathname } from "next/navigation"

export default function FaseInternaLayout({ children }: { children: React.ReactNode }) {
  const [copilotoAberto, setCopilotoAberto] = useState(true)
  const pathname = usePathname()

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
      <main className="flex-1 overflow-y-auto bg-slate-50">
        {children}
      </main>

      {/* Copiloto IA */}
      {copilotoAberto ? (
        <div className="w-80 shrink-0 flex flex-col overflow-hidden">
          <CopilotoIA contexto={contexto} onClose={() => setCopilotoAberto(false)} />
        </div>
      ) : (
        <button
          onClick={() => setCopilotoAberto(true)}
          className="fixed bottom-6 right-6 w-12 h-12 bg-[#1351b4] hover:bg-[#0c326f] text-white rounded-full shadow-lg flex items-center justify-center transition-colors z-50"
          title="Abrir Procura+ AI"
        >
          <Sparkles className="w-5 h-5" />
        </button>
      )}
    </div>
  )
}

"use client"

import { Sidebar, Header } from "@/components/layout/navigation"
import { AuthGuard } from "@/components/auth/auth-guard"
import { AssistenteIA } from "@/components/assistente-ia/AssistenteIA"
import { MedicoesBriefingModal } from "@/components/MedicoesBriefingModal"

export default function OrgaoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGuard userType="orgao">
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar userType="orgao" />
        {/* min-w-0: conteúdo largo (barra de etapas, tabelas) rola DENTRO do quadro, sem esticar a página (homologação 26/09/2026: rolagem horizontal na tela do processo) */}
        <div className="flex-1 flex flex-col min-w-0">
          <Header />
          <main className="flex-1 p-3 sm:p-6">
            <div className="max-w-[1920px] mx-auto w-full px-0 sm:px-4">
              {children}
            </div>
          </main>
        </div>
      </div>
      <AssistenteIA />
      <MedicoesBriefingModal />
    </AuthGuard>
  )
}

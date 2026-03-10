"use client"

import { Sidebar, Header } from "@/components/layout/navigation"
import { AuthGuard } from "@/components/auth/auth-guard"
import { Toaster } from "sonner"
import { AssistenteIA } from "@/components/assistente-ia/AssistenteIA"

export default function OrgaoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGuard userType="orgao">
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar userType="orgao" />
        <div className="flex-1 flex flex-col">
          <Header />
          <main className="flex-1 p-6">
            <div className="max-w-[1920px] mx-auto w-full px-4">
              {children}
            </div>
          </main>
        </div>
      </div>
      <Toaster />
      <AssistenteIA />
    </AuthGuard>
  )
}

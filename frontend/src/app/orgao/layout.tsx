"use client"

import { Sidebar, Header } from "@/components/layout/navigation"
import { AuthGuard } from "@/components/auth/auth-guard"

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
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  )
}

"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

function ErroContent() {
  const searchParams = useSearchParams()
  const motivo = searchParams.get("motivo") || "Erro desconhecido"

  const mensagens: Record<string, string> = {
    bloqueado: "Sua conta foi bloqueada. Entre em contato com o administrador.",
    "Token nao recebido": "Token de autenticação não recebido.",
    "Token invalido": "Token de autenticação inválido.",
    "Tipo de usuario invalido": "Tipo de usuário inválido para este acesso.",
  }

  const mensagem = mensagens[motivo] || decodeURIComponent(motivo)

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-red-50 flex items-center justify-center px-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center">
          <XCircle className="h-16 w-16 text-red-500 mx-auto mb-2" />
          <CardTitle className="text-2xl text-red-700">Acesso Negado</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-slate-600">{mensagem}</p>
          <Button asChild className="w-full">
            <Link href="/orgao-login">Voltar para o Login</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default function AuthErroPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-10 w-10 border-4 border-red-500 border-t-transparent rounded-full"></div></div>}>
      <ErroContent />
    </Suspense>
  )
}

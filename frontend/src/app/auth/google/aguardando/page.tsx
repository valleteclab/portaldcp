"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Clock, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/$/, '')

function AguardandoContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get("email") || ""
  const [status, setStatus] = useState<string>("PENDENTE")
  const [verificando, setVerificando] = useState(false)

  const verificarStatus = async () => {
    if (!email) return
    setVerificando(true)
    try {
      const res = await fetch(`${API_URL}/api/auth/google/verificar-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      setStatus(data.status)

      if (data.status === "ATIVO") {
        window.location.href = `${API_URL}/api/auth/google`
      }
    } catch {
      // silently fail
    } finally {
      setVerificando(false)
    }
  }

  useEffect(() => {
    const interval = setInterval(verificarStatus, 30000)
    return () => clearInterval(interval)
  }, [email])

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-white to-yellow-50 flex items-center justify-center px-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center">
          <Clock className="h-16 w-16 text-yellow-500 mx-auto mb-2" />
          <CardTitle className="text-2xl">Aguardando Aprovação</CardTitle>
          <CardDescription>
            Sua solicitação foi enviada ao administrador do sistema
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {email && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-center">
              <p className="text-slate-600">Conta Google utilizada:</p>
              <p className="font-medium text-slate-800">{email}</p>
            </div>
          )}

          <div className="space-y-2 text-sm text-slate-600">
            <p className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-yellow-100 text-yellow-700 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</span>
              Seu cadastro foi enviado para análise
            </p>
            <p className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-yellow-100 text-yellow-700 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</span>
              O administrador receberá uma notificação
            </p>
            <p className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-yellow-100 text-yellow-700 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">3</span>
              Após aprovação, tente fazer login novamente com Google
            </p>
          </div>

          {status === "BLOQUEADO" && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm text-center">
              Sua solicitação foi recusada pelo administrador.
            </div>
          )}

          <Button
            variant="outline"
            className="w-full"
            onClick={verificarStatus}
            disabled={verificando}
          >
            {verificando ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Verificando...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Verificar status
              </>
            )}
          </Button>

          <Button asChild variant="ghost" className="w-full">
            <Link href="/orgao-login">Voltar para o login</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default function AguardandoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-10 w-10 border-4 border-yellow-500 border-t-transparent rounded-full"></div></div>}>
      <AguardandoContent />
    </Suspense>
  )
}

"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"

function CallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const token = searchParams.get("token")
    if (!token) {
      router.push("/auth/erro?motivo=Token+nao+recebido")
      return
    }

    try {
      const payload = JSON.parse(atob(token.split(".")[1]))
      localStorage.setItem("access_token", token)

      if (payload.type === "USUARIO") {
        localStorage.setItem("orgaoId", payload.orgaoId || "")
        router.push("/orgao")
      } else {
        router.push("/auth/erro?motivo=Tipo+de+usuario+invalido")
      }
    } catch {
      router.push("/auth/erro?motivo=Token+invalido")
    }
  }, [router, searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-slate-600">Processando login...</p>
      </div>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  )
}

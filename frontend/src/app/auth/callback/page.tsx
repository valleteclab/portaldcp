"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/$/, '')

function CallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const token = searchParams.get("token")
    if (!token) {
      router.push("/auth/erro?motivo=Token+nao+recebido")
      return
    }

    const processToken = async () => {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]))

        if (payload.type !== "USUARIO") {
          router.push("/auth/erro?motivo=Tipo+de+usuario+invalido")
          return
        }

        // Salva tokens
        localStorage.setItem("access_token", token)
        localStorage.setItem("orgao_token", token)

        // Busca dados completos do usuário
        const res = await fetch(`${API_URL}/api/usuarios/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (res.ok) {
          const usuario = await res.json()
          localStorage.setItem("usuario", JSON.stringify(usuario))
          if (usuario.orgao) {
            localStorage.setItem("orgao", JSON.stringify(usuario.orgao))
          } else if (payload.orgaoId) {
            localStorage.setItem("orgao", JSON.stringify({ id: payload.orgaoId }))
          }
        } else {
          // Fallback: salva dados mínimos do payload
          const usuarioMinimo = { id: payload.sub, email: payload.email, role: payload.role, orgao_id: payload.orgaoId }
          localStorage.setItem("usuario", JSON.stringify(usuarioMinimo))
          localStorage.setItem("orgao", JSON.stringify({ id: payload.orgaoId }))
        }

        router.push("/orgao")
      } catch {
        router.push("/auth/erro?motivo=Token+invalido")
      }
    }

    processToken()
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

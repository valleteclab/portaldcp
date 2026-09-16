"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Loader2, Building2 } from "lucide-react"
import { hasValidSession, logout } from "@/lib/api"

interface AuthGuardProps {
  children: React.ReactNode
  userType: 'fornecedor' | 'orgao'
}

export function AuthGuard({ children, userType }: AuthGuardProps) {
  const router = useRouter()
  const pathname = usePathname()
  // IMPORTANTE: Começa como false para não renderizar conteúdo protegido
  const [isReady, setIsReady] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    // Páginas de login e cadastro não precisam de autenticação
    if (pathname.includes('/login') || pathname.includes('/cadastro') || pathname === '/') {
      setIsAuthenticated(true)
      setIsReady(true)
      return
    }

    const storageKey = userType === 'fornecedor' ? 'fornecedor' : 'orgao'
    const userData = localStorage.getItem(storageKey)
    const loginPath = userType === 'fornecedor' ? '/login' : '/orgao-login'

    if (!userData) {
      // Não está logado, redireciona para login
      router.replace(loginPath)
      // NÃO seta isReady para true - mantém na tela de loading
      return
    }

    // O objeto do usuário no localStorage não expira: sozinho, ele mantinha a
    // pessoa "logada" indefinidamente. Com o token vencido, o sistema abria
    // normalmente e todas as telas vinham vazias (cada requisição dava 401),
    // dando a impressão de que os contratos haviam sumido. A sessão agora vale
    // pelo token.
    if (!hasValidSession()) {
      logout()
      router.replace(`${loginPath}?sessao=expirada`)
      return
    }

    try {
      const parsed = JSON.parse(userData)
      if (parsed && (parsed.id || parsed.email)) {
        setIsAuthenticated(true)
        setIsReady(true)
      } else {
        throw new Error('Dados inválidos')
      }
    } catch (e) {
      localStorage.removeItem(storageKey)
      router.replace(loginPath)
    }
  }, [pathname, router, userType])

  // Enquanto não estiver pronto, mostra APENAS loading simples
  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50">
        <div className="text-center">
          <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
            <Building2 className="h-8 w-8 text-blue-600" />
          </div>
          <Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" />
          <p className="mt-3 text-slate-600 text-sm">Carregando...</p>
        </div>
      </div>
    )
  }

  // Só renderiza o conteúdo se estiver autenticado
  if (!isAuthenticated) {
    return null
  }

  return <>{children}</>
}

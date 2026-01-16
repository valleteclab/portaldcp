"use client"

import { useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { API_URL, authFetch } from '@/lib/api'

/**
 * Redirect para a versão completa da sala de disputa v2
 */
export default function SalaDisputaRedirect({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()

  useEffect(() => {
    const prepararSessao = async () => {
      let sessaoId = ''
      try {
        // Buscar a sessão correspondente à licitação
        const res = await authFetch(`${API_URL}/api/sessao/licitacao/${resolvedParams.id}`)
        if (res.ok) {
          const sessao = await res.json()
          sessaoId = sessao.id
        }
      } catch (error) {
        console.error('Erro ao buscar sessão:', error)
      }
      // Redirecionar para a nova sala de disputa v2
      if (sessaoId) {
        router.replace(`/fornecedor/disputa?sessao=${sessaoId}`)
      } else {
        router.replace(`/fornecedor/disputa?licitacao=${resolvedParams.id}`)
      }
    }
    prepararSessao()
  }, [resolvedParams.id, router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Redirecionando para a sala de disputa...</p>
      </div>
    </div>
  )
}

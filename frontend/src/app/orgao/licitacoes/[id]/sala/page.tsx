"use client"

import { use, useEffect } from "react"
import { useRouter } from "next/navigation"
import { API_URL, authFetch } from '@/lib/api'

// Esta página redireciona para a V3 da sala de disputa do pregoeiro.
// A V2 permanece disponível como fallback operacional dentro da própria V3.

export default function SalaDisputaPage({ params }: { params: Promise<{ id: string }> }) {
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
          // Salvar o ID da sessão (não da licitação)
          if (typeof window !== 'undefined' && sessao.id) {
            localStorage.setItem('sessao_disputa_selecionada', sessao.id)
          }
        }
      } catch (error) {
        console.error('Erro ao buscar sessão:', error)
      }
      // Redirecionar para a nova sala de disputa V3
      if (sessaoId) {
        router.replace(`/orgao/disputa-v3?sessao=${sessaoId}`)
      } else {
        router.replace(`/orgao/disputa-v3?licitacao=${resolvedParams.id}`)
      }
    }
    
    prepararSessao()
  }, [resolvedParams.id, router])

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-900">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-400">Redirecionando para a sala de disputa...</p>
      </div>
    </div>
  )
}

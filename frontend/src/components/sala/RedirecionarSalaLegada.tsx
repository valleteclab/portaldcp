'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { API_URL, authFetch } from '@/lib/api'

/**
 * Compatibilidade das URLs antigas da sala (`/orgao/disputa-v3?sessao=`,
 * `/fornecedor/disputa-v3?sessao=|?licitacao=`): descobre a licitação da
 * sessão e manda para a sala única do papel (plano E8).
 */
function Redirecionador({ area }: { area: 'orgao' | 'fornecedor' }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [erro, setErro] = useState<string | null>(null)
  const destino = (licitacaoId: string) =>
    area === 'orgao' ? `/orgao/processos/${licitacaoId}/sessao` : `/fornecedor/licitacoes/${licitacaoId}/sessao`

  useEffect(() => {
    const licitacao = searchParams.get('licitacao')
    const sessao = searchParams.get('sessao')
    if (licitacao) {
      router.replace(destino(licitacao))
      return
    }
    if (!sessao) {
      setErro('A sala da sessão é aberta a partir da licitação.')
      return
    }
    authFetch(`${API_URL}/api/sessao/${sessao}`)
      .then(async (res) => {
        const corpo = res.ok ? await res.json() : null
        const licitacaoId = corpo?.licitacao_id || corpo?.licitacao?.id
        if (!licitacaoId) throw new Error('Sessão não encontrada.')
        router.replace(destino(licitacaoId))
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Sessão não encontrada.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  if (erro) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-slate-700">{erro}</p>
        <Link href={area === 'orgao' ? '/orgao/licitacoes' : '/fornecedor/participacoes'} className="text-sm font-medium text-blue-700 hover:underline">
          {area === 'orgao' ? 'Ir para os processos' : 'Ir para minhas participações'}
        </Link>
      </div>
    )
  }
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <p className="text-slate-600">Abrindo a sala da sessão...</p>
    </div>
  )
}

export function RedirecionarSalaLegada({ area }: { area: 'orgao' | 'fornecedor' }) {
  return (
    <Suspense fallback={null}>
      <Redirecionador area={area} />
    </Suspense>
  )
}

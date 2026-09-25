'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

/** Endereço antigo "Utilizar" → aba "Contratar" do detalhe da ata (consumo com saldo e instrumento). */
export default function UtilizarAtaRedirect() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  useEffect(() => {
    router.replace(`/orgao/atas/${id}?aba=contratar`)
  }, [id, router])
  return <div className="p-8 text-center text-gray-500">Abrindo a ata…</div>
}

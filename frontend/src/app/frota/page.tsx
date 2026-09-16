'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Fuel, Link as LinkIcon } from 'lucide-react'

/**
 * Raiz do app instalado (start_url de segurança). Se este aparelho já abriu
 * um painel de posto ou link de vereador, vai direto para ele.
 */
export default function FrotaIndexPage() {
  const router = useRouter()
  const [semRota, setSemRota] = useState(false)

  useEffect(() => {
    let ultima: string | null = null
    try { ultima = localStorage.getItem('frota_ultima_rota') } catch { /* privado */ }
    if (ultima && /^\/frota\/(posto|vereador)\/[^/]+/.test(ultima)) {
      router.replace(ultima)
    } else {
      setSemRota(true)
    }
  }, [router])

  if (!semRota) return <div className="min-h-screen bg-slate-900" />

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm text-center space-y-5">
        <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto">
          <Fuel className="w-8 h-8 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">DCP Frota</h1>
          <p className="text-slate-400 mt-1 text-sm">Requisições e abastecimentos de combustível</p>
        </div>
        <div className="bg-slate-800 rounded-2xl p-6 space-y-3 text-left">
          <div className="flex items-center gap-2 text-orange-400">
            <LinkIcon className="w-5 h-5 flex-shrink-0" />
            <p className="font-semibold text-white">Abra pelo link que a Câmara enviou</p>
          </div>
          <p className="text-slate-300 text-sm leading-relaxed">
            O posto e cada vereador recebem um link próprio do gestor. Ao abrir o link uma vez neste aparelho, o ícone do app passa a entrar direto nele.
          </p>
          <p className="text-slate-400 text-sm">
            Formatos:<br />
            <span className="font-mono text-orange-300 text-xs break-all">/frota/posto/[código-do-posto]</span><br />
            <span className="font-mono text-orange-300 text-xs break-all">/frota/vereador/[código]</span>
          </p>
        </div>
      </div>
    </div>
  )
}

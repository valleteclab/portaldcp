'use client'

import { useEffect, useState } from 'react'
import { ClipboardList } from 'lucide-react'

/** Raiz do app: reabre a última conferência usada neste aparelho. */
export default function InventarioRaiz() {
  const [semRota, setSemRota] = useState(false)

  useEffect(() => {
    let rota = ''
    try { rota = localStorage.getItem('inventario_ultima_rota') || '' } catch { /* privado */ }
    if (/^\/inventario\/[a-f0-9]{64}$/i.test(rota)) {
      window.location.replace(rota)
    } else {
      setSemRota(true)
    }
  }, [])

  if (!semRota) return null
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6 text-center">
      <div className="max-w-sm">
        <ClipboardList className="w-12 h-12 mx-auto text-amber-400 mb-4" />
        <h1 className="text-xl font-bold mb-2">DCP Inventário</h1>
        <p className="text-slate-400 text-sm">
          Abra o link de conferência que a comissão de inventário enviou pelo WhatsApp. Ele identifica o seu setor.
        </p>
      </div>
    </div>
  )
}

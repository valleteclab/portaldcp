'use client'

import { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'

const LS_ULTIMA_ROTA = 'inventario_ultima_rota'
const LS_DISPENSADO_ATE = 'inventario_instalar_dispensado_ate'
const DIAS_DISPENSA = 7

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

/**
 * Faz a tela de conferência se comportar como app: registra o service
 * worker (escopo /inventario/), aponta o manifest para o link do setor e
 * oferece "Instalar" (Android/desktop) ou a dica do iPhone.
 */
export function InventarioPwa() {
  const [promptInstalar, setPromptInstalar] = useState<PromptEvent | null>(null)
  const [mostrarIos, setMostrarIos] = useState(false)
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const path = window.location.pathname
    const ehTelaDoSetor = /^\/inventario\/[a-f0-9]{64}$/i.test(path)

    if (ehTelaDoSetor) {
      try { localStorage.setItem(LS_ULTIMA_ROTA, path) } catch { /* privado */ }
      const href = `/inventario/manifest.webmanifest?start=${encodeURIComponent(path)}`
      let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
      if (!link) {
        link = document.createElement('link')
        link.rel = 'manifest'
        document.head.appendChild(link)
      }
      link.href = href
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/inventario-sw.js', { scope: '/inventario/' }).catch(() => { /* sem SW, segue normal */ })
    }

    const emAppInstalado =
      window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
    if (emAppInstalado || !ehTelaDoSetor) return

    let dispensadoAte = 0
    try { dispensadoAte = Number(localStorage.getItem(LS_DISPENSADO_ATE) || 0) } catch { /* privado */ }
    if (Date.now() < dispensadoAte) return

    const ehIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
    if (ehIos) {
      setMostrarIos(true)
      setVisivel(true)
      return
    }
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPromptInstalar(e as PromptEvent)
      setVisivel(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const dispensar = () => {
    setVisivel(false)
    try { localStorage.setItem(LS_DISPENSADO_ATE, String(Date.now() + DIAS_DISPENSA * 86400000)) } catch { /* privado */ }
  }

  const instalar = async () => {
    if (!promptInstalar) return
    await promptInstalar.prompt()
    const { outcome } = await promptInstalar.userChoice
    setVisivel(false)
    if (outcome !== 'accepted') dispensar()
  }

  if (!visivel) return null

  return (
    <div className="fixed left-0 right-0 top-0 z-[60] p-3 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-md rounded-2xl bg-slate-800 text-white shadow-xl border border-slate-700 p-3 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shrink-0">
          {mostrarIos ? <Share className="w-5 h-5" /> : <Download className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0 text-sm">
          <p className="font-semibold">Instalar o DCP Inventário</p>
          {mostrarIos ? (
            <p className="text-slate-300 text-xs mt-0.5">
              No Safari, toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>. O ícone abre direto na conferência do seu setor.
            </p>
          ) : (
            <p className="text-slate-300 text-xs mt-0.5">Ícone na tela inicial, abre instantâneo e a câmera fica pronta para ler as plaquetas.</p>
          )}
          {!mostrarIos && (
            <button onClick={instalar} className="mt-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
              Instalar
            </button>
          )}
        </div>
        <button onClick={dispensar} aria-label="Agora não" className="text-slate-400 hover:text-white shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

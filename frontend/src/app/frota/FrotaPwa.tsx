'use client'

import { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'

const LS_ULTIMA_ROTA = 'frota_ultima_rota'
const LS_DISPENSADO_ATE = 'frota_instalar_dispensado_ate'
const DIAS_DISPENSA = 7

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

/**
 * Faz as telas do Frota se comportarem como app:
 * - registra o service worker (escopo /frota/) e aponta o manifest para a
 *   rota atual, para o ícone instalado abrir direto no painel/link certo;
 * - guarda a última rota (a raiz /frota redireciona para ela);
 * - oferece "Instalar" (Android/desktop) ou a dica do iPhone, uma vez por semana.
 */
export function FrotaPwa() {
  const [promptInstalar, setPromptInstalar] = useState<PromptEvent | null>(null)
  const [mostrarIos, setMostrarIos] = useState(false)
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const path = window.location.pathname
    const ehTelaDeAcesso = /^\/frota\/(posto|vereador)\/[^/]+/.test(path)

    if (ehTelaDeAcesso) {
      try { localStorage.setItem(LS_ULTIMA_ROTA, path) } catch { /* privado */ }
      const href = `/frota/manifest.webmanifest?start=${encodeURIComponent(path)}`
      let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
      if (!link) {
        link = document.createElement('link')
        link.rel = 'manifest'
        document.head.appendChild(link)
      }
      link.href = href
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/frota-sw.js', { scope: '/frota/' }).catch(() => { /* sem SW, segue normal */ })
    }

    const emAppInstalado =
      window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
    if (emAppInstalado || !ehTelaDeAcesso) return

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
        <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center shrink-0">
          {mostrarIos ? <Share className="w-5 h-5" /> : <Download className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0 text-sm">
          <p className="font-semibold">Instalar o DCP Frota</p>
          {mostrarIos ? (
            <p className="text-slate-300 text-xs mt-0.5">
              No Safari, toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>. O ícone abre direto nesta tela.
            </p>
          ) : (
            <p className="text-slate-300 text-xs mt-0.5">Ícone na tela inicial, abre instantâneo e funciona com sinal fraco.</p>
          )}
          {!mostrarIos && (
            <button onClick={instalar} className="mt-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
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

"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"

/** O que destacar: o elemento `[data-guia=alvo]` na tela `caminho`. */
export interface PedidoDestaque {
  id: number
  alvo: string | null
  caminho: string
  rotulo: string
  titulo: string
  balao: string
}

interface Achado {
  id: number
  rect: { top: number; left: number; width: number; height: number } | null
  naoAchou: boolean
}

const LARGURA_BALAO = 360
const MARGEM = 16
const TENTATIVAS = 32 // 8 s: telas que carregam dados antes de mostrar o botão

/**
 * Balão do guia na tela certa: escurece o resto, destaca o botão do passo e
 * explica o que fazer. Não bloqueia a tela: o clique no botão destacado (ou
 * em qualquer lugar) funciona normalmente, e clicar no destacado fecha o balão.
 */
export function DestaqueGuia({ pedido, onFechar, onVerRoteiro, onSair }: {
  pedido: PedidoDestaque | null
  onFechar: () => void
  onVerRoteiro: () => void
  onSair: () => void
}) {
  const pathname = usePathname()
  const [achado, setAchado] = useState<Achado | null>(null)
  const naTela = !!pedido && pathname === pedido.caminho

  useEffect(() => {
    if (!pedido || !naTela) return
    const id = pedido.id
    let el: Element | null = null
    let tentativas = 0
    const medir = () => {
      if (!el) return
      const r = el.getBoundingClientRect()
      setAchado({ id, rect: { top: r.top, left: r.left, width: r.width, height: r.height }, naoAchou: false })
    }
    const aoClicar = () => onFechar()
    const busca = window.setInterval(() => {
      tentativas += 1
      el = pedido.alvo ? document.querySelector(`[data-guia="${CSS.escape(pedido.alvo)}"]`) : null
      if (el) {
        window.clearInterval(busca)
        el.scrollIntoView({ block: "center", behavior: "smooth" })
        el.addEventListener("click", aoClicar)
        medir()
        window.setTimeout(medir, 450)
      } else if (tentativas >= TENTATIVAS || !pedido.alvo) {
        window.clearInterval(busca)
        setAchado({ id, rect: null, naoAchou: true })
      }
    }, 250)
    window.addEventListener("scroll", medir, true)
    window.addEventListener("resize", medir)
    return () => {
      window.clearInterval(busca)
      window.removeEventListener("scroll", medir, true)
      window.removeEventListener("resize", medir)
      el?.removeEventListener("click", aoClicar)
    }
  }, [pedido, naTela, onFechar])

  if (!pedido || !naTela) return null
  const atual = achado?.id === pedido.id ? achado : null
  if (!atual) return null

  const balao = (posicao: React.CSSProperties) => (
    <div
      role="dialog"
      aria-labelledby="guia-balao-titulo"
      style={{ position: "fixed", zIndex: 61, width: LARGURA_BALAO, maxWidth: `calc(100vw - ${MARGEM * 2}px)`, ...posicao }}
      className="rounded-xl bg-white p-[18px] shadow-[0_16px_40px_rgba(11,31,58,.3)] flex flex-col gap-2.5"
    >
      <span className="text-xs font-bold uppercase tracking-wide text-[#1351b4]">{pedido.rotulo}</span>
      <h2 id="guia-balao-titulo" className="text-base font-bold text-slate-900">{pedido.titulo}</h2>
      <p className="text-sm leading-relaxed text-slate-700">{pedido.balao}</p>
      {atual.naoAchou && pedido.alvo && (
        <p className="text-xs text-slate-600">O botão deste passo não está visível agora. Role a tela ou confira se a etapa já está disponível para o seu usuário.</p>
      )}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onSair} className="text-[13px] text-slate-600 underline">Sair do guia</button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onVerRoteiro}>Ver roteiro</Button>
          <Button type="button" className="bg-[#1351b4] hover:bg-[#0c3d8a]" onClick={onFechar}>Entendi</Button>
        </div>
      </div>
    </div>
  )

  if (!atual.rect) return balao({ top: 80, right: MARGEM })

  const r = atual.rect
  const folga = 6
  const largura = typeof window !== "undefined" ? window.innerWidth : 1280
  const altura = typeof window !== "undefined" ? window.innerHeight : 800
  const left = Math.min(Math.max(r.left + r.width - LARGURA_BALAO, MARGEM), Math.max(largura - LARGURA_BALAO - MARGEM, MARGEM))
  const cabeAbaixo = r.top + r.height + 260 < altura
  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          zIndex: 60,
          top: r.top - folga,
          left: r.left - folga,
          width: r.width + folga * 2,
          height: r.height + folga * 2,
          borderRadius: 10,
          pointerEvents: "none",
          boxShadow: "0 0 0 4px #fff, 0 0 0 7px #F59E0B, 0 0 0 9999px rgba(11,31,58,.45)",
        }}
      />
      {balao(cabeAbaixo ? { top: r.top + r.height + 18, left } : { bottom: altura - r.top + 18, left })}
    </>
  )
}

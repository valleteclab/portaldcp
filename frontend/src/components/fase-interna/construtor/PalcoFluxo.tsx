"use client"

/**
 * PALCO do construtor de fluxo: o desenho (caixas posicionáveis na grade e
 * setas em SVG), como no protótipo aprovado (referencia-construtor.html).
 *  - arrastar a caixa move; clicar seleciona;
 *  - arrastar da bolinha azul até outra caixa liga as duas;
 *  - soltar um bloco da paleta cria a caixa ali;
 *  - no "Testar", as caixas ativas ficam azuis e as feitas, verdes.
 * O desenho rola dentro do palco (a página não rola na horizontal).
 */
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent as KE, type PointerEvent as PE, type RefObject } from "react"
import {
  ALTURA_NO,
  LARGURA_NO,
  ROTULO_TIPO_NO,
  caminhoDaAresta,
  rotuloDaAresta,
  tamanhoDoDesenho,
  type GrafoFluxo,
  type NoFluxo,
  type Selecao,
  type TipoNo,
} from "@/lib/fluxo/grafo-editor"

/** Tipo de dado do arrastar da paleta. */
export const MIME_PALETA = "application/x-portaldcp-fluxo"

const COR = { seta: "#64748b", devolve: "#d97706", sel: "#2563eb" }

export interface PalcoFluxoProps {
  grafo: GrafoFluxo
  sel: Selecao
  /** Pode mexer no desenho (administrador, modo Desenhar). */
  editavel: boolean
  modo: "desenhar" | "testar"
  ativos?: Set<string>
  feitos?: Set<string>
  comErro?: Set<string>
  exigidaPorLei: (n: NoFluxo) => boolean
  subtitulo: (n: NoFluxo) => string
  onSelecionar: (s: Selecao) => void
  onMover: (id: string, x: number, y: number) => void
  onLigar: (de: string, para: string) => void
  onSoltarBloco: (tipo: TipoNo, x: number, y: number) => void
  /** O elemento que rola (para a paleta achar um lugar visível). */
  palcoRef: RefObject<HTMLDivElement | null>
}

type Arrasto = { id: string; dx: number; dy: number; x0: number; y0: number; moveu: boolean }

export function PalcoFluxo({ grafo, sel, editavel, modo, ativos, feitos, comErro, exigidaPorLei, subtitulo, onSelecionar, onMover, onLigar, onSoltarBloco, palcoRef }: PalcoFluxoProps) {
  const telaRef = useRef<HTMLDivElement>(null)
  const arrasto = useRef<Arrasto | null>(null)
  const [ligando, setLigando] = useState<{ de: string; x: number; y: number } | null>(null)
  const ligandoRef = useRef<{ de: string } | null>(null)
  const acoes = useRef({ onMover, onSelecionar, onLigar })
  useEffect(() => {
    acoes.current = { onMover, onSelecionar, onLigar }
  }, [onMover, onSelecionar, onLigar])

  const noPorId = new Map(grafo.nos.map((n) => [n.id, n]))
  const { largura, altura } = tamanhoDoDesenho(grafo.nos)
  const desenhando = editavel && modo === "desenhar"

  // Mover e ligar: acompanham o ponteiro na janela inteira
  useEffect(() => {
    const ponto = (ev: PointerEvent) => {
      const r = telaRef.current?.getBoundingClientRect()
      return r ? { x: ev.clientX - r.left, y: ev.clientY - r.top } : { x: 0, y: 0 }
    }
    const mover = (ev: PointerEvent) => {
      const a = arrasto.current
      if (a) {
        if (!a.moveu && Math.hypot(ev.clientX - a.x0, ev.clientY - a.y0) < 4) return
        a.moveu = true
        const q = ponto(ev)
        acoes.current.onMover(a.id, q.x - a.dx, q.y - a.dy)
      }
      if (ligandoRef.current) {
        const q = ponto(ev)
        setLigando({ de: ligandoRef.current.de, x: q.x, y: q.y })
      }
    }
    const soltar = (ev: PointerEvent) => {
      const a = arrasto.current
      if (a) {
        arrasto.current = null
        acoes.current.onSelecionar({ no: a.id })
      }
      const l = ligandoRef.current
      if (l) {
        ligandoRef.current = null
        setLigando(null)
        const alvo = document.elementFromPoint(ev.clientX, ev.clientY)
        const caixa = alvo instanceof Element ? alvo.closest("[data-no-id]") : null
        const para = caixa?.getAttribute("data-no-id")
        if (para && para !== l.de) acoes.current.onLigar(l.de, para)
      }
    }
    window.addEventListener("pointermove", mover)
    window.addEventListener("pointerup", soltar)
    window.addEventListener("pointercancel", soltar)
    return () => {
      window.removeEventListener("pointermove", mover)
      window.removeEventListener("pointerup", soltar)
      window.removeEventListener("pointercancel", soltar)
    }
  }, [])

  const inicioArrasto = (ev: PE<HTMLDivElement>, n: NoFluxo) => {
    if (ev.button !== 0) return
    if (!desenhando) {
      if (modo === "desenhar") onSelecionar({ no: n.id })
      return
    }
    // Sem seleção de texto nem arrastar nativo; o foco fica na caixa (setas do teclado movem)
    ev.preventDefault()
    ev.currentTarget.focus({ preventScroll: true })
    const r = telaRef.current!.getBoundingClientRect()
    arrasto.current = { id: n.id, dx: ev.clientX - r.left - n.x, dy: ev.clientY - r.top - n.y, x0: ev.clientX, y0: ev.clientY, moveu: false }
  }

  const inicioLigacao = (ev: PE<HTMLButtonElement>, n: NoFluxo) => {
    ev.stopPropagation()
    ev.preventDefault()
    const r = telaRef.current!.getBoundingClientRect()
    ligandoRef.current = { de: n.id }
    setLigando({ de: n.id, x: ev.clientX - r.left, y: ev.clientY - r.top })
  }

  const teclaNaCaixa = (ev: KE<HTMLDivElement>, n: NoFluxo) => {
    if (ev.target !== ev.currentTarget) return
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault()
      if (modo === "desenhar") onSelecionar({ no: n.id })
      return
    }
    if (!desenhando) return
    const passo = ev.shiftKey ? 40 : 10
    const d = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[ev.key]
    if (d) {
      ev.preventDefault()
      onMover(n.id, n.x + d[0], n.y + d[1])
    }
  }

  const soltarBloco = (ev: DragEvent<HTMLDivElement>) => {
    const tipo = ev.dataTransfer.getData(MIME_PALETA) as TipoNo
    if (!tipo || !desenhando) return
    ev.preventDefault()
    const r = telaRef.current!.getBoundingClientRect()
    onSoltarBloco(tipo, ev.clientX - r.left - LARGURA_NO / 2, ev.clientY - r.top - ALTURA_NO / 2)
  }

  const origemLigando = ligando ? noPorId.get(ligando.de) : null

  return (
    <div
      ref={palcoRef}
      className="relative h-[60vh] min-h-[420px] lg:h-[calc(100vh-260px)] lg:min-h-[520px] overflow-auto rounded-xl border border-slate-200 bg-white"
      role="region"
      aria-label="Desenho do fluxo"
    >
      <div
        ref={telaRef}
        className="relative"
        style={{
          width: largura,
          height: altura,
          backgroundImage: "radial-gradient(#d3d9e2 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
        onDragOver={(ev) => {
          if (desenhando && ev.dataTransfer.types.includes(MIME_PALETA)) ev.preventDefault()
        }}
        onDrop={soltarBloco}
        onPointerDown={(ev) => {
          if (ev.target === ev.currentTarget || (ev.target as Element).tagName === "svg") onSelecionar(null)
        }}
      >
        <svg className="absolute inset-0 overflow-visible" width={largura} height={altura} aria-hidden="true">
          <defs>
            {Object.entries(COR).map(([k, c]) => (
              <marker key={k} id={`ponta-${k}`} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill={c} />
              </marker>
            ))}
          </defs>
          {grafo.arestas.map((a) => {
            const de = noPorId.get(a.de)
            const para = noPorId.get(a.para)
            if (!de || !para) return null
            const c = caminhoDaAresta(de, para)
            const selecionada = !!sel && "aresta" in sel && sel.aresta === a.id
            const tipo = selecionada ? "sel" : a.rotulo === "devolve" ? "devolve" : "seta"
            const texto = rotuloDaAresta(a.rotulo)
            return (
              <g key={a.id}>
                <path
                  d={c.d}
                  fill="none"
                  stroke={COR[tipo]}
                  strokeWidth={selecionada ? 3 : 2}
                  strokeDasharray={a.rotulo === "devolve" ? "6 5" : undefined}
                  markerEnd={`url(#ponta-${tipo})`}
                />
                {modo === "desenhar" && (
                  <path
                    d={c.d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    style={{ cursor: "pointer", pointerEvents: "stroke" }}
                    onPointerDown={(ev) => {
                      ev.stopPropagation()
                      onSelecionar({ aresta: a.id })
                    }}
                  />
                )}
                {texto && (
                  <text
                    x={c.mx}
                    y={c.my}
                    textAnchor="middle"
                    className="text-xs font-bold"
                    fill={a.rotulo === "devolve" ? COR.devolve : "#334155"}
                    stroke="#ffffff"
                    strokeWidth={5}
                    paintOrder="stroke"
                    style={{ pointerEvents: "none" }}
                  >
                    {texto}
                  </text>
                )}
              </g>
            )
          })}
          {ligando && origemLigando && (
            <path
              d={`M${origemLigando.x + LARGURA_NO} ${origemLigando.y + ALTURA_NO / 2} L${ligando.x} ${ligando.y}`}
              fill="none"
              stroke={COR.sel}
              strokeWidth={2}
              strokeDasharray="4 4"
            />
          )}
        </svg>

        {grafo.nos.map((n) => {
          const selecionada = modo === "desenhar" && !!sel && "no" in sel && sel.no === n.id
          const ativo = modo === "testar" && !!ativos?.has(n.id)
          const feito = modo === "testar" && !ativo && !!feitos?.has(n.id)
          const erro = modo === "desenhar" && !!comErro?.has(n.id)
          const sub = subtitulo(n)
          const lei = exigidaPorLei(n)
          const redonda = n.tipo === "inicio" || n.tipo === "fim"
          const fundo = ativo ? "bg-blue-50" : feito || n.tipo === "inicio" ? "bg-green-50" : n.tipo === "fim" ? "bg-slate-100" : "bg-white"
          const borda = ativo
            ? "border-[3px] border-blue-600"
            : feito
              ? "border-2 border-green-700"
              : selecionada
                ? "border-2 border-blue-600 ring-4 ring-blue-100"
                : erro
                  ? "border-2 border-red-500"
                  : n.tipo === "condicao"
                    ? "border-2 border-dashed border-slate-400"
                    : n.tipo === "inicio"
                      ? "border-[1.5px] border-green-300"
                      : "border-[1.5px] border-slate-300"
          const cls = [
            "absolute flex flex-col justify-center gap-px select-none px-3 py-2 pr-7 shadow-sm outline-none focus-visible:ring-4 focus-visible:ring-blue-300",
            redonda ? "rounded-full" : "rounded-xl",
            n.tipo === "condicao" && (ativo || feito || selecionada || erro) ? "border-dashed" : "",
            fundo,
            borda,
            desenhando ? "cursor-move" : modo === "desenhar" ? "cursor-pointer" : "cursor-default",
          ].join(" ")
          return (
            <div
              key={n.id}
              data-no-id={n.id}
              role="button"
              tabIndex={0}
              aria-pressed={selecionada}
              aria-label={`${ROTULO_TIPO_NO[n.tipo]}: ${n.nome}${sub ? ` — ${sub}` : ""}${ativo ? " (com alguém agora)" : feito ? " (feita)" : ""}${erro ? " (com ajuste pendente)" : ""}`}
              className={cls}
              style={{ left: n.x, top: n.y, width: LARGURA_NO, height: ALTURA_NO, touchAction: desenhando ? "none" : "auto" }}
              onPointerDown={(ev) => inicioArrasto(ev, n)}
              onKeyDown={(ev) => teclaNaCaixa(ev, n)}
            >
              <span className={`text-[10px] font-bold uppercase tracking-wider ${n.tipo === "aprovacao" ? "text-violet-700" : "text-slate-500"}`}>
                {ROTULO_TIPO_NO[n.tipo]}
              </span>
              <span className="truncate text-sm font-bold leading-tight text-slate-900" title={n.nome}>
                {n.nome}
              </span>
              {sub && (
                <span className={`truncate text-xs ${sub.startsWith("escolha") ? "text-red-700" : "text-slate-600"}`} title={sub}>
                  {sub}
                </span>
              )}
              {lei && (
                <span className="absolute right-6 top-1.5 rounded-full bg-blue-50 px-1.5 text-[10px] font-bold text-blue-800" title="Exigida por lei">
                  lei
                </span>
              )}
              {desenhando && n.tipo !== "fim" && (
                <button
                  type="button"
                  className="absolute -right-[9px] top-[31px] h-[18px] w-[18px] cursor-crosshair rounded-full border-2 border-blue-600 bg-white p-0 hover:bg-blue-100"
                  style={{ touchAction: "none" }}
                  aria-label={`Ligar "${n.nome}" a outra caixa (arraste até ela)`}
                  title="Arraste até outra caixa para ligar"
                  onPointerDown={(ev) => inicioLigacao(ev, n)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

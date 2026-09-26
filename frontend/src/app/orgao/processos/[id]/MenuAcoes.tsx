"use client"

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { AcaoDoMenu, AtoDisponivel } from "./tipos"

/** Entrada do menu já pronta para a tela (disponível ou bloqueada com o motivo). */
export interface EntradaMenu {
  chave: string
  rotulo: string
  disponivel: boolean
  motivo?: string
  destrutiva?: boolean
}

/**
 * Atos conduzidos na SALA da sessão pública (disputa, julgamento, habilitação,
 * recursos, adjudicação) ou com tela própria — não viram item do menu.
 */
const ATOS_FORA_DO_MENU = [
  "INICIAR_DISPUTA", "ENCERRAR_DISPUTA", "INICIAR_HABILITACAO", "ABRIR_PRAZO_RECURSAL",
  "DECIDIR_RECURSOS", "ADJUDICAR", "RETORNAR_JULGAMENTO", "REVOGAR", "ANULAR", "INTENCAO_REVOGAR", "INTENCAO_ANULAR",
]

const DESTRUTIVOS = ["REVOGAR", "ANULAR", "DECLARAR_DESERTA", "DECLARAR_FRACASSADA", "CANCELAR_PUBLICACAO", "EXCLUIR"]

/**
 * Converte acoes_menu (backend) em entradas do menu. Revogar/anular juntam o
 * ato direto e a intenção (art. 71, §3º): sem interessados a ouvir o backend
 * libera o ato direto; com propostas, libera a intenção. A tela só escolhe o
 * rótulo pelo que o backend liberou.
 */
export function entradasDoMenu(
  acoes: AcaoDoMenu[] | undefined,
  opcoes: { resultadoRegistrado?: boolean; atosDisponiveis?: AtoDisponivel[] } = {},
): EntradaMenu[] {
  const por = new Map((acoes || []).map((a) => [a.ato, a]))
  const saida: EntradaMenu[] = []
  const motivo = (a?: AcaoDoMenu) => (a && !a.disponivel && a.motivos.length ? a.motivos.join(" · ") : undefined)
  for (const a of acoes || []) {
    if (a.ato.startsWith("INTENCAO_")) continue
    if (a.ato === "REVOGAR" || a.ato === "ANULAR") {
      const intencao = por.get(`INTENCAO_${a.ato}`)
      const verbo = a.ato === "REVOGAR" ? "Revogar" : "Anular"
      const inciso = a.ato === "REVOGAR" ? "art. 71, II" : "art. 71, III"
      const disponivel = a.disponivel || !!intencao?.disponivel
      saida.push({
        chave: a.ato,
        rotulo: a.disponivel
          ? `${verbo} (sem interessados a ouvir — ${inciso})…`
          : intencao?.disponivel
            ? `${verbo}: registrar a intenção (art. 71, §3º)…`
            : `${verbo} (${inciso})`,
        disponivel,
        motivo: disponivel ? undefined : motivo(a) ?? motivo(intencao),
        destrutiva: true,
      })
      continue
    }
    saida.push({
      chave: a.ato,
      rotulo:
        a.ato === "REGISTRAR_RESULTADO_EXTERNO" && opcoes.resultadoRegistrado
          ? "Editar resultado externo…"
          : `${a.rotulo.replace(/\s*\(.*\)$/, "")}${a.disponivel ? "…" : ""}`,
      disponivel: a.disponivel,
      motivo: motivo(a),
      destrutiva: DESTRUTIVOS.includes(a.ato),
    })
  }
  // Demais atos simples da fase (os do antigo cartão "Atos do processo": concluir a
  // instrução, devolver etapa interna, encerrar recebimento, concluir o processo...)
  for (const a of opcoes.atosDisponiveis || []) {
    if (a.requer_dados || a.endpoint || ATOS_FORA_DO_MENU.includes(a.ato) || por.has(a.ato)) continue
    saida.push({
      chave: a.ato,
      rotulo: `${a.rotulo}${a.disponivel ? "…" : ""}`,
      disponivel: a.disponivel,
      motivo: a.disponivel ? undefined : a.pendencias.join(" · ") || undefined,
      destrutiva: DESTRUTIVOS.includes(a.ato),
    })
  }
  return saida
}

/**
 * MENU "MAIS AÇÕES" — botão real com aria-expanded; setas navegam, Esc fecha
 * e devolve o foco ao botão; clique fora fecha. Bloqueadas continuam
 * focáveis (aria-disabled) com o MOTIVO escrito embaixo, em texto visível —
 * sem tooltip (botão desabilitado não mostra title).
 */
export function MenuAcoes({ entradas, onEscolher }: { entradas: EntradaMenu[]; onEscolher: (chave: string) => void }) {
  const [aberto, setAberto] = useState(false)
  const botao = useRef<HTMLButtonElement>(null)
  const painel = useRef<HTMLDivElement>(null)
  const idMenu = useId()

  const disponiveis = entradas.filter((e) => e.disponivel)
  const bloqueadas = entradas.filter((e) => !e.disponivel)

  useEffect(() => {
    if (!aberto) return
    const fora = (ev: MouseEvent) => {
      if (!painel.current?.contains(ev.target as Node) && !botao.current?.contains(ev.target as Node)) setAberto(false)
    }
    document.addEventListener("mousedown", fora)
    // foco no primeiro item ao abrir
    const t = setTimeout(() => painel.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus(), 0)
    return () => {
      document.removeEventListener("mousedown", fora)
      clearTimeout(t)
    }
  }, [aberto])

  const fechar = (devolverFoco = true) => {
    setAberto(false)
    if (devolverFoco) botao.current?.focus()
  }

  const teclado = (ev: KeyboardEvent<HTMLDivElement>) => {
    const itens = Array.from(painel.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])
    const i = itens.indexOf(document.activeElement as HTMLButtonElement)
    if (ev.key === "Escape") {
      ev.preventDefault()
      fechar()
    } else if (ev.key === "ArrowDown") {
      ev.preventDefault()
      itens[(i + 1) % itens.length]?.focus()
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault()
      itens[(i - 1 + itens.length) % itens.length]?.focus()
    } else if (ev.key === "Home") {
      ev.preventDefault()
      itens[0]?.focus()
    } else if (ev.key === "End") {
      ev.preventDefault()
      itens[itens.length - 1]?.focus()
    } else if (ev.key === "Tab") {
      fechar(false)
    }
  }

  const escolher = (e: EntradaMenu) => {
    if (!e.disponivel) return
    fechar()
    onEscolher(e.chave)
  }

  return (
    <div className="relative">
      <Button
        ref={botao}
        variant="outline"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? idMenu : undefined}
        onClick={() => setAberto((v) => !v)}
        onKeyDown={(ev) => {
          if (ev.key === "ArrowDown" && !aberto) {
            ev.preventDefault()
            setAberto(true)
          }
        }}
        className="border-blue-300 text-blue-800"
      >
        Mais ações <ChevronDown className="w-4 h-4 ml-1" aria-hidden="true" />
      </Button>
      {aberto && (
        <div
          ref={painel}
          id={idMenu}
          role="menu"
          aria-label="Mais ações do processo"
          onKeyDown={teclado}
          className="absolute right-0 z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto rounded-md border bg-white shadow-lg py-2"
        >
          {entradas.length === 0 && <p className="px-4 py-2 text-sm text-gray-700">Nenhum ato disponível neste momento.</p>}
          {disponiveis.length > 0 && (
            <div role="group" aria-label="Disponíveis agora">
              <p className="px-4 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600">Disponíveis agora</p>
              {disponiveis.map((e) => (
                <button
                  key={e.chave}
                  type="button"
                  role="menuitem"
                  onClick={() => escolher(e)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 focus:bg-gray-100 focus:outline-none ${e.destrutiva ? "text-red-700" : "text-gray-900"}`}
                >
                  {e.rotulo}
                </button>
              ))}
            </div>
          )}
          {bloqueadas.length > 0 && (
            <div role="group" aria-label="Bloqueadas" className={disponiveis.length ? "border-t mt-1 pt-1" : ""}>
              <p className="px-4 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600">Bloqueadas</p>
              {bloqueadas.map((e) => (
                <button
                  key={e.chave}
                  type="button"
                  role="menuitem"
                  aria-disabled="true"
                  aria-describedby={`${idMenu}-${e.chave}`}
                  onClick={(ev) => ev.preventDefault()}
                  className="w-full text-left px-4 py-1.5 cursor-not-allowed focus:bg-gray-100 focus:outline-none"
                >
                  <span className="block text-sm text-gray-600">{e.rotulo}</span>
                  {e.motivo && (
                    <span id={`${idMenu}-${e.chave}`} className="block text-xs text-gray-600 leading-snug">
                      {e.motivo}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

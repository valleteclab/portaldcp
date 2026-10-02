"use client"

import { useEffect, useRef } from "react"
import type { OpcaoDeModelo } from "@/lib/processo/processo"
import s from "./processo.module.css"

/**
 * Editor da peça: folha com cabeçalho, barra de formatação simples e lacunas
 * (<mark>) em destaque. Clicar numa lacuna seleciona o texto dela; ao alterar
 * esse texto, a marca some sozinha (a lacuna foi preenchida). O HTML sai cru;
 * o servidor limpa e gera o PDF.
 */
export function EditorPeca({
  html,
  onChange,
  cabecalho,
  rodape,
  id,
  modelos = [],
  modeloId = null,
  onEscolherModelo,
  onSalvarModelo,
}: {
  html: string
  onChange: (html: string) => void
  cabecalho: string
  rodape: string
  id: string
  /** Modelos prontos do tipo de peça (tela "Modelos de documento"). */
  modelos?: OpcaoDeModelo[]
  modeloId?: string | null
  onEscolherModelo?: (id: string) => void
  onSalvarModelo?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Texto original de cada lacuna do modelo: a marca só some quando o texto muda
  const originais = useRef<Set<string>>(new Set())

  useEffect(() => {
    const el = ref.current
    if (!el || el.innerHTML === html) return
    el.innerHTML = html
    originais.current = new Set(Array.from(el.querySelectorAll("mark")).map((m) => (m.textContent ?? "").trim()))
  }, [html])

  function emitir() {
    if (ref.current) onChange(ref.current.innerHTML)
  }

  /** Tira a marca das lacunas cujo texto já não é o original, mantendo o cursor no lugar. */
  function resolverLacunas() {
    const el = ref.current
    if (!el) return
    const sel = window.getSelection()
    for (const mark of Array.from(el.querySelectorAll("mark"))) {
      const texto = (mark.textContent ?? "").trim()
      if (!texto || originais.current.has(texto)) continue
      const dentro = sel?.anchorNode && mark.contains(sel.anchorNode)
      const offset = dentro ? caretOffsetDentro(mark, sel!) : null
      const no = document.createTextNode(mark.textContent ?? "")
      mark.replaceWith(no)
      if (offset !== null && sel) {
        const r = document.createRange()
        r.setStart(no, Math.min(offset, no.length))
        r.collapse(true)
        sel.removeAllRanges()
        sel.addRange(r)
      }
    }
  }

  function aoDigitar() {
    resolverLacunas()
    emitir()
  }

  /** Clicar numa lacuna seleciona o texto dela: é só digitar por cima. */
  function aoClicar(e: React.MouseEvent<HTMLDivElement>) {
    const alvo = (e.target as Element).closest("mark")
    if (!alvo || !ref.current?.contains(alvo)) return
    const sel = window.getSelection()
    if (!sel) return
    const r = document.createRange()
    r.selectNodeContents(alvo)
    sel.removeAllRanges()
    sel.addRange(r)
  }

  function comando(cmd: string, valor?: string) {
    ref.current?.focus()
    try {
      document.execCommand(cmd, false, valor)
    } catch {
      /* navegador sem suporte: o texto continua editável */
    }
    emitir()
  }

  const botao = (rotulo: React.ReactNode, cmd: string, valor?: string, titulo?: string) => (
    <button type="button" className={s.ferramenta} title={titulo} onMouseDown={(e) => e.preventDefault()} onClick={() => comando(cmd, valor)}>
      {rotulo}
    </button>
  )

  return (
    <div className={s.editor}>
      <div className={s.barraEditor} role="toolbar" aria-label="Formatação">
        {botao(<b>N</b>, "bold", undefined, "Negrito")}
        {botao(<i>I</i>, "italic", undefined, "Itálico")}
        {botao(<u>S</u>, "underline", undefined, "Sublinhado")}
        <span className={s.separador} aria-hidden="true" />
        {botao("Título", "formatBlock", "h3")}
        {botao("Parágrafo", "formatBlock", "p")}
        {botao("• Lista", "insertUnorderedList")}
        {botao("1. Lista", "insertOrderedList")}
        <span className={s.separador} aria-hidden="true" />
        {botao("Esq.", "justifyLeft", undefined, "Alinhar à esquerda")}
        {botao("Centro", "justifyCenter", undefined, "Centralizar")}
        {botao("Justif.", "justifyFull", undefined, "Justificar")}
        {onEscolherModelo ? (
          <select className={s.seletorModelo} aria-label="Modelo da peça" value={modeloId ?? ""} onChange={(e) => onEscolherModelo(e.target.value)}>
            {modelos.length ? null : <option value="">Modelo padrão</option>}
            {modelos.map((m) => (
              <option key={m.id} value={m.id}>
                Modelo: {m.nome}
                {m.do_orgao ? "" : " (sistema)"}
              </option>
            ))}
            <option value="__vazio">Sem modelo (em branco)</option>
          </select>
        ) : null}
        {onSalvarModelo ? (
          <button type="button" className={s.ferramenta} onMouseDown={(e) => e.preventDefault()} onClick={onSalvarModelo} title="Guarda este texto como modelo do órgão para esta peça">
            Salvar como modelo
          </button>
        ) : null}
      </div>
      <div className={s.folhaCabecalho} aria-hidden="true">
        {cabecalho}
      </div>
      <div
        id={id}
        ref={ref}
        className={s.folha}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        role="textbox"
        aria-multiline="true"
        aria-label="Texto da peça"
        onInput={aoDigitar}
        onBlur={emitir}
        onClick={aoClicar}
      />
      <div className={s.folhaRodape} aria-hidden="true">
        {rodape}
      </div>
    </div>
  )
}

function caretOffsetDentro(el: Element, sel: Selection): number {
  const r = sel.getRangeAt(0).cloneRange()
  r.selectNodeContents(el)
  r.setEnd(sel.anchorNode!, sel.anchorOffset)
  return r.toString().length
}

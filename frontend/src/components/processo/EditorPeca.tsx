"use client"

import { useEffect, useRef } from "react"
import s from "./processo.module.css"

/**
 * Editor da peça: folha com cabeçalho, barra de formatação simples e lacunas
 * (<mark>) em destaque. O HTML sai cru; o servidor limpa e gera o PDF.
 */
export function EditorPeca({
  html,
  onChange,
  cabecalho,
  rodape,
  id,
}: {
  html: string
  onChange: (html: string) => void
  cabecalho: string
  rodape: string
  id: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (el && el.innerHTML !== html) el.innerHTML = html
  }, [html])

  function comando(cmd: string, valor?: string) {
    ref.current?.focus()
    try {
      document.execCommand(cmd, false, valor)
    } catch {
      /* navegador sem suporte: o texto continua editável */
    }
    if (ref.current) onChange(ref.current.innerHTML)
  }

  function preencherLacuna() {
    const sel = window.getSelection()
    const no = sel?.anchorNode
    const mark = (no instanceof Element ? no : no?.parentElement)?.closest("mark")
    if (!mark || !ref.current?.contains(mark)) return
    const texto = document.createTextNode(mark.textContent ?? "")
    mark.replaceWith(texto)
    const r = document.createRange()
    r.selectNodeContents(texto)
    sel?.removeAllRanges()
    sel?.addRange(r)
    onChange(ref.current.innerHTML)
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
        <span className={s.separador} aria-hidden="true" />
        <button type="button" className={s.ferramenta} onMouseDown={(e) => e.preventDefault()} onClick={preencherLacuna} title="Confirma o texto da lacuna onde está o cursor">
          Lacuna preenchida
        </button>
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
        onInput={(e) => onChange((e.currentTarget as HTMLDivElement).innerHTML)}
        onBlur={(e) => onChange((e.currentTarget as HTMLDivElement).innerHTML)}
      />
      <div className={s.folhaRodape} aria-hidden="true">
        {rodape}
      </div>
    </div>
  )
}

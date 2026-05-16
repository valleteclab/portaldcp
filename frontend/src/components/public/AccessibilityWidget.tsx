'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Accessibility,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Contrast,
  Eye,
  FileText,
  Highlighter,
  Maximize2,
  RotateCcw,
  Type,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'

type ContrastMode = 'normal' | 'grayscale' | 'black-white' | 'high' | 'negative' | 'light'
type AlignMode = 'left' | 'center' | 'right' | null

const bodyClasses = [
  'a11y-reading-mask',
  'a11y-readable-font',
  'a11y-underline-links',
  'a11y-grayscale',
  'a11y-black-white',
  'a11y-high-contrast',
  'a11y-negative-contrast',
  'a11y-light-bg',
  'a11y-align-left',
  'a11y-align-center',
  'a11y-align-right',
  'a11y-font-adjust',
]

export function AccessibilityWidget() {
  const [open, setOpen] = useState(false)
  const [large, setLarge] = useState(false)
  const [fontSize, setFontSize] = useState(100)
  const [lineHeight, setLineHeight] = useState(100)
  const [letterSpacing, setLetterSpacing] = useState(100)
  const [contentSize, setContentSize] = useState(100)
  const [contrastMode, setContrastMode] = useState<ContrastMode>('normal')
  const [readingMask, setReadingMask] = useState(false)
  const [readableFont, setReadableFont] = useState(false)
  const [underlineLinks, setUnderlineLinks] = useState(false)
  const [alignMode, setAlignMode] = useState<AlignMode>(null)

  const hasChanges = useMemo(() => {
    return (
      large ||
      fontSize !== 100 ||
      lineHeight !== 100 ||
      letterSpacing !== 100 ||
      contentSize !== 100 ||
      contrastMode !== 'normal' ||
      readingMask ||
      readableFont ||
      underlineLinks ||
      alignMode !== null
    )
  }, [alignMode, contentSize, contrastMode, fontSize, large, letterSpacing, lineHeight, readableFont, readingMask, underlineLinks])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!readingMask) return

    const root = document.documentElement

    function updateMaskPosition(clientY: number) {
      root.style.setProperty('--a11y-mask-y', `${Math.max(70, Math.min(window.innerHeight - 70, clientY))}px`)
    }

    function onPointerMove(event: PointerEvent) {
      updateMaskPosition(event.clientY)
    }

    function onFocusIn(event: FocusEvent) {
      const element = event.target instanceof HTMLElement ? event.target : null
      const rect = element?.getBoundingClientRect()
      if (rect) updateMaskPosition(rect.top + rect.height / 2)
    }

    updateMaskPosition(window.innerHeight / 2)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('focusin', onFocusIn)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('focusin', onFocusIn)
      root.style.removeProperty('--a11y-mask-y')
    }
  }, [readingMask])

  useEffect(() => {
    const root = document.documentElement
    const body = document.body

    bodyClasses.forEach((className) => body.classList.remove(className))

    body.classList.toggle('a11y-reading-mask', readingMask)
    body.classList.toggle('a11y-readable-font', readableFont)
    body.classList.toggle('a11y-underline-links', underlineLinks)
    body.classList.toggle('a11y-grayscale', contrastMode === 'grayscale')
    body.classList.toggle('a11y-black-white', contrastMode === 'black-white')
    body.classList.toggle('a11y-high-contrast', contrastMode === 'high')
    body.classList.toggle('a11y-negative-contrast', contrastMode === 'negative')
    body.classList.toggle('a11y-light-bg', contrastMode === 'light')
    body.classList.toggle('a11y-align-left', alignMode === 'left')
    body.classList.toggle('a11y-align-center', alignMode === 'center')
    body.classList.toggle('a11y-align-right', alignMode === 'right')
    body.classList.toggle('a11y-font-adjust', fontSize !== 100 || lineHeight !== 100 || letterSpacing !== 100)

    root.style.setProperty('--a11y-font-scale', String(fontSize / 100))
    root.style.setProperty('--a11y-line-height', String(lineHeight / 100))
    root.style.setProperty('--a11y-letter-spacing', `${(letterSpacing - 100) / 20}px`)
    root.style.setProperty('--a11y-content-scale', String(contentSize / 100))

    return () => {
      bodyClasses.forEach((className) => body.classList.remove(className))
      root.style.removeProperty('--a11y-font-scale')
      root.style.removeProperty('--a11y-line-height')
      root.style.removeProperty('--a11y-letter-spacing')
      root.style.removeProperty('--a11y-content-scale')
    }
  }, [alignMode, contentSize, contrastMode, fontSize, letterSpacing, lineHeight, readableFont, readingMask, underlineLinks])

  function reset() {
    setLarge(false)
    setFontSize(100)
    setLineHeight(100)
    setLetterSpacing(100)
    setContentSize(100)
    setContrastMode('normal')
    setReadingMask(false)
    setReadableFont(false)
    setUnderlineLinks(false)
    setAlignMode(null)
  }

  return (
    <div id="acessibilidade" className={`accessibility-widget ${large ? 'accessibility-widget-large' : ''}`}>
      <button
        type="button"
        className="accessibility-fab"
        aria-label="Abrir preferências de acessibilidade"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Accessibility aria-hidden="true" />
      </button>

      {open && (
        <aside className="accessibility-panel" aria-label="Preferências de acessibilidade">
          <div className="accessibility-panel-header">
            <button type="button" className="accessibility-close" aria-label="Fechar preferências de acessibilidade" onClick={() => setOpen(false)}>
              <X aria-hidden="true" />
            </button>
            <div>
              <h2>Preferências de acessibilidade</h2>
              <p>Ctrl + Shift + A</p>
            </div>
            <span className="accessibility-lang" aria-label="Idioma português do Brasil">BR</span>
          </div>

          <div className="accessibility-panel-body">
            <a className="accessibility-statement" href="https://www.gov.br/governodigital/pt-br/acessibilidade-e-usuario/acessibilidade-digital/modelo-de-acessibilidade">
              <FileText aria-hidden="true" />
              Declaração de Acessibilidade
            </a>

            <label className="accessibility-toggle-row">
              <span>
                <Maximize2 aria-hidden="true" />
                Widget de tamanho grande
              </span>
              <input type="checkbox" checked={large} onChange={(event) => setLarge(event.target.checked)} />
            </label>

            <div className="accessibility-grid">
              <OptionButton active={readingMask} icon={<Highlighter aria-hidden="true" />} label="Máscara de leitura" onClick={() => setReadingMask((value) => !value)} />
              <OptionButton active={contrastMode === 'high'} icon={<Contrast aria-hidden="true" />} label="Alto contraste" onClick={() => setContrastMode(contrastMode === 'high' ? 'normal' : 'high')} />
              <OptionButton active={contrastMode === 'black-white'} icon={<Eye aria-hidden="true" />} label="Preto e branco" onClick={() => setContrastMode(contrastMode === 'black-white' ? 'normal' : 'black-white')} />
              <OptionButton active={contrastMode === 'negative'} icon={<Eye aria-hidden="true" />} label="Contraste negativo" onClick={() => setContrastMode(contrastMode === 'negative' ? 'normal' : 'negative')} />
              <OptionButton active={contrastMode === 'light'} icon={<Eye aria-hidden="true" />} label="Fundo claro" onClick={() => setContrastMode(contrastMode === 'light' ? 'normal' : 'light')} />
              <OptionButton active={underlineLinks} icon={<Highlighter aria-hidden="true" />} label="Links sublinhados" onClick={() => setUnderlineLinks((value) => !value)} />

              <RangeControl label="Tamanho da fonte" value={fontSize} onDecrease={() => setFontSize((value) => Math.max(80, value - 10))} onIncrease={() => setFontSize((value) => Math.min(140, value + 10))} />
              <RangeControl label="Altura da linha" value={lineHeight} onDecrease={() => setLineHeight((value) => Math.max(90, value - 10))} onIncrease={() => setLineHeight((value) => Math.min(150, value + 10))} />
              <RangeControl label="Espaçamento entre letras" value={letterSpacing} onDecrease={() => setLetterSpacing((value) => Math.max(90, value - 10))} onIncrease={() => setLetterSpacing((value) => Math.min(140, value + 10))} />
              <RangeControl label="Dimensionamento de conteúdo" value={contentSize} onDecrease={() => setContentSize((value) => Math.max(90, value - 10))} onIncrease={() => setContentSize((value) => Math.min(115, value + 5))} />

              <OptionButton active={readableFont} icon={<Type aria-hidden="true" />} label="Fonte legível" onClick={() => setReadableFont((value) => !value)} />
              <OptionButton active={alignMode === 'right'} icon={<AlignRight aria-hidden="true" />} label="Alinhar à direita" onClick={() => setAlignMode(alignMode === 'right' ? null : 'right')} />
              <OptionButton active={alignMode === 'center'} icon={<AlignCenter aria-hidden="true" />} label="Centralizar" onClick={() => setAlignMode(alignMode === 'center' ? null : 'center')} />
              <OptionButton active={alignMode === 'left'} icon={<AlignLeft aria-hidden="true" />} label="Alinhar à esquerda" onClick={() => setAlignMode(alignMode === 'left' ? null : 'left')} />
            </div>

            <button type="button" className="accessibility-reset" onClick={reset} disabled={!hasChanges}>
              <RotateCcw aria-hidden="true" />
              Redefinir
            </button>
          </div>

          <div className="accessibility-footer">
            <a href="mailto:suporte@diariocompraspublicas.com.br">Reportar um problema</a>
          </div>
        </aside>
      )}
    </div>
  )
}

function OptionButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button type="button" className={`accessibility-option ${active ? 'is-active' : ''}`} aria-pressed={active} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  )
}

function RangeControl({
  label,
  value,
  onDecrease,
  onIncrease,
}: {
  label: string
  value: number
  onDecrease: () => void
  onIncrease: () => void
}) {
  return (
    <div className="accessibility-range" role="group" aria-label={`${label}: ${value}%`}>
      <span>{label}</span>
      <div>
        <button type="button" aria-label={`Diminuir ${label.toLowerCase()}`} onClick={onDecrease}>
          <ZoomOut aria-hidden="true" />
        </button>
        <strong>{value}%</strong>
        <button type="button" aria-label={`Aumentar ${label.toLowerCase()}`} onClick={onIncrease}>
          <ZoomIn aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

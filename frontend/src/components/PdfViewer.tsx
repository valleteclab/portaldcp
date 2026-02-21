'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { ZoomIn, ZoomOut, RotateCw } from 'lucide-react'

// pdfjs-dist v5
import * as pdfjsLib from 'pdfjs-dist'

// Worker via CDN (compatível com v5)
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
}

export interface PdfMarker {
  id: string
  page: number // 1-indexed
  x: number   // 0-1 relativo
  y: number   // 0-1 relativo
  label: string
  color: string
}

interface PdfViewerProps {
  src: string | File
  markers?: PdfMarker[]
  onPageClick?: (page: number, x: number, y: number) => void
  onDocumentLoad?: (info: { pageCount: number; hash: string; fileSize: number }) => void
  className?: string
}

async function computeSha256(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export default function PdfViewer({
  src,
  markers = [],
  onPageClick,
  onDocumentLoad,
  className = '',
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1.2)
  const [pageCount, setPageCount] = useState(0)
  const [rendering, setRendering] = useState(false)
  const pdfDocRef = useRef<any>(null)
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map())

  // Carregar PDF
  const loadPdf = useCallback(async () => {
    setRendering(true)
    try {
      let data: ArrayBuffer
      if (src instanceof File) {
        data = await src.arrayBuffer()
      } else {
        const res = await fetch(src)
        data = await res.arrayBuffer()
      }

      // Hash SHA-256
      const hash = await computeSha256(data)

      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise
      pdfDocRef.current = pdf
      setPageCount(pdf.numPages)

      onDocumentLoad?.({
        pageCount: pdf.numPages,
        hash,
        fileSize: data.byteLength,
      })
    } catch (err) {
      console.error('Erro ao carregar PDF:', err)
    } finally {
      setRendering(false)
    }
  }, [src, onDocumentLoad])

  useEffect(() => {
    loadPdf()
    return () => {
      pdfDocRef.current?.destroy()
      pdfDocRef.current = null
    }
  }, [loadPdf])

  // Renderizar páginas quando scale ou pageCount mudam
  useEffect(() => {
    if (!pdfDocRef.current || pageCount === 0) return

    const renderPages = async () => {
      const pdf = pdfDocRef.current
      for (let i = 1; i <= pdf.numPages; i++) {
        const canvas = canvasRefs.current.get(i)
        if (!canvas) continue

        const page = await pdf.getPage(i)
        const viewport = page.getViewport({ scale })
        canvas.width = viewport.width
        canvas.height = viewport.height

        const ctx = canvas.getContext('2d')
        if (!ctx) continue

        await page.render({ canvasContext: ctx, viewport }).promise
      }
    }

    renderPages()
  }, [scale, pageCount])

  const handleCanvasClick = (pageNum: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (!onPageClick) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    onPageClick(pageNum, x, y)
  }

  const zoomIn = () => setScale(s => Math.min(s + 0.2, 3))
  const zoomOut = () => setScale(s => Math.max(s - 0.2, 0.5))
  const zoomReset = () => setScale(1.2)

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Toolbar zoom */}
      <div className="flex items-center justify-center gap-2 py-2 bg-gray-800 border-b border-gray-700 shrink-0">
        <button onClick={zoomOut} className="p-1.5 rounded hover:bg-gray-700 text-gray-300" title="Diminuir zoom">
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="text-xs text-gray-400 font-mono w-14 text-center">{Math.round(scale * 100)}%</span>
        <button onClick={zoomIn} className="p-1.5 rounded hover:bg-gray-700 text-gray-300" title="Aumentar zoom">
          <ZoomIn className="h-4 w-4" />
        </button>
        <div className="w-px h-4 bg-gray-600 mx-1" />
        <button onClick={zoomReset} className="p-1.5 rounded hover:bg-gray-700 text-gray-300" title="Zoom padrão">
          <RotateCw className="h-3.5 w-3.5" />
        </button>
        {pageCount > 0 && (
          <span className="text-xs text-gray-500 ml-2">{pageCount} página{pageCount !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Páginas */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-gray-700 p-4">
        <div className="flex flex-col items-center gap-4">
          {rendering && pageCount === 0 && (
            <div className="flex items-center gap-2 text-gray-400 py-20">
              <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              Carregando PDF...
            </div>
          )}
          {Array.from({ length: pageCount }, (_, i) => i + 1).map(pageNum => {
            const pageMarkers = markers.filter(m => m.page === pageNum)
            return (
              <div
                key={pageNum}
                className="relative bg-white shadow-lg"
                style={{ cursor: onPageClick ? 'crosshair' : 'default' }}
                onClick={e => handleCanvasClick(pageNum, e)}
              >
                <canvas
                  ref={el => {
                    if (el) canvasRefs.current.set(pageNum, el)
                  }}
                />
                {/* Marcadores de assinatura */}
                {pageMarkers.map(m => (
                  <div
                    key={m.id}
                    className="absolute pointer-events-none"
                    style={{
                      left: `${m.x * 100}%`,
                      top: `${m.y * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      zIndex: 10,
                    }}
                  >
                    <div
                      className="px-2 py-1 rounded text-white text-xs font-bold shadow-lg whitespace-nowrap flex items-center gap-1"
                      style={{ backgroundColor: m.color }}
                    >
                      ✍ {m.label}
                    </div>
                  </div>
                ))}
                {/* Número da página */}
                <div className="absolute bottom-2 right-3 text-xs text-gray-400 bg-white/80 px-2 py-0.5 rounded">
                  {pageNum}/{pageCount}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

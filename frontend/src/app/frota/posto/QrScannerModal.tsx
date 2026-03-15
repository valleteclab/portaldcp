'use client'

import { useState, useRef } from 'react'
import { Camera, X, Loader2, Image, AlertCircle } from 'lucide-react'

const QR_SCAN_TARGET_ID = 'frota-qr-file-scan-target'

const extrairTokenDaUrl = (url: string): string | null => {
  const m = url.match(/\/frota\/req\/([a-fA-F0-9]{64})/)
  return m ? m[1] : null
}

export function QrScannerModal({ onScan, onClose }: { onScan: (token: string) => void; onClose: () => void }) {
  const [erro, setErro] = useState('')
  const [processando, setProcessando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setErro('')
    setProcessando(true)
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode(QR_SCAN_TARGET_ID)
      const decodedText = await scanner.scanFile(file, false)
      const token = extrairTokenDaUrl(decodedText)
      if (token) {
        onScan(token)
      } else {
        setErro('QR Code inválido. O código deve ser de uma autorização de combustível.')
      }
    } catch (err) {
      console.error('[QR Scanner]', err)
      setErro((err as Error).message || 'Não foi possível ler o QR Code. Tente outra imagem.')
    } finally {
      setProcessando(false)
      e.target.value = ''
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
      <div id={QR_SCAN_TARGET_ID} className="hidden" aria-hidden="true" />
      <div className="flex items-center justify-between p-4 text-white">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <Image className="w-5 h-5" /> Ler QR Code
        </h2>
        <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <p className="text-slate-400 text-center text-sm mb-6">
          Tire uma foto do QR Code ou escolha uma imagem da galeria
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          className="hidden"
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={processando}
          className="w-full max-w-[280px] bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-3"
        >
          {processando ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <Camera className="w-6 h-6" />
          )}
          {processando ? 'Processando...' : 'Tirar foto ou escolher imagem'}
        </button>
        {erro && (
          <div className="mt-4 flex items-center gap-2 text-red-300 text-sm max-w-[280px]">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{erro}</span>
          </div>
        )}
      </div>
      <p className="text-slate-500 text-center text-xs pb-6">
        O QR Code está na tela da autorização que o motorista mostra
      </p>
    </div>
  )
}

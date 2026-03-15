'use client'

import { useState, useRef } from 'react'
import { X, Camera, Image, Loader2, AlertCircle } from 'lucide-react'
import dynamic from 'next/dynamic'

const Scanner = dynamic(
  () => import('@yudiel/react-qr-scanner').then((mod) => mod.Scanner),
  { ssr: false, loading: () => <div className="w-full aspect-square bg-black/50 flex items-center justify-center"><Loader2 className="w-12 h-12 animate-spin text-orange-400" /></div> },
)

const extrairTokenDaUrl = (url: string): string | null => {
  const m = url.match(/\/frota\/req\/([a-fA-F0-9]{64})/)
  return m ? m[1] : null
}

export function QrScannerModal({ onScan, onClose }: { onScan: (token: string) => void; onClose: () => void }) {
  const [erro, setErro] = useState('')
  const [paused, setPaused] = useState(false)
  const [cameraOk, setCameraOk] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleScan = (detectedCodes: { rawValue: string }[]) => {
    if (paused || !detectedCodes?.length) return
    const rawValue = detectedCodes[0]?.rawValue
    if (!rawValue) return
    const token = extrairTokenDaUrl(rawValue)
    if (token) {
      setPaused(true)
      onScan(token)
    }
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setErro('')
    setPaused(true)
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode('__qr-file-target__')
      const decodedText = await scanner.scanFile(file, false)
      const token = extrairTokenDaUrl(decodedText)
      if (token) {
        onScan(token)
      } else {
        setErro('QR Code inválido. Use um código de autorização de combustível.')
      }
    } catch (err) {
      console.error('[QR File]', err)
      setErro('Não foi possível ler o QR Code. Tente outra imagem.')
    } finally {
      setPaused(false)
      e.target.value = ''
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div id="__qr-file-target__" className="hidden" aria-hidden="true" />
      <div className="flex items-center justify-between p-4 text-white bg-black/80">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <Camera className="w-5 h-5" /> Escanear QR Code
        </h2>
        <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {cameraOk ? (
          <div className="flex-1 min-h-0 relative">
            <Scanner
              onScan={handleScan}
              onError={(err: unknown) => {
                setErro((err as Error)?.message || 'Erro ao acessar câmera')
                setCameraOk(false)
              }}
              paused={paused}
              constraints={{ facingMode: 'environment' }}
              components={{ torch: true }}
              styles={{
                container: { width: '100%', height: '100%' },
                video: { objectFit: 'cover' },
              }}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6">
            <AlertCircle className="w-12 h-12 text-amber-400 mb-4" />
            <p className="text-slate-300 text-center mb-4">{erro}</p>
            <p className="text-slate-400 text-sm text-center mb-6">
              Use o código manual ou envie uma foto do QR Code
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
              className="w-full max-w-[280px] bg-orange-500 hover:bg-orange-600 text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-3"
            >
              <Image className="w-6 h-6" />
              Tirar foto ou escolher imagem
            </button>
          </div>
        )}

        {erro && cameraOk && (
          <div className="p-4 flex items-center gap-2 text-amber-300 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        <div className="p-4 border-t border-slate-700 flex gap-3">
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
            className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-300 font-medium flex items-center justify-center gap-2"
          >
            <Image className="w-5 h-5" /> Enviar foto
          </button>
        </div>
      </div>
    </div>
  )
}

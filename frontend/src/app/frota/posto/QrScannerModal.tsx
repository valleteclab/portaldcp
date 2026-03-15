'use client'

import { useState, useEffect, useRef } from 'react'
import { Camera, X, Loader2, XCircle } from 'lucide-react'

const QR_READER_ID = 'frota-posto-qr-reader'

function extrairTokenDaUrl(url: string): string | null {
  const m = url.match(/\/frota\/req\/([a-fA-F0-9]{64})/)
  return m ? m[1] : null
}

export function QrScannerModal({ onScan, onClose }: { onScan: (token: string) => void; onClose: () => void }) {
  const [erro, setErro] = useState('')
  const [iniciando, setIniciando] = useState(true)
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    let mounted = true

    const init = async () => {
      try {
        await new Promise(r => setTimeout(r, 150))
        if (!mounted) return
        const el = document.getElementById(QR_READER_ID)
        if (!el) {
          setErro('Elemento do scanner não encontrado')
          return
        }
        const { Html5Qrcode } = await import('html5-qrcode')
        if (!mounted) return
        const scanner = new Html5Qrcode(QR_READER_ID)
        scannerRef.current = scanner
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            const token = extrairTokenDaUrl(decodedText)
            if (token && mounted) {
              scanner.stop().catch(() => {})
              setTimeout(() => {
                try {
                  onScanRef.current(token)
                } catch (err) {
                  console.error('[QR] onScan error:', err)
                }
              }, 0)
            }
          },
          () => {},
        )
        if (mounted) setIniciando(false)
        else scanner.stop().catch(() => {})
      } catch (e) {
        console.error('[QR Scanner]', e)
        if (mounted) setErro((e as Error).message || 'Erro ao acessar câmera')
      }
    }
    init()
    return () => {
      mounted = false
      scannerRef.current?.stop().catch(() => {})
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
      <div className="flex items-center justify-between p-4 text-white">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <Camera className="w-5 h-5" /> Escanear QR Code
        </h2>
        <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center p-4 relative">
        <div id={QR_READER_ID} className="w-full max-w-[320px] rounded-2xl overflow-hidden bg-black min-h-[250px]" />
        {iniciando && !erro && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="w-10 h-10 animate-spin text-orange-400" />
          </div>
        )}
        {erro && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <XCircle className="w-12 h-12 text-red-400 mb-3" />
            <p className="text-red-300 font-medium">{erro}</p>
            <p className="text-slate-400 text-sm mt-1">Permita o acesso à câmera nas configurações do navegador.</p>
          </div>
        )}
      </div>
      <p className="text-slate-400 text-center text-sm pb-6">Aponte a câmera para o QR Code da autorização</p>
    </div>
  )
}

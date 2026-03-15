'use client'

import React from 'react'
import { X, AlertCircle } from 'lucide-react'

interface Props {
  children: React.ReactNode
  onClose: () => void
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class QrScannerErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[QrScanner]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-6">
          <div className="bg-slate-800 rounded-2xl p-6 max-w-sm w-full text-center">
            <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
            <h2 className="text-white font-bold text-lg mb-2">Erro ao abrir scanner</h2>
            <p className="text-slate-400 text-sm mb-4">
              Use o código manual ou envie uma foto do QR Code na tela de registro.
            </p>
            <button
              onClick={this.props.onClose}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2"
            >
              <X className="w-5 h-5" /> Fechar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

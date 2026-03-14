'use client'

import { Fuel, Link } from 'lucide-react'

export default function VereadorIndexPage() {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm text-center space-y-5">
        <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto">
          <Fuel className="w-8 h-8 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Portal de Combustível</h1>
          <p className="text-slate-400 mt-1 text-sm">Acesso do Vereador</p>
        </div>
        <div className="bg-slate-800 rounded-2xl p-6 space-y-3 text-left">
          <div className="flex items-center gap-2 text-orange-400">
            <Link className="w-5 h-5 flex-shrink-0" />
            <p className="font-semibold text-white">Use o link pessoal</p>
          </div>
          <p className="text-slate-300 text-sm leading-relaxed">
            O acesso ao portal é feito por um link exclusivo fornecido pelo gestor da sua câmara.
          </p>
          <p className="text-slate-400 text-sm">
            O link tem o formato:<br />
            <span className="font-mono text-orange-300 text-xs break-all">/frota/vereador/[seu-código]</span>
          </p>
          <p className="text-slate-500 text-xs">
            Caso não tenha recebido seu link, entre em contato com o setor de TI ou gestão da câmara municipal.
          </p>
        </div>
      </div>
    </div>
  )
}

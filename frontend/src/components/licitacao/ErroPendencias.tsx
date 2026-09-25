"use client"

import { AlertTriangle } from "lucide-react"
import type { ErroBackend } from "@/lib/publicacao"

/**
 * Mensagem de erro do backend com a lista de pendências (400 dos atos e das
 * regras de prazo). Quando há pendências, a lista substitui a mensagem
 * concatenada ("Pendências para ...: a | b").
 */
export function ErroPendencias({ erro, className = "" }: { erro: ErroBackend | null; className?: string }) {
  if (!erro) return null
  const temLista = erro.pendencias.length > 0
  return (
    <div className={`flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2 ${className}`}>
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="min-w-0">
        {temLista ? (
          <>
            <p className="font-medium">{erro.pendencias.length === 1 ? "Pendência:" : "Pendências:"}</p>
            <ul className="list-disc pl-4 space-y-0.5">
              {erro.pendencias.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </>
        ) : (
          <p>{erro.mensagem}</p>
        )}
      </div>
    </div>
  )
}

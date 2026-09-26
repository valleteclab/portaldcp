"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Trash2 } from "lucide-react"

/** Hoje em Brasília (AAAA-MM-DD) — a data da peça não pode ser futura. */
export const hojeBrasilia = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10)

export interface MetadadosPeca {
  numero: string
  data: string
  signatarios: Array<{ nome: string; cargo: string }>
  observacao: string
}

export const metadadosVazios = (): MetadadosPeca => ({ numero: "", data: "", signatarios: [{ nome: "", cargo: "" }], observacao: "" })

/** Erro da data (obrigatória, não futura) — a mesma regra do backend (peca-regras). */
export function erroDaData(data: string): string | null {
  if (!data) return "Informe a data do documento (a data que consta na peça)."
  if (data > hojeBrasilia()) return "A data do documento não pode ser futura."
  return null
}

/**
 * CAMPOS DA PEÇA FEITA FORA: número, DATA DO DOCUMENTO (a que consta na peça
 * — obrigatória, não futura; o sistema guarda também a do envio), quem assinou
 * (nome/cargo) e observação. Um só formulário para o "Anexar PDF" de uma peça
 * (AnexarPecaDialog) e para cada arquivo da juntada em lote (fase interna
 * feita fora).
 */
export function CamposMetadadosPeca({
  valor,
  onChange,
  idBase,
  compacto = false,
}: {
  valor: MetadadosPeca
  onChange: (v: MetadadosPeca) => void
  /** Prefixo dos ids (vários formulários na mesma tela). */
  idBase: string
  compacto?: boolean
}) {
  const set = (parcial: Partial<MetadadosPeca>) => onChange({ ...valor, ...parcial })
  const sigs = valor.signatarios.length ? valor.signatarios : [{ nome: "", cargo: "" }]
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`${idBase}-numero`}>Número da peça</Label>
          <Input id={`${idBase}-numero`} placeholder="Ex.: Parecer 167/2025" value={valor.numero} onChange={(e) => set({ numero: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idBase}-data`}>Data do documento *</Label>
          <Input id={`${idBase}-data`} type="date" max={hojeBrasilia()} value={valor.data} onChange={(e) => set({ data: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Quem assinou</Label>
        {sigs.map((s, i) => (
          <div key={i} className="flex gap-2">
            <Input placeholder="Nome" value={s.nome} aria-label={`Nome do signatário ${i + 1}`}
              onChange={(e) => set({ signatarios: sigs.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)) })} />
            <Input placeholder="Cargo (ex.: Procurador)" value={s.cargo} aria-label={`Cargo do signatário ${i + 1}`}
              onChange={(e) => set({ signatarios: sigs.map((x, j) => (j === i ? { ...x, cargo: e.target.value } : x)) })} />
            {sigs.length > 1 && (
              <Button type="button" variant="ghost" size="icon" aria-label="Remover signatário"
                onClick={() => set({ signatarios: sigs.filter((_, j) => j !== i) })}>
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => set({ signatarios: [...sigs, { nome: "", cargo: "" }] })}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Signatário
        </Button>
      </div>
      {!compacto && (
        <div className="space-y-1">
          <Label htmlFor={`${idBase}-obs`}>Observação</Label>
          <Textarea id={`${idBase}-obs`} rows={2} value={valor.observacao} onChange={(e) => set({ observacao: e.target.value })} />
        </div>
      )}
    </div>
  )
}

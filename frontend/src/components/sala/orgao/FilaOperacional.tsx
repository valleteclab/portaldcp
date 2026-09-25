'use client'

import { useState } from 'react'
import { Gavel } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { DisputaV3ItemBoard } from '../types'
import { rotuloUnidade } from '../unidade-lote'
import { getItemStatusClass, getItemStatusLabel } from '../utils'

/** Fila de itens/lotes do pregoeiro: seleção para iniciar e foco da sala. */
export function FilaOperacional({
  emDisputa,
  aguardando,
  encerrados,
  selectedItemId,
  onSelecionar,
  onIniciar,
}: {
  emDisputa: DisputaV3ItemBoard[]
  aguardando: DisputaV3ItemBoard[]
  encerrados: DisputaV3ItemBoard[]
  selectedItemId: string | null
  onSelecionar: (id: string) => void
  onIniciar: (ids: string[]) => void
}) {
  const [marcados, setMarcados] = useState<string[]>([])

  const alternar = (id: string) =>
    setMarcados((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]))

  const iniciar = () => {
    if (marcados.length === 0) return
    onIniciar(marcados)
    setMarcados([])
  }

  const grupos = [
    { titulo: 'Em disputa', itens: emDisputa },
    { titulo: 'Aguardando', itens: aguardando },
    { titulo: 'Encerrados', itens: encerrados },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fila operacional</CardTitle>
        <CardDescription>Selecione itens para iniciar e escolha o foco da sessão.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button className="w-full" onClick={iniciar} disabled={marcados.length === 0}>
          <Gavel className="mr-2 h-4 w-4" />
          Iniciar selecionados
        </Button>

        <ScrollArea className="h-[calc(100vh-340px)] pr-3">
          <div className="space-y-3">
            {grupos.map((grupo) => (
              <div key={grupo.titulo} className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{grupo.titulo}</div>
                {grupo.itens.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-3 py-4 text-sm text-slate-400">Nenhum item nesta coluna.</div>
                ) : (
                  grupo.itens.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelecionar(item.id)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        selectedItemId === item.id ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium text-slate-900">{rotuloUnidade(item)}</div>
                          <div className="line-clamp-2 text-xs text-slate-600">{item.descricao}</div>
                        </div>
                        {item.status === 'AGUARDANDO' && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <Checkbox checked={marcados.includes(item.id)} onCheckedChange={() => alternar(item.id)} />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={getItemStatusClass(item)}>{getItemStatusLabel(item)}</Badge>
                        <Badge variant="outline">{item.totalLances} lances</Badge>
                      </div>
                    </button>
                  ))
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

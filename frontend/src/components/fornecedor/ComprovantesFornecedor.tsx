'use client'

/**
 * COMPROVANTES DO FORNECEDOR (dono, 10/11/2026 — como a BLL): cada inclusão ou
 * alteração da proposta e cada anexo geram um comprovante com o que foi feito e
 * o que ficou gravado no sistema — a garantia de quem enviou. Só o próprio
 * fornecedor vê os seus.
 */
import { useState } from 'react'
import { Download, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { API_URL } from '@/lib/api'
import { useConsultaAoVivo } from '@/hooks/useConsultaAoVivo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { baixarArquivo } from '@/components/sala/recursos-comum'

interface Comprovante {
  id: string
  numero: string
  tipo: string
  rotulo: string
  descricao: string
  emitidoEm: string
  codigoVerificacao: string
  valorTotal: number | null
  itens: number
  anexos: number
}

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const reais = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function ComprovantesFornecedor({
  licitacaoId,
  atualizacao,
  ocultarSeVazio = false,
}: {
  licitacaoId: string
  /** Muda quando a tela grava algo: a lista é consultada de novo. */
  atualizacao?: unknown
  ocultarSeVazio?: boolean
}) {
  const [lista] = useConsultaAoVivo<Comprovante[]>(`${API_URL}/api/comprovantes/licitacao/${licitacaoId}`, atualizacao, { intervaloMs: 10_000, minimoMs: 1_500 })
  const [todos, setTodos] = useState(false)
  if (!lista || (ocultarSeVazio && lista.length === 0)) return null
  const visiveis = todos ? lista : lista.slice(0, 5)

  const baixar = (c: Comprovante) =>
    baixarArquivo(`${API_URL}/api/comprovantes/${c.id}/pdf`, `comprovante-${c.numero}.pdf`).catch(() => toast.error('Não foi possível baixar o comprovante.'))

  return (
    <Card className="border-emerald-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-emerald-700" /> Comprovantes
        </CardTitle>
        <CardDescription>
          A cada envio ou alteração da proposta e a cada anexo, o sistema emite um comprovante com o que foi feito e o que ficou gravado. Guarde o PDF como
          garantia.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {lista.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum comprovante ainda. O primeiro é emitido quando você enviar a proposta ou anexar um documento.</p>
        ) : (
          visiveis.map((c, i) => (
            <div key={c.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm ${i === 0 ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200'}`}>
              <div className="min-w-0">
                <div className="font-semibold text-slate-900">
                  {c.numero} — {c.rotulo}
                </div>
                <div className="break-words text-slate-600">{c.descricao !== c.rotulo ? c.descricao : null}</div>
                <div className="text-xs text-slate-500">
                  {dataHora(c.emitidoEm)}
                  {c.valorTotal != null && ` · proposta: ${reais(c.valorTotal)} (${c.itens} ${c.itens === 1 ? 'item' : 'itens'})`}
                  {` · ${c.anexos} ${c.anexos === 1 ? 'anexo' : 'anexos'}`}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => baixar(c)}>
                <Download className="mr-1 h-4 w-4" /> Baixar PDF
              </Button>
            </div>
          ))
        )}
        {lista.length > 5 && (
          <Button size="sm" variant="ghost" onClick={() => setTodos((t) => !t)}>
            {todos ? 'Mostrar só os 5 mais recentes' : `Ver todos (${lista.length})`}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

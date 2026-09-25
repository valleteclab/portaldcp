'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { HelpCircle, Scale } from 'lucide-react'
import { API_URL } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { dataHoraBR } from '@/lib/licitacao-rotulos'

interface Manifestacao {
  id: string
  status: string
  resposta?: string | null
  respondido_por?: string | null
  data_resposta?: string | null
  created_at?: string
  texto_esclarecimento?: string
  item_edital_referencia?: string | null
  texto_impugnacao?: string
  item_edital_impugnado?: string | null
  altera_edital?: boolean
}

const ROTULO_STATUS: Record<string, { rotulo: string; cor: string }> = {
  RESPONDIDO: { rotulo: 'Respondido', cor: 'bg-green-100 text-green-800' },
  DEFERIDA: { rotulo: 'Deferida', cor: 'bg-green-100 text-green-800' },
  PARCIALMENTE_DEFERIDA: { rotulo: 'Parcialmente deferida', cor: 'bg-amber-100 text-amber-800' },
  INDEFERIDA: { rotulo: 'Indeferida', cor: 'bg-red-100 text-red-800' },
}

function carregar(url: string): Promise<Manifestacao[]> {
  return fetch(url)
    .then((r) => (r.ok ? r.json() : []))
    .then((j) => (Array.isArray(j) ? j : []))
    .catch(() => [])
}

/**
 * Esclarecimentos e impugnações RESPONDIDOS (art. 164; plano E8 item 10). O
 * backend só devolve ao público o que já foi respondido, sem a identidade de
 * quem perguntou/impugnou.
 */
export function ManifestacoesPublicas({ licitacaoId }: { licitacaoId: string }) {
  const [esclarecimentos, setEsclarecimentos] = useState<Manifestacao[] | null>(null)
  const [impugnacoes, setImpugnacoes] = useState<Manifestacao[] | null>(null)

  useEffect(() => {
    void carregar(`${API_URL}/api/esclarecimentos/licitacao/${licitacaoId}`).then(setEsclarecimentos)
    void carregar(`${API_URL}/api/impugnacoes/licitacao/${licitacaoId}`).then(setImpugnacoes)
  }, [licitacaoId])

  const bloco = (titulo: string, descricao: string, icone: ReactNode, lista: Manifestacao[] | null, tipo: 'E' | 'I') => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icone} {titulo} {lista ? `(${lista.length})` : ''}
        </CardTitle>
        <CardDescription>{descricao}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {lista === null ? (
          <p className="text-sm text-gray-500">Carregando...</p>
        ) : lista.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum registro respondido.</p>
        ) : (
          lista.map((m) => {
            const st = ROTULO_STATUS[m.status] ?? { rotulo: m.status, cor: 'bg-gray-100 text-gray-800' }
            const pergunta = tipo === 'E' ? m.texto_esclarecimento : m.texto_impugnacao
            const item = tipo === 'E' ? m.item_edital_referencia : m.item_edital_impugnado
            return (
              <div key={m.id} className="space-y-2 rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-gray-500">
                    Enviado em {dataHoraBR(m.created_at)}
                    {item ? ` · item do edital: ${item}` : ''}
                  </span>
                  <div className="flex gap-2">
                    {tipo === 'I' && m.altera_edital && <Badge className="bg-blue-100 text-blue-800">Altera o edital</Badge>}
                    <Badge className={st.cor}>{st.rotulo}</Badge>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-gray-800">{pergunta}</p>
                {m.resposta && (
                  <div className="rounded-md border-l-4 border-emerald-400 bg-emerald-50 p-2">
                    <p className="mb-1 text-xs font-medium text-emerald-800">
                      Resposta{m.respondido_por ? ` — ${m.respondido_por}` : ''} ({dataHoraBR(m.data_resposta)})
                    </p>
                    <p className="whitespace-pre-wrap text-gray-800">{m.resposta}</p>
                  </div>
                )}
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-4">
      {bloco('Esclarecimentos', 'Pedidos de esclarecimento respondidos pelo agente de contratação.', <HelpCircle className="h-4 w-4" />, esclarecimentos, 'E')}
      {bloco('Impugnações', 'Impugnações ao edital julgadas (Lei 14.133/2021, art. 164).', <Scale className="h-4 w-4" />, impugnacoes, 'I')}
    </div>
  )
}

'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { STATUS_INSCRICAO, dataCurta, dataHora, erroDaResposta, situacaoCredenciamento } from '@/lib/credenciamento'

/**
 * FORNECEDOR — meus credenciamentos (plano E7b): as próprias inscrições
 * (identidade do token), situação e demandas recebidas. Novos
 * credenciamentos: página pública /credenciamento.
 */
export default function MeusCredenciamentosPage() {
  const [lista, setLista] = useState<any[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    authFetch(`${API_URL}/api/credenciamento/fornecedor/minhas`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await erroDaResposta(r, 'Erro ao carregar'))
        setLista(await r.json())
      })
      .catch((e) => {
        setErro(e.message)
        setLista([])
      })
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Meus credenciamentos</h1>
          <p className="text-sm text-gray-600">Inscrições em editais de credenciamento (Lei 14.133/2021, art. 79) e as demandas recebidas.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/credenciamento">Credenciamentos abertos</Link>
        </Button>
      </div>
      {erro && <div className="text-sm text-red-600">{erro}</div>}
      {lista === null ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </div>
      ) : lista.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-gray-500">Você ainda não se inscreveu em nenhum credenciamento.</CardContent>
        </Card>
      ) : (
        lista.map((i) => {
          const st = STATUS_INSCRICAO[i.status] ?? { label: i.status, cor: '' }
          const proc = situacaoCredenciamento(i)
          return (
            <Card key={i.id}>
              <CardContent className="p-4 flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex gap-2 items-center flex-wrap">
                    <Badge className={st.cor}>{st.label}</Badge>
                    <Badge variant="outline" className={proc.cor}>
                      {proc.label}
                    </Badge>
                    <span className="text-xs text-gray-500">{i.orgao_nome}</span>
                  </div>
                  <div className="font-medium mt-1">{i.objeto}</div>
                  <div className="text-xs text-gray-500">
                    Edital {i.numero_edital || '—'} · inscrição em {dataHora(i.inscrita_em)}
                    {i.validade_ate && ` · validade ${dataCurta(i.validade_ate)}`} · {i.contratacoes} demanda(s)
                  </div>
                </div>
                <Button asChild size="sm">
                  <Link href={`/fornecedor/credenciamentos/${i.licitacao_id}`}>Abrir</Link>
                </Button>
              </CardContent>
            </Card>
          )
        })
      )}
    </div>
  )
}

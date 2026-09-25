'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Eye, FileText } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { useDialogoConfirmacao } from '@/components/licitacao/useDialogoConfirmacao'

/**
 * FORNECEDOR — Atas de Registro de Preços: as próprias atas (assinar, saldo,
 * adesões para aceite) e as convocações para o CADASTRO DE RESERVA (aderir ao
 * preço do vencedor — Lei 14.133/2021 art. 82 VII; Decreto 11.462/2023 art. 18).
 */

const STATUS: Record<string, string> = {
  AGUARDANDO_ASSINATURA: 'Aguardando assinatura',
  VIGENTE: 'Vigente',
  ESGOTADA: 'Esgotada',
  SUSPENSA: 'Suspensa',
  VENCIDA: 'Vencida',
  ENCERRADA: 'Encerrada',
  CANCELADA: 'Cancelada',
}
const RESERVA: Record<string, string> = {
  PENDENTE: 'Aguardando sua resposta',
  ADERIU: 'Você aderiu',
  RECUSOU: 'Você recusou',
  EXPIRADO: 'Prazo encerrado',
  CONVOCADO: 'Convocado — nova ata',
}
const moeda = (v: any) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 4 })
const data = (v: any) => {
  if (!v) return '—'
  const [a, m, d] = String(v).slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export default function FornecedorAtasPage() {
  const [atas, setAtas] = useState<any[]>([])
  const [reservas, setReservas] = useState<any[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [erroAto, setErroAto] = useState<string | null>(null)
  const { confirmar, dialogo } = useDialogoConfirmacao()

  const carregar = useCallback(async () => {
    const [a, r] = await Promise.all([authFetch(`${API_URL}/api/atas`), authFetch(`${API_URL}/api/atas/fornecedor/reservas`)])
    if (a.ok) setAtas(await a.json())
    if (r.ok) setReservas(await r.json())
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const responder = async (ataId: string, aderir: boolean) => {
    const ok = await confirmar(
      aderir
        ? { titulo: 'Aderir ao cadastro de reserva?', mensagem: 'Você confirma que cota ao preço registrado do vencedor (cadastro de reserva).', confirmarRotulo: 'Aderir' }
        : { titulo: 'Recusar o cadastro de reserva?', mensagem: 'Recusar o cadastro de reserva desta ata.', confirmarRotulo: 'Recusar', destrutivo: true },
    )
    if (!ok) return
    setErroAto(null)
    setOcupado(true)
    try {
      const r = await authFetch(`${API_URL}/api/atas/${ataId}/reserva`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aderir }),
      })
      const b = await r.json().catch(() => null)
      if (!r.ok) throw new Error(b?.message || `HTTP ${r.status}`)
      await carregar()
    } catch (e: any) {
      setErroAto(e.message)
    } finally {
      setOcupado(false)
    }
  }

  const pendentesPorAta = reservas.reduce((acc: Record<string, any[]>, r) => {
    ;(acc[r.ata_id] = acc[r.ata_id] || []).push(r)
    return acc
  }, {})

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Atas de Registro de Preços</h1>
        <p className="text-gray-600 text-sm">Suas atas e as convocações para o cadastro de reserva.</p>
      </div>
      {erroAto && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erroAto}</p>}


      <Card>
        <CardHeader>
          <CardTitle>Cadastro de reserva</CardTitle>
          <CardDescription>
            Depois da homologação, os demais licitantes podem aderir ao cadastro de reserva cotando ao preço do vencedor, na ordem
            de classificação. Se o registro do vencedor for cancelado, o primeiro que aderiu é convocado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.keys(pendentesPorAta).length === 0 && <p className="text-sm text-gray-500">Nenhuma convocação.</p>}
          {Object.entries(pendentesPorAta).map(([ataId, linhas]) => (
            <div key={ataId} className="border rounded-lg p-3 space-y-2">
              <div className="flex flex-wrap justify-between gap-2">
                <strong>Ata {linhas[0].numero_ata} — {linhas[0].orgao_nome}</strong>
                {linhas[0].prazo_resposta && <span className="text-xs text-gray-500">Prazo: {new Date(linhas[0].prazo_resposta).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>}
              </div>
              <p className="text-sm text-gray-600">{linhas[0].objeto}</p>
              <ul className="text-sm">
                {linhas.map((l: any) => (
                  <li key={l.id}>
                    Item {l.numero_item} — {l.descricao}: preço registrado {moeda(l.preco_registrado)} · sua posição {l.posicao}º · {RESERVA[l.status] || l.status}
                  </li>
                ))}
              </ul>
              {linhas.some((l: any) => l.status === 'PENDENTE') && (
                <div className="flex gap-2">
                  <Button size="sm" disabled={ocupado} onClick={() => responder(ataId, true)}>Aderir ao preço do vencedor</Button>
                  <Button size="sm" variant="outline" disabled={ocupado} onClick={() => responder(ataId, false)}>Recusar</Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Minhas atas</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {atas.length === 0 && (
            <div className="text-center py-6 text-gray-500">
              <FileText className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              Nenhuma ata.
            </div>
          )}
          {atas.map((a) => (
            <div key={a.id} className="border rounded-lg p-3 flex flex-wrap justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <strong>Ata {a.numero_ata}</strong>
                  <Badge variant={a.status === 'AGUARDANDO_ASSINATURA' ? 'default' : 'secondary'}>{STATUS[a.status] || a.status}</Badge>
                </div>
                <p className="text-sm text-gray-600">{a.objeto}</p>
                <p className="text-xs text-gray-500">{a.orgao?.nome} · vigência até {data(a.data_vigencia_fim)} · saldo {moeda(a.valor_saldo)} de {moeda(a.valor_total)}</p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/fornecedor/atas/${a.id}`}><Eye className="w-4 h-4 mr-1" /> Abrir</Link>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
      {dialogo}
    </div>
  )
}

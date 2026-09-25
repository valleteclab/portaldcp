'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, FilePen } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { useDialogoConfirmacao } from '@/components/licitacao/useDialogoConfirmacao'

/**
 * FORNECEDOR — detalhe da PRÓPRIA ata: itens e saldo, assinatura do termo
 * (link do próprio signatário no assinador) e aceite das adesões já anuídas
 * pelo gerenciador (art. 86 §2º III).
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
const STATUS_ADESAO: Record<string, string> = {
  ANUENCIA_GERENCIADOR: 'Aguardando o seu aceite',
  ACEITE_FORNECEDOR: 'Aceita — aguardando autorização do gerenciador',
  AUTORIZADA: 'Autorizada',
  RECUSADA: 'Recusada',
  CANCELADA: 'Cancelada',
}
const moeda = (v: any) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 4 })
const qtd = (v: any) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 })
const data = (v: any) => {
  if (!v) return '—'
  const [a, m, d] = String(v).slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export default function FornecedorAtaDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const [p, setP] = useState<any>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erroAto, setErroAto] = useState<string | null>(null)
  const { pedirTexto, dialogo } = useDialogoConfirmacao()

  const carregar = useCallback(async () => {
    const r = await authFetch(`${API_URL}/api/atas/fornecedor/ata/${id}`)
    const b = await r.json().catch(() => null)
    if (!r.ok) return setErro(b?.message || `HTTP ${r.status}`)
    setP(b)
  }, [id])

  useEffect(() => {
    carregar()
  }, [carregar])

  const responderAdesao = async (adesaoId: string, aceitar: boolean) => {
    let motivo: string | null = null
    if (!aceitar) {
      motivo = await pedirTexto({ titulo: 'Recusar a adesão', rotulo: 'Motivo da recusa', obrigatorio: true, confirmarRotulo: 'Recusar', destrutivo: true })
      if (!motivo) return
    }
    setErroAto(null)
    setOcupado(true)
    try {
      const r = await authFetch(`${API_URL}/api/atas/adesoes/${adesaoId}/fornecedor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aceitar, motivo }),
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

  if (erro)
    return (
      <div className="p-6 space-y-4">
        <Link href="/fornecedor/atas" className="text-sm text-blue-600 flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Minhas atas</Link>
      {erroAto && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erroAto}</p>}

        <Card><CardContent className="pt-6 text-red-600">{erro}</CardContent></Card>
      </div>
    )
  if (!p) return <div className="p-8 text-center text-gray-500">Carregando ata…</div>
  const a = p.ata

  return (
    <div className="p-6 space-y-6">
      <Link href="/fornecedor/atas" className="text-sm text-blue-600 flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Minhas atas</Link>
      <div>
        <Badge>{STATUS[a.status] || a.status}</Badge>
        <h1 className="text-2xl font-bold mt-1">Ata nº {a.numero_ata}</h1>
        <p className="text-gray-600">{a.objeto}</p>
        <p className="text-sm text-gray-500">
          Órgão gerenciador: {p.orgao?.nome} · vigência {data(a.data_vigencia_inicio)} a {data(a.data_vigencia_fim)} · saldo {moeda(a.valor_saldo)} de {moeda(a.valor_total)}
        </p>
      </div>

      {a.status === 'AGUARDANDO_ASSINATURA' && (
        <Card className="border-blue-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FilePen className="w-5 h-5" /> Assinatura da ata</CardTitle>
            <CardDescription>A ata passa a vigorar depois da assinatura de todas as partes.</CardDescription>
          </CardHeader>
          <CardContent>
            {p.link_assinatura ? (
              <Button asChild><Link href={p.link_assinatura}>Revisar e assinar</Link></Button>
            ) : (
              <p className="text-sm text-gray-500">O órgão ainda não gerou o termo para assinatura (ou você já assinou).</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Itens registrados</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b"><th className="py-2">Item</th><th>Descrição</th><th className="text-right">Preço</th><th className="text-right">Registrado</th><th className="text-right">Utilizado</th><th className="text-right">Saldo</th><th className="text-right">Adesões (autoriz./usado)</th></tr>
            </thead>
            <tbody>
              {p.itens.map((i: any) => (
                <tr key={i.id} className="border-b last:border-0">
                  <td className="py-2">{i.numero_item}</td>
                  <td>{i.descricao}</td>
                  <td className="text-right">{moeda(i.valor_unitario)}</td>
                  <td className="text-right">{qtd(i.quantidade_registrada)}</td>
                  <td className="text-right">{qtd(i.quantidade_utilizada)}</td>
                  <td className="text-right">{qtd(i.quantidade_saldo)}</td>
                  <td className="text-right">{qtd(i.quantidade_adesao_autorizada)} / {qtd(i.quantidade_adesao_utilizada)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adesões de outros órgãos</CardTitle>
          <CardDescription>Depois da anuência do órgão gerenciador, cabe a você aceitar ou recusar o fornecimento ao órgão aderente (art. 86 §2º III).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!p.adesoes?.length && <p className="text-sm text-gray-500">Nenhuma adesão para responder.</p>}
          {p.adesoes?.map((ad: any) => (
            <div key={ad.id} className="border rounded-lg p-3 space-y-1">
              <div className="flex justify-between gap-2">
                <strong>{ad.orgao_aderente_nome}</strong>
                <Badge variant="secondary">{STATUS_ADESAO[ad.status] || ad.status}</Badge>
              </div>
              <ul className="text-sm text-gray-600">
                {ad.itens.map((i: any) => (
                  <li key={i.id}>Item {i.numero_item}: {qtd(i.quantidade)} × {moeda(i.valor_unitario)}</li>
                ))}
              </ul>
              {ad.status === 'ANUENCIA_GERENCIADOR' && (
                <div className="flex gap-2 pt-1">
                  <Button size="sm" disabled={ocupado} onClick={() => responderAdesao(ad.id, true)}>Aceitar fornecimento</Button>
                  <Button size="sm" variant="outline" disabled={ocupado} onClick={() => responderAdesao(ad.id, false)}>Recusar</Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      {dialogo}
    </div>
  )
}

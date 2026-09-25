'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Search, Users } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { toast } from "sonner"
import { confirmarAcao, pedirTextoAcao } from "@/components/DialogoGlobal"

/**
 * ADESÃO A ATA DE REGISTRO DE PREÇOS ("carona" — Lei 14.133/2021 art. 86).
 *  - Aderir: busca atas vigentes de OUTROS órgãos que admitem adesão, pede a
 *    adesão (justificativa de vantagem + itens/quantidades; até 50% por item
 *    para o órgão e, no total das adesões, até o dobro).
 *  - Minhas adesões: acompanha o fluxo (anuência do gerenciador → aceite do
 *    fornecedor → autorização) e, autorizada, contrata até o autorizado.
 *  - Recebidas: pedidos às atas deste órgão (anuir/recusar/autorizar).
 */

const STATUS_ADESAO: Record<string, string> = {
  SOLICITADA: 'Aguardando anuência do gerenciador',
  ANUENCIA_GERENCIADOR: 'Aguardando aceite do fornecedor',
  ACEITE_FORNECEDOR: 'Aguardando autorização do gerenciador',
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

async function enviar(url: string, corpo: any) {
  const r = await authFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo ?? {}) })
  const b = await r.json().catch(() => null)
  if (!r.ok) throw new Error(Array.isArray(b?.message) ? b.message.join(' ') : b?.message || `HTTP ${r.status}`)
  return b
}

export default function AdesoesAtaPage() {
  const [meuOrgaoId, setMeuOrgaoId] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [atas, setAtas] = useState<any[]>([])
  const [ataSel, setAtaSel] = useState<any>(null)
  const [qtds, setQtds] = useState<Record<string, string>>({})
  const [justificativa, setJustificativa] = useState('')
  const [minhas, setMinhas] = useState<any[]>([])
  const [recebidas, setRecebidas] = useState<any[]>([])
  const [contratar, setContratar] = useState<Record<string, Record<string, string>>>({})
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    try {
      const o = JSON.parse(localStorage.getItem('orgao') || 'null')
      setMeuOrgaoId(o?.id || null)
    } catch {
      setMeuOrgaoId(null)
    }
  }, [])

  const carregarListas = useCallback(async () => {
    const [m, r] = await Promise.all([authFetch(`${API_URL}/api/atas/adesoes/minhas`), authFetch(`${API_URL}/api/atas/adesoes/recebidas`)])
    if (m.ok) setMinhas(await m.json())
    if (r.ok) setRecebidas(await r.json())
  }, [])

  const buscar = useCallback(async () => {
    const qs = new URLSearchParams({ vigentes: 'true', permiteAdesao: 'true' })
    if (busca.trim()) qs.set('busca', busca.trim())
    const r = await authFetch(`${API_URL}/api/atas/publicas/lista?${qs}`)
    if (r.ok) setAtas(await r.json())
  }, [busca])

  useEffect(() => {
    carregarListas()
    buscar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const acao = async (fn: () => Promise<any>, ok?: string) => {
    setOcupado(true)
    try {
      await fn()
      if (ok) toast(ok)
      await carregarListas()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setOcupado(false)
    }
  }

  const pedir = () =>
    acao(async () => {
      const itens = Object.entries(qtds)
        .map(([item_ata_id, q]) => ({ item_ata_id, quantidade: Number(String(q).replace(',', '.')) }))
        .filter((i) => i.quantidade > 0)
      if (!itens.length) throw new Error('Informe a quantidade de pelo menos um item.')
      await enviar(`${API_URL}/api/atas/${ataSel.id}/adesoes`, { justificativa_vantagem: justificativa, itens })
      setAtaSel(null)
      setQtds({})
      setJustificativa('')
    }, 'Pedido de adesão enviado ao órgão gerenciador.')

  const atasDeOutros = atas.filter((a) => a.orgao?.id !== meuOrgaoId)

  return (
    <div className="p-6 space-y-6">
      <Link href="/orgao/atas" className="text-sm text-blue-600 flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Atas de Registro de Preços
      </Link>
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="w-6 h-6" /> Adesão a atas (carona)</h1>
        <p className="text-gray-600 text-sm max-w-3xl">
          Lei 14.133/2021, art. 86: o órgão não participante adere mediante justificativa da vantagem, anuência do gerenciador e
          aceite do fornecedor. Cada adesão: até 50% da quantidade registrada de cada item; o total das adesões: até o dobro.
        </p>
      </div>

      <Tabs defaultValue="aderir">
        <TabsList>
          <TabsTrigger value="aderir">Aderir a uma ata</TabsTrigger>
          <TabsTrigger value="minhas">Minhas adesões ({minhas.length})</TabsTrigger>
          <TabsTrigger value="recebidas">Recebidas ({recebidas.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="aderir" className="space-y-4">
          <Card>
            <CardContent className="pt-6 flex gap-2">
              <Input placeholder="Objeto, item, fornecedor ou órgão…" value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} />
              <Button onClick={buscar}><Search className="w-4 h-4 mr-1" /> Buscar</Button>
            </CardContent>
          </Card>
          {atasDeOutros.length === 0 && <p className="text-sm text-gray-500">Nenhuma ata vigente de outro órgão que admita adesão.</p>}
          {atasDeOutros.map((a) => (
            <Card key={a.id} className={ataSel?.id === a.id ? 'border-blue-400' : ''}>
              <CardHeader>
                <CardTitle className="text-base">Ata {a.numero_ata} — {a.orgao?.nome}</CardTitle>
                <CardDescription>
                  {a.objeto} · Fornecedor {a.fornecedor_razao_social} · vigente até {data(a.data_vigencia_fim)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="py-2">Item</th><th>Descrição</th><th className="text-right">Preço</th><th className="text-right">Registrado</th><th className="text-right">Máx. por órgão (50%)</th>
                      {ataSel?.id === a.id && <th className="text-right">Quantidade</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(a.itens || []).map((i: any) => (
                      <tr key={i.id} className="border-b last:border-0">
                        <td className="py-2">{i.numero_item}</td>
                        <td>{i.descricao}</td>
                        <td className="text-right">{moeda(i.valor_unitario)}</td>
                        <td className="text-right">{qtd(i.quantidade_registrada)}</td>
                        <td className="text-right">{qtd(Number(i.quantidade_registrada) * 0.5)}</td>
                        {ataSel?.id === a.id && (
                          <td className="text-right">
                            <Input className="w-24 ml-auto text-right" inputMode="decimal" value={qtds[i.id] || ''} onChange={(e) => setQtds((p) => ({ ...p, [i.id]: e.target.value }))} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ataSel?.id === a.id ? (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Justificativa e demonstração da vantagem da adesão (pesquisa de preços, compatibilidade com o mercado — art. 86 §2º I e II)"
                      value={justificativa}
                      onChange={(e) => setJustificativa(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button disabled={ocupado} onClick={pedir}>Enviar pedido de adesão</Button>
                      <Button variant="outline" onClick={() => setAtaSel(null)}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" onClick={() => { setAtaSel(a); setQtds({}) }}>Pedir adesão</Button>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="minhas" className="space-y-3">
          {minhas.length === 0 && <p className="text-sm text-gray-500">Nenhuma adesão pedida por este órgão.</p>}
          {minhas.map((ad) => (
            <Card key={ad.id}>
              <CardHeader>
                <div className="flex flex-wrap justify-between gap-2">
                  <CardTitle className="text-base">Ata {ad.numero_ata} — {ad.orgao_gerenciador_nome}</CardTitle>
                  <Badge variant={ad.status === 'AUTORIZADA' ? 'default' : ad.status === 'RECUSADA' ? 'destructive' : 'secondary'}>{STATUS_ADESAO[ad.status] || ad.status}</Badge>
                </div>
                <CardDescription>{ad.objeto} · Fornecedor {ad.fornecedor_razao_social}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b"><th className="py-2">Item</th><th>Descrição</th><th className="text-right">Preço</th><th className="text-right">Autorizado</th><th className="text-right">Usado</th><th className="text-right">Saldo</th>{ad.status === 'AUTORIZADA' && <th className="text-right">Contratar</th>}</tr>
                  </thead>
                  <tbody>
                    {ad.itens.map((i: any) => (
                      <tr key={i.id} className="border-b last:border-0">
                        <td className="py-2">{i.numero_item}</td>
                        <td>{i.descricao}</td>
                        <td className="text-right">{moeda(i.valor_unitario)}</td>
                        <td className="text-right">{qtd(i.quantidade)}</td>
                        <td className="text-right">{qtd(i.quantidade_utilizada)}</td>
                        <td className="text-right">{qtd(i.saldo)}</td>
                        {ad.status === 'AUTORIZADA' && (
                          <td className="text-right">
                            <Input
                              className="w-24 ml-auto text-right"
                              inputMode="decimal"
                              value={contratar[ad.id]?.[i.item_ata_id] || ''}
                              onChange={(e) => setContratar((p) => ({ ...p, [ad.id]: { ...(p[ad.id] || {}), [i.item_ata_id]: e.target.value } }))}
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ad.motivo_recusa && <p className="text-sm text-red-600">Motivo: {ad.motivo_recusa}</p>}
                {ad.prazo_contratacao && <p className="text-xs text-gray-500">Contratar até {data(ad.prazo_contratacao)}</p>}
                <div className="flex gap-2">
                  {ad.status === 'AUTORIZADA' && (
                    <Button
                      size="sm"
                      disabled={ocupado}
                      onClick={() =>
                        acao(async () => {
                          const itens = Object.entries(contratar[ad.id] || {})
                            .map(([item_ata_id, q]) => ({ item_ata_id, quantidade: Number(String(q).replace(',', '.')) }))
                            .filter((i) => i.quantidade > 0)
                          if (!itens.length) throw new Error('Informe as quantidades.')
                          const r = await enviar(`${API_URL}/api/atas/${ad.ata_id}/contratar`, { adesao_id: ad.id, tipo: 'CONTRATO', itens })
                          setContratar((p) => ({ ...p, [ad.id]: {} }))
                          toast(`Contrato ${r.contrato.numero_contrato} criado — aguardando assinatura.`)
                        })
                      }
                    >
                      Gerar contrato pela adesão
                    </Button>
                  )}
                  {['SOLICITADA', 'ANUENCIA_GERENCIADOR', 'ACEITE_FORNECEDOR'].includes(ad.status) && (
                    <Button size="sm" variant="outline" disabled={ocupado} onClick={async () => (await confirmarAcao({ titulo: 'Confirmação', mensagem: 'Desistir desta adesão?' })) && acao(() => enviar(`${API_URL}/api/atas/adesoes/${ad.id}/cancelar`, {}))}>
                      Desistir
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="recebidas" className="space-y-3">
          {recebidas.length === 0 && <p className="text-sm text-gray-500">Nenhum pedido de adesão às atas deste órgão.</p>}
          {recebidas.map((ad) => (
            <Card key={ad.id}>
              <CardHeader>
                <div className="flex flex-wrap justify-between gap-2">
                  <CardTitle className="text-base">{ad.orgao_aderente_nome} → Ata {ad.numero_ata}</CardTitle>
                  <Badge variant="secondary">{STATUS_ADESAO[ad.status] || ad.status}</Badge>
                </div>
                <CardDescription>{ad.justificativa_vantagem}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <ul className="text-sm">
                  {ad.itens.map((i: any) => (
                    <li key={i.id}>Item {i.numero_item} — {i.descricao}: {qtd(i.quantidade)} de {qtd(i.quantidade_registrada)} registrados</li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  {ad.status === 'SOLICITADA' && (
                    <>
                      <Button size="sm" disabled={ocupado} onClick={() => acao(() => enviar(`${API_URL}/api/atas/adesoes/${ad.id}/anuencia`, { aceitar: true }), 'Anuência registrada.')}>Anuir</Button>
                      <Button size="sm" variant="outline" disabled={ocupado} onClick={async () => {
                        const motivo = (await pedirTextoAcao({ titulo: 'Motivo da recusa:' }))
                        if (motivo) acao(() => enviar(`${API_URL}/api/atas/adesoes/${ad.id}/anuencia`, { aceitar: false, motivo }))
                      }}>Recusar</Button>
                    </>
                  )}
                  {ad.status === 'ACEITE_FORNECEDOR' && (
                    <Button size="sm" disabled={ocupado} onClick={() => acao(() => enviar(`${API_URL}/api/atas/adesoes/${ad.id}/autorizar`, {}), 'Adesão autorizada.')}>Autorizar</Button>
                  )}
                  <Button size="sm" variant="ghost" asChild><Link href={`/orgao/atas/${ad.ata_id}?aba=adesoes`}>Ver ata</Link></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}

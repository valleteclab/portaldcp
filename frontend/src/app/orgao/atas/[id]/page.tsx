'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, CalendarClock, CheckCircle, FilePen, FileText, Package, Send, Users, XCircle } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'

/**
 * ATA DE REGISTRO DE PREÇOS — painel do órgão GERENCIADOR (Lei 14.133/2021
 * arts. 82–86): itens e saldo, contratar a partir da ata, consumos, adesões
 * (anuência/autorização), cadastro de reserva, assinatura e vigência
 * (prorrogação única / cancelamento do registro).
 */

const STATUS: Record<string, { label: string; cor: string }> = {
  AGUARDANDO_ASSINATURA: { label: 'Aguardando assinatura', cor: 'bg-blue-100 text-blue-800' },
  VIGENTE: { label: 'Vigente', cor: 'bg-green-100 text-green-800' },
  ESGOTADA: { label: 'Esgotada', cor: 'bg-yellow-100 text-yellow-800' },
  SUSPENSA: { label: 'Suspensa', cor: 'bg-orange-100 text-orange-800' },
  VENCIDA: { label: 'Vencida', cor: 'bg-gray-100 text-gray-800' },
  ENCERRADA: { label: 'Encerrada', cor: 'bg-gray-100 text-gray-800' },
  CANCELADA: { label: 'Cancelada', cor: 'bg-red-100 text-red-800' },
}
const STATUS_ADESAO: Record<string, string> = {
  SOLICITADA: 'Aguardando anuência do gerenciador',
  ANUENCIA_GERENCIADOR: 'Aguardando aceite do fornecedor',
  ACEITE_FORNECEDOR: 'Aguardando autorização',
  AUTORIZADA: 'Autorizada',
  RECUSADA: 'Recusada',
  CANCELADA: 'Cancelada pelo aderente',
}
const STATUS_RESERVA: Record<string, string> = {
  PENDENTE: 'Prazo em curso',
  ADERIU: 'Aderiu ao preço do vencedor',
  RECUSOU: 'Recusou',
  EXPIRADO: 'Não respondeu no prazo',
  CONVOCADO: 'Convocado (assumiu o saldo)',
}

const moeda = (v: any) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 4 })
const qtd = (v: any) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 })
// Colunas date ('YYYY-MM-DD') sem deslocar o dia pelo fuso
const data = (v: any) => {
  if (!v) return '—'
  const [a, m, d] = String(v).slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}
const dataHora = (v: any) => (v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—')

export default function AtaDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const search = useSearchParams()
  const [painel, setPainel] = useState<any>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [aba, setAba] = useState<string>(search.get('aba') || 'itens')

  // Contratar
  const [tipo, setTipo] = useState<'CONTRATO' | 'ORDEM'>('CONTRATO')
  const [quantidades, setQuantidades] = useState<Record<string, string>>({})
  const [prazo, setPrazo] = useState('30')
  // Vigência
  const [prorMeses, setProrMeses] = useState('12')
  const [prorMotivo, setProrMotivo] = useState('')
  const [cancHipotese, setCancHipotese] = useState('')
  const [cancMotivo, setCancMotivo] = useState('')

  const carregar = useCallback(async () => {
    setErro(null)
    const r = await authFetch(`${API_URL}/api/atas/${id}/painel`)
    const b = await r.json().catch(() => null)
    if (!r.ok) {
      setErro(b?.message || `HTTP ${r.status}`)
      return
    }
    setPainel(b)
  }, [id])

  useEffect(() => {
    carregar()
  }, [carregar])

  const ato = async (caminho: string, corpo?: any, sucesso?: string) => {
    setOcupado(true)
    try {
      const r = await authFetch(`${API_URL}/api/atas/${caminho}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo ?? {}),
      })
      const b = await r.json().catch(() => null)
      if (!r.ok) throw new Error(Array.isArray(b?.message) ? b.message.join(' ') : b?.message || `HTTP ${r.status}`)
      if (sucesso) alert(sucesso)
      await carregar()
      return b
    } catch (e: any) {
      alert(e.message)
      return null
    } finally {
      setOcupado(false)
    }
  }

  if (erro) {
    return (
      <div className="p-6 space-y-4">
        <Link href="/orgao/atas" className="text-sm text-blue-600 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Atas
        </Link>
        <Card>
          <CardContent className="pt-6 text-red-600">{erro}</CardContent>
        </Card>
      </div>
    )
  }
  if (!painel) return <div className="p-8 text-center text-gray-500">Carregando ata…</div>

  const a = painel.ata
  const st = STATUS[a.status] || { label: a.status, cor: '' }
  const consumivel = ['VIGENTE', 'ESGOTADA'].includes(a.status) && !a.vencida
  const reservaPendente = (painel.reserva || []).filter((r: any) => r.status === 'PENDENTE').length

  const contratar = async () => {
    const itens = Object.entries(quantidades)
      .map(([item_ata_id, q]) => ({ item_ata_id, quantidade: Number(String(q).replace(',', '.')) }))
      .filter((i) => i.quantidade > 0)
    if (!itens.length) return alert('Informe a quantidade de pelo menos um item.')
    const r = await ato(`${id}/contratar`, { tipo, itens, prazo_execucao_dias: Number(prazo) || 30 })
    if (r?.contrato) {
      setQuantidades({})
      alert(`${r.contrato.tipo === 'CONTRATO' ? 'Contrato' : 'Ordem'} ${r.contrato.numero_contrato} criado(a) — aguardando assinatura (${moeda(r.valor_total)}).`)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <Link href="/orgao/atas" className="text-sm text-blue-600 flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Atas de Registro de Preços
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge className={st.cor}>{st.label}</Badge>
            {a.origem === 'RESERVA' && <Badge variant="outline">Cadastro de reserva</Badge>}
            {a.prorrogada && <Badge variant="outline">Prorrogada</Badge>}
            {a.enviado_pncp && (
              <Badge variant="secondary">
                <CheckCircle className="w-3 h-3 mr-1" /> PNCP
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-bold">Ata nº {a.numero_ata}</h1>
          <p className="text-gray-600 max-w-3xl">{a.objeto}</p>
          <p className="text-sm text-gray-500 mt-1">
            Fornecedor: <strong>{a.fornecedor_razao_social}</strong> · Processo {painel.licitacao?.numero_processo || '—'}
          </p>
        </div>
        <Card className="min-w-[280px]">
          <CardContent className="pt-4 text-sm space-y-1">
            <div className="flex justify-between gap-4"><span className="text-gray-500">Registrado</span><strong>{moeda(a.valor_total)}</strong></div>
            <div className="flex justify-between gap-4"><span className="text-gray-500">Utilizado</span><span>{moeda(a.valor_utilizado)}</span></div>
            <div className="flex justify-between gap-4"><span className="text-gray-500">Saldo</span><strong className="text-green-700">{moeda(a.valor_saldo)}</strong></div>
            <div className="flex justify-between gap-4 pt-1 border-t"><span className="text-gray-500">Vigência</span><span>{data(a.data_vigencia_inicio)} a {data(a.data_vigencia_fim)}</span></div>
            <div className="flex justify-between gap-4"><span className="text-gray-500">Assinatura</span><span>{data(a.data_assinatura)}</span></div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="itens">Itens e saldo</TabsTrigger>
          <TabsTrigger value="contratar">Contratar</TabsTrigger>
          <TabsTrigger value="consumos">Consumos ({painel.consumos?.length || 0})</TabsTrigger>
          <TabsTrigger value="adesoes">Adesões ({painel.adesoes?.length || 0})</TabsTrigger>
          <TabsTrigger value="reserva">Cadastro de reserva</TabsTrigger>
          <TabsTrigger value="assinatura">Assinatura</TabsTrigger>
          <TabsTrigger value="vigencia">Vigência</TabsTrigger>
        </TabsList>

        {/* ITENS */}
        <TabsContent value="itens">
          <Card>
            <CardHeader>
              <CardTitle>Itens registrados</CardTitle>
              <CardDescription>
                Saldo do gerenciador = registrado − consumido. Adesões têm contadores separados: até 50% do registrado por órgão
                aderente e, no total, até o dobro (art. 86 §§4º e 5º).
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2">Item</th><th>Descrição</th><th>Un.</th><th className="text-right">Preço</th>
                    <th className="text-right">Registrado</th><th className="text-right">Utilizado</th><th className="text-right">Saldo</th>
                    <th className="text-right">Adesões (autoriz./usado)</th><th className="text-right">Limite total adesões</th>
                  </tr>
                </thead>
                <tbody>
                  {painel.itens.map((i: any) => (
                    <tr key={i.id} className="border-b last:border-0">
                      <td className="py-2">{i.numero_item}</td>
                      <td>{i.descricao}{i.marca ? <span className="text-gray-500"> — {i.marca}</span> : null}</td>
                      <td>{i.unidade_medida}</td>
                      <td className="text-right">{moeda(i.valor_unitario)}</td>
                      <td className="text-right">{qtd(i.quantidade_registrada)}</td>
                      <td className="text-right">{qtd(i.quantidade_utilizada)}</td>
                      <td className="text-right font-semibold">{qtd(i.quantidade_saldo)}</td>
                      <td className="text-right">{qtd(i.quantidade_adesao_autorizada)} / {qtd(i.quantidade_adesao_utilizada)}</td>
                      <td className="text-right">{qtd(i.limite_adesao_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CONTRATAR */}
        <TabsContent value="contratar">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Package className="w-5 h-5" /> Contratar a partir da ata</CardTitle>
              <CardDescription>
                Cria o contrato ou a ordem (fornecimento/serviço) com os itens e preços da ata, aguardando assinatura no cadastro de
                contratos. O saldo é consumido na hora; a quantidade nunca passa do saldo (art. 83: o registro não obriga a contratar).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!consumivel ? (
                <p className="text-amber-700 text-sm">A ata não admite contratação na situação atual ({st.label}{a.vencida ? ', vigência encerrada' : ''}).</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-4 items-end">
                    <div>
                      <label className="text-xs text-gray-500 block">Instrumento</label>
                      <select className="border rounded-md h-9 px-2 text-sm bg-white" value={tipo} onChange={(e) => setTipo(e.target.value as any)}>
                        <option value="CONTRATO">Contrato</option>
                        <option value="ORDEM">Ordem de fornecimento/serviço</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block">Prazo de execução (dias)</label>
                      <Input className="w-32" inputMode="numeric" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="py-2">Item</th><th>Descrição</th><th className="text-right">Preço</th><th className="text-right">Saldo</th><th className="text-right">Quantidade</th><th className="text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {painel.itens.map((i: any) => {
                        const q = Number(String(quantidades[i.id] || '0').replace(',', '.')) || 0
                        return (
                          <tr key={i.id} className="border-b last:border-0">
                            <td className="py-2">{i.numero_item}</td>
                            <td>{i.descricao}</td>
                            <td className="text-right">{moeda(i.valor_unitario)}</td>
                            <td className="text-right">{qtd(i.quantidade_saldo)}</td>
                            <td className="text-right">
                              <Input
                                className={`w-28 ml-auto text-right ${q > i.quantidade_saldo ? 'border-red-500' : ''}`}
                                inputMode="decimal"
                                value={quantidades[i.id] || ''}
                                disabled={i.quantidade_saldo <= 0}
                                onChange={(e) => setQuantidades((p) => ({ ...p, [i.id]: e.target.value }))}
                              />
                            </td>
                            <td className="text-right">{moeda(q * i.valor_unitario)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <div className="flex justify-end">
                    <Button onClick={contratar} disabled={ocupado}>
                      <FileText className="w-4 h-4 mr-2" /> {tipo === 'CONTRATO' ? 'Gerar contrato' : 'Gerar ordem'}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CONSUMOS */}
        <TabsContent value="consumos">
          <Card>
            <CardHeader><CardTitle>Consumos do saldo</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {!painel.consumos?.length ? (
                <p className="text-sm text-gray-500">Nenhum consumo registrado.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="py-2">Data</th><th>Item</th><th className="text-right">Quantidade</th><th className="text-right">Valor</th><th>Origem</th><th>Órgão</th><th>Instrumento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {painel.consumos.map((c: any) => (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="py-2">{data(c.data)}</td>
                        <td>{c.numero_item}</td>
                        <td className="text-right">{qtd(c.quantidade)}</td>
                        <td className="text-right">{moeda(c.valor_total)}</td>
                        <td>{c.adesao_id ? `Adesão · ${c.origem}` : c.origem}</td>
                        <td>{c.orgao_consumidor_nome || '—'}</td>
                        <td>
                          {c.contrato_id ? (
                            c.adesao_id ? `${c.numero_contrato} (${c.contrato_status})` : <Link className="text-blue-600" href={`/orgao/contratos/${c.contrato_id}`}>{c.numero_contrato}</Link>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ADESÕES */}
        <TabsContent value="adesoes">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> Adesões (órgãos não participantes)</CardTitle>
              <CardDescription>
                Fluxo do art. 86 §2º: pedido com justificativa de vantagem → anuência do gerenciador → aceite do fornecedor →
                autorização (limites conferidos de novo). O aderente contrata em até 90 dias da autorização, dentro da vigência.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!painel.adesoes?.length && <p className="text-sm text-gray-500">Nenhum pedido de adesão.</p>}
              {painel.adesoes?.map((ad: any) => (
                <div key={ad.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <div>
                      <strong>{ad.orgao_aderente_nome}</strong>
                      <span className="text-xs text-gray-500 ml-2">pedido em {dataHora(ad.created_at)}</span>
                    </div>
                    <Badge variant={ad.status === 'AUTORIZADA' ? 'default' : ad.status === 'RECUSADA' ? 'destructive' : 'secondary'}>
                      {STATUS_ADESAO[ad.status] || ad.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-700">{ad.justificativa_vantagem}</p>
                  <ul className="text-sm text-gray-600">
                    {ad.itens.map((i: any) => (
                      <li key={i.id}>Item {i.numero_item}: {qtd(i.quantidade)} (usado {qtd(i.quantidade_utilizada)})</li>
                    ))}
                  </ul>
                  {ad.motivo_recusa && <p className="text-sm text-red-600">Motivo: {ad.motivo_recusa}</p>}
                  {ad.prazo_contratacao && <p className="text-xs text-gray-500">Contratar até {data(ad.prazo_contratacao)}</p>}
                  <div className="flex gap-2">
                    {ad.status === 'SOLICITADA' && (
                      <>
                        <Button size="sm" disabled={ocupado} onClick={() => ato(`adesoes/${ad.id}/anuencia`, { aceitar: true }, 'Anuência registrada — aguardando o aceite do fornecedor.')}>
                          Anuir
                        </Button>
                        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => {
                          const motivo = prompt('Motivo da recusa:')
                          if (motivo) ato(`adesoes/${ad.id}/anuencia`, { aceitar: false, motivo })
                        }}>Recusar</Button>
                      </>
                    )}
                    {ad.status === 'ACEITE_FORNECEDOR' && (
                      <Button size="sm" disabled={ocupado} onClick={() => ato(`adesoes/${ad.id}/autorizar`, {}, 'Adesão autorizada.')}>
                        Autorizar adesão
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* RESERVA */}
        <TabsContent value="reserva">
          <Card>
            <CardHeader>
              <CardTitle>Cadastro de reserva</CardTitle>
              <CardDescription>
                Demais licitantes, na ordem de classificação, convocados a cotar ao preço do vencedor (art. 82 VII; Decreto
                11.462/2023 art. 18). Cancelado o registro do fornecedor, o primeiro que aderiu é convocado.
                {a.prazo_cadastro_reserva ? ` Prazo para aderir: ${dataHora(a.prazo_cadastro_reserva)}.` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!painel.reserva?.length ? (
                <p className="text-sm text-gray-500">Sem licitantes no cadastro de reserva.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b"><th className="py-2">Item</th><th>Ordem</th><th>Licitante</th><th>Oferta original</th><th>Situação</th></tr>
                  </thead>
                  <tbody>
                    {painel.reserva.map((r: any) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-2">{r.numero_item}</td>
                        <td>{r.posicao}º</td>
                        <td>{r.razao_social}</td>
                        <td>{r.valor_ofertado != null ? moeda(r.valor_ofertado) : '—'}</td>
                        <td>{STATUS_RESERVA[r.status] || r.status}{r.ata_convocada_id ? <> — <Link className="text-blue-600" href={`/orgao/atas/${r.ata_convocada_id}`}>nova ata</Link></> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ASSINATURA */}
        <TabsContent value="assinatura">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FilePen className="w-5 h-5" /> Assinatura da ata</CardTitle>
              <CardDescription>
                Termo em PDF assinado eletronicamente pelo órgão e pelo fornecedor. Na última assinatura a ata passa a VIGENTE, a
                vigência conta da data da assinatura e a ata é publicada no PNCP.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {painel.assinatura ? (
                <>
                  <p className="text-sm">Documento: <strong>{painel.assinatura.status}</strong></p>
                  <ul className="text-sm">
                    {painel.assinatura.signatarios.map((s: any, i: number) => (
                      <li key={i}>{s.is_orgao_user ? 'Órgão' : 'Fornecedor'}: {s.nome} — {s.status}{s.data_assinatura ? ` em ${dataHora(s.data_assinatura)}` : ''}</li>
                    ))}
                  </ul>
                  <Button variant="outline" asChild size="sm"><Link href="/orgao/portal-assinaturas">Abrir o Portal de Assinaturas</Link></Button>
                </>
              ) : a.status === 'AGUARDANDO_ASSINATURA' ? (
                <>
                  {reservaPendente > 0 && (
                    <p className="text-sm text-amber-700">
                      {reservaPendente} licitante(s) ainda no prazo para aderir ao cadastro de reserva — o termo é gerado depois das respostas ou do fim do prazo.
                    </p>
                  )}
                  <Button disabled={ocupado} onClick={() => ato(`${id}/assinaturas`, {}, 'Termo gerado e assinaturas solicitadas.')}>
                    <Send className="w-4 h-4 mr-2" /> Gerar termo e solicitar assinaturas
                  </Button>
                </>
              ) : (
                <p className="text-sm text-gray-500">Ata sem fluxo de assinatura no sistema (cadastro manual).</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* VIGÊNCIA */}
        <TabsContent value="vigencia">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CalendarClock className="w-5 h-5" /> Prorrogação (art. 84)</CardTitle>
                <CardDescription>Uma única vez, por até 12 meses, antes do fim da vigência, comprovado o preço vantajoso.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {a.prorrogada ? (
                  <p className="text-sm">Prorrogada por {a.prorrogacao_meses} mês(es) em {dataHora(a.prorrogada_em)} (fim anterior {data(a.data_vigencia_fim_original)}). Motivo: {a.prorrogacao_motivo}</p>
                ) : (
                  <>
                    <div>
                      <label className="text-xs text-gray-500">Meses (1 a 12)</label>
                      <Input className="w-24" inputMode="numeric" value={prorMeses} onChange={(e) => setProrMeses(e.target.value)} />
                    </div>
                    <Textarea placeholder="Motivo e comprovação do preço vantajoso" value={prorMotivo} onChange={(e) => setProrMotivo(e.target.value)} />
                    <Button disabled={ocupado || !consumivel} onClick={() => ato(`${id}/prorrogar`, { meses: Number(prorMeses), motivo: prorMotivo }, 'Vigência prorrogada.')}>
                      Prorrogar
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><XCircle className="w-5 h-5" /> Cancelamento do registro</CardTitle>
                <CardDescription>Decreto 11.462/2023 arts. 28–29. Convoca o próximo do cadastro de reserva para o saldo.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {a.status === 'CANCELADA' ? (
                  <p className="text-sm">Cancelada em {dataHora(a.cancelada_em)} — {painel.hipoteses_cancelamento?.[a.cancelamento_hipotese] || a.cancelamento_hipotese}. {a.cancelamento_motivo}</p>
                ) : (
                  <>
                    <select className="w-full border rounded-md h-9 px-2 text-sm bg-white" value={cancHipotese} onChange={(e) => setCancHipotese(e.target.value)}>
                      <option value="">— hipótese —</option>
                      {Object.entries(painel.hipoteses_cancelamento || {}).map(([k, v]) => (
                        <option key={k} value={k}>{String(v)}</option>
                      ))}
                    </select>
                    <Textarea placeholder="Motivo (fatos e fundamento; contraditório assegurado)" value={cancMotivo} onChange={(e) => setCancMotivo(e.target.value)} />
                    <Button
                      variant="destructive"
                      disabled={ocupado || !['VIGENTE', 'ESGOTADA', 'AGUARDANDO_ASSINATURA'].includes(a.status)}
                      onClick={async () => {
                        if (!confirm('Cancelar o registro do fornecedor nesta ata? A ata deixa de admitir contratações.')) return
                        const r = await ato(`${id}/cancelar-registro`, { hipotese: cancHipotese, motivo: cancMotivo })
                        if (r) alert(r.convocadas?.length ? `Convocado(s) do cadastro de reserva: ${r.convocadas.map((c: any) => `${c.fornecedor_razao_social} (ata ${c.numero_ata})`).join(', ')}` : 'Registro cancelado. Não há cadastro de reserva para o saldo.')
                      }}
                    >
                      Cancelar registro
                    </Button>
                  </>
                )}
                {painel.atas_relacionadas?.length > 0 && (
                  <div className="text-sm">
                    Atas relacionadas:{' '}
                    {painel.atas_relacionadas.map((x: any) => (
                      <Link key={x.id} className="text-blue-600 mr-2" href={`/orgao/atas/${x.id}`}>{x.numero_ata} ({x.fornecedor_razao_social})</Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  ClipboardList, Plus, CheckCircle, XCircle, Loader2, Search,
  Copy, Trash2, QrCode, Share2,
} from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'

interface Veiculo { id: string; placa: string; modelo: string; marca: string; tipo_combustivel: string; chassi?: string; renavam?: string; ativo?: boolean }
interface Contrato { id: string; numero_contrato: string; fornecedor_nome: string; preco_litro: number; limite_litros_mensal?: number; itens?: { descricao: string; preco_litro: number; quantidade_contratada: number; quantidade_consumida?: number; valor_total: number }[] }

interface Requisicao {
  id: string; codigo: string; codigo_posto?: string; solicitante_nome: string; solicitante_cargo?: string
  veiculo_placa: string; veiculo_modelo?: string; tipo_combustivel: string
  quantidade_autorizada: number; quantidade_abastecida?: number; finalidade: string
  status: string; data_requisicao: string; data_autorizacao?: string
  autorizado_por?: string; motivo_negacao?: string; data_abastecimento?: string
  valor_total?: number; contrato?: Contrato; token_acesso?: string
}

const TIPOS_COMBUSTIVEL = ['GASOLINA', 'ETANOL', 'DIESEL', 'FLEX', 'GNV', 'ELETRICO']
const LABEL_COMB: Record<string, string> = { GASOLINA: 'Gasolina', ETANOL: 'Etanol', DIESEL: 'Diesel', FLEX: 'Flex', GNV: 'GNV', ELETRICO: 'Elétrico' }

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const fmtLitros = (v: number, dec = 3) => `${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })} L`
const fmtData = (d: string) => {
  if (!d) return '—'
  const dt = new Date(d)
  const isTimestamp = d.includes('T')
  if (isTimestamp) return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')} · ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`
  return d.split('-').reverse().join('/')
}

const statusBadge = (s: string) => {
  switch (s) {
    case 'ABASTECIDO': return <Badge className="bg-green-100 text-green-800 border-green-200">✓ Abastecido</Badge>
    case 'AUTORIZADO': return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">⏳ Autorizado</Badge>
    case 'PENDENTE': return <Badge className="bg-blue-100 text-blue-800 border-blue-200">🔵 Pendente</Badge>
    case 'NEGADO': return <Badge className="bg-red-100 text-red-800 border-red-200">✗ Negado</Badge>
    case 'CANCELADO': return <Badge variant="secondary">Cancelado</Badge>
    default: return <Badge>{s}</Badge>
  }
}

const vazio = {
  solicitante_nome: '', solicitante_cargo: '', veiculo_id: '', veiculo_placa: '',
  veiculo_modelo: '', tipo_combustivel: 'GASOLINA', quantidade_autorizada: '',
  finalidade: '', data_requisicao: new Date().toISOString().split('T')[0], observacoes: '',
}

export default function RequisicoesPage() {
  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([])
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7))
  const [filtroStatus, setFiltroStatus] = useState('TODOS')
  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(vazio)

  const [modalNegar, setModalNegar] = useState(false)
  const [reqSelecionada, setReqSelecionada] = useState<Requisicao | null>(null)
  const [motivoNegacao, setMotivoNegacao] = useState('')
  const [contratoAtivo, setContratoAtivo] = useState<Contrato | null>(null)
  const [erroSaldo, setErroSaldo] = useState<string | null>(null)
  const [podeExcluirRequisicao, setPodeExcluirRequisicao] = useState(false)

  const carregarContratoAtivo = useCallback(async () => {
    const res = await authFetch(`${API_URL}/api/frota/contratos/ativo`)
    if (res.ok) {
      const data = await res.json()
      setContratoAtivo(data)
    } else {
      setContratoAtivo(null)
    }
  }, [])

  const carregar = useCallback(async () => {
    const params = new URLSearchParams({ mes })
    if (filtroStatus !== 'TODOS') params.set('status', filtroStatus)
    const [resReq, resVeic, resPodeExcluir] = await Promise.all([
      authFetch(`${API_URL}/api/frota/requisicoes?${params}`),
      authFetch(`${API_URL}/api/frota/veiculos`),
      authFetch(`${API_URL}/api/frota/requisicoes/posso-excluir`),
    ])
    if (resReq.ok) setRequisicoes(await resReq.json())
    if (resVeic.ok) setVeiculos(await resVeic.json())
    if (resPodeExcluir.ok) {
      const { pode } = await resPodeExcluir.json()
      setPodeExcluirRequisicao(!!pode)
    }
    setLoading(false)
  }, [mes, filtroStatus])

  useEffect(() => { carregar() }, [carregar])

  const abrirModal = () => {
    setForm(vazio)
    setErroSaldo(null)
    setModalOpen(true)
    carregarContratoAtivo()
  }

  const onVeiculoChange = (id: string) => {
    const v = veiculos.find(v => v.id === id)
    setForm(f => ({
      ...f, veiculo_id: id,
      veiculo_placa: v?.placa || '', veiculo_modelo: v ? `${v.modelo} (${v.marca})` : '',
      tipo_combustivel: v?.tipo_combustivel || f.tipo_combustivel,
    }))
  }

  const salvar = async () => {
    setActionLoading(true)
    setErroSaldo(null)
    try {
      const payload = {
        ...form,
        quantidade_autorizada: parseFloat(form.quantidade_autorizada as any) || 0,
        veiculo_id: form.veiculo_id || undefined,
      }
      const res = await authFetch(`${API_URL}/api/frota/requisicoes`, { method: 'POST', body: JSON.stringify(payload) })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        const msg = e.message || 'Erro ao criar requisição'
        setErroSaldo(msg)
        return
      }
      setModalOpen(false)
      carregar()
    } finally { setActionLoading(false) }
  }

  const getSaldoParaTipo = (tipo: string): number | null => {
    if (!contratoAtivo?.itens?.length) return null
    const tipoNorm = String(tipo || '').toLowerCase()
    const item = contratoAtivo.itens.find((i) => {
      const desc = String(i.descricao || '').toLowerCase()
      return desc.includes(tipoNorm) || tipoNorm.includes(desc) || desc === tipoNorm
    })
    if (!item) return null
    const qtdContratada = Number(item.quantidade_contratada) || 0
    const qtdConsumida = Number(item.quantidade_consumida ?? 0) || 0
    return Math.max(0, qtdContratada - qtdConsumida)
  }

  const autorizar = async (req: Requisicao) => {
    setActionLoading(true)
    try {
      const res = await authFetch(`${API_URL}/api/frota/requisicoes/${req.id}/autorizar`, { method: 'PUT' })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro'); return }
      const atualizada: Requisicao = await res.json()
      carregar()
      if (atualizada.token_acesso) {
        window.open(`/frota/req/${atualizada.token_acesso}`, '_blank')
      }
    } finally { setActionLoading(false) }
  }

  const confirmarNegar = async () => {
    if (!reqSelecionada) return
    setActionLoading(true)
    try {
      const res = await authFetch(`${API_URL}/api/frota/requisicoes/${reqSelecionada.id}/negar`, {
        method: 'PUT', body: JSON.stringify({ motivo: motivoNegacao }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro'); return }
      setModalNegar(false); setReqSelecionada(null); setMotivoNegacao(''); carregar()
    } finally { setActionLoading(false) }
  }

  const cancelar = async (req: Requisicao) => {
    if (!confirm(`Cancelar a requisição ${req.codigo}?`)) return
    await authFetch(`${API_URL}/api/frota/requisicoes/${req.id}/cancelar`, { method: 'PUT' })
    carregar()
  }

  const excluir = async (req: Requisicao) => {
    if (!confirm('Excluir esta requisição? O saldo do contrato será restaurado.')) return
    setActionLoading(true)
    try {
      const res = await authFetch(`${API_URL}/api/frota/requisicoes/${req.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        alert(e.message || 'Erro ao excluir')
        return
      }
      carregar()
    } finally { setActionLoading(false) }
  }

  const copiarCodigo = (codigo: string) => {
    navigator.clipboard?.writeText(codigo).catch(() => {})
  }

  const compartilharWhatsApp = (token: string) => {
    const url = `${window.location.origin}/frota/req/${token}`
    const texto = `📋 Ordem de Fornecimento de Combustível\n\nAcesse o link para ver a autorização e QR Code:\n${url}`
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')
  }

  const filtradas = requisicoes.filter(r => {
    if (!search) return true
    return [r.codigo, r.solicitante_nome, r.veiculo_placa].some(v => v?.toLowerCase().includes(search.toLowerCase()))
  })

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-blue-600" />Requisições de Abastecimento
        </h1>
        <Button onClick={abrirModal}><Plus className="w-4 h-4 mr-2" />Nova Requisição</Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <Input type="month" className="w-36" value={mes} onChange={e => setMes(e.target.value)} />
        <select
          className="border rounded-md px-2 py-1.5 text-sm text-gray-700"
          value={filtroStatus}
          onChange={e => setFiltroStatus(e.target.value)}
        >
          <option value="TODOS">Todos os status</option>
          <option value="PENDENTE">Pendente</option>
          <option value="AUTORIZADO">Autorizado</option>
          <option value="ABASTECIDO">Abastecido</option>
          <option value="NEGADO">Negado</option>
          <option value="CANCELADO">Cancelado</option>
        </select>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input className="pl-8 w-52 text-sm" placeholder="Buscar código, solicitante, placa..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-xs uppercase text-gray-500">
                <TableHead>Código</TableHead>
                <TableHead>Solicitante</TableHead>
                <TableHead>Placa / Veículo</TableHead>
                <TableHead>Combustível</TableHead>
                <TableHead className="text-right">Qtd. Auth.</TableHead>
                <TableHead className="text-right">Abastecido</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center py-10 text-gray-400">Nenhuma requisição encontrada</TableCell></TableRow>
              )}
              {filtradas.map(r => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-blue-600 font-medium text-sm">{r.codigo}</span>
                      <button onClick={() => copiarCodigo(r.codigo)} className="text-gray-300 hover:text-gray-500">
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                    {r.codigo_posto && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="font-mono text-orange-600 font-semibold text-xs tracking-wider">{r.codigo_posto}</span>
                        <span className="text-xs text-gray-400">posto</span>
                      </div>
                    )}
                    <p className="text-xs text-gray-400">{fmtData(r.data_requisicao)}</p>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{r.solicitante_nome}</p>
                    {r.solicitante_cargo && <p className="text-xs text-gray-400">{r.solicitante_cargo}</p>}
                  </TableCell>
                  <TableCell>
                    <p className="font-mono font-semibold text-sm">{r.veiculo_placa}</p>
                    {r.veiculo_modelo && <p className="text-xs text-gray-400">{r.veiculo_modelo}</p>}
                  </TableCell>
                  <TableCell className="text-sm">{LABEL_COMB[r.tipo_combustivel] || r.tipo_combustivel}</TableCell>
                  <TableCell className="text-right font-semibold text-orange-600">{fmtLitros(r.quantidade_autorizada)}</TableCell>
                  <TableCell className="text-right">
                    {r.status === 'ABASTECIDO' ? <span className="text-green-700 font-semibold">{fmtLitros(r.quantidade_abastecida || 0)}</span> : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === 'ABASTECIDO' ? fmt(r.valor_total || 0) : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-gray-500">{fmtData(r.data_requisicao)}</TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {r.status === 'PENDENTE' && (
                        <>
                          <Button size="sm" variant="ghost" className="text-green-600 hover:text-green-800 text-xs px-2" onClick={() => autorizar(r)}>
                            <CheckCircle className="w-3.5 h-3.5 mr-1" />Auth.
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 text-xs px-2"
                            onClick={() => { setReqSelecionada(r); setMotivoNegacao(''); setModalNegar(true) }}>
                            <XCircle className="w-3.5 h-3.5 mr-1" />Negar
                          </Button>
                        </>
                      )}
                      {r.status === 'AUTORIZADO' && r.token_acesso && (
                        <>
                          <Button size="sm" variant="ghost" className="text-blue-500 hover:text-blue-700 text-xs px-2"
                            title="Ver autorização / QR Code"
                            onClick={() => window.open(`/frota/req/${r.token_acesso}`, '_blank')}>
                            <QrCode className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-green-600 hover:text-green-800 text-xs px-2"
                            title="Compartilhar via WhatsApp"
                            onClick={() => compartilharWhatsApp(r.token_acesso!)}>
                            <Share2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                      {['PENDENTE', 'AUTORIZADO'].includes(r.status) && (
                        <Button size="sm" variant="ghost" className="text-gray-400 hover:text-gray-600" title="Cancelar" onClick={() => cancelar(r)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {podeExcluirRequisicao && (
                        <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-800 hover:bg-red-50" title="Excluir (restaura saldo do contrato)" onClick={() => excluir(r)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filtradas.filter(r => r.status === 'ABASTECIDO').length > 0 && (
            <div className="flex justify-end gap-6 text-sm font-semibold text-gray-700 border-t px-4 py-2">
              <span>TOTAL DO MÊS:&nbsp;
                <span className="text-orange-600">{fmtLitros(filtradas.filter(r => r.status === 'ABASTECIDO').reduce((s, r) => s + Number(r.quantidade_abastecida || 0), 0), 3)}</span>
              </span>
              <span className="text-green-700">{fmt(filtradas.filter(r => r.status === 'ABASTECIDO').reduce((s, r) => s + Number(r.valor_total || 0), 0))}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Nova Requisição */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Requisição de Abastecimento</DialogTitle>
            <DialogDescription>Preencha os dados da solicitação</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label>Solicitante *</Label>
              <Input placeholder="Nome completo do solicitante"
                value={form.solicitante_nome} onChange={e => setForm({ ...form, solicitante_nome: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Cargo</Label>
              <Input placeholder="Ex: Vereador, Presidente..."
                value={form.solicitante_cargo} onChange={e => setForm({ ...form, solicitante_cargo: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Data da Requisição *</Label>
              <Input type="date" value={form.data_requisicao}
                onChange={e => setForm({ ...form, data_requisicao: e.target.value })} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Veículo (cadastrado)</Label>
              <Select value={form.veiculo_id || '_nenhum'} onValueChange={v => onVeiculoChange(v === '_nenhum' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o veículo (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_nenhum">Informar manualmente</SelectItem>
                  {veiculos.filter(v => v.ativo !== false).map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.placa} — {v.modelo} ({v.marca})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Placa *</Label>
              <Input placeholder="ABC-1234" value={form.veiculo_placa}
                onChange={e => setForm({ ...form, veiculo_placa: e.target.value.toUpperCase() })} />
            </div>
            <div className="space-y-1.5">
              <Label>Modelo do Veículo</Label>
              <Input placeholder="Ex: Montana (Chevrolet)"
                value={form.veiculo_modelo} onChange={e => setForm({ ...form, veiculo_modelo: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo Combustível *</Label>
              <Select value={form.tipo_combustivel} onValueChange={v => setForm({ ...form, tipo_combustivel: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_COMBUSTIVEL.map(t => <SelectItem key={t} value={t}>{LABEL_COMB[t] || t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantidade Autorizada (litros) *</Label>
              <Input type="number" step="0.001" min="0" placeholder="0,000"
                value={form.quantidade_autorizada}
                onChange={e => setForm({ ...form, quantidade_autorizada: e.target.value })} />
              {getSaldoParaTipo(form.tipo_combustivel) !== null && (
                <p className="text-xs text-muted-foreground">
                  Saldo disponível: {fmtLitros(getSaldoParaTipo(form.tipo_combustivel)!, 3)} para {LABEL_COMB[form.tipo_combustivel] || form.tipo_combustivel}
                </p>
              )}
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Finalidade *</Label>
              <Input placeholder="Ex: Fiscalização obras — Bairro Cohab"
                value={form.finalidade} onChange={e => setForm({ ...form, finalidade: e.target.value })} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Observações</Label>
              <Textarea rows={2} value={form.observacoes}
                onChange={e => setForm({ ...form, observacoes: e.target.value })} />
            </div>
            {erroSaldo && (
              <div className="col-span-2 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {erroSaldo}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={actionLoading || !form.solicitante_nome || !form.veiculo_placa || !form.finalidade || !form.quantidade_autorizada}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Criar Requisição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Negar */}
      <Dialog open={modalNegar} onOpenChange={setModalNegar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="w-5 h-5" />Negar Requisição
            </DialogTitle>
            <DialogDescription>{reqSelecionada?.codigo} — {reqSelecionada?.solicitante_nome}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motivo da negação</Label>
            <Textarea rows={3} placeholder="Informe o motivo (opcional)"
              value={motivoNegacao} onChange={e => setMotivoNegacao(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalNegar(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmarNegar} disabled={actionLoading}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Negar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

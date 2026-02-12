'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Plus, Loader2, Shield, Pencil, Trash2, Play, Pause, RefreshCw, AlertTriangle, Key,
} from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'

interface Licenca {
  id: string
  descricao: string
  descricao_detalhada: string
  tipo_licenca: string
  quantidade_contratada: number
  quantidade_ativa: number
  valor_unitario: number
  valor_total_contratado: number
  periodicidade_renovacao: string
  data_ativacao: string
  data_expiracao: string
  data_proxima_renovacao: string
  chave_licenca: string
  fornecedor_contato: string
  url_painel_admin: string
  status: string
  observacoes: string
}

interface Resumo {
  total_licencas: number
  total_contratadas: number
  total_ativas: number
  total_disponiveis: number
  valor_total_contratado: number
  licencas_expirando_30_dias: number
  licencas_expiradas: number
  licencas: Licenca[]
}

const STATUS_LICENCA: Record<string, { label: string; cor: string }> = {
  ATIVA: { label: 'Ativa', cor: 'bg-green-100 text-green-800' },
  SUSPENSA: { label: 'Suspensa', cor: 'bg-amber-100 text-amber-800' },
  EXPIRADA: { label: 'Expirada', cor: 'bg-red-100 text-red-800' },
  CANCELADA: { label: 'Cancelada', cor: 'bg-gray-100 text-gray-800' },
}

const TIPOS_LICENCA = [
  { value: 'USUARIO', label: 'Por Usuário' },
  { value: 'DISPOSITIVO', label: 'Por Dispositivo' },
  { value: 'SITE', label: 'Site License' },
  { value: 'VOLUME', label: 'Volume' },
  { value: 'ASSINATURA', label: 'Assinatura/SaaS' },
]

const PERIODICIDADES = [
  { value: 'MENSAL', label: 'Mensal' },
  { value: 'TRIMESTRAL', label: 'Trimestral' },
  { value: 'SEMESTRAL', label: 'Semestral' },
  { value: 'ANUAL', label: 'Anual' },
  { value: 'UNICO', label: 'Pagamento Único' },
]

function formatarMoeda(v: number | string) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function diasAteExpiracao(data: string) {
  const diff = (new Date(data).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  return Math.ceil(diff)
}

export default function TabLicencas({ contratoId }: { contratoId: string }) {
  const [licencas, setLicencas] = useState<Licenca[]>([])
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  const [modalCriar, setModalCriar] = useState(false)
  const [editando, setEditando] = useState<Licenca | null>(null)
  const [modalAtivar, setModalAtivar] = useState<Licenca | null>(null)
  const [modalDesativar, setModalDesativar] = useState<Licenca | null>(null)
  const [qtdAtivar, setQtdAtivar] = useState('1')

  const [form, setForm] = useState({
    descricao: '', descricao_detalhada: '', tipo_licenca: 'USUARIO',
    quantidade_contratada: '', valor_unitario: '', valor_total_contratado: '',
    periodicidade_renovacao: 'ANUAL', data_ativacao: '', data_expiracao: '',
    data_proxima_renovacao: '', chave_licenca: '', fornecedor_contato: '',
    url_painel_admin: '', observacoes: '',
  })

  const carregarDados = useCallback(async () => {
    setLoading(true)
    try {
      const [resLicencas, resResumo] = await Promise.all([
        authFetch(`${API_URL}/api/contratos/${contratoId}/licencas`),
        authFetch(`${API_URL}/api/contratos/${contratoId}/licencas/resumo`),
      ])
      if (resLicencas.ok) setLicencas(await resLicencas.json())
      if (resResumo.ok) setResumo(await resResumo.json())
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [contratoId])

  useEffect(() => { carregarDados() }, [carregarDados])

  const abrirModal = (licenca?: Licenca) => {
    if (licenca) {
      setEditando(licenca)
      setForm({
        descricao: licenca.descricao, descricao_detalhada: licenca.descricao_detalhada || '',
        tipo_licenca: licenca.tipo_licenca, quantidade_contratada: licenca.quantidade_contratada.toString(),
        valor_unitario: licenca.valor_unitario.toString(), valor_total_contratado: licenca.valor_total_contratado.toString(),
        periodicidade_renovacao: licenca.periodicidade_renovacao,
        data_ativacao: licenca.data_ativacao?.split('T')[0] || '',
        data_expiracao: licenca.data_expiracao?.split('T')[0] || '',
        data_proxima_renovacao: licenca.data_proxima_renovacao?.split('T')[0] || '',
        chave_licenca: licenca.chave_licenca || '', fornecedor_contato: licenca.fornecedor_contato || '',
        url_painel_admin: licenca.url_painel_admin || '', observacoes: licenca.observacoes || '',
      })
    } else {
      setEditando(null)
      setForm({
        descricao: '', descricao_detalhada: '', tipo_licenca: 'USUARIO',
        quantidade_contratada: '', valor_unitario: '', valor_total_contratado: '',
        periodicidade_renovacao: 'ANUAL', data_ativacao: '', data_expiracao: '',
        data_proxima_renovacao: '', chave_licenca: '', fornecedor_contato: '',
        url_painel_admin: '', observacoes: '',
      })
    }
    setModalCriar(true)
  }

  const salvar = async () => {
    setActionLoading(true)
    try {
      const payload = {
        descricao: form.descricao,
        descricao_detalhada: form.descricao_detalhada || null,
        tipo_licenca: form.tipo_licenca,
        quantidade_contratada: parseInt(form.quantidade_contratada),
        valor_unitario: parseFloat(form.valor_unitario),
        valor_total_contratado: parseFloat(form.valor_total_contratado),
        periodicidade_renovacao: form.periodicidade_renovacao,
        data_ativacao: form.data_ativacao,
        data_expiracao: form.data_expiracao,
        data_proxima_renovacao: form.data_proxima_renovacao || null,
        chave_licenca: form.chave_licenca || null,
        fornecedor_contato: form.fornecedor_contato || null,
        url_painel_admin: form.url_painel_admin || null,
        observacoes: form.observacoes || null,
      }
      const url = editando
        ? `${API_URL}/api/contratos/licencas/${editando.id}`
        : `${API_URL}/api/contratos/${contratoId}/licencas`
      const method = editando ? 'PUT' : 'POST'
      const res = await authFetch(url, { method, body: JSON.stringify(payload) })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro'); return }
      setModalCriar(false)
      carregarDados()
    } catch (e) { console.error(e) }
    setActionLoading(false)
  }

  const excluir = async (id: string) => {
    if (!confirm('Excluir esta licença?')) return
    const res = await authFetch(`${API_URL}/api/contratos/licencas/${id}`, { method: 'DELETE' })
    if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro'); return }
    carregarDados()
  }

  const ativarLicencas = async () => {
    if (!modalAtivar) return
    setActionLoading(true)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/licencas/${modalAtivar.id}/ativar`, {
        method: 'PATCH', body: JSON.stringify({ quantidade: parseInt(qtdAtivar) }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro'); return }
      setModalAtivar(null)
      carregarDados()
    } catch (e) { console.error(e) }
    setActionLoading(false)
  }

  const desativarLicencas = async () => {
    if (!modalDesativar) return
    setActionLoading(true)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/licencas/${modalDesativar.id}/desativar`, {
        method: 'PATCH', body: JSON.stringify({ quantidade: parseInt(qtdAtivar) }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro'); return }
      setModalDesativar(null)
      carregarDados()
    } catch (e) { console.error(e) }
    setActionLoading(false)
  }

  const suspender = async (id: string) => {
    await authFetch(`${API_URL}/api/contratos/licencas/${id}/suspender`, { method: 'PATCH' })
    carregarDados()
  }

  const reativar = async (id: string) => {
    await authFetch(`${API_URL}/api/contratos/licencas/${id}/reativar`, { method: 'PATCH' })
    carregarDados()
  }

  const verificarExpiracoes = async () => {
    setActionLoading(true)
    const res = await authFetch(`${API_URL}/api/contratos/${contratoId}/licencas/verificar-expiracoes`, { method: 'POST' })
    if (res.ok) {
      const expiradas = await res.json()
      if (expiradas.length > 0) alert(`${expiradas.length} licença(s) marcada(s) como expirada(s)`)
      else alert('Nenhuma licença expirada encontrada')
    }
    carregarDados()
    setActionLoading(false)
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>

  return (
    <div className="space-y-6">
      {/* Resumo */}
      {resumo && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Licenças Ativas</p>
              <p className="text-xl font-bold text-green-600">{resumo.total_ativas}</p>
              <p className="text-xs text-gray-400">de {resumo.total_contratadas} contratadas</p>
              <Progress value={(resumo.total_ativas / Math.max(resumo.total_contratadas, 1)) * 100} className="mt-2" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Disponíveis</p>
              <p className="text-xl font-bold text-blue-600">{resumo.total_disponiveis}</p>
              <p className="text-xs text-gray-400">para ativação</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Valor Total</p>
              <p className="text-xl font-bold">{formatarMoeda(resumo.valor_total_contratado)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Alertas</p>
              <div className="flex items-center gap-2">
                {resumo.licencas_expirando_30_dias > 0 && (
                  <Badge className="bg-amber-100 text-amber-800">
                    <AlertTriangle className="w-3 h-3 mr-1" />{resumo.licencas_expirando_30_dias} expirando
                  </Badge>
                )}
                {resumo.licencas_expiradas > 0 && (
                  <Badge className="bg-red-100 text-red-800">{resumo.licencas_expiradas} expiradas</Badge>
                )}
                {resumo.licencas_expirando_30_dias === 0 && resumo.licencas_expiradas === 0 && (
                  <span className="text-green-600 text-sm font-medium">Tudo em dia</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabela */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5" />Licenças e Assinaturas</CardTitle>
              <CardDescription>Controle de licenças de software, SaaS e assinaturas</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={verificarExpiracoes} disabled={actionLoading}>
                <RefreshCw className="w-4 h-4 mr-1" />Verificar Expirações
              </Button>
              <Button onClick={() => abrirModal()} size="sm"><Plus className="w-4 h-4 mr-1" />Nova Licença</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {licencas.length === 0 ? (
            <div className="text-center py-8">
              <Key className="w-10 h-10 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">Nenhuma licença cadastrada.</p>
              <p className="text-sm text-gray-400">Cadastre as licenças de software deste contrato.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Licença</TableHead>
                  <TableHead className="text-center">Tipo</TableHead>
                  <TableHead className="text-center">Qtd</TableHead>
                  <TableHead className="text-right">Valor Unit.</TableHead>
                  <TableHead className="text-center">Vigência</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="w-40"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {licencas.map(l => {
                  const dias = diasAteExpiracao(l.data_expiracao)
                  return (
                    <TableRow key={l.id}>
                      <TableCell>
                        <p className="font-medium">{l.descricao}</p>
                        {l.fornecedor_contato && <p className="text-xs text-gray-400">{l.fornecedor_contato}</p>}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-xs">{TIPOS_LICENCA.find(t => t.value === l.tipo_licenca)?.label || l.tipo_licenca}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-medium">{l.quantidade_ativa}</span>
                        <span className="text-gray-400">/{l.quantidade_contratada}</span>
                      </TableCell>
                      <TableCell className="text-right">{formatarMoeda(l.valor_unitario)}</TableCell>
                      <TableCell className="text-center">
                        <p className="text-xs">{l.data_ativacao?.split('T')[0]}</p>
                        <p className="text-xs">→ {l.data_expiracao?.split('T')[0]}</p>
                        {dias > 0 && dias <= 30 && (
                          <Badge className="bg-amber-100 text-amber-800 text-xs mt-1">{dias}d restantes</Badge>
                        )}
                        {dias <= 0 && <Badge className="bg-red-100 text-red-800 text-xs mt-1">Expirada</Badge>}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={STATUS_LICENCA[l.status]?.cor || 'bg-gray-100'}>
                          {STATUS_LICENCA[l.status]?.label || l.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {l.status === 'ATIVA' && l.quantidade_ativa < l.quantidade_contratada && (
                            <Button variant="outline" size="sm" onClick={() => { setModalAtivar(l); setQtdAtivar('1') }}>
                              <Play className="w-3 h-3 mr-1" />Ativar
                            </Button>
                          )}
                          {l.status === 'ATIVA' && l.quantidade_ativa > 0 && (
                            <Button variant="outline" size="sm" onClick={() => { setModalDesativar(l); setQtdAtivar('1') }}>
                              <Pause className="w-3 h-3 mr-1" />Desativar
                            </Button>
                          )}
                          {l.status === 'ATIVA' && (
                            <Button variant="ghost" size="icon" onClick={() => suspender(l.id)} title="Suspender">
                              <Pause className="w-3.5 h-3.5 text-amber-500" />
                            </Button>
                          )}
                          {l.status === 'SUSPENSA' && (
                            <Button variant="outline" size="sm" onClick={() => reativar(l.id)}>
                              <Play className="w-3 h-3 mr-1" />Reativar
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => abrirModal(l)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => excluir(l.id)}>
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal Criar/Editar */}
      <Dialog open={modalCriar} onOpenChange={setModalCriar}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Licença' : 'Nova Licença'}</DialogTitle>
            <DialogDescription>Cadastre os dados da licença de software</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Descrição *</Label>
              <Input placeholder="Ex: Microsoft 365 Business Basic" value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Descrição Detalhada</Label>
              <Textarea placeholder="Detalhes da licença" value={form.descricao_detalhada} onChange={e => setForm({ ...form, descricao_detalhada: e.target.value })} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de Licença *</Label>
                <Select value={form.tipo_licenca} onValueChange={v => setForm({ ...form, tipo_licenca: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS_LICENCA.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Periodicidade *</Label>
                <Select value={form.periodicidade_renovacao} onValueChange={v => setForm({ ...form, periodicidade_renovacao: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PERIODICIDADES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Quantidade *</Label>
                <Input type="number" min="1" value={form.quantidade_contratada} onChange={e => setForm({ ...form, quantidade_contratada: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Valor Unitário (R$) *</Label>
                <Input type="number" step="0.01" min="0" value={form.valor_unitario} onChange={e => setForm({ ...form, valor_unitario: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Valor Total (R$) *</Label>
                <Input type="number" step="0.01" min="0" value={form.valor_total_contratado} onChange={e => setForm({ ...form, valor_total_contratado: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Data Ativação *</Label>
                <Input type="date" value={form.data_ativacao} onChange={e => setForm({ ...form, data_ativacao: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Data Expiração *</Label>
                <Input type="date" value={form.data_expiracao} onChange={e => setForm({ ...form, data_expiracao: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Próxima Renovação</Label>
                <Input type="date" value={form.data_proxima_renovacao} onChange={e => setForm({ ...form, data_proxima_renovacao: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Chave da Licença</Label>
                <Input placeholder="XXXXX-XXXXX-XXXXX" value={form.chave_licenca} onChange={e => setForm({ ...form, chave_licenca: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Contato do Fornecedor</Label>
                <Input placeholder="Email ou telefone" value={form.fornecedor_contato} onChange={e => setForm({ ...form, fornecedor_contato: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>URL Painel Admin</Label>
              <Input placeholder="https://admin.exemplo.com" value={form.url_painel_admin} onChange={e => setForm({ ...form, url_painel_admin: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea placeholder="Observações" value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalCriar(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={actionLoading || !form.descricao || !form.quantidade_contratada || !form.data_ativacao || !form.data_expiracao}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editando ? 'Salvar' : 'Criar Licença'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Ativar */}
      <Dialog open={!!modalAtivar} onOpenChange={() => setModalAtivar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ativar Licenças — {modalAtivar?.descricao}</DialogTitle>
            <DialogDescription>
              Disponíveis: {modalAtivar && (modalAtivar.quantidade_contratada - modalAtivar.quantidade_ativa)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Quantidade a Ativar</Label>
            <Input type="number" min="1" max={modalAtivar ? modalAtivar.quantidade_contratada - modalAtivar.quantidade_ativa : 1} value={qtdAtivar} onChange={e => setQtdAtivar(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAtivar(null)}>Cancelar</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={ativarLicencas} disabled={actionLoading}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Ativar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Desativar */}
      <Dialog open={!!modalDesativar} onOpenChange={() => setModalDesativar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desativar Licenças — {modalDesativar?.descricao}</DialogTitle>
            <DialogDescription>Ativas: {modalDesativar?.quantidade_ativa}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Quantidade a Desativar</Label>
            <Input type="number" min="1" max={modalDesativar?.quantidade_ativa || 1} value={qtdAtivar} onChange={e => setQtdAtivar(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalDesativar(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={desativarLicencas} disabled={actionLoading}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Desativar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { FileText, Plus, Pencil, Trash2, Loader2, CheckCircle, Download } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'

interface Contrato {
  id: string
  numero_contrato: string
  fornecedor_nome: string
  fornecedor_cnpj?: string
  preco_litro: number
  limite_litros_mensal?: number
  data_inicio: string
  data_fim: string
  observacoes?: string
  ativo: boolean
  itens?: { descricao: string; preco_litro: number; quantidade_contratada: number; quantidade_consumida?: number; valor_total: number }[]
}

interface ItemContratoPrincipal {
  descricao: string
  unidade_medida?: string
  valor_unitario?: number
  quantidade_contratada?: number
  valor_total?: number
}

interface ContratoPrincipal {
  id: string
  numero_contrato: string
  fornecedor_razao_social: string
  fornecedor_cnpj: string
  data_vigencia_inicio: string
  data_vigencia_fim: string
  objeto?: string
  itens?: ItemContratoPrincipal[]
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const fmtData = (d: string) => d ? d.split('T')[0].split('-').reverse().join('/') : '-'
const fmtPreco = (v: number) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })

const vazio = {
  numero_contrato: '', fornecedor_nome: '', fornecedor_cnpj: '',
  preco_litro: '', limite_litros_mensal: '', data_inicio: '', data_fim: '', observacoes: '', ativo: true,
}

export default function ContratosPage() {
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [contratosDisponiveis, setContratosDisponiveis] = useState<ContratoPrincipal[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalImportarOpen, setModalImportarOpen] = useState(false)
  const [editando, setEditando] = useState<Contrato | null>(null)
  const [form, setForm] = useState(vazio)
  const [modoImportar, setModoImportar] = useState(false)
  const [contratoImportarId, setContratoImportarId] = useState<string>('')
  const [precoLitroImportar, setPrecoLitroImportar] = useState('')
  const [limiteLitrosImportar, setLimiteLitrosImportar] = useState('')

  const carregar = useCallback(async () => {
    const res = await authFetch(`${API_URL}/api/frota/contratos`)
    if (res.ok) setContratos(await res.json())
    setLoading(false)
  }, [])

  const carregarContratosParaImportar = useCallback(async () => {
    const res = await authFetch(`${API_URL}/api/contratos?vigentes=true&limit=200`)
    if (res.ok) {
      const data = await res.json()
      setContratosDisponiveis(data.data || [])
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (contratoImportarId && contratosDisponiveis.length > 0) {
      const c = contratosDisponiveis.find(x => x.id === contratoImportarId)
      const itensLitros = (c?.itens || []).filter((i: ItemContratoPrincipal) => i.unidade_medida === 'LITRO')
      if (itensLitros.length > 0 && !precoLitroImportar) {
        setPrecoLitroImportar(String(Number(itensLitros[0].valor_unitario) || ''))
      }
    }
  }, [contratoImportarId, contratosDisponiveis])

  const abrir = (c?: Contrato) => {
    setModoImportar(false)
    setModalImportarOpen(false)
    if (c) {
      setEditando(c)
      setForm({
        numero_contrato: c.numero_contrato, fornecedor_nome: c.fornecedor_nome,
        fornecedor_cnpj: c.fornecedor_cnpj || '', preco_litro: c.preco_litro?.toString() || '',
        limite_litros_mensal: c.limite_litros_mensal?.toString() || '',
        data_inicio: c.data_inicio?.split('T')[0] || '', data_fim: c.data_fim?.split('T')[0] || '',
        observacoes: c.observacoes || '', ativo: c.ativo,
      })
    } else {
      setEditando(null); setForm(vazio)
    }
    setModalOpen(true)
  }

  const abrirImportar = () => {
    setModoImportar(true)
    setModalOpen(false)
    setModalImportarOpen(true)
    setContratoImportarId('')
    setPrecoLitroImportar('')
    setLimiteLitrosImportar('')
    carregarContratosParaImportar()
  }

  const salvar = async () => {
    setActionLoading(true)
    try {
      const payload = {
        ...form,
        preco_litro: parseFloat(form.preco_litro) || 0,
        limite_litros_mensal: form.limite_litros_mensal ? parseFloat(form.limite_litros_mensal) : undefined,
      }
      const url = editando ? `${API_URL}/api/frota/contratos/${editando.id}` : `${API_URL}/api/frota/contratos`
      const res = await authFetch(url, { method: editando ? 'PUT' : 'POST', body: JSON.stringify(payload) })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro ao salvar'); return }
      setModalOpen(false); carregar()
    } finally { setActionLoading(false) }
  }

  const importarContrato = async () => {
    if (!contratoImportarId) { alert('Selecione um contrato'); return }
    const itensLitros = (contratoSelecionado?.itens || []).filter((i: ItemContratoPrincipal) => i.unidade_medida === 'LITRO')
    const preco = parseFloat(precoLitroImportar)
    if (itensLitros.length === 0 && (!preco || preco <= 0)) {
      alert('Informe o preço por litro ou selecione um contrato com itens em LITRO')
      return
    }
    setActionLoading(true)
    try {
      const res = await authFetch(`${API_URL}/api/frota/contratos/importar/${contratoImportarId}`, {
        method: 'POST',
        body: JSON.stringify({
          preco_litro: itensLitros.length > 0 ? undefined : preco,
          limite_litros_mensal: limiteLitrosImportar ? parseFloat(limiteLitrosImportar) : undefined,
        }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro ao importar'); return }
      setModalImportarOpen(false); carregar()
    } finally { setActionLoading(false) }
  }

  const excluir = async (id: string, numero: string) => {
    if (!confirm(`Excluir o contrato ${numero}?`)) return
    await authFetch(`${API_URL}/api/frota/contratos/${id}`, { method: 'DELETE' })
    carregar()
  }

  const hoje = new Date().toISOString().split('T')[0]
  const isAtivo = (c: Contrato) => c.ativo && c.data_inicio <= hoje && c.data_fim >= hoje
  const contratoSelecionado = contratosDisponiveis.find(c => c.id === contratoImportarId)

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />Contratos de Combustível
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={abrirImportar}>
            <Download className="w-4 h-4 mr-2" />Importar do Cadastro
          </Button>
          <Button onClick={() => abrir()}>
            <Plus className="w-4 h-4 mr-2" />Novo Contrato
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº Contrato</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Itens (combustível / preço)</TableHead>
                <TableHead className="text-right">Limite Mensal</TableHead>
                <TableHead>Vigência</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contratos.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-gray-400">Nenhum contrato cadastrado</TableCell></TableRow>
              )}
              {contratos.map(c => (
                <TableRow key={c.id} className={isAtivo(c) ? 'bg-green-50/40' : ''}>
                  <TableCell className="font-semibold">{c.numero_contrato}</TableCell>
                  <TableCell>
                    <p className="font-medium">{c.fornecedor_nome}</p>
                    {c.fornecedor_cnpj && <p className="text-xs text-gray-400">{c.fornecedor_cnpj}</p>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {(c.itens && c.itens.length > 0)
                      ? <div className="space-y-0.5">
                          {c.itens.map((item, i) => {
                            const qtdContratada = Number(item.quantidade_contratada) || 0
                            const qtdConsumida = Number(item.quantidade_consumida ?? 0) || 0
                            const saldo = Math.max(0, qtdContratada - qtdConsumida)
                            return (
                              <div key={i} className="whitespace-nowrap">
                                {item.descricao?.slice(0, 30)}{item.descricao?.length > 30 ? '…' : ''} — R$ {fmtPreco(item.preco_litro)}
                                <span className="text-muted-foreground text-xs ml-1">({saldo.toLocaleString('pt-BR', { minimumFractionDigits: 3 })} L disp.)</span>
                              </div>
                            )
                          })}
                        </div>
                      : <span className="font-mono">R$ {fmtPreco(c.preco_litro ?? 0)}</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    {c.limite_litros_mensal ? `${Number(c.limite_litros_mensal).toLocaleString('pt-BR', { minimumFractionDigits: 3 })} L/mês` : '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {fmtData(c.data_inicio)} → {fmtData(c.data_fim)}
                  </TableCell>
                  <TableCell>
                    {isAtivo(c)
                      ? <Badge className="bg-green-100 text-green-800 border-green-300 flex items-center gap-1 w-fit"><CheckCircle className="w-3 h-3" />Vigente</Badge>
                      : <Badge variant="secondary">{!c.ativo ? 'Inativo' : c.data_fim < hoje ? 'Vencido' : 'Futuro'}</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => abrir(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="text-red-500" onClick={() => excluir(c.id, c.numero_contrato)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal: Novo/Editar manual */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Contrato' : 'Novo Contrato de Combustível'}</DialogTitle>
            <DialogDescription>Preencha os dados do contrato com o fornecedor (posto)</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Nº do Contrato *</Label>
              <Input placeholder="031/2025" value={form.numero_contrato}
                onChange={e => setForm({ ...form, numero_contrato: e.target.value })} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Fornecedor (Posto) *</Label>
              <Input placeholder="Nome do posto / empresa" value={form.fornecedor_nome}
                onChange={e => setForm({ ...form, fornecedor_nome: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>CNPJ do Fornecedor</Label>
              <Input placeholder="00.000.000/0001-00" value={form.fornecedor_cnpj}
                onChange={e => setForm({ ...form, fornecedor_cnpj: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Preço por Litro (R$) *</Label>
              <Input type="number" step="0.0001" min="0" placeholder="7,5000"
                value={form.preco_litro}
                onChange={e => setForm({ ...form, preco_litro: e.target.value })} />
              <p className="text-xs text-gray-400">4 casas decimais (ex: 7,5000)</p>
            </div>
            <div className="space-y-1.5">
              <Label>Limite Mensal (litros)</Label>
              <Input type="number" step="0.001" min="0" placeholder="1500,000"
                value={form.limite_litros_mensal}
                onChange={e => setForm({ ...form, limite_litros_mensal: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Data Início *</Label>
              <Input type="date" value={form.data_inicio}
                onChange={e => setForm({ ...form, data_inicio: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Data Fim *</Label>
              <Input type="date" value={form.data_fim}
                onChange={e => setForm({ ...form, data_fim: e.target.value })} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Observações</Label>
              <Textarea rows={2} value={form.observacoes}
                onChange={e => setForm({ ...form, observacoes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={actionLoading || !form.numero_contrato || !form.fornecedor_nome || !form.preco_litro || !form.data_inicio || !form.data_fim}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editando ? 'Salvar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Importar do cadastro de contratos */}
      <Dialog open={modalImportarOpen} onOpenChange={setModalImportarOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Importar Contrato do Cadastro</DialogTitle>
            <DialogDescription>
              Selecione um contrato vigente. Itens, quantidades e valores em LITRO serão importados. Informe o preço por litro e o limite mensal (opcional).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Contrato *</Label>
              <Select value={contratoImportarId} onValueChange={setContratoImportarId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o contrato de combustível" />
                </SelectTrigger>
                <SelectContent>
                  {contratosDisponiveis.length === 0 && (
                    <SelectItem value="_empty" disabled>Nenhum contrato vigente encontrado</SelectItem>
                  )}
                  {contratosDisponiveis.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.numero_contrato} — {c.fornecedor_razao_social}
                      {c.data_vigencia_inicio && ` (${fmtData(c.data_vigencia_inicio)} a ${fmtData(c.data_vigencia_fim)})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {contratoSelecionado && (
              <div className="rounded-lg border bg-muted/50 p-3 text-sm">
                <p className="font-medium">{contratoSelecionado.numero_contrato} — {contratoSelecionado.fornecedor_razao_social}</p>
                <p className="text-muted-foreground">CNPJ: {contratoSelecionado.fornecedor_cnpj}</p>
                <p className="text-muted-foreground">Vigência: {fmtData(contratoSelecionado.data_vigencia_inicio)} a {fmtData(contratoSelecionado.data_vigencia_fim)}</p>
                {contratoSelecionado.objeto && (
                  <p className="text-muted-foreground mt-1 whitespace-pre-wrap break-words">{contratoSelecionado.objeto}</p>
                )}
                {(contratoSelecionado.itens || []).filter((i: ItemContratoPrincipal) => i.unidade_medida === 'LITRO').length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Itens em LITRO (serão importados):</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {(contratoSelecionado.itens || []).filter((i: ItemContratoPrincipal) => i.unidade_medida === 'LITRO').map((item: ItemContratoPrincipal, idx: number) => (
                        <li key={idx} className="whitespace-pre-wrap break-words">
                          • {item.descricao} — {Number(item.quantidade_contratada || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3 })} L × R$ {Number(item.valor_unitario || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4 })} = {fmt(Number(item.valor_total || 0))}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {(contratoSelecionado?.itens || []).filter((i: ItemContratoPrincipal) => i.unidade_medida === 'LITRO').length === 0 ? (
              <div className="space-y-1.5">
                <Label>Preço por Litro (R$) *</Label>
                <Input type="number" step="0.0001" min="0" placeholder="7,5000"
                  value={precoLitroImportar}
                  onChange={e => setPrecoLitroImportar(e.target.value)} />
                <p className="text-xs text-gray-400">Obrigatório quando o contrato não tem itens em LITRO</p>
              </div>
              ) : (
              <div className="space-y-1.5 col-span-2">
                <p className="text-sm text-muted-foreground">Todos os itens em LITRO serão importados com descrição, quantidade, preço e valor.</p>
              </div>
              )}
              <div className="space-y-1.5">
                <Label>Limite Mensal (litros)</Label>
                <Input type="number" step="0.001" min="0" placeholder="1500,000"
                  value={limiteLitrosImportar}
                  onChange={e => setLimiteLitrosImportar(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalImportarOpen(false)}>Cancelar</Button>
            <Button onClick={importarContrato} disabled={actionLoading || !contratoImportarId || ((contratoSelecionado?.itens || []).filter((i: ItemContratoPrincipal) => i.unidade_medida === 'LITRO').length === 0 && (!precoLitroImportar || parseFloat(precoLitroImportar) <= 0))}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

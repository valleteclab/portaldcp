'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Plus, Loader2, CheckCircle, XCircle, ClipboardCheck, Star, AlertTriangle,
} from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'

interface Atestacao {
  id: string
  mes_referencia: string
  ano: number
  mes: number
  valor_mensal_contratado: number
  valor_atestado: number
  valor_glosa: number
  valor_liquido: number
  nota_imr: number | null
  criterios_imr: { criterio: string; peso: number; nota: number; observacao?: string }[] | null
  fiscal_nome: string
  data_atestacao: string
  status: string
  observacoes: string
  justificativa_glosa: string
}

interface Resumo {
  valor_global: number
  valor_atestado_total: number
  valor_glosa_total: number
  saldo_disponivel: number
  total_meses: number
  meses_atestados: number
  meses_pendentes: number
  media_imr: number | null
}

const STATUS_ATESTACAO: Record<string, { label: string; cor: string }> = {
  PENDENTE: { label: 'Pendente', cor: 'bg-amber-100 text-amber-800' },
  ATESTADA: { label: 'Atestada', cor: 'bg-green-100 text-green-800' },
  ATESTADA_COM_GLOSA: { label: 'Atestada c/ Glosa', cor: 'bg-orange-100 text-orange-800' },
  REJEITADA: { label: 'Rejeitada', cor: 'bg-red-100 text-red-800' },
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function formatarMoeda(v: number | string) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function TabAtestacao({ contratoId, valorGlobal }: { contratoId: string; valorGlobal: number }) {
  const [atestacoes, setAtestacoes] = useState<Atestacao[]>([])
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  const [modalCriar, setModalCriar] = useState(false)
  const [modalAtestar, setModalAtestar] = useState<Atestacao | null>(null)
  const [modalRejeitar, setModalRejeitar] = useState<Atestacao | null>(null)

  const [formCriar, setFormCriar] = useState({ mes_referencia: '', valor_mensal_contratado: '' })
  const [formAtestar, setFormAtestar] = useState({
    valor_atestado: '', valor_glosa: '', nota_imr: '',
    justificativa_glosa: '', observacoes: '',
    criterios: [
      { criterio: 'Pontualidade', peso: 25, nota: 100, observacao: '' },
      { criterio: 'Qualidade', peso: 25, nota: 100, observacao: '' },
      { criterio: 'Conformidade', peso: 25, nota: 100, observacao: '' },
      { criterio: 'Atendimento', peso: 25, nota: 100, observacao: '' },
    ],
  })
  const [observacaoRejeicao, setObservacaoRejeicao] = useState('')

  const carregarDados = useCallback(async () => {
    setLoading(true)
    try {
      const [resAtestacoes, resResumo] = await Promise.all([
        authFetch(`${API_URL}/api/contratos/${contratoId}/atestacoes`),
        authFetch(`${API_URL}/api/contratos/${contratoId}/atestacoes/resumo`),
      ])
      if (resAtestacoes.ok) setAtestacoes(await resAtestacoes.json())
      if (resResumo.ok) setResumo(await resResumo.json())
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [contratoId])

  useEffect(() => { carregarDados() }, [carregarDados])

  const criarAtestacao = async () => {
    setActionLoading(true)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${contratoId}/atestacoes`, {
        method: 'POST',
        body: JSON.stringify({
          mes_referencia: formCriar.mes_referencia,
          valor_mensal_contratado: parseFloat(formCriar.valor_mensal_contratado),
        }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro'); return }
      setModalCriar(false)
      setFormCriar({ mes_referencia: '', valor_mensal_contratado: '' })
      carregarDados()
    } catch (e) { console.error(e) }
    setActionLoading(false)
  }

  const abrirModalAtestar = (atestacao: Atestacao) => {
    setFormAtestar({
      valor_atestado: atestacao.valor_mensal_contratado?.toString() || '',
      valor_glosa: '0',
      nota_imr: '',
      justificativa_glosa: '',
      observacoes: '',
      criterios: [
        { criterio: 'Pontualidade', peso: 25, nota: 100, observacao: '' },
        { criterio: 'Qualidade', peso: 25, nota: 100, observacao: '' },
        { criterio: 'Conformidade', peso: 25, nota: 100, observacao: '' },
        { criterio: 'Atendimento', peso: 25, nota: 100, observacao: '' },
      ],
    })
    setModalAtestar(atestacao)
  }

  const calcularNotaIMR = () => {
    const total = formAtestar.criterios.reduce((sum, c) => sum + (c.nota * c.peso / 100), 0)
    return Math.round(total * 100) / 100
  }

  const atestar = async () => {
    if (!modalAtestar) return
    setActionLoading(true)
    try {
      const notaImr = calcularNotaIMR()
      const res = await authFetch(`${API_URL}/api/contratos/atestacoes/${modalAtestar.id}/atestar`, {
        method: 'PATCH',
        body: JSON.stringify({
          valor_atestado: parseFloat(formAtestar.valor_atestado),
          valor_glosa: parseFloat(formAtestar.valor_glosa) || 0,
          nota_imr: notaImr,
          criterios_imr: formAtestar.criterios,
          justificativa_glosa: formAtestar.justificativa_glosa || null,
          fiscal_id: '',
          fiscal_nome: 'Fiscal',
          observacoes: formAtestar.observacoes || null,
        }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro'); return }
      setModalAtestar(null)
      carregarDados()
    } catch (e) { console.error(e) }
    setActionLoading(false)
  }

  const rejeitar = async () => {
    if (!modalRejeitar) return
    setActionLoading(true)
    try {
      await authFetch(`${API_URL}/api/contratos/atestacoes/${modalRejeitar.id}/rejeitar`, {
        method: 'PATCH',
        body: JSON.stringify({ fiscal_id: '', fiscal_nome: 'Fiscal', observacoes: observacaoRejeicao }),
      })
      setModalRejeitar(null)
      setObservacaoRejeicao('')
      carregarDados()
    } catch (e) { console.error(e) }
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
              <p className="text-sm text-gray-500">Valor Atestado</p>
              <p className="text-xl font-bold text-blue-600">{formatarMoeda(resumo.valor_atestado_total)}</p>
              <p className="text-xs text-gray-400">de {formatarMoeda(resumo.valor_global)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Saldo Disponível</p>
              <p className="text-xl font-bold text-green-600">{formatarMoeda(resumo.saldo_disponivel)}</p>
              <Progress value={(resumo.valor_atestado_total / resumo.valor_global) * 100} className="mt-2" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Glosas Totais</p>
              <p className="text-xl font-bold text-orange-600">{formatarMoeda(resumo.valor_glosa_total)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Média IMR</p>
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-500" />
                <p className="text-xl font-bold">{resumo.media_imr != null ? resumo.media_imr.toFixed(1) : '—'}</p>
              </div>
              <p className="text-xs text-gray-400">{resumo.meses_atestados} de {resumo.total_meses} meses atestados</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabela de Atestações */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><ClipboardCheck className="w-5 h-5" />Atestações Mensais</CardTitle>
              <CardDescription>Controle mensal de execução do serviço pelo fiscal</CardDescription>
            </div>
            <Button onClick={() => setModalCriar(true)} size="sm"><Plus className="w-4 h-4 mr-1" />Nova Atestação</Button>
          </div>
        </CardHeader>
        <CardContent>
          {atestacoes.length === 0 ? (
            <div className="text-center py-8">
              <ClipboardCheck className="w-10 h-10 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">Nenhuma atestação registrada.</p>
              <p className="text-sm text-gray-400">Crie atestações mensais para controlar a execução do serviço.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês</TableHead>
                  <TableHead className="text-right">Valor Contratado</TableHead>
                  <TableHead className="text-right">Valor Atestado</TableHead>
                  <TableHead className="text-right">Glosa</TableHead>
                  <TableHead className="text-right">Líquido</TableHead>
                  <TableHead className="text-center">IMR</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="w-32"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {atestacoes.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {MESES[(a.mes || 1) - 1]} {a.ano}
                    </TableCell>
                    <TableCell className="text-right">{formatarMoeda(a.valor_mensal_contratado)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {a.valor_atestado ? formatarMoeda(a.valor_atestado) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {Number(a.valor_glosa) > 0 ? (
                        <span className="text-orange-600">{formatarMoeda(a.valor_glosa)}</span>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {a.valor_liquido ? formatarMoeda(a.valor_liquido) : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      {a.nota_imr != null ? (
                        <span className={`font-medium ${Number(a.nota_imr) >= 80 ? 'text-green-600' : Number(a.nota_imr) >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                          {Number(a.nota_imr).toFixed(0)}
                        </span>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={STATUS_ATESTACAO[a.status]?.cor || 'bg-gray-100'}>
                        {STATUS_ATESTACAO[a.status]?.label || a.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {a.status === 'PENDENTE' && (
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" className="text-green-600" onClick={() => abrirModalAtestar(a)}>
                            <CheckCircle className="w-3.5 h-3.5 mr-1" />Atestar
                          </Button>
                          <Button variant="outline" size="sm" className="text-red-600" onClick={() => setModalRejeitar(a)}>
                            <XCircle className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal Criar Atestação */}
      <Dialog open={modalCriar} onOpenChange={setModalCriar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Atestação Mensal</DialogTitle>
            <DialogDescription>Crie uma atestação para o mês de referência</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Mês de Referência *</Label>
              <Input type="month" value={formCriar.mes_referencia} onChange={e => setFormCriar({ ...formCriar, mes_referencia: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Valor Mensal Contratado (R$) *</Label>
              <Input type="number" step="0.01" min="0" placeholder="0,00" value={formCriar.valor_mensal_contratado} onChange={e => setFormCriar({ ...formCriar, valor_mensal_contratado: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalCriar(false)}>Cancelar</Button>
            <Button onClick={criarAtestacao} disabled={actionLoading || !formCriar.mes_referencia || !formCriar.valor_mensal_contratado}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Criar Atestação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Atestar */}
      <Dialog open={!!modalAtestar} onOpenChange={() => setModalAtestar(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Atestar Execução — {modalAtestar && `${MESES[(modalAtestar.mes || 1) - 1]} ${modalAtestar.ano}`}</DialogTitle>
            <DialogDescription>Avalie a execução do serviço e aplique o IMR</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor Atestado (R$) *</Label>
                <Input type="number" step="0.01" min="0" value={formAtestar.valor_atestado} onChange={e => setFormAtestar({ ...formAtestar, valor_atestado: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Valor Glosa (R$)</Label>
                <Input type="number" step="0.01" min="0" value={formAtestar.valor_glosa} onChange={e => setFormAtestar({ ...formAtestar, valor_glosa: e.target.value })} />
              </div>
            </div>

            {parseFloat(formAtestar.valor_glosa) > 0 && (
              <div className="space-y-2">
                <Label>Justificativa da Glosa *</Label>
                <Textarea placeholder="Descreva o motivo da glosa..." value={formAtestar.justificativa_glosa} onChange={e => setFormAtestar({ ...formAtestar, justificativa_glosa: e.target.value })} rows={2} />
              </div>
            )}

            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm font-medium text-blue-700">Valor Líquido: {formatarMoeda((parseFloat(formAtestar.valor_atestado) || 0) - (parseFloat(formAtestar.valor_glosa) || 0))}</p>
            </div>

            {/* IMR */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">IMR — Instrumento de Medição de Resultado</Label>
                <Badge className={calcularNotaIMR() >= 80 ? 'bg-green-100 text-green-800' : calcularNotaIMR() >= 60 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}>
                  Nota: {calcularNotaIMR().toFixed(0)}
                </Badge>
              </div>
              <div className="border rounded-lg divide-y">
                {formAtestar.criterios.map((c, idx) => (
                  <div key={idx} className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{c.criterio} (peso {c.peso}%)</span>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number" min="0" max="100" className="w-20 text-center"
                          value={c.nota}
                          onChange={e => {
                            const criterios = [...formAtestar.criterios]
                            criterios[idx] = { ...criterios[idx], nota: parseInt(e.target.value) || 0 }
                            setFormAtestar({ ...formAtestar, criterios })
                          }}
                        />
                        <span className="text-xs text-gray-400">/100</span>
                      </div>
                    </div>
                    <Input
                      placeholder="Observação (opcional)" className="text-sm"
                      value={c.observacao}
                      onChange={e => {
                        const criterios = [...formAtestar.criterios]
                        criterios[idx] = { ...criterios[idx], observacao: e.target.value }
                        setFormAtestar({ ...formAtestar, criterios })
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Observações Gerais</Label>
              <Textarea placeholder="Observações do fiscal" value={formAtestar.observacoes} onChange={e => setFormAtestar({ ...formAtestar, observacoes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAtestar(null)}>Cancelar</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={atestar} disabled={actionLoading || !formAtestar.valor_atestado}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Atestar Execução
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Rejeitar */}
      <Dialog open={!!modalRejeitar} onOpenChange={() => setModalRejeitar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar Atestação — {modalRejeitar && `${MESES[(modalRejeitar.mes || 1) - 1]} ${modalRejeitar.ano}`}</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
            <p className="text-sm text-red-700">Ao rejeitar, o serviço deste mês será considerado como não prestado.</p>
          </div>
          <div className="space-y-2">
            <Label>Motivo da Rejeição *</Label>
            <Textarea placeholder="Informe o motivo..." value={observacaoRejeicao} onChange={e => setObservacaoRejeicao(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalRejeitar(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={rejeitar} disabled={actionLoading || !observacaoRejeicao}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Rejeitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

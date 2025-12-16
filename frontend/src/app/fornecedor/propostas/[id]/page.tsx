"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { 
  ArrowLeft, 
  Save, 
  FileText, 
  Package, 
  AlertCircle,
  Check,
  Edit,
  Clock
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface PropostaItem {
  id: string
  item_licitacao_id: string
  valor_unitario: number
  marca?: string
  modelo?: string
  item_licitacao?: {
    numero_item: number
    descricao_resumida: string
    quantidade: number
    unidade_medida: string
    valor_unitario_estimado: number
  }
}

interface Proposta {
  id: string
  status: string
  valor_total_proposta: number
  data_envio: string
  declaracao_termos: boolean
  declaracao_mpe: boolean
  declaracao_integridade: boolean
  declaracao_inexistencia_fatos: boolean
  declaracao_menor: boolean
  declaracao_reserva_cargos: boolean
  licitacao?: {
    id: string
    numero_processo: string
    objeto: string
    fase: string
    data_fim_acolhimento?: string
    data_abertura_sessao?: string
  }
  itens?: PropostaItem[]
}

export default function DetalhePropostaPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const [proposta, setProposta] = useState<Proposta | null>(null)
  const [itensEditados, setItensEditados] = useState<PropostaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)

  useEffect(() => {
    const fetchProposta = async () => {
      try {
        const res = await fetch(`${API_URL}/api/propostas/${resolvedParams.id}`)
        if (res.ok) {
          const data = await res.json()
          setProposta(data)
          
          // Buscar itens da proposta
          const resItens = await fetch(`${API_URL}/api/propostas/${resolvedParams.id}/itens`)
          if (resItens.ok) {
            const itensData = await resItens.json()
            setItensEditados(itensData)
          }
        } else {
          setError('Proposta não encontrada')
        }
      } catch (err) {
        console.error('Erro ao buscar proposta:', err)
        setError('Erro ao carregar proposta')
      } finally {
        setLoading(false)
      }
    }
    fetchProposta()
  }, [resolvedParams.id])

  const parseIsoLocal = (value?: string) => {
    if (!value) return undefined
    const match = value.match(/^\s*(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?\s*$/)
    if (!match) return undefined
    const [, ano, mes, dia, hora, min, seg = '00'] = match
    const date = new Date(
      parseInt(ano),
      parseInt(mes) - 1,
      parseInt(dia),
      parseInt(hora),
      parseInt(min),
      parseInt(seg)
    )
    return isNaN(date.getTime()) ? undefined : date
  }

  const podeExcluir = () => {
    if (!proposta?.licitacao?.data_abertura_sessao) return false
    const abertura = parseIsoLocal(proposta.licitacao.data_abertura_sessao)
    if (!abertura) return false
    return new Date() < abertura
  }

  const podeEditar = () => {
    if (!proposta) return false
    // Pode editar se a proposta não foi desclassificada/cancelada e a licitação ainda está em acolhimento
    const statusEditaveis = ['RASCUNHO', 'ENVIADA', 'RECEBIDA', 'CLASSIFICADA']
    const fasesEditaveis = ['PUBLICADO', 'ACOLHIMENTO_PROPOSTAS', 'ANALISE_PROPOSTAS']
    if (!statusEditaveis.includes(proposta.status)) return false
    if (!proposta.licitacao || !fasesEditaveis.includes(proposta.licitacao.fase)) return false
    const abertura = parseIsoLocal(proposta.licitacao.data_abertura_sessao)
    if (!abertura) return true
    return new Date() < abertura
  }

  const handleExcluir = async () => {
    try {
      setError(null)
      setSuccess(null)

      const fornecedorStr = localStorage.getItem('fornecedor')
      if (!fornecedorStr) {
        setError('Você precisa estar logado')
        return
      }
      const fornecedor = JSON.parse(fornecedorStr)

      if (!confirm('Deseja realmente excluir esta proposta?')) return

      const res = await fetch(`${API_URL}/api/propostas/${resolvedParams.id}?fornecedorId=${fornecedor.id}`, {
        method: 'DELETE'
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.message || 'Erro ao excluir proposta')
      }

      const licId = proposta?.licitacao?.id
      if (licId) {
        router.replace(`/fornecedor/licitacoes/${licId}`)
      } else {
        router.replace('/fornecedor/licitacoes')
      }
    } catch (e: any) {
      setError(e.message || 'Erro ao excluir proposta')
    }
  }

  const updateItemValue = (itemId: string, field: string, value: string | number) => {
    setItensEditados(prev => prev.map(item => 
      item.id === itemId ? { ...item, [field]: value } : item
    ))
  }

  const calcularTotal = () => {
    return itensEditados.reduce((total, item) => {
      const quantidade = item.item_licitacao?.quantidade || 0
      return total + (quantidade * (item.valor_unitario || 0))
    }, 0)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      // Atualizar cada item da proposta
      for (const item of itensEditados) {
        await fetch(`${API_URL}/api/propostas/item/${item.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            valor_unitario: item.valor_unitario,
            marca: item.marca,
            modelo: item.modelo
          })
        })
      }

      // Atualizar valor total da proposta
      await fetch(`${API_URL}/api/propostas/${resolvedParams.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valor_total_proposta: calcularTotal()
        })
      })

      setSuccess('Proposta atualizada com sucesso!')
      setEditMode(false)
      
      // Recarregar dados
      const res = await fetch(`${API_URL}/api/propostas/${resolvedParams.id}`)
      if (res.ok) {
        const data = await res.json()
        setProposta(data)
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar proposta')
    } finally {
      setSaving(false)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
  }

  const formatDate = (date: string) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string }> = {
      RASCUNHO: { label: 'Rascunho', className: 'bg-slate-100 text-slate-800' },
      ENVIADA: { label: 'Enviada', className: 'bg-blue-100 text-blue-800' },
      RECEBIDA: { label: 'Recebida', className: 'bg-cyan-100 text-cyan-800' },
      EM_ANALISE: { label: 'Em Análise', className: 'bg-yellow-100 text-yellow-800' },
      CLASSIFICADA: { label: 'Classificada', className: 'bg-green-100 text-green-800' },
      DESCLASSIFICADA: { label: 'Desclassificada', className: 'bg-red-100 text-red-800' },
      VENCEDORA: { label: 'Vencedora', className: 'bg-emerald-100 text-emerald-800' },
      CANCELADA: { label: 'Cancelada', className: 'bg-gray-100 text-gray-800' },
    }
    const config = map[status] || { label: status, className: 'bg-gray-100 text-gray-800' }
    return <Badge className={config.className}>{config.label}</Badge>
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Carregando proposta...</p>
      </div>
    )
  }

  if (!proposta) {
    return (
      <div className="space-y-6">
        <Alert className="bg-red-50 border-red-200">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">Erro</AlertTitle>
          <AlertDescription className="text-red-700">Proposta não encontrada</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Minha Proposta</h1>
            <p className="text-muted-foreground">{proposta.licitacao?.numero_processo} - {proposta.licitacao?.objeto}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge(proposta.status)}
          {podeExcluir() && !editMode && (
            <Button variant="destructive" onClick={handleExcluir}>
              Excluir Proposta
            </Button>
          )}
          {podeEditar() && !editMode && (
            <Button onClick={() => setEditMode(true)}>
              <Edit className="mr-2 h-4 w-4" /> Editar Proposta
            </Button>
          )}
          {editMode && (
            <>
              <Button variant="outline" onClick={() => setEditMode(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving} className="bg-green-600 hover:bg-green-700">
                <Save className="mr-2 h-4 w-4" /> {saving ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Alertas */}
      {error && (
        <Alert className="bg-red-50 border-red-200">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">Erro</AlertTitle>
          <AlertDescription className="text-red-700">{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="bg-green-50 border-green-200">
          <Check className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-800">Sucesso</AlertTitle>
          <AlertDescription className="text-green-700">{success}</AlertDescription>
        </Alert>
      )}

      {!podeEditar() && proposta.status !== 'VENCEDORA' && (
        <Alert className="bg-yellow-50 border-yellow-200">
          <Clock className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-yellow-800">Proposta bloqueada</AlertTitle>
          <AlertDescription className="text-yellow-700">
            Esta proposta não pode mais ser editada pois a abertura da sessão já ocorreu.
          </AlertDescription>
        </Alert>
      )}

      {/* Resumo */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Valor Total</p>
            <p className="text-2xl font-bold text-blue-600">{formatCurrency(editMode ? calcularTotal() : proposta.valor_total_proposta)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Itens Cotados</p>
            <p className="text-2xl font-bold">{itensEditados.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Data de Envio</p>
            <p className="text-lg font-medium">{formatDate(proposta.data_envio)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Fase da Licitação</p>
            <p className="text-lg font-medium">{proposta.licitacao?.fase?.replace(/_/g, ' ')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Declarações */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Declarações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              {proposta.declaracao_termos ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600" />
              )}
              <span>Termo de Aceitação</span>
            </div>
            <div className="flex items-center gap-2">
              {proposta.declaracao_mpe ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <span className="h-4 w-4 text-gray-400">-</span>
              )}
              <span>ME/EPP</span>
            </div>
            <div className="flex items-center gap-2">
              {proposta.declaracao_integridade ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600" />
              )}
              <span>Programa de Integridade</span>
            </div>
            <div className="flex items-center gap-2">
              {proposta.declaracao_inexistencia_fatos ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600" />
              )}
              <span>Inexistência de Fatos Impeditivos</span>
            </div>
            <div className="flex items-center gap-2">
              {proposta.declaracao_menor ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600" />
              )}
              <span>Trabalho de Menor</span>
            </div>
            <div className="flex items-center gap-2">
              {proposta.declaracao_reserva_cargos ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <span className="h-4 w-4 text-gray-400">-</span>
              )}
              <span>Reserva de Cargos</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Itens da Proposta */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Itens da Proposta
          </CardTitle>
          <CardDescription>
            {editMode ? 'Edite os valores e especificações dos itens' : 'Valores e especificações cotados'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">Item</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-center">Qtd</TableHead>
                <TableHead className="text-right">Valor Ref.</TableHead>
                <TableHead className="text-right">Seu Valor Unit.</TableHead>
                <TableHead>Marca/Modelo</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itensEditados.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.item_licitacao?.numero_item}</TableCell>
                  <TableCell>
                    <p className="whitespace-pre-wrap break-words">
                      {item.item_licitacao?.descricao_resumida}
                    </p>
                  </TableCell>
                  <TableCell className="text-center">
                    {item.item_licitacao?.quantidade} {item.item_licitacao?.unidade_medida}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatCurrency(item.item_licitacao?.valor_unitario_estimado || 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {editMode ? (
                      <Input
                        type="number"
                        step="0.01"
                        className="w-32 text-right"
                        value={item.valor_unitario || ""}
                        onChange={(e) => updateItemValue(item.id, 'valor_unitario', parseFloat(e.target.value) || 0)}
                      />
                    ) : (
                      <span className="font-medium">{formatCurrency(item.valor_unitario)}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editMode ? (
                      <Input
                        className="w-40"
                        placeholder="Marca / Modelo"
                        value={item.marca || ''}
                        onChange={(e) => updateItemValue(item.id, 'marca', e.target.value)}
                      />
                    ) : (
                      <span>{item.marca || '-'}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency((item.item_licitacao?.quantidade || 0) * (item.valor_unitario || 0))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-6 flex justify-end">
            <div className="bg-slate-100 p-4 rounded-lg text-right">
              <p className="text-xl font-bold text-blue-600">
                Total da Proposta: {formatCurrency(editMode ? calcularTotal() : proposta.valor_total_proposta)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Link para sala de disputa */}
      {proposta.licitacao?.fase === 'EM_DISPUTA' && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-blue-800">Disputa em andamento!</h3>
                <p className="text-blue-600">A fase de lances já começou. Acesse a sala de disputa para participar.</p>
              </div>
              <Link href={`/fornecedor/licitacoes/${proposta.licitacao.id}/sala`}>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  Entrar na Sala de Disputa
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Send,
  ArrowLeft,
  CheckCircle,
  Package,
  Building,
  Calendar,
  Loader2,
  FileText,
} from 'lucide-react'
import { API_URL, authFetch, formatarDataBR } from '@/lib/api'

const STATUS_ORDEM: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  EMITIDA: { label: 'Emitida', variant: 'secondary' },
  ENVIADA: { label: 'Enviada', variant: 'default' },
  EM_ATENDIMENTO: { label: 'Em Atendimento', variant: 'default' },
  ATENDIDA_PARCIAL: { label: 'Parcialmente Atendida', variant: 'secondary' },
  ATENDIDA: { label: 'Atendida', variant: 'outline' },
}

interface Ordem {
  id: string
  numero: string
  status: string
  tipo: string
  descricao: string | null
  valor_total: number
  valor_entregue: number
  data_emissao: string
  data_entrega_prevista: string | null
  data_entrega_realizada: string | null
  local_entrega: string | null
  observacao_fornecedor: string | null
  data_aceite_fornecedor: string | null
  orgao?: { id: string; nome: string; cidade?: string; uf?: string }
  contrato?: { numero_contrato: string }
  itens: Array<{
    numero_item: number
    descricao: string
    unidade_medida: string
    quantidade: number
    quantidade_entregue: number
    valor_unitario: number
    valor_total: number
  }>
}

export default function OrdemDetalheFornecedorPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [ordem, setOrdem] = useState<Ordem | null>(null)
  const [loading, setLoading] = useState(true)
  const [acao, setAcao] = useState<'ciencia-recebimento' | 'ciencia-entrega' | null>(null)
  const [observacao, setObservacao] = useState('')
  const [dataEntrega, setDataEntrega] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    carregarOrdem()
  }, [id])

  const carregarOrdem = async () => {
    setLoading(true)
    try {
      const res = await authFetch(`${API_URL}/api/fornecedor/ordens/${id}`)
      if (res.ok) {
        setOrdem(await res.json())
      } else {
        setOrdem(null)
      }
    } catch (error) {
      console.error('Erro ao carregar ordem:', error)
      setOrdem(null)
    } finally {
      setLoading(false)
    }
  }

  const formatarMoeda = (valor: number) =>
    (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const handleCienciaRecebimento = async () => {
    setSubmitting(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/fornecedor/ordens/${id}/ciencia-recebimento`, {
        method: 'POST',
        body: JSON.stringify({ observacao: observacao || undefined }),
      })
      if (res.ok) {
        setAcao(null)
        setObservacao('')
        await carregarOrdem()
      } else {
        const data = await res.json().catch(() => ({}))
        setErro(data.message || 'Erro ao registrar ciência')
      }
    } catch (error) {
      setErro('Erro ao registrar ciência de recebimento')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCienciaEntrega = async () => {
    if (!dataEntrega) {
      setErro('Informe a data de entrega')
      return
    }
    setSubmitting(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/fornecedor/ordens/${id}/ciencia-entrega`, {
        method: 'POST',
        body: JSON.stringify({
          data_entrega: dataEntrega,
          observacao: observacao || undefined,
        }),
      })
      if (res.ok) {
        setAcao(null)
        setObservacao('')
        setDataEntrega('')
        await carregarOrdem()
      } else {
        const data = await res.json().catch(() => ({}))
        setErro(data.message || 'Erro ao registrar entrega')
      }
    } catch (error) {
      setErro('Erro ao registrar ciência de entrega')
    } finally {
      setSubmitting(false)
    }
  }

  const podeCienciaRecebimento = ordem?.status === 'ENVIADA'
  const podeCienciaEntrega = ['ENVIADA', 'EM_ATENDIMENTO', 'ATENDIDA_PARCIAL'].includes(
    ordem?.status || ''
  )

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!ordem) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-600">Ordem não encontrada.</p>
        <Button asChild className="mt-4">
          <Link href="/fornecedor/ordens">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/fornecedor/ordens">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-7 w-7 text-blue-600" />
              {ordem.numero}
            </h1>
            <p className="text-gray-600">
              {ordem.orgao?.nome || '-'} • {ordem.tipo}
            </p>
          </div>
        </div>
        <Badge variant={STATUS_ORDEM[ordem.status]?.variant || 'secondary'} className="text-sm">
          {STATUS_ORDEM[ordem.status]?.label || ordem.status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Informações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Órgão</p>
              <p className="font-medium">{ordem.orgao?.nome || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Contrato</p>
              <p className="font-medium">{ordem.contrato?.numero_contrato || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Data de Emissão</p>
              <p className="font-medium">{formatarDataBR(ordem.data_emissao)}</p>
            </div>
            {ordem.data_entrega_prevista && (
              <div>
                <p className="text-sm text-gray-500">Entrega Prevista</p>
                <p className="font-medium">{formatarDataBR(ordem.data_entrega_prevista)}</p>
              </div>
            )}
            {ordem.local_entrega && (
              <div>
                <p className="text-sm text-gray-500">Local de Entrega</p>
                <p className="font-medium">{ordem.local_entrega}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-gray-500">Valor Total</p>
              <p className="font-bold text-lg">{formatarMoeda(ordem.valor_total)}</p>
            </div>
            {Number(ordem.valor_entregue) > 0 && (
              <div>
                <p className="text-sm text-gray-500">Valor Entregue</p>
                <p className="font-medium text-green-600">{formatarMoeda(ordem.valor_entregue)}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ações</CardTitle>
            <CardDescription>
              Dê ciência de recebimento ou informe a data de entrega
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {podeCienciaRecebimento && (
              <Button
                className="w-full"
                onClick={() => {
                  setAcao('ciencia-recebimento')
                  setObservacao('')
                  setErro(null)
                }}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Dar Ciência de Recebimento
              </Button>
            )}
            {podeCienciaEntrega && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setAcao('ciencia-entrega')
                  setDataEntrega(new Date().toISOString().split('T')[0])
                  setObservacao('')
                  setErro(null)
                }}
              >
                <Package className="h-4 w-4 mr-2" />
                Informar Data de Entrega
              </Button>
            )}
            {!podeCienciaRecebimento && !podeCienciaEntrega && (
              <p className="text-sm text-gray-500">
                Nenhuma ação disponível para o status atual.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Itens da Ordem</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Item</th>
                  <th className="text-left py-2">Descrição</th>
                  <th className="text-right py-2">Qtd</th>
                  <th className="text-right py-2">Entregue</th>
                  <th className="text-right py-2">Valor Unit.</th>
                  <th className="text-right py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {ordem.itens?.map((item, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="py-2">{item.numero_item}</td>
                    <td className="py-2">{item.descricao}</td>
                    <td className="text-right py-2">
                      {item.quantidade} {item.unidade_medida}
                    </td>
                    <td className="text-right py-2">{item.quantidade_entregue}</td>
                    <td className="text-right py-2">{formatarMoeda(item.valor_unitario)}</td>
                    <td className="text-right py-2">{formatarMoeda(item.valor_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!acao} onOpenChange={() => !submitting && setAcao(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {acao === 'ciencia-recebimento' ? 'Ciência de Recebimento' : 'Informar Data de Entrega'}
            </DialogTitle>
            <DialogDescription>
              {acao === 'ciencia-recebimento'
                ? 'Confirme que recebeu a ordem e está em condições de atendê-la.'
                : 'Informe a data em que a entrega foi ou será realizada.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {acao === 'ciencia-entrega' && (
              <div>
                <Label htmlFor="dataEntrega">Data de Entrega *</Label>
                <Input
                  id="dataEntrega"
                  type="date"
                  value={dataEntrega}
                  onChange={(e) => setDataEntrega(e.target.value)}
                  className="mt-1"
                />
              </div>
            )}
            <div>
              <Label htmlFor="observacao">Observação (opcional)</Label>
              <Textarea
                id="observacao"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Observações adicionais..."
                className="mt-1"
                rows={3}
              />
            </div>
            {erro && <p className="text-sm text-red-600">{erro}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcao(null)} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              onClick={acao === 'ciencia-recebimento' ? handleCienciaRecebimento : handleCienciaEntrega}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

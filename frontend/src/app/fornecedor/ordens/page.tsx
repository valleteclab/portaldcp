'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Send,
  Eye,
  CheckCircle,
  Clock,
  Package,
  Building,
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
  valor_total: number
  valor_entregue: number
  data_emissao: string
  data_entrega_prevista: string | null
  data_entrega_realizada: string | null
  local_entrega: string | null
  orgao?: { id: string; nome: string }
  contrato?: { numero_contrato: string }
}

export default function OrdensFornecedorPage() {
  const [ordens, setOrdens] = useState<Ordem[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState<string>('ALL')

  useEffect(() => {
    carregarOrdens()
  }, [filtroStatus])

  const carregarOrdens = async () => {
    setLoading(true)
    try {
      const url = filtroStatus && filtroStatus !== 'ALL'
        ? `${API_URL}/api/fornecedor/ordens?status=${filtroStatus}`
        : `${API_URL}/api/fornecedor/ordens`
      const res = await authFetch(url)
      if (res.ok) {
        setOrdens(await res.json())
      } else {
        setOrdens([])
      }
    } catch (error) {
      console.error('Erro ao carregar ordens:', error)
      setOrdens([])
    } finally {
      setLoading(false)
    }
  }

  const formatarMoeda = (valor: number) =>
    (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const ordensPendentes = ordens.filter(
    (o) => ['ENVIADA', 'EM_ATENDIMENTO'].includes(o.status)
  )
  const ordensAtendidas = ordens.filter((o) =>
    ['ATENDIDA', 'ATENDIDA_PARCIAL'].includes(o.status)
  )

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Send className="h-7 w-7 text-blue-600" />
          Ordens de Fornecimento
        </h1>
        <p className="text-gray-600 mt-1">
          Visualize e acompanhe as ordens enviadas pelo órgão
        </p>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os status</SelectItem>
            {Object.entries(STATUS_ORDEM).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {ordensPendentes.length > 0 && !filtroStatus && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-700">
              <Clock className="h-5 w-5" />
              Pendentes de Atendimento ({ordensPendentes.length})
            </CardTitle>
            <CardDescription>
              Ordens aguardando sua ciência ou entrega
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {ordensPendentes.slice(0, 5).map((ordem) => (
                <div
                  key={ordem.id}
                  className="flex items-center justify-between p-3 bg-white rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="font-medium">{ordem.numero}</p>
                      <p className="text-sm text-gray-600">
                        {ordem.orgao?.nome || '-'} • {formatarMoeda(ordem.valor_total)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_ORDEM[ordem.status]?.variant || 'secondary'}>
                      {STATUS_ORDEM[ordem.status]?.label || ordem.status}
                    </Badge>
                    <Button asChild size="sm">
                      <Link href={`/fornecedor/ordens/${ordem.id}`}>
                        <Eye className="h-4 w-4 mr-1" />
                        Ver
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Lista de Ordens</CardTitle>
          <CardDescription>
            {ordens.length} ordem(ns) encontrada(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ordens.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma ordem de fornecimento encontrada.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {ordens.map((ordem) => (
                <div
                  key={ordem.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <FileText className="h-6 w-6 text-gray-600" />
                    </div>
                    <div>
                      <p className="font-semibold">{ordem.numero}</p>
                      <p className="text-sm text-gray-600 flex items-center gap-1">
                        <Building className="h-3 w-3" />
                        {ordem.orgao?.nome || '-'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Emissão: {formatarDataBR(ordem.data_emissao)}
                        {ordem.data_entrega_prevista &&
                          ` • Prevista: ${formatarDataBR(ordem.data_entrega_prevista)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-medium">{formatarMoeda(ordem.valor_total)}</p>
                      {Number(ordem.valor_entregue) > 0 && (
                        <p className="text-xs text-gray-500">
                          Entregue: {formatarMoeda(ordem.valor_entregue)}
                        </p>
                      )}
                    </div>
                    <Badge variant={STATUS_ORDEM[ordem.status]?.variant || 'secondary'}>
                      {STATUS_ORDEM[ordem.status]?.label || ordem.status}
                    </Badge>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/fornecedor/ordens/${ordem.id}`}>
                        <Eye className="h-4 w-4 mr-1" />
                        Detalhes
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

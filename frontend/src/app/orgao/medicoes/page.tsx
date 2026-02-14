'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  ClipboardCheck, TrendingUp, Search, Building2, FileText,
  Loader2, Eye, AlertTriangle, ChevronRight, CheckCircle, Clock,
} from 'lucide-react'
import { authFetch } from '@/lib/auth'
import TabMedicao from '@/components/contratos/TabMedicao'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface ContratoResumo {
  id: string
  numero_contrato: string
  objeto: string
  fornecedor_nome: string
  fornecedor_cnpj: string
  valor_global: number
  fiscal_nome: string
  status: string
  total_medicoes: number
  submetidas: number
  parcialmente_atestadas: number
  aguardando_aprovacao: number
  aprovadas: number
  pendentes_ateste: number
}

function formatarMoeda(v: number | string) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function MedicoesPage() {
  const [contratos, setContratos] = useState<ContratoResumo[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [contratoAberto, setContratoAberto] = useState<ContratoResumo | null>(null)

  const carregarDados = useCallback(async () => {
    setLoading(true)
    try {
      const orgao = JSON.parse(localStorage.getItem('orgao') || '{}')
      const orgaoId = orgao.id
      if (!orgaoId) return

      const res = await authFetch(`${API_URL}/api/contratos/medicoes/resumo-fiscal?orgaoId=${orgaoId}`)
      if (res.ok) {
        setContratos(await res.json())
      }
    } catch (e) {
      console.error('Erro ao carregar resumo fiscal:', e)
    }
    setLoading(false)
  }, [])

  useEffect(() => { carregarDados() }, [carregarDados])

  const contratosFiltrados = contratos.filter(c => {
    if (!busca) return true
    const termo = busca.toLowerCase()
    return (
      c.numero_contrato?.toLowerCase().includes(termo) ||
      c.fornecedor_nome?.toLowerCase().includes(termo) ||
      c.objeto?.toLowerCase().includes(termo) ||
      c.fiscal_nome?.toLowerCase().includes(termo)
    )
  })

  const totalPendentesAteste = contratos.reduce((s, c) => s + c.pendentes_ateste, 0)
  const totalAguardandoAprovacao = contratos.reduce((s, c) => s + c.aguardando_aprovacao, 0)
  const totalAprovadas = contratos.reduce((s, c) => s + c.aprovadas, 0)
  const totalMedicoes = contratos.reduce((s, c) => s + c.total_medicoes, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-blue-600" />
            Painel de Medições
          </h1>
          <p className="text-gray-500 mt-1">Acompanhe e ateste as medições de todos os contratos</p>
        </div>
        <Button variant="outline" onClick={carregarDados}>
          <Loader2 className="w-4 h-4 mr-2" /> Atualizar
        </Button>
      </div>

      {/* Cards Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className={totalPendentesAteste > 0 ? 'border-yellow-300 bg-yellow-50' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              Pendentes de Ateste
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-700">{totalPendentesAteste}</div>
            <p className="text-xs text-gray-500 mt-1">Medições aguardando verificação do fiscal</p>
          </CardContent>
        </Card>

        <Card className={totalAguardandoAprovacao > 0 ? 'border-blue-300 bg-blue-50' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" />
              Aguardando Aprovação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{totalAguardandoAprovacao}</div>
            <p className="text-xs text-gray-500 mt-1">Atestadas, na Central de Aprovações</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Aprovadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{totalAprovadas}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-gray-500" />
              Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-700">{totalMedicoes}</div>
            <p className="text-xs text-gray-500 mt-1">{contratos.length} contratos</p>
          </CardContent>
        </Card>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          className="pl-10"
          placeholder="Buscar por contrato, fornecedor, objeto ou fiscal..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {/* Lista de contratos */}
      {contratosFiltrados.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-500">Nenhum contrato de medição encontrado</h3>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {contratosFiltrados.map((contrato) => (
            <Card
              key={contrato.id}
              className={`hover:shadow-md transition-shadow cursor-pointer ${contrato.pendentes_ateste > 0 ? 'border-l-4 border-l-yellow-400' : ''}`}
              onClick={() => setContratoAberto(contrato)}
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <Building2 className="w-4 h-4 text-gray-400" />
                      <span className="font-bold text-gray-900">{contrato.numero_contrato}</span>
                      <span className="text-sm text-gray-500">|</span>
                      <span className="text-sm text-gray-600">{contrato.fornecedor_nome}</span>
                    </div>
                    <p className="text-sm text-gray-500 ml-7 line-clamp-1">{contrato.objeto}</p>
                    <div className="flex items-center gap-4 mt-2 ml-7">
                      <span className="text-xs text-gray-400">Valor: {formatarMoeda(contrato.valor_global)}</span>
                      {contrato.fiscal_nome && (
                        <span className="text-xs text-gray-400">Fiscal: {contrato.fiscal_nome}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {contrato.submetidas > 0 && (
                      <Badge className="bg-yellow-100 text-yellow-800 text-xs">
                        {contrato.submetidas} submetida{contrato.submetidas > 1 ? 's' : ''}
                      </Badge>
                    )}
                    {contrato.parcialmente_atestadas > 0 && (
                      <Badge className="bg-amber-100 text-amber-800 text-xs">
                        {contrato.parcialmente_atestadas} parcial
                      </Badge>
                    )}
                    {contrato.aguardando_aprovacao > 0 && (
                      <Badge className="bg-blue-100 text-blue-800 text-xs">
                        {contrato.aguardando_aprovacao} aprovação
                      </Badge>
                    )}
                    {contrato.aprovadas > 0 && (
                      <Badge className="bg-green-100 text-green-800 text-xs">
                        {contrato.aprovadas} aprovada{contrato.aprovadas > 1 ? 's' : ''}
                      </Badge>
                    )}
                    {contrato.total_medicoes === 0 && (
                      <Badge variant="outline" className="text-xs text-gray-400">
                        Sem medições
                      </Badge>
                    )}
                    <ChevronRight className="w-5 h-5 text-gray-300" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal com TabMedicao */}
      <Dialog open={!!contratoAberto} onOpenChange={() => setContratoAberto(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-blue-600" />
              {contratoAberto?.numero_contrato} — {contratoAberto?.fornecedor_nome}
            </DialogTitle>
          </DialogHeader>
          {contratoAberto && (
            <TabMedicao
              contratoId={contratoAberto.id}
              valorGlobal={contratoAberto.valor_global}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

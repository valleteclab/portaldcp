'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertTriangle,
  ArrowRight,
  Building,
  CheckCircle,
  ClipboardCheck,
  Clock,
  FileText,
  RotateCcw,
  Send,
} from 'lucide-react'
import {
  calcularDiasRestantes,
  carregarOverviewMedicoesFornecedor,
  formatarData,
  formatarMoeda,
  obterStatusMedicaoLabel,
  type ContratoMedicaoOverview,
} from '@/lib/fornecedor-medicoes'

export default function FornecedorMedicoesPage() {
  const [loading, setLoading] = useState(true)
  const [overviews, setOverviews] = useState<ContratoMedicaoOverview[]>([])

  useEffect(() => {
    const carregar = async () => {
      setLoading(true)
      try {
        setOverviews(await carregarOverviewMedicoesFornecedor())
      } finally {
        setLoading(false)
      }
    }

    carregar()
  }, [])

  const pendentes = useMemo(
    () => overviews.filter((item) => item.devolvidaEditavel || item.rascunho || item.temNovaMedicaoDisponivel),
    [overviews],
  )

  const historico = useMemo(
    () => overviews.filter((item) => item.ultimaMedicao),
    [overviews],
  )

  const resumo = useMemo(() => {
    return overviews.reduce(
      (acc, item) => {
        acc.emAnalise += item.emAnalise
        acc.devolvidas += item.devolvidas.length
        acc.rascunhos += item.rascunho ? 1 : 0
        acc.aprovadas += item.resumo?.medicoes_aprovadas || 0
        return acc
      },
      { emAnalise: 0, devolvidas: 0, rascunhos: 0, aprovadas: 0 },
    )
  }, [overviews])

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Carregando central de medições...</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Medições</h1>
          <p className="text-gray-600">Acesse rapidamente suas pendências, histórico e a próxima ação de cada contrato.</p>
        </div>
        <Button asChild className="gap-2 bg-blue-600 hover:bg-blue-700">
          <Link href="/fornecedor/contratos">
            <FileText className="w-4 h-4" />Ver todos os contratos
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pendências</p>
                <p className="text-2xl font-bold text-amber-600">{pendentes.length}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Em análise</p>
                <p className="text-2xl font-bold text-blue-600">{resumo.emAnalise}</p>
              </div>
              <Clock className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Devolvidas</p>
                <p className="text-2xl font-bold text-orange-600">{resumo.devolvidas}</p>
              </div>
              <RotateCcw className="w-8 h-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Aprovadas</p>
                <p className="text-2xl font-bold text-green-600">{resumo.aprovadas}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-800">
            <ClipboardCheck className="w-5 h-5" />Próximas ações
          </CardTitle>
          <CardDescription className="text-blue-700">
            Esta área foi pensada para você abrir, corrigir ou acompanhar medições sem navegar por várias telas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pendentes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-blue-200 bg-white p-6 text-center text-sm text-blue-700">
              Nenhuma pendência de medição no momento.
            </div>
          ) : (
            pendentes.map((item) => {
              const diasRestantes = calcularDiasRestantes(item.contrato.data_vigencia_fim)
              return (
                <div key={item.contrato.id} className="rounded-lg border bg-white p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{item.contrato.numero_contrato}</p>
                      <Badge variant="secondary">{item.acaoPrincipal.label}</Badge>
                      {diasRestantes !== null && diasRestantes <= 30 && (
                        <Badge className="bg-yellow-100 text-yellow-800">{diasRestantes} dias de vigência</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2">{item.contrato.objeto}</p>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Building className="w-4 h-4" />{item.contrato.orgao?.nome || 'Órgão'}
                      </span>
                      {item.devolvidaEditavel && (
                        <span className="text-amber-700">Medição devolvida aguardando correção</span>
                      )}
                      {item.rascunho && !item.devolvidaEditavel && (
                        <span className="text-slate-700">Rascunho pronto para continuar</span>
                      )}
                      {item.temNovaMedicaoDisponivel && !item.devolvidaEditavel && !item.rascunho && (
                        <span className="text-blue-700">Pronto para abrir nova medição</span>
                      )}
                    </div>
                  </div>
                  <Button asChild className="gap-2 bg-blue-600 hover:bg-blue-700">
                    <Link href={item.acaoPrincipal.href}>
                      {item.acaoPrincipal.label}
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </Button>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico resumido</CardTitle>
          <CardDescription>Última situação de medição por contrato.</CardDescription>
        </CardHeader>
        <CardContent>
          {historico.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>Nenhuma medição encontrada.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {historico.map((item) => (
                <div key={item.contrato.id} className="rounded-lg border p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{item.contrato.numero_contrato}</p>
                      {item.ultimaMedicao && (
                        <Badge className="bg-slate-100 text-slate-700">
                          {obterStatusMedicaoLabel(item.ultimaMedicao.status)}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{item.contrato.objeto}</p>
                    {item.ultimaMedicao && (
                      <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                        <span>Última medição: {item.ultimaMedicao.numero_medicao}ª</span>
                        <span>Período: {formatarData(item.ultimaMedicao.periodo_inicio)} a {formatarData(item.ultimaMedicao.periodo_fim)}</span>
                        <span>Valor: {formatarMoeda(item.ultimaMedicao.valor_medido)}</span>
                        <span>Em análise: {item.emAnalise}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" asChild>
                      <Link href={`/fornecedor/contratos/${item.contrato.id}?tab=medicoes`}>
                        <Send className="w-4 h-4 mr-1" />Abrir histórico
                      </Link>
                    </Button>
                    <Button asChild className="gap-2 bg-blue-600 hover:bg-blue-700">
                      <Link href={item.acaoPrincipal.href}>{item.acaoPrincipal.label}</Link>
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

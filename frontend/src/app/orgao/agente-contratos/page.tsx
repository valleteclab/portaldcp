'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ModuleGuard } from '@/components/ModuleGuard'
import { ModuloSistema } from '@/hooks/useModulosOrgao'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  agenteContratosService,
  AgenteEstatisticas,
  AgenteLog,
  CicloAgenteResult,
  ContratoComPendenciaAditivo,
} from '@/services/agente-contratos.service'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileSearch,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'

function AgenteContratosPageContent() {
  const [orgaoId, setOrgaoId] = useState('')
  const [loading, setLoading] = useState(false)
  const [estatisticas, setEstatisticas] = useState<AgenteEstatisticas | null>(null)
  const [logs, setLogs] = useState<AgenteLog[]>([])
  const [resultado, setResultado] = useState<CicloAgenteResult | null>(null)

  useEffect(() => {
    const orgaoStr = localStorage.getItem('orgao')
    if (!orgaoStr) return

    try {
      const orgao = JSON.parse(orgaoStr)
      setOrgaoId(orgao.id)
    } catch (error) {
      console.error('Erro ao obter orgao_id:', error)
    }
  }, [])

  const carregarDados = useCallback(async () => {
    if (!orgaoId) return

    try {
      const [estatisticasData, logsData] = await Promise.all([
        agenteContratosService.obterEstatisticas(orgaoId),
        agenteContratosService.obterLogs(orgaoId, 20),
      ])

      setEstatisticas(estatisticasData)
      setLogs(logsData)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao carregar dados do verificador'
      toast.error(message)
    }
  }, [orgaoId])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  const executarVerificacao = async () => {
    if (!orgaoId) {
      toast.error('Orgao nao identificado')
      return
    }

    setLoading(true)
    try {
      const data = await agenteContratosService.executarCiclo(orgaoId)
      setResultado(data)
      toast.success(
        data.contratos_com_pendencias > 0
          ? `${data.contratos_com_pendencias} contrato(s) com termo(s) pendente(s) encontrado(s)`
          : 'Nenhum termo aditivo pendente encontrado'
      )
      await carregarDados()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao verificar termos aditivos'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const formatarData = (data?: string | null) => {
    if (!data) return '—'
    return new Date(data).toLocaleDateString('pt-BR')
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'AVISO':
        return <Badge className="bg-amber-100 text-amber-800">Pendencia</Badge>
      case 'SUCESSO':
        return <Badge className="bg-green-100 text-green-800">Sucesso</Badge>
      case 'ERRO':
        return <Badge className="bg-red-100 text-red-800">Erro</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const renderPendencia = (contrato: ContratoComPendenciaAditivo) => (
    <Card key={contrato.contrato_id} className="border-amber-200">
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">{contrato.numero_contrato}</h3>
              <Badge className="bg-slate-100 text-slate-800">{contrato.status_contrato}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{contrato.fornecedor_nome}</p>
            <p className="text-sm text-muted-foreground">
              Vigencia final registrada: {formatarData(contrato.data_vigencia_fim)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href={contrato.link_contrato}>
              <Button className="bg-blue-600 hover:bg-blue-700">
                Cadastrar no contrato
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Portal</p>
            <p className="text-2xl font-bold">{contrato.aditivos_portal_total}</p>
            <p className="text-sm text-muted-foreground">termo(s) encontrado(s)</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Sistema</p>
            <p className="text-2xl font-bold">{contrato.termos_cadastrados_total}</p>
            <p className="text-sm text-muted-foreground">termo(s) cadastrado(s)</p>
          </div>
          <div className="rounded-lg bg-amber-50 p-3">
            <p className="text-xs uppercase tracking-wide text-amber-700">Pendentes</p>
            <p className="text-2xl font-bold text-amber-700">{contrato.pendentes_total}</p>
            <p className="text-sm text-amber-700">precisam ser cadastrados</p>
          </div>
        </div>

        <div className="space-y-3">
          {contrato.aditivos_pendentes.map((aditivo, index) => (
            <div key={`${contrato.contrato_id}-${index}`} className="rounded-lg border p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <p className="font-medium">{aditivo.nome}</p>
                  <p className="text-sm text-muted-foreground">
                    Tipo: {aditivo.tipo || 'Nao informado'} | Valor: {aditivo.valor || 'Nao informado'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Vigencia: {aditivo.vigencia || 'Nao informada'}
                  </p>
                  {aditivo.fiscal ? (
                    <p className="text-sm text-muted-foreground">Fiscal: {aditivo.fiscal}</p>
                  ) : null}
                </div>

                {aditivo.pdf_url ? (
                  <a href={aditivo.pdf_url} target="_blank" rel="noreferrer">
                    <Button variant="outline" size="sm">
                      Ver PDF
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </Button>
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-amber-100 p-3">
          <FileSearch className="h-8 w-8 text-amber-700" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Verificador de Termos Aditivos</h1>
          <p className="text-muted-foreground">
            Analisa contratos vencidos ou encerrados e mostra quais possuem termos no Portal que ainda precisam ser cadastrados.
          </p>
        </div>
      </div>

      <Alert className="border-amber-200 bg-amber-50">
        <AlertTriangle className="h-4 w-4 text-amber-700" />
        <AlertDescription className="text-amber-900">
          Use esta tela para fazer uma varredura em lote. O sistema busca aditivos no Portal de Transparencia e aponta os contratos onde ainda falta cadastrar o termo na aba de contratos.
        </AlertDescription>
      </Alert>

      {estatisticas ? (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total de execucoes</p>
              <p className="text-2xl font-bold">{estatisticas.total_acoes}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Avisos</p>
              <p className="text-2xl font-bold text-amber-700">{estatisticas.avisos}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Erros</p>
              <p className="text-2xl font-bold text-red-600">{estatisticas.erros}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Contratos com pendencias em 7 dias</p>
              <p className="text-2xl font-bold">{estatisticas.contratos_com_pendencias_7dias}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Executar verificacao
          </CardTitle>
          <CardDescription>
            Busca termos aditivos em lote para contratos vencidos ou encerrados do orgao atual.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-muted-foreground">
            Ultima execucao: {formatarData(estatisticas?.ultima_execucao)}
          </div>
          <Button onClick={executarVerificacao} disabled={loading || !orgaoId} className="bg-amber-600 hover:bg-amber-700">
            {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <FileSearch className="mr-2 h-4 w-4" />}
            Verificar termos pendentes
          </Button>
        </CardContent>
      </Card>

      {resultado ? (
        <Card>
          <CardHeader>
            <CardTitle>Resultado da ultima verificacao</CardTitle>
            <CardDescription>
              {resultado.contratos_analisados} contrato(s) analisado(s)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-sm text-muted-foreground">Com pendencias</p>
                <p className="text-3xl font-bold text-amber-700">{resultado.contratos_com_pendencias}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-sm text-muted-foreground">Sem pendencias</p>
                <p className="text-3xl font-bold text-green-600">{resultado.contratos_sem_pendencias}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-sm text-muted-foreground">Sem aditivos no portal</p>
                <p className="text-3xl font-bold">{resultado.contratos_sem_aditivos_no_portal}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-sm text-muted-foreground">Erros</p>
                <p className="text-3xl font-bold text-red-600">{resultado.erros}</p>
              </div>
            </div>

            {resultado.pendencias.length > 0 ? (
              <div className="space-y-4">
                {resultado.pendencias.map(renderPendencia)}
              </div>
            ) : (
              <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
                <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-600" />
                <p className="font-medium text-green-800">Nenhum termo aditivo pendente encontrado.</p>
                <p className="text-sm text-green-700">
                  Os contratos analisados ja estao alinhados com o que foi encontrado no Portal.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Logs recentes</CardTitle>
          <CardDescription>Resumo das ultimas verificacoes executadas</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Clock3 className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p>Nenhum log encontrado.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="rounded-lg border p-4">
                  <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(log.status)}
                      <span className="font-medium">{log.tipo_acao}</span>
                      {log.contrato_numero ? (
                        <span className="text-sm text-muted-foreground">Contrato {log.contrato_numero}</span>
                      ) : null}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {new Date(log.created_at).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  {log.mensagem ? <p className="text-sm">{log.mensagem}</p> : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function AgenteContratosPage() {
  return (
    <ModuleGuard modulo={ModuloSistema.IA_CONTRATOS}>
      <AgenteContratosPageContent />
    </ModuleGuard>
  )
}

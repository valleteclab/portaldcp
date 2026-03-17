'use client'

import { ModuleGuard } from '@/components/ModuleGuard'
import { ModuloSistema } from '@/hooks/useModulosOrgao'
import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Play, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Bot,
  FileText,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Activity
} from 'lucide-react'
import { agenteContratosService, AgenteLog, CicloAgenteResult, AgenteEstatisticas } from '@/services/agente-contratos.service'
import { toast } from 'sonner'

function AgenteContratosPageContent() {
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<AgenteLog[]>([])
  const [estatisticas, setEstatisticas] = useState<AgenteEstatisticas | null>(null)
  const [ultimoResultado, setUltimoResultado] = useState<CicloAgenteResult | null>(null)
  const [orgaoId, setOrgaoId] = useState<string>('')
  const [logsExpandidos, setLogsExpandidos] = useState<Set<string>>(new Set())

  useEffect(() => {
    const orgaoStr = localStorage.getItem('orgao')
    if (orgaoStr) {
      try {
        const orgao = JSON.parse(orgaoStr)
        setOrgaoId(orgao.id)
      } catch (e) {
        console.error('Erro ao obter orgao_id:', e)
      }
    }
  }, [])

  const carregarDados = useCallback(async () => {
    if (!orgaoId) return
    
    try {
      const [logsData, statsData] = await Promise.all([
        agenteContratosService.obterLogs(orgaoId, 50),
        agenteContratosService.obterEstatisticas(orgaoId),
      ])
      setLogs(logsData)
      setEstatisticas(statsData)
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    }
  }, [orgaoId])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  const executarAgente = async () => {
    if (!orgaoId) {
      toast.error('Órgão não identificado')
      return
    }

    setLoading(true)
    try {
      const resultado = await agenteContratosService.executarCiclo(orgaoId)
      setUltimoResultado(resultado)
      toast.success(`Ciclo executado! ${resultado.contratos_importados} contratos importados`)
      await carregarDados()
    } catch (error: any) {
      toast.error(error.message || 'Erro ao executar agente')
    } finally {
      setLoading(false)
    }
  }

  const toggleLog = (logId: string) => {
    const novoSet = new Set(logsExpandidos)
    if (novoSet.has(logId)) {
      novoSet.delete(logId)
    } else {
      novoSet.add(logId)
    }
    setLogsExpandidos(novoSet)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCESSO':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'ERRO':
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUCESSO':
        return <Badge className="bg-green-100 text-green-800">Sucesso</Badge>
      case 'ERRO':
        return <Badge className="bg-red-100 text-red-800">Erro</Badge>
      default:
        return <Badge className="bg-yellow-100 text-yellow-800">Pendente</Badge>
    }
  }

  const getTipoAcaoLabel = (tipo: string) => {
    const labels: Record<string, string> = {
      'BUSCA_PORTAL': 'Busca Portal',
      'IMPORTACAO_CONTRATO': 'Importação',
      'ANALISE_PENDENCIAS': 'Análise',
      'COBRANCA_FORNECEDOR': 'Cobrança',
      'VALIDACAO_MEDICAO': 'Validação',
    }
    return labels[tipo] || tipo
  }

  const formatarData = (data: string) => {
    return new Date(data).toLocaleString('pt-BR')
  }

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-blue-100 rounded-lg">
          <Bot className="h-8 w-8 text-blue-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Agente Autônomo de Contratos</h1>
          <p className="text-muted-foreground">
            Automatização de busca, importação e gestão de contratos
          </p>
        </div>
      </div>

      {/* Alerta informativo */}
      <Alert className="mb-6 bg-blue-50 border-blue-200">
        <Activity className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800">
          <strong>Como funciona:</strong> O agente busca contratos automaticamente no Portal da Transparência, 
          baixa os PDFs, extrai os itens via IA e cadastra tudo no sistema. 
          O ciclo automático roda todo dia às <strong>06:00</strong>.
        </AlertDescription>
      </Alert>

      {/* Cards de estatísticas */}
      {estatisticas && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Ações (7 dias)</p>
                  <p className="text-2xl font-bold">{estatisticas.total_acoes}</p>
                </div>
                <Activity className="h-8 w-8 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Sucessos</p>
                  <p className="text-2xl font-bold text-green-600">{estatisticas.sucessos}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Erros</p>
                  <p className="text-2xl font-bold text-red-600">{estatisticas.erros}</p>
                </div>
                <XCircle className="h-8 w-8 text-red-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Contratos Importados</p>
                  <p className="text-2xl font-bold">{estatisticas.contratos_importados_7dias}</p>
                </div>
                <FileText className="h-8 w-8 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Botão executar */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Executar Ciclo Manual</h3>
              <p className="text-sm text-muted-foreground">
                Disparar busca e importação imediata de contratos
              </p>
            </div>
            <Button 
              size="lg" 
              onClick={executarAgente} 
              disabled={loading || !orgaoId}
              className="gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-5 w-5 animate-spin" />
                  Executando...
                </>
              ) : (
                <>
                  <Play className="h-5 w-5" />
                  Executar Agente
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Resultado da última execução */}
      {ultimoResultado && (
        <Card className="mb-6 border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-800">
              <CheckCircle className="h-5 w-5" />
              Última Execução - Sucesso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-600">{ultimoResultado.total_processado}</p>
                <p className="text-sm text-muted-foreground">Total Processado</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600">{ultimoResultado.contratos_importados}</p>
                <p className="text-sm text-muted-foreground">Importados</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-red-600">{ultimoResultado.erros}</p>
                <p className="text-sm text-muted-foreground">Erros</p>
              </div>
            </div>
            
            {ultimoResultado.detalhes.length > 0 && (
              <div className="mt-4">
                <h4 className="font-semibold mb-2">Detalhes:</h4>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {ultimoResultado.detalhes.map((detalhe, idx) => (
                    <div 
                      key={idx} 
                      className={`flex items-center gap-2 p-2 rounded text-sm ${
                        detalhe.status === 'importado' 
                          ? 'bg-green-100 text-green-800' 
                          : detalhe.status === 'ja_existente'
                          ? 'bg-gray-100 text-gray-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {detalhe.status === 'importado' ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : detalhe.status === 'ja_existente' ? (
                        <Clock className="h-4 w-4" />
                      ) : (
                        <AlertTriangle className="h-4 w-4" />
                      )}
                      <span className="font-medium">{detalhe.numero_contrato}:</span>
                      <span>{detalhe.mensagem}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Logs de Execução
          </CardTitle>
          <CardDescription>
            Últimas ações do agente autônomo
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bot className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>Nenhum log encontrado</p>
              <p className="text-sm">Execute o agente para ver os primeiros logs</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div 
                  key={log.id} 
                  className="border rounded-lg overflow-hidden"
                >
                  <div 
                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleLog(log.id)}
                  >
                    {getStatusIcon(log.status)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{getTipoAcaoLabel(log.tipo_acao)}</span>
                        {getStatusBadge(log.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {log.contrato_numero && `Contrato: ${log.contrato_numero} • `}
                        {formatarData(log.created_at)}
                      </p>
                    </div>
                    {logsExpandidos.has(log.id) ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                  
                  {logsExpandidos.has(log.id) && (
                    <div className="px-3 pb-3 bg-gray-50">
                      {log.mensagem && (
                        <p className="text-sm mb-2">{log.mensagem}</p>
                      )}
                      {log.detalhes && Object.keys(log.detalhes).length > 0 && (
                        <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                          {JSON.stringify(log.detalhes, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
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

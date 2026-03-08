'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { 
  ArrowLeft,
  Search,
  Download,
  Loader2,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  Building2,
  Check,
  X,
  AlertCircle,
  RotateCcw
} from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'

interface ContratoAPI {
  id?: string
  contratoNumero: string
  documento: string
  favorecido: string
  contratoObjeto: string
  vigencia: string
  vigencia_inicio?: string
  aditivos_valor_total?: string | null
  valor_contrato?: string
  ja_cadastrado?: boolean
  contrato_id_existente?: string
  importStatus?: 'idle' | 'loading' | 'success' | 'already_exists' | 'error'
  importMessage?: string
  importProgress?: number
  importStep?: string
  importJobId?: string
  contratoId?: string
  valorContratoReferencia?: number
  valorItensImportados?: number
  divergenciaValor?: number
  percentualDivergencia?: number
  avisoConferencia?: string
}

interface AditivoPortal {
  nome: string
  tipo: string
  valor: string
  vigencia: string
  fiscal: string
  pdf_url: string
}

interface ImportacaoIndividualStatus {
  job_id: string
  status: 'pendente' | 'processando' | 'concluido' | 'erro'
  progresso: number
  etapa: string
  mensagem: string
  contrato_id?: string
  itens_criados?: number
  itens_total_pdf?: number
  itens_faltantes?: number[]
  valor_contrato_referencia?: number
  valor_itens_importados?: number
  divergencia_valor?: number
  percentual_divergencia?: number
  aviso_conferencia?: string
  concluido: boolean
  erro?: string
  atualizado_em: string
}

interface AvisoImportacao {
  open: boolean
  contratoNumero: string
  contratoId?: string
  avisoConferencia: string
  valorContratoReferencia?: number
  valorItensImportados?: number
  divergenciaValor?: number
  percentualDivergencia?: number
  itensTotalPdf?: number
  itensFaltantes?: number[]
}

interface ResultadoImportacao {
  importados: number
  erros: number
  detalhes: Array<{ numero: string; status: 'sucesso' | 'erro'; mensagem?: string }>
}

export default function ImportarPortalTransparenciaPage() {
  const router = useRouter()
  const [buscando, setBuscando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [contratos, setContratos] = useState<ContratoAPI[]>([])
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [numeroBusca, setNumeroBusca] = useState('')
  const [limite, setLimite] = useState(50)
  const [apenasVigentes, setApenasVigentes] = useState(true)
  const [avisoImportacao, setAvisoImportacao] = useState<AvisoImportacao | null>(null)
  const [aditivosModal, setAditivosModal] = useState<{
    open: boolean
    portalId: string
    contratoNumero: string
    contratoIdSistema?: string
    aditivos: AditivoPortal[]
    loading: boolean
    importando: boolean
    resultado?: { importados: number; ja_existentes: number; erros: number }
  } | null>(null)
  const pollersRef = useRef<Record<string, number>>({})

  useEffect(() => {
    return () => {
      Object.values(pollersRef.current).forEach((poller) => window.clearInterval(poller))
      pollersRef.current = {}
    }
  }, [])

  const formatCurrency = (value?: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))
  }

  const buscarContratos = async () => {
    setBuscando(true)
    setErro(null)
    setResultado(null)
    
    try {
      const params = new URLSearchParams()
      if (numeroBusca) params.append('numero', numeroBusca)
      params.append('limit', limite.toString())
      params.append('apenas_vigentes', apenasVigentes.toString())
      
      const res = await authFetch(`${API_URL}/api/contratos/portal-transparencia/buscar?${params}`)
      
      if (res.ok) {
        const data = await res.json()
        setContratos(data.data || [])
      } else {
        const errorData = await res.json().catch(() => ({}))
        setErro(errorData.message || 'Erro ao buscar contratos')
      }
    } catch (error) {
      setErro('Erro ao conectar com a API do Portal de Transparência')
    } finally {
      setBuscando(false)
    }
  }

  const importarContratos = async () => {
    if (contratos.length === 0) return
    
    setImportando(true)
    setErro(null)
    setResultado(null)
    
    try {
      const params = new URLSearchParams()
      if (numeroBusca) params.append('numero', numeroBusca)
      params.append('limit', limite.toString())
      params.append('apenas_vigentes', apenasVigentes.toString())
      
      const res = await authFetch(`${API_URL}/api/contratos/portal-transparencia/importar?${params}`, {
        method: 'POST'
      })
      
      if (res.ok) {
        const data = await res.json()
        setResultado(data)
      } else {
        const errorData = await res.json().catch(() => ({}))
        setErro(errorData.message || 'Erro ao importar contratos')
      }
    } catch (error) {
      setErro('Erro ao importar contratos')
    } finally {
      setImportando(false)
    }
  }

  const importarContratoIndividual = async (contrato: ContratoAPI, index: number) => {
    const contratoNumero = contrato.contratoNumero

    setContratos((atuais) => {
      const novos = [...atuais]
      novos[index] = {
        ...novos[index],
        importStatus: 'loading',
        importMessage: 'Preparando importação completa com IA...',
        importProgress: 0,
        importStep: 'Fila',
      }
      return novos
    })
    
    try {
      const res = await authFetch(`${API_URL}/api/contratos/portal-transparencia/importar-individual-completo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contrato)
      })

      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`Erro ${res.status}: ${errorText}`)
      }

      const data = await res.json() as { job_id: string }

      setContratos((atuais) => {
        const novos = [...atuais]
        novos[index] = {
          ...novos[index],
          importJobId: data.job_id,
          importMessage: 'Importação iniciada. Acompanhando progresso...',
        }
        return novos
      })

      const pollStatus = async () => {
        try {
          const statusRes = await authFetch(`${API_URL}/api/contratos/portal-transparencia/importar-individual-status/${data.job_id}`)
          if (!statusRes.ok) {
            throw new Error('Não foi possível consultar o status da importação')
          }

          const status = await statusRes.json() as ImportacaoIndividualStatus

          setContratos((atuais) => {
            const posicao = atuais.findIndex((item) => item.contratoNumero === contratoNumero)
            if (posicao === -1) return atuais

            const novos = [...atuais]
            novos[posicao] = {
              ...novos[posicao],
              importProgress: status.progresso,
              importStep: status.etapa,
              importMessage: status.mensagem,
              importJobId: data.job_id,
              contratoId: status.contrato_id,
              valorContratoReferencia: status.valor_contrato_referencia,
              valorItensImportados: status.valor_itens_importados,
              divergenciaValor: status.divergencia_valor,
              percentualDivergencia: status.percentual_divergencia,
              avisoConferencia: status.aviso_conferencia,
            }

            if (status.status === 'concluido') {
              novos[posicao].importStatus = 'success'
            } else if (status.status === 'erro') {
              novos[posicao].importStatus = 'error'
              novos[posicao].importMessage = status.erro || status.mensagem || 'Erro ao importar'
            }

            return novos
          })

          if (status.concluido) {
            const intervalId = pollersRef.current[data.job_id]
            if (intervalId) {
              window.clearInterval(intervalId)
              delete pollersRef.current[data.job_id]
            }

            if (status.status === 'concluido' && status.contrato_id) {
              if (status.aviso_conferencia || (status.itens_faltantes && status.itens_faltantes.length > 0)) {
                setAvisoImportacao({
                  open: true,
                  contratoNumero: contratoNumero,
                  contratoId: status.contrato_id,
                  avisoConferencia: status.aviso_conferencia || '',
                  valorContratoReferencia: status.valor_contrato_referencia,
                  valorItensImportados: status.valor_itens_importados,
                  divergenciaValor: status.divergencia_valor,
                  percentualDivergencia: status.percentual_divergencia,
                  itensTotalPdf: status.itens_total_pdf,
                  itensFaltantes: status.itens_faltantes,
                })
              } else {
                window.setTimeout(() => {
                  router.push(`/orgao/contratos/${status.contrato_id}`)
                }, 1200)
              }
            }
          }
        } catch (pollError) {
          const intervalId = pollersRef.current[data.job_id]
          if (intervalId) {
            window.clearInterval(intervalId)
            delete pollersRef.current[data.job_id]
          }

          setContratos((atuais) => {
            const posicao = atuais.findIndex((item) => item.contratoNumero === contratoNumero)
            if (posicao === -1) return atuais

            const novos = [...atuais]
            novos[posicao] = {
              ...novos[posicao],
              importStatus: 'error',
              importMessage: pollError instanceof Error ? pollError.message : 'Erro ao acompanhar importação',
            }
            return novos
          })
        }
      }

      await pollStatus()
      if (!pollersRef.current[data.job_id]) {
        pollersRef.current[data.job_id] = window.setInterval(pollStatus, 1500)
      }
    } catch (error) {
      setContratos((atuais) => {
        const novos = [...atuais]
        novos[index] = {
          ...novos[index],
          importStatus: 'error',
          importMessage: error instanceof Error ? error.message : 'Erro de conexão',
        }
        return novos
      })
    }
  }

  const renderBotaoImportar = (contrato: ContratoAPI, index: number) => {
    if (contrato.ja_cadastrado && !contrato.importStatus) {
      return (
        <Button
          size="sm"
          variant="outline"
          className="bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
          onClick={() => router.push(`/orgao/contratos/${contrato.contrato_id_existente}`)}
        >
          <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
          Ver contrato
        </Button>
      )
    }

    switch (contrato.importStatus) {
      case 'loading':
        return (
          <div className="min-w-[280px] space-y-2 text-left">
            <div className="flex items-center gap-2 text-blue-700 text-sm font-medium">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{contrato.importStep || 'Importando...'}</span>
            </div>
            <Progress value={contrato.importProgress || 0} className="h-2" />
            <p className="text-xs text-gray-500">
              {contrato.importMessage || 'Executando importação completa com IA'}
            </p>
          </div>
        )
      case 'success':
        return (
          <div className="min-w-[280px] space-y-2 text-left">
            <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
              <Check className="w-4 h-4" />
              <span>Importação concluída</span>
            </div>
            <Progress value={100} className="h-2" />
            <p className="text-xs text-gray-500">
              {contrato.importMessage || 'Contrato importado com sucesso. Redirecionando...'}
            </p>
          </div>
        )
      case 'already_exists':
        return (
          <div className="min-w-[280px] space-y-2 text-left">
            <div className="flex items-center gap-2 text-gray-700 text-sm font-medium">
              <X className="w-4 h-4" />
              <span>Contrato já existe</span>
            </div>
            <p className="text-xs text-gray-500">
              {contrato.importMessage || 'O contrato já existe no sistema.'}
            </p>
          </div>
        )
      case 'error':
        return (
          <Button 
            size="sm" 
            variant="outline" 
            className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
            onClick={() => importarContratoIndividual(contrato, index)}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Erro — Tentar
          </Button>
        )
      default:
        return (
          <Button 
            size="sm" 
            variant="outline" 
            className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
            onClick={() => importarContratoIndividual(contrato, index)}
          >
            <Download className="w-4 h-4 mr-2" />
            Importar com IA
          </Button>
        )
    }
  }

  const abrirAditivos = async (contrato: ContratoAPI) => {
    if (!contrato.id) return
    setAditivosModal({
      open: true,
      portalId: contrato.id,
      contratoNumero: contrato.contratoNumero,
      contratoIdSistema: contrato.contrato_id_existente,
      aditivos: [],
      loading: true,
      importando: false,
    })

    try {
      const res = await authFetch(`${API_URL}/api/contratos/portal-transparencia/aditivos/${contrato.id}`)
      if (res.ok) {
        const data = await res.json()
        setAditivosModal((prev) => prev ? { ...prev, aditivos: data.aditivos || [], loading: false } : null)
      } else {
        setAditivosModal((prev) => prev ? { ...prev, loading: false } : null)
      }
    } catch {
      setAditivosModal((prev) => prev ? { ...prev, loading: false } : null)
    }
  }

  const importarAditivos = async () => {
    if (!aditivosModal?.contratoIdSistema || !aditivosModal.aditivos.length) return
    setAditivosModal((prev) => prev ? { ...prev, importando: true } : null)

    try {
      const res = await authFetch(`${API_URL}/api/contratos/portal-transparencia/importar-aditivos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contrato_id: aditivosModal.contratoIdSistema,
          aditivos: aditivosModal.aditivos,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setAditivosModal((prev) => prev ? { ...prev, importando: false, resultado: data } : null)
      } else {
        setAditivosModal((prev) => prev ? { ...prev, importando: false } : null)
      }
    } catch {
      setAditivosModal((prev) => prev ? { ...prev, importando: false } : null)
    }
  }

  const formatarValor = (contrato: ContratoAPI) => {
    // Tentar usar aditivos_valor_total primeiro, senão valor_contrato
    if (contrato.aditivos_valor_total) {
      const num = parseFloat(contrato.aditivos_valor_total)
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num)
    } else if (contrato.valor_contrato) {
      return contrato.valor_contrato
    }
    return 'R$ 0,00'
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <AlertDialog
        open={Boolean(avisoImportacao?.open)}
        onOpenChange={(open) => {
          if (!open) {
            setAvisoImportacao(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferir itens importados</AlertDialogTitle>
            <AlertDialogDescription>
              {avisoImportacao?.avisoConferencia}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 text-sm text-gray-700">
            <div className="flex items-center justify-between gap-4">
              <span>Contrato</span>
              <span className="font-medium">{avisoImportacao?.contratoNumero}</span>
            </div>
            {avisoImportacao?.itensTotalPdf && (
              <div className="flex items-center justify-between gap-4">
                <span>Itens no PDF</span>
                <span className="font-medium">{avisoImportacao.itensTotalPdf}</span>
              </div>
            )}
            {(avisoImportacao?.valorContratoReferencia ?? 0) > 0 && (
              <>
                <div className="flex items-center justify-between gap-4">
                  <span>Valor de referência</span>
                  <span className="font-medium">{formatCurrency(avisoImportacao?.valorContratoReferencia)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Soma dos itens importados</span>
                  <span className="font-medium">{formatCurrency(avisoImportacao?.valorItensImportados)}</span>
                </div>
              </>
            )}
            {(avisoImportacao?.divergenciaValor ?? 0) !== 0 && (
              <>
                <div className="flex items-center justify-between gap-4">
                  <span>Diferença</span>
                  <span className="font-medium text-amber-700">{formatCurrency(Math.abs(Number(avisoImportacao?.divergenciaValor || 0)))}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Divergência percentual</span>
                  <span className="font-medium text-amber-700">{Number(avisoImportacao?.percentualDivergencia || 0).toFixed(2)}%</span>
                </div>
              </>
            )}
            {avisoImportacao?.itensFaltantes && avisoImportacao.itensFaltantes.length > 0 && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="font-medium text-amber-800 mb-1">
                  <AlertCircle className="w-4 h-4 inline mr-1" />
                  {avisoImportacao.itensFaltantes.length} item(ns) n{'\u00E3'}o extra{'\u00ED'}do(s):
                </p>
                <p className="text-amber-700">
                  Itens n{'\u00BA'} {avisoImportacao.itensFaltantes.join(', ')}
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  Adicione-os manualmente na aba Itens do contrato.
                </p>
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                const contratoId = avisoImportacao?.contratoId
                setAvisoImportacao(null)
                if (contratoId) {
                  router.push(`/orgao/contratos/${contratoId}`)
                }
              }}
            >
              Conferir contrato importado
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal Aditivos */}
      <AlertDialog
        open={Boolean(aditivosModal?.open)}
        onOpenChange={(open) => { if (!open) setAditivosModal(null) }}
      >
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Aditivos — {aditivosModal?.contratoNumero}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {aditivosModal?.loading
                ? 'Buscando aditivos no Portal de Transparência...'
                : `${aditivosModal?.aditivos.length || 0} aditivo(s) encontrado(s)`}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {aditivosModal?.loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : (
            <div className="space-y-3">
              {aditivosModal?.aditivos.map((aditivo, i) => (
                <div key={i} className="border rounded-lg p-3 text-sm space-y-1">
                  <div className="font-medium">{aditivo.nome}</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-600">
                    <span>Tipo: <strong>{aditivo.tipo || '—'}</strong></span>
                    <span>Valor: <strong>{aditivo.valor || '—'}</strong></span>
                    <span>Vigência: <strong>{aditivo.vigencia}</strong></span>
                    <span>Fiscal: {aditivo.fiscal}</span>
                  </div>
                  {aditivo.pdf_url && (
                    <a href={aditivo.pdf_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs inline-flex items-center gap-1">
                      <Download className="w-3 h-3" /> Baixar PDF
                    </a>
                  )}
                </div>
              ))}

              {aditivosModal?.resultado && (
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <AlertDescription>
                    <strong>{aditivosModal.resultado.importados}</strong> importado(s)
                    {aditivosModal.resultado.ja_existentes > 0 && (
                      <>, <strong>{aditivosModal.resultado.ja_existentes}</strong> já existente(s)</>
                    )}
                    {aditivosModal.resultado.erros > 0 && (
                      <>, <strong className="text-red-600">{aditivosModal.resultado.erros}</strong> erro(s)</>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <AlertDialogFooter>
            {aditivosModal?.contratoIdSistema && (aditivosModal?.aditivos.length ?? 0) > 0 && !aditivosModal?.resultado && (
              <Button
                onClick={importarAditivos}
                disabled={aditivosModal?.importando}
                className="bg-green-600 hover:bg-green-700"
              >
                {aditivosModal?.importando ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importando...</>
                ) : (
                  <><Download className="w-4 h-4 mr-2" /> Importar {aditivosModal?.aditivos.length} aditivo(s)</>
                )}
              </Button>
            )}
            {!aditivosModal?.contratoIdSistema && (aditivosModal?.aditivos.length ?? 0) > 0 && (
              <p className="text-sm text-amber-600 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Importe o contrato primeiro para poder importar os aditivos.
              </p>
            )}
            <AlertDialogAction>Fechar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/orgao/contratos">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="w-6 h-6 text-blue-600" />
              Importar do Portal de Transparência
            </h1>
            <p className="text-gray-600">
              Importe contratos diretamente da API do Portal da Transparência da CMLem
            </p>
          </div>
        </div>
        <Button variant="outline" asChild>
          <a href="https://portaldatransparencia.cmlem.ba.gov.br" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="w-4 h-4 mr-2" />
            Ver Portal
          </a>
        </Button>
      </div>

      {/* Busca */}
      <Card>
        <CardHeader>
          <CardTitle>Buscar Contratos</CardTitle>
          <CardDescription>
            Busque contratos na API do Portal de Transparência. Deixe em branco para buscar todos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex gap-4">
              <div className="flex-[2]">
                <Input
                  placeholder="Número do contrato (ex: 001/2024) - opcional"
                  value={numeroBusca}
                  onChange={(e) => setNumeroBusca(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <Input
                  type="number"
                  min={1}
                  max={200}
                  placeholder="Limite"
                  value={limite}
                  onChange={(e) => setLimite(parseInt(e.target.value) || 50)}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="vigentes" 
                  checked={apenasVigentes}
                  onCheckedChange={(checked) => setApenasVigentes(checked as boolean)}
                />
                <Label htmlFor="vigentes" className="cursor-pointer">
                  Apenas contratos vigentes (vigência {'>='} hoje)
                </Label>
              </div>
              <Button onClick={buscarContratos} disabled={buscando}>
                {buscando ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Buscando...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Buscar
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Erro */}
      {erro && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {/* Resultado da Importação */}
      {resultado && (
        <Alert className={resultado.erros === 0 ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}>
          <CheckCircle className={`w-4 h-4 ${resultado.erros === 0 ? 'text-green-600' : 'text-yellow-600'}`} />
          <AlertDescription className="space-y-2">
            <p className="font-medium">
              Importação concluída: {resultado.importados} contratos importados com sucesso
              {resultado.erros > 0 && `, ${resultado.erros} erros`}
            </p>
            {resultado.detalhes.filter(d => d.status === 'erro').length > 0 && (
              <div className="text-sm">
                <p className="font-medium mt-2">Erros:</p>
                <ul className="list-disc list-inside mt-1">
                  {resultado.detalhes
                    .filter(d => d.status === 'erro')
                    .map((d, i) => (
                      <li key={i} className="text-red-600">{d.numero}: {d.mensagem}</li>
                    ))}
                </ul>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Lista de Contratos */}
      {contratos.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Contratos Encontrados</CardTitle>
                <CardDescription>
                  {contratos.length} contratos encontrados no Portal de Transparência
                  {contratos.some(c => c.ja_cadastrado) && (
                    <>
                      {' — '}
                      <span className="text-green-600 font-medium">
                        {contratos.filter(c => c.ja_cadastrado).length} já cadastrado(s)
                      </span>
                      {contratos.filter(c => !c.ja_cadastrado).length > 0 && (
                        <>
                          {', '}
                          <span className="text-blue-600 font-medium">
                            {contratos.filter(c => !c.ja_cadastrado).length} novo(s)
                          </span>
                        </>
                      )}
                    </>
                  )}
                </CardDescription>
              </div>
              {contratos.filter(c => !c.ja_cadastrado).length > 0 ? (
                <Button 
                  onClick={importarContratos} 
                  disabled={importando}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {importando ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Importar Todos ({contratos.filter(c => !c.ja_cadastrado).length} novos)
                    </>
                  )}
                </Button>
              ) : (
                <Badge className="bg-green-100 text-green-700 border-green-200 px-4 py-2">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Todos já cadastrados
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-3 px-2">Número</th>
                    <th className="text-left py-3 px-2">Fornecedor</th>
                    <th className="text-left py-3 px-2">Objeto</th>
                    <th className="text-right py-3 px-2">Valor</th>
                    <th className="text-center py-3 px-2">Vigência</th>
                    <th className="text-center py-3 px-2">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {contratos.map((contrato, index) => (
                    <tr key={index} className={`border-b hover:bg-gray-50 ${contrato.ja_cadastrado ? 'bg-green-50/50' : ''}`}>
                      <td className="py-3 px-2 font-medium">
                        <div className="flex flex-col gap-1">
                          {contrato.contratoNumero}
                          {contrato.ja_cadastrado && (
                            <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] w-fit">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Já cadastrado
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <p className="font-medium">{contrato.favorecido}</p>
                        <p className="text-sm text-gray-500">{contrato.documento}</p>
                      </td>
                      <td className="py-3 px-2 max-w-md">
                        <p className="text-sm text-gray-700 line-clamp-2">
                          {contrato.contratoObjeto}
                        </p>
                      </td>
                      <td className="py-3 px-2 text-right font-medium">
                        <div>{formatarValor(contrato)}</div>
                        {contrato.aditivos_valor_total && parseFloat(contrato.aditivos_valor_total) > 0 && (
                          <button
                            onClick={() => abrirAditivos(contrato)}
                            className="text-xs text-blue-600 hover:text-blue-800 hover:underline mt-1 inline-flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Aditivos: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(contrato.aditivos_valor_total))}
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <Badge variant="outline">
                          {contrato.vigencia}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-center align-top">
                        {renderBotaoImportar(contrato, index)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Estado vazio */}
      {contratos.length === 0 && !buscando && !erro && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Search className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500">
              Clique em "Buscar" para carregar os contratos do Portal de Transparência
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

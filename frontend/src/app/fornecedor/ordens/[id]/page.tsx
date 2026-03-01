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
  Building2,
  Calendar,
  Loader2,
  FileText,
  Upload,
  FileCode,
  AlertTriangle,
  History,
  Download,
} from 'lucide-react'
import { API_URL, authFetch, formatarDataBR } from '@/lib/api'

const getFileUrl = (caminho: string | null) => {
  if (!caminho) return null
  const filename = caminho.split(/[/\\]/).pop()
  return `${API_URL}/api/uploads/notas-fiscais/${filename}`
}

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
    tipo_item?: string
    quantidade: number
    quantidade_entregue: number
    valor_unitario: number
    valor_total: number
  }>
  modo_envio_nf?: 'CONJUNTA' | 'SEPARADA' | null
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
  const [nfEnviada, setNfEnviada] = useState<any>(null)
  const [nfsEnviadas, setNfsEnviadas] = useState<any[]>([])
  const [uploadingNf, setUploadingNf] = useState(false)
  const [erroNf, setErroNf] = useState<string | null>(null)
  const [showModoEnvioModal, setShowModoEnvioModal] = useState(false)
  const [definindoModo, setDefinindoModo] = useState(false)

  useEffect(() => {
    carregarOrdem()
    carregarNf()
  }, [id])

  useEffect(() => {
    if (ordem?.modo_envio_nf === 'SEPARADA') {
      carregarNfs()
    }
  }, [ordem?.modo_envio_nf, id])

  const temConsumoEPermanente = ordem?.itens?.some((i: any) => (i.tipo_item || 'CONSUMO') === 'CONSUMO') &&
    ordem?.itens?.some((i: any) => (i as any).tipo_item === 'PERMANENTE')
  const precisaDefinirModo = temConsumoEPermanente && !ordem?.modo_envio_nf
  const modoSeparada = ordem?.modo_envio_nf === 'SEPARADA'

  useEffect(() => {
    if (temConsumoEPermanente && !ordem?.modo_envio_nf && ['ENVIADA', 'EM_ATENDIMENTO'].includes(ordem?.status || '')) {
      setShowModoEnvioModal(true)
    }
  }, [temConsumoEPermanente, ordem?.modo_envio_nf, ordem?.status])

  const carregarNf = async () => {
    try {
      const res = await authFetch(`${API_URL}/api/fornecedor/ordens/${id}/nota-fiscal`)
      if (res.ok) {
        const data = await res.json()
        setNfEnviada(data || null)
      }
    } catch {}
  }

  const carregarNfs = async () => {
    try {
      const res = await authFetch(`${API_URL}/api/fornecedor/ordens/${id}/notas-fiscais`)
      if (res.ok) {
        const data = await res.json()
        setNfsEnviadas(Array.isArray(data) ? data : [])
      }
    } catch {
      setNfsEnviadas([])
    }
  }

  const handleDefinirModo = async (modo: 'CONJUNTA' | 'SEPARADA') => {
    setDefinindoModo(true)
    setErroNf(null)
    try {
      const res = await authFetch(`${API_URL}/api/fornecedor/ordens/${id}/modo-envio-nf`, {
        method: 'POST',
        body: JSON.stringify({ modo }),
      })
      if (res.ok) {
        setShowModoEnvioModal(false)
        await carregarOrdem()
        if (modo === 'SEPARADA') await carregarNfs()
      } else {
        const data = await res.json().catch(() => ({}))
        setErroNf(data.message || 'Erro ao definir modo')
      }
    } catch {
      setErroNf('Erro ao definir modo de envio')
    } finally {
      setDefinindoModo(false)
    }
  }

  const [xmlFile, setXmlFile] = useState<File | null>(null)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [outrosFiles, setOutrosFiles] = useState<File[]>([])
  const [xmlFileConsumo, setXmlFileConsumo] = useState<File | null>(null)
  const [pdfFileConsumo, setPdfFileConsumo] = useState<File | null>(null)
  const [xmlFilePermanente, setXmlFilePermanente] = useState<File | null>(null)
  const [pdfFilePermanente, setPdfFilePermanente] = useState<File | null>(null)

  const handleEnviarNf = async (tipoItens?: 'CONSUMO' | 'PERMANENTE') => {
    const xml = tipoItens === 'CONSUMO' ? xmlFileConsumo : tipoItens === 'PERMANENTE' ? xmlFilePermanente : xmlFile
    const pdf = tipoItens === 'CONSUMO' ? pdfFileConsumo : tipoItens === 'PERMANENTE' ? pdfFilePermanente : pdfFile
    if (!xml) { setErroNf('Arquivo XML é obrigatório'); return }
    if (!pdf) { setErroNf('Arquivo PDF da nota fiscal é obrigatório'); return }

    setUploadingNf(true)
    setErroNf(null)
    try {
      const formData = new FormData()
      formData.append('arquivos', xml)
      formData.append('arquivos', pdf)
      if (!tipoItens) outrosFiles.forEach(f => formData.append('arquivos', f))

      const url = tipoItens
        ? `${API_URL}/api/fornecedor/ordens/${id}/nota-fiscal?tipo_itens=${tipoItens}`
        : `${API_URL}/api/fornecedor/ordens/${id}/nota-fiscal`
      const res = await authFetch(url, {
        method: 'POST',
        body: formData,
        headers: {},
      })

      if (res.ok) {
        const data = await res.json()
        if (tipoItens) {
          setNfsEnviadas(prev => {
            const rest = prev.filter((n: any) => n.tipo_itens !== tipoItens)
            return [...rest, data]
          })
        } else {
          setNfEnviada(data)
        }
        if (tipoItens === 'CONSUMO') {
          setXmlFileConsumo(null)
          setPdfFileConsumo(null)
        } else if (tipoItens === 'PERMANENTE') {
          setXmlFilePermanente(null)
          setPdfFilePermanente(null)
        } else {
          setXmlFile(null)
          setPdfFile(null)
          setOutrosFiles([])
        }
      } else {
        const data = await res.json().catch(() => ({}))
        setErroNf(data.message || 'Erro ao enviar nota fiscal')
      }
    } catch {
      setErroNf('Erro ao enviar nota fiscal')
    } finally {
      setUploadingNf(false)
    }
  }

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

      {/* Modal: definir modo envio NF (quando OF tem consumo + permanente) */}
      {showModoEnvioModal && precisaDefinirModo && (
        <Dialog open onOpenChange={(o) => !definindoModo && setShowModoEnvioModal(o)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Como será enviada a Nota Fiscal?</DialogTitle>
              <DialogDescription>
                Esta ordem contém itens de consumo e itens permanentes. Defina como você enviará a(s) nota(s) fiscal(is):
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <Button
                className="w-full justify-start h-auto py-4"
                variant="outline"
                onClick={() => handleDefinirModo('CONJUNTA')}
                disabled={definindoModo}
              >
                <div className="text-left">
                  <p className="font-semibold">Conjunta (1 NF)</p>
                  <p className="text-sm text-gray-500">Uma única nota fiscal para todos os itens</p>
                </div>
              </Button>
              <Button
                className="w-full justify-start h-auto py-4"
                variant="outline"
                onClick={() => handleDefinirModo('SEPARADA')}
                disabled={definindoModo}
              >
                <div className="text-left">
                  <p className="font-semibold">Separada (2 NFs)</p>
                  <p className="text-sm text-gray-500">Uma NF para itens de consumo e outra para permanentes</p>
                </div>
              </Button>
            </div>
            {erroNf && <p className="text-sm text-red-600">{erroNf}</p>}
          </DialogContent>
        </Dialog>
      )}

      {/* Upload Nota Fiscal - incluir ATENDIDA_PARCIAL quando modo separada (1 NF aceita, falta a outra) */}
      {(['ENVIADA', 'EM_ATENDIMENTO'].includes(ordem.status) ||
        (modoSeparada && ordem.status === 'ATENDIDA_PARCIAL') ||
        nfEnviada?.status === 'RECUSADA' ||
        (modoSeparada && nfsEnviadas.some((n: any) => n.status === 'RECUSADA'))) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCode className="h-5 w-5 text-green-600" />
              Nota Fiscal
            </CardTitle>
            <CardDescription>
              {modoSeparada
                ? 'Envie 2 notas fiscais: uma para itens de consumo e outra para permanentes'
                : 'Envie o XML da nota fiscal e opcionalmente o PDF e outros documentos'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {precisaDefinirModo ? (
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="font-medium text-amber-800">Defina como enviará a nota fiscal</p>
                  <p className="text-sm text-amber-700 mt-1">
                    Esta ordem tem itens de consumo e permanentes. Escolha se enviará 1 NF conjunta ou 2 NFs separadas.
                  </p>
                  <Button className="mt-3" onClick={() => setShowModoEnvioModal(true)}>
                    Definir modo de envio
                  </Button>
                </div>
              </div>
            ) : nfEnviada?.status === 'RECUSADA' || (modoSeparada && nfsEnviadas.some((n: any) => n.status === 'RECUSADA')) ? (
              <div className="space-y-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <h4 className="font-bold text-red-800">Nota Fiscal Recusada</h4>
                      <p className="text-sm text-red-700 mt-1">
                        NF nº <strong>{nfEnviada.numero || 'S/N'}</strong> (Série {nfEnviada.serie || '-'}) foi recusada pelo órgão.
                      </p>
                      {nfEnviada.motivo_recusa && (
                        <div className="bg-white border border-red-200 rounded-lg p-3 mt-2">
                          <p className="text-xs text-gray-500">Motivo:</p>
                          <p className="text-sm font-medium text-red-800">{nfEnviada.motivo_recusa}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {nfEnviada.historico?.length > 0 && (
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium text-sm flex items-center gap-2 mb-3">
                      <History className="h-4 w-4 text-gray-500" />
                      Histórico
                    </h4>
                    <div className="space-y-2">
                      {nfEnviada.historico.map((h: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-sm border-b border-gray-100 pb-2 last:border-0">
                          <Badge variant="destructive" className="text-[10px] flex-shrink-0">{h.tipo}</Badge>
                          <div>
                            <p className="text-gray-700">{h.descricao}</p>
                            <p className="text-xs text-gray-400">{new Date(h.data).toLocaleString('pt-BR')}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-sm text-blue-800 font-medium mb-3">Envie uma nova Nota Fiscal corrigida</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={`border-2 border-dashed rounded-lg p-4 text-center ${xmlFile ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-white'}`}>
                    <FileCode className={`h-6 w-6 mx-auto mb-1 ${xmlFile ? 'text-green-600' : 'text-gray-400'}`} />
                    <p className="text-xs font-medium mb-2">{xmlFile ? xmlFile.name : 'XML da NF-e *'}</p>
                    <label className="cursor-pointer">
                      <input type="file" accept=".xml" onChange={(e) => { setXmlFile(e.target.files?.[0] || null); e.target.value = '' }} className="hidden" />
                      <Button variant={xmlFile ? 'outline' : 'default'} size="sm" asChild><span><Upload className="h-3 w-3 mr-1" />{xmlFile ? 'Trocar' : 'Selecionar XML'}</span></Button>
                    </label>
                  </div>
                  <div className={`border-2 border-dashed rounded-lg p-4 text-center ${pdfFile ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-white'}`}>
                    <FileText className={`h-6 w-6 mx-auto mb-1 ${pdfFile ? 'text-green-600' : 'text-gray-400'}`} />
                    <p className="text-xs font-medium mb-2">{pdfFile ? pdfFile.name : 'PDF da Nota Fiscal *'}</p>
                    <label className="cursor-pointer">
                      <input type="file" accept=".pdf" onChange={(e) => { setPdfFile(e.target.files?.[0] || null); e.target.value = '' }} className="hidden" />
                      <Button variant={pdfFile ? 'outline' : 'default'} size="sm" asChild><span><Upload className="h-3 w-3 mr-1" />{pdfFile ? 'Trocar' : 'Selecionar PDF'}</span></Button>
                    </label>
                  </div>
                </div>
                <div className={`border-2 border-dashed rounded-lg p-4 text-center ${outrosFiles.length > 0 ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                  <p className="text-xs text-gray-500 mb-2">Outros documentos (opcional)</p>
                  {outrosFiles.length > 0 && (
                    <div className="flex flex-wrap gap-1 justify-center mb-2">
                      {outrosFiles.map((f, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {f.name}
                          <button className="ml-1 text-red-500" onClick={() => setOutrosFiles(prev => prev.filter((_, idx) => idx !== i))}>×</button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  <label className="cursor-pointer">
                    <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { if (e.target.files) setOutrosFiles(prev => [...prev, ...Array.from(e.target.files!)]); e.target.value = '' }} className="hidden" />
                    <Button variant="outline" size="sm" asChild><span><Upload className="h-3 w-3 mr-1" />Anexar Documento</span></Button>
                  </label>
                </div>
                <Button onClick={() => handleEnviarNf()} disabled={uploadingNf || !xmlFile || !pdfFile} className="w-full" size="lg">
                  {uploadingNf ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  {uploadingNf ? 'Enviando...' : 'Enviar Nova Nota Fiscal'}
                </Button>
                {erroNf && <p className="text-sm text-red-600">{erroNf}</p>}
              </div>
            ) : modoSeparada ? (
              <div className="space-y-6">
                {(['CONSUMO', 'PERMANENTE'] as const).map((tipo) => {
                  const nf = nfsEnviadas.find((n: any) => n.tipo_itens === tipo)
                  const xml = tipo === 'CONSUMO' ? xmlFileConsumo : xmlFilePermanente
                  const pdf = tipo === 'CONSUMO' ? pdfFileConsumo : pdfFilePermanente
                  const temNf = nf && nf.status !== 'RECUSADA'
                  return (
                    <div key={tipo} className="border rounded-lg p-4 bg-gray-50/50">
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        {tipo === 'CONSUMO' ? <Package className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                        NF {tipo === 'CONSUMO' ? 'Consumo' : 'Permanente'}
                      </h4>
                      {temNf ? (
                        <div className="flex items-center gap-2 text-green-600 text-sm">
                          <CheckCircle className="h-4 w-4" />
                          NF {nf.numero}/{nf.serie} enviada
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className={`border-2 border-dashed rounded p-3 text-center ${xml ? 'border-green-400 bg-green-50' : 'border-gray-300'}`}>
                            <p className="text-xs mb-1">{xml ? xml.name : 'XML *'}</p>
                            <label className="cursor-pointer">
                              <input type="file" accept=".xml" onChange={(e) => { tipo === 'CONSUMO' ? setXmlFileConsumo(e.target.files?.[0] || null) : setXmlFilePermanente(e.target.files?.[0] || null); e.target.value = '' }} className="hidden" />
                              <Button variant={xml ? 'outline' : 'default'} size="sm" asChild><span><Upload className="h-3 w-3 mr-1" />Selecionar</span></Button>
                            </label>
                          </div>
                          <div className={`border-2 border-dashed rounded p-3 text-center ${pdf ? 'border-green-400 bg-green-50' : 'border-gray-300'}`}>
                            <p className="text-xs mb-1">{pdf ? pdf.name : 'PDF *'}</p>
                            <label className="cursor-pointer">
                              <input type="file" accept=".pdf" onChange={(e) => { tipo === 'CONSUMO' ? setPdfFileConsumo(e.target.files?.[0] || null) : setPdfFilePermanente(e.target.files?.[0] || null); e.target.value = '' }} className="hidden" />
                              <Button variant={pdf ? 'outline' : 'default'} size="sm" asChild><span><Upload className="h-3 w-3 mr-1" />Selecionar</span></Button>
                            </label>
                          </div>
                          <div className="md:col-span-2">
                            <Button onClick={() => handleEnviarNf(tipo)} disabled={uploadingNf || !xml || !pdf} size="sm">
                              {uploadingNf ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                              Enviar NF {tipo === 'CONSUMO' ? 'Consumo' : 'Permanente'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                {erroNf && <p className="text-sm text-red-600">{erroNf}</p>}
              </div>
            ) : nfEnviada ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Nota Fiscal enviada com sucesso</span>
                </div>
                <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg text-sm">
                  <div>
                    <p className="text-gray-500">Numero/Serie</p>
                    <p className="font-medium">{nfEnviada.numero || '-'}/{nfEnviada.serie || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Valor Total</p>
                    <p className="font-medium">{formatarMoeda(nfEnviada.valor_total || 0)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Emitente</p>
                    <p className="font-medium">{nfEnviada.razao_social_emitente || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Status</p>
                    <Badge variant={nfEnviada.status === 'ERRO' ? 'destructive' : 'default'}>
                      {nfEnviada.status}
                    </Badge>
                  </div>
                  {nfEnviada.chave_acesso && (
                    <div className="col-span-2">
                      <p className="text-gray-500">Chave de Acesso</p>
                      <p className="font-mono text-xs break-all">{nfEnviada.chave_acesso}</p>
                    </div>
                  )}
                </div>

                <div className="border-t pt-3">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-600" />
                    Documentos Anexados
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {nfEnviada.caminho_xml && (
                      <a href={getFileUrl(nfEnviada.caminho_xml) || '#'} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 border rounded-lg hover:bg-gray-50 transition text-sm">
                        <FileCode className="h-5 w-5 text-green-600 flex-shrink-0" />
                        <span className="flex-1 truncate">XML da NF-e</span>
                        <Download className="h-3 w-3 text-gray-400" />
                      </a>
                    )}
                    {nfEnviada.caminho_pdf && (
                      <a href={getFileUrl(nfEnviada.caminho_pdf) || '#'} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 border rounded-lg hover:bg-gray-50 transition text-sm">
                        <FileText className="h-5 w-5 text-red-600 flex-shrink-0" />
                        <span className="flex-1 truncate">PDF da Nota Fiscal</span>
                        <Download className="h-3 w-3 text-gray-400" />
                      </a>
                    )}
                    {nfEnviada.documentos_extras?.map((doc: any, i: number) => (
                      <a key={i} href={getFileUrl(doc.caminho) || '#'} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 border rounded-lg hover:bg-gray-50 transition text-sm">
                        <FileText className="h-5 w-5 text-orange-500 flex-shrink-0" />
                        <span className="flex-1 truncate">{doc.nome}</span>
                        <Download className="h-3 w-3 text-gray-400" />
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={`border-2 border-dashed rounded-lg p-4 text-center ${xmlFile ? 'border-green-400 bg-green-50' : 'border-gray-300'}`}>
                    <FileCode className={`h-6 w-6 mx-auto mb-1 ${xmlFile ? 'text-green-600' : 'text-gray-400'}`} />
                    <p className="text-xs font-medium mb-2">{xmlFile ? xmlFile.name : 'XML da NF-e *'}</p>
                    <label className="cursor-pointer">
                      <input type="file" accept=".xml" onChange={(e) => { setXmlFile(e.target.files?.[0] || null); e.target.value = '' }} className="hidden" />
                      <Button variant={xmlFile ? 'outline' : 'default'} size="sm" asChild><span><Upload className="h-3 w-3 mr-1" />{xmlFile ? 'Trocar' : 'Selecionar XML'}</span></Button>
                    </label>
                  </div>
                  <div className={`border-2 border-dashed rounded-lg p-4 text-center ${pdfFile ? 'border-green-400 bg-green-50' : 'border-gray-300'}`}>
                    <FileText className={`h-6 w-6 mx-auto mb-1 ${pdfFile ? 'text-green-600' : 'text-gray-400'}`} />
                    <p className="text-xs font-medium mb-2">{pdfFile ? pdfFile.name : 'PDF da Nota Fiscal *'}</p>
                    <label className="cursor-pointer">
                      <input type="file" accept=".pdf" onChange={(e) => { setPdfFile(e.target.files?.[0] || null); e.target.value = '' }} className="hidden" />
                      <Button variant={pdfFile ? 'outline' : 'default'} size="sm" asChild><span><Upload className="h-3 w-3 mr-1" />{pdfFile ? 'Trocar' : 'Selecionar PDF'}</span></Button>
                    </label>
                  </div>
                </div>
                <div className={`border-2 border-dashed rounded-lg p-4 text-center ${outrosFiles.length > 0 ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}>
                  <p className="text-xs text-gray-500 mb-2">Outros documentos (opcional): boleto, comprovante, etc.</p>
                  {outrosFiles.length > 0 && (
                    <div className="flex flex-wrap gap-1 justify-center mb-2">
                      {outrosFiles.map((f, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {f.name}
                          <button className="ml-1 text-red-500" onClick={() => setOutrosFiles(prev => prev.filter((_, idx) => idx !== i))}>×</button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  <label className="cursor-pointer">
                    <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { if (e.target.files) setOutrosFiles(prev => [...prev, ...Array.from(e.target.files!)]); e.target.value = '' }} className="hidden" />
                    <Button variant="outline" size="sm" asChild><span><Upload className="h-3 w-3 mr-1" />Anexar Documento</span></Button>
                  </label>
                </div>
                <Button onClick={() => handleEnviarNf()} disabled={uploadingNf || !xmlFile || !pdfFile} className="w-full" size="lg">
                  {uploadingNf ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  {uploadingNf ? 'Enviando...' : 'Enviar Nota Fiscal'}
                </Button>
                {erroNf && <p className="text-sm text-red-600">{erroNf}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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

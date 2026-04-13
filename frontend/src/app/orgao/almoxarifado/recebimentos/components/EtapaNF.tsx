'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, FileText, FileCode, Clock, Upload, AlertTriangle, History, Download, Eye, ListOrdered, BellRing } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'

const getFileUrl = (caminho: string | null) => {
  if (!caminho) return null
  const filename = caminho.split(/[/\\]/).pop()
  return `${API_URL}/api/uploads/notas-fiscais/${filename}`
}

interface EtapaNFProps {
  notaFiscal: any
  ordem: any
  notasFiscais?: any[]
  nfsPendentes?: any[]
  aguardarProximaNf?: boolean
  onImportarXml: () => void
  onNfEnviada: () => void
  onSelecionarNf?: (nfId: string) => void
  loading: boolean
}

export function EtapaNF({ notaFiscal, ordem, notasFiscais = [], nfsPendentes = [], aguardarProximaNf = false, onImportarXml, onNfEnviada, onSelecionarNf, loading }: EtapaNFProps) {
  const [uploading, setUploading] = useState(false)
  const [erroUpload, setErroUpload] = useState<string | null>(null)
  const [reenviandoNotificacao, setReenviandoNotificacao] = useState(false)
  const fmt = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const handleUploadManual = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    setErroUpload(null)
    try {
      const formData = new FormData()
      for (let i = 0; i < files.length; i++) {
        formData.append('arquivos', files[i])
      }

      const res = await authFetch(`${API_URL}/api/almoxarifado/ordens/${ordem.id}/upload-nota-fiscal`, {
        method: 'POST',
        body: formData,
        headers: {},
      })

      if (res.ok) {
        onNfEnviada()
      } else {
        const data = await res.json().catch(() => ({}))
        setErroUpload(data.message || 'Erro ao enviar nota fiscal')
      }
    } catch {
      setErroUpload('Erro ao enviar nota fiscal')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleReenviarNotificacao = async () => {
    if (!notaFiscal?.id) return

    setReenviandoNotificacao(true)
    try {
      const res = await authFetch(`${API_URL}/api/almoxarifado/notas-fiscais-fornecedor/${notaFiscal.id}/reenviar-notificacao`, {
        method: 'POST',
      })

      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        alert(`Notificação reenviada com sucesso para ${data.destinatarios ?? 0} usuário(s).`)
      } else {
        alert(data.message || 'Erro ao reenviar notificação da NF')
      }
    } catch {
      alert('Erro ao reenviar notificação da NF')
    } finally {
      setReenviandoNotificacao(false)
    }
  }

  if (!notaFiscal) {
    return (
      <div className="space-y-5">
        {nfsPendentes.length > 1 && onSelecionarNf && (
          <Card className="border-blue-200 bg-blue-50/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ListOrdered className="h-5 w-5 text-blue-600" />
                Notas enviadas pelo fornecedor ({nfsPendentes.length} na fila)
              </CardTitle>
              <CardDescription>
                Escolha qual nota fiscal processar. A ordem sugerida é da mais antiga para a mais recente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[...nfsPendentes].reverse().map((nf: any, idx: number) => (
                  <div
                    key={nf.id}
                    className="flex items-center justify-between p-3 border rounded-lg bg-white hover:bg-gray-50"
                  >
                    <div>
                      <p className="font-medium">NF {nf.numero || 'S/N'}/{nf.serie || '-'}</p>
                      <p className="text-sm text-gray-500">
                        Valor: {fmt(nf.valor_total)} · Emitente: {nf.razao_social_emitente || '-'}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => onSelecionarNf(nf.id)}>
                      Processar esta NF
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {nfsPendentes.length === 0 && (
          <Card className="text-center">
            <CardContent className="py-10">
              <Clock className="h-12 w-12 mx-auto text-amber-400 mb-4" />
              <h3 className="text-lg font-bold mb-2">
                {aguardarProximaNf ? 'Aguardando próxima Nota Fiscal' : 'Aguardando Nota Fiscal'}
              </h3>
              <p className="text-gray-600 text-sm mb-6">
                {aguardarProximaNf
                  ? 'OF parcialmente atendida. Anexe o XML e o PDF da próxima nota fiscal abaixo.'
                  : `O fornecedor ${ordem?.fornecedor?.razao_social || ordem?.fornecedor?.nome || '-'} ainda não enviou a nota fiscal pelo portal.`}
              </p>
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-left space-y-1 max-w-md mx-auto">
                <p><span className="text-gray-500">OF:</span> {ordem?.numero}</p>
                <p><span className="text-gray-500">Valor:</span> {fmt(ordem?.valor_total)}</p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-5 w-5 text-blue-600" />
              Anexar Nota Fiscal Manualmente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              Caso o fornecedor tenha enviado a NF por e-mail ou outro meio, você pode anexar o XML e o PDF aqui. O sistema fará a pré-análise: se o valor da NF for maior que o da ordem, o envio será bloqueado.
            </p>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-500 mb-3">
                Selecione o arquivo XML da NF-e (obrigatório) e opcionalmente o PDF
              </p>
              <label className="cursor-pointer inline-block">
                <input
                  type="file"
                  multiple
                  accept=".xml,.pdf"
                  onChange={handleUploadManual}
                  disabled={uploading}
                  className="hidden"
                />
                <Button asChild disabled={uploading}>
                  <span>
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {uploading ? 'Enviando...' : 'Selecionar Arquivos (XML + PDF)'}
                  </span>
                </Button>
              </label>
            </div>
            {erroUpload && <p className="text-sm text-red-600 mt-3">{erroUpload}</p>}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (notaFiscal?.status === 'RECUSADA') {
    return (
      <div className="space-y-5">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-bold text-red-800 mb-1">Nota Fiscal Recusada</h3>
                <p className="text-sm text-red-700 mb-2">
                  NF nº <strong>{notaFiscal.numero || 'S/N'}</strong> (Série {notaFiscal.serie || '-'}) foi recusada na pré-análise.
                </p>
                {notaFiscal.motivo_recusa && (
                  <div className="bg-white border border-red-200 rounded-lg p-3 mb-3">
                    <p className="text-xs text-gray-500 mb-1">Motivo da recusa:</p>
                    <p className="text-sm font-medium text-red-800">{notaFiscal.motivo_recusa}</p>
                  </div>
                )}
                <p className="text-sm text-gray-600">
                  O fornecedor foi notificado. Aguarde o envio de uma nova NF ou anexe manualmente abaixo.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {notaFiscal.historico?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-5 w-5 text-gray-600" />
                Histórico
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {notaFiscal.historico.map((h: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-sm border-b border-gray-100 pb-2">
                    <Badge variant="destructive" className="text-[10px] flex-shrink-0">{h.tipo}</Badge>
                    <div>
                      <p className="text-gray-700">{h.descricao}</p>
                      <p className="text-xs text-gray-400">{new Date(h.data).toLocaleString('pt-BR')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-5 w-5 text-blue-600" />
              Enviar Nova Nota Fiscal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              Anexe o XML e PDF da nova NF corrigida para continuar o recebimento.
            </p>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-500 mb-3">
                Selecione o arquivo XML da NF-e (obrigatório) e opcionalmente o PDF
              </p>
              <label className="cursor-pointer inline-block">
                <input
                  type="file"
                  multiple
                  accept=".xml,.pdf"
                  onChange={handleUploadManual}
                  disabled={uploading}
                  className="hidden"
                />
                <Button asChild disabled={uploading}>
                  <span>
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {uploading ? 'Enviando...' : 'Selecionar Arquivos (XML + PDF)'}
                  </span>
                </Button>
              </label>
            </div>
            {erroUpload && <p className="text-sm text-red-600 mt-3">{erroUpload}</p>}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {nfsPendentes.length > 1 && onSelecionarNf && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListOrdered className="h-5 w-5 text-blue-600" />
              Outras notas na fila ({nfsPendentes.length})
            </CardTitle>
            <CardDescription>
              Processando NF {notaFiscal?.numero || ''}. Clique para trocar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {nfsPendentes
                .filter((nf: any) => nf.id !== notaFiscal?.id)
                .map((nf: any) => (
                  <Button
                    key={nf.id}
                    variant="outline"
                    size="sm"
                    onClick={() => onSelecionarNf(nf.id)}
                  >
                    NF {nf.numero || 'S/N'}/{nf.serie || '-'} · {fmt(nf.valor_total)}
                  </Button>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-blue-600" />
            Nota Fiscal do Fornecedor
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {[
            ['Numero / Serie', `${notaFiscal.numero || '-'} / ${notaFiscal.serie || '-'}`],
            ['Data de Emissao', notaFiscal.data_emissao ? new Date(notaFiscal.data_emissao).toLocaleDateString('pt-BR') : '-'],
            ['Valor Total', fmt(notaFiscal.valor_total)],
            ['Emitente', notaFiscal.razao_social_emitente || '-'],
            ['CNPJ', notaFiscal.cnpj_emitente || '-'],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-500">{label}</span>
              <span className="font-semibold">{value}</span>
            </div>
          ))}
          {notaFiscal.chave_acesso && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-dashed border-gray-200">
              <p className="text-xs text-gray-400 mb-1">Chave de Acesso NF-e</p>
              <p className="font-mono text-[10px] break-all text-gray-600">{notaFiscal.chave_acesso}</p>
            </div>
          )}
          <div className="mt-2">
            <Badge variant={notaFiscal.status === 'ERRO' ? 'destructive' : 'default'}>
              {notaFiscal.status}
            </Badge>
            {notaFiscal.produtos_xml?.length > 0 && (
              <span className="text-xs text-gray-500 ml-2">{notaFiscal.produtos_xml.length} produtos no XML</span>
            )}
          </div>
          <div className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReenviarNotificacao}
              disabled={reenviandoNotificacao}
            >
              {reenviandoNotificacao ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <BellRing className="h-4 w-4 mr-2" />
              )}
              {reenviandoNotificacao ? 'Reenviando notificação...' : 'Reenviar notificação ao almoxarifado'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileCode className="h-5 w-5 text-green-600" />
            XML da Nota Fiscal
          </CardTitle>
        </CardHeader>
        <CardContent>
          {notaFiscal.xml_raw ? (
            <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs text-gray-400 max-h-56 overflow-hidden relative mb-4">
              <pre className="whitespace-pre-wrap break-all">
                {notaFiscal.xml_raw.substring(0, 800)}
              </pre>
              <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-gray-900" />
            </div>
          ) : (
            <p className="text-sm text-gray-500 mb-4">XML não disponível para preview</p>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-blue-800 font-medium mb-1">Próximo passo</p>
            <p className="text-xs text-blue-700">
              Clique no botão abaixo para extrair os produtos do XML e vinculá-los aos itens da ordem.
              A IA irá sugerir os vínculos automaticamente.
            </p>
          </div>

          <Button
            onClick={onImportarXml}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            size="lg"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <FileCode className="h-4 w-4 mr-2" />
            )}
            {loading ? 'Processando IA...' : 'Importar XML e Vincular Produtos'}
          </Button>

          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-gray-500 mb-2">Enviou a NF errada? Substitua por outra:</p>
            <label className="cursor-pointer inline-block">
              <input
                type="file"
                multiple
                accept=".xml,.pdf"
                onChange={handleUploadManual}
                disabled={uploading}
                className="hidden"
              />
              <Button variant="outline" size="sm" asChild disabled={uploading}>
                <span>
                  {uploading ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Upload className="h-3 w-3 mr-1" />
                  )}
                  {uploading ? 'Enviando...' : 'Substituir NF (XML + PDF)'}
                </span>
              </Button>
            </label>
            {erroUpload && <p className="text-xs text-red-600 mt-2">{erroUpload}</p>}
          </div>
        </CardContent>
      </Card>

      {(notaFiscal.caminho_pdf || notaFiscal.documentos_extras?.length > 0) && (
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-5 w-5 text-blue-600" />
              Documentos Anexados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {notaFiscal.caminho_xml && (
                <a
                  href={getFileUrl(notaFiscal.caminho_xml) || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 transition"
                >
                  <FileCode className="h-8 w-8 text-green-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">XML da NF-e</p>
                    <p className="text-xs text-gray-500">Arquivo XML</p>
                  </div>
                  <Download className="h-4 w-4 text-gray-400" />
                </a>
              )}
              {notaFiscal.caminho_pdf && (
                <a
                  href={getFileUrl(notaFiscal.caminho_pdf) || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 transition"
                >
                  <FileText className="h-8 w-8 text-red-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">PDF da Nota Fiscal</p>
                    <p className="text-xs text-gray-500">Documento PDF</p>
                  </div>
                  <Download className="h-4 w-4 text-gray-400" />
                </a>
              )}
              {notaFiscal.documentos_extras?.map((doc: any, i: number) => (
                <a
                  key={i}
                  href={getFileUrl(doc.caminho) || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 transition"
                >
                  <Eye className="h-8 w-8 text-orange-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.nome}</p>
                    <p className="text-xs text-gray-500">{doc.tipo || 'Documento'}</p>
                  </div>
                  <Download className="h-4 w-4 text-gray-400" />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
    </div>
  )
}

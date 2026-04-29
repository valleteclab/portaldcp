'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, FileText, FileCode, Clock, Upload, AlertTriangle, History, Download, Eye, ListOrdered, BellRing, CheckCircle } from 'lucide-react'
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
        <Card className="border-[#b8c8f5] bg-white/80 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-black text-[#123f82]">
              <ListOrdered className="h-5 w-5 text-[#123f82]" />
              Outras notas na fila ({nfsPendentes.length})
            </CardTitle>
            <CardDescription>Processando NF {notaFiscal?.numero || ''}. Clique para trocar.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {nfsPendentes
                .filter((nf: any) => nf.id !== notaFiscal?.id)
                .map((nf: any) => (
                  <Button key={nf.id} variant="outline" size="sm" onClick={() => onSelecionarNf?.(nf.id)}>
                    NF {nf.numero || 'S/N'}/{nf.serie || '-'} - {fmt(nf.valor_total)}
                  </Button>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_288px]">
        <Card className="rounded-xl border-[#d8e2f2] bg-white shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-3 text-xl font-black tracking-tight text-[#123f82]">
              <FileText className="h-5 w-5 text-[#123f82]" />
              Nota Fiscal do Fornecedor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-[#d8e2f2] bg-[#f8fbff] p-4">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Numero / Serie</p>
                <p className="mt-2 text-lg font-black text-[#06162d]">{notaFiscal.numero || '-'} / {notaFiscal.serie || '-'}</p>
              </div>
              <div className="rounded-lg border border-[#d8e2f2] bg-[#f8fbff] p-4">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Data de Emissao</p>
                <p className="mt-2 text-lg font-black text-[#06162d]">
                  {notaFiscal.data_emissao ? new Date(notaFiscal.data_emissao).toLocaleDateString('pt-BR') : '-'}
                </p>
              </div>
              <div className="rounded-lg border border-[#d8e2f2] bg-[#f8fbff] p-4">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Valor Total</p>
                <p className="mt-2 text-lg font-black text-[#06162d]">{fmt(notaFiscal.valor_total)}</p>
              </div>
            </div>

            <div className="rounded-lg border border-[#d8e2f2] bg-[#f8fbff] p-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Emitente</p>
              <p className="mt-2 text-base font-black text-[#06162d]">{notaFiscal.razao_social_emitente || '-'}</p>
            </div>
            <div className="rounded-lg border border-[#d8e2f2] bg-[#f8fbff] p-4 sm:w-1/2">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">CNPJ</p>
              <p className="mt-2 text-base font-black text-[#06162d]">{notaFiscal.cnpj_emitente || '-'}</p>
            </div>
            {notaFiscal.chave_acesso && (
              <div className="rounded-lg border border-[#d8e2f2] bg-[#f8fbff] p-4">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Chave de Acesso NF-e</p>
                <p className="mt-2 break-all font-mono text-sm font-black text-[#06162d]">{notaFiscal.chave_acesso}</p>
              </div>
            )}
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-800">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5" />
                <div>
                  <p className="text-sm font-black uppercase tracking-widest">{notaFiscal.status || 'VINCULADA'}</p>
                  {notaFiscal.produtos_xml?.length > 0 && (
                    <p className="text-xs font-semibold">{notaFiscal.produtos_xml.length} produtos no XML</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="rounded-xl bg-[#1c2d47] p-4 font-mono text-[10px] leading-relaxed text-blue-100 shadow-none">
            <pre className="max-h-[168px] overflow-hidden whitespace-pre-wrap break-all">
              {(notaFiscal.xml_raw || '<xml>Preview do XML indisponivel</xml>').substring(0, 520)}
            </pre>
          </div>

          <div className="rounded-xl border border-[#b8c8f5] bg-[#eef3ff] p-5 text-[#1f32b0]">
            <p className="mb-3 text-sm font-black">Proximo passo</p>
            <p className="text-sm leading-relaxed">
              Clique no botao abaixo para extrair os produtos do XML e vincula-los aos itens da ordem.
            </p>
          </div>

          <Button
            onClick={onImportarXml}
            disabled={loading}
            className="h-[74px] w-full rounded-xl bg-[#123f82] px-6 text-base font-black leading-tight text-white shadow-[0_10px_18px_rgba(16,43,99,0.18)] hover:bg-[#0e3470]"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <FileCode className="h-5 w-5 mr-2 text-[#ffd33d]" />}
            {loading ? 'Processando IA...' : 'Importar XML e Vincular Produtos'}
          </Button>
        </div>
      </div>

      {(notaFiscal.caminho_xml || notaFiscal.caminho_pdf || notaFiscal.documentos_extras?.length > 0) && (
        <Card className="rounded-xl border-[#d8e2f2] bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-base font-black text-[#24324a]">Documentos Anexados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {notaFiscal.caminho_xml && (
                <a href={getFileUrl(notaFiscal.caminho_xml) || '#'} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 rounded-lg border border-[#d8e2f2] bg-[#f8fbff] p-4 hover:bg-white">
                  <FileCode className="h-6 w-6 text-[#b194c8]" />
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-[#06162d]">XML da NF-e</p>
                    <p className="text-xs font-medium text-slate-500">Arquivo XML</p>
                  </div>
                  <Download className="h-4 w-4 text-slate-500" />
                </a>
              )}
              {notaFiscal.caminho_pdf && (
                <a href={getFileUrl(notaFiscal.caminho_pdf) || '#'} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 rounded-lg border border-[#d8e2f2] bg-[#f8fbff] p-4 hover:bg-white">
                  <FileText className="h-6 w-6 text-[#d83d68]" />
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-[#06162d]">PDF da Nota Fiscal</p>
                    <p className="text-xs font-medium text-slate-500">Documento PDF</p>
                  </div>
                  <Download className="h-4 w-4 text-slate-500" />
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )

}


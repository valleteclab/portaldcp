'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, FileText, FileCode, Clock, Upload } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'

interface EtapaNFProps {
  notaFiscal: any
  ordem: any
  onImportarXml: () => void
  onNfEnviada: () => void
  loading: boolean
}

export function EtapaNF({ notaFiscal, ordem, onImportarXml, onNfEnviada, loading }: EtapaNFProps) {
  const [uploading, setUploading] = useState(false)
  const [erroUpload, setErroUpload] = useState<string | null>(null)
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

  if (!notaFiscal) {
    return (
      <div className="space-y-5">
        <Card className="text-center">
          <CardContent className="py-10">
            <Clock className="h-12 w-12 mx-auto text-amber-400 mb-4" />
            <h3 className="text-lg font-bold mb-2">Aguardando Nota Fiscal</h3>
            <p className="text-gray-600 text-sm mb-6">
              O fornecedor <strong>{ordem?.fornecedor?.razao_social || ordem?.fornecedor?.nome || '-'}</strong> ainda
              não enviou a nota fiscal pelo portal.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 text-sm text-left space-y-1 max-w-md mx-auto">
              <p><span className="text-gray-500">OF:</span> {ordem?.numero}</p>
              <p><span className="text-gray-500">Valor:</span> {fmt(ordem?.valor_total)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-5 w-5 text-blue-600" />
              Anexar Nota Fiscal Manualmente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              Caso o fornecedor tenha enviado a NF por e-mail ou outro meio, você pode anexar o XML e o PDF aqui.
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

          <Button
            onClick={onImportarXml}
            disabled={loading}
            className="w-full"
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
    </div>
  )
}

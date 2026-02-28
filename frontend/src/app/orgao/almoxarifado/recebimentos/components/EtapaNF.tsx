'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, FileText, FileCode, Clock } from 'lucide-react'

interface EtapaNFProps {
  notaFiscal: any
  ordem: any
  onImportarXml: () => void
  loading: boolean
}

export function EtapaNF({ notaFiscal, ordem, onImportarXml, loading }: EtapaNFProps) {
  const fmt = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  if (!notaFiscal) {
    return (
      <div className="max-w-xl mx-auto">
        <Card className="text-center">
          <CardContent className="py-12">
            <Clock className="h-12 w-12 mx-auto text-amber-400 mb-4" />
            <h3 className="text-lg font-bold mb-2">Aguardando Nota Fiscal</h3>
            <p className="text-gray-600 text-sm mb-6">
              O fornecedor <strong>{ordem?.fornecedor?.razao_social || ordem?.fornecedor?.nome || '-'}</strong> ainda
              não enviou a nota fiscal pelo portal.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 text-sm text-left space-y-1">
              <p><span className="text-gray-500">OF:</span> {ordem?.numero}</p>
              <p><span className="text-gray-500">Valor:</span> {fmt(ordem?.valor_total)}</p>
            </div>
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
        </CardContent>
      </Card>
    </div>
  )
}

"use client"

import { useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { 
  FileText, 
  Upload, 
  Trash2, 
  Download, 
  File, 
  CheckCircle,
  AlertCircle
} from "lucide-react"
import { DocumentoLicitacao } from "./types"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface DocumentosTabProps {
  documentos: DocumentoLicitacao[]
  onChange: (documentos: DocumentoLicitacao[]) => void
}

const TIPOS_DOCUMENTO = [
  { 
    tipo: 'EDITAL', 
    label: 'Edital', 
    descricao: 'Documento principal com todas as regras da licitação',
    obrigatorio: true
  },
  { 
    tipo: 'TERMO_REFERENCIA', 
    label: 'Termo de Referência', 
    descricao: 'Especificações técnicas e condições de execução',
    obrigatorio: true
  },
  { 
    tipo: 'ESTUDO_TECNICO', 
    label: 'Estudo Técnico Preliminar', 
    descricao: 'Análise de viabilidade e alternativas',
    obrigatorio: false
  },
  { 
    tipo: 'PESQUISA_PRECOS', 
    label: 'Pesquisa de Preços', 
    descricao: 'Levantamento de preços de mercado',
    obrigatorio: true
  },
  { 
    tipo: 'PARECER_JURIDICO', 
    label: 'Parecer Jurídico', 
    descricao: 'Análise jurídica do processo',
    obrigatorio: false
  },
  { 
    tipo: 'MINUTA_CONTRATO', 
    label: 'Minuta do Contrato', 
    descricao: 'Modelo do contrato a ser firmado',
    obrigatorio: false
  },
  { 
    tipo: 'ANEXO', 
    label: 'Anexos', 
    descricao: 'Documentos complementares',
    obrigatorio: false
  },
]

export function DocumentosTab({ documentos, onChange }: DocumentosTabProps) {
  const [uploading, setUploading] = useState<string | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const getDocumento = (tipo: string) => {
    return documentos.find(d => d.tipo === tipo)
  }

  const handleUpload = async (tipo: string, file: File) => {
    setUploading(tipo)
    
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('tipo', 'licitacao')

      const res = await fetch(`${API_URL}/api/uploads`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) throw new Error('Erro no upload')

      const data = await res.json()
      
      const novoDoc: DocumentoLicitacao = {
        tipo,
        nome: file.name,
        url: data.url || data.caminho,
        data_upload: new Date().toISOString(),
      }

      // Remove documento anterior do mesmo tipo e adiciona o novo
      const novosDocumentos = documentos.filter(d => d.tipo !== tipo)
      novosDocumentos.push(novoDoc)
      onChange(novosDocumentos)
    } catch (error) {
      console.error('Erro no upload:', error)
      alert('Erro ao enviar arquivo. Tente novamente.')
    } finally {
      setUploading(null)
    }
  }

  const handleRemove = (tipo: string) => {
    const novosDocumentos = documentos.filter(d => d.tipo !== tipo)
    onChange(novosDocumentos)
  }

  const handleFileChange = (tipo: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      handleUpload(tipo, file)
    }
    // Limpa o input
    if (fileInputRefs.current[tipo]) {
      fileInputRefs.current[tipo]!.value = ''
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Documentos do Processo
        </CardTitle>
        <CardDescription>
          Anexe os documentos necessários para o processo licitatório
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {TIPOS_DOCUMENTO.map((tipoDoc) => {
          const documento = getDocumento(tipoDoc.tipo)
          const isUploading = uploading === tipoDoc.tipo

          return (
            <div 
              key={tipoDoc.tipo}
              className={`p-4 border rounded-lg ${documento ? 'bg-green-50 border-green-200' : 'bg-slate-50'}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  {documento ? (
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  ) : tipoDoc.obrigatorio ? (
                    <AlertCircle className="h-5 w-5 text-orange-500 mt-0.5" />
                  ) : (
                    <File className="h-5 w-5 text-slate-400 mt-0.5" />
                  )}
                  <div>
                    <p className="font-medium">
                      {tipoDoc.label}
                      {tipoDoc.obrigatorio && <span className="text-red-500 ml-1">*</span>}
                    </p>
                    <p className="text-sm text-muted-foreground">{tipoDoc.descricao}</p>
                    
                    {documento && (
                      <div className="mt-2 flex items-center gap-2 text-sm">
                        <File className="h-4 w-4 text-green-600" />
                        <span className="text-green-700">{documento.nome}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  {documento ? (
                    <>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => window.open(`${API_URL}${documento.url}`, '_blank')}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Baixar
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleRemove(tipoDoc.tipo)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm"
                      disabled={isUploading}
                      onClick={() => fileInputRefs.current[tipoDoc.tipo]?.click()}
                    >
                      {isUploading ? (
                        <>
                          <span className="animate-spin mr-2">⏳</span>
                          Enviando...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-1" />
                          Enviar Arquivo
                        </>
                      )}
                    </Button>
                  )}
                  <input
                    ref={(el) => { fileInputRefs.current[tipoDoc.tipo] = el }}
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.odt,.ods"
                    onChange={(e) => handleFileChange(tipoDoc.tipo, e)}
                    className="hidden"
                  />
                </div>
              </div>
            </div>
          )
        })}

        {/* Resumo */}
        <div className="mt-6 p-4 bg-slate-100 rounded-lg">
          <div className="flex items-center justify-between text-sm">
            <span>Documentos enviados:</span>
            <span className="font-medium">{documentos.length} de {TIPOS_DOCUMENTO.length}</span>
          </div>
          <div className="flex items-center justify-between text-sm mt-1">
            <span>Obrigatórios pendentes:</span>
            <span className={`font-medium ${
              TIPOS_DOCUMENTO.filter(t => t.obrigatorio && !getDocumento(t.tipo)).length > 0 
                ? 'text-orange-600' 
                : 'text-green-600'
            }`}>
              {TIPOS_DOCUMENTO.filter(t => t.obrigatorio && !getDocumento(t.tipo)).length}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

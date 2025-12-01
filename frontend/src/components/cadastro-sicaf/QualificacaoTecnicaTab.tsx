"use client"

import { Briefcase, Plus, Trash2, ArrowRight, ArrowLeft } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DateInput } from "@/components/ui/date-input"
import { AtestadoTecnico } from "./types"
import { FileUpload } from "./FileUpload"

interface QualificacaoTecnicaTabProps {
  atestados: AtestadoTecnico[]
  setAtestados: (atestados: AtestadoTecnico[]) => void
  onNext?: () => void
  onBack?: () => void
}

export function QualificacaoTecnicaTab({ atestados, setAtestados, onNext, onBack }: QualificacaoTecnicaTabProps) {
  const adicionarAtestado = () => {
    setAtestados([
      ...atestados,
      {
        id: Date.now().toString(),
        emissor: '',
        data: '',
        descricao: '',
      }
    ])
  }

  const removerAtestado = (id: string) => {
    setAtestados(atestados.filter(a => a.id !== id))
  }

  const atualizarAtestado = (id: string, field: keyof AtestadoTecnico, value: string) => {
    setAtestados(atestados.map(a => 
      a.id === id ? { ...a, [field]: value } : a
    ))
  }

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Qualificação Técnica
            </CardTitle>
            <CardDescription>
              Atestados de capacidade técnica (opcional)
            </CardDescription>
          </div>
          <Button onClick={adicionarAtestado}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Atestado
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {atestados.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>Nenhum atestado técnico cadastrado.</p>
            <p className="text-sm">Clique em "Adicionar Atestado" para incluir.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {atestados.map((atestado, idx) => (
              <div key={atestado.id} className="p-4 border rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Atestado #{idx + 1}</h4>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => removerAtestado(atestado.id)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome do Emissor *</Label>
                    <Input
                      value={atestado.emissor}
                      onChange={(e) => atualizarAtestado(atestado.id, 'emissor', e.target.value)}
                      placeholder="Empresa ou órgão que emitiu o atestado"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Data de Emissão</Label>
                    <DateInput
                      value={atestado.data}
                      onChange={(value) => atualizarAtestado(atestado.id, 'data', value)}
                    />
                  </div>
                  
                  <div className="col-span-2 space-y-2">
                    <Label>Descrição do Serviço Prestado</Label>
                    <Textarea
                      value={atestado.descricao}
                      onChange={(e) => atualizarAtestado(atestado.id, 'descricao', e.target.value)}
                      placeholder="Descreva o serviço ou fornecimento realizado"
                      rows={3}
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <FileUpload
                      label="Arquivo do Atestado"
                      file={atestado.arquivo || null}
                      onFileChange={(file, uploadInfo) => {
                        setAtestados(atestados.map(a => 
                          a.id === atestado.id ? { ...a, arquivo: file, arquivoInfo: uploadInfo } : a
                        ))
                      }}
                      onRemove={() => {
                        setAtestados(atestados.map(a => 
                          a.id === atestado.id ? { ...a, arquivo: null, arquivoInfo: undefined } : a
                        ))
                      }}
                      tipo="qualificacao-tecnica"
                      savedFilename={atestado.arquivoInfo?.originalname}
                      savedUrl={atestado.arquivoInfo?.url}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>

    {/* Botões de Navegação */}
    <div className="flex justify-between mt-4">
      {onBack && (
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
      )}
      <div className="flex-1" />
      {onNext && (
        <Button onClick={onNext}>
          Avançar <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      )}
    </div>
    </>
  )
}

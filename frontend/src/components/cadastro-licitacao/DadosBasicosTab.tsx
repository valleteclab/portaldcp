"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { FileText, Import, AlertCircle } from "lucide-react"
import { DadosBasicos } from "./types"

interface DadosBasicosTabProps {
  dados: DadosBasicos
  onChange: (dados: DadosBasicos) => void
  modoImportacao: boolean
  onToggleModo: () => void
}

export function DadosBasicosTab({ dados, onChange, modoImportacao, onToggleModo }: DadosBasicosTabProps) {
  const updateField = (field: keyof DadosBasicos, value: string) => {
    onChange({ ...dados, [field]: value })
  }

  return (
    <div className="space-y-6">
      {/* Opção de Importação */}
      <Card className="border-dashed">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Import className="h-5 w-5 text-blue-600" />
              <div>
                <p className="font-medium">Importar de outro sistema</p>
                <p className="text-sm text-muted-foreground">
                  Importe dados da fase interna de sistemas como Compras.gov, BLL, etc.
                </p>
              </div>
            </div>
            <Button 
              variant={modoImportacao ? "default" : "outline"}
              onClick={onToggleModo}
            >
              {modoImportacao ? "Cadastro Manual" : "Importar Dados"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {modoImportacao ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Import className="h-5 w-5" />
              Importar Fase Interna
            </CardTitle>
            <CardDescription>
              Cole os dados exportados do sistema de origem ou informe o código do processo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sistema de Origem</Label>
                <Input placeholder="Ex: Compras.gov, BLL, Licitanet..." />
              </div>
              <div className="space-y-2">
                <Label>Código/UASG do Processo</Label>
                <Input placeholder="Ex: 123456" />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Dados JSON (opcional)</Label>
              <Textarea 
                placeholder='Cole aqui os dados exportados no formato JSON...'
                rows={6}
                className="font-mono text-sm"
              />
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">Funcionalidade em desenvolvimento</p>
                <p>A importação automática estará disponível em breve. Por enquanto, cadastre manualmente.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Dados Básicos
            </CardTitle>
            <CardDescription>
              Informações gerais do processo licitatório
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="numero_processo">Número do Processo *</Label>
                <Input 
                  id="numero_processo"
                  placeholder="Ex: 001/2025"
                  value={dados.numero_processo}
                  onChange={(e) => updateField('numero_processo', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Formato sugerido: NNN/AAAA
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="objeto">Objeto da Licitação *</Label>
              <Input 
                id="objeto"
                placeholder="Descrição resumida do objeto"
                value={dados.objeto}
                onChange={(e) => updateField('objeto', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Descreva de forma clara e objetiva o que será contratado
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="objeto_detalhado">Descrição Detalhada</Label>
              <Textarea 
                id="objeto_detalhado"
                placeholder="Descrição completa do objeto, incluindo especificações técnicas..."
                rows={4}
                value={dados.objeto_detalhado}
                onChange={(e) => updateField('objeto_detalhado', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="justificativa">Justificativa da Contratação</Label>
              <Textarea 
                id="justificativa"
                placeholder="Justifique a necessidade desta contratação conforme Art. 18 da Lei 14.133/2021..."
                rows={3}
                value={dados.justificativa}
                onChange={(e) => updateField('justificativa', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Scale } from "lucide-react"
import { Classificacao, MODALIDADES, TIPOS_CONTRATACAO, CRITERIOS_JULGAMENTO, MODOS_DISPUTA } from "./types"

interface ClassificacaoTabProps {
  dados: Classificacao
  onChange: (dados: Classificacao) => void
}

export function ClassificacaoTab({ dados, onChange }: ClassificacaoTabProps) {
  const updateField = (field: keyof Classificacao, value: any) => {
    onChange({ ...dados, [field]: value })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-5 w-5" />
          Classificação
        </CardTitle>
        <CardDescription>
          Defina a modalidade e critérios conforme Lei 14.133/2021
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Modalidade *</Label>
            <Select 
              value={dados.modalidade} 
              onValueChange={(v) => updateField('modalidade', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a modalidade" />
              </SelectTrigger>
              <SelectContent>
                {MODALIDADES.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tipo de Contratação *</Label>
            <Select 
              value={dados.tipo_contratacao} 
              onValueChange={(v) => updateField('tipo_contratacao', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_CONTRATACAO.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Critério de Julgamento *</Label>
            <Select 
              value={dados.criterio_julgamento} 
              onValueChange={(v) => updateField('criterio_julgamento', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o critério" />
              </SelectTrigger>
              <SelectContent>
                {CRITERIOS_JULGAMENTO.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Modo de Disputa *</Label>
            <Select 
              value={dados.modo_disputa} 
              onValueChange={(v) => updateField('modo_disputa', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o modo" />
              </SelectTrigger>
              <SelectContent>
                {MODOS_DISPUTA.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tratamento ME/EPP */}
        <div className="border-t pt-6">
          <h3 className="font-medium mb-4">Tratamento Diferenciado ME/EPP (LC 123/2006)</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div>
                <Label className="text-base">Tratamento Diferenciado</Label>
                <p className="text-sm text-muted-foreground">
                  Aplicar benefícios da Lei Complementar 123/2006
                </p>
              </div>
              <Switch 
                checked={dados.tratamento_diferenciado_mpe}
                onCheckedChange={(v) => updateField('tratamento_diferenciado_mpe', v)}
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div>
                <Label className="text-base">Exclusivo para ME/EPP</Label>
                <p className="text-sm text-muted-foreground">
                  Participação exclusiva para Microempresas e EPPs (até R$ 80.000)
                </p>
              </div>
              <Switch 
                checked={dados.exclusivo_mpe}
                onCheckedChange={(v) => updateField('exclusivo_mpe', v)}
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div className="flex-1">
                <Label className="text-base">Cota Reservada</Label>
                <p className="text-sm text-muted-foreground">
                  Reservar cota de até 25% para ME/EPP
                </p>
              </div>
              <div className="flex items-center gap-4">
                {dados.cota_reservada && (
                  <div className="flex items-center gap-2">
                    <Input 
                      type="number"
                      className="w-20"
                      value={dados.percentual_cota_reservada}
                      onChange={(e) => updateField('percentual_cota_reservada', parseInt(e.target.value) || 0)}
                      min={1}
                      max={25}
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                )}
                <Switch 
                  checked={dados.cota_reservada}
                  onCheckedChange={(v) => updateField('cota_reservada', v)}
                />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

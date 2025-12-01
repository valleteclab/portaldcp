"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Settings, Users, Eye, EyeOff, AlertCircle } from "lucide-react"
import { Configuracoes } from "./types"

interface ConfiguracoesTabProps {
  dados: Configuracoes
  onChange: (dados: Configuracoes) => void
}

export function ConfiguracoesTab({ dados, onChange }: ConfiguracoesTabProps) {
  const updateField = (field: keyof Configuracoes, value: any) => {
    onChange({ ...dados, [field]: value })
  }

  return (
    <div className="space-y-6">
      {/* Sigilo do Orçamento - Lei 14.133/2021 */}
      <Card className="border-amber-200 bg-amber-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {dados.sigilo_orcamento === 'SIGILOSO' ? (
              <EyeOff className="h-5 w-5 text-amber-600" />
            ) : (
              <Eye className="h-5 w-5 text-green-600" />
            )}
            Sigilo do Orçamento Estimado
          </CardTitle>
          <CardDescription>
            Conforme Art. 24 da Lei 14.133/2021
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => updateField('sigilo_orcamento', 'PUBLICO')}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                dados.sigilo_orcamento === 'PUBLICO'
                  ? 'border-green-500 bg-green-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Eye className={`h-5 w-5 ${dados.sigilo_orcamento === 'PUBLICO' ? 'text-green-600' : 'text-slate-400'}`} />
                <span className={`font-medium ${dados.sigilo_orcamento === 'PUBLICO' ? 'text-green-700' : 'text-slate-700'}`}>
                  Orçamento Público
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                O valor estimado será divulgado no edital e visível aos licitantes desde a publicação.
              </p>
              <p className="text-xs text-green-600 mt-2 font-medium">
                Regra geral - Art. 24, caput
              </p>
            </button>

            <button
              type="button"
              onClick={() => updateField('sigilo_orcamento', 'SIGILOSO')}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                dados.sigilo_orcamento === 'SIGILOSO'
                  ? 'border-amber-500 bg-amber-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <EyeOff className={`h-5 w-5 ${dados.sigilo_orcamento === 'SIGILOSO' ? 'text-amber-600' : 'text-slate-400'}`} />
                <span className={`font-medium ${dados.sigilo_orcamento === 'SIGILOSO' ? 'text-amber-700' : 'text-slate-700'}`}>
                  Orçamento Sigiloso
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                O valor estimado será mantido em sigilo até o encerramento da fase de lances.
              </p>
              <p className="text-xs text-amber-600 mt-2 font-medium">
                Exceção justificada - Art. 24, §2º
              </p>
            </button>
          </div>

          {dados.sigilo_orcamento === 'SIGILOSO' && (
            <div className="space-y-3">
              <div className="bg-amber-100 border border-amber-300 rounded-lg p-4 flex gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium">Justificativa obrigatória</p>
                  <p>O sigilo do orçamento deve ser fundamentado no interesse público, demonstrando que a divulgação prévia prejudicaria a competitividade.</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="justificativa_sigilo">Justificativa do Sigilo *</Label>
                <Textarea 
                  id="justificativa_sigilo"
                  placeholder="Justifique a necessidade de manter o orçamento sigiloso conforme Art. 24, §2º da Lei 14.133/2021..."
                  rows={3}
                  value={dados.justificativa_sigilo || ''}
                  onChange={(e) => updateField('justificativa_sigilo', e.target.value)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configurações da Disputa */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configurações da Disputa
          </CardTitle>
          <CardDescription>
            Parâmetros para a fase de lances
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="intervalo_lances">Intervalo Mínimo entre Lances</Label>
              <div className="flex items-center gap-2">
                <Input 
                  id="intervalo_lances"
                  type="number"
                  min={1}
                  value={dados.intervalo_minimo_lances}
                  onChange={(e) => updateField('intervalo_minimo_lances', parseInt(e.target.value) || 0)}
                />
                <span className="text-sm text-muted-foreground">minutos</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Tempo mínimo entre lances do mesmo fornecedor
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tempo_prorrogacao">Tempo de Prorrogação</Label>
              <div className="flex items-center gap-2">
                <Input 
                  id="tempo_prorrogacao"
                  type="number"
                  min={1}
                  value={dados.tempo_prorrogacao}
                  onChange={(e) => updateField('tempo_prorrogacao', parseInt(e.target.value) || 0)}
                />
                <span className="text-sm text-muted-foreground">minutos</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Tempo adicional após cada lance
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="diferenca_lances">Diferença Mínima entre Lances</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">R$</span>
                <Input 
                  id="diferenca_lances"
                  type="number"
                  step="0.01"
                  min={0}
                  value={dados.diferenca_minima_lances}
                  onChange={(e) => updateField('diferenca_minima_lances', parseFloat(e.target.value) || 0)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Valor mínimo de redução (0 = sem limite)
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div>
              <Label className="text-base">Permitir Lances Intermediários</Label>
              <p className="text-sm text-muted-foreground">
                Permite lances acima do menor valor atual
              </p>
            </div>
            <Switch 
              checked={dados.permite_lances_intermediarios}
              onCheckedChange={(v) => updateField('permite_lances_intermediarios', v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Responsáveis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Responsáveis
          </CardTitle>
          <CardDescription>
            Pregoeiro e equipe de apoio
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pregoeiro">Pregoeiro / Agente de Contratação</Label>
            <Input 
              id="pregoeiro"
              placeholder="Nome completo do pregoeiro"
              value={dados.pregoeiro_nome}
              onChange={(e) => updateField('pregoeiro_nome', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="equipe_apoio">Equipe de Apoio</Label>
            <Textarea 
              id="equipe_apoio"
              placeholder="Nomes dos membros da equipe de apoio (um por linha)"
              rows={3}
              value={dados.equipe_apoio}
              onChange={(e) => updateField('equipe_apoio', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Informe os nomes dos membros da equipe de apoio
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

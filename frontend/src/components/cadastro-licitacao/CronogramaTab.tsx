"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Calendar, AlertCircle } from "lucide-react"
import { DateInputBR } from "@/components/ui/date-input-br"
import { Cronograma } from "./types"

interface CronogramaTabProps {
  dados: Cronograma
  onChange: (dados: Cronograma) => void
}

// Função para formatar data para exibição (DD/MM/YYYY HH:mm)
const formatarDataExibicao = (dataISO: string): string => {
  if (!dataISO) return ''
  const data = new Date(dataISO)
  if (isNaN(data.getTime())) return ''
  
  const dia = data.getDate().toString().padStart(2, '0')
  const mes = (data.getMonth() + 1).toString().padStart(2, '0')
  const ano = data.getFullYear()
  const hora = data.getHours().toString().padStart(2, '0')
  const minuto = data.getMinutes().toString().padStart(2, '0')
  
  return `${dia}/${mes}/${ano} ${hora}:${minuto}`
}

// Função para converter datetime-local para ISO
const datetimeLocalToISO = (value: string): string => {
  if (!value) return ''
  return new Date(value).toISOString()
}

export function CronogramaTab({ dados, onChange }: CronogramaTabProps) {
  const updateField = (field: keyof Cronograma, value: string) => {
    // Converte para ISO ao salvar
    const isoValue = value ? datetimeLocalToISO(value) : ''
    onChange({ ...dados, [field]: isoValue })
  }

  // Validação de sequência de datas
  const validarSequencia = () => {
    const datas = [
      { campo: 'data_publicacao_edital', valor: dados.data_publicacao_edital },
      { campo: 'data_limite_impugnacao', valor: dados.data_limite_impugnacao },
      { campo: 'data_inicio_acolhimento', valor: dados.data_inicio_acolhimento },
      { campo: 'data_fim_acolhimento', valor: dados.data_fim_acolhimento },
      { campo: 'data_abertura_sessao', valor: dados.data_abertura_sessao },
    ].filter(d => d.valor)

    for (let i = 1; i < datas.length; i++) {
      if (new Date(datas[i].valor) < new Date(datas[i-1].valor)) {
        return false
      }
    }
    return true
  }

  const sequenciaValida = validarSequencia()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Cronograma
        </CardTitle>
        <CardDescription>
          Defina as datas do processo licitatório
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!sequenciaValida && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">Atenção: Verifique a sequência das datas</p>
              <p>As datas devem seguir a ordem cronológica do processo.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6">
          {/* Publicação */}
          <div className="space-y-2">
            <Label htmlFor="data_publicacao">Data de Publicação do Edital</Label>
            <DateInputBR
              id="data_publicacao"
              value={dados.data_publicacao_edital}
              onChange={(value) => updateField('data_publicacao_edital', value)}
            />
          </div>

          {/* Impugnação */}
          <div className="space-y-2">
            <Label htmlFor="data_impugnacao">Limite para Impugnações</Label>
            <DateInputBR
              id="data_impugnacao"
              value={dados.data_limite_impugnacao}
              onChange={(value) => updateField('data_limite_impugnacao', value)}
            />
            <p className="text-xs text-muted-foreground">
              Mínimo 3 dias úteis antes da abertura (Art. 164)
            </p>
          </div>

          {/* Início Acolhimento */}
          <div className="space-y-2">
            <Label htmlFor="data_inicio_acolhimento">Início do Acolhimento de Propostas</Label>
            <DateInputBR
              id="data_inicio_acolhimento"
              value={dados.data_inicio_acolhimento}
              onChange={(value) => updateField('data_inicio_acolhimento', value)}
            />
          </div>

          {/* Fim Acolhimento */}
          <div className="space-y-2">
            <Label htmlFor="data_fim_acolhimento">Fim do Acolhimento de Propostas</Label>
            <DateInputBR
              id="data_fim_acolhimento"
              value={dados.data_fim_acolhimento}
              onChange={(value) => updateField('data_fim_acolhimento', value)}
            />
          </div>

          {/* Abertura Sessão */}
          <div className="col-span-2 space-y-2">
            <Label htmlFor="data_abertura" className="text-base">Data/Hora da Sessão Pública *</Label>
            <DateInputBR
              id="data_abertura"
              value={dados.data_abertura_sessao}
              onChange={(value) => updateField('data_abertura_sessao', value)}
              className="max-w-md"
            />
            {dados.data_abertura_sessao && (
              <p className="text-sm font-medium text-blue-600">
                Sessão marcada para: {formatarDataExibicao(dados.data_abertura_sessao)}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Prazo mínimo de 8 dias úteis da publicação para Pregão Eletrônico (Art. 55)
            </p>
          </div>
        </div>

        {/* Timeline Visual */}
        {dados.data_publicacao_edital && dados.data_abertura_sessao && (
          <div className="mt-6 p-4 bg-slate-50 rounded-lg">
            <p className="text-sm font-medium mb-3">Linha do Tempo</p>
            <div className="flex items-center gap-2 text-xs">
              <div className="flex flex-col items-center">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span className="mt-1">Publicação</span>
              </div>
              <div className="flex-1 h-0.5 bg-slate-300"></div>
              {dados.data_limite_impugnacao && (
                <>
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                    <span className="mt-1">Impugnação</span>
                  </div>
                  <div className="flex-1 h-0.5 bg-slate-300"></div>
                </>
              )}
              {dados.data_inicio_acolhimento && (
                <>
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="mt-1">Propostas</span>
                  </div>
                  <div className="flex-1 h-0.5 bg-slate-300"></div>
                </>
              )}
              <div className="flex flex-col items-center">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="mt-1">Sessão</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

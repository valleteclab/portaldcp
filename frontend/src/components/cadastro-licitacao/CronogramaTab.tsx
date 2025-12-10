"use client"

import { useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Calendar, AlertCircle, Wand2, Info } from "lucide-react"
import { DatePickerBR } from "@/components/ui/date-picker-br"
import { Cronograma } from "./types"

// Formata data em horário local (Brasília) sem converter para UTC
const formatarDataLocal = (date: Date): string => {
  const ano = date.getFullYear()
  const mes = String(date.getMonth() + 1).padStart(2, '0')
  const dia = String(date.getDate()).padStart(2, '0')
  const hora = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const seg = String(date.getSeconds()).padStart(2, '0')
  return `${ano}-${mes}-${dia}T${hora}:${min}:${seg}`
}

interface CronogramaTabProps {
  dados: Cronograma
  onChange: (dados: Cronograma) => void
  modalidade?: string
}

// Prazos mínimos por modalidade conforme Lei 14.133/2021
const PRAZOS_LEGAIS: Record<string, {
  publicacaoAteAbertura: number // dias úteis
  impugnacaoAntesAbertura: number // dias úteis
  descricao: string
  artigo: string
}> = {
  PREGAO_ELETRONICO: {
    publicacaoAteAbertura: 8,
    impugnacaoAntesAbertura: 3,
    descricao: 'Pregão Eletrônico',
    artigo: 'Art. 55, §2º'
  },
  PREGAO_PRESENCIAL: {
    publicacaoAteAbertura: 8,
    impugnacaoAntesAbertura: 3,
    descricao: 'Pregão Presencial',
    artigo: 'Art. 55, §2º'
  },
  CONCORRENCIA: {
    publicacaoAteAbertura: 25,
    impugnacaoAntesAbertura: 3,
    descricao: 'Concorrência',
    artigo: 'Art. 55, §1º'
  },
  CONCURSO: {
    publicacaoAteAbertura: 35,
    impugnacaoAntesAbertura: 3,
    descricao: 'Concurso',
    artigo: 'Art. 55, §1º'
  },
  LEILAO: {
    publicacaoAteAbertura: 15,
    impugnacaoAntesAbertura: 3,
    descricao: 'Leilão',
    artigo: 'Art. 55, §1º'
  },
  DIALOGO_COMPETITIVO: {
    publicacaoAteAbertura: 25,
    impugnacaoAntesAbertura: 3,
    descricao: 'Diálogo Competitivo',
    artigo: 'Art. 55, §1º'
  },
  DISPENSA_ELETRONICA: {
    publicacaoAteAbertura: 3,
    impugnacaoAntesAbertura: 1,
    descricao: 'Dispensa Eletrônica',
    artigo: 'Art. 75, §3º'
  },
  INEXIGIBILIDADE: {
    publicacaoAteAbertura: 0,
    impugnacaoAntesAbertura: 0,
    descricao: 'Inexigibilidade',
    artigo: 'Art. 74'
  }
}

// Função para adicionar dias úteis
const adicionarDiasUteis = (data: Date, dias: number): Date => {
  const resultado = new Date(data)
  let diasAdicionados = 0
  
  while (diasAdicionados < dias) {
    resultado.setDate(resultado.getDate() + 1)
    const diaSemana = resultado.getDay()
    // Pula sábado (6) e domingo (0)
    if (diaSemana !== 0 && diaSemana !== 6) {
      diasAdicionados++
    }
  }
  
  return resultado
}

// Função para subtrair dias úteis
const subtrairDiasUteis = (data: Date, dias: number): Date => {
  const resultado = new Date(data)
  let diasSubtraidos = 0
  
  while (diasSubtraidos < dias) {
    resultado.setDate(resultado.getDate() - 1)
    const diaSemana = resultado.getDay()
    if (diaSemana !== 0 && diaSemana !== 6) {
      diasSubtraidos++
    }
  }
  
  return resultado
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

export function CronogramaTab({ dados, onChange, modalidade = 'PREGAO_ELETRONICO' }: CronogramaTabProps) {
  const prazos = PRAZOS_LEGAIS[modalidade] || PRAZOS_LEGAIS.PREGAO_ELETRONICO

  const updateField = (field: keyof Cronograma, value: string) => {
    onChange({ ...dados, [field]: value })
  }

  // Data mínima para publicação: hoje (início do dia)
  const dataMinPublicacao = new Date()
  dataMinPublicacao.setHours(0, 0, 0, 0)

  // Calcula datas sugeridas automaticamente
  const calcularDatasSugeridas = () => {
    const hoje = new Date()
    
    // Data de publicação: HOJE às 09:00 (ou próximo horário comercial)
    const publicacao = new Date(hoje)
    // Se já passou das 18h, usa amanhã
    if (hoje.getHours() >= 18) {
      publicacao.setDate(publicacao.getDate() + 1)
    }
    publicacao.setHours(9, 0, 0, 0)
    
    // Data da sessão: publicação + prazo mínimo da modalidade
    const sessao = adicionarDiasUteis(publicacao, prazos.publicacaoAteAbertura)
    sessao.setHours(9, 0, 0, 0)
    
    // Limite impugnação: sessão - 3 dias úteis
    const impugnacao = subtrairDiasUteis(sessao, prazos.impugnacaoAntesAbertura)
    impugnacao.setHours(18, 0, 0, 0)
    
    // Início acolhimento: dia seguinte à publicação
    const inicioAcolhimento = adicionarDiasUteis(publicacao, 1)
    inicioAcolhimento.setHours(8, 0, 0, 0)
    
    // Fim acolhimento: 1 dia útil antes da sessão
    const fimAcolhimento = subtrairDiasUteis(sessao, 1)
    fimAcolhimento.setHours(18, 0, 0, 0)
    
    onChange({
      ...dados,
      data_publicacao_edital: formatarDataLocal(publicacao),
      data_limite_impugnacao: formatarDataLocal(impugnacao),
      data_inicio_acolhimento: formatarDataLocal(inicioAcolhimento),
      data_fim_acolhimento: formatarDataLocal(fimAcolhimento),
      data_abertura_sessao: formatarDataLocal(sessao)
    })
  }

  // Preenche datas sugeridas automaticamente na primeira vez
  useEffect(() => {
    if (!dados.data_publicacao_edital && !dados.data_abertura_sessao) {
      calcularDatasSugeridas()
    }
  }, [modalidade])

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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Cronograma
            </CardTitle>
            <CardDescription>
              Defina as datas do processo licitatório
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={calcularDatasSugeridas}
            className="gap-2"
          >
            <Wand2 className="h-4 w-4" />
            Recalcular Datas
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Info sobre prazos da modalidade */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
          <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">Prazos para {prazos.descricao} ({prazos.artigo})</p>
            <p>Mínimo de <strong>{prazos.publicacaoAteAbertura} dias úteis</strong> entre publicação e abertura.</p>
            <p>Impugnações até <strong>{prazos.impugnacaoAntesAbertura} dias úteis</strong> antes da abertura.</p>
          </div>
        </div>

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
            <DatePickerBR
              id="data_publicacao"
              value={dados.data_publicacao_edital}
              onChange={(value: string) => updateField('data_publicacao_edital', value)}
              minDate={dataMinPublicacao}
              suggestedTimes={['08:00', '09:00', '10:00', '12:00', '14:00']}
            />
            <p className="text-xs text-muted-foreground">
              A publicação deve ser a partir de hoje
            </p>
          </div>

          {/* Impugnação */}
          <div className="space-y-2">
            <Label htmlFor="data_impugnacao">Limite para Impugnações</Label>
            <DatePickerBR
              id="data_impugnacao"
              value={dados.data_limite_impugnacao}
              onChange={(value: string) => updateField('data_limite_impugnacao', value)}
            />
            <p className="text-xs text-muted-foreground">
              Mínimo {prazos.impugnacaoAntesAbertura} dias úteis antes da abertura (Art. 164)
            </p>
          </div>

          {/* Início Acolhimento */}
          <div className="space-y-2">
            <Label htmlFor="data_inicio_acolhimento">Início do Acolhimento de Propostas</Label>
            <DatePickerBR
              id="data_inicio_acolhimento"
              value={dados.data_inicio_acolhimento}
              onChange={(value: string) => updateField('data_inicio_acolhimento', value)}
            />
          </div>

          {/* Fim Acolhimento */}
          <div className="space-y-2">
            <Label htmlFor="data_fim_acolhimento">Fim do Acolhimento de Propostas</Label>
            <DatePickerBR
              id="data_fim_acolhimento"
              value={dados.data_fim_acolhimento}
              onChange={(value: string) => updateField('data_fim_acolhimento', value)}
            />
          </div>

          {/* Abertura Sessão */}
          <div className="col-span-2 space-y-2">
            <Label htmlFor="data_abertura" className="text-base">Data/Hora da Sessão Pública *</Label>
            <DatePickerBR
              id="data_abertura"
              value={dados.data_abertura_sessao}
              onChange={(value: string) => updateField('data_abertura_sessao', value)}
              className="max-w-md"
            />
            {dados.data_abertura_sessao && (
              <p className="text-sm font-medium text-blue-600">
                Sessão marcada para: {formatarDataExibicao(dados.data_abertura_sessao)}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Prazo mínimo de {prazos.publicacaoAteAbertura} dias úteis da publicação ({prazos.artigo})
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
                <span className="mt-1 text-center">Publicação<br/>{formatarDataExibicao(dados.data_publicacao_edital).split(' ')[0]}</span>
              </div>
              <div className="flex-1 h-0.5 bg-slate-300"></div>
              {dados.data_limite_impugnacao && (
                <>
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                    <span className="mt-1 text-center">Impugnação<br/>{formatarDataExibicao(dados.data_limite_impugnacao).split(' ')[0]}</span>
                  </div>
                  <div className="flex-1 h-0.5 bg-slate-300"></div>
                </>
              )}
              {dados.data_inicio_acolhimento && (
                <>
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="mt-1 text-center">Propostas<br/>{formatarDataExibicao(dados.data_inicio_acolhimento).split(' ')[0]}</span>
                  </div>
                  <div className="flex-1 h-0.5 bg-slate-300"></div>
                </>
              )}
              <div className="flex flex-col items-center">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="mt-1 text-center">Sessão<br/>{formatarDataExibicao(dados.data_abertura_sessao).split(' ')[0]}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

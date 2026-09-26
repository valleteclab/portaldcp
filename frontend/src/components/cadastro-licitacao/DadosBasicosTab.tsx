"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FileText, AlertCircle, Building2, Loader2 } from "lucide-react"
import { DadosBasicos } from "./types"

import { API_URL, authFetch } from '@/lib/api'

interface UnidadeOrgao {
  codigoUnidade: string
  nomeUnidade: string
  ativo?: boolean
}

interface DadosBasicosTabProps {
  dados: DadosBasicos
  onChange: (dados: DadosBasicos) => void
}

export function DadosBasicosTab({ dados, onChange }: DadosBasicosTabProps) {
  const [unidades, setUnidades] = useState<UnidadeOrgao[]>([])
  const [carregandoUnidades, setCarregandoUnidades] = useState(false)

  // Carregar unidades do órgão
  useEffect(() => {
    const carregarUnidades = async () => {
      setCarregandoUnidades(true)
      try {
        // Buscar CNPJ do órgão do localStorage
        const orgaoSalvo = localStorage.getItem('orgao')
        if (orgaoSalvo) {
          const orgao = JSON.parse(orgaoSalvo)
          const cnpj = orgao.cnpj?.replace(/\D/g, '')
          if (cnpj) {
            const res = await authFetch(`${API_URL}/api/pncp/orgaos/${cnpj}/unidades`)
            if (res.ok) {
              const data = await res.json()
              setUnidades(data.unidades || [])
            }
          }
        }
      } catch (e) {
        console.error('Erro ao carregar unidades:', e)
      } finally {
        setCarregandoUnidades(false)
      }
    }
    carregarUnidades()
  }, [])

  const updateField = (field: keyof DadosBasicos, value: string) => {
    onChange({ ...dados, [field]: value })
  }

  const handleUnidadeChange = (codigoUnidade: string) => {
    const unidade = unidades.find(u => u.codigoUnidade === codigoUnidade)
    onChange({
      ...dados,
      codigo_unidade_compradora: codigoUnidade,
      nome_unidade_compradora: unidade?.nomeUnidade || `Unidade ${codigoUnidade}`
    })
  }

  return (
    <div className="space-y-6">
      {/* Peças feitas fora do sistema: "Anexar PDF" em cada peça da fase interna (tela do processo) */}
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
              
              <div className="space-y-2">
                <Label htmlFor="unidade_compradora">Unidade Compradora *</Label>
                {carregandoUnidades ? (
                  <div className="flex items-center gap-2 h-10 px-3 border rounded-md bg-muted/50">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Carregando unidades...</span>
                  </div>
                ) : unidades.length > 0 ? (
                  <Select
                    value={dados.codigo_unidade_compradora || ''}
                    onValueChange={handleUnidadeChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a unidade compradora" />
                    </SelectTrigger>
                    <SelectContent>
                      {unidades.map((unidade) => (
                        <SelectItem key={unidade.codigoUnidade} value={unidade.codigoUnidade}>
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-muted-foreground" />
                            <span>{unidade.codigoUnidade} - {unidade.nomeUnidade}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2 h-10 px-3 border rounded-md bg-amber-50 border-amber-200">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span className="text-sm text-amber-700">Nenhuma unidade cadastrada no PNCP</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Unidade responsável pela compra no PNCP
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
    </div>
  )
}

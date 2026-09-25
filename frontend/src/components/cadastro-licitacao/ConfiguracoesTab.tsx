"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Settings, Users, Eye, EyeOff, AlertCircle } from "lucide-react"
import { Configuracoes } from "./types"
import { API_URL, authFetch } from "@/lib/api"

interface ConfiguracoesTabProps {
  dados: Configuracoes
  onChange: (dados: Configuracoes) => void
}

interface UsuarioDoOrgao {
  id: string
  nome: string
  role?: string
  ativo?: boolean
}

const ROTULO_PAPEL: Record<string, string> = {
  PREGOEIRO: 'Pregoeiro',
  EQUIPE_APOIO: 'Equipe de apoio',
  ADMIN: 'Administrador',
}

const SEM_PREGOEIRO = '__nenhum__'

export function ConfiguracoesTab({ dados, onChange }: ConfiguracoesTabProps) {
  const updateField = (field: keyof Configuracoes, value: any) => {
    onChange({ ...dados, [field]: value })
  }

  // Usuários ativos do órgão (o backend lista só os do órgão do token)
  const [usuarios, setUsuarios] = useState<UsuarioDoOrgao[]>([])
  const [carregandoUsuarios, setCarregandoUsuarios] = useState(true)
  useEffect(() => {
    let ativo = true
    authFetch(`${API_URL}/api/usuarios`)
      .then((r) => (r.ok ? r.json() : []))
      .then((lista: UsuarioDoOrgao[]) => {
        if (!ativo) return
        const ativos = (Array.isArray(lista) ? lista : []).filter((u) => u.ativo !== false)
        ativos.sort((a, b) => (a.role === 'PREGOEIRO' ? 0 : 1) - (b.role === 'PREGOEIRO' ? 0 : 1) || a.nome.localeCompare(b.nome))
        setUsuarios(ativos)
      })
      .catch(() => ativo && setUsuarios([]))
      .finally(() => ativo && setCarregandoUsuarios(false))
    return () => {
      ativo = false
    }
  }, [])
  const pregoeiroForaDaLista = !!dados.pregoeiro_id && !usuarios.some((u) => u.id === dados.pregoeiro_id)

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
                  min={0}
                  value={dados.intervalo_minimo_lances}
                  onChange={(e) => updateField('intervalo_minimo_lances', parseInt(e.target.value) || 0)}
                />
                <span className="text-sm text-muted-foreground">minutos</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Tempo mínimo entre lances do mesmo fornecedor (0 = sem; não é exigência legal)
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
                Lance nos últimos minutos prorroga por este tempo (IN 73 art. 23: 2 min)
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
            Pregoeiro / agente de contratação: um usuário do órgão (quem conduz a sessão)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pregoeiro">Pregoeiro / Agente de Contratação</Label>
            <Select
              value={dados.pregoeiro_id || SEM_PREGOEIRO}
              onValueChange={(v) => updateField('pregoeiro_id', v === SEM_PREGOEIRO ? null : v)}
              disabled={carregandoUsuarios}
            >
              <SelectTrigger id="pregoeiro">
                <SelectValue placeholder={carregandoUsuarios ? 'Carregando usuários...' : 'Selecione o usuário'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_PREGOEIRO}>Não definido</SelectItem>
                {pregoeiroForaDaLista && (
                  <SelectItem value={dados.pregoeiro_id as string}>
                    {dados.pregoeiro_nome_atual || 'Usuário atual'} (inativo)
                  </SelectItem>
                )}
                {usuarios.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nome}{u.role ? ` — ${ROTULO_PAPEL[u.role] || u.role}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!dados.pregoeiro_id && dados.pregoeiro_nome_atual && (
              <p className="text-xs text-amber-700">
                Registrado antes como texto livre: &quot;{dados.pregoeiro_nome_atual}&quot;. Selecione o usuário correspondente.
              </p>
            )}
            {!carregandoUsuarios && usuarios.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum usuário ativo no órgão. Cadastre os usuários em Configurações do órgão.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

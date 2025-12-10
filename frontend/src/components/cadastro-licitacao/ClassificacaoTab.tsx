"use client"

import { useState, useEffect, useRef, useCallback, memo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Scale, FileText, Package, AlertCircle, Loader2, CheckCircle2, Search } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Classificacao, ItemPCA, MODALIDADES, TIPOS_CONTRATACAO, CRITERIOS_JULGAMENTO, MODOS_DISPUTA, MODOS_VINCULACAO_PCA, MODOS_APLICACAO_BENEFICIO_MPE } from "./types"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// Textarea com debounce para evitar re-renders a cada tecla
const DebouncedTextarea = memo(function DebouncedTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  className
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  className?: string
}) {
  const [localValue, setLocalValue] = useState(value)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Sincronizar quando valor externo mudar
  useEffect(() => {
    setLocalValue(value)
  }, [value])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    setLocalValue(newValue)
    
    // Limpar timeout anterior
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    
    // Debounce de 300ms
    timeoutRef.current = setTimeout(() => {
      onChange(newValue)
    }, 300)
  }, [onChange])

  // Cleanup
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return (
    <Textarea
      value={localValue}
      onChange={handleChange}
      placeholder={placeholder}
      rows={rows}
      className={className}
    />
  )
})

interface ClassificacaoTabProps {
  dados: Classificacao
  onChange: (dados: Classificacao) => void
  orgaoId?: string
}

export function ClassificacaoTab({ dados, onChange, orgaoId }: ClassificacaoTabProps) {
  const [itensPca, setItensPca] = useState<ItemPCA[]>([])
  const [loadingPca, setLoadingPca] = useState(false)
  const [showPcaSelector, setShowPcaSelector] = useState(false)
  
  // Filtros do PCA
  const [filtroPcaAno, setFiltroPcaAno] = useState<number>(new Date().getFullYear())
  const [filtroPcaTipo, setFiltroPcaTipo] = useState<string>('TODOS')
  const [filtroPcaBusca, setFiltroPcaBusca] = useState('')

  const updateField = (field: keyof Classificacao, value: any) => {
    onChange({ ...dados, [field]: value })
  }

  // Carregar itens do PCA quando modo é POR_LICITACAO
  const carregarItensPca = async () => {
    if (!orgaoId) return
    setLoadingPca(true)
    try {
      const res = await fetch(`${API_URL}/api/itens/pca/disponiveis/${orgaoId}`)
      if (res.ok) {
        const data = await res.json()
        setItensPca(data)
      }
    } catch (error) {
      console.error('Erro ao carregar itens do PCA:', error)
    } finally {
      setLoadingPca(false)
    }
  }

  // Carregar PCAs quando mudar para modo POR_LICITACAO
  useEffect(() => {
    if (dados.modo_vinculacao_pca === 'POR_LICITACAO' && orgaoId) {
      carregarItensPca()
    }
  }, [dados.modo_vinculacao_pca, orgaoId])

  // Selecionar PCA para a licitação
  const selecionarPca = (itemPca: ItemPCA) => {
    onChange({
      ...dados,
      item_pca_id: itemPca.id,
      item_pca: itemPca,
      sem_pca: false,
      justificativa_sem_pca: undefined
    })
    setShowPcaSelector(false)
  }

  // Remover PCA selecionado
  const removerPca = () => {
    onChange({
      ...dados,
      item_pca_id: undefined,
      item_pca: undefined,
      sem_pca: false,
      justificativa_sem_pca: undefined
    })
  }

  // Filtrar itens do PCA com todos os filtros
  const itensPcaFiltrados = itensPca.filter(item => {
    // Filtro por ano
    if (filtroPcaAno && item.pca?.ano_exercicio !== filtroPcaAno) return false
    // Filtro por tipo (material/serviço)
    if (filtroPcaTipo && filtroPcaTipo !== 'TODOS' && item.categoria !== filtroPcaTipo) return false
    // Filtro por busca (descrição ou categoria)
    if (filtroPcaBusca) {
      const busca = filtroPcaBusca.toLowerCase()
      const matchDescricao = item.descricao_objeto.toLowerCase().includes(busca)
      const matchCategoria = item.nome_classe?.toLowerCase().includes(busca)
      if (!matchDescricao && !matchCategoria) return false
    }
    return true
  })

  // Formatar valor
  const formatarValor = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
  
  // Ícone da categoria
  const getIconeCategoria = (cat?: string) => ({ MATERIAL: '📦', SERVICO: '🔧', OBRA: '🏗️', SOLUCAO_TIC: '💻' }[cat || ''] || '📋')

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
            {/* Switch principal */}
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

            {/* Modo de aplicação do benefício - só aparece se tratamento diferenciado ativo */}
            {dados.tratamento_diferenciado_mpe && (
              <>
                <div className="space-y-2">
                  <Label>Modo de Aplicação do Benefício</Label>
                  <Select 
                    value={dados.modo_beneficio_mpe || 'GERAL'} 
                    onValueChange={(v) => {
                      const updates: any = { modo_beneficio_mpe: v }
                      if (v === 'POR_LOTE') {
                        updates.usa_lotes = true
                      }
                      onChange({ ...dados, ...updates })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o modo de aplicação" />
                    </SelectTrigger>
                    <SelectContent>
                      {MODOS_APLICACAO_BENEFICIO_MPE.map(m => (
                        <SelectItem key={m.value} value={m.value}>
                          <div>
                            <span className="font-medium">{m.label}</span>
                            <span className="text-muted-foreground ml-2">- {m.descricao}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {MODOS_APLICACAO_BENEFICIO_MPE.find(m => m.value === (dados.modo_beneficio_mpe || 'GERAL'))?.exemplo}
                  </p>
                </div>

                {/* Tipo de benefício - só aparece quando modo é GERAL */}
                {(dados.modo_beneficio_mpe === 'GERAL' || !dados.modo_beneficio_mpe) && (
                  <div className="space-y-3 p-4 border rounded-lg bg-orange-50/50 border-orange-200">
                    <Label className="text-base font-medium text-orange-800">Benefício para toda a Licitação</Label>
                    
                    <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-orange-200 cursor-pointer hover:bg-orange-50"
                      onClick={() => onChange({ ...dados, tipo_beneficio_mpe: 'NENHUM', exclusivo_mpe: false, cota_reservada: false })}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full border-2 ${dados.tipo_beneficio_mpe === 'NENHUM' ? 'border-orange-500 bg-orange-500' : 'border-gray-300'}`} />
                        <div>
                          <span className="font-medium">Sem Benefício (Ampla Participação)</span>
                          <p className="text-sm text-muted-foreground">Todos os fornecedores podem participar, sem restrição de porte.</p>
                          <span className="text-xs text-muted-foreground">Participação ampla</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-orange-200 cursor-pointer hover:bg-orange-50"
                      onClick={() => onChange({ ...dados, tipo_beneficio_mpe: 'EXCLUSIVO', exclusivo_mpe: true, cota_reservada: false })}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full border-2 ${dados.tipo_beneficio_mpe === 'EXCLUSIVO' ? 'border-orange-500 bg-orange-500' : 'border-gray-300'}`} />
                        <div>
                          <span className="font-medium">Exclusivo para ME/EPP</span>
                          <p className="text-sm text-muted-foreground">Participação exclusiva para Microempresas e EPPs (até R$ 80.000)</p>
                          <span className="text-xs text-muted-foreground">LC 123/2006, Art. 48, I</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-orange-200 cursor-pointer hover:bg-orange-50"
                      onClick={() => onChange({ ...dados, tipo_beneficio_mpe: 'COTA_RESERVADA', exclusivo_mpe: false, cota_reservada: true })}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full border-2 ${dados.tipo_beneficio_mpe === 'COTA_RESERVADA' ? 'border-orange-500 bg-orange-500' : 'border-gray-300'}`} />
                        <div>
                          <span className="font-medium">Cota Reservada</span>
                          <p className="text-sm text-muted-foreground">Reservar cota de até 25% para ME/EPP</p>
                          {dados.tipo_beneficio_mpe === 'COTA_RESERVADA' && (
                            <div className="flex items-center gap-2 mt-2">
                              <Input 
                                type="number"
                                className="w-20"
                                value={dados.percentual_cota_reservada || 25}
                                onChange={(e) => updateField('percentual_cota_reservada', parseInt(e.target.value) || 0)}
                                min={1}
                                max={25}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <span className="text-sm text-muted-foreground">%</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Aviso quando modo é POR_LOTE ou POR_ITEM */}
                {dados.modo_beneficio_mpe === 'POR_LOTE' && (
                  <div className="p-4 border rounded-lg bg-blue-50 border-blue-200">
                    <p className="text-sm text-blue-700">
                      <strong>Modo Por Lote:</strong> Configure o benefício de cada lote na aba de Lotes.
                    </p>
                  </div>
                )}

                {dados.modo_beneficio_mpe === 'POR_ITEM' && (
                  <div className="p-4 border rounded-lg bg-blue-50 border-blue-200">
                    <p className="text-sm text-blue-700">
                      <strong>Modo Por Item:</strong> Configure o benefício de cada item na aba de Itens.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Vinculação com PCA e Lotes */}
        <div className="border-t pt-6">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Vinculação com PCA (Lei 14.133/2021, Art. 12, VII)
          </h3>
          
          {/* Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm mb-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5" />
              <div>
                <p className="text-blue-700">
                  Lei 14.133/2021, Art. 12, VII: As contratações devem estar vinculadas ao 
                  Plano de Contratações Anual (PCA). A não observância deve ser justificada.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {/* Modo de Vinculação */}
            <div className="space-y-2">
              <Label>Modo de Vinculação ao PCA</Label>
              <Select 
                value={dados.modo_vinculacao_pca || 'POR_ITEM'} 
                onValueChange={(v) => {
                  // Atualizar em uma única chamada para evitar múltiplos re-renders
                  const updates: Partial<Classificacao> = { modo_vinculacao_pca: v as any }
                  
                  // Limpar item_pca quando mudar de POR_LICITACAO para outro modo
                  if (v !== 'POR_LICITACAO') {
                    updates.item_pca = undefined
                    updates.item_pca_id = undefined
                  }
                  
                  if (v === 'POR_LOTE') {
                    updates.usa_lotes = true
                  }
                  onChange({ ...dados, ...updates })
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o modo de vinculação" />
                </SelectTrigger>
                <SelectContent>
                  {MODOS_VINCULACAO_PCA.map(m => (
                    <SelectItem key={m.value} value={m.value}>
                      <div>
                        <span className="font-medium">{m.label}</span>
                        <span className="text-muted-foreground ml-2">- {m.descricao}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {MODOS_VINCULACAO_PCA.find(m => m.value === dados.modo_vinculacao_pca)?.exemplo}
              </p>
            </div>

            {/* Seletor de Classe PCA - quando modo é POR_LICITACAO */}
            {dados.modo_vinculacao_pca === 'POR_LICITACAO' && (
              <div className="space-y-3 p-4 border rounded-lg bg-green-50/50 border-green-200">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base font-medium text-green-800">Classe do PCA para a Licitação</Label>
                    <p className="text-sm text-green-700">
                      Selecione a classe/categoria do PCA que será vinculada a toda a licitação
                    </p>
                  </div>
                  {loadingPca && <Loader2 className="h-4 w-4 animate-spin text-green-600" />}
                </div>

                {/* Classe PCA Selecionada */}
                {dados.item_pca ? (
                  <div className="p-3 bg-white rounded-lg border border-green-300">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <span className="font-medium">{dados.item_pca.descricao_objeto}</span>
                          <Badge variant="outline" className="text-xs">PCA {dados.item_pca.pca?.ano_exercicio}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {getIconeCategoria(dados.item_pca.categoria)} Classe: {dados.item_pca.nome_classe || dados.item_pca.categoria}
                        </p>
                        <p className="text-sm mt-1">
                          Saldo disponível: <span className="font-medium text-green-700">{formatarValor(dados.item_pca.valor_estimado - (dados.item_pca.valor_utilizado || 0))}</span>
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setShowPcaSelector(true)}>
                          Alterar
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={removerPca}>
                          Remover
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <Button 
                    variant="outline" 
                    className="w-full border-green-300 text-green-700 hover:bg-green-100"
                    onClick={() => setShowPcaSelector(true)}
                  >
                    <Search className="h-4 w-4 mr-2" />
                    Selecionar Classe do PCA
                  </Button>
                )}

                {/* Lista de PCAs para seleção com filtros */}
                {showPcaSelector && (
                  <div className="space-y-3 border-t pt-3">
                    {/* Filtros */}
                    <div className="grid grid-cols-3 gap-2">
                      <Select value={String(filtroPcaAno)} onValueChange={(v) => setFiltroPcaAno(Number(v))}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Ano" />
                        </SelectTrigger>
                        <SelectContent>
                          {[2024, 2025, 2026, 2027].map(ano => (
                            <SelectItem key={ano} value={String(ano)}>{ano}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={filtroPcaTipo} onValueChange={setFiltroPcaTipo}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TODOS">Todos</SelectItem>
                          <SelectItem value="MATERIAL">📦 Material</SelectItem>
                          <SelectItem value="SERVICO">🔧 Serviço</SelectItem>
                          <SelectItem value="OBRA">🏗️ Obra</SelectItem>
                          <SelectItem value="SOLUCAO_TIC">💻 TIC</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Buscar..."
                        value={filtroPcaBusca}
                        onChange={(e) => setFiltroPcaBusca(e.target.value)}
                        className="h-9"
                      />
                    </div>
                    
                    {/* Lista de PCAs */}
                    <div className="max-h-[250px] overflow-y-auto space-y-2">
                      {itensPcaFiltrados.length === 0 ? (
                        <div className="text-center py-4 text-muted-foreground">
                          {loadingPca ? 'Carregando...' : 'Nenhum PCA encontrado com esses filtros'}
                        </div>
                      ) : (
                        itensPcaFiltrados.map((itemPca) => {
                          const saldo = itemPca.valor_estimado - (itemPca.valor_utilizado || 0)
                          const pct = (itemPca.valor_utilizado || 0) / itemPca.valor_estimado * 100
                          return (
                            <div 
                              key={itemPca.id}
                              className={`p-3 border rounded-lg cursor-pointer hover:bg-white transition-colors ${
                                dados.item_pca_id === itemPca.id ? 'border-green-500 bg-white' : 'border-gray-200'
                              }`}
                              onClick={() => selecionarPca(itemPca)}
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span>{getIconeCategoria(itemPca.categoria)}</span>
                                    <span className="font-medium text-sm">{itemPca.descricao_objeto}</span>
                                  </div>
                                  <p className="text-xs text-muted-foreground">{itemPca.nome_classe}</p>
                                </div>
                                <div className="text-right">
                                  <Badge variant="outline" className="text-xs mb-1">PCA {itemPca.pca?.ano_exercicio}</Badge>
                                  <p className="font-medium text-sm">{formatarValor(saldo)}</p>
                                  <div className="w-16 h-1 bg-gray-200 rounded-full mt-1">
                                    <div 
                                      className={`h-full rounded-full ${pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                                      style={{ width: `${Math.min(pct, 100)}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setShowPcaSelector(false)}>
                      Cancelar
                    </Button>
                  </div>
                )}

                {/* Opção sem PCA */}
                {!dados.item_pca && !showPcaSelector && (
                  <div className="pt-2 border-t">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="text-yellow-700"
                      onClick={() => updateField('sem_pca', true)}
                    >
                      <AlertCircle className="h-4 w-4 mr-2" />
                      Licitação sem PCA (requer justificativa)
                    </Button>
                  </div>
                )}

                {/* Justificativa sem PCA */}
                {dados.sem_pca && !dados.item_pca && (
                  <div className="space-y-2 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <Label className="text-yellow-800">Justificativa para Licitação sem PCA *</Label>
                    <DebouncedTextarea
                      value={dados.justificativa_sem_pca || ''}
                      onChange={(v) => updateField('justificativa_sem_pca', v)}
                      placeholder="Lei 14.133/2021, Art. 12, §1º: Justifique a não observância do PCA..."
                      rows={3}
                      className="border-yellow-300"
                    />
                    <p className="text-xs text-yellow-700">Mínimo 50 caracteres</p>
                  </div>
                )}
              </div>
            )}

            {/* Usar Lotes */}
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-slate-600" />
                <div>
                  <Label className="text-base">Usar Lotes</Label>
                  <p className="text-sm text-muted-foreground">
                    Lei 14.133/2021, Art. 40, §3º: O parcelamento será adotado quando viável
                  </p>
                </div>
              </div>
              <Switch 
                checked={dados.usa_lotes || false}
                onCheckedChange={(v) => {
                  updateField('usa_lotes', v)
                  // Se ativar lotes e modo não é POR_LOTE, sugerir mudança
                  if (v && dados.modo_vinculacao_pca !== 'POR_LOTE') {
                    // Pode manter o modo atual, lotes funcionam com qualquer modo
                  }
                }}
              />
            </div>

            {/* Justificativa para não parcelamento */}
            {!dados.usa_lotes && (
              <div className="space-y-2">
                <Label>Justificativa para Não Parcelamento</Label>
                <DebouncedTextarea
                  value={dados.justificativa_nao_parcelamento || ''}
                  onChange={(v) => updateField('justificativa_nao_parcelamento', v)}
                  placeholder="Lei 14.133/2021, Art. 40, §3º: Justifique por que o parcelamento não foi adotado..."
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Obrigatório quando o parcelamento não for adotado
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { 
  ArrowLeft, 
  ArrowRight, 
  Check, 
  FileText, 
  Package, 
  Send,
  AlertCircle,
  Info
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface ItemLicitacao {
  id: string
  numero_item: number
  descricao_resumida: string
  quantidade: number
  unidade_medida: string
  valor_unitario_estimado: number
}

interface Licitacao {
  id: string
  numero_processo: string
  objeto: string
  criterio_julgamento: string
  modo_disputa: string
  orgao?: { nome: string }
  data_abertura_sessao?: string
  sigilo_orcamento?: 'PUBLICO' | 'SIGILOSO'
}

const steps = [
  { id: 1, title: "Declaracoes", icon: FileText },
  { id: 2, title: "Itens e Valores", icon: Package },
  { id: 3, title: "Revisao e Envio", icon: Send },
]

export default function CadastrarPropostaPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [licitacao, setLicitacao] = useState<Licitacao | null>(null)
  const [loading, setLoading] = useState(true)

  const parseIsoLocal = (value?: string) => {
    if (!value) return undefined
    const match = value.match(/^\s*(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?\s*$/)
    if (!match) return undefined
    const [, ano, mes, dia, hora, min, seg = '00'] = match
    const date = new Date(
      parseInt(ano),
      parseInt(mes) - 1,
      parseInt(dia),
      parseInt(hora),
      parseInt(min),
      parseInt(seg)
    )
    return isNaN(date.getTime()) ? undefined : date
  }

  const envioEncerrado = () => {
    const abertura = parseIsoLocal(licitacao?.data_abertura_sessao)
    if (!abertura) return false
    return new Date() >= abertura
  }
  
  const [declaracoes, setDeclaracoes] = useState({
    termos: false,
    mpe: false,
    integridade: false,
    inexistenciaFatos: false,
    menor: false,
    reservaCargos: false,
  })

  const [itensPropostos, setItensPropostos] = useState<Array<{
    id: string
    descricao: string
    quantidade: number
    unidade: string
    valorEstimado: number
    valorProposto: number
    marca: string
    modelo: string
  }>>([])

  // Buscar dados da licitação e itens
  useEffect(() => {
    const fetchData = async () => {
      try {
        const fornecedorStr = localStorage.getItem('fornecedor')
        if (fornecedorStr) {
          const fornecedor = JSON.parse(fornecedorStr)
          const resPropostas = await fetch(`${API_URL}/api/propostas/fornecedor/${fornecedor.id}`)
          if (resPropostas.ok) {
            const propostas = await resPropostas.json()
            const existente = propostas.find((p: any) => p.licitacao_id === resolvedParams.id)
            if (existente) {
              router.replace(`/fornecedor/propostas/${existente.id}`)
              return
            }
          }
        }

        // Buscar licitação
        const resLicitacao = await fetch(`${API_URL}/api/licitacoes/${resolvedParams.id}`)
        if (resLicitacao.ok) {
          const dataLicitacao = await resLicitacao.json()
          setLicitacao(dataLicitacao)
        }

        // Buscar itens da licitação
        const resItens = await fetch(`${API_URL}/api/itens/licitacao/${resolvedParams.id}`)
        if (resItens.ok) {
          const dataItens = await resItens.json()
          setItensPropostos(dataItens.map((item: ItemLicitacao) => ({
            id: item.id,
            descricao: item.descricao_resumida,
            quantidade: item.quantidade,
            unidade: item.unidade_medida,
            valorEstimado: item.valor_unitario_estimado,
            valorProposto: 0,
            marca: '',
            modelo: ''
          })))
        }
      } catch (err) {
        console.error('Erro ao buscar dados:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [resolvedParams.id])

  const updateItemValue = (id: string, field: string, value: string | number) => {
    setItensPropostos(prev => prev.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ))
  }

  const calcularTotalProposta = () => {
    return itensPropostos.reduce((total, item) => {
      return total + (item.quantidade * (item.valorProposto || 0))
    }, 0)
  }

  const calcularTotalEstimado = () => {
    return itensPropostos.reduce((total, item) => {
      return total + (item.quantidade * item.valorEstimado)
    }, 0)
  }

  const canProceed = () => {
    if (currentStep === 1) {
      // Integridade é opcional (Art. 60 - apenas contratos acima de R$ 200 milhões)
      return declaracoes.termos && declaracoes.inexistenciaFatos && declaracoes.menor
    }
    if (currentStep === 2) {
      return itensPropostos.length > 0 && itensPropostos.every(item => item.valorProposto > 0)
    }
    return true
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setError(null)
    
    try {
      if (envioEncerrado()) {
        setError('Não é possível enviar proposta após a abertura da sessão')
        setIsSubmitting(false)
        return
      }

      // Buscar fornecedor logado
      const fornecedorStr = localStorage.getItem('fornecedor')
      if (!fornecedorStr) {
        setError('Você precisa estar logado para enviar uma proposta')
        setIsSubmitting(false)
        return
      }
      const fornecedor = JSON.parse(fornecedorStr)

      // Criar proposta
      const propostaData = {
        licitacao_id: resolvedParams.id,
        fornecedor_id: fornecedor.id,
        declaracao_termos: declaracoes.termos,
        declaracao_mpe: declaracoes.mpe,
        declaracao_integridade: declaracoes.integridade,
        declaracao_inexistencia_fatos: declaracoes.inexistenciaFatos,
        declaracao_menor: declaracoes.menor,
        declaracao_reserva_cargos: declaracoes.reservaCargos,
        valor_total_proposta: calcularTotalProposta(),
        itens: itensPropostos.map(item => ({
          item_licitacao_id: item.id,
          valor_unitario: item.valorProposto,
          marca: item.marca || null,
          modelo: item.modelo || null,
        }))
      }

      const res = await fetch(`${API_URL}/api/propostas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(propostaData)
      })

      if (!res.ok) {
        const errorData = await res.json()
        if (res.status === 409 && errorData?.propostaId) {
          router.replace(`/fornecedor/propostas/${errorData.propostaId}`)
          return
        }
        throw new Error(errorData.message || 'Erro ao enviar proposta')
      }

      const proposta = await res.json()

      // Enviar proposta (mudar status de RASCUNHO para ENVIADA)
      await fetch(`${API_URL}/api/propostas/${proposta.id}/enviar`, {
        method: 'PUT'
      })

      alert("Proposta enviada com sucesso!")
      router.push("/fornecedor/propostas")
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar proposta')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Cadastrar Proposta</h1>
          <p className="text-muted-foreground">{licitacao?.numero_processo} - {licitacao?.orgao?.nome}</p>
        </div>
      </div>

      {error && (
        <Alert className="bg-red-50 border-red-200">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">Erro</AlertTitle>
          <AlertDescription className="text-red-700">{error}</AlertDescription>
        </Alert>
      )}

      {envioEncerrado() && (
        <Alert className="bg-yellow-50 border-yellow-200">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-yellow-800">Envio encerrado</AlertTitle>
          <AlertDescription className="text-yellow-700">
            A abertura da sessão já ocorreu. Não é possível enviar uma nova proposta.
          </AlertDescription>
        </Alert>
      )}

      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-4">
          <div className="flex items-center gap-4 text-sm">
            <Badge variant="outline" className="bg-white">Critério: {licitacao?.criterio_julgamento}</Badge>
            <Badge variant="outline" className="bg-white">Modo: {licitacao?.modo_disputa}</Badge>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-center mb-8">
        <div className="flex items-center gap-4">
          {steps.map((step, index) => {
            const Icon = step.icon
            const isActive = currentStep === step.id
            const isCompleted = currentStep > step.id
            
            return (
              <div key={step.id} className="flex items-center">
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${
                  isActive ? 'bg-blue-600 text-white' : 
                  isCompleted ? 'bg-green-600 text-white' : 
                  'bg-slate-200 text-slate-600'
                }`}>
                  {isCompleted ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  <span className="font-medium">{step.title}</span>
                </div>
                {index < steps.length - 1 && (
                  <div className={`w-16 h-1 mx-2 ${
                    isCompleted ? 'bg-green-600' : 'bg-slate-200'
                  }`} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Termos e Declaracoes</CardTitle>
            <CardDescription>Confirme as declaracoes obrigatorias para participar</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Importante</AlertTitle>
              <AlertDescription>
                As declaracoes marcadas com (*) sao obrigatorias conforme Lei 14.133/2021
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <Label className="font-medium">Termo de Aceitacao *</Label>
                  <p className="text-sm text-muted-foreground">
                    Declaro que cumpro e estou ciente de todas as declaracoes contidas no termo de aceitacao.
                  </p>
                </div>
                <Switch 
                  checked={declaracoes.termos} 
                  onCheckedChange={(v) => setDeclaracoes({...declaracoes, termos: v})} 
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <Label className="font-medium">Declaracao ME/EPP</Label>
                  <p className="text-sm text-muted-foreground">
                    Declaro que nao ultrapasso o limite de faturamento e cumpro os requisitos da LC 123/2006.
                  </p>
                </div>
                <Switch 
                  checked={declaracoes.mpe} 
                  onCheckedChange={(v) => setDeclaracoes({...declaracoes, mpe: v})} 
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg bg-gray-50">
                <div className="flex-1">
                  <Label className="font-medium">Programa de Integridade</Label>
                  <p className="text-sm text-muted-foreground">
                    Declaro que desenvolvo programa de integridade conforme Art. 60 da Lei 14.133/2021.
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    Opcional - Exigido apenas para contratos de grande vulto (acima de R$ 200 milhões)
                  </p>
                </div>
                <Switch 
                  checked={declaracoes.integridade} 
                  onCheckedChange={(v) => setDeclaracoes({...declaracoes, integridade: v})} 
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <Label className="font-medium">Inexistencia de Fatos Impeditivos *</Label>
                  <p className="text-sm text-muted-foreground">
                    Declaro a inexistencia de fatos impeditivos para participar desta licitacao.
                  </p>
                </div>
                <Switch 
                  checked={declaracoes.inexistenciaFatos} 
                  onCheckedChange={(v) => setDeclaracoes({...declaracoes, inexistenciaFatos: v})} 
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <Label className="font-medium">Trabalho de Menor *</Label>
                  <p className="text-sm text-muted-foreground">
                    Declaro que nao emprego menor de 18 anos em trabalho noturno, perigoso ou insalubre.
                  </p>
                </div>
                <Switch 
                  checked={declaracoes.menor} 
                  onCheckedChange={(v) => setDeclaracoes({...declaracoes, menor: v})} 
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {currentStep === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Itens da Licitacao</CardTitle>
            <CardDescription>Informe os valores e especificacoes para cada item</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Item</TableHead>
                  <TableHead>Descricao</TableHead>
                  <TableHead className="text-center">Qtd</TableHead>
                  {licitacao?.sigilo_orcamento !== 'SIGILOSO' && (
                    <TableHead className="text-right">Valor Ref.</TableHead>
                  )}
                  <TableHead className="text-right">Seu Valor Unit.</TableHead>
                  <TableHead>Marca/Modelo</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itensPropostos.map((item, index) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium align-top">{index + 1}</TableCell>
                    <TableCell className="max-w-md align-top">
                      <p className="whitespace-pre-wrap break-words">{item.descricao}</p>
                    </TableCell>
                    <TableCell className="text-center align-top">{item.quantidade} {item.unidade}</TableCell>
                    {licitacao?.sigilo_orcamento !== 'SIGILOSO' && (
                      <TableCell className="text-right text-muted-foreground">
                        R$ {item.valorEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        step="0.01"
                        className="w-32 text-right"
                        placeholder="0,00"
                        value={item.valorProposto || ""}
                        onChange={(e) => updateItemValue(item.id, 'valorProposto', parseFloat(e.target.value) || 0)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="w-40"
                        placeholder="Marca / Modelo"
                        value={item.marca}
                        onChange={(e) => updateItemValue(item.id, 'marca', e.target.value)}
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      R$ {(item.quantidade * (item.valorProposto || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-6 flex justify-end">
              <div className="bg-slate-100 p-4 rounded-lg text-right">
                {licitacao?.sigilo_orcamento !== 'SIGILOSO' && (
                  <p className="text-sm text-muted-foreground">Valor Estimado: R$ {calcularTotalEstimado().toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                )}
                <p className="text-xl font-bold text-blue-600">
                  Total da Proposta: R$ {calcularTotalProposta().toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {currentStep === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Revisao da Proposta</CardTitle>
            <CardDescription>Confira os dados antes de enviar</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium mb-2">Declaracoes Aceitas</h3>
                <ul className="space-y-1 text-sm">
                  {declaracoes.termos && <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-600" /> Termo de Aceitacao</li>}
                  {declaracoes.mpe && <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-600" /> ME/EPP</li>}
                  {declaracoes.integridade && <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-600" /> Programa de Integridade</li>}
                  {declaracoes.inexistenciaFatos && <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-600" /> Inexistencia de Fatos</li>}
                  {declaracoes.menor && <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-600" /> Trabalho de Menor</li>}
                </ul>
              </div>
              <div>
                <h3 className="font-medium mb-2">Resumo Financeiro</h3>
                <div className="space-y-2 text-sm">
                  <p>Itens cotados: {itensPropostos.filter(i => i.valorProposto > 0).length} de {itensPropostos.length}</p>
                  <p>Valor Estimado: R$ {calcularTotalEstimado().toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  <p className="text-lg font-bold text-blue-600">
                    Total: R$ {calcularTotalProposta().toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>

            <Alert className="bg-blue-50 border-blue-200">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertTitle className="text-blue-800">Informação</AlertTitle>
              <AlertDescription className="text-blue-700">
                Você poderá alterar sua proposta até a abertura da sessão.
                Após a abertura da sessão, alterações só serão permitidas se solicitadas pelo pregoeiro 
                (ex: adequação de preços após fase de lances).
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button 
          variant="outline" 
          onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))} 
          disabled={currentStep === 1 || envioEncerrado()}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>

        {currentStep < 3 ? (
          <Button 
            onClick={() => setCurrentStep(prev => Math.min(3, prev + 1))} 
            disabled={!canProceed() || envioEncerrado()}
          >
            Próximo <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button 
            onClick={handleSubmit} 
            disabled={!canProceed() || isSubmitting || envioEncerrado()}
            className="bg-green-600 hover:bg-green-700"
          >
            <Send className="mr-2 h-4 w-4" /> {isSubmitting ? 'Enviando...' : 'Enviar Proposta'}
          </Button>
        )}
      </div>
    </div>
  )
}

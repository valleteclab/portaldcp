"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { 
  ArrowLeft,
  Play,
  Users,
  Clock,
  FileText,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Gavel,
  Settings,
  Loader2
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface DadosSessao {
  licitacao: {
    id: string
    numero: string
    numeroProcesso: string
    objeto: string
    modalidade: string
    criterioJulgamento: string
    modoDisputa: string
    valorEstimado: number
    dataAbertura: string
    fase: string
    pregoeiroNome: string
    pregoeiroId: string
    orgao: {
      id: string
      nome: string
      cnpj: string
    } | null
  }
  verificacoes: {
    faseInternaOk: boolean
    faseInternaMsg: string
    editalPublicado: boolean
    editalPublicadoMsg: string
    prazoImpugnacao: boolean
    prazoImpugnacaoMsg: string
    propostasRecebidas: boolean
    propostasRecebidasMsg: string
    quantidadePropostas: number
    podeIniciar: boolean
  }
  propostas: Array<{
    id: string
    fornecedorId: string
    fornecedorAnonimo: string
    fornecedorNome: string
    cnpj: string
    valorTotal: number
    status: string
    dataEnvio: string
  }>
  itens: Array<{
    id: string
    numero: number
    descricao: string
    quantidade: number
    unidade: string
    valorReferencia: number
    valorTotal: number
  }>
  configuracaoPadrao: {
    modoDisputa: string
    tempoInatividade: number
    tempoAleatorioMin: number
    tempoAleatorioMax: number
    intervaloMinLances: number
    decrementoMinimo: number
  }
  sessaoExistente: any | null
}

export default function IniciarSessaoPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const licitacaoId = resolvedParams.id

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dados, setDados] = useState<DadosSessao | null>(null)
  const [iniciando, setIniciando] = useState(false)

  const [configuracao, setConfiguracao] = useState({
    modoDisputa: 'ABERTO',
    tempoInatividade: 180,
    tempoAleatorioMin: 2,
    tempoAleatorioMax: 30,
    intervaloMinLances: 3,
    decrementoMinimo: 0.5,
  })

  // Carregar dados da sessão
  useEffect(() => {
    const carregarDados = async () => {
      try {
        setLoading(true)
        const response = await fetch(`${API_URL}/api/sessao/licitacao/${licitacaoId}/preparar`)
        
        if (!response.ok) {
          throw new Error('Erro ao carregar dados da sessão')
        }
        
        const data: DadosSessao = await response.json()
        setDados(data)
        
        // Atualiza configuração com valores padrão
        if (data.configuracaoPadrao) {
          setConfiguracao(data.configuracaoPadrao)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido')
      } finally {
        setLoading(false)
      }
    }

    carregarDados()
  }, [licitacaoId])

  const propostasValidas = dados?.propostas.filter(p => p.status === 'ENVIADA' || p.status === 'VALIDA') || []

  const iniciarSessao = async () => {
    if (!dados?.licitacao.pregoeiroNome) {
      alert('Pregoeiro não definido na licitação')
      return
    }

    try {
      setIniciando(true)
      
      // Criar sessão no backend
      const response = await fetch(`${API_URL}/api/sessao/${licitacaoId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pregoeiroId: dados.licitacao.pregoeiroId || 'pregoeiro-1',
          pregoeiroNome: dados.licitacao.pregoeiroNome,
          configuracao,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Erro ao criar sessão')
      }

      const sessao = await response.json()
      
      // Iniciar a sessão
      await fetch(`${API_URL}/api/sessao/${sessao.id}/iniciar`, {
        method: 'PUT',
      })

      // Redirecionar para a sala de disputa
      router.push(`/orgao/licitacoes/${licitacaoId}/sala`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao iniciar sessão')
    } finally {
      setIniciando(false)
    }
  }

  // Se já existe sessão ativa, redirecionar
  const irParaSala = () => {
    router.push(`/orgao/licitacoes/${licitacaoId}/sala`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2">Carregando dados da sessão...</span>
      </div>
    )
  }

  if (error || !dados) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <XCircle className="h-12 w-12 text-red-500" />
        <p className="text-red-600">{error || 'Erro ao carregar dados'}</p>
        <Button variant="outline" onClick={() => router.back()}>
          Voltar
        </Button>
      </div>
    )
  }

  const { licitacao, verificacoes, propostas, itens } = dados

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Iniciar Sessao Publica</h1>
            <p className="text-muted-foreground">{licitacao.numero} - {licitacao.objeto}</p>
          </div>
        </div>
      </div>

      {/* Sessão existente */}
      {dados.sessaoExistente && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-6 w-6 text-blue-600" />
                <div>
                  <p className="font-medium text-blue-900">Sessão já iniciada</p>
                  <p className="text-sm text-blue-700">
                    Status: {dados.sessaoExistente.status} | Etapa: {dados.sessaoExistente.etapa}
                  </p>
                </div>
              </div>
              <Button onClick={irParaSala}>
                <Play className="mr-2 h-4 w-4" />
                Entrar na Sala
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Verificacoes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {verificacoes.podeIniciar ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : (
              <AlertCircle className="h-5 w-5 text-yellow-600" />
            )}
            Verificações Pré-Sessão
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className={`flex items-center gap-3 p-3 rounded-lg ${
              verificacoes.faseInternaOk ? 'bg-green-50' : 'bg-red-50'
            }`}>
              {verificacoes.faseInternaOk ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              <div>
                <p className="font-medium">Fase Interna</p>
                <p className="text-sm text-muted-foreground">{verificacoes.faseInternaMsg}</p>
              </div>
            </div>
            <div className={`flex items-center gap-3 p-3 rounded-lg ${
              verificacoes.editalPublicado ? 'bg-green-50' : 'bg-red-50'
            }`}>
              {verificacoes.editalPublicado ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              <div>
                <p className="font-medium">Edital Publicado</p>
                <p className="text-sm text-muted-foreground">{verificacoes.editalPublicadoMsg}</p>
              </div>
            </div>
            <div className={`flex items-center gap-3 p-3 rounded-lg ${
              verificacoes.prazoImpugnacao ? 'bg-green-50' : 'bg-yellow-50'
            }`}>
              {verificacoes.prazoImpugnacao ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <Clock className="h-5 w-5 text-yellow-600" />
              )}
              <div>
                <p className="font-medium">Prazo de Impugnação</p>
                <p className="text-sm text-muted-foreground">{verificacoes.prazoImpugnacaoMsg}</p>
              </div>
            </div>
            <div className={`flex items-center gap-3 p-3 rounded-lg ${
              verificacoes.propostasRecebidas ? 'bg-green-50' : 'bg-red-50'
            }`}>
              {verificacoes.propostasRecebidas ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              <div>
                <p className="font-medium">Propostas Recebidas</p>
                <p className="text-sm text-muted-foreground">{verificacoes.propostasRecebidasMsg}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        {/* Propostas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Propostas Recebidas ({propostas.length})
            </CardTitle>
            <CardDescription>{propostasValidas.length} propostas validas para disputa</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {propostas.map((proposta) => (
                  <TableRow key={proposta.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{proposta.fornecedorAnonimo}</p>
                        <p className="text-xs text-muted-foreground">
                          {proposta.cnpj ? `***.***.***/${proposta.cnpj.slice(-7)}` : '-'}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      R$ {proposta.valorTotal.toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell>
                      <Badge className={
                        proposta.status === 'ENVIADA' || proposta.status === 'VALIDA' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }>
                        {proposta.status === 'ENVIADA' || proposta.status === 'VALIDA' ? 'Válida' : proposta.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Itens */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Itens da Licitacao ({itens.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Descricao</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Valor Ref.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Badge variant="outline">{item.numero}</Badge>
                    </TableCell>
                    <TableCell>{item.descricao}</TableCell>
                    <TableCell className="text-right">{item.quantidade}</TableCell>
                    <TableCell className="text-right font-mono">
                      R$ {item.valorReferencia.toLocaleString('pt-BR')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Configuracao da Sessao */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configuracao da Sessao
          </CardTitle>
          <CardDescription>Parametros conforme Lei 14.133/2021 e IN SEGES/ME</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label>Modo de Disputa</Label>
              <Select 
                value={configuracao.modoDisputa} 
                onValueChange={(v) => setConfiguracao(c => ({...c, modoDisputa: v}))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ABERTO">Aberto (Art. 56, I)</SelectItem>
                  <SelectItem value="FECHADO">Fechado (Art. 56, II)</SelectItem>
                  <SelectItem value="ABERTO_FECHADO">Aberto e Fechado (Art. 56, III)</SelectItem>
                  <SelectItem value="FECHADO_ABERTO">Fechado e Aberto (Art. 56, IV)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tempo de Inatividade (segundos)</Label>
              <Input 
                type="number" 
                value={configuracao.tempoInatividade}
                onChange={(e) => setConfiguracao(c => ({...c, tempoInatividade: parseInt(e.target.value)}))}
              />
              <p className="text-xs text-muted-foreground">Tempo sem lances para iniciar encerramento</p>
            </div>

            <div className="space-y-2">
              <Label>Intervalo Minimo entre Lances (segundos)</Label>
              <Input 
                type="number" 
                value={configuracao.intervaloMinLances}
                onChange={(e) => setConfiguracao(c => ({...c, intervaloMinLances: parseInt(e.target.value)}))}
              />
            </div>

            <div className="space-y-2">
              <Label>Tempo Aleatorio Minimo (minutos)</Label>
              <Input 
                type="number" 
                value={configuracao.tempoAleatorioMin}
                onChange={(e) => setConfiguracao(c => ({...c, tempoAleatorioMin: parseInt(e.target.value)}))}
              />
            </div>

            <div className="space-y-2">
              <Label>Tempo Aleatorio Maximo (minutos)</Label>
              <Input 
                type="number" 
                value={configuracao.tempoAleatorioMax}
                onChange={(e) => setConfiguracao(c => ({...c, tempoAleatorioMax: parseInt(e.target.value)}))}
              />
            </div>

            <div className="space-y-2">
              <Label>Decremento Minimo (%)</Label>
              <Input 
                type="number" 
                step="0.1"
                value={configuracao.decrementoMinimo}
                onChange={(e) => setConfiguracao(c => ({...c, decrementoMinimo: parseFloat(e.target.value)}))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pregoeiro */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5" />
            Pregoeiro Responsável
          </CardTitle>
        </CardHeader>
        <CardContent>
          {licitacao.pregoeiroNome ? (
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-xl font-bold text-blue-600">
                  {licitacao.pregoeiroNome.split(' ').map((n: string) => n[0]).join('')}
                </span>
              </div>
              <div>
                <p className="font-medium">{licitacao.pregoeiroNome}</p>
                <p className="text-sm text-muted-foreground">Pregoeiro(a) Oficial</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="font-medium text-yellow-800">Pregoeiro não definido</p>
                <p className="text-sm text-yellow-600">
                  Defina o pregoeiro na aba "Configuração" da licitação antes de iniciar a sessão.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ações */}
      {!dados.sessaoExistente && (
        <Card className={verificacoes.podeIniciar ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {verificacoes.podeIniciar ? (
                  <CheckCircle2 className="h-6 w-6 text-blue-600" />
                ) : (
                  <AlertCircle className="h-6 w-6 text-gray-400" />
                )}
                <div>
                  <p className={`font-medium ${verificacoes.podeIniciar ? 'text-blue-900' : 'text-gray-600'}`}>
                    {verificacoes.podeIniciar 
                      ? 'Pronto para iniciar a sessão' 
                      : 'Não é possível iniciar a sessão'}
                  </p>
                  <p className={`text-sm ${verificacoes.podeIniciar ? 'text-blue-700' : 'text-gray-500'}`}>
                    {verificacoes.podeIniciar 
                      ? 'Ao iniciar, todos os fornecedores serão notificados e poderão acessar a sala de disputa.'
                      : 'Verifique os requisitos acima antes de iniciar.'}
                  </p>
                </div>
              </div>
              <Button 
                size="lg" 
                onClick={iniciarSessao}
                disabled={!verificacoes.podeIniciar || !licitacao.pregoeiroNome || iniciando}
              >
                {iniciando ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Iniciando...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-5 w-5" />
                    Iniciar Sessão Pública
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

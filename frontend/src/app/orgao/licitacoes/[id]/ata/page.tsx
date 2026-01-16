"use client"

import { useState, useEffect, use, useRef } from "react"
import { useRouter } from "next/navigation"
import { 
  ArrowLeft,
  FileText,
  Printer,
  Users,
  Gavel,
  Clock,
  TrendingDown,
  Loader2,
  AlertCircle
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { API_URL, authFetch } from '@/lib/api'

interface AtaData {
  sessao: {
    id: string
    status: string
    etapa: string
    pregoeiro: string
    data_inicio: string
    data_encerramento: string
    tempo_inatividade_minutos: number
    tempo_aleatorio_max_minutos: number
  }
  licitacao: {
    id: string
    numero_edital: string
    numero_processo: string
    objeto: string
    modalidade: string
  }
  participantes: Array<{
    id: string
    nome: string
    cnpj: string
    porte: string
  }>
  itens: Array<{
    id: string
    numero: number
    descricao: string
    quantidade: number
    unidade: string
    valor_estimado: number
    total_lances: number
    melhor_lance: {
      valor: number
      fornecedor: string
      cnpj: string
      data_hora: string
    } | null
    economia: number
  }>
  lances: Array<{
    id: string
    item_id: string
    valor: number
    fornecedor: string
    cnpj: string
    data_hora: string
  }>
  mensagens: Array<{
    id: string
    tipo: string
    remetente: string
    mensagem: string
    data_hora: string
  }>
  eventos: Array<{
    id: string
    tipo: string
    descricao: string
    data_hora: string
    usuario: string
    item_id: string
    fornecedor_id: string
    valor: number
  }>
  resumo: {
    total_itens: number
    total_lances: number
    total_participantes: number
    total_mensagens: number
    valor_estimado: number
    valor_adjudicado: number
    economia: number
    percentual_economia: string
  }
}

export default function AtaSessaoPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const licitacaoId = resolvedParams.id
  const printRef = useRef<HTMLDivElement>(null)

  const [ata, setAta] = useState<AtaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    carregarAta()
  }, [licitacaoId])

  const carregarAta = async () => {
    try {
      // Primeiro buscar a sessão da licitação
      const resSessao = await authFetch(`${API_URL}/api/sessao/licitacao/${licitacaoId}`)
      if (!resSessao.ok) {
        throw new Error('Sessão não encontrada para esta licitação')
      }
      const sessao = await resSessao.json()

      // Depois buscar a ata
      const resAta = await authFetch(`${API_URL}/api/sessao/${sessao.id}/ata`)
      if (!resAta.ok) {
        throw new Error('Erro ao carregar dados da ata')
      }
      setAta(await resAta.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  const formatarMoeda = (valor: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0)
  }

  const imprimirAta = () => {
    window.print()
  }

  const getTipoEventoLabel = (tipo: string) => {
    const map: Record<string, string> = {
      SESSAO_INICIADA: 'Sessão Iniciada',
      SESSAO_SUSPENSA: 'Sessão Suspensa',
      SESSAO_RETOMADA: 'Sessão Retomada',
      SESSAO_ENCERRADA: 'Sessão Encerrada',
      LANCE_REGISTRADO: 'Lance Registrado',
      DISPUTA_INICIADA: 'Disputa Iniciada',
      DISPUTA_ITEM_INICIADA: 'Item em Disputa',
      DISPUTA_ITEM_ENCERRADA: 'Item Encerrado',
      DISPUTA_ENCERRADA: 'Disputa Encerrada',
      MENSAGEM_PREGOEIRO: 'Mensagem do Pregoeiro',
      MENSAGEM_SISTEMA: 'Sistema',
    }
    return map[tipo] || tipo
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2">Carregando ata da sessão...</span>
      </div>
    )
  }

  if (error || !ata) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <p className="text-red-600">{error || 'Erro ao carregar ata'}</p>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header - não imprime */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Ata da Sessão Pública</h1>
            <p className="text-muted-foreground">{ata.licitacao.numero_edital} - {ata.licitacao.objeto?.substring(0, 60)}...</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={imprimirAta}>
            <Printer className="mr-2 h-4 w-4" /> Imprimir
          </Button>
        </div>
      </div>

      {/* Conteúdo da Ata - imprime */}
      <div ref={printRef} className="print:p-8">
        {/* Cabeçalho da Ata */}
        <div className="text-center mb-8 print:mb-6">
          <h1 className="text-2xl font-bold mb-2 print:text-xl">ATA DA SESSÃO PÚBLICA</h1>
          <h2 className="text-lg font-semibold text-slate-700 print:text-base">
            {ata.licitacao.modalidade?.replace('_', ' ')} Nº {ata.licitacao.numero_edital}
          </h2>
          <p className="text-sm text-muted-foreground">
            Processo Administrativo nº {ata.licitacao.numero_processo}
          </p>
        </div>


        {/* Informações da Sessão */}
        <Card className="mb-6 print:shadow-none print:border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" /> Dados da Sessão
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Pregoeiro(a)</p>
                <p className="font-medium">{ata.sessao.pregoeiro}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <p className="font-medium">{ata.sessao.status}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Etapa</p>
                <p className="font-medium">{ata.sessao.etapa}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Início</p>
                <p className="font-medium">{ata.sessao.data_inicio ? new Date(ata.sessao.data_inicio).toLocaleString('pt-BR') : '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Encerramento</p>
                <p className="font-medium">{ata.sessao.data_encerramento ? new Date(ata.sessao.data_encerramento).toLocaleString('pt-BR') : 'Em andamento'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Objeto */}
        <Card className="mb-6 print:shadow-none print:border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" /> Objeto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{ata.licitacao.objeto}</p>
            <div className="mt-4 flex gap-4">
              <Badge variant="outline">
                Valor Estimado: {formatarMoeda(ata.resumo.valor_estimado)}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Participantes */}
        <Card className="mb-6 print:shadow-none print:border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" /> Participantes ({ata.participantes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Porte</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ata.participantes.map((p, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell>{p.cnpj || '-'}</TableCell>
                    <TableCell>{p.porte || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Resultado por Item */}
        <Card className="mb-6 print:shadow-none print:border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Gavel className="h-5 w-5" /> Resultado por Item
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Item</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-center">Qtd</TableHead>
                  <TableHead className="text-right">Valor Est.</TableHead>
                  <TableHead>Vencedor</TableHead>
                  <TableHead className="text-right">Valor Final</TableHead>
                  <TableHead className="text-right">Economia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ata.itens.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Badge variant="outline">{item.numero}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{item.descricao}</TableCell>
                    <TableCell className="text-center">{item.quantidade} {item.unidade}</TableCell>
                    <TableCell className="text-right">{formatarMoeda(item.valor_estimado)}</TableCell>
                    <TableCell>
                      {item.melhor_lance ? (
                        <span className="text-green-700 font-medium">{item.melhor_lance.fornecedor}</span>
                      ) : (
                        <span className="text-gray-400">Sem lances</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {item.melhor_lance ? formatarMoeda(Number(item.melhor_lance.valor)) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.economia > 0 ? (
                        <Badge className="bg-green-100 text-green-800">
                          {((item.economia / item.valor_estimado) * 100).toFixed(1)}%
                        </Badge>
                      ) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Resumo Final */}
        <Card className="mb-6 print:shadow-none print:border bg-slate-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-green-600" /> Resumo da Sessão
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-6">
              <div className="text-center p-4 bg-white rounded-lg">
                <p className="text-3xl font-bold text-blue-600">{ata.resumo.total_itens}</p>
                <p className="text-sm text-muted-foreground">Total de Itens</p>
              </div>
              <div className="text-center p-4 bg-white rounded-lg">
                <p className="text-3xl font-bold text-green-600">{ata.resumo.total_participantes}</p>
                <p className="text-sm text-muted-foreground">Participantes</p>
              </div>
              <div className="text-center p-4 bg-white rounded-lg">
                <p className="text-3xl font-bold text-purple-600">{ata.resumo.total_lances}</p>
                <p className="text-sm text-muted-foreground">Total de Lances</p>
              </div>
              <div className="text-center p-4 bg-white rounded-lg">
                <p className="text-3xl font-bold text-emerald-600">{ata.resumo.percentual_economia}%</p>
                <p className="text-sm text-muted-foreground">Economia Total</p>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-4 p-4 bg-white rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Valor Total Estimado</p>
                <p className="text-xl font-bold">{formatarMoeda(ata.resumo.valor_estimado)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Valor Total Adjudicado</p>
                <p className="text-xl font-bold text-green-600">{formatarMoeda(ata.resumo.valor_adjudicado)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Histórico de Eventos - apenas na versão digital */}
        <div className="print:hidden">
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5" /> Histórico de Eventos ({ata.eventos.length})
              </CardTitle>
              <CardDescription>Registro cronológico de todas as ações da sessão</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">Horário</TableHead>
                      <TableHead className="w-40">Tipo</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-32">Usuário</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ata.eventos.map((evento, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs">{new Date(evento.data_hora).toLocaleString('pt-BR')}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {getTipoEventoLabel(evento.tipo)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{evento.descricao}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{evento.usuario || 'Sistema'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Rodapé da Ata */}
        <div className="mt-8 pt-6 border-t text-center text-sm text-muted-foreground">
          <p>Ata gerada eletronicamente pelo Sistema de Licitações</p>
          <p>Conforme Art. 17, §2º da Lei 14.133/2021</p>
          <p className="mt-2">Data de geração: {new Date().toLocaleString('pt-BR')}</p>
        </div>
      </div>
    </div>
  )
}

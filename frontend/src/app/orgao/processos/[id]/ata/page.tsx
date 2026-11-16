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
    valor_total_estimado?: number
    status?: string
    vencedor?: { fornecedor: string; valor_total: number | null; valor_unitario: number | null; economia: number | null } | null
  }>
  julgamento?: {
    aceitacoes: Array<{ unidade: string; fornecedor: string | null; status: string; convocada_em: string; enviada_em: string | null; valor_total_readequado: number | string | null; decidida_em: string | null; decisao_motivo: string | null; justificativa_exequibilidade: string | null }>
    desempates: Array<{ unidade: string; status: string; motivo: string | null; melhor: string | null; melhor_valor: number | string | null; vencedor: string | null; valor_vencedor: number | string | null }>
    habilitacoes: Array<{ fornecedor: string | null; status: string; convocada_em: string | null; enviada_em: string | null; decidida_em: string | null; decisao_motivo: string | null; inabilitacoes_unidade: Array<{ rotulo: string; motivo: string; em: string }> | null }>
    diligencias: Array<{ fornecedor: string | null; unidade_rotulo: string | null; pedido: string; aberta_em: string; resposta: string | null; respondida_em: string | null; resultado: string | null; resultado_motivo: string | null; encerrada_em: string | null }>
    janelas_recurso: Array<{ aberta_em: string; fecha_em: string; minutos: number; momento: string; aberta_por_nome: string | null; superada_em: string | null }>
    recursos: Array<{ recorrente: string | null; status: string; ato_recorrido: string | null; motivacao_intencao: string | null; data_intencao: string | null; data_decisao: string | null; decisao: string | null; instancia_decisao: string | null }>
    formalizacoes: Array<{ tipo: string; status: string; autoridade_nome: string; autoridade_cargo: string; operador_nome: string; valor_total: number | string | null; created_at: string }>
  }
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

/** Data e hora no horário de Brasília (a ata não pode depender do fuso do computador de quem abre). */
const dataHora = (v?: string | null) =>
  v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'
const ROTULO_ACEITACAO: Record<string, string> = { AGUARDANDO_ENVIO: 'Aguardando a proposta', ENVIADA: 'Proposta enviada', ACEITA: 'Aceita', RECUSADA: 'Recusada', CANCELADA: 'Cancelada' }
const ROTULO_HAB: Record<string, string> = { AGUARDANDO_ENVIO: 'Aguardando documentos', ENVIADA: 'Em análise', EM_DILIGENCIA: 'Em diligência', HABILITADO: 'Habilitado', INABILITADO: 'Inabilitado' }
const ROTULO_RECURSO: Record<string, string> = { INTENCAO: 'Intenção registrada', AGUARDANDO_RAZOES: 'Aguardando razões', CONTRARRAZOES: 'Prazo de contrarrazões', EM_ANALISE: 'Em reconsideração', AGUARDANDO_AUTORIDADE: 'Com a autoridade superior', PROVIDO: 'Provido', IMPROVIDO: 'Não provido', NAO_CONHECIDO: 'Não conhecido' }
const ROTULO_ATO: Record<string, string> = { INABILITACAO: 'a própria inabilitação', RECUSA_PROPOSTA: 'a recusa da própria proposta', DESCLASSIFICACAO: 'a própria desclassificação', HABILITACAO_TERCEIRO: 'a habilitação de outro licitante', ACEITACAO_TERCEIRO: 'a aceitação da proposta de outro licitante', OUTRO: 'outro ato' }
const ROTULO_FORMALIZACAO: Record<string, string> = { ADJUDICACAO: 'Adjudicação', HOMOLOGACAO: 'Homologação', ADJUDICACAO_HOMOLOGACAO: 'Adjudicação e homologação' }

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
      MENSAGEM_FORNECEDOR: 'Mensagem do Licitante',
      MENSAGEM_SISTEMA: 'Sistema',
      PROPOSTA_RECEBIDA: 'Proposta Recebida',
      PROPOSTA_CLASSIFICADA: 'Proposta Classificada',
      PROPOSTA_DESCLASSIFICADA: 'Proposta Desclassificada',
      PROPOSTA_RECUSADA: 'Proposta Recusada',
      ACEITACAO_CONVOCADA: 'Convocação para Aceitação',
      ACEITACAO_PRORROGACAO_SOLICITADA: 'Pedido de Prorrogação',
      ACEITACAO_PRAZO_PRORROGADO: 'Prazo Prorrogado',
      PROPOSTA_ADEQUADA_ENVIADA: 'Proposta Adequada Enviada',
      PROPOSTA_ACEITA: 'Proposta Aceita',
      UNIDADE_FRACASSADA: 'Item Fracassado',
      LANCE_CANCELADO: 'Lance Cancelado',
      LANCE_RECUSADO: 'Lance Recusado',
      TEMPO_ALEATORIO_INICIADO: 'Tempo Aleatório',
      PRORROGACAO_AUTOMATICA: 'Prorrogação Automática',
      NEGOCIACAO_INICIADA: 'Negociação Iniciada',
      NEGOCIACAO_PROPOSTA: 'Proposta na Negociação',
      NEGOCIACAO_ACEITA: 'Negociação Aceita',
      NEGOCIACAO_RECUSADA: 'Negociação Recusada',
      NEGOCIACAO_ENCERRADA: 'Negociação Encerrada',
      NEGOCIACAO_MENSAGEM: 'Mensagem da Negociação',
      CONVOCACAO_HABILITACAO: 'Convocação para Habilitação',
      DOCUMENTO_HABILITACAO_ENVIADO: 'Documentos de Habilitação Enviados',
      HABILITACAO_APROVADA: 'Habilitado',
      HABILITACAO_REPROVADA: 'Inabilitado',
      BENEFICIO_MPE_APLICADO: 'Benefício ME/EPP',
      EMPATE_FICTO_DETECTADO: 'Empate Ficto ME/EPP',
      LANCE_MPE_SOLICITADO: 'Convocação ME/EPP',
      LANCE_MPE_REGISTRADO: 'Oferta ME/EPP Registrada',
      LANCE_MPE_NAO_REGISTRADO: 'ME/EPP Não Ofertou',
      INTENCAO_RECURSO_REGISTRADA: 'Intenção de Recurso',
      INTENCAO_RECURSO_ACEITA: 'Intenção de Recurso Aceita',
      INTENCAO_RECURSO_RECUSADA: 'Intenção de Recurso Recusada',
      PRAZO_RECURSAL_INICIADO: 'Prazo Recursal',
      RECURSO_REGISTRADO: 'Recurso Registrado',
      CONTRARRAZOES_REGISTRADAS: 'Contrarrazões',
      RECURSO_PROVIDO: 'Recurso Provido',
      RECURSO_IMPROVIDO: 'Recurso Não Provido',
      ITEM_ADJUDICADO: 'Item Adjudicado',
      LICITACAO_ADJUDICADA: 'Adjudicação',
      LICITACAO_HOMOLOGADA: 'Homologação',
      DILIGENCIA_SOLICITADA: 'Diligência Solicitada',
      DILIGENCIA_RESPONDIDA: 'Diligência Respondida',
      ESCLARECIMENTO_SOLICITADO: 'Esclarecimento Solicitado',
      ESCLARECIMENTO_RESPONDIDO: 'Esclarecimento Respondido',
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
            <p className="text-muted-foreground">{ata.licitacao.numero_processo} - {ata.licitacao.objeto?.substring(0, 60)}...</p>
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
            {ata.licitacao.modalidade?.replace(/_/g, ' ')}{ata.licitacao.numero_edital ? ` Nº ${ata.licitacao.numero_edital}` : ''}
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
                <p className="font-medium">{dataHora(ata.sessao.data_inicio)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Encerramento</p>
                <p className="font-medium">{ata.sessao.data_encerramento ? dataHora(ata.sessao.data_encerramento) : 'Em andamento'}</p>
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
            <Table className="table-fixed">
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
                  <TableHead className="w-24 text-center">Qtd</TableHead>
                  <TableHead className="w-28 text-right">Estimado (total)</TableHead>
                  <TableHead>Vencedor</TableHead>
                  <TableHead className="w-28 text-right">Valor Final</TableHead>
                  <TableHead className="w-24 text-right">Economia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ata.itens.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Badge variant="outline">{item.numero}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-normal break-words">{item.descricao}</TableCell>
                    <TableCell className="text-center">{Number(item.quantidade).toLocaleString('pt-BR')} {item.unidade}</TableCell>
                    <TableCell className="text-right">{formatarMoeda(Number(item.valor_total_estimado ?? item.valor_estimado))}</TableCell>
                    <TableCell>
                      {item.vencedor ? (
                        <span className="text-green-700 font-medium">{item.vencedor.fornecedor}</span>
                      ) : item.melhor_lance ? (
                        <span className="text-slate-700">{item.melhor_lance.fornecedor} <span className="text-xs text-slate-500">(melhor lance; sem vencedor declarado)</span></span>
                      ) : (
                        <span className="text-gray-400">Sem lances</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {item.vencedor?.valor_total != null ? formatarMoeda(Number(item.vencedor.valor_total)) : item.melhor_lance ? formatarMoeda(Number(item.melhor_lance.valor)) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        // Economia sobre o valor TOTAL estimado do item (antes dividia pelo unitário e dava 100%, 120%)
                        const estimado = Number(item.valor_total_estimado ?? 0)
                        const economia = item.vencedor?.economia != null ? Number(item.vencedor.economia) : Number(item.economia)
                        return estimado > 0 && economia > 0 ? <Badge className="bg-green-100 text-green-800">{((economia / estimado) * 100).toFixed(1)}%</Badge> : '-'
                      })()}
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

        {/* JULGAMENTO, HABILITAÇÃO, RECURSOS E RESULTADO — os atos depois dos lances */}
        {ata.julgamento && (
          <>
            {ata.julgamento.desempates.length > 0 && (
              <Card className="mb-6 print:shadow-none print:border">
                <CardHeader><CardTitle className="text-lg">Desempate de ME/EPP (LC 123/2006, arts. 44 e 45)</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>Unidade</TableHead><TableHead>Melhor oferta</TableHead><TableHead>Resultado</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {ata.julgamento.desempates.map((d, i) => (
                        <TableRow key={i}>
                          <TableCell>{d.unidade}</TableCell>
                          <TableCell className="whitespace-normal">{d.melhor || '—'}{d.melhor_valor != null ? ` · ${formatarMoeda(Number(d.melhor_valor))}` : ''}</TableCell>
                          <TableCell className="whitespace-normal">{d.vencedor ? `${d.vencedor} cobriu a oferta: ${formatarMoeda(Number(d.valor_vencedor))}` : d.motivo || d.status}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {ata.julgamento.aceitacoes.length > 0 && (
              <Card className="mb-6 print:shadow-none print:border">
                <CardHeader><CardTitle className="text-lg">Julgamento das propostas (IN SEGES 73/2022, art. 29)</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>Unidade</TableHead><TableHead>Licitante convocado</TableHead><TableHead>Convocação</TableHead><TableHead className="text-right">Proposta</TableHead><TableHead>Decisão</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {ata.julgamento.aceitacoes.map((a, i) => (
                        <TableRow key={i}>
                          <TableCell>{a.unidade}</TableCell>
                          <TableCell className="whitespace-normal">{a.fornecedor || '—'}</TableCell>
                          <TableCell className="text-xs">{dataHora(a.convocada_em)}</TableCell>
                          <TableCell className="text-right">{a.valor_total_readequado != null ? formatarMoeda(Number(a.valor_total_readequado)) : '—'}</TableCell>
                          <TableCell className="whitespace-normal text-sm">
                            <b>{ROTULO_ACEITACAO[a.status] ?? a.status}</b>
                            {a.decidida_em ? ` em ${dataHora(a.decidida_em)}` : ''}
                            {a.decisao_motivo ? ` — ${a.decisao_motivo}` : ''}
                            {a.justificativa_exequibilidade ? ` — ${a.justificativa_exequibilidade}` : ''}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {ata.julgamento.habilitacoes.length > 0 && (
              <Card className="mb-6 print:shadow-none print:border">
                <CardHeader><CardTitle className="text-lg">Habilitação (Lei 14.133/2021, arts. 62 a 70)</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>Licitante</TableHead><TableHead>Convocação</TableHead><TableHead>Entrega</TableHead><TableHead>Decisão</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {ata.julgamento.habilitacoes.map((h, i) => (
                        <TableRow key={i}>
                          <TableCell className="whitespace-normal">{h.fornecedor || '—'}</TableCell>
                          <TableCell className="text-xs">{dataHora(h.convocada_em)}</TableCell>
                          <TableCell className="text-xs">{dataHora(h.enviada_em)}</TableCell>
                          <TableCell className="whitespace-normal text-sm">
                            <b>{ROTULO_HAB[h.status] ?? h.status}</b>
                            {h.decidida_em ? ` em ${dataHora(h.decidida_em)}` : ''}
                            {h.decisao_motivo ? ` — ${h.decisao_motivo}` : ''}
                            {(h.inabilitacoes_unidade ?? []).map((x, k) => (
                              <div key={k} className="text-red-700">Inabilitado só em {x.rotulo} ({dataHora(x.em)}): {x.motivo}</div>
                            ))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {ata.julgamento.diligencias.length > 0 && (
              <Card className="mb-6 print:shadow-none print:border">
                <CardHeader><CardTitle className="text-lg">Diligências (Lei 14.133/2021, art. 64)</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>Licitante</TableHead><TableHead>Pedido</TableHead><TableHead>Resposta</TableHead><TableHead>Conclusão</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {ata.julgamento.diligencias.map((d, i) => (
                        <TableRow key={i}>
                          <TableCell className="whitespace-normal">{d.fornecedor || '—'}{d.unidade_rotulo ? ` · ${d.unidade_rotulo}` : ''}</TableCell>
                          <TableCell className="whitespace-normal text-sm">{dataHora(d.aberta_em)} — {d.pedido}</TableCell>
                          <TableCell className="whitespace-normal text-sm">{d.resposta ? `${dataHora(d.respondida_em)} — ${d.resposta}` : 'Sem resposta'}</TableCell>
                          <TableCell className="whitespace-normal text-sm">
                            {d.encerrada_em ? `${dataHora(d.encerrada_em)} — ${d.resultado === 'ATENDIDA' ? 'Atendida' : d.resultado === 'NAO_ATENDIDA' ? 'Não atendida' : d.resultado || 'Encerrada'}${d.resultado_motivo ? `: ${d.resultado_motivo}` : ''}` : 'Em aberto'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {(ata.julgamento.janelas_recurso.length > 0 || ata.julgamento.recursos.length > 0) && (
              <Card className="mb-6 print:shadow-none print:border">
                <CardHeader><CardTitle className="text-lg">Recursos (Lei 14.133/2021, art. 165)</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {ata.julgamento.janelas_recurso.map((j, i) => (
                    <p key={i} className="text-sm">
                      Prazo de intenção de recurso aberto em {dataHora(j.aberta_em)}{j.aberta_por_nome ? ` por ${j.aberta_por_nome}` : ''}, encerrado em {dataHora(j.fecha_em)} ({j.minutos} minutos).
                    </p>
                  ))}
                  {ata.julgamento.recursos.length === 0 ? (
                    <p className="text-sm font-medium">Nenhuma intenção de recurso foi manifestada.</p>
                  ) : (
                    <Table>
                      <TableHeader><TableRow><TableHead>Recorrente</TableHead><TableHead>Contra</TableHead><TableHead>Intenção</TableHead><TableHead>Situação e decisão</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {ata.julgamento.recursos.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="whitespace-normal">{r.recorrente || '—'}</TableCell>
                            <TableCell className="whitespace-normal text-sm">{ROTULO_ATO[r.ato_recorrido ?? ''] ?? r.ato_recorrido ?? '—'}</TableCell>
                            <TableCell className="whitespace-normal text-sm">{dataHora(r.data_intencao)}{r.motivacao_intencao ? ` — ${r.motivacao_intencao}` : ''}</TableCell>
                            <TableCell className="whitespace-normal text-sm">
                              <b>{ROTULO_RECURSO[r.status] ?? r.status}</b>
                              {r.data_decisao ? ` em ${dataHora(r.data_decisao)}` : ''}
                              {r.decisao ? ` — ${r.decisao}` : ''}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )}

            {ata.julgamento.formalizacoes.length > 0 && (
              <Card className="mb-6 print:shadow-none print:border">
                <CardHeader><CardTitle className="text-lg">Adjudicação e homologação (Lei 14.133/2021, art. 71, IV)</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>Ato</TableHead><TableHead>Data</TableHead><TableHead>Autoridade</TableHead><TableHead>Registrado por</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {ata.julgamento.formalizacoes.map((f, i) => (
                        <TableRow key={i}>
                          <TableCell>{ROTULO_FORMALIZACAO[f.tipo] ?? f.tipo}</TableCell>
                          <TableCell className="text-xs">{dataHora(f.created_at)}</TableCell>
                          <TableCell className="whitespace-normal">{f.autoridade_nome}{f.autoridade_cargo && !f.autoridade_nome.toUpperCase().includes(f.autoridade_cargo.toUpperCase()) ? ` — ${f.autoridade_cargo}` : ''}</TableCell>
                          <TableCell className="whitespace-normal">{f.operador_nome}</TableCell>
                          <TableCell className="text-right">{f.valor_total != null ? formatarMoeda(Number(f.valor_total)) : '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Histórico de Eventos: é o registro cronológico da sessão e também sai impresso */}
        <div>
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
                        <TableCell className="text-xs">{dataHora(evento.data_hora)}</TableCell>
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
          <p className="mt-2">Data de geração: {dataHora(new Date().toISOString())} (horário de Brasília)</p>
        </div>
      </div>
    </div>
  )
}

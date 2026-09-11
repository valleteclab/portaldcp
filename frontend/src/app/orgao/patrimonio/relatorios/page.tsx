"use client"

import { useState, useEffect } from "react"
import { BarChart3, AlertTriangle, Wrench, Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { relatorioResumo, relatorioManutencoes, relatorioLocacoesVencendo, relatorioDepreciacao, emprestimosVencidos, listarSetores, abrirPdf, urlTermoResponsabilidade } from "@/services/patrimonio.service"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FileText, Calculator } from "lucide-react"

const moeda = (v: any) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

const TIPO_LABELS: Record<string, string> = {
  BEM_PROPRIO: "Bem Próprio",
  BEM_LOCADO: "Bem Locado",
  BEM_SERVIDOR: "Bem Servidor",
  BEM_COMODATO: "Bem Comodato",
}

const STATUS_LABELS: Record<string, string> = {
  ATIVO: "Ativo",
  EM_MANUTENCAO: "Em Manutenção",
  BAIXADO: "Baixado",
  DEVOLVIDO: "Devolvido",
}

const STATUS_MANUT_LABELS: Record<string, string> = {
  AGUARDANDO_DIAGNOSTICO: "Aguardando Diagnóstico",
  AGUARDANDO_CONSERTO: "Aguardando Conserto",
  EM_CONSERTO: "Em Conserto",
  CONCLUIDO: "Concluído",
}

export default function RelatoriosPatrimonioPage() {
  const [resumo, setResumo] = useState<any>(null)
  const [manutencoes, setManutencoes] = useState<any>(null)
  const [locacoesVencendo, setLocacoesVencendo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [depreciacao, setDepreciacao] = useState<any>(null)
  const [dataRef, setDataRef] = useState(new Date().toISOString().slice(0, 10))
  const [mostrarItens, setMostrarItens] = useState(false)
  const [vencidos, setVencidos] = useState<any[]>([])
  const [setores, setSetores] = useState<{ id: string; nome: string }[]>([])
  const [setorTermo, setSetorTermo] = useState("")
  const [responsavelTermo, setResponsavelTermo] = useState("")

  useEffect(() => {
    Promise.all([
      relatorioResumo(),
      relatorioManutencoes(),
      relatorioLocacoesVencendo(),
    ])
      .then(([r, m, l]) => {
        setResumo(r)
        setManutencoes(m)
        setLocacoesVencendo(l)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
    emprestimosVencidos().then(setVencidos).catch(() => setVencidos([]))
    listarSetores().then(setSetores).catch(() => setSetores([]))
  }, [])

  useEffect(() => {
    relatorioDepreciacao(dataRef).then(setDepreciacao).catch(() => setDepreciacao(null))
  }, [dataRef])

  if (loading) {
    return <div className="flex items-center justify-center py-12">Carregando relatórios...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Relatórios de Patrimônio</h1>
        <p className="text-muted-foreground">Visão consolidada do patrimônio do órgão</p>
      </div>

      {/* Cards de resumo */}
      {resumo && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />Total de Bens
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{resumo.total_bens}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Wrench className="h-4 w-4" />Em Manutenção
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-yellow-600">{resumo.manutencoes_ativas || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />Locações Vencendo (30d)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-orange-600">{resumo.locacoes_vencendo_30dias || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4" />Categorias
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{Object.keys(resumo.por_categoria || {}).length}</div>
              </CardContent>
            </Card>
          </div>

          {/* Distribuição por tipo */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader><CardTitle>Por Tipo</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(resumo.por_tipo || {}).map(([tipo, count]) => (
                    <div key={tipo} className="flex justify-between items-center">
                      <span className="text-sm">{TIPO_LABELS[tipo] || tipo}</span>
                      <Badge variant="secondary">{count as number}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Por Status</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(resumo.por_status || {}).map(([status, count]) => (
                    <div key={status} className="flex justify-between items-center">
                      <span className="text-sm">{STATUS_LABELS[status] || status}</span>
                      <Badge variant="secondary">{count as number}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Por Categoria</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(resumo.por_categoria || {}).map(([cat, count]) => (
                    <div key={cat} className="flex justify-between items-center">
                      <span className="text-sm">{cat}</span>
                      <Badge variant="secondary">{count as number}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Termo de responsabilidade por setor */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Termo de responsabilidade por setor</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="min-w-[240px]">
              <label className="text-sm font-medium">Setor</label>
              <Select value={setorTermo} onValueChange={setSetorTermo}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{setores.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="min-w-[240px]">
              <label className="text-sm font-medium">Responsável (nome no termo)</label>
              <Input value={responsavelTermo} onChange={(e) => setResponsavelTermo(e.target.value)} />
            </div>
            <Button disabled={!setorTermo} onClick={() => abrirPdf(urlTermoResponsabilidade(setorTermo, responsavelTermo)).catch((e) => alert(e.message))}>Gerar PDF</Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Relação dos bens ativos do setor com valor, para assinatura do responsável e da comissão.</p>
        </CardContent>
      </Card>

      {/* Empréstimos vencidos */}
      {vencidos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600"><AlertTriangle className="h-5 w-5" />Empréstimos com retorno atrasado ({vencidos.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Bem</TableHead><TableHead>Para</TableHead><TableHead>Retorno previsto</TableHead><TableHead>Registrado por</TableHead></TableRow></TableHeader>
              <TableBody>
                {vencidos.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell><span className="font-mono text-sm">{m.bem?.plaqueta}</span> · {m.bem?.descricao}</TableCell>
                    <TableCell>{m.destino_texto}{m.responsavel_destino_nome ? ` (${m.responsavel_destino_nome})` : ""}</TableCell>
                    <TableCell className="text-red-600 font-medium">{m.data_prevista_retorno ? new Date(m.data_prevista_retorno + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</TableCell>
                    <TableCell className="text-sm">{m.solicitado_por}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Depreciação */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" />Posição patrimonial e depreciação</CardTitle>
            <div className="flex items-center gap-2">
              <label className="text-sm">Data de referência</label>
              <Input type="date" value={dataRef} onChange={(e) => setDataRef(e.target.value)} className="w-40" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!depreciacao ? <p className="text-sm text-muted-foreground">Calculando...</p> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><div className="text-xs text-muted-foreground">Bens ativos</div><div className="text-xl font-bold">{depreciacao.totais.quantidade}</div></div>
                <div><div className="text-xs text-muted-foreground">Valor de aquisição</div><div className="text-xl font-bold">{moeda(depreciacao.totais.valor_aquisicao)}</div></div>
                <div><div className="text-xs text-muted-foreground">Depreciação acumulada</div><div className="text-xl font-bold text-orange-600">{moeda(depreciacao.totais.depreciacao_acumulada)}</div></div>
                <div><div className="text-xs text-muted-foreground">Valor líquido contábil</div><div className="text-xl font-bold text-green-700">{moeda(depreciacao.totais.valor_liquido)}</div></div>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Categoria</TableHead><TableHead>Conta</TableHead><TableHead>Vida útil</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead className="text-right">Aquisição</TableHead><TableHead className="text-right">Depreciação</TableHead><TableHead className="text-right">Líquido</TableHead></TableRow></TableHeader>
                <TableBody>
                  {depreciacao.categorias.map((c: any) => (
                    <TableRow key={c.categoria}>
                      <TableCell className="font-medium">{c.categoria}</TableCell>
                      <TableCell className="font-mono text-xs">{c.conta_contabil || "-"}</TableCell>
                      <TableCell>{c.vida_util_anos ? `${c.vida_util_anos} anos` : <span className="text-amber-600">não definida</span>}</TableCell>
                      <TableCell className="text-right">{c.quantidade}</TableCell>
                      <TableCell className="text-right">{moeda(c.valor_aquisicao)}</TableCell>
                      <TableCell className="text-right text-orange-700">{moeda(c.depreciacao_acumulada)}</TableCell>
                      <TableCell className="text-right font-medium">{moeda(c.valor_liquido)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {depreciacao.sem_parametros.length > 0 && (
                <p className="text-sm text-amber-700">
                  {depreciacao.sem_parametros.length} bem(ns) fora do cálculo por falta de valor, data de aquisição ou vida útil da categoria. Complete o cadastro para a posição bater com a contabilidade.
                </p>
              )}
              <Button variant="outline" size="sm" onClick={() => setMostrarItens(!mostrarItens)}>{mostrarItens ? "Ocultar" : "Ver"} por bem ({depreciacao.itens.length})</Button>
              {mostrarItens && (
                <div className="max-h-96 overflow-auto border rounded">
                  <Table>
                    <TableHeader><TableRow><TableHead>Plaqueta</TableHead><TableHead>Descrição</TableHead><TableHead>Setor</TableHead><TableHead>Aquisição</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Meses</TableHead><TableHead className="text-right">Depreciação</TableHead><TableHead className="text-right">Líquido</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {depreciacao.itens.map((b: any) => (
                        <TableRow key={b.id} className={b.totalmente_depreciado ? "opacity-70" : ""}>
                          <TableCell className="font-mono text-xs">{b.plaqueta}</TableCell>
                          <TableCell className="text-sm">{b.descricao}</TableCell>
                          <TableCell className="text-sm">{b.setor || "-"}</TableCell>
                          <TableCell className="text-sm">{b.data_aquisicao ? new Date(String(b.data_aquisicao).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</TableCell>
                          <TableCell className="text-right text-sm">{moeda(b.valor_aquisicao)}</TableCell>
                          <TableCell className="text-right text-sm">{b.meses_depreciados}/{b.vida_util_anos * 12}</TableCell>
                          <TableCell className="text-right text-sm text-orange-700">{moeda(b.depreciacao_acumulada)}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{moeda(b.valor_liquido)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Locações vencendo */}
      {locacoesVencendo && locacoesVencendo.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-5 w-5" />
              Locações Vencendo nos Próximos 30 Dias ({locacoesVencendo.total})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Locador</TableHead>
                  <TableHead>Contrato</TableHead>
                  <TableHead>Vencimento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locacoesVencendo.locacoes.map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.bem?.descricao || "-"}</TableCell>
                    <TableCell>{l.locador}</TableCell>
                    <TableCell>{l.numero_contrato || "-"}</TableCell>
                    <TableCell className="text-orange-600 font-medium">
                      {l.data_fim ? new Date(l.data_fim).toLocaleDateString("pt-BR") : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Manutenções recentes */}
      {manutencoes && manutencoes.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Manutenções ({manutencoes.total})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 mb-4">
              {Object.entries(manutencoes.por_status || {}).map(([status, count]) => (
                <Badge key={status} variant="outline">
                  {STATUS_MANUT_LABELS[status] || status}: {count as number}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

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
import { relatorioResumo, relatorioManutencoes, relatorioLocacoesVencendo } from "@/services/patrimonio.service"

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
  }, [])

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

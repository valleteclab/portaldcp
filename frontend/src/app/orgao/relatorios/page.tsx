"use client"

import { useState, useEffect, useCallback } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
} from "recharts"
import {
  FileText,
  DollarSign,
  Warehouse,
  Loader2,
  Printer,
  TrendingDown,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useModulosOrgao, ModuloSistema } from "@/hooks/useModulosOrgao"
import { API_URL, authFetch } from "@/lib/api"

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"]

function formatarMoeda(v: number | undefined) {
  return (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

interface EficienciaLicitacoes {
  economia_total: number
  valor_estimado_total: number
  valor_homologado_total: number
  tempo_medio_dias: number
  total_processos: number
  por_status: { nome: string; quantidade: number }[]
  top_fornecedores: { razao_social: string; quantidade: number; valor_total: number }[]
}

interface FinanceiroContratos {
  valor_contratado_total: number
  valor_executado_total: number
  valor_disponivel_total: number
  percentual_executado: number
  vencimentos_30: number
  vencimentos_60: number
  vencimentos_90: number
  valor_inicial_total: number
  valor_global_total: number
  aditivos_total: number
}

interface ConsumoAlmoxarifado {
  curva_abc: { descricao: string; valor: number; percentual_acumulado: number }[]
  por_status: { nome: string; quantidade: number }[]
  consumo_mensal: { mes: string; valor: number; quantidade: number }[]
}

export default function RelatoriosPage() {
  const { modulos, loading: modulosLoading, temAcesso } = useModulosOrgao()
  const [ano, setAno] = useState<string>(() => String(new Date().getFullYear()))
  const [exportando, setExportando] = useState(false)

  const [licitacoes, setLicitacoes] = useState<EficienciaLicitacoes | null>(null)
  const [contratos, setContratos] = useState<FinanceiroContratos | null>(null)
  const [almoxarifado, setAlmoxarifado] = useState<ConsumoAlmoxarifado | null>(null)

  const [loadingLicitacoes, setLoadingLicitacoes] = useState(false)
  const [loadingContratos, setLoadingContratos] = useState(false)
  const [loadingAlmoxarifado, setLoadingAlmoxarifado] = useState(false)

  const carregarLicitacoes = useCallback(async () => {
    if (!modulos.includes(ModuloSistema.LICITACOES)) return
    setLoadingLicitacoes(true)
    try {
      const r = await authFetch(`${API_URL}/api/relatorios/licitacoes/eficiencia?ano=${ano}`)
      if (r.ok) setLicitacoes(await r.json())
      else setLicitacoes(null)
    } catch {
      setLicitacoes(null)
    } finally {
      setLoadingLicitacoes(false)
    }
  }, [ano, modulos])

  const carregarContratos = useCallback(async () => {
    if (!modulos.includes(ModuloSistema.CONTRATOS)) return
    setLoadingContratos(true)
    try {
      const r = await authFetch(`${API_URL}/api/relatorios/contratos/financeiro?ano=${ano}`)
      if (r.ok) setContratos(await r.json())
      else setContratos(null)
    } catch {
      setContratos(null)
    } finally {
      setLoadingContratos(false)
    }
  }, [ano, modulos])

  const carregarAlmoxarifado = useCallback(async () => {
    if (!modulos.includes(ModuloSistema.ALMOXARIFADO)) return
    setLoadingAlmoxarifado(true)
    try {
      const r = await authFetch(`${API_URL}/api/relatorios/almoxarifado/consumo?ano=${ano}`)
      if (r.ok) setAlmoxarifado(await r.json())
      else setAlmoxarifado(null)
    } catch {
      setAlmoxarifado(null)
    } finally {
      setLoadingAlmoxarifado(false)
    }
  }, [ano, modulos])

  useEffect(() => {
    carregarLicitacoes()
  }, [carregarLicitacoes])

  useEffect(() => {
    carregarContratos()
  }, [carregarContratos])

  useEffect(() => {
    carregarAlmoxarifado()
  }, [carregarAlmoxarifado])

  const handleExportarPDF = () => {
    setExportando(true)
    document.body.classList.add("print-relatorio")
    window.print()
    setTimeout(() => {
      document.body.classList.remove("print-relatorio")
      setExportando(false)
    }, 500)
  }

  const temAlgumModulo =
    temAcesso(ModuloSistema.LICITACOES) ||
    temAcesso(ModuloSistema.CONTRATOS) ||
    temAcesso(ModuloSistema.ALMOXARIFADO)

  if (modulosLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-slate-600" />
      </div>
    )
  }

  if (!temAlgumModulo) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-800">Central de Relatórios</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>Configure os módulos do órgão (Licitações, Contratos ou Almoxarifado) para visualizar relatórios.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 relatorios-container">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Central de Relatórios</h1>
          <p className="text-muted-foreground">Visão gerencial da gestão de compras e contratos</p>
        </div>
        <div className="flex gap-2 items-center">
          <select
            value={ano}
            onChange={(e) => setAno(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm"
          >
            {[2025, 2024, 2023].map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={handleExportarPDF} disabled={exportando}>
            <Printer className="mr-2 h-4 w-4" />
            Exportar PDF
          </Button>
        </div>
      </div>

      <Tabs
        defaultValue={
          temAcesso(ModuloSistema.LICITACOES)
            ? "licitacoes"
            : temAcesso(ModuloSistema.CONTRATOS)
              ? "contratos"
              : "almoxarifado"
        }
      >
        <TabsList className="flex flex-wrap gap-2">
          {temAcesso(ModuloSistema.LICITACOES) && (
            <TabsTrigger value="licitacoes">Eficiência de Compras</TabsTrigger>
          )}
          {temAcesso(ModuloSistema.CONTRATOS) && (
            <TabsTrigger value="contratos">Saúde Financeira</TabsTrigger>
          )}
          {temAcesso(ModuloSistema.ALMOXARIFADO) && (
            <TabsTrigger value="almoxarifado">Consumo</TabsTrigger>
          )}
        </TabsList>

        {temAcesso(ModuloSistema.LICITACOES) && (
          <TabsContent value="licitacoes">
            <PainelLicitacoes data={licitacoes} loading={loadingLicitacoes} />
          </TabsContent>
        )}

        {temAcesso(ModuloSistema.CONTRATOS) && (
          <TabsContent value="contratos">
            <PainelContratos data={contratos} loading={loadingContratos} />
          </TabsContent>
        )}

        {temAcesso(ModuloSistema.ALMOXARIFADO) && (
          <TabsContent value="almoxarifado">
            <PainelAlmoxarifado data={almoxarifado} loading={loadingAlmoxarifado} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

function PainelLicitacoes({ data, loading }: { data: EficienciaLicitacoes | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-slate-600" />
      </div>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Não foi possível carregar os dados de eficiência de licitações.
        </CardContent>
      </Card>
    )
  }

  const barData = [
    { nome: "Estimado", valor: data.valor_estimado_total },
    { nome: "Homologado", valor: data.valor_homologado_total },
    { nome: "Economia", valor: data.economia_total },
  ]

  const pieData = data.por_status.map((s, i) => ({
    name: s.nome,
    value: s.quantidade,
    fill: COLORS[i % COLORS.length],
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Economia Gerada</CardTitle>
            <TrendingDown className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{formatarMoeda(data.economia_total)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tempo Médio (dias)</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.tempo_medio_dias}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Processos</CardTitle>
            <FileText className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.total_processos}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Valor Homologado</CardTitle>
            <DollarSign className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatarMoeda(data.valor_homologado_total)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Estimado vs Homologado vs Economia</CardTitle>
            <CardDescription>Comparativo de valores</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="nome" />
                  <YAxis tickFormatter={(v) => formatarMoeda(v)} />
                  <Tooltip formatter={(v) => formatarMoeda(v ?? 0)} />
                  <Bar dataKey="valor" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Taxa por Status</CardTitle>
            <CardDescription>Distribuição dos processos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    dataKey="value"
                    nameKey="name"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={pieData[i].fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {data.top_fornecedores.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Fornecedores Vencedores</CardTitle>
            <CardDescription>Por valor total contratado</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Fornecedor</th>
                    <th className="text-right py-2">Contratos</th>
                    <th className="text-right py-2">Valor Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_fornecedores.map((f, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-2">{f.razao_social}</td>
                      <td className="text-right">{f.quantidade}</td>
                      <td className="text-right">{formatarMoeda(f.valor_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function PainelContratos({ data, loading }: { data: FinanceiroContratos | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-slate-600" />
      </div>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Não foi possível carregar os dados financeiros dos contratos.
        </CardContent>
      </Card>
    )
  }

  const areaData = [
    { nome: "Contratado", valor: data.valor_contratado_total },
    { nome: "Executado", valor: data.valor_executado_total },
    { nome: "Disponível", valor: data.valor_disponivel_total },
  ]

  const vencData = [
    { periodo: "30 dias", quantidade: data.vencimentos_30 },
    { periodo: "60 dias", quantidade: data.vencimentos_60 },
    { periodo: "90 dias", quantidade: data.vencimentos_90 },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Valor Contratado</CardTitle>
            <DollarSign className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatarMoeda(data.valor_contratado_total)}</div>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-700">Valor Disponível</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{formatarMoeda(data.valor_disponivel_total)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">% Executado</CardTitle>
            <TrendingDown className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.percentual_executado}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Aditivos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatarMoeda(data.aditivos_total)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Execução Global</CardTitle>
            <CardDescription>Contratado vs Executado vs Disponível</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={areaData} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => formatarMoeda(v)} />
                  <YAxis type="category" dataKey="nome" width={80} />
                  <Tooltip formatter={(v) => formatarMoeda(v ?? 0)} />
                  <Bar dataKey="valor" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cronograma de Vencimentos</CardTitle>
            <CardDescription>Contratos vencendo</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={vencData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="periodo" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="quantidade" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function PainelAlmoxarifado({ data, loading }: { data: ConsumoAlmoxarifado | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-slate-600" />
      </div>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Não foi possível carregar os dados de consumo do almoxarifado.
        </CardContent>
      </Card>
    )
  }

  const pieData = data.por_status.map((s, i) => ({
    name: s.nome,
    value: s.quantidade,
    fill: COLORS[i % COLORS.length],
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Status das Requisições</CardTitle>
            <CardDescription>Atendidas vs Pendentes vs Negadas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={pieData[i].fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evolução do Consumo Mensal</CardTitle>
            <CardDescription>Valor por mês</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.consumo_mensal}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis tickFormatter={(v) => formatarMoeda(v)} />
                  <Tooltip formatter={(v) => formatarMoeda(v ?? 0)} />
                  <Line type="monotone" dataKey="valor" stroke="#3b82f6" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {data.curva_abc.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Curva ABC</CardTitle>
            <CardDescription>Itens que representam 80% do gasto</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Item</th>
                    <th className="text-right py-2">Valor</th>
                    <th className="text-right py-2">% Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.curva_abc.map((item, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-2">{item.descricao}</td>
                      <td className="text-right">{formatarMoeda(item.valor)}</td>
                      <td className="text-right">{item.percentual_acumulado}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  FileText,
  Gavel,
  Clock,
  CheckCircle2,
  TrendingDown,
  Plus,
  Users,
  FileCheck,
  Warehouse,
  Package,
  Send,
  ClipboardList,
  Loader2,
  AlertTriangle,
  DollarSign,
  Wallet,
  TrendingUp,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useModulosOrgao, ModuloSistema } from "@/hooks/useModulosOrgao"
import { API_URL, authFetch } from "@/lib/api"

interface EstatisticasContratos {
  valor_total: number
  valor_gasto: number
  valor_disponivel: number
  percentual_executado: number
  contratos_vigentes: number
}

interface EstatisticasContratosStatus {
  [key: string]: number
}

interface ContratoAVencer {
  id: string
  numero_contrato: string
  data_vigencia_fim: string
  fornecedor?: { razao_social: string }
}

interface EstatisticasRequisicoes {
  total: number
  por_status: Record<string, number>
  valor_total_autorizadas: number
  pendentes_autorizacao: number
}

interface EstatisticasOrdens {
  total: number
  por_status: Record<string, number>
  pendentes_envio: number
  em_andamento: number
  valor_total_emitido: number
  valor_total_entregue: number
}

export default function OrgaoDashboard() {
  const { temAcesso, loading: modulosLoading } = useModulosOrgao()
  const [podeAprovar, setPodeAprovar] = useState(false)

  const [loading, setLoading] = useState(true)
  const [valoresContratos, setValoresContratos] = useState<EstatisticasContratos | null>(null)
  const [statusContratos, setStatusContratos] = useState<EstatisticasContratosStatus | null>(null)
  const [contratosAVencer, setContratosAVencer] = useState<ContratoAVencer[]>([])
  const [estatRequisicoes, setEstatRequisicoes] = useState<EstatisticasRequisicoes | null>(null)
  const [estatOrdens, setEstatOrdens] = useState<EstatisticasOrdens | null>(null)
  const [pendentesAprovacao, setPendentesAprovacao] = useState<any[]>([])
  const [ordensPendentesEnvio, setOrdensPendentesEnvio] = useState<any[]>([])

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const usuarioStr = localStorage.getItem("usuario")
        if (usuarioStr) {
          const usuario = JSON.parse(usuarioStr)
          setPodeAprovar(usuario.pode_aprovar_requisicoes === true || usuario.pode_liberar_contratos === true)
        }
      } catch {
        // ignore
      }
    }
  }, [])

  const carregarDados = useCallback(async () => {
    setLoading(true)
    const promises: Promise<void>[] = []

    if (temAcesso(ModuloSistema.CONTRATOS)) {
      promises.push(
        authFetch(`${API_URL}/api/contratos/estatisticas/valores`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => { setValoresContratos(d) })
          .catch(() => setValoresContratos(null))
      )
      promises.push(
        authFetch(`${API_URL}/api/contratos/estatisticas/status`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => { setStatusContratos(d) })
          .catch(() => setStatusContratos(null))
      )
      promises.push(
        authFetch(`${API_URL}/api/contratos/estatisticas/a-vencer?dias=30`)
          .then((r) => (r.ok ? r.json() : []))
          .then((d) => { setContratosAVencer(Array.isArray(d) ? d : []) })
          .catch(() => setContratosAVencer([]))
      )
    }

    if (temAcesso(ModuloSistema.ALMOXARIFADO)) {
      promises.push(
        authFetch(`${API_URL}/api/almoxarifado/requisicoes/estatisticas`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => { setEstatRequisicoes(d) })
          .catch(() => setEstatRequisicoes(null))
      )
      promises.push(
        authFetch(`${API_URL}/api/almoxarifado/ordens/estatisticas`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => { setEstatOrdens(d) })
          .catch(() => setEstatOrdens(null))
      )
      if (podeAprovar) {
        promises.push(
          authFetch(`${API_URL}/api/almoxarifado/requisicoes/pendentes`)
            .then((r) => (r.ok ? r.json() : []))
            .then((d) => { setPendentesAprovacao(Array.isArray(d) ? d : []) })
            .catch(() => setPendentesAprovacao([]))
        )
      }
      promises.push(
        authFetch(`${API_URL}/api/almoxarifado/ordens/pendentes-envio`)
          .then((r) => (r.ok ? r.json() : []))
          .then((d) => { setOrdensPendentesEnvio(Array.isArray(d) ? d : []) })
          .catch(() => setOrdensPendentesEnvio([]))
      )
    }

    await Promise.all(promises)
    setLoading(false)
  }, [temAcesso, podeAprovar])

  useEffect(() => {
    if (!modulosLoading) carregarDados()
  }, [modulosLoading, carregarDados])

  const formatarMoeda = (v: number) =>
    (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

  const formatarData = (s: string) => {
    if (!s) return "-"
    const d = new Date(s)
    return d.toLocaleDateString("pt-BR")
  }

  const temAlgumModulo = temAcesso(ModuloSistema.LICITACOES) ||
    temAcesso(ModuloSistema.CONTRATOS) ||
    temAcesso(ModuloSistema.ALMOXARIFADO)

  if (modulosLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-slate-600" />
      </div>
    )
  }

  if (!temAlgumModulo) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Painel do Órgão</h1>
          <p className="text-muted-foreground">Visão geral do sistema</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>Configure os módulos do órgão nas configurações para visualizar o dashboard.</p>
            <Button asChild className="mt-4">
              <Link href="/orgao/configuracoes">Ir para Configurações</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Painel do Órgão</h1>
          <p className="text-muted-foreground">Visão geral do sistema</p>
        </div>
        <div className="flex gap-2">
          {temAcesso(ModuloSistema.LICITACOES) && (
            <Link href="/orgao/licitacoes/nova">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nova Licitação
              </Button>
            </Link>
          )}
          {temAcesso(ModuloSistema.ALMOXARIFADO) && (
            <Link href="/orgao/almoxarifado/requisicoes/nova">
              <Button variant={temAcesso(ModuloSistema.LICITACOES) ? "outline" : "default"}>
                <Plus className="mr-2 h-4 w-4" />
                Nova Requisição
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Cards Contratos - Valores */}
      {temAcesso(ModuloSistema.CONTRATOS) && valoresContratos && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Valor Total
              </CardTitle>
              <DollarSign className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatarMoeda(valoresContratos.valor_total)}</div>
              <p className="text-xs text-muted-foreground">
                {valoresContratos.contratos_vigentes} contrato(s) vigente(s)
              </p>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border-green-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-green-700">
                Valor Disponível
              </CardTitle>
              <Wallet className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-700">
                {formatarMoeda(valoresContratos.valor_disponivel)}
              </div>
              <p className="text-xs text-green-600">Saldo para uso</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Valor Gasto
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-slate-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatarMoeda(valoresContratos.valor_gasto)}</div>
              <p className="text-xs text-muted-foreground">Executado</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                % Executado
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{valoresContratos.percentual_executado}%</div>
              <p className="text-xs text-muted-foreground">Execução financeira</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Cards Licitações */}
      {temAcesso(ModuloSistema.LICITACOES) && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Licitações Ativas
              </CardTitle>
              <FileText className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">Em andamento</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Em Disputa
              </CardTitle>
              <Gavel className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">Sessões ativas</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Aguardando Homologação
              </CardTitle>
              <Clock className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">Pendentes</p>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border-green-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-green-700">
                Economia Gerada
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-700">R$ 0,00</div>
              <p className="text-xs text-green-600">Este ano</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Cards Almoxarifado */}
      {temAcesso(ModuloSistema.ALMOXARIFADO) && (estatRequisicoes || estatOrdens) && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Requisições Pendentes
              </CardTitle>
              <ClipboardList className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {estatRequisicoes?.pendentes_autorizacao ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">Aguardando aprovação</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Ordens em Andamento
              </CardTitle>
              <Send className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{estatOrdens?.em_andamento ?? 0}</div>
              <p className="text-xs text-muted-foreground">
                {estatOrdens?.pendentes_envio ?? 0} pendentes de envio
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Valor Autorizado
              </CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatarMoeda(estatRequisicoes?.valor_total_autorizadas ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground">Requisições aprovadas</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Requisições
              </CardTitle>
              <Package className="h-4 w-4 text-slate-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{estatRequisicoes?.total ?? 0}</div>
              <p className="text-xs text-muted-foreground">Cadastradas</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pendências e Ações */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Pendências e Ações</CardTitle>
            <CardDescription>Itens que exigem sua atenção</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {temAcesso(ModuloSistema.ALMOXARIFADO) && podeAprovar && pendentesAprovacao.length > 0 && (
                <div className="flex items-center justify-between p-3 border rounded-lg bg-orange-50">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-orange-600" />
                    <div>
                      <p className="font-medium">{pendentesAprovacao.length} requisição(ões) aguardando aprovação</p>
                      <p className="text-sm text-muted-foreground">Aprove ou negue as requisições pendentes</p>
                    </div>
                  </div>
                  <Button asChild size="sm">
                    <Link href="/orgao/almoxarifado/aprovacoes">Ver</Link>
                  </Button>
                </div>
              )}
              {temAcesso(ModuloSistema.ALMOXARIFADO) && ordensPendentesEnvio.length > 0 && (
                <div className="flex items-center justify-between p-3 border rounded-lg bg-blue-50">
                  <div className="flex items-center gap-3">
                    <Send className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="font-medium">{ordensPendentesEnvio.length} ordem(ns) pendente(s) de envio</p>
                      <p className="text-sm text-muted-foreground">Envie as ordens ao fornecedor</p>
                    </div>
                  </div>
                  <Button asChild size="sm">
                    <Link href="/orgao/almoxarifado/ordens">Ver</Link>
                  </Button>
                </div>
              )}
              {temAcesso(ModuloSistema.CONTRATOS) && contratosAVencer.length > 0 && (
                <div className="flex items-center justify-between p-3 border rounded-lg bg-yellow-50">
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-yellow-600" />
                    <div>
                      <p className="font-medium">{contratosAVencer.length} contrato(s) a vencer em 30 dias</p>
                      <p className="text-sm text-muted-foreground">
                        {contratosAVencer.slice(0, 2).map((c) => c.numero_contrato).join(", ")}
                        {contratosAVencer.length > 2 && "..."}
                      </p>
                    </div>
                  </div>
                  <Button asChild size="sm">
                    <Link href="/orgao/contratos">Ver</Link>
                  </Button>
                </div>
              )}
              {(!pendentesAprovacao.length || !podeAprovar) &&
                !ordensPendentesEnvio.length &&
                !contratosAVencer.length && (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p>Nenhuma pendência no momento</p>
                  </div>
                )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ações Rápidas</CardTitle>
            <CardDescription>Atalhos para tarefas comuns</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {temAcesso(ModuloSistema.LICITACOES) && (
              <Link href="/orgao/licitacoes/nova" className="block">
                <Button variant="outline" className="w-full justify-start">
                  <Plus className="mr-2 h-4 w-4" />
                  Nova Licitação
                </Button>
              </Link>
            )}
            {temAcesso(ModuloSistema.ALMOXARIFADO) && (
              <Link href="/orgao/almoxarifado/requisicoes/nova" className="block">
                <Button variant="outline" className="w-full justify-start">
                  <ClipboardList className="mr-2 h-4 w-4" />
                  Nova Requisição
                </Button>
              </Link>
            )}
            {podeAprovar && (
              <Link href="/orgao/almoxarifado/aprovacoes" className="block">
                <Button variant="outline" className="w-full justify-start">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Aprovações Pendentes
                </Button>
              </Link>
            )}
            {temAcesso(ModuloSistema.LICITACOES) && (
              <Link href="/orgao/licitacoes" className="block">
                <Button variant="outline" className="w-full justify-start">
                  <FileText className="mr-2 h-4 w-4" />
                  Ver Licitações
                </Button>
              </Link>
            )}
            {temAcesso(ModuloSistema.CONTRATOS) && (
              <Link href="/orgao/contratos" className="block">
                <Button variant="outline" className="w-full justify-start">
                  <FileCheck className="mr-2 h-4 w-4" />
                  Ver Contratos
                </Button>
              </Link>
            )}
            {temAcesso(ModuloSistema.ALMOXARIFADO) && (
              <Link href="/orgao/almoxarifado/ordens" className="block">
                <Button variant="outline" className="w-full justify-start">
                  <Send className="mr-2 h-4 w-4" />
                  Ver Ordens
                </Button>
              </Link>
            )}
            <Link href="/orgao/fornecedores" className="block">
              <Button variant="outline" className="w-full justify-start">
                <Users className="mr-2 h-4 w-4" />
                Consultar Fornecedores
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

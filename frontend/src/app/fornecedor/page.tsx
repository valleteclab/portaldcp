"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { 
  FileText, 
  Gavel, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  ArrowRight,
  UserPlus,
  CheckCircle,
  XCircle,
  Shield,
  ClipboardCheck,
  RotateCcw,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"

import { API_URL, authFetch } from '@/lib/api'
import {
  carregarOverviewMedicoesFornecedor,
  formatarData,
  formatarMoeda,
  obterStatusMedicaoLabel,
  type ContratoMedicaoOverview,
} from '@/lib/fornecedor-medicoes'

interface StatusCadastro {
  nivel_i_completo: boolean
  nivel_ii_completo: boolean
  nivel_iii_completo: boolean
  nivel_iv_completo: boolean
  nivel_v_completo: boolean
  nivel_vi_completo: boolean
  razao_social?: string
  cpf_cnpj?: string
  documentos?: any[]
}

export default function FornecedorDashboard() {
  const [statusCadastro, setStatusCadastro] = useState<StatusCadastro | null>(null)
  const [medicoesOverview, setMedicoesOverview] = useState<ContratoMedicaoOverview[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const carregarStatus = async () => {
      try {
        const fornecedorStr = localStorage.getItem('fornecedor')
        if (!fornecedorStr) {
          setLoading(false)
          return
        }

        const fornecedorLocal = JSON.parse(fornecedorStr)
        if (fornecedorLocal.email) {
          const res = await authFetch(`${API_URL}/api/fornecedores/por-email/${encodeURIComponent(fornecedorLocal.email)}`)
          if (res.ok) {
            const data = await res.json()
            setStatusCadastro(data)
          }
        }

        setMedicoesOverview(await carregarOverviewMedicoesFornecedor())
      } catch (e) {
        console.error('Erro ao carregar status:', e)
      } finally {
        setLoading(false)
      }
    }
    carregarStatus()
  }, [])

  // Verifica status real baseado nos documentos
  const verificarNivelReal = () => {
    if (!statusCadastro) return { nivel1: false, nivel2: false, nivel3: false, nivel4: false, nivel5: false, nivel6: false }
    
    const docs = statusCadastro.documentos || []
    
    // Nível I - Credenciamento: precisa ter CNPJ válido (não temporário)
    const nivel1 = statusCadastro.cpf_cnpj && !statusCadastro.cpf_cnpj.startsWith('TEMP_')
    
    // Nível II - Habilitação Jurídica: precisa ter contrato social E documento do representante
    const temContratoSocial = docs.some(d => d.tipo === 'CONTRATO_SOCIAL' && d.caminho_arquivo)
    const temDocRepresentante = docs.some(d => d.tipo === 'DOCUMENTO_IDENTIDADE_REPRESENTANTE' && d.caminho_arquivo)
    const nivel2 = temContratoSocial && temDocRepresentante
    
    // Nível III - Fiscal Federal: precisa ter pelo menos uma certidão
    const temReceitaFederal = docs.some(d => d.tipo === 'CND_RECEITA_FEDERAL_PGFN' && (d.codigo_controle || d.caminho_arquivo))
    const temFgts = docs.some(d => d.tipo === 'CRF_FGTS' && (d.codigo_controle || d.caminho_arquivo))
    const temTst = docs.some(d => d.tipo === 'CNDT_TST' && (d.codigo_controle || d.caminho_arquivo))
    const nivel3 = temReceitaFederal || temFgts || temTst
    
    // Nível IV - Fiscal Estadual: precisa ter pelo menos uma certidão
    const temCertidaoEstadual = docs.some(d => d.tipo === 'CND_ESTADUAL' && (d.codigo_controle || d.caminho_arquivo))
    const temCertidaoMunicipal = docs.some(d => d.tipo === 'CND_MUNICIPAL' && (d.codigo_controle || d.caminho_arquivo))
    const nivel4 = temCertidaoEstadual || temCertidaoMunicipal
    
    // Nível V - Qualificação Técnica: opcional, verifica se tem atestados
    const temAtestados = docs.some(d => d.tipo === 'ATESTADO_CAPACIDADE_TECNICA')
    const nivel5 = temAtestados
    
    // Nível VI - Qualificação Econômica: opcional, verifica se tem balanços
    const temBalancos = docs.some(d => d.tipo === 'BALANCO_PATRIMONIAL')
    const nivel6 = temBalancos
    
    return { nivel1, nivel2, nivel3, nivel4, nivel5, nivel6 }
  }
  
  const niveisReais = verificarNivelReal()

  // Calcula progresso do cadastro baseado nos documentos reais
  const calcularProgresso = () => {
    if (!statusCadastro) return 0
    let completos = 0
    // Níveis obrigatórios (peso maior)
    if (niveisReais.nivel1) completos += 2  // Credenciamento vale mais
    if (niveisReais.nivel2) completos += 1
    if (niveisReais.nivel3) completos += 1
    if (niveisReais.nivel4) completos += 1
    // Níveis opcionais (peso menor)
    if (niveisReais.nivel5) completos += 0.5
    if (niveisReais.nivel6) completos += 0.5
    return Math.round((completos / 6) * 100)
  }

  // Verifica se pode participar de licitações (credenciamento completo)
  const podeParticipar = niveisReais.nivel1

  // Lista o que falta completar
  const obterPendencias = () => {
    if (!statusCadastro) return ['Credenciamento (obrigatório)']
    const pendencias: string[] = []
    if (!niveisReais.nivel1) pendencias.push('Credenciamento (obrigatório)')
    if (!niveisReais.nivel2) pendencias.push('Habilitação Jurídica')
    if (!niveisReais.nivel3) pendencias.push('Regularidade Fiscal Federal')
    if (!niveisReais.nivel4) pendencias.push('Regularidade Fiscal Estadual/Municipal')
    if (!niveisReais.nivel5) pendencias.push('Qualificação Técnica (opcional)')
    if (!niveisReais.nivel6) pendencias.push('Qualificação Econômica (opcional)')
    return pendencias
  }

  const progresso = calcularProgresso()
  const pendencias = obterPendencias()
  const medicoesPendentes = medicoesOverview.filter((item) => item.devolvidaEditavel || item.rascunho || item.temNovaMedicaoDisponivel)
  const medicoesHistorico = medicoesOverview.filter((item) => item.ultimaMedicao).slice(0, 4)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Portal do Fornecedor</h1>
        <p className="text-muted-foreground">Bem-vindo ao Sistema de Licitações</p>
      </div>

      {/* Stats Cards - Zerados */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Licitações Disponíveis
            </CardTitle>
            <FileText className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Abertas para participação</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Propostas Enviadas
            </CardTitle>
            <Gavel className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Aguardando análise</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Em Disputa
            </CardTitle>
            <Clock className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Sessões ativas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Licitações Vencidas
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Total histórico</p>
          </CardContent>
        </Card>
      </div>

      {/* Status do Cadastro */}
      {loading ? (
        <Card className="border-gray-200">
          <CardContent className="py-8 text-center text-muted-foreground">
            Carregando status do cadastro...
          </CardContent>
        </Card>
      ) : podeParticipar ? (
        // Cadastro válido - pode participar
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="text-green-800 flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Cadastro Ativo
            </CardTitle>
            <CardDescription className="text-green-700">
              Você está habilitado para participar de licitações
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-green-700">Progresso do cadastro</span>
              <span className="font-medium text-green-800">{progresso}%</span>
            </div>
            <Progress value={progresso} className="h-2" />
            
            {pendencias.length > 0 && pendencias.length < 6 && (
              <div className="pt-2">
                <p className="text-sm text-green-700 mb-2">Níveis pendentes:</p>
                <div className="flex flex-wrap gap-2">
                  {pendencias.map((p, i) => (
                    <span key={i} className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded border border-orange-200">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            <div className="flex gap-2 pt-2">
              <Link href="/fornecedor/cadastro-sicaf">
                <Button variant="outline" className="border-green-300 text-green-700 hover:bg-green-100">
                  Gerenciar Cadastro
                </Button>
              </Link>
              <Link href="/fornecedor/licitacoes">
                <Button className="bg-green-600 hover:bg-green-700">
                  <Gavel className="mr-2 h-4 w-4" />
                  Ver Licitações Disponíveis
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        // Cadastro pendente - precisa completar credenciamento
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="text-orange-800 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Cadastro Pendente
            </CardTitle>
            <CardDescription className="text-orange-700">
              Complete o credenciamento para participar de licitações
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-orange-700">Progresso do cadastro</span>
              <span className="font-medium text-orange-800">{progresso}%</span>
            </div>
            <Progress value={progresso} className="h-2" />
            
            <div className="pt-2">
              <p className="text-sm font-medium text-orange-800 mb-2">O que falta:</p>
              <ul className="space-y-1">
                {pendencias.slice(0, 3).map((p, i) => (
                  <li key={i} className="text-sm text-orange-700 flex items-center gap-2">
                    <XCircle className="h-4 w-4" />
                    {p}
                  </li>
                ))}
                {pendencias.length > 3 && (
                  <li className="text-sm text-orange-600">
                    + {pendencias.length - 3} outros níveis
                  </li>
                )}
              </ul>
            </div>
            
            <Link href="/fornecedor/cadastro-sicaf">
              <Button className="w-full bg-orange-600 hover:bg-orange-700">
                <ArrowRight className="mr-2 h-4 w-4" />
                Completar Cadastro
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <Card className="border-blue-200">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-blue-600" />
                Medições pendentes e histórico
              </CardTitle>
              <CardDescription>
                Abra rapidamente a próxima ação ou acompanhe a última situação de cada contrato.
              </CardDescription>
            </div>
            <Button asChild className="bg-blue-600 hover:bg-blue-700">
              <Link href="/fornecedor/medicoes">
                Ir para central de medições
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {medicoesPendentes.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhuma pendência de medição no momento.
            </div>
          ) : (
            <div className="space-y-3">
              {medicoesPendentes.slice(0, 3).map((item) => (
                <div key={item.contrato.id} className="rounded-lg border p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-800">{item.contrato.numero_contrato}</span>
                      <Badge className="bg-blue-100 text-blue-800">{item.acaoPrincipal.label}</Badge>
                      {item.devolvidaEditavel && (
                        <Badge className="bg-amber-100 text-amber-800">
                          <RotateCcw className="mr-1 h-3 w-3" />Devolvida
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{item.contrato.objeto}</p>
                  </div>
                  <Button asChild className="bg-blue-600 hover:bg-blue-700">
                    <Link href={item.acaoPrincipal.href}>{item.acaoPrincipal.label}</Link>
                  </Button>
                </div>
              ))}
            </div>
          )}

          {medicoesHistorico.length > 0 && (
            <div className="space-y-3 pt-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Últimas medições</h3>
                <p className="text-sm text-muted-foreground">Resumo rápido das medições mais recentes.</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {medicoesHistorico.map((item) => (
                  <div key={item.contrato.id} className="rounded-lg border p-4 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-800">{item.contrato.numero_contrato}</span>
                      <Badge variant="secondary">
                        {item.ultimaMedicao ? obterStatusMedicaoLabel(item.ultimaMedicao.status) : 'Sem medições'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{item.contrato.objeto}</p>
                    {item.ultimaMedicao && (
                      <div className="text-sm text-slate-600 space-y-1">
                        <p>Período: {formatarData(item.ultimaMedicao.periodo_inicio)} a {formatarData(item.ultimaMedicao.periodo_fim)}</p>
                        <p>Valor: {formatarMoeda(item.ultimaMedicao.valor_medido)}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Licitações Vazias */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Licitações Disponíveis</CardTitle>
            <CardDescription>Oportunidades abertas para participação</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>Nenhuma licitação disponível no momento</p>
              <p className="text-sm">Novas licitações aparecerão aqui quando publicadas</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Minhas Participações</CardTitle>
            <CardDescription>Licitações em andamento</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>Você ainda não está participando de nenhuma licitação</p>
              <p className="text-sm">Complete seu cadastro para começar a participar</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

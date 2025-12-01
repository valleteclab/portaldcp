"use client"

import { useState } from "react"
import { Search, Building2, User, MapPin, Briefcase, Users, Loader2, CheckCircle2, ArrowLeft, ArrowRight } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { DadosCnpj, Representante, Procurador, formatarCnpj, formatarCpf, formatarMoeda } from "./types"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface CredenciamentoTabProps {
  dadosCnpj: DadosCnpj | null
  setDadosCnpj: (dados: DadosCnpj | null) => void
  representante: Representante
  setRepresentante: (rep: Representante) => void
  usarProcurador: boolean
  setUsarProcurador: (usar: boolean) => void
  procurador: Procurador
  setProcurador: (proc: Procurador) => void
  onComplete: () => void
  setError: (error: string | null) => void
  emailUsuario?: string
}

export function CredenciamentoTab({
  dadosCnpj, setDadosCnpj, representante, setRepresentante,
  usarProcurador, setUsarProcurador, procurador, setProcurador,
  onComplete, setError, emailUsuario
}: CredenciamentoTabProps) {
  const [cnpj, setCnpj] = useState('')
  const [loading, setLoading] = useState(false)

  const consultarCnpj = async () => {
    const cnpjLimpo = cnpj.replace(/\D/g, '')
    if (cnpjLimpo.length !== 14) {
      setError('CNPJ deve ter 14 dígitos')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Verifica se já existe
      const verificaRes = await fetch(`${API_URL}/api/fornecedores/verificar-cnpj/${cnpjLimpo}`)
      const verificaData = await verificaRes.json()
      
      if (verificaData.existe) {
        setError('Este CNPJ já está cadastrado no sistema')
        setLoading(false)
        return
      }

      // Consulta dados
      const res = await fetch(`${API_URL}/api/fornecedores/consultar-cnpj/${cnpjLimpo}`)
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || 'Erro ao consultar CNPJ')
      }

      const dados = await res.json()
      setDadosCnpj(dados)
      
      // Pré-preenche representante se houver sócio administrador
      const socioAdmin = dados.socios?.find((s: any) => 
        s.qualificacao?.toLowerCase().includes('administrador')
      )
      if (socioAdmin) {
        setRepresentante({ ...representante, nome: socioAdmin.nome })
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao consultar CNPJ')
    } finally {
      setLoading(false)
    }
  }

  const finalizarCredenciamento = () => {
    if (!dadosCnpj) {
      setError('Consulte o CNPJ primeiro')
      return
    }
    if (!representante.nome || !representante.cpf) {
      setError('Preencha os dados do representante legal')
      return
    }
    setError(null)
    onComplete()
  }

  // Tela de consulta CNPJ
  if (!dadosCnpj) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Consultar CNPJ
          </CardTitle>
          <CardDescription>
            Digite o CNPJ para buscar os dados automaticamente na Receita Federal
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input
                id="cnpj"
                placeholder="00.000.000/0000-00"
                value={cnpj}
                onChange={(e) => setCnpj(formatarCnpj(e.target.value))}
                maxLength={18}
                className="text-lg"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={consultarCnpj} disabled={loading} size="lg">
                {loading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Consultando...</>
                ) : (
                  <><Search className="mr-2 h-4 w-4" />Consultar</>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Tela com dados do CNPJ
  return (
    <div className="space-y-4">
      {/* Situação Cadastral */}
      <Alert className={dadosCnpj.situacao.nome === 'Ativa' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
        <CheckCircle2 className={`h-4 w-4 ${dadosCnpj.situacao.nome === 'Ativa' ? 'text-green-600' : 'text-red-600'}`} />
        <AlertTitle>Situação Cadastral: {dadosCnpj.situacao.nome}</AlertTitle>
        <AlertDescription>
          Desde {new Date(dadosCnpj.situacao.data).toLocaleDateString('pt-BR')}
        </AlertDescription>
      </Alert>

      {/* Dados da Empresa */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Dados da Empresa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground text-sm">Razão Social</Label>
              <p className="font-medium">{dadosCnpj.razao_social}</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">Nome Fantasia</Label>
              <p className="font-medium">{dadosCnpj.nome_fantasia || '-'}</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">CNPJ</Label>
              <p className="font-medium">{formatarCnpj(dadosCnpj.cnpj)}</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">Natureza Jurídica</Label>
              <p className="font-medium">{dadosCnpj.natureza_juridica}</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">Porte</Label>
              <Badge variant="outline">{dadosCnpj.porte}</Badge>
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">Capital Social</Label>
              <p className="font-medium">{formatarMoeda(dadosCnpj.capital_social)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Endereço */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Endereço
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-medium">
            {dadosCnpj.endereco.tipo_logradouro} {dadosCnpj.endereco.logradouro}, {dadosCnpj.endereco.numero}
            {dadosCnpj.endereco.complemento && ` - ${dadosCnpj.endereco.complemento}`}
          </p>
          <p className="text-muted-foreground">
            {dadosCnpj.endereco.bairro} - {dadosCnpj.endereco.cidade}/{dadosCnpj.endereco.uf} - CEP: {dadosCnpj.endereco.cep}
          </p>
        </CardContent>
      </Card>

      {/* Atividade Principal */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Atividade Principal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-medium">
            <Badge variant="default" className="mr-2">{dadosCnpj.atividade_principal.codigo}</Badge>
            {dadosCnpj.atividade_principal.descricao}
          </p>
          {dadosCnpj.atividades_secundarias.length > 0 && (
            <p className="text-sm text-muted-foreground mt-2">
              + {dadosCnpj.atividades_secundarias.length} atividades secundárias
            </p>
          )}
        </CardContent>
      </Card>

      {/* Sócios */}
      {dadosCnpj.socios.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Quadro Societário
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dadosCnpj.socios.map((socio, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">{socio.nome}</p>
                    <p className="text-sm text-muted-foreground">{socio.qualificacao}</p>
                  </div>
                  <Badge variant="outline">{socio.cpf_cnpj}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Representante Legal */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Representante Legal
          </CardTitle>
          <CardDescription>
            Informe os dados do representante legal da empresa
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome Completo *</Label>
              <Input
                value={representante.nome}
                onChange={(e) => setRepresentante({...representante, nome: e.target.value})}
                placeholder="Nome do representante"
              />
            </div>
            <div className="space-y-2">
              <Label>CPF *</Label>
              <Input
                value={representante.cpf}
                onChange={(e) => setRepresentante({...representante, cpf: formatarCpf(e.target.value)})}
                placeholder="000.000.000-00"
                maxLength={14}
              />
            </div>
            <div className="space-y-2">
              <Label>Cargo</Label>
              <Input
                value={representante.cargo}
                onChange={(e) => setRepresentante({...representante, cargo: e.target.value})}
                placeholder="Ex: Sócio-Administrador"
              />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input
                value={representante.telefone}
                onChange={(e) => setRepresentante({...representante, telefone: e.target.value})}
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={emailUsuario || representante.email}
                onChange={(e) => setRepresentante({...representante, email: e.target.value})}
                placeholder="email@empresa.com.br"
                disabled={!!emailUsuario}
                className={emailUsuario ? "bg-gray-100" : ""}
              />
              {emailUsuario && (
                <p className="text-xs text-muted-foreground">Email da conta cadastrada</p>
              )}
            </div>
          </div>

          {/* Opção de Procurador */}
          <div className="border-t pt-4">
            <div className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                id="usar-procurador"
                checked={usarProcurador}
                onChange={(e) => setUsarProcurador(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="usar-procurador">Cadastrar Procurador</Label>
            </div>

            {usarProcurador && (
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="space-y-2">
                  <Label>Nome do Procurador *</Label>
                  <Input
                    value={procurador.nome}
                    onChange={(e) => setProcurador({...procurador, nome: e.target.value})}
                    placeholder="Nome completo"
                  />
                </div>
                <div className="space-y-2">
                  <Label>CPF do Procurador *</Label>
                  <Input
                    value={procurador.cpf}
                    onChange={(e) => setProcurador({...procurador, cpf: formatarCpf(e.target.value)})}
                    placeholder="000.000.000-00"
                    maxLength={14}
                  />
                </div>
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input
                    value={procurador.email}
                    onChange={(e) => setProcurador({...procurador, email: e.target.value})}
                    placeholder="email@empresa.com.br"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input
                    value={procurador.telefone}
                    onChange={(e) => setProcurador({...procurador, telefone: e.target.value})}
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setDadosCnpj(null)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
        <Button onClick={finalizarCredenciamento}>
          Finalizar Credenciamento <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

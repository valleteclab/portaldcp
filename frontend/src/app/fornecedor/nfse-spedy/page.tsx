'use client'

import { useState } from 'react'
import { API_URL, authFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, ReceiptText, Search, CheckCircle2, AlertCircle, FileText, Building2 } from 'lucide-react'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  enqueued: { label: 'Na fila', color: 'bg-yellow-100 text-yellow-800' },
  created: { label: 'Criada', color: 'bg-gray-100 text-gray-700' },
  authorized: { label: 'Autorizada', color: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rejeitada', color: 'bg-red-100 text-red-800' },
  canceled: { label: 'Cancelada', color: 'bg-red-100 text-red-800' },
  received: { label: 'Recebida', color: 'bg-blue-100 text-blue-800' },
}

function fmt(v: string) {
  return v.replace(/\D/g, '')
}

interface Emissao {
  integrationId: string
  referenceCode: string
  ambiente: 'development' | 'production'
  federalServiceCode: string
  cityServiceCode: string
  descricao: string
  valor: string
  issRate: string
  issWithheld: boolean
  tomadorTaxId: string
  tomadorNome: string
  tomadorEmail: string
  tomadorRua: string
  tomadorNumero: string
  tomadorBairro: string
  tomadorCep: string
  tomadorCidadeIbge: string
  tomadorCidadeNome: string
  tomadorUf: string
}

const EMPTY: Emissao = {
  integrationId: '',
  referenceCode: '',
  ambiente: 'development',
  federalServiceCode: '',
  cityServiceCode: '',
  descricao: '',
  valor: '',
  issRate: '5',
  issWithheld: false,
  tomadorTaxId: '',
  tomadorNome: '',
  tomadorEmail: '',
  tomadorRua: '',
  tomadorNumero: '',
  tomadorBairro: '',
  tomadorCep: '',
  tomadorCidadeIbge: '',
  tomadorCidadeNome: '',
  tomadorUf: '',
}

export default function FornecedorNfseSpedyPage() {
  const [form, setForm] = useState<Emissao>(EMPTY)
  const [consultaId, setConsultaId] = useState('')
  const [loadingEmitir, setLoadingEmitir] = useState(false)
  const [loadingConsultar, setLoadingConsultar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<any>(null)
  const [emitido, setEmitido] = useState<any>(null)

  const set = (field: keyof Emissao, value: any) => setForm(f => ({ ...f, [field]: value }))

  const validar = (): string | null => {
    if (!form.integrationId.trim()) return 'Informe o ID de integração (ex: medicao-123)'
    if (!form.federalServiceCode.trim()) return 'Informe o código federal LC 116/03 (ex: 1.07)'
    if (!form.cityServiceCode.trim()) return 'Informe o código de serviço municipal'
    if (!form.descricao.trim()) return 'Informe a descrição do serviço'
    if (!form.valor || Number(form.valor) <= 0) return 'Informe o valor do serviço'
    if (fmt(form.tomadorTaxId).length < 11) return 'CPF/CNPJ do tomador inválido'
    if (!form.tomadorNome.trim()) return 'Informe a razão social do tomador'
    if (!form.tomadorEmail.trim()) return 'Informe o e-mail do tomador'
    if (!form.tomadorRua.trim() || !form.tomadorCep.trim()) return 'Informe o endereço do tomador (rua e CEP)'
    if (!form.tomadorCidadeNome.trim() || !form.tomadorUf.trim()) return 'Informe a cidade e UF do tomador'
    return null
  }

  const emitir = async () => {
    const err = validar()
    if (err) { setErro(err); return }
    setErro(null)
    setEmitido(null)
    setLoadingEmitir(true)

    const valorNum = Number(form.valor)
    const issRateNum = Number(form.issRate) / 100

    const payload = {
      ambiente: form.ambiente,
      integrationId: form.integrationId,
      referenceCode: form.referenceCode || undefined,
      federalServiceCode: form.federalServiceCode,
      cityServiceCode: form.cityServiceCode,
      description: form.descricao,
      total: {
        invoiceAmount: valorNum,
        issRate: issRateNum,
        issAmount: +(valorNum * issRateNum).toFixed(2),
        issWithheld: form.issWithheld,
      },
      receiver: {
        name: form.tomadorNome,
        federalTaxNumber: fmt(form.tomadorTaxId),
        email: form.tomadorEmail,
        address: {
          street: form.tomadorRua,
          number: form.tomadorNumero,
          district: form.tomadorBairro,
          postalCode: fmt(form.tomadorCep),
          city: form.tomadorCidadeIbge
            ? { code: form.tomadorCidadeIbge }
            : { name: form.tomadorCidadeNome, state: form.tomadorUf },
        },
      },
    }

    try {
      const res = await authFetch(`${API_URL}/api/nfse/spedy/emitir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErro(data?.message || 'Erro ao emitir NFS-e.')
        return
      }
      setEmitido(data)
      if (data?.providerResponse?.id) setConsultaId(data.providerResponse.id)
    } catch {
      setErro('Falha de comunicação com o servidor.')
    } finally {
      setLoadingEmitir(false)
    }
  }

  const consultarStatus = async () => {
    if (!consultaId.trim()) { setErro('Informe o ID da NFS-e.'); return }
    setErro(null)
    setResultado(null)
    setLoadingConsultar(true)
    try {
      const res = await authFetch(`${API_URL}/api/nfse/spedy/${consultaId}/status`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(data?.message || 'Erro ao consultar.'); return }
      setResultado(data)
    } catch {
      setErro('Falha de comunicação com o servidor.')
    } finally {
      setLoadingConsultar(false)
    }
  }

  const statusInfo = (status: string) => STATUS_LABELS[status] ?? { label: status, color: 'bg-gray-100 text-gray-700' }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ReceiptText className="h-6 w-6 text-blue-600" />
          Emissão de NFS-e
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Emita notas fiscais de serviço diretamente pela Spedy (prefeitura).
        </p>
      </div>

      {/* Erro */}
      {erro && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {/* Confirmação de emissão */}
      {emitido && (
        <Alert className="border-green-300 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            NFS-e enviada com sucesso! ID: <strong>{emitido?.providerResponse?.id}</strong> —{' '}
            Status: <strong>{statusInfo(emitido?.providerResponse?.status).label}</strong>
          </AlertDescription>
        </Alert>
      )}

      {/* Identificação */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Identificação
          </CardTitle>
          <CardDescription>Referencie esta emissão ao pedido ou medição do sistema.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>ID de Integração <span className="text-red-500">*</span></Label>
            <Input
              value={form.integrationId}
              onChange={e => set('integrationId', e.target.value)}
              placeholder="medicao-2026-001"
            />
            <p className="text-xs text-muted-foreground">ID único da medição ou pedido no seu sistema.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Código de Referência</Label>
            <Input
              value={form.referenceCode}
              onChange={e => set('referenceCode', e.target.value)}
              placeholder="CONTRATO-2026-001"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ambiente <span className="text-red-500">*</span></Label>
            <Select value={form.ambiente} onValueChange={v => set('ambiente', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="development">Homologação</SelectItem>
                <SelectItem value="production">Produção</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Serviço */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ReceiptText className="h-4 w-4 text-muted-foreground" />
            Serviço Prestado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Código Federal (LC 116/03) <span className="text-red-500">*</span></Label>
              <Input
                value={form.federalServiceCode}
                onChange={e => set('federalServiceCode', e.target.value)}
                placeholder="1.07"
              />
              <p className="text-xs text-muted-foreground">Ex: 1.07 suporte TI, 17.01 consultoria</p>
            </div>
            <div className="space-y-1.5">
              <Label>Código Municipal <span className="text-red-500">*</span></Label>
              <Input
                value={form.cityServiceCode}
                onChange={e => set('cityServiceCode', e.target.value)}
                placeholder="0107"
              />
              <p className="text-xs text-muted-foreground">Código específico da prefeitura.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Valor do Serviço (R$) <span className="text-red-500">*</span></Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={form.valor}
                onChange={e => set('valor', e.target.value)}
                placeholder="1500.00"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Discriminação dos Serviços <span className="text-red-500">*</span></Label>
            <Textarea
              rows={3}
              value={form.descricao}
              onChange={e => set('descricao', e.target.value)}
              placeholder="Ex.: Prestação de serviços de manutenção predial ref. medição nº 01 — Contrato 001/2026..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            <div className="space-y-1.5">
              <Label>Alíquota ISS (%)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="10"
                value={form.issRate}
                onChange={e => set('issRate', e.target.value)}
                placeholder="5"
              />
            </div>
            <div className="space-y-1.5">
              <Label>ISS Retido na Fonte?</Label>
              <Select
                value={form.issWithheld ? 'sim' : 'nao'}
                onValueChange={v => set('issWithheld', v === 'sim')}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao">Não (prestador recolhe)</SelectItem>
                  <SelectItem value="sim">Sim (tomador retém)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.valor && Number(form.valor) > 0 && (
              <div className="space-y-1.5">
                <Label>ISS Calculado</Label>
                <div className="flex items-center h-10 px-3 rounded-md border bg-muted text-sm font-medium">
                  R$ {(Number(form.valor) * Number(form.issRate) / 100).toFixed(2)}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tomador */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Tomador do Serviço
          </CardTitle>
          <CardDescription>Dados do órgão ou empresa que contratou o serviço.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>CPF / CNPJ <span className="text-red-500">*</span></Label>
              <Input
                value={form.tomadorTaxId}
                onChange={e => set('tomadorTaxId', e.target.value)}
                placeholder="00.000.000/0001-00"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Razão Social <span className="text-red-500">*</span></Label>
              <Input
                value={form.tomadorNome}
                onChange={e => set('tomadorNome', e.target.value)}
                placeholder="Prefeitura Municipal de..."
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>E-mail <span className="text-red-500">*</span></Label>
            <Input
              type="email"
              value={form.tomadorEmail}
              onChange={e => set('tomadorEmail', e.target.value)}
              placeholder="fiscal@prefeitura.gov.br"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Logradouro <span className="text-red-500">*</span></Label>
              <Input
                value={form.tomadorRua}
                onChange={e => set('tomadorRua', e.target.value)}
                placeholder="Rua das Acácias"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Número</Label>
              <Input
                value={form.tomadorNumero}
                onChange={e => set('tomadorNumero', e.target.value)}
                placeholder="100"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Bairro</Label>
              <Input
                value={form.tomadorBairro}
                onChange={e => set('tomadorBairro', e.target.value)}
                placeholder="Centro"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>CEP <span className="text-red-500">*</span></Label>
              <Input
                value={form.tomadorCep}
                onChange={e => set('tomadorCep', e.target.value)}
                placeholder="00000-000"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cód. IBGE da Cidade</Label>
              <Input
                value={form.tomadorCidadeIbge}
                onChange={e => set('tomadorCidadeIbge', e.target.value)}
                placeholder="3550308"
              />
              <p className="text-xs text-muted-foreground">Recomendado. Se informado, ignora nome/UF.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Cidade <span className="text-red-500">*</span></Label>
              <Input
                value={form.tomadorCidadeNome}
                onChange={e => set('tomadorCidadeNome', e.target.value)}
                placeholder="São Paulo"
                disabled={!!form.tomadorCidadeIbge}
              />
            </div>
            <div className="space-y-1.5">
              <Label>UF <span className="text-red-500">*</span></Label>
              <Input
                value={form.tomadorUf}
                onChange={e => set('tomadorUf', e.target.value.toUpperCase())}
                placeholder="SP"
                maxLength={2}
                disabled={!!form.tomadorCidadeIbge}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ação */}
      <div className="flex justify-end">
        <Button size="lg" onClick={emitir} disabled={loadingEmitir}>
          {loadingEmitir ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ReceiptText className="h-4 w-4 mr-2" />}
          Emitir NFS-e
        </Button>
      </div>

      {/* Consultar status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            Consultar Status
          </CardTitle>
          <CardDescription>Acompanhe o processamento da NFS-e pela prefeitura usando o ID retornado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Input
              value={consultaId}
              onChange={e => setConsultaId(e.target.value)}
              placeholder="UUID da NFS-e (retornado na emissão)"
              className="flex-1"
            />
            <Button onClick={consultarStatus} disabled={loadingConsultar} variant="outline">
              {loadingConsultar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-2">Consultar</span>
            </Button>
          </div>

          {resultado && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusInfo(resultado?.providerResponse?.status ?? resultado?.status).color}`}>
                  {statusInfo(resultado?.providerResponse?.status ?? resultado?.status).label}
                </span>
                {(resultado?.providerResponse?.number ?? resultado?.number) && (
                  <Badge variant="outline">NFS-e nº {resultado?.providerResponse?.number ?? resultado?.number}</Badge>
                )}
                {(resultado?.providerResponse?.issuedOn ?? resultado?.issuedOn) && (
                  <span className="text-sm text-muted-foreground">
                    Autorizada em {new Date(resultado?.providerResponse?.issuedOn ?? resultado?.issuedOn).toLocaleString('pt-BR')}
                  </span>
                )}
              </div>

              {(resultado?.providerResponse?.processingDetail?.message || resultado?.processingDetail?.message) && (
                <Alert variant="destructive" className="py-2">
                  <AlertDescription className="text-xs">
                    {resultado?.providerResponse?.processingDetail?.message ?? resultado?.processingDetail?.message}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2 flex-wrap">
                {resultado?.providerResponse?.id && (
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={`https://api.spedy.com.br/v1/service-invoices/${resultado.providerResponse.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FileText className="h-3.5 w-3.5 mr-1.5" />
                      Baixar PDF
                    </a>
                  </Button>
                )}
              </div>

              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver resposta completa</summary>
                <pre className="mt-2 bg-muted p-3 rounded-lg overflow-auto">{JSON.stringify(resultado, null, 2)}</pre>
              </details>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

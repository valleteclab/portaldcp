'use client'

import { useMemo, useState } from 'react'
import { API_URL, authFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, ReceiptText, Search } from 'lucide-react'

interface FormNfse {
  integrationId: string
  referenceCode: string
  environment: 'homolog' | 'production'
  companyTaxId: string
  municipalServiceCode: string
  description: string
  serviceValue: string
  customerTaxId: string
  customerLegalName: string
  customerEmail: string
}

const initialForm: FormNfse = {
  integrationId: '',
  referenceCode: '',
  environment: 'homolog',
  companyTaxId: '',
  municipalServiceCode: '',
  description: '',
  serviceValue: '',
  customerTaxId: '',
  customerLegalName: '',
  customerEmail: '',
}

const onlyDigits = (value: string) => value.replace(/\D/g, '')

export default function FornecedorNfseSpedyPage() {
  const [form, setForm] = useState<FormNfse>(initialForm)
  const [consultaId, setConsultaId] = useState('')
  const [modoAvancado, setModoAvancado] = useState(false)
  const [payloadAvancado, setPayloadAvancado] = useState('')

  const [loadingEmitir, setLoadingEmitir] = useState(false)
  const [loadingConsultar, setLoadingConsultar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<any>(null)

  const payloadGerado = useMemo(() => {
    return {
      environment: form.environment,
      companyTaxId: onlyDigits(form.companyTaxId),
      municipalServiceCode: form.municipalServiceCode,
      description: form.description,
      serviceValue: Number(form.serviceValue || 0),
      customer: {
        taxId: onlyDigits(form.customerTaxId),
        legalName: form.customerLegalName,
        email: form.customerEmail,
      },
    }
  }, [form])

  const payloadFinal = useMemo(() => {
    if (!modoAvancado) return payloadGerado
    try {
      return JSON.parse(payloadAvancado)
    } catch {
      return null
    }
  }, [modoAvancado, payloadAvancado, payloadGerado])

  const errosFormulario = useMemo(() => {
    const erros: string[] = []
    if (!form.integrationId.trim()) erros.push('integrationId é obrigatório')
    if (onlyDigits(form.companyTaxId).length !== 14) erros.push('CNPJ do emitente inválido')
    if (!form.municipalServiceCode.trim()) erros.push('Código de serviço municipal é obrigatório')
    if (!form.description.trim()) erros.push('Descrição do serviço é obrigatória')
    if (!form.serviceValue || Number(form.serviceValue) <= 0) erros.push('Valor do serviço deve ser maior que zero')
    if (onlyDigits(form.customerTaxId).length < 11) erros.push('CPF/CNPJ do tomador inválido')
    if (!form.customerLegalName.trim()) erros.push('Razão social do tomador é obrigatória')
    if (!form.customerEmail.trim()) erros.push('E-mail do tomador é obrigatório')
    if (modoAvancado && !payloadFinal) erros.push('JSON do modo avançado inválido')
    return erros
  }, [form, modoAvancado, payloadFinal])

  const emitir = async () => {
    setErro(null)
    setResultado(null)

    if (errosFormulario.length > 0) {
      setErro(`Revise os campos obrigatórios: ${errosFormulario[0]}.`)
      return
    }

    setLoadingEmitir(true)
    try {
      const res = await authFetch(`${API_URL}/api/nfse/spedy/emitir`, {
        method: 'POST',
        body: JSON.stringify({
          integrationId: form.integrationId,
          referenceCode: form.referenceCode || undefined,
          payload: payloadFinal,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErro(data?.message || 'Erro ao emitir NFS-e na Spedy.')
        return
      }
      setResultado(data)
      if (!consultaId && data?.providerResponse?.id) {
        setConsultaId(data.providerResponse.id)
      }
    } catch {
      setErro('Falha de comunicação ao emitir NFS-e.')
    } finally {
      setLoadingEmitir(false)
    }
  }

  const consultarStatus = async () => {
    setErro(null)
    setResultado(null)

    if (!consultaId.trim()) {
      setErro('Informe o ID da NFS-e para consulta.')
      return
    }

    setLoadingConsultar(true)
    try {
      const res = await authFetch(`${API_URL}/api/nfse/spedy/${consultaId}/status`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErro(data?.message || 'Erro ao consultar status da NFS-e.')
        return
      }
      setResultado(data)
    } catch {
      setErro('Falha de comunicação ao consultar status.')
    } finally {
      setLoadingConsultar(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ReceiptText className="h-6 w-6 text-blue-600" />
          Emissão NFS-e (Spedy)
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Fluxo guiado de emissão com dados fiscais essenciais do serviço e do tomador.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados da NFS-e</CardTitle>
          <CardDescription>
            Preencha os dados básicos para emissão. O payload é montado automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>integrationId *</Label>
              <Input value={form.integrationId} onChange={(e) => setForm({ ...form, integrationId: e.target.value })} placeholder="ordem-123-medicao-01" />
            </div>
            <div className="space-y-2">
              <Label>referenceCode</Label>
              <Input value={form.referenceCode} onChange={(e) => setForm({ ...form, referenceCode: e.target.value })} placeholder="CONTRATO-2026-001" />
            </div>
            <div className="space-y-2">
              <Label>Ambiente *</Label>
              <Select value={form.environment} onValueChange={(v: 'homolog' | 'production') => setForm({ ...form, environment: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="homolog">Homologação</SelectItem>
                  <SelectItem value="production">Produção</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>CNPJ Emitente *</Label>
              <Input value={form.companyTaxId} onChange={(e) => setForm({ ...form, companyTaxId: e.target.value })} placeholder="00.000.000/0001-00" />
            </div>
            <div className="space-y-2">
              <Label>Código Serviço Municipal *</Label>
              <Input value={form.municipalServiceCode} onChange={(e) => setForm({ ...form, municipalServiceCode: e.target.value })} placeholder="0107" />
            </div>
            <div className="space-y-2">
              <Label>Valor do Serviço (R$) *</Label>
              <Input type="number" step="0.01" min="0" value={form.serviceValue} onChange={(e) => setForm({ ...form, serviceValue: e.target.value })} placeholder="1500.00" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descrição do Serviço *</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex.: Prestação de serviços técnicos especializados referentes ao contrato..." />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>CPF/CNPJ Tomador *</Label>
              <Input value={form.customerTaxId} onChange={(e) => setForm({ ...form, customerTaxId: e.target.value })} placeholder="00.000.000/0001-00" />
            </div>
            <div className="space-y-2">
              <Label>Razão Social Tomador *</Label>
              <Input value={form.customerLegalName} onChange={(e) => setForm({ ...form, customerLegalName: e.target.value })} placeholder="Prefeitura Municipal..." />
            </div>
            <div className="space-y-2">
              <Label>E-mail Tomador *</Label>
              <Input type="email" value={form.customerEmail} onChange={(e) => setForm({ ...form, customerEmail: e.target.value })} placeholder="fiscal@orgao.gov.br" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant={modoAvancado ? 'default' : 'outline'} onClick={() => setModoAvancado(v => !v)}>
              {modoAvancado ? 'Desativar modo avançado' : 'Ativar modo avançado (JSON)'}
            </Button>
            <Badge variant={errosFormulario.length === 0 ? 'default' : 'destructive'}>
              {errosFormulario.length === 0 ? 'Pronto para emitir' : `${errosFormulario.length} pendência(s)`}
            </Badge>
          </div>

          {modoAvancado && (
            <div className="space-y-2">
              <Label>Payload JSON manual</Label>
              <Textarea
                className="font-mono text-xs min-h-[220px]"
                value={payloadAvancado}
                onChange={(e) => setPayloadAvancado(e.target.value)}
                placeholder={JSON.stringify(payloadGerado, null, 2)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Preview payload enviado</Label>
            <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto">{JSON.stringify(payloadFinal || payloadGerado, null, 2)}</pre>
          </div>

          <Button onClick={emitir} disabled={loadingEmitir || errosFormulario.length > 0}>
            {loadingEmitir ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Emitir NFS-e
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Consultar Status</CardTitle>
          <CardDescription>
            Consulte o processamento da NFS-e usando o ID retornado pela emissão.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-3">
          <Input value={consultaId} onChange={(e) => setConsultaId(e.target.value)} placeholder="ID da NFS-e na Spedy" />
          <Button onClick={consultarStatus} disabled={loadingConsultar} variant="outline">
            {loadingConsultar ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
            Consultar
          </Button>
        </CardContent>
      </Card>

      {erro && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 text-sm text-red-700">{erro}</CardContent>
        </Card>
      )}

      {resultado && (
        <Card>
          <CardHeader>
            <CardTitle>Resposta</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto">{JSON.stringify(resultado, null, 2)}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

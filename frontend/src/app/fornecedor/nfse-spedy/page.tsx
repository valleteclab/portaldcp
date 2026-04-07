'use client'

import { useMemo, useState } from 'react'
import { API_URL, authFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Loader2, ReceiptText, Search } from 'lucide-react'

const EXEMPLO_PAYLOAD = JSON.stringify(
  {
    environment: 'homolog',
    companyTaxId: '12345678000199',
    municipalServiceCode: '0107',
    description: 'Serviços técnicos especializados',
    serviceValue: 1500.0,
    customer: {
      taxId: '00999999000199',
      legalName: 'PREFEITURA EXEMPLO',
      email: 'fiscal@orgao.gov.br',
    },
  },
  null,
  2,
)

export default function FornecedorNfseSpedyPage() {
  const [integrationId, setIntegrationId] = useState('')
  const [referenceCode, setReferenceCode] = useState('')
  const [payloadJson, setPayloadJson] = useState(EXEMPLO_PAYLOAD)
  const [consultaId, setConsultaId] = useState('')

  const [loadingEmitir, setLoadingEmitir] = useState(false)
  const [loadingConsultar, setLoadingConsultar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<any>(null)

  const payloadValido = useMemo(() => {
    try {
      JSON.parse(payloadJson)
      return true
    } catch {
      return false
    }
  }, [payloadJson])

  const emitir = async () => {
    setErro(null)
    setResultado(null)

    if (!integrationId.trim()) {
      setErro('Informe o integrationId.')
      return
    }

    if (!payloadValido) {
      setErro('O JSON do payload está inválido.')
      return
    }

    setLoadingEmitir(true)
    try {
      const payload = JSON.parse(payloadJson)
      const res = await authFetch(`${API_URL}/api/nfse/spedy/emitir`, {
        method: 'POST',
        body: JSON.stringify({
          integrationId,
          referenceCode: referenceCode || undefined,
          payload,
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
          Novo módulo isolado para fornecedor emitir e consultar NFS-e sem alterar fluxos antigos.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Emitir NFS-e</CardTitle>
          <CardDescription>
            Preencha os campos e envie o payload no formato esperado pela Spedy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>integrationId *</Label>
              <Input
                value={integrationId}
                onChange={(e) => setIntegrationId(e.target.value)}
                placeholder="of-123-medicao-04"
              />
            </div>
            <div className="space-y-2">
              <Label>referenceCode (opcional)</Label>
              <Input
                value={referenceCode}
                onChange={(e) => setReferenceCode(e.target.value)}
                placeholder="CONTRATO-2026-001"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Payload JSON *</Label>
              <Badge variant={payloadValido ? 'default' : 'destructive'}>
                {payloadValido ? 'JSON válido' : 'JSON inválido'}
              </Badge>
            </div>
            <Textarea
              className="font-mono text-xs min-h-[260px]"
              value={payloadJson}
              onChange={(e) => setPayloadJson(e.target.value)}
            />
          </div>

          <Button onClick={emitir} disabled={loadingEmitir || !payloadValido}>
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
          <Input
            value={consultaId}
            onChange={(e) => setConsultaId(e.target.value)}
            placeholder="ID da NFS-e na Spedy"
          />
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

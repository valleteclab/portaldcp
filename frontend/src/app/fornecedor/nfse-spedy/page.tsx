'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react'
import { API_URL, authFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, ReceiptText, Search, CheckCircle2, AlertCircle, FileText, Building2, User, Calculator, Info } from 'lucide-react'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  enqueued: { label: 'Na fila', color: 'bg-yellow-100 text-yellow-800' },
  created: { label: 'Criada', color: 'bg-gray-100 text-gray-700' },
  authorized: { label: 'Autorizada', color: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rejeitada', color: 'bg-red-100 text-red-800' },
  canceled: { label: 'Cancelada', color: 'bg-red-100 text-red-800' },
  received: { label: 'Recebida', color: 'bg-blue-100 text-blue-800' },
}

const LC116_CODES = [
  { code: '1.01', desc: 'Análise e desenvolvimento de sistemas' },
  { code: '1.02', desc: 'Programação' },
  { code: '1.03', desc: 'Processamento de dados e congêneres' },
  { code: '1.04', desc: 'Elaboração de programas de computadores' },
  { code: '1.05', desc: 'Licenciamento ou cessão de direito de uso de programas' },
  { code: '1.06', desc: 'Assessoria e consultoria em informática' },
  { code: '1.07', desc: 'Suporte técnico em informática' },
  { code: '1.08', desc: 'Planejamento, confecção, manutenção e atualização de páginas eletrônicas' },
  { code: '7.01', desc: 'Engenharia, agronomia, agrimensura, arquitetura, geologia, urbanismo' },
  { code: '7.02', desc: 'Execução, por administração, empreitada ou subempreitada, de obras de construção civil' },
  { code: '7.03', desc: 'Elaboração de planos diretores, estudos de viabilidade' },
  { code: '7.04', desc: 'Demolição' },
  { code: '7.05', desc: 'Reparação, conservação e reforma de edifícios' },
  { code: '7.09', desc: 'Varrição, coleta, remoção, incineração, tratamento, reciclagem de lixo' },
  { code: '7.10', desc: 'Limpeza, manutenção e conservação de imóveis' },
  { code: '11.01', desc: 'Guarda e estacionamento de veículos' },
  { code: '11.02', desc: 'Vigilância, segurança ou monitoramento de bens e pessoas' },
  { code: '11.03', desc: 'Escolta, exceto serviço de segurança' },
  { code: '11.04', desc: 'Armazenamento, depósito, carga, descarga, arrumação e guarda de bens' },
  { code: '14.01', desc: 'Lubrificação, limpeza, lustração e revisão de máquinas, veículos e equipamentos' },
  { code: '14.05', desc: 'Restauração, recondicionamento, acondicionamento, pintura' },
  { code: '17.01', desc: 'Assessoria ou consultoria de qualquer natureza' },
  { code: '17.02', desc: 'Análise, exame, pesquisa, coleta, compilação e fornecimento de dados e informações' },
  { code: '17.05', desc: 'Fornecimento de mão de obra, mesmo em caráter temporário' },
  { code: '17.06', desc: 'Propaganda e publicidade' },
  { code: '17.10', desc: 'Serviços de agenciamento e intermediação em geral' },
  { code: '17.11', desc: 'Administração em geral' },
  { code: '17.12', desc: 'Leilão e congêneres' },
  { code: '17.20', desc: 'Serviços de gerenciamento de projetos' },
  { code: '22.01', desc: 'Planos de medicina de grupo ou individual' },
  { code: '26.01', desc: 'Serviços de coleta e processamento de dados' },
]

interface FornecedorDados {
  spedyVinculado: boolean
  cnpj: string
  razaoSocial: string
  nomeFantasia: string | null
  email: string
  cidade: string
  uf: string
  cep: string
  taxRegime: string
}

function fmt(v: string) {
  return v.replace(/\D/g, '')
}

interface Emissao {
  // Identificação
  integrationId: string
  referenceCode: string
  ambiente: 'development' | 'production'
  nbsCode: string
  nationalTaxationCode: string
  rpsSeries: string
  // Serviço
  federalServiceCode: string
  cityServiceCode: string
  descricao: string
  valor: string
  // ISS
  issRate: string
  issWithheld: boolean
  discountUnconditioned: string
  discountConditioned: string
  // Tributos federais
  irRate: string
  irWithheld: boolean
  csllRate: string
  csllWithheld: boolean
  pisRate: string
  pisWithheld: boolean
  cofinsRate: string
  cofinsWithheld: boolean
  inssRate: string
  inssWithheld: boolean
  // Tomador
  tomadorTaxId: string
  tomadorNome: string
  tomadorEmail: string
  tomadorPhone: string
  tomadorRua: string
  tomadorNumero: string
  tomadorComplemento: string
  tomadorBairro: string
  tomadorCep: string
  tomadorCidadeIbge: string
  tomadorCidadeNome: string
  tomadorUf: string
  tomadorPais: string
}

const EMPTY: Emissao = {
  integrationId: '',
  referenceCode: '',
  ambiente: 'development',
  nbsCode: '',
  nationalTaxationCode: '',
  rpsSeries: '',
  federalServiceCode: '',
  cityServiceCode: '',
  descricao: '',
  valor: '',
  issRate: '5',
  issWithheld: false,
  discountUnconditioned: '',
  discountConditioned: '',
  irRate: '',
  irWithheld: true,
  csllRate: '',
  csllWithheld: true,
  pisRate: '',
  pisWithheld: true,
  cofinsRate: '',
  cofinsWithheld: true,
  inssRate: '',
  inssWithheld: true,
  tomadorTaxId: '',
  tomadorNome: '',
  tomadorEmail: '',
  tomadorPhone: '',
  tomadorRua: '',
  tomadorNumero: '',
  tomadorComplemento: '',
  tomadorBairro: '',
  tomadorCep: '',
  tomadorCidadeIbge: '',
  tomadorCidadeNome: '',
  tomadorUf: '',
  tomadorPais: 'BRA',
}

function brl(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function calcTax(base: number, rateStr: string) {
  const r = parseFloat(rateStr)
  if (!rateStr || isNaN(r) || r <= 0) return 0
  return +(base * r / 100).toFixed(2)
}

function TaxRow({
  label, hint, rate, onRate, amount, withheld, onWithheld
}: {
  label: string; hint?: string; rate: string; onRate: (v: string) => void
  amount: number; withheld: boolean; onWithheld: (v: boolean) => void
}) {
  return (
    <div className="grid grid-cols-12 gap-2 items-center py-2 border-b last:border-0">
      <div className="col-span-3">
        <span className="text-sm font-medium">{label}</span>
        {hint && <p className="text-xs text-muted-foreground leading-tight mt-0.5">{hint}</p>}
      </div>
      <div className="col-span-3">
        <div className="relative">
          <Input
            type="number" step="0.01" min="0" max="100"
            value={rate} onChange={e => onRate(e.target.value)}
            placeholder="0,00" className="pr-6 text-sm"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
        </div>
      </div>
      <div className="col-span-3">
        <div className="flex items-center h-9 px-3 rounded-md border bg-muted text-sm font-medium tabular-nums">
          {amount > 0 ? `R$ ${brl(amount)}` : <span className="text-muted-foreground text-xs">—</span>}
        </div>
      </div>
      <div className="col-span-3">
        <Select value={withheld ? 'sim' : 'nao'} onValueChange={v => onWithheld(v === 'sim')}>
          <SelectTrigger className="text-sm h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sim">Retido</SelectItem>
            <SelectItem value="nao">Não retido</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

export default function FornecedorNfseSpedyPage() {
  const [form, setForm] = useState<Emissao>(EMPTY)
  const [fornecedor, setFornecedor] = useState<FornecedorDados | null>(null)
  const [loadingFornecedor, setLoadingFornecedor] = useState(true)
  const [loadingTomadorCnpj, setLoadingTomadorCnpj] = useState(false)
  const [consultaId, setConsultaId] = useState('')
  const [loadingEmitir, setLoadingEmitir] = useState(false)
  const [loadingConsultar, setLoadingConsultar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<any>(null)
  const [emitido, setEmitido] = useState<any>(null)

  const set = (field: keyof Emissao, value: any) => setForm(f => ({ ...f, [field]: value }))
  const statusInfo = (status: string) => STATUS_LABELS[status] ?? { label: status, color: 'bg-gray-100 text-gray-700' }

  // Cálculos tributários em tempo real
  const calc = useMemo(() => {
    const bruto = parseFloat(form.valor) || 0
    const descIncond = parseFloat(form.discountUnconditioned) || 0
    const descCond = parseFloat(form.discountConditioned) || 0
    const baseISS = Math.max(0, bruto - descIncond - descCond)
    const issRate = parseFloat(form.issRate) || 0
    const issAmount = +(baseISS * issRate / 100).toFixed(2)
    const irAmount = calcTax(bruto, form.irRate)
    const csllAmount = calcTax(bruto, form.csllRate)
    const pisAmount = calcTax(bruto, form.pisRate)
    const cofinsAmount = calcTax(bruto, form.cofinsRate)
    const inssAmount = calcTax(bruto, form.inssRate)
    const totalRetencoes = (form.issWithheld ? issAmount : 0) + irAmount + csllAmount + pisAmount + cofinsAmount + inssAmount
    const liquido = bruto - totalRetencoes
    return { bruto, descIncond, descCond, baseISS, issRate, issAmount, irAmount, csllAmount, pisAmount, cofinsAmount, inssAmount, totalRetencoes, liquido }
  }, [form.valor, form.discountUnconditioned, form.discountConditioned, form.issRate, form.issWithheld, form.irRate, form.csllRate, form.pisRate, form.cofinsRate, form.inssRate])

  useEffect(() => {
    authFetch(`${API_URL}/api/nfse/spedy/meus-dados`)
      .then(r => r.json())
      .then(d => setFornecedor(d))
      .catch(() => {})
      .finally(() => setLoadingFornecedor(false))
  }, [])

  const buscarCnpjTomador = async () => {
    const cnpj = fmt(form.tomadorTaxId)
    if (cnpj.length !== 14) return
    setLoadingTomadorCnpj(true)
    try {
      const res = await authFetch(`${API_URL}/api/fornecedores/consultar-cnpj/${cnpj}`)
      const d = await res.json()
      if (!res.ok) return
      setForm(f => ({
        ...f,
        tomadorNome: d.razao_social || f.tomadorNome,
        tomadorEmail: d.email || f.tomadorEmail,
        tomadorRua: d.endereco?.logradouro || f.tomadorRua,
        tomadorNumero: d.endereco?.numero || f.tomadorNumero,
        tomadorBairro: d.endereco?.bairro || f.tomadorBairro,
        tomadorCep: d.endereco?.cep || f.tomadorCep,
        tomadorCidadeNome: d.endereco?.cidade || f.tomadorCidadeNome,
        tomadorUf: d.endereco?.uf || f.tomadorUf,
      }))
    } catch { /* silencioso */ } finally {
      setLoadingTomadorCnpj(false)
    }
  }

  const validar = (): string | null => {
    if (!form.integrationId.trim()) return 'Informe o ID de integração'
    if (!form.federalServiceCode.trim()) return 'Selecione o código de serviço LC 116/03'
    if (!form.cityServiceCode.trim()) return 'Informe o código municipal de serviço'
    if (!form.descricao.trim()) return 'Informe a discriminação dos serviços'
    if (!form.valor || Number(form.valor) <= 0) return 'Informe o valor do serviço'
    if (fmt(form.tomadorTaxId).length < 11) return 'CPF/CNPJ do tomador inválido'
    if (!form.tomadorNome.trim()) return 'Informe a razão social do tomador'
    if (!form.tomadorEmail.trim()) return 'Informe o e-mail do tomador'
    if (!form.tomadorRua.trim() || !form.tomadorCep.trim()) return 'Informe o endereço do tomador'
    if (!form.tomadorCidadeNome.trim() || !form.tomadorUf.trim()) return 'Informe cidade e UF do tomador'
    return null
  }

  const emitir = async () => {
    const err = validar()
    if (err) { setErro(err); return }
    setErro(null); setEmitido(null); setLoadingEmitir(true)

    const { bruto, baseISS, issAmount, irAmount, csllAmount, pisAmount, cofinsAmount, inssAmount, descIncond, descCond } = calc
    const issRateNum = parseFloat(form.issRate) / 100

    const total: Record<string, any> = {
      invoiceAmount: bruto,
      issBaseTax: baseISS,
      issRate: issRateNum,
      issAmount,
      issWithheld: form.issWithheld,
    }
    if (descIncond > 0) total.discountUnconditionedAmount = descIncond
    if (descCond > 0) total.discountConditionedAmount = descCond
    if (form.irRate) { total.irRate = parseFloat(form.irRate) / 100; total.irAmount = irAmount; total.irWithheld = form.irWithheld }
    if (form.csllRate) { total.csllRate = parseFloat(form.csllRate) / 100; total.csllAmount = csllAmount; total.csllWithheld = form.csllWithheld }
    if (form.pisRate) { total.pisRate = parseFloat(form.pisRate) / 100; total.pisAmount = pisAmount; total.pisWithheld = form.pisWithheld }
    if (form.cofinsRate) { total.cofinsRate = parseFloat(form.cofinsRate) / 100; total.cofinsAmount = cofinsAmount; total.cofinsWithheld = form.cofinsWithheld }
    if (form.inssRate) { total.inssRate = parseFloat(form.inssRate) / 100; total.inssAmount = inssAmount; total.inssWithheld = form.inssWithheld }

    const payload: Record<string, any> = {
      ambiente: form.ambiente,
      integrationId: form.integrationId,
      federalServiceCode: form.federalServiceCode,
      cityServiceCode: form.cityServiceCode,
      description: form.descricao,
      total,
      receiver: {
        name: form.tomadorNome,
        federalTaxNumber: fmt(form.tomadorTaxId),
        email: form.tomadorEmail,
        ...(form.tomadorPhone ? { phone: fmt(form.tomadorPhone) } : {}),
        address: {
          street: form.tomadorRua,
          ...(form.tomadorNumero ? { number: form.tomadorNumero } : {}),
          ...(form.tomadorComplemento ? { complement: form.tomadorComplemento } : {}),
          ...(form.tomadorBairro ? { district: form.tomadorBairro } : {}),
          postalCode: fmt(form.tomadorCep),
          ...(form.tomadorPais ? { country: form.tomadorPais } : {}),
          city: form.tomadorCidadeIbge
            ? { code: form.tomadorCidadeIbge }
            : { name: form.tomadorCidadeNome, state: form.tomadorUf },
        },
      },
    }
    if (form.referenceCode) payload.referenceCode = form.referenceCode
    if (form.nbsCode) payload.nbsCode = form.nbsCode
    if (form.nationalTaxationCode) payload.nationalTaxationCode = form.nationalTaxationCode
    if (form.rpsSeries) payload.rps = { series: form.rpsSeries }

    try {
      const res = await authFetch(`${API_URL}/api/nfse/spedy/emitir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(data?.message || 'Erro ao emitir NFS-e.'); return }
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
    setErro(null); setResultado(null); setLoadingConsultar(true)
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

  return (
    <div className="p-4 space-y-4">

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ReceiptText className="h-6 w-6 text-blue-600" />
          Emissão de NFS-e
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Nota Fiscal de Serviços Eletrônica — via Spedy</p>
      </div>

      {erro && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {emitido && (
        <Alert className="border-green-300 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 space-y-2">
            <div>
              NFS-e emitida com sucesso! ID Spedy: <strong>{emitido?.providerResponse?.id}</strong>
              {emitido?.providerResponse?.number && <> — Número: <strong>{emitido.providerResponse.number}</strong></>}
              {' '}— Status: <strong>{statusInfo(emitido?.providerResponse?.status).label}</strong>
            </div>
            {emitido?.providerResponse?.id && (
              <div className="flex gap-2 mt-2">
                <a
                  href={`https://api.spedy.com.br/v1/service-invoices/${emitido.providerResponse.id}/pdf`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-green-800 underline underline-offset-2"
                >
                  <FileText className="h-3.5 w-3.5" /> Baixar PDF DANFE
                </a>
                <a
                  href={`https://api.spedy.com.br/v1/service-invoices/${emitido.providerResponse.id}/xml`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-green-800 underline underline-offset-2"
                >
                  <FileText className="h-3.5 w-3.5" /> Baixar XML
                </a>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* 1. PRESTADOR */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            1. Prestador de Serviços
          </CardTitle>
          <CardDescription>Dados carregados automaticamente do seu cadastro.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingFornecedor ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : fornecedor ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><p className="text-xs text-muted-foreground">CNPJ</p><p className="font-medium">{fornecedor.cnpj}</p></div>
              <div className="md:col-span-2"><p className="text-xs text-muted-foreground">Razão Social</p><p className="font-medium">{fornecedor.razaoSocial}</p></div>
              <div>
                <p className="text-xs text-muted-foreground">Regime Tributário</p>
                <Badge variant="outline" className="text-xs mt-0.5">
                  {fornecedor.taxRegime === 'simplesNacionalMEI' ? 'MEI' : fornecedor.taxRegime === 'simplesNacional' ? 'Simples Nacional' : 'Regime Normal'}
                </Badge>
              </div>
              <div><p className="text-xs text-muted-foreground">Cidade / UF</p><p className="font-medium">{fornecedor.cidade} — {fornecedor.uf?.toUpperCase()}</p></div>
              <div className="md:col-span-2"><p className="text-xs text-muted-foreground">E-mail</p><p className="font-medium">{fornecedor.email}</p></div>
              <div>
                <p className="text-xs text-muted-foreground">Spedy</p>
                <Badge className={fornecedor.spedyVinculado ? 'bg-green-100 text-green-800 text-xs' : 'bg-yellow-100 text-yellow-800 text-xs'}>
                  {fornecedor.spedyVinculado ? 'Chave própria' : 'Chave global'}
                </Badge>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Não foi possível carregar os dados do cadastro.</p>
          )}
        </CardContent>
      </Card>

      {/* 2. IDENTIFICAÇÃO */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            2. Identificação da Nota
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>ID de Integração <span className="text-red-500">*</span></Label>
              <Input value={form.integrationId} onChange={e => set('integrationId', e.target.value)} placeholder="medicao-2026-001" />
              <p className="text-xs text-muted-foreground">Identificador único desta nota no seu sistema.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Código de Referência</Label>
              <Input value={form.referenceCode} onChange={e => set('referenceCode', e.target.value)} placeholder="CONTRATO-2026-001" />
              <p className="text-xs text-muted-foreground">Ex.: número do contrato ou pedido.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Ambiente <span className="text-red-500">*</span></Label>
              <Select value={form.ambiente} onValueChange={v => set('ambiente', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="development">Homologação (teste)</SelectItem>
                  <SelectItem value="production">Produção</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                Código NBS
                <span title="Nomenclatura Brasileira de Serviços — exigido a partir de 2026 pela reforma tributária">
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </span>
              </Label>
              <Input value={form.nbsCode} onChange={e => set('nbsCode', e.target.value)} placeholder="1.09.01.00.00" />
              <p className="text-xs text-muted-foreground">Reforma tributária — consulte seu contador.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Código de Tributação Nacional</Label>
              <Input value={form.nationalTaxationCode} onChange={e => set('nationalTaxationCode', e.target.value)} placeholder="Ex.: 14010100" />
            </div>
            <div className="space-y-1.5">
              <Label>Série do RPS</Label>
              <Input value={form.rpsSeries} onChange={e => set('rpsSeries', e.target.value)} placeholder="A" maxLength={5} />
              <p className="text-xs text-muted-foreground">Série do Recibo Provisório de Serviços.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. SERVIÇO */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ReceiptText className="h-4 w-4 text-muted-foreground" />
            3. Serviço Prestado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Código Federal LC 116/2003 <span className="text-red-500">*</span></Label>
              <Select value={form.federalServiceCode} onValueChange={v => set('federalServiceCode', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o serviço..." /></SelectTrigger>
                <SelectContent>
                  {LC116_CODES.map(item => (
                    <SelectItem key={item.code} value={item.code}>{item.code} — {item.desc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Código Municipal do Serviço <span className="text-red-500">*</span></Label>
              <Input value={form.cityServiceCode} onChange={e => set('cityServiceCode', e.target.value)} placeholder="0107" />
              <p className="text-xs text-muted-foreground">Código específico da sua prefeitura (consulte o contador).</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Discriminação dos Serviços <span className="text-red-500">*</span></Label>
            <Textarea rows={4} value={form.descricao} onChange={e => set('descricao', e.target.value)}
              placeholder="Ex.: Prestação de serviços de manutenção predial conforme medição nº 01 — Contrato nº 001/2026 — Período: março/2026..." />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Valor Bruto dos Serviços (R$) <span className="text-red-500">*</span></Label>
              <Input type="number" step="0.01" min="0.01" value={form.valor} onChange={e => set('valor', e.target.value)} placeholder="1500.00" />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                Desconto Incondicional (R$)
                <span title="Desconto concedido sem condição — reduz a base de cálculo do ISS">
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </span>
              </Label>
              <Input type="number" step="0.01" min="0" value={form.discountUnconditioned} onChange={e => set('discountUnconditioned', e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                Desconto Condicional (R$)
                <span title="Desconto sujeito a condição posterior (ex.: pagamento antecipado)">
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </span>
              </Label>
              <Input type="number" step="0.01" min="0" value={form.discountConditioned} onChange={e => set('discountConditioned', e.target.value)} placeholder="0.00" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. TRIBUTOS */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="h-4 w-4 text-muted-foreground" />
            4. Tributos e Retenções
          </CardTitle>
          <CardDescription>Informe as alíquotas. Os valores são calculados automaticamente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* ISS */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">ISS — Imposto Sobre Serviços (Municipal)</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label>Alíquota ISS (%)</Label>
                <div className="relative">
                  <Input type="number" step="0.01" min="0" max="10" value={form.issRate} onChange={e => set('issRate', e.target.value)} placeholder="5.00" className="pr-6" />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Base de Cálculo ISS</Label>
                <div className="flex items-center h-10 px-3 rounded-md border bg-muted text-sm font-medium tabular-nums">
                  R$ {brl(calc.baseISS)}
                </div>
                <p className="text-xs text-muted-foreground">Bruto − descontos</p>
              </div>
              <div className="space-y-1.5">
                <Label>Valor ISS</Label>
                <div className="flex items-center h-10 px-3 rounded-md border bg-muted text-sm font-medium tabular-nums">
                  R$ {brl(calc.issAmount)}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>ISS Retido na Fonte?</Label>
                <Select value={form.issWithheld ? 'sim' : 'nao'} onValueChange={v => set('issWithheld', v === 'sim')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao">Não — prestador recolhe</SelectItem>
                    <SelectItem value="sim">Sim — tomador retém</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Tributos Federais */}
          <div>
            <h3 className="text-sm font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Tributos Federais — Retenções na Fonte</h3>
            <p className="text-xs text-muted-foreground mb-3">Deixe a alíquota em 0 para tributos não aplicáveis.</p>
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground pb-1 border-b">
              <div className="col-span-3">Tributo</div>
              <div className="col-span-3">Alíquota</div>
              <div className="col-span-3">Valor calculado</div>
              <div className="col-span-3">Retenção</div>
            </div>
            <TaxRow
              label="IR"
              hint="Imposto de Renda — retido acima de R$ 666/mês para PJ"
              rate={form.irRate} onRate={v => set('irRate', v)}
              amount={calc.irAmount} withheld={form.irWithheld} onWithheld={v => set('irWithheld', v)}
            />
            <TaxRow
              label="CSLL"
              hint="Contribuição Social sobre o Lucro Líquido — alíquota padrão 1%"
              rate={form.csllRate} onRate={v => set('csllRate', v)}
              amount={calc.csllAmount} withheld={form.csllWithheld} onWithheld={v => set('csllWithheld', v)}
            />
            <TaxRow
              label="PIS"
              hint="PIS/Pasep — alíquota padrão 0,65%"
              rate={form.pisRate} onRate={v => set('pisRate', v)}
              amount={calc.pisAmount} withheld={form.pisWithheld} onWithheld={v => set('pisWithheld', v)}
            />
            <TaxRow
              label="COFINS"
              hint="Contribuição para o Financiamento da Seguridade Social — alíquota padrão 3%"
              rate={form.cofinsRate} onRate={v => set('cofinsRate', v)}
              amount={calc.cofinsAmount} withheld={form.cofinsWithheld} onWithheld={v => set('cofinsWithheld', v)}
            />
            <TaxRow
              label="INSS"
              hint="Contribuição Previdenciária — retido quando o tomador é obrigado (cessão de mão de obra)"
              rate={form.inssRate} onRate={v => set('inssRate', v)}
              amount={calc.inssAmount} withheld={form.inssWithheld} onWithheld={v => set('inssWithheld', v)}
            />
          </div>

          {/* Resumo tributário */}
          <div className="rounded-lg border bg-slate-50 p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Calculator className="h-4 w-4 text-slate-500" />
              Resumo Tributário
            </h3>
            <div className="space-y-1 text-sm font-mono">
              <div className="flex justify-between"><span className="text-muted-foreground">Valor bruto dos serviços</span><span>R$ {brl(calc.bruto)}</span></div>
              {calc.descIncond > 0 && <div className="flex justify-between text-orange-700"><span>(−) Desconto incondicional</span><span>(R$ {brl(calc.descIncond)})</span></div>}
              {calc.descCond > 0 && <div className="flex justify-between text-orange-700"><span>(−) Desconto condicional</span><span>(R$ {brl(calc.descCond)})</span></div>}
              <div className="flex justify-between border-t pt-1"><span className="text-muted-foreground">Base de cálculo ISS</span><span>R$ {brl(calc.baseISS)}</span></div>
              {calc.issAmount > 0 && <div className="flex justify-between text-blue-700"><span>ISS ({form.issRate}%){form.issWithheld ? ' — retido' : ''}</span><span>{form.issWithheld ? '(R$ ' + brl(calc.issAmount) + ')' : 'R$ ' + brl(calc.issAmount)}</span></div>}
              {calc.irAmount > 0 && <div className="flex justify-between text-red-700"><span>IR ({form.irRate}%){form.irWithheld ? ' — retido' : ''}</span><span>{form.irWithheld ? '(R$ ' + brl(calc.irAmount) + ')' : 'R$ ' + brl(calc.irAmount)}</span></div>}
              {calc.csllAmount > 0 && <div className="flex justify-between text-red-700"><span>CSLL ({form.csllRate}%){form.csllWithheld ? ' — retido' : ''}</span><span>{form.csllWithheld ? '(R$ ' + brl(calc.csllAmount) + ')' : 'R$ ' + brl(calc.csllAmount)}</span></div>}
              {calc.pisAmount > 0 && <div className="flex justify-between text-red-700"><span>PIS ({form.pisRate}%){form.pisWithheld ? ' — retido' : ''}</span><span>{form.pisWithheld ? '(R$ ' + brl(calc.pisAmount) + ')' : 'R$ ' + brl(calc.pisAmount)}</span></div>}
              {calc.cofinsAmount > 0 && <div className="flex justify-between text-red-700"><span>COFINS ({form.cofinsRate}%){form.cofinsWithheld ? ' — retido' : ''}</span><span>{form.cofinsWithheld ? '(R$ ' + brl(calc.cofinsAmount) + ')' : 'R$ ' + brl(calc.cofinsAmount)}</span></div>}
              {calc.inssAmount > 0 && <div className="flex justify-between text-red-700"><span>INSS ({form.inssRate}%){form.inssWithheld ? ' — retido' : ''}</span><span>{form.inssWithheld ? '(R$ ' + brl(calc.inssAmount) + ')' : 'R$ ' + brl(calc.inssAmount)}</span></div>}
              <div className="flex justify-between border-t-2 border-slate-300 pt-2 font-bold text-base">
                <span>Valor líquido a receber</span>
                <span className="text-green-700">R$ {brl(calc.liquido)}</span>
              </div>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* 5. TOMADOR */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            5. Tomador do Serviço
          </CardTitle>
          <CardDescription>Informe o CNPJ e clique em buscar para preencher automaticamente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Identificação */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>CNPJ / CPF <span className="text-red-500">*</span></Label>
              <div className="flex gap-2">
                <Input
                  value={form.tomadorTaxId}
                  onChange={e => set('tomadorTaxId', e.target.value)}
                  placeholder="00.000.000/0001-00"
                  className="flex-1"
                />
                <Button
                  type="button" variant="outline" size="icon"
                  onClick={buscarCnpjTomador}
                  disabled={loadingTomadorCnpj || fmt(form.tomadorTaxId).length !== 14}
                  title="Buscar dados na Receita Federal"
                >
                  {loadingTomadorCnpj ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Razão Social / Nome <span className="text-red-500">*</span></Label>
              <Input value={form.tomadorNome} onChange={e => set('tomadorNome', e.target.value)} placeholder="Prefeitura Municipal de..." />
            </div>
          </div>

          {/* Contato */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>E-mail <span className="text-red-500">*</span></Label>
              <Input type="email" value={form.tomadorEmail} onChange={e => set('tomadorEmail', e.target.value)} placeholder="fiscal@orgao.gov.br" />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={form.tomadorPhone} onChange={e => set('tomadorPhone', e.target.value)} placeholder="(00) 00000-0000" />
            </div>
          </div>

          {/* Endereço linha 1 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Logradouro <span className="text-red-500">*</span></Label>
              <Input value={form.tomadorRua} onChange={e => set('tomadorRua', e.target.value)} placeholder="Rua das Acácias" />
            </div>
            <div className="space-y-1.5">
              <Label>Número</Label>
              <Input value={form.tomadorNumero} onChange={e => set('tomadorNumero', e.target.value)} placeholder="100" />
            </div>
            <div className="space-y-1.5">
              <Label>Complemento</Label>
              <Input value={form.tomadorComplemento} onChange={e => set('tomadorComplemento', e.target.value)} placeholder="Sala 201" />
            </div>
          </div>

          {/* Endereço linha 2 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>Bairro</Label>
              <Input value={form.tomadorBairro} onChange={e => set('tomadorBairro', e.target.value)} placeholder="Centro" />
            </div>
            <div className="space-y-1.5">
              <Label>CEP <span className="text-red-500">*</span></Label>
              <Input value={form.tomadorCep} onChange={e => set('tomadorCep', e.target.value)} placeholder="00000-000" />
            </div>
            <div className="space-y-1.5">
              <Label>Cidade <span className="text-red-500">*</span></Label>
              <Input value={form.tomadorCidadeNome} onChange={e => set('tomadorCidadeNome', e.target.value)} placeholder="São Paulo" />
            </div>
            <div className="space-y-1.5">
              <Label>UF <span className="text-red-500">*</span></Label>
              <Input value={form.tomadorUf} onChange={e => set('tomadorUf', e.target.value.toUpperCase())} placeholder="SP" maxLength={2} />
            </div>
          </div>

          {/* Endereço linha 3 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                Código IBGE da Cidade
                <span title="Código IBGE de 7 dígitos. Se informado, tem prioridade sobre o nome da cidade.">
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </span>
              </Label>
              <Input value={form.tomadorCidadeIbge} onChange={e => set('tomadorCidadeIbge', e.target.value)} placeholder="3550308" maxLength={7} />
            </div>
            <div className="space-y-1.5">
              <Label>País</Label>
              <Select value={form.tomadorPais} onValueChange={v => set('tomadorPais', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRA">Brasil</SelectItem>
                  <SelectItem value="USA">Estados Unidos</SelectItem>
                  <SelectItem value="ARG">Argentina</SelectItem>
                  <SelectItem value="PRT">Portugal</SelectItem>
                  <SelectItem value="ESP">Espanha</SelectItem>
                  <SelectItem value="DEU">Alemanha</SelectItem>
                  <SelectItem value="FRA">França</SelectItem>
                  <SelectItem value="GBR">Reino Unido</SelectItem>
                  <SelectItem value="CHN">China</SelectItem>
                  <SelectItem value="JPN">Japão</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* EMITIR */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => { setForm(EMPTY); setEmitido(null); setErro(null) }}>
          Limpar formulário
        </Button>
        <Button size="lg" onClick={emitir} disabled={loadingEmitir}>
          {loadingEmitir ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ReceiptText className="h-4 w-4 mr-2" />}
          Emitir NFS-e
        </Button>
      </div>

      {/* 6. CONSULTAR STATUS */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            Consultar Situação de NFS-e
          </CardTitle>
          <CardDescription>Acompanhe o processamento pela prefeitura pelo ID Spedy.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Input value={consultaId} onChange={e => setConsultaId(e.target.value)} placeholder="UUID da NFS-e (preenchido automaticamente após emissão)" className="flex-1" />
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
                  <>
                    <Button variant="outline" size="sm" asChild>
                      <a href={`https://api.spedy.com.br/v1/service-invoices/${resultado.providerResponse.id}/pdf`} target="_blank" rel="noopener noreferrer">
                        <FileText className="h-3.5 w-3.5 mr-1.5" /> Baixar PDF
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <a href={`https://api.spedy.com.br/v1/service-invoices/${resultado.providerResponse.id}/xml`} target="_blank" rel="noopener noreferrer">
                        <FileText className="h-3.5 w-3.5 mr-1.5" /> Baixar XML
                      </a>
                    </Button>
                  </>
                )}
              </div>

              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver resposta completa da Spedy</summary>
                <pre className="mt-2 bg-muted p-3 rounded-lg overflow-auto">{JSON.stringify(resultado, null, 2)}</pre>
              </details>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

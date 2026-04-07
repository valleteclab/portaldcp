'use client'

import { useEffect, useState } from 'react'
import { API_URL, authFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, ReceiptText, Search, CheckCircle2, AlertCircle, FileText, Building2, User } from 'lucide-react'

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
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ReceiptText className="h-6 w-6 text-blue-600" />
          Emissão de NFS-e
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Emita notas fiscais de serviço diretamente pela Spedy.</p>
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
          <AlertDescription className="text-green-800">
            NFS-e enviada! ID: <strong>{emitido?.providerResponse?.id}</strong> — Status: <strong>{statusInfo(emitido?.providerResponse?.status).label}</strong>
          </AlertDescription>
        </Alert>
      )}

      {/* Prestador — dados do cadastro */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            Prestador (sua empresa)
          </CardTitle>
          <CardDescription>Dados carregados do seu cadastro.</CardDescription>
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
              <div><p className="text-xs text-muted-foreground">Regime</p>
                <Badge variant="outline" className="text-xs mt-0.5">
                  {fornecedor.taxRegime === 'simplesNacionalMEI' ? 'MEI' : fornecedor.taxRegime === 'simplesNacional' ? 'Simples Nacional' : 'Regime Normal'}
                </Badge>
              </div>
              <div><p className="text-xs text-muted-foreground">Cidade / UF</p><p className="font-medium">{fornecedor.cidade} — {fornecedor.uf}</p></div>
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

      {/* Identificação */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Identificação
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>ID de Integração <span className="text-red-500">*</span></Label>
            <Input value={form.integrationId} onChange={e => set('integrationId', e.target.value)} placeholder="medicao-2026-001" />
            <p className="text-xs text-muted-foreground">ID único da medição ou pedido.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Código de Referência</Label>
            <Input value={form.referenceCode} onChange={e => set('referenceCode', e.target.value)} placeholder="CONTRATO-2026-001" />
          </div>
          <div className="space-y-1.5">
            <Label>Ambiente <span className="text-red-500">*</span></Label>
            <Select value={form.ambiente} onValueChange={v => set('ambiente', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Código Federal LC 116/03 <span className="text-red-500">*</span></Label>
              <Select value={form.federalServiceCode} onValueChange={v => set('federalServiceCode', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o serviço..." />
                </SelectTrigger>
                <SelectContent>
                  {LC116_CODES.map(item => (
                    <SelectItem key={item.code} value={item.code}>
                      {item.code} — {item.desc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Código Municipal <span className="text-red-500">*</span></Label>
              <Input value={form.cityServiceCode} onChange={e => set('cityServiceCode', e.target.value)} placeholder="0107" />
              <p className="text-xs text-muted-foreground">Código específico da sua prefeitura (consulte o contador).</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Discriminação dos Serviços <span className="text-red-500">*</span></Label>
            <Textarea rows={3} value={form.descricao} onChange={e => set('descricao', e.target.value)}
              placeholder="Ex.: Prestação de serviços de manutenção predial ref. medição nº 01 — Contrato 001/2026..." />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>Valor (R$) <span className="text-red-500">*</span></Label>
              <Input type="number" step="0.01" min="0.01" value={form.valor} onChange={e => set('valor', e.target.value)} placeholder="1500.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Alíquota ISS (%)</Label>
              <Input type="number" step="0.01" min="0" max="10" value={form.issRate} onChange={e => set('issRate', e.target.value)} placeholder="5" />
            </div>
            <div className="space-y-1.5">
              <Label>ISS Retido?</Label>
              <Select value={form.issWithheld ? 'sim' : 'nao'} onValueChange={v => set('issWithheld', v === 'sim')}>
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
          <CardDescription>Informe o CNPJ e clique em buscar para preencher automaticamente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={buscarCnpjTomador}
                  disabled={loadingTomadorCnpj || fmt(form.tomadorTaxId).length !== 14}
                  title="Buscar dados na Receita Federal"
                >
                  {loadingTomadorCnpj ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Razão Social <span className="text-red-500">*</span></Label>
              <Input value={form.tomadorNome} onChange={e => set('tomadorNome', e.target.value)} placeholder="Prefeitura Municipal de..." />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>E-mail <span className="text-red-500">*</span></Label>
            <Input type="email" value={form.tomadorEmail} onChange={e => set('tomadorEmail', e.target.value)} placeholder="fiscal@orgao.gov.br" />
          </div>

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
              <Label>Bairro</Label>
              <Input value={form.tomadorBairro} onChange={e => set('tomadorBairro', e.target.value)} placeholder="Centro" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            <div className="space-y-1.5">
              <Label>Cód. IBGE</Label>
              <Input value={form.tomadorCidadeIbge} onChange={e => set('tomadorCidadeIbge', e.target.value)} placeholder="3550308" />
              <p className="text-xs text-muted-foreground">Opcional. Se informado, tem prioridade.</p>
            </div>
          </div>
        </CardContent>
      </Card>

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
          <CardDescription>Acompanhe o processamento pela prefeitura.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Input value={consultaId} onChange={e => setConsultaId(e.target.value)} placeholder="UUID da NFS-e" className="flex-1" />
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
                    <a href={`https://api.spedy.com.br/v1/service-invoices/${resultado.providerResponse.id}/pdf`} target="_blank" rel="noopener noreferrer">
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

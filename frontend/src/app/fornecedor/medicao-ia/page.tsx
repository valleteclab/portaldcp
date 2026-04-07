'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertTriangle,
  Bot,
  CheckCircle,
  ChevronRight,
  FileText,
  Info,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
  ArrowRight,
  FileCheck,
} from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { toast } from 'sonner'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Contrato {
  id: string
  numero_contrato: string
  objeto: string
  status: string
  valor_global: number
  data_vigencia_fim: string
}

interface CamposExtraidosNF {
  nota_fiscal_numero: string | null
  nota_fiscal_valor: number | null
  nota_fiscal_data: string | null
  cnpj_emitente: string | null
  razao_social_emitente: string | null
  competencia: string | null
  periodo_inicio: string | null
  periodo_fim: string | null
}

interface Validacao {
  tipo: 'info' | 'warning' | 'error'
  campo: string
  mensagem: string
}

interface Discriminacao {
  descricao: string
  valor: number
  percentual: number
}

interface ResultadoExtracao {
  campos: CamposExtraidosNF
  validacoes: Validacao[]
  discriminacoes_sugeridas: Discriminacao[]
  fonte: 'xml' | 'pdf_ia' | 'imagem_ia'
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

function formatarMoeda(v: number | null | undefined) {
  if (v == null) return '-'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarData(d: string | null | undefined) {
  if (!d) return '-'
  const parts = d.split('T')[0].split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
  return d
}

function fonteLabel(fonte: ResultadoExtracao['fonte']) {
  if (fonte === 'xml') return 'XML NF-e'
  if (fonte === 'pdf_ia') return 'PDF (IA)'
  return 'Imagem (IA Vision)'
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function MedicaoIaPage() {
  const [etapa, setEtapa] = useState<1 | 2 | 3>(1)
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [contratoId, setContratoId] = useState<string>('')
  const [carregandoContratos, setCarregandoContratos] = useState(true)

  const [arquivoNF, setArquivoNF] = useState<File | null>(null)
  const [analisando, setAnalisando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoExtracao | null>(null)

  // Campos editáveis após extração
  const [campos, setCampos] = useState<CamposExtraidosNF>({
    nota_fiscal_numero: null,
    nota_fiscal_valor: null,
    nota_fiscal_data: null,
    cnpj_emitente: null,
    razao_social_emitente: null,
    competencia: null,
    periodo_inicio: null,
    periodo_fim: null,
  })
  const [discriminacoes, setDiscriminacoes] = useState<Discriminacao[]>([])
  const [observacoes, setObservacoes] = useState('')
  const [criando, setCriando] = useState(false)
  const [medicaoCriada, setMedicaoCriada] = useState<{ id: string; numero_medicao: number } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Carregar contratos do fornecedor
  useEffect(() => {
    const carregar = async () => {
      setCarregandoContratos(true)
      try {
        const fornecedorStr = localStorage.getItem('fornecedor')
        if (!fornecedorStr) return
        const fornecedor = JSON.parse(fornecedorStr)
        const res = await authFetch(`${API_URL}/api/contratos?fornecedorId=${fornecedor.id}`)
        if (!res.ok) return
        const json = await res.json()
        const lista: Contrato[] = Array.isArray(json) ? json : (json.data || [])
        setContratos(lista.filter((c) => c.status === 'VIGENTE'))
      } finally {
        setCarregandoContratos(false)
      }
    }
    carregar()
  }, [])

  const handleSelecionarArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setArquivoNF(file)
    e.target.value = ''
  }

  const handleAnalisar = useCallback(async () => {
    if (!arquivoNF || !contratoId) {
      toast.error('Selecione um contrato e um arquivo de NF')
      return
    }

    setAnalisando(true)
    setResultado(null)

    try {
      const fornecedorStr = localStorage.getItem('fornecedor')
      const fornecedor = fornecedorStr ? JSON.parse(fornecedorStr) : {}

      const formData = new FormData()
      formData.append('file', arquivoNF)
      formData.append('contrato_id', contratoId)
      formData.append('fornecedor_id', fornecedor.id || '')
      formData.append('fornecedor_cnpj', fornecedor.cpf_cnpj || '')

      const res = await authFetch(`${API_URL}/api/medicao-ia/extrair-nf`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.message || 'Erro ao analisar a nota fiscal')
        return
      }

      const data: ResultadoExtracao = await res.json()
      setResultado(data)
      setCampos(data.campos)
      setDiscriminacoes(data.discriminacoes_sugeridas || [])
      setEtapa(2)
      toast.success('Nota fiscal analisada com sucesso!')
    } catch {
      toast.error('Erro de conexão ao analisar a nota fiscal')
    } finally {
      setAnalisando(false)
    }
  }, [arquivoNF, contratoId])

  const handleCriarRascunho = async () => {
    if (!campos.periodo_inicio || !campos.periodo_fim) {
      toast.error('Informe o período de início e fim da medição')
      return
    }

    setCriando(true)
    try {
      const fornecedorStr = localStorage.getItem('fornecedor')
      const fornecedor = fornecedorStr ? JSON.parse(fornecedorStr) : {}

      const payload = {
        contrato_id: contratoId,
        fornecedor_id: fornecedor.id,
        fornecedor_nome: fornecedor.razao_social || fornecedor.nome || '',
        periodo_inicio: campos.periodo_inicio,
        periodo_fim: campos.periodo_fim,
        competencia: campos.competencia || undefined,
        nota_fiscal_numero: campos.nota_fiscal_numero || undefined,
        nota_fiscal_valor: campos.nota_fiscal_valor || undefined,
        nota_fiscal_data: campos.nota_fiscal_data || undefined,
        observacoes: observacoes || undefined,
        discriminacoes: discriminacoes.filter((d) => d.descricao.trim() !== ''),
      }

      const res = await authFetch(`${API_URL}/api/medicao-ia/criar-rascunho`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.message || 'Erro ao criar rascunho')
        return
      }

      const medicao = await res.json()
      setMedicaoCriada({ id: medicao.id, numero_medicao: medicao.numero_medicao })
      setEtapa(3)
      toast.success('Rascunho criado com sucesso!')
    } catch {
      toast.error('Erro de conexão ao criar rascunho')
    } finally {
      setCriando(false)
    }
  }

  const handleReiniciar = () => {
    setEtapa(1)
    setArquivoNF(null)
    setResultado(null)
    setCampos({ nota_fiscal_numero: null, nota_fiscal_valor: null, nota_fiscal_data: null, cnpj_emitente: null, razao_social_emitente: null, competencia: null, periodo_inicio: null, periodo_fim: null })
    setDiscriminacoes([])
    setObservacoes('')
    setMedicaoCriada(null)
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100">
            <Bot className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Medição com IA</h1>
            <p className="text-gray-500 text-sm">Envie sua Nota Fiscal e o sistema preenche o boletim automaticamente</p>
          </div>
          <Badge className="ml-auto bg-blue-100 text-blue-700 border-blue-200">Beta</Badge>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 text-sm">
        {[
          { n: 1, label: 'Selecionar NF' },
          { n: 2, label: 'Revisar dados' },
          { n: 3, label: 'Confirmação' },
        ].map(({ n, label }, i) => (
          <div key={n} className="flex items-center gap-2">
            {i > 0 && <ChevronRight className="w-4 h-4 text-gray-400" />}
            <div className={`flex items-center gap-1.5 ${etapa === n ? 'text-blue-700 font-semibold' : etapa > n ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${etapa === n ? 'bg-blue-600 text-white' : etapa > n ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {etapa > n ? <CheckCircle className="w-4 h-4" /> : n}
              </div>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* ─── ETAPA 1: Selecionar contrato + NF ────────────────────────────────── */}
      {etapa === 1 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-blue-600" />
                Selecionar Contrato
              </CardTitle>
              <CardDescription>Escolha o contrato para o qual deseja criar a medição</CardDescription>
            </CardHeader>
            <CardContent>
              {carregandoContratos ? (
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Carregando contratos...
                </div>
              ) : contratos.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  <FileText className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <p>Nenhum contrato vigente encontrado.</p>
                  <Link href="/fornecedor/contratos" className="text-blue-600 text-sm underline">
                    Ver meus contratos
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Contrato *</Label>
                  <Select value={contratoId} onValueChange={setContratoId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um contrato vigente..." />
                    </SelectTrigger>
                    <SelectContent>
                      {contratos.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="font-medium">{c.numero_contrato}</span>
                          <span className="text-gray-500 ml-2 text-xs">— {c.objeto?.substring(0, 60)}{c.objeto?.length > 60 ? '...' : ''}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {contratoId && (
                    <div className="mt-2 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
                      {(() => {
                        const c = contratos.find((x) => x.id === contratoId)
                        if (!c) return null
                        return (
                          <div className="flex justify-between">
                            <span>{c.objeto}</span>
                            <span className="font-semibold ml-4 shrink-0">{formatarMoeda(c.valor_global)}</span>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-600" />
                Enviar Nota Fiscal
              </CardTitle>
              <CardDescription>
                Envie o XML da NF-e (mais preciso) ou o PDF do DANFE. Também aceita foto/imagem legível.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="border-2 border-dashed border-blue-200 rounded-lg p-8 text-center cursor-pointer hover:bg-blue-50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {arquivoNF ? (
                  <div className="space-y-2">
                    <FileText className="w-10 h-10 text-blue-500 mx-auto" />
                    <p className="font-medium text-blue-700">{arquivoNF.name}</p>
                    <p className="text-xs text-gray-500">{(arquivoNF.size / 1024).toFixed(0)} KB</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-500"
                      onClick={(e) => { e.stopPropagation(); setArquivoNF(null) }}
                    >
                      <Trash2 className="w-3 h-3 mr-1" />Remover
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Sparkles className="w-10 h-10 text-blue-300 mx-auto" />
                    <p className="text-gray-600 font-medium">Clique para selecionar o arquivo</p>
                    <p className="text-xs text-gray-400">XML NF-e, PDF DANFE ou imagem (JPG/PNG) — máx. 10MB</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xml,.pdf,.jpg,.jpeg,.png,application/xml,text/xml,application/pdf,image/jpeg,image/png"
                className="hidden"
                onChange={handleSelecionarArquivo}
              />

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
                <p className="font-semibold flex items-center gap-1"><Info className="w-3.5 h-3.5" />Dicas para melhor resultado:</p>
                <ul className="list-disc list-inside space-y-0.5 ml-1">
                  <li><strong>XML NF-e:</strong> O resultado mais preciso — baixe o XML no portal do emissor da NF</li>
                  <li><strong>PDF DANFE:</strong> Funciona bem se o PDF tiver texto digital (não for escaneado)</li>
                  <li><strong>Foto/imagem:</strong> Tire em boa iluminação, sem reflexos, todos os dados visíveis</li>
                </ul>
              </div>

              <Button
                className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
                onClick={handleAnalisar}
                disabled={!arquivoNF || !contratoId || analisando}
              >
                {analisando ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Analisando com IA...</>
                ) : (
                  <><Sparkles className="w-4 h-4" />Analisar Nota Fiscal com IA</>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── ETAPA 2: Revisão dos dados extraídos ─────────────────────────────── */}
      {etapa === 2 && resultado && (
        <div className="space-y-4">
          {/* Origem dos dados */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Sparkles className="w-4 h-4 text-blue-500" />
              Dados extraídos via <Badge variant="secondary">{fonteLabel(resultado.fonte)}</Badge>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setEtapa(1)} className="gap-1 text-gray-500">
              <RotateCcw className="w-3.5 h-3.5" />Enviar outro arquivo
            </Button>
          </div>

          {/* Alertas de validação */}
          {resultado.validacoes.length > 0 && (
            <div className="space-y-2">
              {resultado.validacoes.map((v, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                    v.tipo === 'error' ? 'bg-red-50 border border-red-200 text-red-800' :
                    v.tipo === 'warning' ? 'bg-amber-50 border border-amber-200 text-amber-800' :
                    'bg-green-50 border border-green-200 text-green-800'
                  }`}
                >
                  {v.tipo === 'error' && <XCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                  {v.tipo === 'warning' && <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
                  {v.tipo === 'info' && <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                  <span>{v.mensagem}</span>
                </div>
              ))}
            </div>
          )}

          {/* Campos extraídos (editáveis) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dados da Nota Fiscal</CardTitle>
              <CardDescription>Revise e corrija os campos extraídos antes de criar o rascunho</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Número da NF</Label>
                  <Input
                    value={campos.nota_fiscal_numero || ''}
                    onChange={(e) => setCampos({ ...campos, nota_fiscal_numero: e.target.value || null })}
                    placeholder="Ex: 000001234"
                  />
                </div>
                <div>
                  <Label>Valor da NF (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={campos.nota_fiscal_valor ?? ''}
                    onChange={(e) => setCampos({ ...campos, nota_fiscal_valor: e.target.value ? Number(e.target.value) : null })}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <Label>Data de Emissão</Label>
                  <Input
                    type="date"
                    value={campos.nota_fiscal_data || ''}
                    onChange={(e) => setCampos({ ...campos, nota_fiscal_data: e.target.value || null })}
                  />
                </div>
              </div>

              {campos.razao_social_emitente && (
                <div className="p-3 bg-gray-50 rounded-lg text-sm">
                  <span className="text-gray-500">Emitente: </span>
                  <span className="font-medium">{campos.razao_social_emitente}</span>
                  {campos.cnpj_emitente && <span className="text-gray-500 ml-2">({campos.cnpj_emitente.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')})</span>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Período da medição */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Período da Medição</CardTitle>
              <CardDescription>Derivado automaticamente da competência — ajuste se necessário</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Competência</Label>
                  <Input
                    value={campos.competencia || ''}
                    onChange={(e) => setCampos({ ...campos, competencia: e.target.value.toUpperCase() || null })}
                    placeholder="Ex: MARÇO/2026"
                    className="uppercase"
                  />
                </div>
                <div>
                  <Label>Período Início *</Label>
                  <Input
                    type="date"
                    value={campos.periodo_inicio || ''}
                    onChange={(e) => setCampos({ ...campos, periodo_inicio: e.target.value || null })}
                  />
                </div>
                <div>
                  <Label>Período Fim *</Label>
                  <Input
                    type="date"
                    value={campos.periodo_fim || ''}
                    onChange={(e) => setCampos({ ...campos, periodo_fim: e.target.value || null })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Discriminação das despesas */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Discriminação das Despesas</CardTitle>
                  <CardDescription>
                    {discriminacoes.length > 0
                      ? 'Sugestão gerada a partir dos itens da NF — revise e ajuste'
                      : 'Adicione como o valor medido está distribuído entre as despesas'}
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDiscriminacoes([...discriminacoes, { descricao: '', valor: 0, percentual: 0 }])}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />Adicionar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {discriminacoes.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  Nenhuma discriminação adicionada. Clique em "+ Adicionar" para incluir itens como "Mão de obra", "Materiais", etc.
                </p>
              ) : (
                <div className="space-y-2">
                  {discriminacoes.map((disc, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                      <Input
                        className="col-span-6"
                        placeholder="Descrição (ex: Mão de obra)"
                        value={disc.descricao}
                        onChange={(e) => {
                          const upd = [...discriminacoes]
                          upd[i] = { ...upd[i], descricao: e.target.value }
                          setDiscriminacoes(upd)
                        }}
                      />
                      <Input
                        className="col-span-3"
                        type="number"
                        step="0.01"
                        placeholder="Valor (R$)"
                        value={disc.valor || ''}
                        onChange={(e) => {
                          const upd = [...discriminacoes]
                          const totalMedicao = campos.nota_fiscal_valor || 0
                          const val = Number(e.target.value) || 0
                          const perc = totalMedicao > 0 ? Math.round((val / totalMedicao) * 10000) / 100 : 0
                          upd[i] = { ...upd[i], valor: val, percentual: perc }
                          setDiscriminacoes(upd)
                        }}
                      />
                      <div className="col-span-2 text-sm text-gray-500 text-right">
                        {disc.percentual.toFixed(1)}%
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="col-span-1 text-red-400 hover:text-red-600"
                        onClick={() => setDiscriminacoes(discriminacoes.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t">
                    <span>Total</span>
                    <span className={
                      Math.abs(discriminacoes.reduce((s, d) => s + d.percentual, 0) - 100) < 1
                        ? 'text-green-700'
                        : 'text-amber-700'
                    }>
                      {discriminacoes.reduce((s, d) => s + d.percentual, 0).toFixed(1)}% / {formatarMoeda(discriminacoes.reduce((s, d) => s + d.valor, 0))}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Observações */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Observações</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Observações sobre a execução neste período..."
                rows={3}
              />
            </CardContent>
          </Card>

          {/* Aviso sobre próximo passo */}
          <div className="flex items-start gap-2 text-xs text-gray-500 bg-blue-50 rounded-lg p-3">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
            <p>
              O rascunho será criado com status <strong>Rascunho</strong>. Você será redirecionado para o contrato onde poderá
              adicionar os itens do cronograma, anexar documentos e enviar para aprovação com assinatura digital.
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setEtapa(1)} className="gap-1">
              <RotateCcw className="w-4 h-4" />Voltar
            </Button>
            <Button
              className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700"
              onClick={handleCriarRascunho}
              disabled={criando || !campos.periodo_inicio || !campos.periodo_fim}
            >
              {criando ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Criando rascunho...</>
              ) : (
                <><FileText className="w-4 h-4" />Criar Rascunho de Medição</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ─── ETAPA 3: Confirmação ─────────────────────────────────────────────── */}
      {etapa === 3 && medicaoCriada && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-8 pb-6 text-center space-y-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mx-auto">
              <CheckCircle className="w-9 h-9 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-green-800">Rascunho criado com sucesso!</h2>
              <p className="text-green-700 text-sm mt-1">
                {medicaoCriada.numero_medicao}ª Medição — Rascunho criado a partir da Nota Fiscal
              </p>
            </div>

            <div className="bg-white rounded-lg p-4 text-left space-y-2 border border-green-200">
              <p className="text-sm font-semibold text-gray-700">Próximos passos:</p>
              <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                <li>Acesse o contrato e vá na aba <strong>Medições</strong></li>
                <li>Abra o rascunho e preencha os itens do cronograma (quantidades/percentuais)</li>
                <li>Adicione fotos e documentos comprobatórios</li>
                <li>Envie para aprovação — será solicitada assinatura digital via código no celular</li>
              </ol>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild className="gap-2 bg-green-600 hover:bg-green-700">
                <Link href={`/fornecedor/contratos/${contratoId}?tab=medicoes`}>
                  Ir para o Contrato
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
              <Button variant="outline" onClick={handleReiniciar} className="gap-2">
                <RotateCcw className="w-4 h-4" />
                Fazer nova extração
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

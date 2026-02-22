'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { 
  ArrowLeft, 
  Save, 
  FileText, 
  Building2, 
  Calendar,
  DollarSign,
  User,
  Loader2,
  Link as LinkIcon,
  Plus
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { API_URL, authFetch } from '@/lib/api'
import { formatarModalidadeLicitacao } from '@/lib/utils'

interface Licitacao {
  id: string
  numero_processo: string
  objeto: string
  modalidade: string
  valor_total_estimado: number
}

interface Fornecedor {
  id: string
  razao_social: string
  cnpj: string
  cpf_cnpj?: string
}

const TIPOS_CONTRATO = [
  { value: 'CONTRATO', label: 'Contrato' },
  { value: 'NOTA_EMPENHO', label: 'Nota de Empenho' },
  { value: 'ORDEM_SERVICO', label: 'Ordem de Serviço' },
  { value: 'ORDEM_FORNECIMENTO', label: 'Ordem de Fornecimento' },
  { value: 'CARTA_CONTRATO', label: 'Carta Contrato' },
  { value: 'TERMO_ADESAO', label: 'Termo de Adesão' },
  { value: 'ATA_REGISTRO_PRECO', label: 'Ata de Registro de Preço' },
]

const CATEGORIAS_CONTRATO = [
  { value: 'COMPRAS', label: 'Compras' },
  { value: 'SERVICOS', label: 'Serviços' },
  { value: 'OBRAS', label: 'Obras' },
  { value: 'SERVICOS_ENGENHARIA', label: 'Serviços de Engenharia' },
  { value: 'LOCACAO', label: 'Locação' },
  { value: 'ALIENACAO', label: 'Alienação' },
]

const MODALIDADES_EXECUCAO = [
  { value: 'ITEM_QUANTIDADE', label: 'Item/Quantidade', desc: 'Compras de materiais e bens — controle por itens e quantidades' },
  { value: 'MEDICAO', label: 'Medição', desc: 'Obras e engenharia — controle por cronograma e medições do fiscal' },
  { value: 'CONTINUADO', label: 'Serviço Continuado', desc: 'Limpeza, vigilância, etc — atestação mensal pelo fiscal' },
  { value: 'LICENCA', label: 'Licença/Assinatura', desc: 'Software, SaaS — controle de licenças ativas e vigência' },
  { value: 'ORDEM_SERVICO', label: 'Ordem de Serviço', desc: 'Consultoria, fábrica de software — controle por OS e métricas' },
]

export default function NovoContratoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromLicitacao = searchParams.get('from') === 'licitacao'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orgaoId, setOrgaoId] = useState<string | null>(null)
  
  const [licitacoes, setLicitacoes] = useState<Licitacao[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [loadingLicitacoes, setLoadingLicitacoes] = useState(false)
  const [loadingFornecedores, setLoadingFornecedores] = useState(false)
  const [showNovoFornecedor, setShowNovoFornecedor] = useState(false)
  const [novoFornecedorCnpj, setNovoFornecedorCnpj] = useState('')
  const [novoFornecedorRazao, setNovoFornecedorRazao] = useState('')
  const [salvandoFornecedor, setSalvandoFornecedor] = useState(false)
  const [erroNovoFornecedor, setErroNovoFornecedor] = useState<string | null>(null)
  const [consultandoCnpj, setConsultandoCnpj] = useState(false)
  const [fornecedorExistente, setFornecedorExistente] = useState<Fornecedor | null>(null)
  const [buscaFornecedor, setBuscaFornecedor] = useState('')
  
  const [usarLicitacao, setUsarLicitacao] = useState(fromLicitacao)
  const [licitacaoId, setLicitacaoId] = useState('')
  const [formData, setFormData] = useState({
    tipo: 'CONTRATO',
    categoria: 'COMPRAS',
    modalidade_execucao: 'ITEM_QUANTIDADE',
    fornecedor_id: '',
    fornecedor_cnpj: '',
    fornecedor_razao_social: '',
    objeto: '',
    objeto_detalhado: '',
    valor_inicial: '',
    data_assinatura: '',
    data_vigencia_inicio: '',
    data_vigencia_fim: '',
    data_publicacao: '',
    prazo_execucao_dias: '',
    prazo_vigencia_meses: '',
    numero_processo: '',
    amparo_legal: '',
    dotacao_orcamentaria: '',
    fonte_recurso: '',
    programa_trabalho: '',
    elemento_despesa: '',
    fiscal_nome: '',
    fiscal_matricula: '',
    gestor_nome: '',
    gestor_matricula: '',
    exige_garantia: false,
    percentual_garantia: '',
    tipo_garantia: '',
    observacoes: '',
  })

  useEffect(() => {
    const orgaoStr = localStorage.getItem('orgao')
    if (orgaoStr) {
      try {
        const orgao = JSON.parse(orgaoStr)
        setOrgaoId(orgao.id)
        carregarLicitacoes(orgao.id)
        carregarFornecedores()
      } catch (e) {
        console.error('Erro ao parsear orgao:', e)
      }
    }
  }, [])

  const consultarCnpjModal = async () => {
    const cnpj = novoFornecedorCnpj.replace(/\D/g, '')
    if (cnpj.length !== 14) return
    setConsultandoCnpj(true)
    setFornecedorExistente(null)
    setErroNovoFornecedor(null)
    try {
      const resVerif = await authFetch(`${API_URL}/api/fornecedores/verificar-cnpj/${cnpj}`)
      const verif = await resVerif.json()
      if (verif.existe && verif.fornecedor) {
        setFornecedorExistente({ id: verif.fornecedor.id, razao_social: verif.fornecedor.razao_social, cnpj: verif.fornecedor.cpf_cnpj, cpf_cnpj: verif.fornecedor.cpf_cnpj })
        return
      }
      const resConsulta = await authFetch(`${API_URL}/api/fornecedores/consultar-cnpj/${cnpj}`)
      if (resConsulta.ok) {
        const dados = await resConsulta.json()
        setNovoFornecedorRazao(dados.razao_social || '')
      }
    } catch {
      // Ignora erro de consulta - usuário pode digitar manualmente
    } finally {
      setConsultandoCnpj(false)
    }
  }

  const carregarLicitacoes = async (orgId: string) => {
    setLoadingLicitacoes(true)
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes?orgaoId=${orgId}&fase=HOMOLOGADA`)
      if (res.ok) {
        const data = await res.json()
        setLicitacoes(data)
      }
    } catch (error) {
      console.error('Erro ao buscar licitações:', error)
    } finally {
      setLoadingLicitacoes(false)
    }
  }

  const carregarFornecedores = async () => {
    setLoadingFornecedores(true)
    try {
      const res = await authFetch(`${API_URL}/api/fornecedores?status=APROVADO`)
      if (res.ok) {
        const data = await res.json()
        setFornecedores(data)
      }
    } catch (error) {
      console.error('Erro ao buscar fornecedores:', error)
    } finally {
      setLoadingFornecedores(false)
    }
  }

  const handleLicitacaoChange = (id: string) => {
    setLicitacaoId(id)
    const licitacao = licitacoes.find(l => l.id === id)
    if (licitacao) {
      setFormData(prev => ({
        ...prev,
        objeto: licitacao.objeto,
        numero_processo: licitacao.numero_processo,
        valor_inicial: licitacao.valor_total_estimado?.toString() || '',
      }))
    }
  }

  const handleFornecedorChange = (id: string) => {
    const fornecedor = fornecedores.find(f => f.id === id)
    if (fornecedor) {
      setFormData(prev => ({
        ...prev,
        fornecedor_id: id,
        fornecedor_cnpj: fornecedor.cnpj || fornecedor.cpf_cnpj || '',
        fornecedor_razao_social: fornecedor.razao_social,
      }))
    }
  }

  const cadastrarNovoFornecedor = async () => {
    if (fornecedorExistente) return
    const cnpj = novoFornecedorCnpj.replace(/\D/g, '')
    const razao = novoFornecedorRazao.trim()
    if (cnpj.length !== 14) {
      setErroNovoFornecedor('CNPJ deve ter 14 dígitos')
      return
    }
    if (!razao) {
      setErroNovoFornecedor('Informe a razão social')
      return
    }
    setSalvandoFornecedor(true)
    setErroNovoFornecedor(null)
    try {
      const res = await authFetch(`${API_URL}/api/fornecedores/orgao/cadastro-rapido`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj: novoFornecedorCnpj, razao_social: razao }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Erro ao cadastrar fornecedor')
      }
      const fornecedor = await res.json()
      setFornecedores(prev => [...prev, { id: fornecedor.id, razao_social: fornecedor.razao_social, cnpj: fornecedor.cpf_cnpj, cpf_cnpj: fornecedor.cpf_cnpj }])
      handleFornecedorChange(fornecedor.id)
      setShowNovoFornecedor(false)
      setNovoFornecedorCnpj('')
      setNovoFornecedorRazao('')
    } catch (err: unknown) {
      setErroNovoFornecedor(err instanceof Error ? err.message : 'Erro ao cadastrar')
    } finally {
      setSalvandoFornecedor(false)
    }
  }

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (!orgaoId) throw new Error('Órgão não identificado. Faça login novamente.')
      if (!formData.fornecedor_id) throw new Error('Selecione um fornecedor.')
      if (!formData.objeto) throw new Error('Informe o objeto do contrato.')
      if (!formData.valor_inicial) throw new Error('Informe o valor do contrato.')
      if (!formData.data_assinatura) throw new Error('Informe a data de assinatura.')
      if (!formData.data_vigencia_inicio || !formData.data_vigencia_fim) throw new Error('Informe as datas de vigência.')

      const payload: Record<string, unknown> = {
        orgao_id: orgaoId,
        tipo: formData.tipo,
        categoria: formData.categoria,
        modalidade_execucao: formData.modalidade_execucao,
        fornecedor_id: formData.fornecedor_id,
        fornecedor_cnpj: formData.fornecedor_cnpj,
        fornecedor_razao_social: formData.fornecedor_razao_social,
        objeto: formData.objeto,
        objeto_detalhado: formData.objeto_detalhado || null,
        valor_inicial: parseFloat(formData.valor_inicial),
        data_assinatura: formData.data_assinatura,
        data_vigencia_inicio: formData.data_vigencia_inicio,
        data_vigencia_fim: formData.data_vigencia_fim,
        data_publicacao: formData.data_publicacao || null,
        prazo_execucao_dias: formData.prazo_execucao_dias ? parseInt(formData.prazo_execucao_dias) : null,
        prazo_vigencia_meses: formData.prazo_vigencia_meses ? parseInt(formData.prazo_vigencia_meses) : null,
        numero_processo: formData.numero_processo || null,
        amparo_legal: formData.amparo_legal || null,
        dotacao_orcamentaria: formData.dotacao_orcamentaria || null,
        fonte_recurso: formData.fonte_recurso || null,
        programa_trabalho: formData.programa_trabalho || null,
        elemento_despesa: formData.elemento_despesa || null,
        fiscal_nome: formData.fiscal_nome || null,
        fiscal_matricula: formData.fiscal_matricula || null,
        gestor_nome: formData.gestor_nome || null,
        gestor_matricula: formData.gestor_matricula || null,
        exige_garantia: formData.exige_garantia,
        percentual_garantia: formData.percentual_garantia ? parseFloat(formData.percentual_garantia) : null,
        tipo_garantia: formData.tipo_garantia || null,
        observacoes: formData.observacoes || null,
      }

      let res: Response
      if (usarLicitacao && licitacaoId) {
        res = await authFetch(`${API_URL}/api/contratos/licitacao/${licitacaoId}`, {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      } else {
        res = await authFetch(`${API_URL}/api/contratos`, {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.message || 'Erro ao criar contrato')
      }

      router.push('/orgao/contratos')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 w-full max-w-full">
      <div className="flex items-center gap-4">
        <Button variant="ghost" asChild>
          <Link href="/orgao/contratos">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Novo Contrato</h1>
          <p className="text-gray-600">Cadastre um novo contrato no sistema</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className={usarLicitacao ? 'border-blue-300 bg-blue-50/30' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5" />
              Importar / Vincular de Licitação
            </CardTitle>
            <CardDescription>
              Vincule o contrato a uma licitação homologada para preencher automaticamente objeto, processo e valor
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch id="usar-licitacao" checked={usarLicitacao} onCheckedChange={setUsarLicitacao} />
              <Label htmlFor="usar-licitacao" className="font-medium">Vincular a uma licitação existente</Label>
            </div>
            {usarLicitacao && (
              <div className="space-y-3 p-4 bg-white rounded-lg border">
                <Label>Licitação *</Label>
                <Select value={licitacaoId} onValueChange={handleLicitacaoChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingLicitacoes ? "Carregando..." : "Selecione a licitação homologada"} />
                  </SelectTrigger>
                  <SelectContent>
                    {licitacoes.map(l => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.numero_processo} - {l.objeto?.substring(0, 50)}...
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {licitacaoId && licitacoes.find(l => l.id === licitacaoId) && (
                  <div className="text-sm text-gray-600 p-2 bg-gray-50 rounded">
                    <span className="font-medium">Tipo da licitação: </span>
                    {formatarModalidadeLicitacao(licitacoes.find(l => l.id === licitacaoId)?.modalidade)}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Classificação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de Instrumento *</Label>
                <Select value={formData.tipo} onValueChange={(v) => handleInputChange('tipo', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_CONTRATO.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Categoria *</Label>
                <Select value={formData.categoria} onValueChange={(v) => handleInputChange('categoria', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS_CONTRATO.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Modalidade de Execução *</Label>
              <Select value={formData.modalidade_execucao} onValueChange={(v) => handleInputChange('modalidade_execucao', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODALIDADES_EXECUCAO.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {MODALIDADES_EXECUCAO.find(m => m.value === formData.modalidade_execucao)?.desc}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Contratado
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Fornecedor *</Label>
              <Input
                placeholder="Buscar fornecedor (nome ou CNPJ)..."
                value={buscaFornecedor}
                onChange={(e) => setBuscaFornecedor(e.target.value)}
                className="mb-2"
              />
              <div className="flex gap-2">
                <Select value={formData.fornecedor_id} onValueChange={handleFornecedorChange}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={loadingFornecedores ? "Carregando..." : "Selecione o fornecedor"} />
                  </SelectTrigger>
                  <SelectContent>
                    {fornecedores
                      .filter(f => !buscaFornecedor.trim() || 
                        (f.razao_social?.toLowerCase().includes(buscaFornecedor.toLowerCase())) ||
                        (f.cnpj || f.cpf_cnpj || '').includes(buscaFornecedor.replace(/\D/g, '')))
                      .map(f => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.razao_social} - {f.cnpj || f.cpf_cnpj}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={() => { setShowNovoFornecedor(true); setErroNovoFornecedor(null); setFornecedorExistente(null); setNovoFornecedorCnpj(''); setNovoFornecedorRazao(''); }} title="Cadastrar novo fornecedor">
                  <Plus className="h-4 w-4 mr-2" />
                  Novo
                </Button>
              </div>
            </div>
            <Dialog open={showNovoFornecedor} onOpenChange={setShowNovoFornecedor}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Cadastrar novo fornecedor</DialogTitle>
                  <DialogDescription>
                    Informe o CNPJ e a razão social. O sistema tentará buscar os dados na Receita Federal. Se não encontrar, criará um cadastro mínimo para uso no contrato.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {erroNovoFornecedor && (
                    <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{erroNovoFornecedor}</div>
                  )}
                  {fornecedorExistente && (
                    <div className="p-3 rounded-lg bg-amber-50 text-amber-800 text-sm border border-amber-200">
                      <p className="font-medium">Fornecedor já cadastrado</p>
                      <p className="mt-1">{fornecedorExistente.razao_social} — {fornecedorExistente.cnpj || fornecedorExistente.cpf_cnpj}</p>
                      <Button type="button" size="sm" className="mt-2" onClick={() => { handleFornecedorChange(fornecedorExistente.id); setShowNovoFornecedor(false); setFornecedorExistente(null); setNovoFornecedorCnpj(''); setNovoFornecedorRazao(''); }}>
                        Usar este fornecedor
                      </Button>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="novo-cnpj">CNPJ *</Label>
                    <div className="flex gap-2">
                      <Input
                        id="novo-cnpj"
                        placeholder="00.000.000/0001-00"
                        value={novoFornecedorCnpj}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, '')
                          if (v.length <= 14) {
                            setNovoFornecedorCnpj(v.length >= 14 ? v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : v)
                            setFornecedorExistente(null)
                          }
                        }}
                        onBlur={() => { if (novoFornecedorCnpj.replace(/\D/g, '').length === 14) consultarCnpjModal() }}
                      />
                      <Button type="button" variant="outline" onClick={() => consultarCnpjModal()} disabled={consultandoCnpj || novoFornecedorCnpj.replace(/\D/g, '').length !== 14}>
                        {consultandoCnpj ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
                      </Button>
                    </div>
                    {consultandoCnpj && <p className="text-xs text-muted-foreground">Buscando na Receita Federal...</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="novo-razao">Razão Social *</Label>
                    <Input
                      id="novo-razao"
                      placeholder="Nome da empresa (preenchido automaticamente ao buscar CNPJ)"
                      value={novoFornecedorRazao}
                      onChange={(e) => setNovoFornecedorRazao(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setShowNovoFornecedor(false)} disabled={salvandoFornecedor}>
                    Cancelar
                  </Button>
                  <Button type="button" onClick={cadastrarNovoFornecedor} disabled={salvandoFornecedor || !!fornecedorExistente}>
                    {salvandoFornecedor ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cadastrando...</> : <>Cadastrar</>}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            {formData.fornecedor_id && (
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm text-gray-500">Razão Social</p>
                  <p className="font-medium">{formData.fornecedor_razao_social}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">CNPJ</p>
                  <p className="font-medium">{formData.fornecedor_cnpj}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Objeto do Contrato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Objeto Resumido *</Label>
              <Textarea
                placeholder="Descrição resumida do objeto do contrato"
                value={formData.objeto}
                onChange={(e) => handleInputChange('objeto', e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Objeto Detalhado</Label>
              <Textarea
                placeholder="Descrição detalhada do objeto (opcional)"
                value={formData.objeto_detalhado}
                onChange={(e) => handleInputChange('objeto_detalhado', e.target.value)}
                rows={5}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Número do Processo</Label>
                <Input
                  placeholder="Ex: 001/2024"
                  value={formData.numero_processo}
                  onChange={(e) => handleInputChange('numero_processo', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Amparo Legal</Label>
                <Input
                  placeholder="Ex: Art. 75, II da Lei 14.133/2021"
                  value={formData.amparo_legal}
                  onChange={(e) => handleInputChange('amparo_legal', e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Valores
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Valor do Contrato (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={formData.valor_inicial}
                onChange={(e) => handleInputChange('valor_inicial', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Prazo de Execução (dias)</Label>
              <Input
                type="number"
                min="0"
                placeholder="Ex: 180"
                value={formData.prazo_execucao_dias}
                onChange={(e) => handleInputChange('prazo_execucao_dias', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Prazo de Vigência (meses)</Label>
              <Input
                type="number"
                min="0"
                placeholder="Ex: 12"
                value={formData.prazo_vigencia_meses}
                onChange={(e) => handleInputChange('prazo_vigencia_meses', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Datas
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Data de Assinatura *</Label>
              <Input type="date" value={formData.data_assinatura} onChange={(e) => handleInputChange('data_assinatura', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Início da Vigência *</Label>
              <Input type="date" value={formData.data_vigencia_inicio} onChange={(e) => handleInputChange('data_vigencia_inicio', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fim da Vigência *</Label>
              <Input type="date" value={formData.data_vigencia_fim} onChange={(e) => handleInputChange('data_vigencia_fim', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Data de Publicação</Label>
              <Input type="date" value={formData.data_publicacao} onChange={(e) => handleInputChange('data_publicacao', e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dotação Orçamentária</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Dotação Orçamentária</Label>
              <Input placeholder="Código da dotação" value={formData.dotacao_orcamentaria} onChange={(e) => handleInputChange('dotacao_orcamentaria', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fonte de Recurso</Label>
              <Input placeholder="Ex: 1500000000" value={formData.fonte_recurso} onChange={(e) => handleInputChange('fonte_recurso', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Programa de Trabalho</Label>
              <Input placeholder="Código do programa" value={formData.programa_trabalho} onChange={(e) => handleInputChange('programa_trabalho', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Elemento de Despesa</Label>
              <Input placeholder="Ex: 33.90.30" value={formData.elemento_despesa} onChange={(e) => handleInputChange('elemento_despesa', e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Responsáveis
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="font-medium">Fiscal do Contrato</h4>
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input placeholder="Nome do fiscal" value={formData.fiscal_nome} onChange={(e) => handleInputChange('fiscal_nome', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Matrícula</Label>
                <Input placeholder="Matrícula funcional" value={formData.fiscal_matricula} onChange={(e) => handleInputChange('fiscal_matricula', e.target.value)} />
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="font-medium">Gestor do Contrato</h4>
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input placeholder="Nome do gestor" value={formData.gestor_nome} onChange={(e) => handleInputChange('gestor_nome', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Matrícula</Label>
                <Input placeholder="Matrícula funcional" value={formData.gestor_matricula} onChange={(e) => handleInputChange('gestor_matricula', e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Garantia Contratual</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch id="exige-garantia" checked={formData.exige_garantia} onCheckedChange={(v) => handleInputChange('exige_garantia', v)} />
              <Label htmlFor="exige-garantia">Exige garantia contratual</Label>
            </div>
            {formData.exige_garantia && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Percentual da Garantia (%)</Label>
                  <Input type="number" step="0.01" min="0" max="30" placeholder="Ex: 5" value={formData.percentual_garantia} onChange={(e) => handleInputChange('percentual_garantia', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Garantia</Label>
                  <Select value={formData.tipo_garantia} onValueChange={(v) => handleInputChange('tipo_garantia', v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CAUCAO_DINHEIRO">Caução em Dinheiro</SelectItem>
                      <SelectItem value="CAUCAO_TITULO">Caução em Títulos da Dívida Pública</SelectItem>
                      <SelectItem value="FIANCA_BANCARIA">Fiança Bancária</SelectItem>
                      <SelectItem value="SEGURO_GARANTIA">Seguro-Garantia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Observações adicionais sobre o contrato (opcional)"
              value={formData.observacoes}
              onChange={(e) => handleInputChange('observacoes', e.target.value)}
              rows={4}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4 pt-4 border-t">
          <Button type="button" variant="outline" asChild>
            <Link href="/orgao/contratos">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={loading} className="bg-green-600 hover:bg-green-700">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Criar Contrato
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}


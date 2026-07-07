'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Bot, Upload, FileText, CheckCircle, AlertTriangle, Loader2, Plus, Trash2, ArrowLeft, ExternalLink } from 'lucide-react'

type Estado = 'idle' | 'uploading' | 'revisando' | 'confirmando' | 'concluido'

interface ItemContrato {
  descricao: string
  unidade_medida: string
  quantidade: number
  valor_unitario: number
  quantidade_meses: number | null
  valor_total: number
}

interface DadosExtraidos {
  numero_contrato?: string
  objeto: string
  fornecedor_cnpj: string
  fornecedor_razao_social: string
  fornecedor_id?: string
  fornecedor_ja_cadastrado: boolean
  tipo: string
  categoria: string
  modalidade_execucao: string
  valor_inicial: number
  valor_global: number
  data_assinatura?: string
  data_vigencia_inicio?: string
  data_vigencia_fim?: string
  prazo_vigencia_meses?: number
  numero_processo?: string
  amparo_legal?: string
  itens: ItemContrato[]
  pendencias: string[]
}

const TIPOS_CONTRATO = [
  { value: 'CONTRATO', label: 'Contrato' },
  { value: 'NOTA_EMPENHO', label: 'Nota de Empenho' },
  { value: 'ORDEM_SERVICO', label: 'Ordem de Serviço' },
  { value: 'ORDEM_FORNECIMENTO', label: 'Ordem de Fornecimento' },
  { value: 'CARTA_CONTRATO', label: 'Carta-Contrato' },
  { value: 'TERMO_ADESAO', label: 'Termo de Adesão' },
  { value: 'ATA_REGISTRO_PRECO', label: 'Ata de Registro de Preço' },
]

const CATEGORIAS = [
  { value: 'COMPRAS', label: 'Compras' },
  { value: 'SERVICOS', label: 'Serviços' },
  { value: 'OBRAS', label: 'Obras' },
  { value: 'SERVICOS_ENGENHARIA', label: 'Serviços de Engenharia' },
  { value: 'LOCACAO', label: 'Locação' },
  { value: 'ALIENACAO', label: 'Alienação' },
]

const MODALIDADES = [
  { value: 'ITEM_QUANTIDADE', label: 'Item/Quantidade' },
  { value: 'MEDICAO', label: 'Medição' },
  { value: 'CONTINUADO', label: 'Continuado' },
  { value: 'LICENCA', label: 'Licença' },
  { value: 'ORDEM_SERVICO', label: 'Ordem de Serviço' },
]

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

async function parseResponseSafely(res: Response): Promise<any> {
  const contentType = res.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    return await res.json()
  }

  const text = await res.text()
  return {
    message: text || `Erro HTTP ${res.status}`,
  }
}

export default function ImportarContratoIaPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [estado, setEstado] = useState<Estado>('idle')
  const [arquivoNome, setArquivoNome] = useState('')
  const [erro, setErro] = useState('')
  const [dados, setDados] = useState<DadosExtraidos | null>(null)
  const [resultado, setResultado] = useState<{ contrato_id: string; numero_contrato: string; aviso?: string } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [mensagens, setMensagens] = useState<Array<{ tipo: 'user' | 'agent'; texto: string }>>([])

  const addMensagem = (tipo: 'user' | 'agent', texto: string) => {
    setMensagens(prev => [...prev, { tipo, texto }])
  }

  const processarArquivo = async (file: File) => {
    if (!file) return
    setErro('')
    setArquivoNome(file.name)
    setEstado('uploading')
    addMensagem('user', `Enviando arquivo: ${file.name}`)

    const formData = new FormData()
    formData.append('arquivo', file)

    try {
      const res = await authFetch('/api/contratos/importar-ia/upload', {
        method: 'POST',
        body: formData,
      })
      const json = await parseResponseSafely(res)
      if (!res.ok) throw new Error(json.message || 'Erro ao processar arquivo')

      setDados(json)
      setEstado('revisando')
      addMensagem('agent',
        `Analisei o documento e extraí os dados do contrato.\n` +
        `**Objeto:** ${json.objeto || 'Não identificado'}\n` +
        `**Fornecedor:** ${json.fornecedor_razao_social || 'Não identificado'}\n` +
        `**Valor Global:** ${formatCurrency(json.valor_global || 0)}\n` +
        (json.pendencias?.length > 0 ? `\n⚠️ Atenção: ${json.pendencias.length} campo(s) pendente(s) de preenchimento.` : '✅ Todos os campos identificados.')
      )
    } catch (err: any) {
      setErro(err.message || 'Erro ao processar arquivo')
      setEstado('idle')
      addMensagem('agent', `❌ Erro: ${err.message}`)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processarArquivo(file)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processarArquivo(file)
  }, [])

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = () => setIsDragging(false)

  const atualizarDados = (campo: keyof DadosExtraidos, valor: any) => {
    setDados(prev => prev ? { ...prev, [campo]: valor } : prev)
  }

  const atualizarItem = (idx: number, campo: keyof ItemContrato, valor: any) => {
    setDados(prev => {
      if (!prev) return prev
      const itens = [...prev.itens]
      itens[idx] = { ...itens[idx], [campo]: valor }
      const qtd = Number(itens[idx].quantidade) || 0
      const vUnit = Number(itens[idx].valor_unitario) || 0
      const meses = itens[idx].quantidade_meses ? Number(itens[idx].quantidade_meses) : null
      itens[idx].valor_total = meses ? qtd * vUnit * meses : qtd * vUnit
      return { ...prev, itens }
    })
  }

  const removerItem = (idx: number) => {
    setDados(prev => prev ? { ...prev, itens: prev.itens.filter((_, i) => i !== idx) } : prev)
  }

  const adicionarItem = () => {
    setDados(prev => prev ? {
      ...prev,
      itens: [...prev.itens, { descricao: '', unidade_medida: 'UNIDADE', quantidade: 1, valor_unitario: 0, quantidade_meses: null, valor_total: 0 }]
    } : prev)
  }

  const temPendenciasNaoResolvidas = () => {
    if (!dados) return true
    if (!dados.objeto?.trim()) return true
    if (!dados.fornecedor_cnpj?.trim() && !dados.fornecedor_id) return true
    if (!dados.valor_global || dados.valor_global <= 0) return true
    return false
  }

  const confirmar = async () => {
    if (!dados) return
    setEstado('confirmando')
    addMensagem('user', 'Confirmando dados e cadastrando contrato...')

    try {
      const res = await authFetch('/api/contratos/importar-ia/confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      })
      const json = await parseResponseSafely(res)
      if (!res.ok) throw new Error(json.message || 'Erro ao cadastrar contrato')

      setResultado(json)
      setEstado('concluido')
      addMensagem('agent',
        `✅ Contrato cadastrado com sucesso!\n**Número:** ${json.numero_contrato}\n**Itens criados:** ${json.itens_criados ?? 0}` +
        (json.aviso ? `\n\n📌 ${json.aviso}` : '')
      )
    } catch (err: any) {
      setErro(err.message || 'Erro ao cadastrar contrato')
      setEstado('revisando')
      addMensagem('agent', `❌ Erro ao cadastrar: ${err.message}`)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="outline" size="sm" asChild>
            <Link href="/orgao/contratos"><ArrowLeft className="w-4 h-4 mr-1" />Contratos</Link>
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Importar Contrato com IA</h1>
              <p className="text-sm text-gray-500">Envie o PDF ou imagem do contrato e a IA extrai os dados automaticamente</p>
            </div>
          </div>
        </div>

        {/* Layout two-pane */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Painel Esquerdo — Chat */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {/* Drop Zone (apenas no idle) */}
            {(estado === 'idle' || estado === 'uploading') && (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  isDragging ? 'border-purple-500 bg-purple-50' : 'border-gray-300 hover:border-purple-400 hover:bg-gray-50'
                }`}
              >
                <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange} className="hidden" />
                {estado === 'uploading' ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-10 h-10 text-purple-500 animate-spin" />
                    <p className="text-sm text-gray-600">Analisando <span className="font-medium">{arquivoNome}</span>...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="w-10 h-10 text-gray-400" />
                    <p className="font-medium text-gray-700">Arraste o contrato aqui</p>
                    <p className="text-sm text-gray-500">ou clique para selecionar</p>
                    <p className="text-xs text-gray-400">PDF, JPG, PNG — máximo 10MB</p>
                  </div>
                )}
              </div>
            )}

            {/* Histórico de mensagens */}
            {mensagens.length > 0 && (
              <div className="flex flex-col gap-3">
                {mensagens.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.tipo === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line ${
                      msg.tipo === 'user'
                        ? 'bg-purple-600 text-white rounded-br-sm'
                        : 'bg-white border border-gray-200 text-gray-700 rounded-bl-sm shadow-sm'
                    }`}>
                      {msg.tipo === 'agent' && (
                        <div className="flex items-center gap-1.5 mb-1">
                          <Bot className="w-3.5 h-3.5 text-purple-500" />
                          <span className="text-xs font-medium text-purple-600">Agente IA</span>
                        </div>
                      )}
                      {msg.texto.split('\n').map((linha, i) => {
                        const bold = linha.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        return <p key={i} dangerouslySetInnerHTML={{ __html: bold }} />
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Resultado final */}
            {estado === 'concluido' && resultado && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="font-semibold text-green-800">Contrato {resultado.numero_contrato} cadastrado!</span>
                </div>
                <Button asChild className="bg-green-600 hover:bg-green-700">
                  <Link href={`/orgao/contratos/${resultado.contrato_id}`}>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Abrir Contrato
                  </Link>
                </Button>
                <Button variant="outline" onClick={() => { setEstado('idle'); setDados(null); setMensagens([]); setArquivoNome('') }}>
                  Importar outro contrato
                </Button>
              </div>
            )}

            {/* Erro */}
            {erro && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">{erro}</p>
              </div>
            )}
          </div>

          {/* Painel Direito — Formulário de revisão */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            {estado === 'idle' && (
              <div className="flex items-center justify-center h-64 bg-white rounded-xl border border-dashed border-gray-200">
                <div className="text-center text-gray-400">
                  <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Envie um contrato para começar</p>
                  <p className="text-sm mt-1">Os dados extraídos aparecerão aqui para revisão</p>
                </div>
              </div>
            )}

            {(estado === 'revisando' || estado === 'confirmando') && dados && (
              <>
                {/* Pendências */}
                {dados.pendencias?.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span className="text-sm font-semibold text-amber-800">Campos não identificados — preencha antes de confirmar</span>
                    </div>
                    <ul className="list-disc list-inside text-sm text-amber-700 space-y-0.5">
                      {dados.pendencias.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </div>
                )}

                {/* Card: Dados do Contrato */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="w-4 h-4 text-purple-500" />
                      Dados do Contrato
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-gray-500">Número do Contrato</Label>
                      <Input
                        value={dados.numero_contrato || ''}
                        onChange={e => atualizarDados('numero_contrato', e.target.value)}
                        placeholder="Ex.: 012/2026"
                        className="mt-1 h-9 text-sm"
                      />
                      <p className="text-[11px] text-gray-400 mt-1">Confira com o documento. Se deixar vazio, o sistema gera automaticamente.</p>
                    </div>
                    <div className="hidden md:block" />
                    <div className="md:col-span-2">
                      <Label className="text-xs text-gray-500">Objeto *</Label>
                      <textarea
                        value={dados.objeto}
                        onChange={e => atualizarDados('objeto', e.target.value)}
                        className="w-full mt-1 border rounded-md p-2 text-sm resize-none h-20 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Tipo *</Label>
                      <Select value={dados.tipo} onValueChange={v => atualizarDados('tipo', v)}>
                        <SelectTrigger className="mt-1 h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIPOS_CONTRATO.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Categoria *</Label>
                      <Select value={dados.categoria} onValueChange={v => atualizarDados('categoria', v)}>
                        <SelectTrigger className="mt-1 h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Modalidade de Execução *</Label>
                      <Select value={dados.modalidade_execucao} onValueChange={v => atualizarDados('modalidade_execucao', v)}>
                        <SelectTrigger className="mt-1 h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MODALIDADES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Número do Processo</Label>
                      <Input value={dados.numero_processo || ''} onChange={e => atualizarDados('numero_processo', e.target.value)} className="mt-1 h-9 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Valor Inicial (R$) *</Label>
                      <Input type="number" value={dados.valor_inicial} onChange={e => atualizarDados('valor_inicial', parseFloat(e.target.value) || 0)} className="mt-1 h-9 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Valor Global (R$) *</Label>
                      <Input type="number" value={dados.valor_global} onChange={e => atualizarDados('valor_global', parseFloat(e.target.value) || 0)} className="mt-1 h-9 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Data de Assinatura</Label>
                      <Input type="date" value={dados.data_assinatura || ''} onChange={e => atualizarDados('data_assinatura', e.target.value)} className="mt-1 h-9 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Prazo de Vigência (meses)</Label>
                      <Input type="number" value={dados.prazo_vigencia_meses || ''} onChange={e => atualizarDados('prazo_vigencia_meses', parseInt(e.target.value) || undefined)} className="mt-1 h-9 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Vigência Início</Label>
                      <Input type="date" value={dados.data_vigencia_inicio || ''} onChange={e => atualizarDados('data_vigencia_inicio', e.target.value)} className="mt-1 h-9 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Vigência Fim</Label>
                      <Input type="date" value={dados.data_vigencia_fim || ''} onChange={e => atualizarDados('data_vigencia_fim', e.target.value)} className="mt-1 h-9 text-sm" />
                    </div>
                  </CardContent>
                </Card>

                {/* Card: Fornecedor */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2 justify-between">
                      <span className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-purple-500" />
                        Fornecedor
                      </span>
                      <Badge variant={dados.fornecedor_ja_cadastrado ? 'default' : 'secondary'} className={dados.fornecedor_ja_cadastrado ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}>
                        {dados.fornecedor_ja_cadastrado ? '✓ Já cadastrado' : '+ Será criado'}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-gray-500">CNPJ/CPF *</Label>
                      <Input value={dados.fornecedor_cnpj || ''} onChange={e => atualizarDados('fornecedor_cnpj', e.target.value)} className="mt-1 h-9 text-sm" placeholder="00000000000000" />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Razão Social</Label>
                      <Input value={dados.fornecedor_razao_social || ''} onChange={e => atualizarDados('fornecedor_razao_social', e.target.value)} className="mt-1 h-9 text-sm" />
                    </div>
                  </CardContent>
                </Card>

                {/* Card: Itens */}
                {(dados.modalidade_execucao === 'MEDICAO' || dados.modalidade_execucao === 'ITEM_QUANTIDADE' || dados.modalidade_execucao === 'ORDEM_SERVICO') && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-purple-500" />
                          Itens do Contrato ({dados.itens.length})
                        </span>
                        <Button variant="outline" size="sm" onClick={adicionarItem}>
                          <Plus className="w-3.5 h-3.5 mr-1" />Adicionar Item
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {dados.itens.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">Nenhum item identificado. Clique em Adicionar Item.</p>
                      ) : (
                        <div className="space-y-4">
                          {dados.itens.map((item, idx) => (
                            <div key={idx} className="border rounded-lg p-3 bg-gray-50 relative">
                              <button onClick={() => removerItem(idx)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500">
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="col-span-2 md:col-span-4">
                                  <Label className="text-xs text-gray-500">Descrição</Label>
                                  <Input value={item.descricao} onChange={e => atualizarItem(idx, 'descricao', e.target.value)} className="mt-1 h-8 text-sm" />
                                </div>
                                <div>
                                  <Label className="text-xs text-gray-500">Unidade</Label>
                                  <Select value={item.unidade_medida} onValueChange={v => atualizarItem(idx, 'unidade_medida', v)}>
                                    <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {['UNIDADE','MES','HORA','M2','M3','KG','LITRO','SERVICO'].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs text-gray-500">Quantidade</Label>
                                  <Input type="number" value={item.quantidade} onChange={e => atualizarItem(idx, 'quantidade', parseFloat(e.target.value) || 0)} className="mt-1 h-8 text-sm" />
                                </div>
                                <div>
                                  <Label className="text-xs text-gray-500">Valor Unitário</Label>
                                  <Input type="number" value={item.valor_unitario} onChange={e => atualizarItem(idx, 'valor_unitario', parseFloat(e.target.value) || 0)} className="mt-1 h-8 text-sm" />
                                </div>
                                <div>
                                  <Label className="text-xs text-gray-500">Meses</Label>
                                  <Input type="number" value={item.quantidade_meses || ''} onChange={e => atualizarItem(idx, 'quantidade_meses', parseInt(e.target.value) || null)} className="mt-1 h-8 text-sm" placeholder="Opcional" />
                                </div>
                                <div className="col-span-2 md:col-span-4 text-right">
                                  <span className="text-xs text-gray-500">Total: </span>
                                  <span className="text-sm font-semibold text-purple-700">{formatCurrency(item.valor_total)}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                          <div className="flex justify-end pt-2 border-t">
                            <span className="text-sm text-gray-500 mr-2">Total dos Itens:</span>
                            <span className="font-bold text-purple-700">
                              {formatCurrency(dados.itens.reduce((s, i) => s + (i.valor_total || 0), 0))}
                            </span>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Botão Confirmar */}
                <Button
                  onClick={confirmar}
                  disabled={temPendenciasNaoResolvidas() || estado === 'confirmando'}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white h-11"
                >
                  {estado === 'confirmando' ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Cadastrando contrato...</>
                  ) : (
                    <><CheckCircle className="w-4 h-4 mr-2" />Confirmar e Cadastrar Contrato</>
                  )}
                </Button>
                {temPendenciasNaoResolvidas() && (
                  <p className="text-xs text-center text-amber-600">Preencha os campos obrigatórios (marcados com *) antes de confirmar.</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

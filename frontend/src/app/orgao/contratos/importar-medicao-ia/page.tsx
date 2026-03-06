'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { authFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Bot, Upload, FileText, CheckCircle, AlertTriangle, Loader2,
  Plus, Trash2, ArrowLeft, ExternalLink, Search, TrendingUp, XCircle, ClipboardList
} from 'lucide-react'

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
  numero_contrato: string
  fornecedor_cnpj: string
  fornecedor_razao_social: string
  fornecedor_id?: string
  fornecedor_ja_cadastrado: boolean
  contrato_id?: string
  contrato_ja_cadastrado: boolean
  objeto: string
  valor_global: number
  valor_executado_ate_periodo: number
  fiscal_nome?: string
  fiscal_portaria?: string
  itens: ItemContrato[]
  pendencias: string[]
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function calcularSaldo(valorGlobal: number, executado: number): number {
  return Math.max(0, valorGlobal - executado)
}

function calcularPercentual(executado: number, total: number): number {
  if (!total) return 0
  return Math.round((executado / total) * 100 * 10) / 10
}

export default function ImportarMedicaoIaPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [estado, setEstado] = useState<Estado>('idle')
  const [arquivoNome, setArquivoNome] = useState('')
  const [erro, setErro] = useState('')
  const [dados, setDados] = useState<DadosExtraidos | null>(null)
  const [resultado, setResultado] = useState<{ contrato_id: string; numero_contrato: string; itens_criados: number; aviso?: string } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [criarContrato, setCriarContrato] = useState(false)
  const [tipoContrato, setTipoContrato] = useState('CONTRATO')
  const [categoria, setCategoria] = useState('SERVICOS')
  const [modalidade, setModalidade] = useState('CONTINUADO')
  const [mensagens, setMensagens] = useState<Array<{ tipo: 'user' | 'agent'; texto: string }>>([])

  const addMensagem = (tipo: 'user' | 'agent', texto: string) => {
    setMensagens(prev => [...prev, { tipo, texto }])
  }

  const processarArquivo = async (file: File) => {
    if (!file) return
    setErro('')
    setArquivoNome(file.name)
    setEstado('uploading')
    addMensagem('user', `Enviando planilha: ${file.name}`)

    const formData = new FormData()
    formData.append('arquivo', file)

    try {
      const res = await authFetch('/api/contratos/importar-medicao-ia/upload', {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.message || 'Erro ao processar arquivo')

      setDados(json)
      setEstado('revisando')

      const saldo = calcularSaldo(json.valor_global || 0, json.valor_executado_ate_periodo || 0)
      const pct = calcularPercentual(json.valor_executado_ate_periodo || 0, json.valor_global || 0)

      if (!json.contrato_ja_cadastrado) setCriarContrato(true)

      addMensagem('agent',
        `Analisei a planilha de medição e extraí os dados do contrato.\n\n` +
        `**Contrato:** ${json.numero_contrato || 'Não identificado'}\n` +
        `**Fornecedor:** ${json.fornecedor_razao_social || 'Não identificado'}\n` +
        `**Fiscal:** ${json.fiscal_nome || 'Não identificado'}\n\n` +
        `💰 **Valor Global:** ${formatCurrency(json.valor_global || 0)}\n` +
        `📊 **Executado:** ${formatCurrency(json.valor_executado_ate_periodo || 0)} (${pct}%)\n` +
        `✅ **Saldo restante:** ${formatCurrency(saldo)}\n\n` +
        (json.contrato_ja_cadastrado
          ? `🔗 Contrato **encontrado** no sistema. Os itens serão adicionados ao cronograma.`
          : `⚠️ Contrato **não encontrado** no sistema. Preencha os dados e clique em **Cadastrar Contrato e Importar**.`) +
        (json.pendencias?.length > 0 ? `\n\n⚠️ ${json.pendencias.length} campo(s) pendente(s) de preenchimento.` : '')
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
      if (['quantidade', 'valor_unitario', 'quantidade_meses'].includes(campo)) {
        const qtd = Number(itens[idx].quantidade) || 0
        const vUnit = Number(itens[idx].valor_unitario) || 0
        const meses = itens[idx].quantidade_meses ? Number(itens[idx].quantidade_meses) : null
        itens[idx].valor_total = meses ? qtd * vUnit * meses : qtd * vUnit
      }
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

  type CheckItem = { label: string; ok: boolean; aviso?: boolean; detalhe?: string }

  const gerarChecklist = (): CheckItem[] => {
    if (!dados) return []
    const checks: CheckItem[] = []

    checks.push({
      label: 'Número do contrato identificado',
      ok: !!dados.numero_contrato?.trim(),
      detalhe: dados.numero_contrato || 'Não identificado',
    })

    checks.push({
      label: dados.contrato_ja_cadastrado
        ? 'Contrato encontrado no sistema'
        : criarContrato
          ? 'Criar novo contrato (dados da planilha)'
          : 'Contrato não encontrado — marque a opção de criar',
      ok: dados.contrato_ja_cadastrado || criarContrato,
      detalhe: dados.contrato_ja_cadastrado ? 'Vinculado ✓' : criarContrato ? 'Será criado' : 'Necessário marcar',
    })

    checks.push({
      label: 'Fornecedor (CNPJ)',
      ok: !!(dados.fornecedor_id || dados.fornecedor_cnpj?.replace(/\D/g, '').length === 14),
      detalhe: dados.fornecedor_razao_social || dados.fornecedor_cnpj || 'Não identificado',
    })

    checks.push({
      label: 'Objeto do contrato',
      ok: !!dados.objeto?.trim(),
      detalhe: dados.objeto ? dados.objeto.substring(0, 60) + (dados.objeto.length > 60 ? '…' : '') : 'Não preenchido',
    })

    checks.push({
      label: 'Valor global do contrato',
      ok: (dados.valor_global || 0) > 0,
      detalhe: dados.valor_global ? formatCurrency(dados.valor_global) : 'R$ 0,00 — preencha o valor',
    })

    checks.push({
      label: 'Fiscal do contrato',
      ok: !!dados.fiscal_nome?.trim(),
      aviso: true,
      detalhe: dados.fiscal_nome || 'Não identificado (recomendado)',
    })

    const itensValidos = dados.itens.filter(
      i => i.descricao?.trim() && i.quantidade > 0 && i.valor_unitario > 0
    )
    checks.push({
      label: `Itens do cronograma (${itensValidos.length}/${dados.itens.length} válidos)`,
      ok: itensValidos.length > 0,
      detalhe: dados.itens.length === 0
        ? 'Nenhum item — adicione pelo menos 1'
        : itensValidos.length < dados.itens.length
          ? `${dados.itens.length - itensValidos.length} item(s) incompleto(s)`
          : 'Todos os itens preenchidos',
    })

    const itensComUnidade = dados.itens.filter(i => i.unidade_medida?.trim())
    checks.push({
      label: 'Unidade de medida dos itens',
      ok: dados.itens.length > 0 && itensComUnidade.length === dados.itens.length,
      aviso: true,
      detalhe: itensComUnidade.length < dados.itens.length
        ? `${dados.itens.length - itensComUnidade.length} item(s) sem unidade`
        : 'Preenchido',
    })

    return checks
  }

  const temPendenciasNaoResolvidas = () => {
    if (!dados) return true
    const checks = gerarChecklist()
    return checks.some(c => !c.ok && !c.aviso)
  }

  const confirmar = async () => {
    if (!dados) return
    setEstado('confirmando')
    addMensagem('user', 'Confirmando dados e atualizando contrato...')

    try {
      const payload = {
        contrato_id: dados.contrato_id,
        criar_contrato: criarContrato,
        numero_contrato: dados.numero_contrato,
        fornecedor_id: dados.fornecedor_id,
        fornecedor_cnpj: dados.fornecedor_cnpj,
        fornecedor_razao_social: dados.fornecedor_razao_social,
        objeto: dados.objeto,
        valor_global: dados.valor_global,
        valor_executado_ate_periodo: dados.valor_executado_ate_periodo,
        fiscal_nome: dados.fiscal_nome,
        fiscal_portaria: dados.fiscal_portaria,
        tipo: tipoContrato,
        categoria: categoria,
        modalidade_execucao: modalidade,
        itens: dados.itens,
      }

      const res = await authFetch('/api/contratos/importar-medicao-ia/confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.message || 'Erro ao atualizar contrato')

      setResultado(json)
      setEstado('concluido')
      addMensagem('agent',
        `✅ Importação concluída!\n` +
        `**Contrato:** ${json.numero_contrato}\n` +
        (json.contrato_criado ? `🆕 Novo contrato cadastrado no sistema.\n` : `🔗 Contrato existente atualizado.\n`) +
        (json.ajuste_aplicado ? `💰 Ajuste de Migração aplicado com histórico (saldo executado registrado).\n` : '') +
        `📋 **Itens criados no cronograma:** ${json.itens_criados}` +
        (json.aviso ? `\n\n⚠️ ${json.aviso}` : '')
      )
    } catch (err: any) {
      setErro(err.message || 'Erro ao importar')
      setEstado('revisando')
      addMensagem('agent', `❌ Erro: ${err.message}`)
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
            <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Importar Planilha de Medição com IA</h1>
              <p className="text-sm text-gray-500">Envie a planilha de medição (PDF/imagem) — a IA extrai fiscal, itens e execução financeira</p>
            </div>
          </div>
        </div>

        {/* Aviso */}
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2 text-sm text-blue-700">
          <Search className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Este agente lê planilhas de medição/relatórios de atividades e vincula ao contrato já cadastrado.
            Para cadastrar um contrato novo, use <Link href="/orgao/contratos/importar-ia" className="font-semibold underline">Importar Contrato com IA</Link>.
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Painel Esquerdo — Chat */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {(estado === 'idle' || estado === 'uploading') && (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  isDragging ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300 hover:border-emerald-400 hover:bg-gray-50'
                }`}
              >
                <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange} className="hidden" />
                {estado === 'uploading' ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
                    <p className="text-sm text-gray-600">Analisando <span className="font-medium">{arquivoNome}</span>...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="w-10 h-10 text-gray-400" />
                    <p className="font-medium text-gray-700">Arraste a planilha de medição aqui</p>
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
                        ? 'bg-emerald-600 text-white rounded-br-sm'
                        : 'bg-white border border-gray-200 text-gray-700 rounded-bl-sm shadow-sm'
                    }`}>
                      {msg.tipo === 'agent' && (
                        <div className="flex items-center gap-1.5 mb-1">
                          <Bot className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-xs font-medium text-emerald-600">Agente IA</span>
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
                  <span className="font-semibold text-green-800">Contrato {resultado.numero_contrato} atualizado!</span>
                </div>
                <Button asChild className="bg-green-600 hover:bg-green-700">
                  <Link href={`/orgao/contratos/${resultado.contrato_id}?tab=medicao`}>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Abrir Aba de Medição
                  </Link>
                </Button>
                <Button variant="outline" onClick={() => { setEstado('idle'); setDados(null); setMensagens([]); setArquivoNome('') }}>
                  Importar outra planilha
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

          {/* Painel Direito — Revisão */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            {estado === 'idle' && (
              <div className="flex items-center justify-center h-64 bg-white rounded-xl border border-dashed border-gray-200">
                <div className="text-center text-gray-400">
                  <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Envie uma planilha de medição para começar</p>
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
                      <span className="text-sm font-semibold text-amber-800">Campos não identificados</span>
                    </div>
                    <ul className="list-disc list-inside text-sm text-amber-700 space-y-0.5">
                      {dados.pendencias.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </div>
                )}

                {/* Status do contrato */}
                <div className={`rounded-xl p-4 border flex items-start gap-3 ${
                  dados.contrato_ja_cadastrado
                    ? 'bg-green-50 border-green-200'
                    : 'bg-amber-50 border-amber-200'
                }`}>
                  {dados.contrato_ja_cadastrado
                    ? <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                    : <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                  }
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${dados.contrato_ja_cadastrado ? 'text-green-800' : 'text-amber-800'}`}>
                      {dados.contrato_ja_cadastrado
                        ? `Contrato ${dados.numero_contrato} encontrado no sistema ✓`
                        : `Contrato ${dados.numero_contrato} não encontrado no sistema`
                      }
                    </p>
                    {!dados.contrato_ja_cadastrado && (
                      <div className="mt-2">
                        <p className="text-xs text-amber-700 mb-2">Os dados extraídos serão usados para criar um novo contrato.</p>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={criarContrato}
                            onChange={e => setCriarContrato(e.target.checked)}
                            className="w-4 h-4 accent-emerald-600"
                          />
                          <span className="text-sm font-medium text-amber-800">Cadastrar novo contrato com estes dados</span>
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                {/* Campos extras para criação de contrato */}
                {criarContrato && !dados.contrato_ja_cadastrado && (
                  <Card className="border-amber-200 bg-amber-50">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base text-amber-800">Configurar Novo Contrato</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs text-gray-500">Tipo</Label>
                        <Select value={tipoContrato} onValueChange={setTipoContrato}>
                          <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['CONTRATO','NOTA_EMPENHO','CARTA_CONTRATO','ATA_REGISTRO_PRECO'].map(t => <SelectItem key={t} value={t}>{t.replace('_',' ')}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Categoria</Label>
                        <Select value={categoria} onValueChange={setCategoria}>
                          <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[['COMPRAS','Compras'],['SERVICOS','Serviços'],['OBRAS','Obras'],['LOCACAO','Locação']].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Modalidade</Label>
                        <Select value={modalidade} onValueChange={setModalidade}>
                          <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[['CONTINUADO','Continuado'],['MEDICAO','Medição'],['ITEM_QUANTIDADE','Item/Qtd'],['LICENCA','Licença']].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Card: Execução Financeira */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                      Execução Financeira
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500 mb-1">Valor Global</p>
                        <p className="text-sm font-bold text-gray-800">{formatCurrency(dados.valor_global || 0)}</p>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-blue-600 mb-1">Executado</p>
                        <p className="text-sm font-bold text-blue-700">{formatCurrency(dados.valor_executado_ate_periodo || 0)}</p>
                        <p className="text-xs text-blue-500">{calcularPercentual(dados.valor_executado_ate_periodo, dados.valor_global)}%</p>
                      </div>
                      <div className="bg-emerald-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-emerald-600 mb-1">Saldo</p>
                        <p className="text-sm font-bold text-emerald-700">{formatCurrency(calcularSaldo(dados.valor_global, dados.valor_executado_ate_periodo))}</p>
                      </div>
                    </div>
                    {/* Barra de progresso */}
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-emerald-500 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(100, calcularPercentual(dados.valor_executado_ate_periodo, dados.valor_global))}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <div>
                        <Label className="text-xs text-gray-500">Valor Global (R$)</Label>
                        <Input type="number" value={dados.valor_global} onChange={e => atualizarDados('valor_global', parseFloat(e.target.value) || 0)} className="mt-1 h-9 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Executado até o período (R$)</Label>
                        <Input type="number" value={dados.valor_executado_ate_periodo} onChange={e => atualizarDados('valor_executado_ate_periodo', parseFloat(e.target.value) || 0)} className="mt-1 h-9 text-sm" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Card: Contrato e Fiscal */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-500" />
                      Contrato e Fiscal
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-gray-500">Número do Contrato</Label>
                      <Input value={dados.numero_contrato || ''} onChange={e => atualizarDados('numero_contrato', e.target.value)} className="mt-1 h-9 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Fornecedor (CNPJ)</Label>
                      <Input value={dados.fornecedor_cnpj || ''} onChange={e => atualizarDados('fornecedor_cnpj', e.target.value)} className="mt-1 h-9 text-sm" placeholder="00000000000000" />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Nome do Fiscal</Label>
                      <Input value={dados.fiscal_nome || ''} onChange={e => atualizarDados('fiscal_nome', e.target.value)} className="mt-1 h-9 text-sm" placeholder="Nome do fiscal do contrato" />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Portaria do Fiscal</Label>
                      <Input value={dados.fiscal_portaria || ''} onChange={e => atualizarDados('fiscal_portaria', e.target.value)} className="mt-1 h-9 text-sm" placeholder="Ex: Portaria nº 102/2025" />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs text-gray-500">Objeto</Label>
                      <textarea
                        value={dados.objeto}
                        onChange={e => atualizarDados('objeto', e.target.value)}
                        className="w-full mt-1 border rounded-md p-2 text-sm resize-none h-20 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Card: Itens do Cronograma */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-500" />
                        Itens do Cronograma Físico-Financeiro ({dados.itens.length})
                      </span>
                      <Button variant="outline" size="sm" onClick={adicionarItem}>
                        <Plus className="w-3.5 h-3.5 mr-1" />Adicionar
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {dados.itens.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">Nenhum item identificado. Clique em Adicionar.</p>
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
                                <textarea
                                  value={item.descricao}
                                  onChange={e => atualizarItem(idx, 'descricao', e.target.value)}
                                  className="w-full mt-1 border rounded-md p-2 text-sm resize-none h-16 focus:ring-2 focus:ring-emerald-500"
                                />
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
                                <span className="text-sm font-semibold text-emerald-700">{formatCurrency(item.valor_total)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="flex justify-end pt-2 border-t">
                          <span className="text-sm text-gray-500 mr-2">Total dos Itens:</span>
                          <span className="font-bold text-emerald-700">
                            {formatCurrency(dados.itens.reduce((s, i) => s + (i.valor_total || 0), 0))}
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Checklist de validação */}
                {(() => {
                  const checks = gerarChecklist()
                  const erros = checks.filter(c => !c.ok && !c.aviso)
                  const avisos = checks.filter(c => !c.ok && c.aviso)
                  return (
                    <Card className={`border-2 ${erros.length > 0 ? 'border-red-200 bg-red-50' : avisos.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
                      <CardHeader className="pb-2 pt-3 px-4">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <ClipboardList className="w-4 h-4" />
                          Checklist de Validação
                          {erros.length > 0 && <span className="text-red-600 font-normal">— {erros.length} campo(s) obrigatório(s) pendente(s)</span>}
                          {erros.length === 0 && avisos.length > 0 && <span className="text-amber-600 font-normal">— {avisos.length} aviso(s)</span>}
                          {erros.length === 0 && avisos.length === 0 && <span className="text-green-600 font-normal">— Pronto para importar</span>}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-3">
                        <div className="grid grid-cols-1 gap-1.5">
                          {checks.map((c, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm">
                              {c.ok
                                ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                                : c.aviso
                                  ? <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                  : <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                              }
                              <div>
                                <span className={`font-medium ${c.ok ? 'text-gray-700' : c.aviso ? 'text-amber-700' : 'text-red-700'}`}>{c.label}</span>
                                {c.detalhe && <p className="text-xs text-gray-500 mt-0.5">{c.detalhe}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })()}

                {/* Botão Confirmar */}
                <Button
                  onClick={confirmar}
                  disabled={temPendenciasNaoResolvidas() || estado === 'confirmando'}
                  className={`w-full text-white h-11 ${
                    criarContrato && !dados.contrato_ja_cadastrado
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {estado === 'confirmando' ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importando dados...</>
                  ) : criarContrato && !dados.contrato_ja_cadastrado ? (
                    <><CheckCircle className="w-4 h-4 mr-2" />Cadastrar Contrato e Importar</>
                  ) : (
                    <><CheckCircle className="w-4 h-4 mr-2" />Confirmar e Importar para o Contrato</>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

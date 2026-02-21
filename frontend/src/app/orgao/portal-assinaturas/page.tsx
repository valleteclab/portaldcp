'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Plus, FileText, Send, CheckCircle, Clock, Eye, Loader2, X,
  Upload, Users, Trash2, Download, Search, RefreshCw, FilePen,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { ModuleGuard } from '@/components/ModuleGuard'
import { ModuloSistema } from '@/hooks/useModulosOrgao'
import { API_URL, authFetch } from '@/lib/api'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Signatario {
  id: string
  nome: string
  cpf_cnpj: string
  email: string
  telefone: string | null
  status: 'PENDENTE' | 'ASSINADO' | 'REJEITADO'
  data_assinatura?: string
}

interface Documento {
  id: string
  titulo: string
  descricao?: string
  status: 'AGUARDANDO_ASSINATURAS' | 'CONCLUIDO' | 'CANCELADO'
  arquivo_original_url: string
  arquivo_assinado_url?: string
  signatarios: Signatario[]
  created_at: string
}

interface NovoSignatario {
  nome: string
  cpf_cnpj: string
  email: string
  telefone: string
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  AGUARDANDO_ASSINATURAS: { label: 'Aguardando', color: 'bg-yellow-100 text-yellow-800' },
  CONCLUIDO: { label: 'Concluído', color: 'bg-green-100 text-green-800' },
  CANCELADO: { label: 'Cancelado', color: 'bg-red-100 text-red-800' },
  PENDENTE: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800' },
  ASSINADO: { label: 'Assinado', color: 'bg-green-100 text-green-800' },
  REJEITADO: { label: 'Rejeitado', color: 'bg-red-100 text-red-800' },
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function PortalAssinaturasPage() {
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')

  // Modal novo documento
  const [modalNovo, setModalNovo] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [signatarios, setSignatarios] = useState<NovoSignatario[]>([
    { nome: '', cpf_cnpj: '', email: '', telefone: '' },
  ])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Modal detalhes
  const [docSelecionado, setDocSelecionado] = useState<Documento | null>(null)

  // ─── Carregar documentos ──────────────────────────────────────────────────

  const carregar = async () => {
    setLoading(true)
    try {
      const res = await authFetch(`${API_URL}/portal-assinaturas`)
      if (res.ok) setDocumentos(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregar() }, [])

  // ─── Criar documento ──────────────────────────────────────────────────────

  const handleCriar = async () => {
    setErro('')
    if (!titulo.trim()) return setErro('Informe o título do documento.')
    if (!arquivo) return setErro('Selecione um arquivo PDF.')
    const sigsValidos = signatarios.filter(s => s.nome && s.cpf_cnpj && (s.email || s.telefone))
    if (sigsValidos.length === 0) return setErro('Adicione ao menos um signatário com nome, CPF/CNPJ e e-mail ou telefone.')

    setSalvando(true)
    try {
      const formData = new FormData()
      formData.append('arquivo', arquivo)
      formData.append('dados', JSON.stringify({ titulo, descricao, signatarios: sigsValidos }))

      const res = await authFetch(`${API_URL}/portal-assinaturas`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Erro ao criar documento')
      }

      setModalNovo(false)
      resetForm()
      carregar()
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  const resetForm = () => {
    setTitulo('')
    setDescricao('')
    setArquivo(null)
    setSignatarios([{ nome: '', cpf_cnpj: '', email: '', telefone: '' }])
    setErro('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const addSignatario = () =>
    setSignatarios(prev => [...prev, { nome: '', cpf_cnpj: '', email: '', telefone: '' }])

  const removeSignatario = (i: number) =>
    setSignatarios(prev => prev.filter((_, idx) => idx !== i))

  const updateSignatario = (i: number, field: keyof NovoSignatario, value: string) =>
    setSignatarios(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s))

  // ─── Filtro ───────────────────────────────────────────────────────────────

  const docsFiltrados = documentos.filter(d =>
    d.titulo.toLowerCase().includes(busca.toLowerCase()),
  )

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <ModuleGuard modulo={ModuloSistema.PORTAL_ASSINATURAS}>
      <div className="p-6 space-y-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <FilePen className="h-6 w-6 text-blue-600" />
              Portal de Assinaturas
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Envie documentos PDF para assinatura eletrônica de fornecedores e terceiros.
            </p>
          </div>
          <Button onClick={() => setModalNovo(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Documento
          </Button>
        </div>

        {/* Barra de busca */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por título..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant="outline" onClick={carregar} className="gap-2">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Cards de documentos */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : docsFiltrados.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-16 text-center">
              <FileText className="h-12 w-12 text-gray-300 mb-4" />
              <p className="text-gray-500 font-medium">Nenhum documento encontrado</p>
              <p className="text-sm text-gray-400 mt-1">
                Clique em "Novo Documento" para enviar um PDF para assinatura.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {docsFiltrados.map(doc => {
              const assinados = doc.signatarios.filter(s => s.status === 'ASSINADO').length
              const total = doc.signatarios.length
              const st = STATUS_LABEL[doc.status]
              return (
                <Card key={doc.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                          <h3 className="font-semibold text-gray-900 truncate">{doc.titulo}</h3>
                          <Badge className={`${st.color} text-xs shrink-0`}>{st.label}</Badge>
                        </div>
                        {doc.descricao && (
                          <p className="text-sm text-gray-500 mb-2 line-clamp-1">{doc.descricao}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-gray-400">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {assinados}/{total} assinatura{total !== 1 ? 's' : ''}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                        {/* Barra de progresso */}
                        <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden w-48">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: total > 0 ? `${(assinados / total) * 100}%` : '0%' }}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {doc.arquivo_assinado_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 text-green-700 border-green-300"
                            onClick={() => window.open(`${API_URL.replace('/api', '')}/uploads/${doc.arquivo_assinado_url}`, '_blank')}
                          >
                            <Download className="h-3 w-3" /> PDF Assinado
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => setDocSelecionado(doc)}
                        >
                          <Eye className="h-3 w-3" /> Detalhes
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* ─── Modal Novo Documento ─────────────────────────────────────────── */}
        <Dialog open={modalNovo} onOpenChange={v => { if (!v) { setModalNovo(false); resetForm() } }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-blue-600" />
                Novo Documento para Assinatura
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Título */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Título *</label>
                <Input
                  placeholder="Ex: Contrato de Prestação de Serviços"
                  value={titulo}
                  onChange={e => setTitulo(e.target.value)}
                />
              </div>

              {/* Descrição */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Descrição (opcional)</label>
                <Textarea
                  placeholder="Descreva brevemente o documento..."
                  value={descricao}
                  onChange={e => setDescricao(e.target.value)}
                  rows={2}
                />
              </div>

              {/* Arquivo */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Arquivo PDF *</label>
                <div
                  className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  {arquivo ? (
                    <div className="flex items-center justify-center gap-2 text-blue-600">
                      <FileText className="h-5 w-5" />
                      <span className="font-medium">{arquivo.name}</span>
                      <span className="text-xs text-gray-400">({(arquivo.size / 1024 / 1024).toFixed(1)} MB)</span>
                    </div>
                  ) : (
                    <div className="text-gray-400">
                      <Upload className="h-8 w-8 mx-auto mb-2" />
                      <p className="text-sm">Clique para selecionar o PDF</p>
                      <p className="text-xs mt-1">Máximo 10 MB</p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={e => setArquivo(e.target.files?.[0] || null)}
                />
              </div>

              {/* Signatários */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Signatários *</label>
                  <Button type="button" variant="outline" size="sm" onClick={addSignatario} className="gap-1">
                    <Plus className="h-3 w-3" /> Adicionar
                  </Button>
                </div>
                <div className="space-y-3">
                  {signatarios.map((sig, i) => (
                    <div key={i} className="border rounded-lg p-3 space-y-2 bg-gray-50">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-500">Signatário {i + 1}</span>
                        {signatarios.length > 1 && (
                          <button onClick={() => removeSignatario(i)} className="text-red-400 hover:text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder="Nome completo *"
                          value={sig.nome}
                          onChange={e => updateSignatario(i, 'nome', e.target.value)}
                          className="col-span-2"
                        />
                        <Input
                          placeholder="CPF ou CNPJ *"
                          value={sig.cpf_cnpj}
                          onChange={e => updateSignatario(i, 'cpf_cnpj', e.target.value)}
                        />
                        <Input
                          placeholder="Telefone (WhatsApp)"
                          value={sig.telefone}
                          onChange={e => updateSignatario(i, 'telefone', e.target.value)}
                        />
                        <Input
                          placeholder="E-mail"
                          type="email"
                          value={sig.email}
                          onChange={e => updateSignatario(i, 'email', e.target.value)}
                          className="col-span-2"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {erro && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {erro}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setModalNovo(false); resetForm() }}>
                Cancelar
              </Button>
              <Button onClick={handleCriar} disabled={salvando} className="gap-2">
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {salvando ? 'Enviando...' : 'Criar e Enviar Notificações'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Modal Detalhes ───────────────────────────────────────────────── */}
        {docSelecionado && (
          <Dialog open={!!docSelecionado} onOpenChange={() => setDocSelecionado(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  {docSelecionado.titulo}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {docSelecionado.descricao && (
                  <p className="text-sm text-gray-600">{docSelecionado.descricao}</p>
                )}

                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                    <Users className="h-4 w-4" /> Signatários
                  </h4>
                  <div className="space-y-2">
                    {docSelecionado.signatarios.map(sig => {
                      const st = STATUS_LABEL[sig.status]
                      return (
                        <div key={sig.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-gray-800">{sig.nome}</p>
                            <p className="text-xs text-gray-400">{sig.email || sig.telefone}</p>
                            {sig.data_assinatura && (
                              <p className="text-xs text-green-600 mt-0.5">
                                Assinado em {new Date(sig.data_assinatura).toLocaleString('pt-BR')}
                              </p>
                            )}
                          </div>
                          <Badge className={`${st.color} text-xs`}>{st.label}</Badge>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 flex-1"
                    onClick={() => window.open(`${API_URL.replace('/api', '')}/uploads/${docSelecionado.arquivo_original_url}`, '_blank')}
                  >
                    <Eye className="h-3 w-3" /> Ver PDF Original
                  </Button>
                  {docSelecionado.arquivo_assinado_url && (
                    <Button
                      size="sm"
                      className="gap-1 flex-1 bg-green-600 hover:bg-green-700"
                      onClick={() => window.open(`${API_URL.replace('/api', '')}/uploads/${docSelecionado.arquivo_assinado_url}`, '_blank')}
                    >
                      <Download className="h-3 w-3" /> PDF Assinado
                    </Button>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </ModuleGuard>
  )
}

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  FileText, Send, CheckCircle, Clock, Eye, Loader2, X,
  Upload, Users, Trash2, Download, Search, RefreshCw, FilePen,
  Plus, MousePointer, ChevronRight, ChevronLeft, ArrowLeft,
  ShieldCheck, AlertCircle, UserPlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
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
  token_acesso?: string
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

type TipoSignatario = 'eu_mesmo' | 'usuario_sistema' | 'externo'

interface UsuarioSistema {
  id: string
  nome: string
  email: string
  cpf: string
  cargo?: string
}

interface NovoSignatario {
  tipo: TipoSignatario
  nome: string
  cpf_cnpj: string
  email: string
  telefone: string
  usuario_id?: string
  pagina_assinatura?: number
  pos_x?: number
  pos_y?: number
  is_orgao_user?: boolean
}

interface MarcaPosicao {
  signatarioIdx: number
  pos_x: number
  pos_y: number
}

type Etapa = 'posicionar' | 'signatarios' | 'confirmar'

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  AGUARDANDO_ASSINATURAS: { label: 'Aguardando', color: 'bg-yellow-100 text-yellow-800' },
  CONCLUIDO: { label: 'Concluído', color: 'bg-green-100 text-green-800' },
  CANCELADO: { label: 'Cancelado', color: 'bg-red-100 text-red-800' },
  PENDENTE: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800' },
  ASSINADO: { label: 'Assinado', color: 'bg-green-100 text-green-800' },
  REJEITADO: { label: 'Rejeitado', color: 'bg-red-100 text-red-800' },
}

const CORES = ['#3b82f6', '#8b5cf6', '#f97316', '#ec4899', '#14b8a6']

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function PortalAssinaturasPage() {
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [aba, setAba] = useState<'pendentes' | 'assinados'>('pendentes')

  // Fluxo de criação
  const [etapa, setEtapa] = useState<Etapa | null>(null)
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [signatarios, setSignatarios] = useState<NovoSignatario[]>([
    { tipo: 'eu_mesmo', nome: '', cpf_cnpj: '', email: '', telefone: '', is_orgao_user: true },
  ])
  const [marcas, setMarcas] = useState<MarcaPosicao[]>([])
  const [sigAtivo, setSigAtivo] = useState(0)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Usuários do sistema
  const [usuariosSistema, setUsuariosSistema] = useState<UsuarioSistema[]>([])
  const [buscaUsuario, setBuscaUsuario] = useState<Record<number, string>>({})
  const [usuarioLogado, setUsuarioLogado] = useState<UsuarioSistema | null>(null)

  // Erros de validação (checklist)
  const [errosValidacao, setErrosValidacao] = useState<string[]>([])

  // Pendentes do usuário logado
  const [pendentesUsuario, setPendentesUsuario] = useState<{
    signatario_id: string; documento_id: string; titulo: string; descricao?: string
    arquivo_original_url: string; created_at: string
  }[]>([])
  const [assinandoId, setAssinandoId] = useState<string | null>(null)

  // Modal detalhes
  const [docSelecionado, setDocSelecionado] = useState<Documento | null>(null)

  // ─── Carregar documentos ──────────────────────────────────────────────────

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const [resDoc, resPend] = await Promise.all([
        authFetch(`${API_URL}/api/portal-assinaturas`),
        authFetch(`${API_URL}/api/portal-assinaturas/meus/pendentes`),
      ])
      if (resDoc.ok) setDocumentos(await resDoc.json())
      if (resPend.ok) setPendentesUsuario(await resPend.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // ─── Drag & Drop / Seleção de arquivo ────────────────────────────────────

  const iniciarFluxo = useCallback(async (file: File) => {
    setArquivo(file)
    setPdfUrl(URL.createObjectURL(file))
    setTitulo(file.name.replace(/\.pdf$/i, '').replace(/_/g, ' '))
    setMarcas([])
    setSigAtivo(0)
    setErro('')
    setEtapa('posicionar')
    // Buscar dados do usuário logado SEMPRE do banco de dados
    try {
      const resMe = await authFetch(`${API_URL}/api/usuarios/me`)
      let eu: UsuarioSistema | null = null
      if (resMe.ok) {
        eu = await resMe.json()
        setUsuarioLogado(eu)
        // Buscar outros usuários do mesmo órgão usando orgao_id do banco
        if ((eu as any)?.orgao_id) {
          const resOrgao = await authFetch(`${API_URL}/api/usuarios?orgao_id=${(eu as any).orgao_id}`)
          if (resOrgao.ok) setUsuariosSistema(await resOrgao.json())
        }
      }
      // Pré-preencher signatário inicial com dados reais do banco
      setSignatarios([{
        tipo: 'eu_mesmo',
        nome: eu?.nome || '',
        cpf_cnpj: eu?.cpf || '',
        email: eu?.email || '',
        telefone: '',
        is_orgao_user: true,
        usuario_id: eu?.id,
      }])
    } catch {
      setSignatarios([{ tipo: 'eu_mesmo', nome: '', cpf_cnpj: '', email: '', telefone: '', is_orgao_user: true }])
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file?.type === 'application/pdf') iniciarFluxo(file)
  }, [iniciarFluxo])

  const resetFluxo = useCallback(() => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl)
    setEtapa(null)
    setArquivo(null)
    setPdfUrl(null)
    setTitulo('')
    setDescricao('')
    setSignatarios([{ tipo: 'eu_mesmo', nome: '', cpf_cnpj: '', email: '', telefone: '', is_orgao_user: true }])
    setMarcas([])
    setSigAtivo(0)
    setErro('')
    setBuscaUsuario({})
    if (fileRef.current) fileRef.current.value = ''
  }, [pdfUrl])

  // ─── Posicionamento ───────────────────────────────────────────────────────

  const handleClickPdf = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const pos_x = (e.clientX - rect.left) / rect.width
    const pos_y = (e.clientY - rect.top) / rect.height
    setMarcas(prev => [
      ...prev.filter(m => m.signatarioIdx !== sigAtivo),
      { signatarioIdx: sigAtivo, pos_x, pos_y },
    ])
  }

  // ─── Signatários ──────────────────────────────────────────────────────────

  const addSignatario = () => {
    setSignatarios(prev => [...prev, { tipo: 'externo', nome: '', cpf_cnpj: '', email: '', telefone: '' }])
    setSigAtivo(signatarios.length)
  }

  const setTipoSignatario = (i: number, tipo: TipoSignatario) => {
    setSignatarios(prev => prev.map((s, idx) => {
      if (idx !== i) return s
      if (tipo === 'eu_mesmo') {
        return { ...s, tipo, nome: usuarioLogado?.nome || '', cpf_cnpj: usuarioLogado?.cpf || '', email: usuarioLogado?.email || '', telefone: '', is_orgao_user: true, usuario_id: usuarioLogado?.id }
      }
      if (tipo === 'usuario_sistema') return { ...s, tipo, nome: '', cpf_cnpj: '', email: '', telefone: '', is_orgao_user: true, usuario_id: undefined }
      return { ...s, tipo, nome: '', cpf_cnpj: '', email: '', telefone: '', is_orgao_user: false, usuario_id: undefined }
    }))
    setBuscaUsuario(prev => ({ ...prev, [i]: '' }))
  }

  const selecionarUsuarioSistema = (i: number, u: UsuarioSistema) => {
    setSignatarios(prev => prev.map((s, idx) => idx !== i ? s : {
      ...s, nome: u.nome, cpf_cnpj: u.cpf || '', email: u.email, telefone: '', is_orgao_user: true, usuario_id: u.id
    }))
    setBuscaUsuario(prev => ({ ...prev, [i]: u.nome }))
  }

  const removeSignatario = (i: number) => {
    setSignatarios(prev => prev.filter((_, idx) => idx !== i))
    setMarcas(prev =>
      prev.filter(m => m.signatarioIdx !== i)
        .map(m => m.signatarioIdx > i ? { ...m, signatarioIdx: m.signatarioIdx - 1 } : m)
    )
    setSigAtivo(v => Math.max(0, v > i ? v - 1 : v))
  }

  const updateSignatario = (i: number, field: keyof NovoSignatario, value: string) =>
    setSignatarios(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s))

  // ─── Criar documento ──────────────────────────────────────────────────────

  const handleCriar = async () => {
    setErro('')
    setErrosValidacao([])

    // Checklist de validação local
    const erros: string[] = []
    if (!titulo.trim()) erros.push('Título do documento é obrigatório')
    if (!arquivo) erros.push('Arquivo PDF é obrigatório')

    const sigsValidos = signatarios.filter(s => s.nome.trim())
    if (sigsValidos.length === 0) {
      erros.push('Adicione ao menos um signatário')
    } else {
      sigsValidos.forEach((s, i) => {
        if (!s.nome.trim()) erros.push(`Signatário ${i + 1}: nome obrigatório`)
        if (s.tipo === 'externo' && !s.email && !s.telefone)
          erros.push(`Signatário ${i + 1} (${s.nome}): informe e-mail ou telefone`)
      })
    }

    if (erros.length > 0) {
      setErrosValidacao(erros)
      return
    }

    const sigsComPosicao = sigsValidos.map((sig, i) => {
      const marca = marcas.find(m => m.signatarioIdx === i)
      return {
        nome: sig.nome,
        cpf_cnpj: sig.cpf_cnpj || undefined,
        email: sig.email || undefined,
        telefone: sig.telefone || undefined,
        is_orgao_user: sig.is_orgao_user ?? false,
        pagina_assinatura: marca ? 1 : undefined,
        pos_x: marca?.pos_x,
        pos_y: marca?.pos_y,
      }
    })

    setSalvando(true)
    try {
      const formData = new FormData()
      formData.append('arquivo', arquivo!)
      formData.append('dados', JSON.stringify({ titulo, descricao, signatarios: sigsComPosicao }))
      const res = await authFetch(`${API_URL}/api/portal-assinaturas`, { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json()
        // NestJS retorna message como array em erros de validação
        const msgs: string[] = Array.isArray(err.message)
          ? err.message
          : [err.message || `Erro ${res.status}: não foi possível criar o documento`]
        setErrosValidacao(msgs)
        return
      }
      resetFluxo()
      carregar()
    } catch (e: any) {
      setErrosValidacao([e.message || 'Erro de conexão com o servidor'])
    } finally {
      setSalvando(false)
    }
  }

  // ─── Assinar diretamente (usuário do órgão) ───────────────────────────────

  const handleAssinarDireto = async (documentoId: string, signatarioId: string) => {
    setAssinandoId(signatarioId)
    try {
      const res = await authFetch(
        `${API_URL}/api/portal-assinaturas/${documentoId}/signatarios/${signatarioId}/assinar`,
        { method: 'POST' }
      )
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Erro ao assinar') }
      carregar()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setAssinandoId(null)
    }
  }

  // ─── Filtro ───────────────────────────────────────────────────────────────

  const docsFiltrados = documentos.filter(d =>
    d.titulo.toLowerCase().includes(busca.toLowerCase()),
  )

  // ─── Render ───────────────────────────────────────────────────────────────

  // ── Fluxo de criação (tela cheia) ──────────────────────────────────────────
  if (etapa) {
    return (
      <ModuleGuard modulo={ModuloSistema.PORTAL_ASSINATURAS}>
        <div className="flex flex-col h-full min-h-screen bg-gray-50">
          {/* Barra superior do fluxo */}
          <div className="bg-white border-b px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={resetFluxo} className="text-gray-400 hover:text-gray-700">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h2 className="font-semibold text-gray-800 truncate max-w-xs">{titulo || 'Novo Documento'}</h2>
            </div>
            {/* Steps */}
            <div className="flex items-center gap-1 text-sm">
              {(['posicionar', 'signatarios', 'confirmar'] as Etapa[]).map((e, i) => {
                const labels = ['Posicionar', 'Signatários', 'Confirmar']
                const ativo = etapa === e
                const concluido = ['posicionar', 'signatarios', 'confirmar'].indexOf(etapa) > i
                return (
                  <div key={e} className="flex items-center gap-1">
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${ativo ? 'bg-blue-600 text-white' : concluido ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                      <span>{i + 1}</span>
                      <span className="hidden sm:inline">{labels[i]}</span>
                    </div>
                    {i < 2 && <ChevronRight className="h-3 w-3 text-gray-300" />}
                  </div>
                )
              })}
            </div>
            <button onClick={resetFluxo} className="text-gray-400 hover:text-gray-700">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* ── Etapa 1: Posicionar assinatura ── */}
          {etapa === 'posicionar' && (
            <div className="flex flex-1 overflow-hidden">
              {/* Painel lateral esquerdo */}
              <div className="w-72 bg-white border-r flex flex-col p-4 gap-4 overflow-y-auto">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Signatários</p>
                  <div className="space-y-2">
                    {signatarios.map((sig, i) => {
                      const cor = CORES[i % CORES.length]
                      const marca = marcas.find(m => m.signatarioIdx === i)
                      return (
                        <button
                          key={i}
                          onClick={() => setSigAtivo(i)}
                          className={`w-full text-left p-3 rounded-lg border-2 transition-all ${sigAtivo === i ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: cor }}>
                              {i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{sig.nome || `Signatário ${i + 1}`}</p>
                              <p className="text-xs text-gray-400">{marca ? '✓ Posição marcada' : 'Clique no PDF para marcar'}</p>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  <button onClick={addSignatario} className="mt-2 w-full text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 justify-center py-2 border border-dashed border-blue-300 rounded-lg">
                    <Plus className="h-3 w-3" /> Adicionar signatário
                  </button>
                </div>

                <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
                  <MousePointer className="h-4 w-4 mb-1" />
                  <strong>Como funciona:</strong> Selecione um signatário e clique no PDF para marcar onde a assinatura será inserida.
                </div>

                <Button onClick={() => setEtapa('signatarios')} className="gap-2 mt-auto">
                  Próximo: Dados dos Signatários <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Área do PDF */}
              <div className="flex-1 overflow-auto bg-gray-200 flex items-start justify-center p-6">
                <div
                  className="relative bg-white shadow-xl cursor-crosshair"
                  style={{ width: '100%', maxWidth: 700 }}
                  onClick={handleClickPdf}
                >
                  {pdfUrl && (
                    <iframe
                      src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                      className="w-full pointer-events-none"
                      style={{ height: 900, border: 'none' }}
                      title="PDF"
                    />
                  )}
                  {/* Marcas de posição */}
                  {marcas.map((m, idx) => {
                    const cor = CORES[m.signatarioIdx % CORES.length]
                    return (
                      <div
                        key={idx}
                        className="absolute flex items-center gap-1 pointer-events-none"
                        style={{ left: `${m.pos_x * 100}%`, top: `${m.pos_y * 100}%`, transform: 'translate(-50%, -50%)' }}
                      >
                        <div className="px-2 py-1 rounded text-white text-xs font-bold shadow-lg whitespace-nowrap" style={{ backgroundColor: cor }}>
                          ✍ Sig. {m.signatarioIdx + 1}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Etapa 2: Dados dos signatários ── */}
          {etapa === 'signatarios' && (
            <div className="flex-1 overflow-auto p-6">
              <div className="max-w-2xl mx-auto space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <button onClick={() => setEtapa('posicionar')} className="text-gray-400 hover:text-gray-700">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <h3 className="font-semibold text-gray-800">Signatários</h3>
                </div>

                {/* Título e descrição */}
                <div className="bg-white rounded-xl border p-4 space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Título do documento *</label>
                    <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Contrato de Prestação de Serviços" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Descrição (opcional)</label>
                    <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2} placeholder="Descreva brevemente..." />
                  </div>
                </div>

                {/* Signatários */}
                {signatarios.map((sig, i) => {
                  const cor = CORES[i % CORES.length]
                  const marca = marcas.find(m => m.signatarioIdx === i)
                  const usuariosFiltrados = usuariosSistema.filter(u =>
                    u.nome.toLowerCase().includes((buscaUsuario[i] || '').toLowerCase()) ||
                    u.email.toLowerCase().includes((buscaUsuario[i] || '').toLowerCase())
                  )
                  return (
                    <div key={i} className="bg-white rounded-xl border p-4 space-y-3">
                      {/* Cabeçalho */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: cor }}>{i + 1}</div>
                          <span className="font-medium text-gray-800">Signatário {i + 1}</span>
                          {marca && <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">✓ Posição marcada</span>}
                        </div>
                        {signatarios.length > 1 && (
                          <button onClick={() => removeSignatario(i)} className="text-red-400 hover:text-red-600">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      {/* Seletor de tipo */}
                      <div className="flex gap-2">
                        {([
                          { tipo: 'eu_mesmo' as TipoSignatario, label: 'Eu mesmo', icon: '👤' },
                          { tipo: 'usuario_sistema' as TipoSignatario, label: 'Usuário do sistema', icon: '🏢' },
                          { tipo: 'externo' as TipoSignatario, label: 'Externo', icon: '🌐' },
                        ]).map(opt => (
                          <button
                            key={opt.tipo}
                            onClick={() => setTipoSignatario(i, opt.tipo)}
                            className={`flex-1 py-2 px-2 rounded-lg border text-xs font-medium transition-all ${sig.tipo === opt.tipo ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                          >
                            <span className="block text-base mb-0.5">{opt.icon}</span>
                            {opt.label}
                          </button>
                        ))}
                      </div>

                      {/* Campos por tipo */}
                      {sig.tipo === 'eu_mesmo' && (
                        <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-800 flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 shrink-0" />
                          <div>
                            <p className="font-medium">{sig.nome || 'Você'}</p>
                            <p className="text-xs text-blue-600">{sig.email || 'Você assina diretamente pelo portal'}</p>
                          </div>
                        </div>
                      )}

                      {sig.tipo === 'usuario_sistema' && (
                        <div className="space-y-2">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                              placeholder="Buscar usuário por nome ou e-mail..."
                              value={buscaUsuario[i] || ''}
                              onChange={e => setBuscaUsuario(prev => ({ ...prev, [i]: e.target.value }))}
                              className="pl-9"
                            />
                          </div>
                          {(buscaUsuario[i] || '').length > 0 && (
                            <div className="border rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                              {usuariosFiltrados.length === 0 ? (
                                <p className="text-xs text-gray-400 p-3 text-center">Nenhum usuário encontrado</p>
                              ) : usuariosFiltrados.map(u => (
                                <button
                                  key={u.id}
                                  onClick={() => selecionarUsuarioSistema(i, u)}
                                  className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center gap-2 border-b last:border-0"
                                >
                                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
                                    {u.nome.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-gray-800">{u.nome}</p>
                                    <p className="text-xs text-gray-400">{u.email}{u.cargo ? ` · ${u.cargo}` : ''}</p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                          {sig.nome && (
                            <div className="bg-green-50 rounded-lg p-2 text-sm text-green-800 flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 shrink-0" />
                              <div>
                                <p className="font-medium">{sig.nome}</p>
                                <p className="text-xs text-green-600">{sig.email} · Assina pelo portal</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {sig.tipo === 'externo' && (
                        <div className="grid grid-cols-2 gap-3">
                          <Input placeholder="Nome completo *" value={sig.nome} onChange={e => updateSignatario(i, 'nome', e.target.value)} className="col-span-2" />
                          <Input placeholder="CPF ou CNPJ *" value={sig.cpf_cnpj} onChange={e => updateSignatario(i, 'cpf_cnpj', e.target.value)} />
                          <Input placeholder="Telefone (WhatsApp)" value={sig.telefone} onChange={e => updateSignatario(i, 'telefone', e.target.value)} />
                          <Input placeholder="E-mail *" type="email" value={sig.email} onChange={e => updateSignatario(i, 'email', e.target.value)} className="col-span-2" />
                          <p className="col-span-2 text-xs text-gray-400">Receberá um link por e-mail/WhatsApp para assinar.</p>
                        </div>
                      )}
                    </div>
                  )
                })}

                <button onClick={addSignatario} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 flex items-center justify-center gap-2 transition-colors">
                  <UserPlus className="h-4 w-4" /> Adicionar outro signatário
                </button>

                <div className="flex gap-3 pt-2">
                  <Button variant="outline" onClick={() => setEtapa('posicionar')} className="gap-2">
                    <ChevronLeft className="h-4 w-4" /> Voltar
                  </Button>
                  <Button onClick={() => setEtapa('confirmar')} className="flex-1 gap-2">
                    Revisar e Enviar <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ── Etapa 3: Confirmar e enviar ── */}
          {etapa === 'confirmar' && (
            <div className="flex-1 overflow-auto p-6">
              <div className="max-w-xl mx-auto space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <button onClick={() => setEtapa('signatarios')} className="text-gray-400 hover:text-gray-700">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <h3 className="font-semibold text-gray-800">Confirmar Envio</h3>
                </div>

                <div className="bg-white rounded-xl border p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
                      <FileText className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{titulo}</p>
                      {descricao && <p className="text-sm text-gray-500 mt-0.5">{descricao}</p>}
                      <p className="text-xs text-gray-400 mt-1">{arquivo?.name} · {((arquivo?.size || 0) / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4" /> {signatarios.filter(s => s.nome).length} signatário(s)
                  </p>
                  <div className="space-y-2">
                    {signatarios.filter(s => s.nome).map((sig, i) => {
                      const cor = CORES[i % CORES.length]
                      const marca = marcas.find(m => m.signatarioIdx === i)
                      return (
                        <div key={i} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: cor }}>{i + 1}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800">{sig.nome}</p>
                            <p className="text-xs text-gray-400">{sig.email || sig.telefone}</p>
                          </div>
                          {marca
                            ? <span className="text-xs text-green-600">✓ Posição marcada</span>
                            : <span className="text-xs text-gray-400">Quadro de assinaturas</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {signatarios.some(s => s.tipo !== 'eu_mesmo' && s.tipo !== 'usuario_sistema') && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
                    <ShieldCheck className="h-4 w-4 inline mr-1" />
                    Signatários <strong>externos</strong> receberão um link por <strong>e-mail/WhatsApp</strong> para assinar com validação OTP.
                  </div>
                )}
                {signatarios.some(s => s.tipo === 'eu_mesmo' || s.tipo === 'usuario_sistema') && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
                    <ShieldCheck className="h-4 w-4 inline mr-1" />
                    Usuários <strong>internos</strong> assinarão diretamente pelo portal após o envio.
                  </div>
                )}

                {errosValidacao.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                      <p className="text-sm font-semibold text-red-700">Corrija os itens abaixo antes de enviar:</p>
                    </div>
                    <ul className="space-y-1">
                      {errosValidacao.map((msg, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-red-700">
                          <span className="mt-0.5 shrink-0">✗</span>
                          <span>{msg}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setEtapa('signatarios')} className="gap-2">
                    <ChevronLeft className="h-4 w-4" /> Voltar
                  </Button>
                  <Button onClick={handleCriar} disabled={salvando} className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700">
                    {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {salvando ? 'Enviando...' : 'Enviar para Assinatura'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </ModuleGuard>
    )
  }

  // ── Tela principal ─────────────────────────────────────────────────────────
  return (
    <ModuleGuard modulo={ModuloSistema.PORTAL_ASSINATURAS}>
      <div className="p-6 space-y-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <FilePen className="h-6 w-6 text-blue-600" />
              Assinador Digital
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Envie documentos PDF para assinar com validade jurídica.
            </p>
          </div>
        </div>

        {/* ── Aguardando sua assinatura ── */}
        {pendentesUsuario.length > 0 && (
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="p-0">
              <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-orange-200">
                <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                <span className="font-semibold text-orange-800">Aguardando sua assinatura</span>
                <Badge className="bg-orange-100 text-orange-700 text-xs">{pendentesUsuario.length}</Badge>
              </div>
              <div className="divide-y divide-orange-100">
                {pendentesUsuario.map(p => (
                  <div key={p.signatario_id} className="flex items-center gap-4 px-5 py-4">
                    <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
                      <FileText className="h-5 w-5 text-orange-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{p.titulo}</p>
                      {p.descricao && <p className="text-xs text-gray-500 truncate">{p.descricao}</p>}
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(p.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs"
                        onClick={() => window.open(`${API_URL.replace('/api', '')}/uploads/${p.arquivo_original_url}`, '_blank')}
                      >
                        <Eye className="h-3 w-3" /> Ver PDF
                      </Button>
                      <Button
                        size="sm"
                        className="gap-1 text-xs bg-orange-600 hover:bg-orange-700"
                        disabled={assinandoId === p.signatario_id}
                        onClick={() => handleAssinarDireto(p.documento_id, p.signatario_id)}
                      >
                        {assinandoId === p.signatario_id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <FilePen className="h-3 w-3" />}
                        Assinar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Drop Zone ── */}
        <Card
          className="border-2 border-dashed border-gray-200 hover:border-blue-400 transition-colors cursor-pointer"
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <CardContent className="flex flex-col items-center py-12 text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
              <Upload className="h-8 w-8 text-blue-600" />
            </div>
            <p className="text-lg font-semibold text-gray-800">Arraste e solte seu documento aqui</p>
            <p className="text-sm text-gray-400 mt-1">Ou clique para selecionar do seu computador.</p>
            <p className="text-xs text-gray-300 mt-2 border border-gray-200 rounded-full px-3 py-1">Apenas arquivos PDF até 20MB</p>
            <Button className="mt-5 gap-2" onClick={e => { e.stopPropagation(); fileRef.current?.click() }}>
              <Upload className="h-4 w-4" /> Selecionar Arquivo
            </Button>
          </CardContent>
        </Card>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) iniciarFluxo(f) }}
        />

        {/* ── Documentos Recentes ── */}
        <Card>
          <CardContent className="p-0">
            {/* Cabeçalho com abas */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-gray-500" />
                <span className="font-semibold text-gray-800">Documentos Recentes</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border overflow-hidden">
                  <button
                    onClick={() => setAba('pendentes')}
                    className={`px-3 py-1 text-sm font-medium transition-colors ${aba === 'pendentes' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >
                    Pendentes
                  </button>
                  <button
                    onClick={() => setAba('assinados')}
                    className={`px-3 py-1 text-sm font-medium transition-colors ${aba === 'assinados' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >
                    Assinados
                  </button>
                </div>
                <button onClick={carregar} className="text-gray-400 hover:text-gray-600 p-1">
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Busca */}
            <div className="px-5 py-3 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input placeholder="Buscar por título..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9 h-8 text-sm" />
              </div>
            </div>

            {/* Lista */}
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
              </div>
            ) : (() => {
              const filtrados = docsFiltrados.filter(d =>
                aba === 'pendentes' ? d.status === 'AGUARDANDO_ASSINATURAS' : d.status === 'CONCLUIDO'
              )
              if (filtrados.length === 0) return (
                <div className="flex flex-col items-center py-12 text-center text-gray-400">
                  <FileText className="h-10 w-10 mb-3 text-gray-200" />
                  <p className="text-sm">Nenhum documento {aba === 'pendentes' ? 'pendente' : 'assinado'}</p>
                </div>
              )
              return (
                <div className="divide-y">
                  {filtrados.slice(0, 5).map(doc => {
                    const assinados = doc.signatarios.filter(s => s.status === 'ASSINADO').length
                    const total = doc.signatarios.length
                    return (
                      <div key={doc.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                        <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
                          <FileText className="h-5 w-5 text-red-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">{doc.titulo}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Enviado em {new Date(doc.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} · {((0) / 1024).toFixed(0)} KB
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <Badge className={`${STATUS_LABEL[doc.status]?.color} text-xs`}>
                            {assinados}/{total} assinatura{total !== 1 ? 's' : ''}
                          </Badge>
                          {doc.status === 'CONCLUIDO' && doc.arquivo_assinado_url ? (
                            <Button
                              size="sm"
                              className="gap-1 bg-green-600 hover:bg-green-700 text-xs"
                              onClick={() => window.open(`${API_URL.replace('/api', '')}/uploads/${doc.arquivo_assinado_url}`, '_blank')}
                            >
                              <Download className="h-3 w-3" /> Baixar
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setDocSelecionado(doc)}>
                              <Eye className="h-3 w-3" /> Detalhes
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            {/* Ver histórico */}
            <div className="border-t px-5 py-3 text-center">
              <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                Ver histórico completo de documentos →
              </button>
            </div>
          </CardContent>
        </Card>

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
                    {docSelecionado.signatarios.map((sig, i) => {
                      const st = STATUS_LABEL[sig.status]
                      const cor = CORES[i % CORES.length]
                      return (
                        <div key={sig.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: cor }}>{i + 1}</div>
                            <div>
                              <p className="text-sm font-medium text-gray-800">{sig.nome}</p>
                              <p className="text-xs text-gray-400">{sig.email || sig.telefone}</p>
                              {sig.data_assinatura && (
                                <p className="text-xs text-green-600 mt-0.5">
                                  Assinado em {new Date(sig.data_assinatura).toLocaleString('pt-BR')}
                                </p>
                              )}
                            </div>
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

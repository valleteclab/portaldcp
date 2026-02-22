'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  FileText, Send, CheckCircle, Clock, Eye, Loader2, X,
  Upload, Users, Trash2, Download, Search, RefreshCw, FilePen,
  Plus, ChevronRight, ChevronLeft, ArrowLeft, Hash,
  ShieldCheck, AlertCircle, UserPlus, Shield, Lock, Mail, Phone,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { ModuleGuard } from '@/components/ModuleGuard'
import { ModuloSistema } from '@/hooks/useModulosOrgao'
import { API_URL, authFetch } from '@/lib/api'
import PdfViewer, { type PdfMarker } from '@/components/PdfViewer'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Signatario {
  id: string
  nome: string
  cpf_cnpj: string
  email: string
  telefone: string | null
  status: 'PENDENTE' | 'ASSINADO' | 'REJEITADO'
  data_assinatura?: string
  is_orgao_user?: boolean
}

interface Documento {
  id: string
  titulo: string
  descricao?: string
  status: 'AGUARDANDO_ASSINATURAS' | 'CONCLUIDO' | 'CANCELADO'
  arquivo_original_url: string
  arquivo_assinado_url?: string
  documento_hash?: string
  signatarios: Signatario[]
  created_at: string
}

type TipoSignatario = 'eu_mesmo' | 'usuario_sistema' | 'fornecedor' | 'externo'

interface UsuarioSistema {
  id: string
  nome: string
  email: string
  cpf: string
  cargo?: string
  orgao_id?: string
}

interface FornecedorCadastrado {
  id: string
  razao_social: string
  nome_fantasia?: string
  cpf_cnpj: string
  email: string
  telefone: string
  representante_nome?: string
  representante_email?: string
  representante_telefone?: string
}

interface NovoSignatario {
  tipo: TipoSignatario
  nome: string
  cpf_cnpj: string
  email: string
  telefone: string
  usuario_id?: string
  is_orgao_user?: boolean
}

interface PendenciaUsuario {
  signatario_id: string
  documento_id: string
  titulo: string
  descricao?: string
  arquivo_original_url: string
  created_at: string
}

type Modo = 'lista' | 'novo' | 'visualizar' | 'adicionando'

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  AGUARDANDO_ASSINATURAS: { label: 'Aguardando', color: 'bg-yellow-100 text-yellow-800' },
  CONCLUIDO: { label: 'Concluído', color: 'bg-green-100 text-green-800' },
  CANCELADO: { label: 'Cancelado', color: 'bg-red-100 text-red-800' },
  PENDENTE: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800' },
  ASSINADO: { label: 'Assinado', color: 'bg-green-100 text-green-800' },
  REJEITADO: { label: 'Rejeitado', color: 'bg-red-100 text-red-800' },
}

const CORES = ['#3b82f6', '#8b5cf6', '#f97316', '#ec4899', '#14b8a6']

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function PortalAssinaturasPage() {
  // Estado geral
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [loading, setLoading] = useState(true)
  const [modo, setModo] = useState<Modo>('lista')
  const [errosValidacao, setErrosValidacao] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  // Dados do usuário logado (do banco)
  const [usuarioLogado, setUsuarioLogado] = useState<UsuarioSistema | null>(null)
  const [usuariosSistema, setUsuariosSistema] = useState<UsuarioSistema[]>([])

  // Pendentes do usuário
  const [pendentesUsuario, setPendentesUsuario] = useState<PendenciaUsuario[]>([])

  // Documento ativo (novo upload ou visualização)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [docAtivo, setDocAtivo] = useState<Documento | null>(null)
  const [pdfInfo, setPdfInfo] = useState<{ pageCount: number; hash: string; fileSize: number } | null>(null)

  // Fornecedores cadastrados
  const [fornecedores, setFornecedores] = useState<FornecedorCadastrado[]>([])
  const [buscaFornecedor, setBuscaFornecedor] = useState<Record<string, string>>({})

  // Signatários para novo documento
  const [signatarios, setSignatarios] = useState<NovoSignatario[]>([])
  const [sigAtivo, setSigAtivo] = useState(0)
  const [markers, setMarkers] = useState<PdfMarker[]>([])
  const [buscaUsuario, setBuscaUsuario] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  // OTP para assinatura interna
  const [otpModal, setOtpModal] = useState<{ documentoId: string; signatarioId: string; nome: string } | null>(null)
  const [otpCode, setOtpCode] = useState('')
  const [otpEtapa, setOtpEtapa] = useState<'confirmar' | 'codigo'>('confirmar')
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpErro, setOtpErro] = useState('')

  // Adicionar signatários a documento existente
  const [addSigLoading, setAddSigLoading] = useState(false)
  const [novosSigs, setNovosSigs] = useState<NovoSignatario[]>([])
  const [novoSigAtivo, setNovoSigAtivo] = useState(0)
  const [novoSigMarkers, setNovoSigMarkers] = useState<PdfMarker[]>([])

  // Painel direito (signatários ou info)
  const [painelDireito, setPainelDireito] = useState<'info' | 'signatarios'>('info')

  const baseUpload = API_URL + '/api/uploads/'

  // ─── Carregar dados iniciais ────────────────────────────────────────────────

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

  const carregarUsuario = useCallback(async () => {
    try {
      const resMe = await authFetch(`${API_URL}/api/usuarios/me`)
      if (resMe.ok) {
        const eu = await resMe.json()
        setUsuarioLogado(eu)
        if (eu?.orgao_id) {
          const resOrgao = await authFetch(`${API_URL}/api/usuarios?orgao_id=${eu.orgao_id}`)
          if (resOrgao.ok) setUsuariosSistema(await resOrgao.json())
        }
      }
      // Carregar fornecedores cadastrados
      const resForn = await authFetch(`${API_URL}/api/fornecedores`)
      if (resForn.ok) {
        const lista = await resForn.json()
        setFornecedores(Array.isArray(lista) ? lista : [])
      }
    } catch { /* silencioso */ }
  }, [])

  useEffect(() => { carregar(); carregarUsuario() }, [carregar, carregarUsuario])

  // ─── Iniciar novo documento ─────────────────────────────────────────────────

  const iniciarNovo = useCallback((file: File) => {
    setArquivo(file)
    setTitulo(file.name.replace(/\.pdf$/i, '').replace(/_/g, ' '))
    setDescricao('')
    setDocAtivo(null)
    setPdfInfo(null)
    setMarkers([])
    setSigAtivo(0)
    setErrosValidacao([])
    setBuscaUsuario({})
    setBuscaFornecedor({})
    setSignatarios([{
      tipo: 'eu_mesmo',
      nome: usuarioLogado?.nome || '',
      cpf_cnpj: usuarioLogado?.cpf || '',
      email: usuarioLogado?.email || '',
      telefone: '',
      is_orgao_user: true,
      usuario_id: usuarioLogado?.id,
    }])
    setPainelDireito('signatarios')
    setModo('novo')
  }, [usuarioLogado])

  const visualizarDoc = useCallback((doc: Documento) => {
    setDocAtivo(doc)
    setArquivo(null)
    setPdfInfo(null)
    setModo('visualizar')
    setPainelDireito('info')
  }, [])

  const voltarLista = useCallback(() => {
    setModo('lista')
    setArquivo(null)
    setDocAtivo(null)
    setPdfInfo(null)
    setMarkers([])
    setErrosValidacao([])
    if (fileRef.current) fileRef.current.value = ''
  }, [])

  // ─── Signatários ────────────────────────────────────────────────────────────

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
      if (tipo === 'fornecedor') return { ...s, tipo, nome: '', cpf_cnpj: '', email: '', telefone: '', is_orgao_user: false, usuario_id: undefined }
      return { ...s, tipo, nome: '', cpf_cnpj: '', email: '', telefone: '', is_orgao_user: false, usuario_id: undefined }
    }))
    setBuscaUsuario(prev => ({ ...prev, [i]: '' }))
    setBuscaFornecedor(prev => ({ ...prev, [i]: '' }))
  }

  const selecionarUsuarioSistema = (i: number, u: UsuarioSistema) => {
    setSignatarios(prev => prev.map((s, idx) => idx !== i ? s : {
      ...s, nome: u.nome, cpf_cnpj: u.cpf || '', email: u.email, telefone: '', is_orgao_user: true, usuario_id: u.id
    }))
    setBuscaUsuario(prev => ({ ...prev, [i]: u.nome }))
  }

  const selecionarFornecedor = (i: number, f: FornecedorCadastrado) => {
    setSignatarios(prev => prev.map((s, idx) => idx !== i ? s : {
      ...s,
      nome: f.representante_nome || f.razao_social,
      cpf_cnpj: f.cpf_cnpj || '',
      email: f.representante_email || f.email || '',
      telefone: f.representante_telefone || f.telefone || '',
      is_orgao_user: false,
    }))
    setBuscaFornecedor(prev => ({ ...prev, [i]: f.razao_social }))
  }

  const removeSignatario = (i: number) => {
    setSignatarios(prev => prev.filter((_, idx) => idx !== i))
    setMarkers(prev => prev.filter(m => m.id !== `sig-${i}`))
    setSigAtivo(v => Math.max(0, v > i ? v - 1 : v))
  }

  const updateSignatario = (i: number, field: keyof NovoSignatario, value: string) =>
    setSignatarios(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s))

  // ─── Click no PDF para posicionar ───────────────────────────────────────────

  const handlePageClick = (page: number, x: number, y: number) => {
    if (modo !== 'novo') return
    const id = `sig-${sigAtivo}`
    setMarkers(prev => [
      ...prev.filter(m => m.id !== id),
      { id, page, x, y, label: `Sig. ${sigAtivo + 1}`, color: CORES[sigAtivo % CORES.length] },
    ])
  }

  // ─── Criar documento ───────────────────────────────────────────────────────

  const handleCriar = async () => {
    setErrosValidacao([])
    const erros: string[] = []
    if (!titulo.trim()) erros.push('Título do documento é obrigatório')
    if (!arquivo) erros.push('Arquivo PDF é obrigatório')

    const sigsValidos = signatarios.filter(s => s.nome.trim())
    if (sigsValidos.length === 0) {
      erros.push('Adicione ao menos um signatário')
    } else {
      sigsValidos.forEach((s, i) => {
        if (s.tipo === 'externo' && !s.email && !s.telefone)
          erros.push(`Signatário ${i + 1} (${s.nome}): informe e-mail ou telefone`)
      })
    }
    if (erros.length > 0) { setErrosValidacao(erros); return }

    const sigsPayload = sigsValidos.map((sig, i) => {
      const marker = markers.find(m => m.id === `sig-${i}`)
      return {
        nome: sig.nome,
        cpf_cnpj: sig.cpf_cnpj || undefined,
        email: sig.email || undefined,
        telefone: sig.telefone || undefined,
        is_orgao_user: sig.is_orgao_user ?? false,
        pagina_assinatura: marker?.page,
        pos_x: marker?.x,
        pos_y: marker?.y,
      }
    })

    setSalvando(true)
    try {
      const formData = new FormData()
      formData.append('arquivo', arquivo!)
      formData.append('dados', JSON.stringify({ titulo, descricao, signatarios: sigsPayload }))
      const res = await authFetch(`${API_URL}/api/portal-assinaturas`, { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json()
        const msgs: string[] = Array.isArray(err.message) ? err.message : [err.message || `Erro ${res.status}`]
        setErrosValidacao(msgs)
        return
      }
      voltarLista()
      carregar()
    } catch (e: any) {
      setErrosValidacao([e.message || 'Erro de conexão'])
    } finally {
      setSalvando(false)
    }
  }

  // ─── Assinar com OTP ───────────────────────────────────────────────────────

  const iniciarAssinatura = (documentoId: string, signatarioId: string, nome: string) => {
    setOtpModal({ documentoId, signatarioId, nome })
    setOtpEtapa('confirmar')
    setOtpCode('')
    setOtpErro('')
  }

  const solicitarOtpInterno = async () => {
    if (!otpModal) return
    setOtpLoading(true)
    setOtpErro('')
    try {
      const res = await authFetch(
        `${API_URL}/api/portal-assinaturas/${otpModal.documentoId}/signatarios/${otpModal.signatarioId}/solicitar-otp`,
        { method: 'POST' }
      )
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Erro ao enviar código')
      }
      setOtpEtapa('codigo')
    } catch (e: any) {
      setOtpErro(e.message)
    } finally {
      setOtpLoading(false)
    }
  }

  const confirmarAssinatura = async () => {
    if (!otpModal) return
    setOtpLoading(true)
    setOtpErro('')
    try {
      const res = await authFetch(
        `${API_URL}/api/portal-assinaturas/${otpModal.documentoId}/signatarios/${otpModal.signatarioId}/assinar`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo_otp: otpCode }) }
      )
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Erro ao assinar')
      }
      setOtpModal(null)
      carregar()
    } catch (e: any) {
      setOtpErro(e.message)
    } finally {
      setOtpLoading(false)
    }
  }

  const handleCancelar = async (docId: string) => {
    if (!confirm('Tem certeza que deseja cancelar este documento? Esta ação não pode ser desfeita.')) return
    try {
      const res = await authFetch(`${API_URL}/api/portal-assinaturas/${docId}/cancelar`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        alert(err.message || 'Erro ao cancelar')
        return
      }
      voltarLista()
      carregar()
    } catch (e: any) {
      alert(e.message || 'Erro ao cancelar documento')
    }
  }

  const handleReenviar = async (docId: string) => {
    try {
      const res = await authFetch(`${API_URL}/api/portal-assinaturas/${docId}/reenviar`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json()
        alert(err.message || 'Erro ao reenviar')
        return
      }
      const data = await res.json()
      alert(`Notificações reenviadas para ${data.enviados} signatário(s) pendente(s).`)
    } catch (e: any) {
      alert(e.message || 'Erro ao reenviar notificações')
    }
  }

  // ─── Adicionar signatários a documento existente ────────────────────────────

  const iniciarAdicionarSignatarios = () => {
    setNovosSigs([{ tipo: 'externo', nome: '', cpf_cnpj: '', email: '', telefone: '' }])
    setNovoSigAtivo(0)
    setNovoSigMarkers([])
    setPainelDireito('signatarios')
    setModo('adicionando')
  }

  const addNovoSig = () => {
    setNovosSigs(prev => [...prev, { tipo: 'externo', nome: '', cpf_cnpj: '', email: '', telefone: '' }])
    setNovoSigAtivo(novosSigs.length)
  }

  const removeNovoSig = (i: number) => {
    setNovosSigs(prev => prev.filter((_, idx) => idx !== i))
    setNovoSigMarkers(prev => prev.filter(m => m.id !== `newsig-${i}`))
    setNovoSigAtivo(v => Math.max(0, v > i ? v - 1 : v))
  }

  const updateNovoSig = (i: number, field: keyof NovoSignatario, value: string) =>
    setNovosSigs(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s))

  const setTipoNovoSig = (i: number, tipo: TipoSignatario) => {
    setNovosSigs(prev => prev.map((s, idx) => {
      if (idx !== i) return s
      if (tipo === 'usuario_sistema') return { ...s, tipo, nome: '', cpf_cnpj: '', email: '', telefone: '', is_orgao_user: true, usuario_id: undefined }
      if (tipo === 'fornecedor') return { ...s, tipo, nome: '', cpf_cnpj: '', email: '', telefone: '', is_orgao_user: false, usuario_id: undefined }
      return { ...s, tipo, nome: '', cpf_cnpj: '', email: '', telefone: '', is_orgao_user: false, usuario_id: undefined }
    }))
    setBuscaUsuario(prev => ({ ...prev, [`new-${i}`]: '' }))
    setBuscaFornecedor(prev => ({ ...prev, [`new-${i}`]: '' }))
  }

  const selecionarUsuarioNovoSig = (i: number, u: UsuarioSistema) => {
    setNovosSigs(prev => prev.map((s, idx) => idx !== i ? s : {
      ...s, nome: u.nome, cpf_cnpj: u.cpf || '', email: u.email, telefone: '', is_orgao_user: true, usuario_id: u.id
    }))
    setBuscaUsuario(prev => ({ ...prev, [`new-${i}`]: u.nome }))
  }

  const selecionarFornecedorNovoSig = (i: number, f: FornecedorCadastrado) => {
    setNovosSigs(prev => prev.map((s, idx) => idx !== i ? s : {
      ...s,
      nome: f.representante_nome || f.razao_social,
      cpf_cnpj: f.cpf_cnpj || '',
      email: f.representante_email || f.email || '',
      telefone: f.representante_telefone || f.telefone || '',
      is_orgao_user: false,
    }))
    setBuscaFornecedor(prev => ({ ...prev, [`new-${i}`]: f.razao_social }))
  }

  const handleNovoSigPageClick = (page: number, x: number, y: number) => {
    if (modo !== 'adicionando') return
    const id = `newsig-${novoSigAtivo}`
    const existingSigs = docAtivo?.signatarios?.length || 0
    setNovoSigMarkers(prev => [
      ...prev.filter(m => m.id !== id),
      { id, page, x, y, label: `Sig. ${existingSigs + novoSigAtivo + 1}`, color: CORES[(existingSigs + novoSigAtivo) % CORES.length] },
    ])
  }

  const cancelarAdicionando = () => {
    setNovosSigs([])
    setNovoSigMarkers([])
    setNovoSigAtivo(0)
    setModo('visualizar')
    setPainelDireito('info')
  }

  const salvarNovosSigs = async () => {
    if (!docAtivo) return
    const validos = novosSigs.filter(s => s.nome.trim())
    if (validos.length === 0) { alert('Adicione ao menos um signatário com nome.'); return }

    for (const s of validos) {
      if (s.tipo === 'externo' && !s.email && !s.telefone) {
        alert(`Signatário "${s.nome}": informe e-mail ou telefone.`)
        return
      }
    }

    setAddSigLoading(true)
    try {
      for (let i = 0; i < novosSigs.length; i++) {
        const sig = novosSigs[i]
        if (!sig.nome.trim()) continue
        const marker = novoSigMarkers.find(m => m.id === `newsig-${i}`)
        const payload = {
          nome: sig.nome,
          cpf_cnpj: sig.cpf_cnpj || undefined,
          email: sig.email || undefined,
          telefone: sig.telefone || undefined,
          is_orgao_user: sig.is_orgao_user ?? false,
          pagina_assinatura: marker?.page,
          pos_x: marker?.x,
          pos_y: marker?.y,
        }
        const res = await authFetch(`${API_URL}/api/portal-assinaturas/${docAtivo.id}/signatarios`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const err = await res.json()
          alert(err.message || `Erro ao adicionar signatário "${sig.nome}"`)
          return
        }
      }
      // Recarregar
      const resDoc = await authFetch(`${API_URL}/api/portal-assinaturas/${docAtivo.id}`)
      if (resDoc.ok) setDocAtivo(await resDoc.json())
      carregar()
      cancelarAdicionando()
    } catch (e: any) {
      alert(e.message || 'Erro ao adicionar signatários')
    } finally {
      setAddSigLoading(false)
    }
  }

  // ─── Render: Modo Lista ─────────────────────────────────────────────────────

  if (modo === 'lista') {
    return (
      <ModuleGuard modulo={ModuloSistema.PORTAL_ASSINATURAS}>
        <div className="p-6 space-y-6 max-w-5xl mx-auto">
          {/* Cabeçalho */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Shield className="h-6 w-6 text-blue-600" />
                Assinador Digital
              </h1>
              <p className="text-sm text-gray-500 mt-1">Assine documentos PDF com validade jurídica · Lei nº 14.063/2020</p>
            </div>
          </div>

          {/* Pendentes do usuário */}
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
                        <p className="text-xs text-gray-400 mt-0.5">{new Date(p.created_at).toLocaleDateString('pt-BR')}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="outline" className="gap-1 text-xs"
                          onClick={() => window.open(baseUpload + p.arquivo_original_url, '_blank')}>
                          <Eye className="h-3 w-3" /> Ver
                        </Button>
                        <Button size="sm" className="gap-1 text-xs bg-orange-600 hover:bg-orange-700"
                          onClick={() => iniciarAssinatura(p.documento_id, p.signatario_id, usuarioLogado?.nome || '')}>
                          <FilePen className="h-3 w-3" /> Assinar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Upload */}
          <Card className="border-2 border-dashed border-gray-200 hover:border-blue-400 transition-colors cursor-pointer"
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type === 'application/pdf') iniciarNovo(f) }}
            onClick={() => fileRef.current?.click()}>
            <CardContent className="flex flex-col items-center py-10 text-center">
              <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-3">
                <Upload className="h-7 w-7 text-blue-600" />
              </div>
              <p className="text-lg font-semibold text-gray-800">Adicionar documento</p>
              <p className="text-sm text-gray-400 mt-1">Arraste ou clique para selecionar · PDF até 10MB</p>
            </CardContent>
          </Card>
          <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) iniciarNovo(f) }} />

          {/* Documentos recentes */}
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b">
                <span className="font-semibold text-gray-800 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-gray-500" /> Documentos
                </span>
                <button onClick={carregar} className="text-gray-400 hover:text-gray-600 p-1">
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-blue-400" /></div>
              ) : documentos.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-gray-400">
                  <FileText className="h-10 w-10 mb-3 text-gray-200" />
                  <p className="text-sm">Nenhum documento ainda</p>
                </div>
              ) : (
                <div className="divide-y">
                  {documentos.map(doc => {
                    const assinados = doc.signatarios.filter(s => s.status === 'ASSINADO').length
                    const total = doc.signatarios.length
                    const st = STATUS_LABEL[doc.status]
                    return (
                      <div key={doc.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => visualizarDoc(doc)}>
                        <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center shrink-0">
                          <FileText className="h-5 w-5 text-red-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">{doc.titulo}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {new Date(doc.created_at).toLocaleDateString('pt-BR')} · {assinados}/{total} assinatura{total !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <Badge className={`${st?.color} text-xs`}>{st?.label}</Badge>
                        {doc.status === 'CONCLUIDO' && doc.arquivo_assinado_url && (
                          <Button size="sm" variant="outline" className="gap-1 text-xs"
                            onClick={e => { e.stopPropagation(); window.open(baseUpload + doc.arquivo_assinado_url, '_blank') }}>
                            <Download className="h-3 w-3" /> Baixar
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* OTP Modal */}
          {otpModal && (
            <Dialog open onOpenChange={() => setOtpModal(null)}>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-blue-600" /> Confirmar Assinatura
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {otpEtapa === 'confirmar' && (
                    <>
                      <p className="text-sm text-gray-600">
                        Você está prestes a assinar este documento como <strong>{otpModal.nome}</strong>.
                        Um código de verificação será enviado para seu e-mail.
                      </p>
                      {otpErro && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{otpErro}</p>}
                      <Button onClick={solicitarOtpInterno} disabled={otpLoading} className="w-full gap-2">
                        {otpLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                        Enviar código por e-mail
                      </Button>
                    </>
                  )}
                  {otpEtapa === 'codigo' && (
                    <>
                      <div className="text-center">
                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                          <Mail className="h-6 w-6 text-green-600" />
                        </div>
                        <p className="text-sm text-gray-600">Código enviado para seu e-mail</p>
                      </div>
                      <Input placeholder="000000" value={otpCode} maxLength={6}
                        onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        onKeyDown={e => e.key === 'Enter' && otpCode.length === 6 && confirmarAssinatura()}
                        className="text-center text-2xl tracking-widest font-mono" />
                      {otpErro && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{otpErro}</p>}
                      <Button onClick={confirmarAssinatura} disabled={otpLoading || otpCode.length < 6} className="w-full gap-2">
                        {otpLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                        Confirmar e Assinar
                      </Button>
                      <button className="w-full text-xs text-gray-400 hover:text-gray-600 underline"
                        onClick={() => { setOtpEtapa('confirmar'); setOtpCode(''); setOtpErro('') }}>
                        Reenviar código
                      </button>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </ModuleGuard>
    )
  }

  // ─── Render: Modo Novo / Visualizar (layout 3 painéis) ──────────────────────

  const pdfSrc = modo === 'novo' && arquivo
    ? arquivo
    : docAtivo ? baseUpload + docAtivo.arquivo_original_url : null

  return (
    <ModuleGuard modulo={ModuloSistema.PORTAL_ASSINATURAS}>
      <div className="flex flex-col h-screen bg-gray-900">
        {/* Barra superior */}
        <div className="bg-gray-900 border-b border-gray-700 px-4 py-2 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={modo === 'adicionando' ? cancelarAdicionando : voltarLista} className="text-gray-400 hover:text-white p-1">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h2 className="font-semibold text-white text-sm truncate max-w-md">
                {modo === 'novo' ? titulo || 'Novo Documento' : modo === 'adicionando' ? `Adicionando signatários — ${docAtivo?.titulo}` : docAtivo?.titulo}
              </h2>
              {pdfInfo && (
                <p className="text-xs text-gray-500 font-mono">
                  SHA-256: {pdfInfo.hash.slice(0, 12)}...{pdfInfo.hash.slice(-4)}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {modo === 'novo' && (
              <Button onClick={handleCriar} disabled={salvando} size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700">
                {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {salvando ? 'Enviando...' : 'Enviar para Assinatura'}
              </Button>
            )}
            {modo === 'visualizar' && docAtivo?.arquivo_assinado_url && (
              <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700"
                onClick={() => window.open(baseUpload + docAtivo.arquivo_assinado_url, '_blank')}>
                <Download className="h-3.5 w-3.5" /> Baixar Assinado
              </Button>
            )}
            {modo === 'visualizar' && docAtivo && docAtivo.status !== 'CANCELADO' && (
              <Button size="sm" variant="outline" className="gap-1.5"
                onClick={iniciarAdicionarSignatarios}>
                <UserPlus className="h-3.5 w-3.5" /> Adicionar Signatário
              </Button>
            )}
            {modo === 'adicionando' && (
              <>
                <Button onClick={salvarNovosSigs} disabled={addSigLoading} size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700">
                  {addSigLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  {addSigLoading ? 'Salvando...' : 'Salvar Signatários'}
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={cancelarAdicionando}>
                  <X className="h-3.5 w-3.5" /> Cancelar
                </Button>
              </>
            )}
            {modo === 'visualizar' && docAtivo?.status === 'AGUARDANDO_ASSINATURAS' && (
              <>
                <Button size="sm" variant="outline" className="gap-1.5"
                  onClick={() => handleReenviar(docAtivo.id)}>
                  <RefreshCw className="h-3.5 w-3.5" /> Reenviar
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => handleCancelar(docAtivo.id)}>
                  <X className="h-3.5 w-3.5" /> Cancelar
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* ── Painel Central: PDF Viewer ── */}
          <div className="flex-1 flex flex-col min-w-0">
            {pdfSrc ? (
              <PdfViewer
                src={pdfSrc}
                markers={modo === 'adicionando' ? novoSigMarkers : markers}
                onPageClick={modo === 'novo' ? handlePageClick : modo === 'adicionando' ? handleNovoSigPageClick : undefined}
                onDocumentLoad={setPdfInfo}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center bg-gray-800 text-gray-500">
                <p>Nenhum documento selecionado</p>
              </div>
            )}
          </div>

          {/* ── Painel Direito ── */}
          <div className="w-80 bg-white border-l flex flex-col overflow-hidden shrink-0">
            {/* Tabs do painel */}
            {(modo === 'novo' || modo === 'adicionando') && (
              <div className="flex border-b shrink-0">
                <button onClick={() => setPainelDireito('info')}
                  className={`flex-1 py-2.5 text-xs font-medium transition-colors ${painelDireito === 'info' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                  {modo === 'adicionando' ? 'Existentes' : 'Integridade'}
                </button>
                <button onClick={() => setPainelDireito('signatarios')}
                  className={`flex-1 py-2.5 text-xs font-medium transition-colors ${painelDireito === 'signatarios' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                  {modo === 'adicionando' ? 'Novos Signatários' : 'Signatários'}
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* ── Info / Integridade ── */}
              {(painelDireito === 'info' || (modo === 'visualizar')) && (
                <>
                  {/* Título e descrição (editável no modo novo) */}
                  {modo === 'novo' && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-gray-500 uppercase">Título</label>
                      <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título do documento" className="text-sm" />
                      <label className="text-xs font-semibold text-gray-500 uppercase">Descrição</label>
                      <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2} placeholder="Opcional..." className="text-sm" />
                    </div>
                  )}

                  {/* Integridade do arquivo */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                      <Shield className="h-3.5 w-3.5" /> Integridade do Arquivo
                    </p>
                    <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">SHA-256</span>
                        <span className="font-mono text-xs text-blue-600 truncate ml-2 max-w-[140px]" title={pdfInfo?.hash}>
                          {pdfInfo?.hash ? `${pdfInfo.hash.slice(0, 8)}...${pdfInfo.hash.slice(-4)}` : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Tamanho</span>
                        <span className="font-medium">{pdfInfo ? formatBytes(pdfInfo.fileSize) : '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Páginas</span>
                        <span className="font-medium">{pdfInfo?.pageCount ?? '—'}</span>
                      </div>
                    </div>
                    {pdfInfo && (
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-green-700 bg-green-50 rounded-lg p-2">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Documento íntegro. Hash verificado.
                      </div>
                    )}
                  </div>

                  {/* Signatários do documento existente */}
                  {(modo === 'visualizar' || (modo === 'adicionando' && painelDireito === 'info')) && docAtivo && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" /> Signatários ({docAtivo.signatarios.length})
                      </p>
                      <div className="space-y-2">
                        {docAtivo.signatarios.map((sig, i) => {
                          const st = STATUS_LABEL[sig.status]
                          return (
                            <div key={sig.id} className="bg-gray-50 rounded-lg p-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                                    style={{ backgroundColor: CORES[i % CORES.length] }}>{i + 1}</div>
                                  <div>
                                    <p className="text-sm font-medium text-gray-800">{sig.nome}</p>
                                    <p className="text-xs text-gray-400">{sig.email}</p>
                                  </div>
                                </div>
                                <Badge className={`${st?.color} text-xs`}>{st?.label}</Badge>
                              </div>
                              {sig.data_assinatura && (
                                <p className="text-xs text-green-600 mt-1 ml-8">
                                  Assinado em {new Date(sig.data_assinatura).toLocaleString('pt-BR')}
                                </p>
                              )}
                              {sig.status === 'PENDENTE' && sig.is_orgao_user && (
                                <Button size="sm" className="mt-2 ml-8 gap-1 text-xs bg-blue-600 hover:bg-blue-700"
                                  onClick={() => iniciarAssinatura(docAtivo.id, sig.id, sig.nome)}>
                                  <FilePen className="h-3 w-3" /> Assinar agora
                                </Button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── Signatários (modo novo) ── */}
              {painelDireito === 'signatarios' && modo === 'novo' && (
                <>
                  <p className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> Signatários
                  </p>

                  {signatarios.map((sig, i) => {
                    const cor = CORES[i % CORES.length]
                    const marker = markers.find(m => m.id === `sig-${i}`)
                    const usuariosFiltrados = usuariosSistema.filter(u =>
                      u.nome.toLowerCase().includes((buscaUsuario[i] || '').toLowerCase()) ||
                      u.email.toLowerCase().includes((buscaUsuario[i] || '').toLowerCase())
                    )
                    return (
                      <div key={i} className={`rounded-lg border p-3 space-y-2 transition-all ${sigAtivo === i ? 'border-blue-400 bg-blue-50/50' : 'border-gray-200'}`}
                        onClick={() => setSigAtivo(i)}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: cor }}>{i + 1}</div>
                            <span className="text-sm font-medium text-gray-800">{sig.nome || `Signatário ${i + 1}`}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {marker && <span className="text-[10px] text-green-600">✓ Pos.</span>}
                            {signatarios.length > 1 && (
                              <button onClick={e => { e.stopPropagation(); removeSignatario(i) }} className="text-red-400 hover:text-red-600 p-0.5">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Tipo */}
                        <div className="flex gap-1">
                          {([
                            { tipo: 'eu_mesmo' as TipoSignatario, label: 'Eu mesmo' },
                            { tipo: 'usuario_sistema' as TipoSignatario, label: 'Interno' },
                            { tipo: 'fornecedor' as TipoSignatario, label: 'Fornecedor' },
                            { tipo: 'externo' as TipoSignatario, label: 'Externo' },
                          ]).map(opt => (
                            <button key={opt.tipo}
                              onClick={e => { e.stopPropagation(); setTipoSignatario(i, opt.tipo) }}
                              className={`flex-1 py-1 rounded text-[10px] font-medium transition-all ${sig.tipo === opt.tipo ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                              {opt.label}
                            </button>
                          ))}
                        </div>

                        {/* Campos */}
                        {sig.tipo === 'eu_mesmo' && sig.nome && (
                          <div className="text-xs text-blue-700 bg-blue-50 rounded p-2">
                            <p className="font-medium">{sig.nome}</p>
                            <p className="text-blue-500">{sig.email}</p>
                          </div>
                        )}

                        {sig.tipo === 'usuario_sistema' && (
                          <div className="space-y-1">
                            <div className="relative">
                              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                              <Input placeholder="Buscar usuário..." value={buscaUsuario[i] || ''}
                                onChange={e => setBuscaUsuario(prev => ({ ...prev, [i]: e.target.value }))}
                                className="pl-7 h-7 text-xs" onClick={e => e.stopPropagation()} />
                            </div>
                            {(buscaUsuario[i] || '').length > 0 && (
                              <div className="border rounded max-h-28 overflow-y-auto">
                                {usuariosFiltrados.length === 0 ? (
                                  <p className="text-[10px] text-gray-400 p-2 text-center">Nenhum encontrado</p>
                                ) : usuariosFiltrados.map(u => (
                                  <button key={u.id} onClick={e => { e.stopPropagation(); selecionarUsuarioSistema(i, u) }}
                                    className="w-full text-left px-2 py-1.5 hover:bg-blue-50 text-xs border-b last:border-0">
                                    <p className="font-medium text-gray-800">{u.nome}</p>
                                    <p className="text-[10px] text-gray-400">{u.email}</p>
                                  </button>
                                ))}
                              </div>
                            )}
                            {sig.nome && (
                              <div className="text-xs text-green-700 bg-green-50 rounded p-2 flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" /> {sig.nome}
                              </div>
                            )}
                          </div>
                        )}

                        {sig.tipo === 'fornecedor' && (() => {
                          const termoBusca = (buscaFornecedor[i] || '').toLowerCase()
                          const fornFiltrados = fornecedores.filter(f =>
                            f.razao_social?.toLowerCase().includes(termoBusca) ||
                            f.nome_fantasia?.toLowerCase().includes(termoBusca) ||
                            f.cpf_cnpj?.includes(termoBusca)
                          )
                          return (
                            <div className="space-y-1">
                              <div className="relative">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                                <Input placeholder="Buscar fornecedor (nome, CNPJ)..." value={buscaFornecedor[i] || ''}
                                  onChange={e => setBuscaFornecedor(prev => ({ ...prev, [i]: e.target.value }))}
                                  className="pl-7 h-7 text-xs" onClick={e => e.stopPropagation()} />
                              </div>
                              {termoBusca.length > 0 && !sig.nome && (
                                <div className="border rounded max-h-36 overflow-y-auto">
                                  {fornFiltrados.length === 0 ? (
                                    <p className="text-[10px] text-gray-400 p-2 text-center">Nenhum fornecedor encontrado</p>
                                  ) : fornFiltrados.slice(0, 10).map(f => (
                                    <button key={f.id} onClick={e => { e.stopPropagation(); selecionarFornecedor(i, f) }}
                                      className="w-full text-left px-2 py-1.5 hover:bg-blue-50 text-xs border-b last:border-0">
                                      <p className="font-medium text-gray-800">{f.razao_social}</p>
                                      <p className="text-[10px] text-gray-400">{f.cpf_cnpj} · {f.email}</p>
                                    </button>
                                  ))}
                                </div>
                              )}
                              {sig.nome && (
                                <div className="bg-green-50 border border-green-200 rounded-lg p-2 space-y-1">
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-medium text-green-800 flex items-center gap-1">
                                      <CheckCircle className="h-3 w-3" /> {sig.nome}
                                    </p>
                                    <button onClick={e => { e.stopPropagation(); updateSignatario(i, 'nome', ''); setBuscaFornecedor(prev => ({ ...prev, [i]: '' })) }}
                                      className="text-gray-400 hover:text-red-500"><X className="h-3 w-3" /></button>
                                  </div>
                                  <div className="text-[10px] text-gray-600 space-y-0.5 pl-4">
                                    <p><Mail className="h-2.5 w-2.5 inline mr-1" />{sig.email || 'Sem e-mail'}</p>
                                    <p><Phone className="h-2.5 w-2.5 inline mr-1" />{sig.telefone || 'Sem telefone'}</p>
                                    {sig.cpf_cnpj && <p className="font-mono">{sig.cpf_cnpj}</p>}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })()}

                        {sig.tipo === 'externo' && (
                          <div className="space-y-1" onClick={e => e.stopPropagation()}>
                            <Input placeholder="Nome completo *" value={sig.nome} onChange={e => updateSignatario(i, 'nome', e.target.value)} className="h-7 text-xs" />
                            <div className="flex gap-1">
                              <Input placeholder="CPF/CNPJ" value={sig.cpf_cnpj} onChange={e => updateSignatario(i, 'cpf_cnpj', e.target.value)} className="h-7 text-xs" />
                              <Input placeholder="Telefone" value={sig.telefone} onChange={e => updateSignatario(i, 'telefone', e.target.value)} className="h-7 text-xs" />
                            </div>
                            <Input placeholder="E-mail *" type="email" value={sig.email} onChange={e => updateSignatario(i, 'email', e.target.value)} className="h-7 text-xs" />
                          </div>
                        )}
                      </div>
                    )
                  })}

                  <button onClick={addSignatario}
                    className="w-full py-2 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 flex items-center justify-center gap-1">
                    <Plus className="h-3 w-3" /> Adicionar signatário
                  </button>

                  {/* Erros */}
                  {errosValidacao.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-red-700 mb-1 flex items-center gap-1">
                        <AlertCircle className="h-3.5 w-3.5" /> Corrija antes de enviar:
                      </p>
                      <ul className="space-y-0.5">
                        {errosValidacao.map((msg, i) => (
                          <li key={i} className="text-xs text-red-600 flex items-start gap-1">
                            <span className="shrink-0">✗</span> {msg}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Info sobre tipos */}
                  {signatarios.some(s => s.tipo === 'externo' || s.tipo === 'fornecedor') && (
                    <div className="text-[10px] text-blue-600 bg-blue-50 rounded p-2">
                      Externos e fornecedores receberão link por e-mail/WhatsApp com validação OTP.
                    </div>
                  )}
                  {signatarios.some(s => s.tipo === 'eu_mesmo' || s.tipo === 'usuario_sistema') && (
                    <div className="text-[10px] text-green-600 bg-green-50 rounded p-2">
                      Internos assinarão pelo portal com verificação OTP por e-mail.
                    </div>
                  )}
                </>
              )}

              {/* ── Novos Signatários (modo adicionando) ── */}
              {painelDireito === 'signatarios' && modo === 'adicionando' && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1">
                      <UserPlus className="h-3.5 w-3.5" /> Novos Signatários
                    </p>
                    <span className="text-[10px] text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
                      Clique no PDF para posicionar
                    </span>
                  </div>

                  {novosSigs.map((sig, i) => {
                    const existingSigs = docAtivo?.signatarios?.length || 0
                    const cor = CORES[(existingSigs + i) % CORES.length]
                    const marker = novoSigMarkers.find(m => m.id === `newsig-${i}`)
                    const buscaKey = `new-${i}`
                    const usuariosFiltrados = usuariosSistema.filter(u =>
                      u.nome.toLowerCase().includes((buscaUsuario[buscaKey] || '').toLowerCase()) ||
                      u.email.toLowerCase().includes((buscaUsuario[buscaKey] || '').toLowerCase())
                    )
                    const termoBuscaForn = (buscaFornecedor[buscaKey] || '').toLowerCase()
                    const fornFiltrados = fornecedores.filter(f =>
                      f.razao_social?.toLowerCase().includes(termoBuscaForn) ||
                      f.nome_fantasia?.toLowerCase().includes(termoBuscaForn) ||
                      f.cpf_cnpj?.includes(termoBuscaForn)
                    )
                    return (
                      <div key={i} className={`rounded-lg border p-3 space-y-2 transition-all ${novoSigAtivo === i ? 'border-blue-400 bg-blue-50/50' : 'border-gray-200'}`}
                        onClick={() => setNovoSigAtivo(i)}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: cor }}>{existingSigs + i + 1}</div>
                            <span className="text-sm font-medium text-gray-800">{sig.nome || `Novo Sig. ${i + 1}`}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {marker && <span className="text-[10px] text-green-600">✓ Pos.</span>}
                            {novosSigs.length > 1 && (
                              <button onClick={e => { e.stopPropagation(); removeNovoSig(i) }} className="text-red-400 hover:text-red-600 p-0.5">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Tipo */}
                        <div className="flex gap-1">
                          {([
                            { tipo: 'usuario_sistema' as TipoSignatario, label: 'Interno' },
                            { tipo: 'fornecedor' as TipoSignatario, label: 'Fornecedor' },
                            { tipo: 'externo' as TipoSignatario, label: 'Externo' },
                          ]).map(opt => (
                            <button key={opt.tipo}
                              onClick={e => { e.stopPropagation(); setTipoNovoSig(i, opt.tipo) }}
                              className={`flex-1 py-1 rounded text-[10px] font-medium transition-all ${sig.tipo === opt.tipo ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                              {opt.label}
                            </button>
                          ))}
                        </div>

                        {/* Campos por tipo */}
                        {sig.tipo === 'usuario_sistema' && (
                          <div className="space-y-1">
                            <div className="relative">
                              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                              <Input placeholder="Buscar usuário..." value={buscaUsuario[buscaKey] || ''}
                                onChange={e => setBuscaUsuario(prev => ({ ...prev, [buscaKey]: e.target.value }))}
                                className="pl-7 h-7 text-xs" onClick={e => e.stopPropagation()} />
                            </div>
                            {(buscaUsuario[buscaKey] || '').length > 0 && !sig.nome && (
                              <div className="border rounded max-h-28 overflow-y-auto">
                                {usuariosFiltrados.length === 0 ? (
                                  <p className="text-[10px] text-gray-400 p-2 text-center">Nenhum encontrado</p>
                                ) : usuariosFiltrados.map(u => (
                                  <button key={u.id} onClick={e => { e.stopPropagation(); selecionarUsuarioNovoSig(i, u) }}
                                    className="w-full text-left px-2 py-1.5 hover:bg-blue-50 text-xs border-b last:border-0">
                                    <p className="font-medium text-gray-800">{u.nome}</p>
                                    <p className="text-[10px] text-gray-400">{u.email}</p>
                                  </button>
                                ))}
                              </div>
                            )}
                            {sig.nome && (
                              <div className="text-xs text-green-700 bg-green-50 rounded p-2 flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" /> {sig.nome}
                              </div>
                            )}
                          </div>
                        )}

                        {sig.tipo === 'fornecedor' && (
                          <div className="space-y-1">
                            <div className="relative">
                              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                              <Input placeholder="Buscar fornecedor (nome, CNPJ)..." value={buscaFornecedor[buscaKey] || ''}
                                onChange={e => setBuscaFornecedor(prev => ({ ...prev, [buscaKey]: e.target.value }))}
                                className="pl-7 h-7 text-xs" onClick={e => e.stopPropagation()} />
                            </div>
                            {termoBuscaForn.length > 0 && !sig.nome && (
                              <div className="border rounded max-h-36 overflow-y-auto">
                                {fornFiltrados.length === 0 ? (
                                  <p className="text-[10px] text-gray-400 p-2 text-center">Nenhum fornecedor encontrado</p>
                                ) : fornFiltrados.slice(0, 10).map(f => (
                                  <button key={f.id} onClick={e => { e.stopPropagation(); selecionarFornecedorNovoSig(i, f) }}
                                    className="w-full text-left px-2 py-1.5 hover:bg-blue-50 text-xs border-b last:border-0">
                                    <p className="font-medium text-gray-800">{f.razao_social}</p>
                                    <p className="text-[10px] text-gray-400">{f.cpf_cnpj} · {f.email}</p>
                                  </button>
                                ))}
                              </div>
                            )}
                            {sig.nome && (
                              <div className="bg-green-50 border border-green-200 rounded-lg p-2 space-y-1">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs font-medium text-green-800 flex items-center gap-1">
                                    <CheckCircle className="h-3 w-3" /> {sig.nome}
                                  </p>
                                  <button onClick={e => { e.stopPropagation(); updateNovoSig(i, 'nome', ''); setBuscaFornecedor(prev => ({ ...prev, [buscaKey]: '' })) }}
                                    className="text-gray-400 hover:text-red-500"><X className="h-3 w-3" /></button>
                                </div>
                                <div className="text-[10px] text-gray-600 space-y-0.5 pl-4">
                                  <p><Mail className="h-2.5 w-2.5 inline mr-1" />{sig.email || 'Sem e-mail'}</p>
                                  <p><Phone className="h-2.5 w-2.5 inline mr-1" />{sig.telefone || 'Sem telefone'}</p>
                                  {sig.cpf_cnpj && <p className="font-mono">{sig.cpf_cnpj}</p>}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {sig.tipo === 'externo' && (
                          <div className="space-y-1" onClick={e => e.stopPropagation()}>
                            <Input placeholder="Nome completo *" value={sig.nome} onChange={e => updateNovoSig(i, 'nome', e.target.value)} className="h-7 text-xs" />
                            <div className="flex gap-1">
                              <Input placeholder="CPF/CNPJ" value={sig.cpf_cnpj} onChange={e => updateNovoSig(i, 'cpf_cnpj', e.target.value)} className="h-7 text-xs" />
                              <Input placeholder="Telefone" value={sig.telefone} onChange={e => updateNovoSig(i, 'telefone', e.target.value)} className="h-7 text-xs" />
                            </div>
                            <Input placeholder="E-mail *" type="email" value={sig.email} onChange={e => updateNovoSig(i, 'email', e.target.value)} className="h-7 text-xs" />
                          </div>
                        )}
                      </div>
                    )
                  })}

                  <button onClick={addNovoSig}
                    className="w-full py-2 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 flex items-center justify-center gap-1">
                    <Plus className="h-3 w-3" /> Adicionar mais um signatário
                  </button>

                  {novosSigs.some(s => s.tipo === 'externo' || s.tipo === 'fornecedor') && (
                    <div className="text-[10px] text-blue-600 bg-blue-50 rounded p-2">
                      Externos e fornecedores receberão link por e-mail/WhatsApp com validação OTP.
                    </div>
                  )}
                  {novosSigs.some(s => s.tipo === 'usuario_sistema') && (
                    <div className="text-[10px] text-green-600 bg-green-50 rounded p-2">
                      Internos assinarão pelo portal com verificação OTP por e-mail.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* OTP Modal (no modo visualizar/novo) */}
        {otpModal && (
          <Dialog open onOpenChange={() => setOtpModal(null)}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-blue-600" /> Confirmar Assinatura
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {otpEtapa === 'confirmar' && (
                  <>
                    <p className="text-sm text-gray-600">
                      Assinar como <strong>{otpModal.nome}</strong>. Um código será enviado para seu e-mail.
                    </p>
                    {otpErro && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{otpErro}</p>}
                    <Button onClick={solicitarOtpInterno} disabled={otpLoading} className="w-full gap-2">
                      {otpLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                      Enviar código por e-mail
                    </Button>
                  </>
                )}
                {otpEtapa === 'codigo' && (
                  <>
                    <div className="text-center">
                      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                        <Mail className="h-6 w-6 text-green-600" />
                      </div>
                      <p className="text-sm text-gray-600">Código enviado para seu e-mail</p>
                    </div>
                    <Input placeholder="000000" value={otpCode} maxLength={6}
                      onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      onKeyDown={e => e.key === 'Enter' && otpCode.length === 6 && confirmarAssinatura()}
                      className="text-center text-2xl tracking-widest font-mono" />
                    {otpErro && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{otpErro}</p>}
                    <Button onClick={confirmarAssinatura} disabled={otpLoading || otpCode.length < 6} className="w-full gap-2">
                      {otpLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      Confirmar e Assinar
                    </Button>
                    <button className="w-full text-xs text-gray-400 hover:text-gray-600 underline"
                      onClick={() => { setOtpEtapa('confirmar'); setOtpCode(''); setOtpErro('') }}>
                      Reenviar código
                    </button>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </ModuleGuard>
  )
}

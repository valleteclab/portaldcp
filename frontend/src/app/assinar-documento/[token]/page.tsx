'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import {
  FileText, CheckCircle, Loader2, ShieldCheck, AlertCircle,
  Send, Eye, Lock, Phone, Mail,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { API_URL } from '@/lib/api'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface DadosDocumento {
  ja_assinado: boolean
  signatario: {
    id: string
    nome: string
    status: string
    tem_email: boolean
    tem_telefone: boolean
  }
  documento: {
    id: string
    titulo: string
    descricao?: string
    orgao_nome: string
    status: string
    arquivo_original_url: string
    arquivo_assinado_url?: string
  }
}

type Etapa = 'carregando' | 'identificacao' | 'otp' | 'confirmacao' | 'sucesso' | 'erro' | 'ja_assinado'

// ─── Componente ───────────────────────────────────────────────────────────────

export default function AssinarDocumentoPage() {
  const params = useParams()
  const token = params?.token as string

  const [etapa, setEtapa] = useState<Etapa>('carregando')
  const [dados, setDados] = useState<DadosDocumento | null>(null)
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [otp, setOtp] = useState('')
  const [canal, setCanal] = useState<'whatsapp' | 'email'>('whatsapp')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [pdfAssinadoUrl, setPdfAssinadoUrl] = useState<string | undefined>()

  // ─── Carregar dados do documento ─────────────────────────────────────────

  useEffect(() => {
    if (!token) return
    fetch(`${API_URL}/public/assinaturas/documento/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.statusCode && data.statusCode >= 400) {
          setEtapa('erro')
          setErro(data.message || 'Link inválido ou expirado.')
          return
        }
        setDados(data)
        setEtapa(data.ja_assinado ? 'ja_assinado' : 'identificacao')
      })
      .catch(() => {
        setEtapa('erro')
        setErro('Não foi possível carregar o documento. Verifique sua conexão.')
      })
  }, [token])

  // ─── Solicitar código OTP ────────────────────────────────────────────────

  const handleSolicitarCodigo = async () => {
    setErro('')
    if (!cpfCnpj.replace(/\D/g, '')) return setErro('Informe seu CPF ou CNPJ.')
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/public/assinaturas/solicitar-codigo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token_acesso: token, cpf_cnpj: cpfCnpj }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Erro ao solicitar código.')
      setCanal(data.canal)
      setEtapa('otp')
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ─── Confirmar assinatura ────────────────────────────────────────────────

  const handleAssinar = async () => {
    setErro('')
    if (otp.length < 6) return setErro('Informe o código de 6 dígitos.')
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/public/assinaturas/assinar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token_acesso: token, cpf_cnpj: cpfCnpj, codigo_otp: otp }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Erro ao assinar documento.')
      setPdfAssinadoUrl(data.pdf_url)
      setEtapa('sucesso')
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const baseUpload = API_URL.replace('/api', '') + '/uploads/'

  // ── Estados de carregando / erro / já assinado (tela simples centralizada) ──
  if (etapa === 'carregando' || etapa === 'erro' || etapa === 'ja_assinado' || etapa === 'sucesso') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-3 shadow-lg">
              <ShieldCheck className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Portal de Assinaturas</h1>
            <p className="text-sm text-gray-500">Assinatura Eletrônica Segura</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
            {etapa === 'carregando' && (
              <div className="flex flex-col items-center py-16 px-6">
                <Loader2 className="h-10 w-10 animate-spin text-blue-500 mb-4" />
                <p className="text-gray-500">Carregando documento...</p>
              </div>
            )}
            {etapa === 'erro' && (
              <div className="flex flex-col items-center py-16 px-6 text-center">
                <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
                <h2 className="text-lg font-semibold text-gray-800 mb-2">Link inválido</h2>
                <p className="text-gray-500 text-sm">{erro}</p>
              </div>
            )}
            {etapa === 'ja_assinado' && dados && (
              <div className="flex flex-col items-center py-12 px-6 text-center">
                <CheckCircle className="h-14 w-14 text-green-500 mb-4" />
                <h2 className="text-lg font-semibold text-gray-800 mb-1">Documento já assinado</h2>
                <p className="text-gray-500 text-sm mb-4">
                  Você já assinou <strong>"{dados.documento.titulo}"</strong>.
                </p>
                {dados.documento.arquivo_assinado_url && (
                  <Button className="gap-2 bg-green-600 hover:bg-green-700"
                    onClick={() => window.open(baseUpload + dados.documento.arquivo_assinado_url, '_blank')}>
                    <Eye className="h-4 w-4" /> Ver PDF Assinado
                  </Button>
                )}
              </div>
            )}
            {etapa === 'sucesso' && dados && (
              <div className="flex flex-col items-center py-12 px-6 text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle className="h-9 w-9 text-green-500" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Documento Assinado!</h2>
                <p className="text-gray-500 text-sm mb-1">Você assinou eletronicamente</p>
                <p className="font-semibold text-gray-800 mb-4">"{dados.documento.titulo}"</p>
                <p className="text-xs text-gray-400 mb-6">
                  Assinatura registrada com validade jurídica conforme Lei nº 14.063/2020.
                </p>
                {pdfAssinadoUrl ? (
                  <Button className="gap-2 bg-green-600 hover:bg-green-700"
                    onClick={() => window.open(baseUpload + pdfAssinadoUrl, '_blank')}>
                    <Eye className="h-4 w-4" /> Ver PDF com Assinaturas
                  </Button>
                ) : (
                  <p className="text-xs text-gray-400">O PDF final será gerado quando todos assinarem.</p>
                )}
              </div>
            )}
          </div>
          <p className="text-center text-xs text-gray-400 mt-4">Portal DCP · Lei nº 14.063/2020</p>
        </div>
      </div>
    )
  }

  // ── Layout principal com PDF + painel lateral ──────────────────────────────
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Barra superior */}
      <div className="bg-white border-b px-6 py-3 flex items-center gap-3 shadow-sm">
        <div className="flex items-center justify-center w-8 h-8 bg-blue-600 rounded-lg">
          <ShieldCheck className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{dados?.documento.titulo}</p>
          <p className="text-xs text-gray-400">{dados?.documento.orgao_nome} · Assinatura Eletrônica</p>
        </div>
        <span className="text-xs text-gray-400 hidden sm:block">Lei nº 14.063/2020</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Área do PDF ── */}
        <div className="flex-1 bg-gray-200 overflow-auto flex items-start justify-center p-4">
          {dados && (
            <div className="bg-white shadow-xl w-full" style={{ maxWidth: 750 }}>
              <iframe
                src={`${baseUpload}${dados.documento.arquivo_original_url}#toolbar=0&navpanes=0`}
                className="w-full"
                style={{ height: '85vh', border: 'none' }}
                title="Documento para assinatura"
              />
            </div>
          )}
        </div>

        {/* ── Painel lateral de assinatura ── */}
        <div className="w-80 bg-white border-l flex flex-col overflow-y-auto shadow-lg">
          <div className="p-5 border-b">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <Lock className="h-4 w-4 text-blue-600" /> Assinar Documento
            </h2>
            {dados && (
              <p className="text-xs text-gray-500 mt-1">
                Olá, <strong>{dados.signatario.nome}</strong>. Confirme sua identidade para assinar.
              </p>
            )}
          </div>

          <div className="flex-1 p-5 space-y-4">
            {/* ── Etapa: Identificação ── */}
            {etapa === 'identificacao' && dados && (
              <>
                <div className="bg-blue-50 rounded-xl p-3 border border-blue-100 text-sm text-blue-800">
                  <FileText className="h-4 w-4 inline mr-1" />
                  Revise o documento ao lado antes de assinar.
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block flex items-center gap-1">
                    <Lock className="h-3.5 w-3.5" /> Confirme seu CPF ou CNPJ
                  </label>
                  <Input
                    placeholder="000.000.000-00"
                    value={cpfCnpj}
                    onChange={e => setCpfCnpj(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSolicitarCodigo()}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Código enviado via {dados.signatario.tem_telefone ? 'WhatsApp' : 'e-mail'}.
                  </p>
                </div>

                {erro && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                    {erro}
                  </div>
                )}

                <Button onClick={handleSolicitarCodigo} disabled={loading} className="w-full gap-2">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {loading ? 'Enviando...' : 'Receber Código de Verificação'}
                </Button>
              </>
            )}

            {/* ── Etapa: OTP ── */}
            {etapa === 'otp' && dados && (
              <>
                <div className="text-center py-2">
                  <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-3">
                    {canal === 'whatsapp' ? <Phone className="h-6 w-6 text-green-600" /> : <Mail className="h-6 w-6 text-green-600" />}
                  </div>
                  <p className="font-semibold text-gray-800">Código enviado!</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Via <strong>{canal === 'whatsapp' ? 'WhatsApp' : 'e-mail'}</strong>
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Código de verificação</label>
                  <Input
                    placeholder="000000"
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={e => e.key === 'Enter' && handleAssinar()}
                    className="text-center text-2xl tracking-widest font-mono"
                    maxLength={6}
                  />
                </div>

                {erro && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                    {erro}
                  </div>
                )}

                <Button onClick={handleAssinar} disabled={loading || otp.length < 6} className="w-full gap-2">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {loading ? 'Assinando...' : 'Confirmar e Assinar'}
                </Button>

                <button className="w-full text-xs text-gray-400 hover:text-gray-600 underline"
                  onClick={() => { setEtapa('identificacao'); setOtp(''); setErro('') }}>
                  Voltar e reenviar código
                </button>
              </>
            )}
          </div>

          <div className="p-4 border-t bg-gray-50">
            <p className="text-xs text-gray-400 text-center">Portal DCP · Assinatura Eletrônica · Lei nº 14.063/2020</p>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  Fuel, Search, CheckCircle, XCircle, Loader2, QrCode, KeyRound, LogOut,
  ClipboardList, User,
} from 'lucide-react'

const QrScannerModal = dynamic(
  () => import('../QrScannerModal').then(m => m.QrScannerModal),
  { ssr: false, loading: () => <div className="flex items-center justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-orange-400" /></div> },
)
import { QrScannerErrorBoundary } from '../QrScannerErrorBoundary'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PostoInfo { nome: string; orgao_nome: string; orgao_id: string }

interface Requisicao {
  id: string; codigo: string; codigo_posto?: string; solicitante_nome: string; solicitante_cargo?: string
  veiculo_placa: string; veiculo_modelo?: string; tipo_combustivel: string
  quantidade_autorizada: number; quantidade_abastecida?: number; finalidade: string
  status: string; data_requisicao: string; data_abastecimento?: string
  valor_total?: number; contrato?: { preco_litro: number }; token_acesso?: string
}

interface Dashboard {
  mes: string; total_litros: number; total_valor: number
  total_autorizacoes_atendidas: number; requisicoes: Requisicao[]
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'frota_posto_token'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TZ_BRASIL = 'America/Sao_Paulo'
const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const fmtLitros = (v: number, dec = 3) =>
  `${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })} L`
const fmtData = (d: string) => {
  if (!d) return '—'
  const dt = new Date(d)
  return dt.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: TZ_BRASIL,
  }).replace(',', ' · ')
}
const initials = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')

// ─── Componente Principal ──────────────────────────────────────────────────────

export default function PostoPage() {
  const params = useParams()
  const slug = params.slug as string

  const [tela, setTela] = useState<'login' | 'painel'>('login')
  const [postoInfo, setPostoInfo] = useState<PostoInfo | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [initLoading, setInitLoading] = useState(true)

  const [senha, setSenha] = useState('')
  const [loginErro, setLoginErro] = useState('')
  const [loginCarregando, setLoginCarregando] = useState(false)

  const [tab, setTab] = useState<'registrar' | 'historico' | 'perfil'>('registrar')
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(false)

  const [codigoInput, setCodigoInput] = useState('')
  const [verificando, setVerificando] = useState(false)
  const [reqVerificada, setReqVerificada] = useState<Requisicao | null>(null)
  const [erroVerificacao, setErroVerificacao] = useState('')
  const [mostrandoScanner, setMostrandoScanner] = useState(false)

  const [modalConfirmar, setModalConfirmar] = useState(false)
  const [qtdAbastecida, setQtdAbastecida] = useState('')
  const [kmHodometro, setKmHodometro] = useState('')
  const [atendenteNome, setAtendenteNome] = useState('')
  const [confirmando, setConfirmando] = useState(false)

  const [modalSenha, setModalSenha] = useState(false)
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarNovaSenha, setConfirmarNovaSenha] = useState('')
  const [trocandoSenha, setTrocandoSenha] = useState(false)
  const [erroSenha, setErroSenha] = useState('')
  const [sucessoSenha, setSucessoSenha] = useState('')

  const getToken = useCallback(() => (typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null), [])
  const saveToken = useCallback((t: string) => {
    if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, t)
    setToken(t)
  }, [])
  const clearToken = useCallback(() => {
    if (typeof window !== 'undefined') localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setDashboard(null)
    setTela('login')
  }, [])

  const authFetch = useCallback((url: string, options: RequestInit = {}) => {
    const tok = getToken()
    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
        ...(options.headers || {}),
      },
    })
  }, [getToken])

  useEffect(() => {
    async function init() {
      setInitLoading(true)
      try {
        const res = await fetch(`/api/frota-pub/posto/${slug}/info`)
        if (res.ok) setPostoInfo(await res.json())
      } catch { /* ignore */ }
      const savedToken = getToken()
      if (savedToken) {
        setToken(savedToken)
        setTela('painel')
      }
      setInitLoading(false)
    }
    init()
  }, [slug, getToken])

  const carregarDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`/api/frota-pub/posto/dashboard?mes=${new Date().toISOString().slice(0, 7)}`)
      if (res.status === 401) { clearToken(); return }
      if (res.ok) setDashboard(await res.json())
    } finally {
      setLoading(false)
    }
  }, [authFetch, clearToken])

  useEffect(() => {
    if (tela === 'painel') carregarDashboard()
  }, [tela, carregarDashboard])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginErro('')
    setLoginCarregando(true)
    try {
      const res = await fetch(`/api/frota-pub/auth-posto/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setLoginErro(err.message || 'Credenciais inválidas.')
        return
      }
      const data = await res.json()
      saveToken(data.token)
      setSenha('')
      setTela('painel')
    } catch {
      setLoginErro('Erro ao conectar ao servidor.')
    }
    setLoginCarregando(false)
  }

  const buscarPorToken = useCallback(async (tokenQr: string) => {
    setVerificando(true)
    setErroVerificacao('')
    setReqVerificada(null)
    try {
      const res = await authFetch(`/api/frota-pub/req/${tokenQr}`)
      if (res.status === 401) { clearToken(); return }
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        setErroVerificacao(e.message || 'Autorização não encontrada')
        return
      }
      const req: Requisicao = await res.json()
      setReqVerificada(req)
      setQtdAbastecida(String(req.quantidade_autorizada))
    } finally {
      setVerificando(false)
    }
  }, [authFetch, clearToken])

  const verificarCodigo = async () => {
    const codigo = codigoInput.trim().toUpperCase()
    if (!codigo) return
    setVerificando(true)
    setErroVerificacao('')
    setReqVerificada(null)
    try {
      const res = await authFetch(`/api/frota-pub/posto/verificar/${encodeURIComponent(codigo)}`)
      if (res.status === 401) { clearToken(); return }
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        setErroVerificacao(e.message || 'Código não encontrado')
        return
      }
      const req: Requisicao = await res.json()
      setReqVerificada(req)
      setQtdAbastecida(String(req.quantidade_autorizada))
    } finally {
      setVerificando(false)
    }
  }

  const handleQrScan = useCallback((tokenQr: string) => {
    setMostrandoScanner(false)
    buscarPorToken(tokenQr)
  }, [buscarPorToken])

  const limparVerificacao = () => {
    setReqVerificada(null)
    setErroVerificacao('')
    setCodigoInput('')
    setQtdAbastecida('')
    setKmHodometro('')
    setAtendenteNome('')
  }

  const confirmarAbastecimento = async () => {
    if (!reqVerificada) return
    const tokenQr = reqVerificada.token_acesso
    const url = tokenQr
      ? `/api/frota-pub/req/${tokenQr}/confirmar`
      : `/api/frota-pub/posto/confirmar/${reqVerificada.id}`
    setConfirmando(true)
    try {
      const res = await authFetch(url, {
        method: 'PUT',
        body: JSON.stringify({
          quantidade_abastecida: parseFloat(qtdAbastecida) || 0,
          km_hodometro: kmHodometro ? parseFloat(kmHodometro) : undefined,
          atendente_nome: atendenteNome || undefined,
        }),
      })
      if (res.status === 401) { clearToken(); return }
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        alert(e.message || 'Erro ao confirmar')
        return
      }
      setModalConfirmar(false)
      limparVerificacao()
      carregarDashboard()
    } finally {
      setConfirmando(false)
    }
  }

  async function handleTrocarSenha(e: React.FormEvent) {
    e.preventDefault()
    setErroSenha('')
    setSucessoSenha('')
    if (novaSenha !== confirmarNovaSenha) { setErroSenha('As senhas não coincidem.'); return }
    if (novaSenha.length < 6) { setErroSenha('Mínimo 6 caracteres.'); return }
    setTrocandoSenha(true)
    try {
      const res = await authFetch('/api/frota-pub/posto/senha', {
        method: 'PUT',
        body: JSON.stringify({ senhaAtual, novaSenha }),
      })
      if (res.status === 401) { clearToken(); return }
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        setErroSenha(e.message || 'Erro ao trocar senha.')
        return
      }
      setSucessoSenha('Senha alterada com sucesso!')
      setSenhaAtual('')
      setNovaSenha('')
      setConfirmarNovaSenha('')
    } catch {
      setErroSenha('Erro ao conectar.')
    }
    setTrocandoSenha(false)
  }

  // ─── Tela: Loading ──────────────────────────────────────────────────────────

  if (initLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
      </div>
    )
  }

  // ─── Tela: Login ─────────────────────────────────────────────────────────────

  if (tela === 'login') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Fuel className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">{postoInfo?.nome || 'Painel do Posto'}</h1>
            {postoInfo?.orgao_nome && (
              <p className="text-slate-300 mt-1 text-sm font-medium">{postoInfo.orgao_nome}</p>
            )}
          </div>
          <form onSubmit={handleLogin} className="bg-slate-800 rounded-2xl p-6 space-y-4">
            <div>
              <label className="block text-slate-300 text-sm mb-1.5">Senha de acesso</label>
              <input
                type="password"
                className="w-full bg-slate-700 text-white border border-slate-600 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-orange-400"
                placeholder="Digite sua senha"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                required
                autoFocus
              />
            </div>
            {loginErro && <p className="text-red-400 text-sm text-center">{loginErro}</p>}
            <button
              type="submit"
              disabled={loginCarregando || !senha}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 min-h-[48px]"
            >
              {loginCarregando ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ─── Painel PWA ─────────────────────────────────────────────────────────────

  const requisicoesAbastecidas = (dashboard?.requisicoes || []).filter(r => r.status === 'ABASTECIDO')

  const tabRegistrar = (
    <div className="pb-24 px-4 pt-4 space-y-4">
      <div className="bg-slate-800 rounded-2xl p-4">
        <h2 className="text-white font-bold text-base mb-1">Registrar Abastecimento</h2>
        <p className="text-slate-400 text-sm">Escaneie o QR Code ou digite o código da autorização</p>
      </div>

      {/* Botão Escanear QR Code */}
      <button
        onClick={() => setMostrandoScanner(true)}
        className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-3"
      >
        <QrCode className="w-6 h-6" />
        Escanear QR Code
      </button>

      <div className="flex items-center gap-2 text-slate-400 text-sm">
        <div className="flex-1 h-px bg-slate-600" />
        <span>ou digite o código</span>
        <div className="flex-1 h-px bg-slate-600" />
      </div>

      {/* Input código manual */}
      <div className="space-y-2">
        <input
          type="text"
          placeholder="Ex: A3K7XP"
          value={codigoInput}
          onChange={e => { setCodigoInput(e.target.value.toUpperCase()); setErroVerificacao(''); setReqVerificada(null) }}
          onKeyDown={e => { if (e.key === 'Enter') verificarCodigo() }}
          className="w-full bg-slate-800 text-white border border-slate-600 rounded-xl px-4 py-3.5 text-lg font-mono text-center focus:outline-none focus:border-orange-400"
        />
        <button
          onClick={verificarCodigo}
          disabled={verificando || !codigoInput.trim()}
          className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2"
        >
          {verificando ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Search className="w-5 h-5" /> Verificar</>}
        </button>
      </div>

      {erroVerificacao && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-4 flex items-center gap-2 text-red-300">
          <XCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm font-medium">{erroVerificacao}</p>
        </div>
      )}

      {reqVerificada && (
        <div className="bg-green-900/30 border border-green-500/50 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-green-300">
            <CheckCircle className="w-5 h-5" />
            <span className="font-semibold">Autorização Válida!</span>
            <span className="font-mono text-sm">{reqVerificada.codigo_posto || reqVerificada.codigo}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-slate-800/50 rounded-xl p-3">
              <p className="text-slate-400 text-xs">Solicitante</p>
              <p className="text-white font-medium">{reqVerificada.solicitante_nome}</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-3">
              <p className="text-slate-400 text-xs">Veículo</p>
              <p className="text-white font-mono font-medium">{reqVerificada.veiculo_placa}</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-3">
              <p className="text-slate-400 text-xs">Combustível</p>
              <p className="text-white font-medium">{reqVerificada.tipo_combustivel}</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-3">
              <p className="text-slate-400 text-xs">Qtd. Autorizada</p>
              <p className="text-orange-400 font-bold text-lg">{fmtLitros(reqVerificada.quantidade_autorizada)}</p>
            </div>
          </div>
          <button
            onClick={() => setModalConfirmar(true)}
            className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2"
          >
            <Fuel className="w-5 h-5" /> Confirmar Abastecimento
          </button>
          <button onClick={limparVerificacao} className="w-full text-slate-400 text-sm py-2">
            Cancelar
          </button>
        </div>
      )}

      {/* Resumo do mês */}
      {dashboard && (
        <div className="bg-slate-800 rounded-2xl p-4">
          <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Este mês</p>
          <div className="flex justify-between text-white">
            <span>{fmtLitros(dashboard.total_litros, 0)} abastecidos</span>
            <span className="font-bold text-orange-400">{fmt(dashboard.total_valor)}</span>
          </div>
        </div>
      )}
    </div>
  )

  const tabHistorico = (
    <div className="pb-24 px-4 pt-4 space-y-3">
      <h2 className="text-base font-bold text-white">Histórico de Abastecimentos</h2>
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
        </div>
      ) : requisicoesAbastecidas.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum abastecimento registrado este mês</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requisicoesAbastecidas.slice(0, 20).map(r => (
            <div key={r.id} className="bg-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="font-mono font-bold text-blue-400">{r.codigo}</p>
                <p className="text-slate-300 text-sm">{r.solicitante_nome} · {r.veiculo_placa}</p>
                <p className="text-slate-500 text-xs">{fmtData(r.data_abastecimento || r.data_requisicao)}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-orange-400">{fmtLitros(r.quantidade_abastecida || 0)}</p>
                <p className="text-green-400 text-sm">{fmt(r.valor_total || 0)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const tabPerfil = (
    <div className="pb-24 px-4 pt-4 space-y-4">
      <h2 className="text-base font-bold text-white">Perfil</h2>
      <div className="bg-slate-800 rounded-2xl p-4 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-orange-500 flex items-center justify-center text-white text-xl font-bold">
          {initials(postoInfo?.nome || 'P')}
        </div>
        <div>
          <p className="font-bold text-white">{postoInfo?.nome || 'Posto'}</p>
          <p className="text-slate-400 text-sm">{postoInfo?.orgao_nome}</p>
        </div>
      </div>

      <div className="bg-slate-800 rounded-2xl p-4 space-y-3">
        <p className="font-semibold text-slate-300 flex items-center gap-2">
          <KeyRound className="w-4 h-4" /> Alterar Senha
        </p>
        <input
          type="password"
          placeholder="Senha atual"
          className="w-full bg-slate-700 text-white border border-slate-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
          value={senhaAtual}
          onChange={e => setSenhaAtual(e.target.value)}
        />
        <input
          type="password"
          placeholder="Nova senha"
          className="w-full bg-slate-700 text-white border border-slate-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
          value={novaSenha}
          onChange={e => setNovaSenha(e.target.value)}
        />
        <input
          type="password"
          placeholder="Confirmar nova senha"
          className="w-full bg-slate-700 text-white border border-slate-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
          value={confirmarNovaSenha}
          onChange={e => setConfirmarNovaSenha(e.target.value)}
        />
        {erroSenha && <p className="text-red-400 text-sm">{erroSenha}</p>}
        {sucessoSenha && <p className="text-green-400 text-sm">{sucessoSenha}</p>}
        <button
          onClick={handleTrocarSenha}
          disabled={trocandoSenha || !senhaAtual || !novaSenha}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2"
        >
          {trocandoSenha ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar Nova Senha'}
        </button>
      </div>

      <button
        onClick={clearToken}
        className="w-full border border-red-500/50 text-red-400 font-semibold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-red-500/10"
      >
        <LogOut className="w-4 h-4" /> Sair
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-900 max-w-md mx-auto relative">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center text-white text-sm font-bold">
            {initials(postoInfo?.nome || 'P')}
          </div>
          <div>
            <p className="font-bold text-white text-sm">{postoInfo?.nome || 'Painel do Posto'}</p>
            <p className="text-slate-400 text-xs">{postoInfo?.orgao_nome}</p>
          </div>
        </div>
      </div>

      {tab === 'registrar' && tabRegistrar}
      {tab === 'historico' && tabHistorico}
      {tab === 'perfil' && tabPerfil}

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-slate-800 border-t border-slate-700 flex z-50 safe-area-pb">
        {[
          { id: 'registrar', label: 'Registrar', icon: QrCode },
          { id: 'historico', label: 'Histórico', icon: ClipboardList },
          { id: 'perfil', label: 'Perfil', icon: User },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id as typeof tab)}
            className={`flex-1 py-3 flex flex-col items-center gap-1 text-sm transition-colors min-h-[56px] ${
              tab === id ? 'text-orange-400' : 'text-slate-400'
            }`}
          >
            <Icon className="w-6 h-6" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* Modal Confirmar */}
      {modalConfirmar && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
              <Fuel className="w-5 h-5 text-green-400" /> Confirmar Abastecimento
            </h3>
            {reqVerificada && (
              <p className="text-slate-400 text-sm mb-4">
                {reqVerificada.codigo} · {reqVerificada.solicitante_nome} · {reqVerificada.veiculo_placa}
              </p>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-slate-300 text-sm mb-1">Qtd. Abastecida (litros) *</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  className="w-full bg-slate-700 text-white border border-slate-600 rounded-xl px-4 py-3"
                  value={qtdAbastecida}
                  onChange={e => setQtdAbastecida(e.target.value)}
                />
                {reqVerificada && (
                  <p className="text-slate-500 text-xs mt-1">Autorizado: {fmtLitros(reqVerificada.quantidade_autorizada)}</p>
                )}
              </div>
              <div>
                <label className="block text-slate-300 text-sm mb-1">KM Hodômetro</label>
                <input
                  type="number"
                  min="0"
                  className="w-full bg-slate-700 text-white border border-slate-600 rounded-xl px-4 py-3"
                  placeholder="Ex: 45200"
                  value={kmHodometro}
                  onChange={e => setKmHodometro(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-slate-300 text-sm mb-1">Nome do Atendente</label>
                <input
                  type="text"
                  className="w-full bg-slate-700 text-white border border-slate-600 rounded-xl px-4 py-3"
                  placeholder="Atendente responsável"
                  value={atendenteNome}
                  onChange={e => setAtendenteNome(e.target.value)}
                />
              </div>
              {reqVerificada?.contrato && qtdAbastecida && (
                <div className="bg-green-900/30 border border-green-500/50 rounded-xl p-3 text-sm">
                  <span className="text-slate-300">Valor a faturar: </span>
                  <span className="font-bold text-green-400">
                    {fmt((parseFloat(qtdAbastecida) || 0) * Number(reqVerificada.contrato.preco_litro))}
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setModalConfirmar(false)}
                className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-300 font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarAbastecimento}
                disabled={confirmando || !qtdAbastecida}
                className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-bold flex items-center justify-center gap-2"
              >
                {confirmando && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Scanner */}
      {mostrandoScanner && (
        <QrScannerErrorBoundary onClose={() => setMostrandoScanner(false)}>
          <QrScannerModal
            onScan={handleQrScan}
            onClose={() => setMostrandoScanner(false)}
          />
        </QrScannerErrorBoundary>
      )}
    </div>
  )
}

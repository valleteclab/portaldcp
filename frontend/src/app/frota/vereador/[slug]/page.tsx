'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, Fuel, ClipboardList, Home, User, ChevronRight, CheckCircle, Clock, XCircle, Lock, LogOut, ExternalLink, Share2 } from 'lucide-react'
import { API_URL } from '@/lib/api'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface VereadorInfo { tipo?: 'VEREADOR' | 'VEREADOR_PORTAL'; nome: string; cargo?: string; orgao_nome?: string; logo_url?: string }
interface CredencialInfo { id: string; nome: string; cargo?: string; orgao_nome?: string; cota_mensal_litros: number; veiculo_ids: string[] }
interface Requisicao {
  id: string; codigo: string; codigo_posto?: string; tipo_combustivel: string
  quantidade_autorizada: number; quantidade_abastecida?: number; finalidade: string
  status: string; data_requisicao: string; veiculo_placa: string; veiculo_modelo?: string
  token_acesso?: string; token_expiry?: string
}
interface VereadorData {
  credencial: CredencialInfo; mes: string; cota_mensal: number; litros_usados: number
  cota_extra?: number; cota_extra_motivo?: string | null; cota_total?: number
  litros_comprometidos?: number; litros_disponiveis?: number | null
  autorizacao_ativa: Requisicao | null; requisicoes: Requisicao[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LS_KEY = 'frota_vereador_token'
const FROTA_PUB = `${API_URL}/api/frota-pub`

const TZ_BRASIL = 'America/Sao_Paulo'
const fmtLitros = (v: number) => `${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} L`
const fmtData = (d: string) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: TZ_BRASIL }) : ''
const initials = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')

function getQrUrl(token: string, origin: string) {
  const url = `${origin}/frota/req/${token}`
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=10&data=${encodeURIComponent(url)}`
}

function compartilharWhatsApp(token: string, codigo?: string) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const url = `${origin}/frota/req/${token}`
  const texto = `📋 Ordem de Fornecimento de Combustível${codigo ? ` — ${codigo}` : ''}\n\nAcesse o link para ver a autorização e QR Code:\n${url}`
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')
}

const STATUS_LABEL: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PENDENTE:   { label: 'Aguardando aprovação', color: 'text-yellow-600 bg-yellow-50 border-yellow-200',   icon: <Clock className="w-3.5 h-3.5" /> },
  AUTORIZADO: { label: 'Aprovado',             color: 'text-green-700 bg-green-50 border-green-200',     icon: <CheckCircle className="w-3.5 h-3.5" /> },
  ABASTECIDO: { label: 'Abastecido',           color: 'text-blue-700 bg-blue-50 border-blue-200',        icon: <CheckCircle className="w-3.5 h-3.5" /> },
  NEGADO:     { label: 'Negado',               color: 'text-red-700 bg-red-50 border-red-200',           icon: <XCircle className="w-3.5 h-3.5" /> },
  CANCELADO:  { label: 'Cancelado',            color: 'text-gray-500 bg-gray-50 border-gray-200',        icon: <XCircle className="w-3.5 h-3.5" /> },
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function VereadorSlugPage() {
  const params = useParams()
  const slug = params.slug as string

  const [tab, setTab] = useState<'inicio' | 'combustivel' | 'pedidos' | 'perfil'>('inicio')
  const [token, setToken] = useState<string | null>(null)
  const [tokenOrgaoId, setTokenOrgaoId] = useState<string | null>(null)
  const [data, setData] = useState<VereadorData | null>(null)
  const [loading, setLoading] = useState(true)

  // Info pública do vereador (antes do login)
  const [vereadorInfo, setVereadorInfo] = useState<VereadorInfo | null>(null)
  const [infoErro, setInfoErro] = useState('')

  // Login
  const [codigoAcesso, setCodigoAcesso] = useState('')
  const [senha, setSenha] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // Novo pedido
  const [formPedido, setFormPedido] = useState({
    veiculo_placa: '', tipo_combustivel: 'GASOLINA',
    finalidade: '', km_hodometro: '', observacoes: '',
  })
  const [qtdOutro, setQtdOutro] = useState('')
  const [qtdSelecionada, setQtdSelecionada] = useState<number | 'outro'>(30)
  const [enviandoPedido, setEnviandoPedido] = useState(false)
  const [pedidoSucesso, setPedidoSucesso] = useState(false)

  // Senha
  const [senhaForm, setSenhaForm] = useState({ senhaAtual: '', novaSenha: '', confirmar: '' })
  const [senhaLoading, setSenhaLoading] = useState(false)
  const [senhaMsg, setSenhaMsg] = useState('')

  // Requisição selecionada para mostrar ao posto (quando há múltiplas aprovadas)
  const [requisicaoSelecionada, setRequisicaoSelecionada] = useState<Requisicao | null>(null)

  // ─── Carregar info pública ────────────────────────────────────────────────

  useEffect(() => {
    fetch(`${FROTA_PUB}/vereador-link/${slug}/info`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setVereadorInfo(d))
      .catch(() => setInfoErro('Link de acesso inválido ou expirado.'))
  }, [slug])

  // ─── Inicializar sessão ───────────────────────────────────────────────────

  useEffect(() => {
    const t = localStorage.getItem(LS_KEY)
    const orgId = localStorage.getItem('frota_vereador_orgao_id')
    if (t) { setToken(t); setTokenOrgaoId(orgId) }
    else setLoading(false)
  }, [])

  const carregarDados = useCallback(async (t: string) => {
    setLoading(true)
    try {
      const res = await fetch(`${FROTA_PUB}/vereador/me`, {
        headers: { Authorization: `Bearer ${t}` },
      })
      if (!res.ok) {
        localStorage.removeItem(LS_KEY)
        localStorage.removeItem('frota_vereador_orgao_id')
        setToken(null); setLoading(false); return
      }
      setData(await res.json())
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (token) carregarDados(token) }, [token, carregarDados])

  // Sincronizar requisição selecionada quando dados carregam (usa a mais recente aprovada)
  useEffect(() => {
    const ativa = data?.autorizacao_ativa ?? data?.requisicoes?.find(r => r.status === 'AUTORIZADO') ?? null
    setRequisicaoSelecionada(ativa)
  }, [data])

  // ─── Login ────────────────────────────────────────────────────────────────

  const isPortal = vereadorInfo?.tipo === 'VEREADOR_PORTAL'

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginLoading(true); setLoginError('')
    try {
      const endpoint = isPortal
        ? `${FROTA_PUB}/auth-vereador-portal/${slug}`
        : `${FROTA_PUB}/auth-vereador/${slug}`
      const body = isPortal
        ? { codigo_acesso: codigoAcesso.trim(), senha }
        : { senha }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setLoginError(json.message || 'Credenciais incorretas'); return }
      if (json.credencial?.tipo !== 'VEREADOR') { setLoginError('Acesso exclusivo para vereadores'); return }
      localStorage.setItem(LS_KEY, json.token)
      localStorage.setItem('frota_vereador_orgao_id', json.credencial.orgao_id)
      setTokenOrgaoId(json.credencial.orgao_id)
      setToken(json.token)
    } catch { setLoginError('Erro de conexão') }
    finally { setLoginLoading(false) }
  }

  const handleLogout = () => {
    localStorage.removeItem(LS_KEY)
    localStorage.removeItem('frota_vereador_orgao_id')
    setToken(null); setData(null)
  }

  // ─── Enviar Pedido ────────────────────────────────────────────────────────

  const handleEnviarPedido = async () => {
    setEnviandoPedido(true)
    try {
      const qtd = qtdSelecionada === 'outro' ? parseFloat(qtdOutro) || 0 : qtdSelecionada
      const res = await fetch(`${FROTA_PUB}/vereador/requisicao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          veiculo_placa: formPedido.veiculo_placa.toUpperCase(),
          tipo_combustivel: formPedido.tipo_combustivel,
          quantidade_autorizada: qtd,
          finalidade: formPedido.finalidade,
          km_hodometro: formPedido.km_hodometro ? parseFloat(formPedido.km_hodometro) : undefined,
          observacoes: formPedido.observacoes,
        }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro ao enviar'); return }
      setPedidoSucesso(true)
      setFormPedido({ veiculo_placa: '', tipo_combustivel: 'GASOLINA', finalidade: '', km_hodometro: '', observacoes: '' })
      setQtdSelecionada(30)
      setTimeout(() => { setPedidoSucesso(false); setTab('inicio'); carregarDados(token!) }, 2000)
    } finally { setEnviandoPedido(false) }
  }

  // ─── Alterar Senha ────────────────────────────────────────────────────────

  const handleAlterarSenha = async () => {
    if (senhaForm.novaSenha !== senhaForm.confirmar) { setSenhaMsg('As senhas não coincidem'); return }
    setSenhaLoading(true); setSenhaMsg('')
    try {
      const res = await fetch(`${FROTA_PUB}/vereador/senha`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ senhaAtual: senhaForm.senhaAtual, novaSenha: senhaForm.novaSenha }),
      })
      const json = await res.json()
      setSenhaMsg(res.ok ? '✓ Senha alterada com sucesso!' : (json.message || 'Erro'))
      if (res.ok) setSenhaForm({ senhaAtual: '', novaSenha: '', confirmar: '' })
    } finally { setSenhaLoading(false) }
  }

  // ─── Tela de Login ────────────────────────────────────────────────────────

  if (!token) return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          {vereadorInfo?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={vereadorInfo.logo_url} alt="Logo" className="w-16 h-16 object-contain mx-auto mb-4 rounded-2xl" />
          ) : (
            <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Fuel className="w-8 h-8 text-white" />
            </div>
          )}
          <h1 className="text-2xl font-bold text-white">Portal de Combustível</h1>
          {vereadorInfo && (
            <p className="text-slate-300 mt-1 text-sm font-medium">{vereadorInfo.orgao_nome}</p>
          )}
          {infoErro && <p className="text-red-400 mt-2 text-sm">{infoErro}</p>}
        </div>

        {!infoErro && (
          <form onSubmit={handleLogin} className="bg-slate-800 rounded-2xl p-6 space-y-4">
            {vereadorInfo && (
              <div className="bg-slate-700 rounded-xl p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-sm">
                  {isPortal ? '👥' : initials(vereadorInfo.nome)}
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">{vereadorInfo.nome}</p>
                  {vereadorInfo.cargo && <p className="text-slate-400 text-xs">{vereadorInfo.cargo}</p>}
                </div>
              </div>
            )}
            {isPortal && (
              <div>
                <label className="block text-slate-300 text-sm mb-1.5">Código de acesso</label>
                <input
                  type="text"
                  className="w-full bg-slate-700 text-white border border-slate-600 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-orange-400"
                  placeholder="Ex: VER001"
                  value={codigoAcesso}
                  onChange={e => setCodigoAcesso(e.target.value.toUpperCase())}
                  required
                  autoComplete="username"
                />
              </div>
            )}
            <div>
              <label className="block text-slate-300 text-sm mb-1.5">Senha</label>
              <input
                type="password"
                className="w-full bg-slate-700 text-white border border-slate-600 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-orange-400"
                placeholder="Sua senha"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                required
                autoFocus={!isPortal}
                autoComplete="current-password"
              />
            </div>
            {loginError && <p className="text-red-400 text-sm text-center">{loginError}</p>}
            <button type="submit" disabled={loginLoading || !senha || (isPortal && !codigoAcesso.trim())}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 min-h-[44px]">
              {loginLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Entrar'}
            </button>
          </form>
        )}
      </div>
    </div>
  )

  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
    </div>
  )

  if (!data) return null

  const { credencial, mes, cota_mensal, litros_usados, requisicoes } = data
  const requisicoesAprovadas = requisicoes.filter(r => r.status === 'AUTORIZADO')
  const exibir = requisicoesAprovadas.find(r => r.id === requisicaoSelecionada?.id) ?? requisicoesAprovadas[0] ?? null
  const cotaExtra = Number(data.cota_extra || 0)
  const cotaTotal = data.cota_total ?? cota_mensal
  const litrosComprometidos = Number(data.litros_comprometidos || 0)
  const percentoCota = cotaTotal > 0 ? Math.min(((litros_usados + litrosComprometidos) / cotaTotal) * 100, 100) : 0
  // Disponível já desconta pedidos abertos (pendentes/autorizados) — é o que o backend bloqueia
  const litrosDisp = data.litros_disponiveis != null ? data.litros_disponiveis : Math.max(0, cotaTotal - litros_usados - litrosComprometidos)
  const qtdPedido = qtdSelecionada === 'outro' ? (parseFloat(qtdOutro) || 0) : qtdSelecionada
  const excedeCota = cota_mensal > 0 && qtdPedido > litrosDisp + 0.0005
  const mesLabel = new Date(`${mes}-15`).toLocaleString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()
  const ordemUrl = exibir?.token_acesso
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/frota/req/${exibir.token_acesso}`
    : null
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  // ─── Aba: Início ─────────────────────────────────────────────────────────

  const tabInicioContent = (
    <div className="space-y-4 pb-24">
      <div className="bg-slate-800 px-4 pt-12 pb-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white font-bold text-lg flex items-center gap-2">
              <Fuel className="w-5 h-5 text-orange-400" /> Combustível
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">{credencial.nome} · {credencial.orgao_nome}</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center text-white text-sm font-bold">
            {initials(credencial.nome)}
          </div>
        </div>
      </div>

      <div className="px-4 space-y-4">
        {/* Cota */}
        <div>
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-widest mb-2">SUA COTA — {mesLabel}</p>
          <div className="bg-slate-800 rounded-2xl p-4 space-y-3">
            <div>
              <p className="text-slate-400 text-xs uppercase tracking-wide">LITROS UTILIZADOS</p>
              <p className="text-white text-3xl font-bold mt-1">
                {fmtLitros(litros_usados)}
                {cota_mensal > 0 && <span className="text-slate-400 text-lg font-normal"> / {fmtLitros(cotaTotal)}</span>}
              </p>
            </div>
            {cota_mensal > 0 && (
              <>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${percentoCota >= 90 ? 'bg-red-500' : percentoCota >= 70 ? 'bg-yellow-400' : 'bg-green-400'}`}
                    style={{ width: `${percentoCota}%` }} />
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>{percentoCota.toFixed(0)}% utilizado{litrosComprometidos > 0 ? ` (${fmtLitros(litrosComprometidos)} em pedidos abertos)` : ''}</span>
                  <span>{fmtLitros(litrosDisp)} disponíveis</span>
                </div>
                {cotaExtra > 0 && (
                  <p className="text-xs text-emerald-300">
                    +{fmtLitros(cotaExtra)} extras liberados pelo gestor este mês{data.cota_extra_motivo ? ` — ${data.cota_extra_motivo}` : ''}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Autorização Ativa — card de destaque */}
        {exibir && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-widest">AUTORIZAÇÃO ATIVA</p>
              {requisicoesAprovadas.length > 1 && (
                <select
                  value={exibir.id}
                  onChange={e => {
                    const r = requisicoesAprovadas.find(x => x.id === e.target.value)
                    if (r) setRequisicaoSelecionada(r)
                  }}
                  className="text-xs bg-slate-700 text-white border border-slate-600 rounded-lg px-2 py-1.5 focus:outline-none focus:border-orange-400"
                >
                  {requisicoesAprovadas.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.codigo} — {fmtLitros(r.quantidade_autorizada)} · {r.tipo_combustivel}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="bg-green-600 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-white">
                <CheckCircle className="w-5 h-5" />
                <div>
                  <p className="font-bold">Pedido Aprovado!</p>
                  <p className="text-green-200 text-sm">Mostre a ordem de fornecimento no posto</p>
                </div>
              </div>

              {/* Código + QR Code */}
              <div className="bg-white rounded-xl p-3 flex items-center gap-3">
                <div className="flex-1 text-center min-w-0">
                  <p className="text-slate-400 text-xs mb-1">Código para o atendente</p>
                  <p className="font-mono text-2xl sm:text-3xl font-bold tracking-widest text-slate-800">
                    {exibir.codigo_posto || exibir.codigo}
                  </p>
                  {exibir.codigo_posto && (
                    <p className="text-slate-400 text-xs mt-1">Nº: {exibir.codigo}</p>
                  )}
                </div>
                {exibir.token_acesso && origin && (
                  <div className="flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getQrUrl(exibir.token_acesso, origin)}
                      alt="QR Code para o posto"
                      className="w-24 h-24 sm:w-28 sm:h-28 rounded-lg border-2 border-slate-200"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-green-700/50 rounded-xl p-3">
                  <p className="text-green-300 text-xs uppercase tracking-wide">LITROS</p>
                  <p className="text-white font-bold">{fmtLitros(exibir.quantidade_autorizada)}</p>
                </div>
                <div className="bg-green-700/50 rounded-xl p-3">
                  <p className="text-green-300 text-xs uppercase tracking-wide">COMBUSTÍVEL</p>
                  <p className="text-white font-bold capitalize">{exibir.tipo_combustivel.toLowerCase()}</p>
                </div>
                <div className="bg-green-700/50 rounded-xl p-3">
                  <p className="text-green-300 text-xs uppercase tracking-wide">VEÍCULO</p>
                  <p className="text-white font-bold font-mono">{exibir.veiculo_placa}</p>
                </div>
                {exibir.token_expiry && (
                  <div className="bg-green-700/50 rounded-xl p-3">
                    <p className="text-green-300 text-xs uppercase tracking-wide">VÁLIDO ATÉ</p>
                    <p className="text-white font-bold">{fmtData(exibir.token_expiry)}</p>
                  </div>
                )}
              </div>

              {exibir.finalidade && (
                <div className="bg-green-700/50 rounded-xl p-3">
                  <p className="text-green-300 text-xs uppercase tracking-wide">FINALIDADE</p>
                  <p className="text-white text-sm">{exibir.finalidade}</p>
                </div>
              )}

              {/* Botões — abrir Ordem e compartilhar WhatsApp */}
              {ordemUrl && (
                <div className="flex gap-2">
                  <a
                    href={ordemUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-white text-green-700 font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-green-50 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" /> Ver Autorização
                  </a>
                  {exibir?.token_acesso && (
                    <button
                      onClick={() => compartilharWhatsApp(exibir.token_acesso!, exibir.codigo)}
                      className="flex-1 bg-[#25D366] text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-[#1ebe5d] transition-colors"
                    >
                      <Share2 className="w-4 h-4" /> WhatsApp
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Histórico recente */}
        {requisicoes.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-widest">ÚLTIMOS PEDIDOS</p>
              <button onClick={() => setTab('pedidos')} className="text-orange-400 text-xs flex items-center gap-1">
                Ver todos <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2">
              {requisicoes.slice(0, 3).map(r => {
                const s = STATUS_LABEL[r.status] || STATUS_LABEL.CANCELADO
                const isAprovado = r.status === 'AUTORIZADO'
                const isSelecionada = exibir?.id === r.id
                return (
                  <div
                    key={r.id}
                    onClick={() => isAprovado && setRequisicaoSelecionada(r)}
                    className={`bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm ${isAprovado ? 'cursor-pointer hover:ring-2 hover:ring-green-400 transition-shadow' : ''} ${isSelecionada ? 'ring-2 ring-green-500' : ''}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${r.status === 'ABASTECIDO' ? 'bg-blue-100' : r.status === 'AUTORIZADO' ? 'bg-green-100' : 'bg-gray-100'}`}>
                      {s.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 font-mono">{r.codigo}</p>
                      <p className="text-xs text-slate-400 truncate">{r.quantidade_autorizada} L · {r.tipo_combustivel} · {r.veiculo_placa}</p>
                      <p className="text-xs text-slate-400">{fmtData(r.data_requisicao)} · {r.finalidade}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${s.color}`}>
                      {isAprovado && isSelecionada ? 'Em exibição' : s.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  // ─── Aba: Novo Pedido ─────────────────────────────────────────────────────

  const QUANTIDADES = [20, 30, 40, 50]
  const COMB_OPTIONS = ['GASOLINA', 'ETANOL', 'DIESEL', 'FLEX', 'GNV']

  const tabCombustivelContent = (
    <div className="pb-24 px-4 pt-4 space-y-4">
      <h2 className="text-base font-bold text-slate-800">FAZER NOVO PEDIDO</h2>
      {pedidoSucesso ? (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="font-bold text-green-700">Pedido enviado!</p>
          <p className="text-green-600 text-sm mt-1">Aguarde a aprovação do gestor</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-4">
          <div>
            <p className="font-semibold text-slate-800">Solicitar Combustível</p>
            <p className="text-slate-400 text-sm">Preencha os dados e aguarde a aprovação</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-slate-600 font-medium">Placa do Veículo *</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400 uppercase"
              placeholder="ABC-1234"
              value={formPedido.veiculo_placa}
              onChange={e => setFormPedido({ ...formPedido, veiculo_placa: e.target.value.toUpperCase() })}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-slate-600 font-medium">Tipo de Combustível *</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
              value={formPedido.tipo_combustivel}
              onChange={e => setFormPedido({ ...formPedido, tipo_combustivel: e.target.value })}
            >
              {COMB_OPTIONS.map(c => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-slate-600 font-medium">Quantidade solicitada (litros) *</label>
            <div className="flex gap-2 flex-wrap">
              {QUANTIDADES.map(q => (
                <button key={q} onClick={() => setQtdSelecionada(q)}
                  className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors
                    ${qtdSelecionada === q ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-200 text-slate-600 hover:border-orange-300'}`}>
                  {q} L
                </button>
              ))}
              <button onClick={() => setQtdSelecionada('outro')}
                className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors
                  ${qtdSelecionada === 'outro' ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-200 text-slate-600'}`}>
                Outro
              </button>
            </div>
            {qtdSelecionada === 'outro' && (
              <input type="number" step="0.001" min="1"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm mt-2 focus:outline-none focus:border-orange-400"
                placeholder="Ex: 25" value={qtdOutro} onChange={e => setQtdOutro(e.target.value)} />
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-slate-600 font-medium">Km atual do veículo</label>
            <input type="number" min="0"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
              placeholder="Ex: 18440" value={formPedido.km_hodometro}
              onChange={e => setFormPedido({ ...formPedido, km_hodometro: e.target.value })} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-slate-600 font-medium">Destino / Finalidade *</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
              placeholder="Ex: Visita a comunidades — Zona Norte"
              value={formPedido.finalidade}
              onChange={e => setFormPedido({ ...formPedido, finalidade: e.target.value })} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-slate-600 font-medium">Observação (opcional)</label>
            <textarea rows={2}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400 resize-none"
              placeholder="Informações adicionais..."
              value={formPedido.observacoes}
              onChange={e => setFormPedido({ ...formPedido, observacoes: e.target.value })} />
          </div>

          {excedeCota && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              Sua cota do mês não cobre este pedido: restam <strong>{fmtLitros(litrosDisp)}</strong>
              {litrosComprometidos > 0 ? ` (${fmtLitros(litrosComprometidos)} já estão em pedidos abertos)` : ''}.
              Reduza a quantidade ou peça ao gestor uma liberação extra.
            </p>
          )}
          <button onClick={handleEnviarPedido}
            disabled={enviandoPedido || excedeCota || !formPedido.veiculo_placa || !formPedido.finalidade || (qtdSelecionada === 'outro' && !qtdOutro)}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2">
            {enviandoPedido ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Fuel className="w-5 h-5" /> Enviar Pedido para Aprovação</>}
          </button>
        </div>
      )}
    </div>
  )

  // ─── Aba: Pedidos ─────────────────────────────────────────────────────────

  const tabPedidosContent = (
    <div className="pb-24 px-4 pt-4 space-y-3">
      <h2 className="text-base font-bold text-slate-800">MEUS PEDIDOS</h2>
      {requisicoes.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum pedido encontrado</p>
        </div>
      ) : requisicoes.map(r => {
        const s = STATUS_LABEL[r.status] || STATUS_LABEL.CANCELADO
        const tokenUrl = r.token_acesso
          ? `${typeof window !== 'undefined' ? window.location.origin : ''}/frota/req/${r.token_acesso}`
          : null
        return (
          <div key={r.id} className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
            <div className="flex items-start justify-between">
              <p className="font-mono font-bold text-blue-600">{r.codigo}</p>
              <span className={`text-xs px-2 py-1 rounded-full border ${s.color}`}>{s.label}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-slate-400 text-xs">Litros</span><br /><span className="font-semibold">{r.status === 'ABASTECIDO' ? fmtLitros(r.quantidade_abastecida || 0) : fmtLitros(r.quantidade_autorizada)}</span></div>
              <div><span className="text-slate-400 text-xs">Combustível</span><br /><span className="font-semibold">{r.tipo_combustivel}</span></div>
              <div><span className="text-slate-400 text-xs">Veículo</span><br /><span className="font-mono font-semibold">{r.veiculo_placa}</span></div>
              <div><span className="text-slate-400 text-xs">Data</span><br /><span className="font-semibold">{fmtData(r.data_requisicao)}</span></div>
            </div>
            <p className="text-xs text-slate-500 truncate">{r.finalidade}</p>
            {r.status === 'AUTORIZADO' && tokenUrl && (
              <div className="flex gap-2 mt-1">
                <a href={tokenUrl} target="_blank" rel="noopener noreferrer"
                  className="flex-1 bg-green-600 text-white text-sm font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2">
                  <ExternalLink className="w-4 h-4" /> Ver Autorização
                </a>
                <button
                  onClick={() => compartilharWhatsApp(r.token_acesso!, r.codigo)}
                  className="flex-1 bg-[#25D366] text-white text-sm font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2"
                >
                  <Share2 className="w-4 h-4" /> WhatsApp
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  // ─── Aba: Perfil ──────────────────────────────────────────────────────────

  const tabPerfilContent = (
    <div className="pb-24 px-4 pt-4 space-y-4">
      <h2 className="text-base font-bold text-slate-800">PERFIL</h2>
      <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-orange-500 flex items-center justify-center text-white text-xl font-bold">
          {initials(credencial.nome)}
        </div>
        <div>
          <p className="font-bold text-slate-800">{credencial.nome}</p>
          {credencial.cargo && <p className="text-slate-500 text-sm">{credencial.cargo}</p>}
          <p className="text-slate-400 text-xs">{credencial.orgao_nome}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <p className="font-semibold text-slate-700 flex items-center gap-2"><Lock className="w-4 h-4" /> Alterar Senha</p>
        <input type="password" placeholder="Senha atual"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
          value={senhaForm.senhaAtual} onChange={e => setSenhaForm({ ...senhaForm, senhaAtual: e.target.value })} />
        <input type="password" placeholder="Nova senha"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
          value={senhaForm.novaSenha} onChange={e => setSenhaForm({ ...senhaForm, novaSenha: e.target.value })} />
        <input type="password" placeholder="Confirmar nova senha"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
          value={senhaForm.confirmar} onChange={e => setSenhaForm({ ...senhaForm, confirmar: e.target.value })} />
        {senhaMsg && <p className={`text-sm ${senhaMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{senhaMsg}</p>}
        <button onClick={handleAlterarSenha} disabled={senhaLoading || !senhaForm.senhaAtual || !senhaForm.novaSenha}
          className="w-full bg-slate-800 text-white font-semibold py-3 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
          {senhaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar Nova Senha'}
        </button>
      </div>

      <button onClick={handleLogout}
        className="w-full border border-red-200 text-red-500 font-semibold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-red-50">
        <LogOut className="w-4 h-4" /> Sair
      </button>
    </div>
  )

  // ─── Layout ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 max-w-md mx-auto relative">
      {tab === 'inicio' && tabInicioContent}
      {tab === 'combustivel' && tabCombustivelContent}
      {tab === 'pedidos' && tabPedidosContent}
      {tab === 'perfil' && tabPerfilContent}

      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-gray-200 flex z-50">
        {([
          { id: 'inicio', label: 'Início', icon: Home },
          { id: 'combustivel', label: 'Combustível', icon: Fuel },
          { id: 'pedidos', label: 'Pedidos', icon: ClipboardList },
          { id: 'perfil', label: 'Perfil', icon: User },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 flex flex-col items-center py-3 gap-0.5 text-xs font-medium transition-colors
              ${tab === id ? 'text-orange-500' : 'text-slate-400 hover:text-slate-600'}`}>
            <Icon className={`w-5 h-5 ${tab === id ? 'text-orange-500' : ''}`} />
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}

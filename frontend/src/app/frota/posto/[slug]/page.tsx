'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PostoInfo {
  nome: string
  orgao_nome: string
  orgao_id: string
}

interface RequisicaoVerificada {
  id: string
  codigo: string
  solicitante_nome: string
  solicitante_cargo: string
  veiculo_placa: string
  veiculo_modelo: string
  tipo_combustivel: string
  quantidade_autorizada: number
  finalidade: string
  status: string
  data_autorizacao: string
  autorizado_por: string
  token_acesso?: string
  orgao_id: string
}

type Tela = 'login' | 'verificar' | 'confirmando' | 'sucesso' | 'senha'

// ─── Constants ───────────────────────────────────────────────────────────────

const TOKEN_KEY = 'frota_posto_token'
const TIPO_COMBUSTIVEL_LABELS: Record<string, string> = {
  GASOLINA: 'Gasolina',
  ETANOL: 'Etanol',
  DIESEL: 'Diesel',
  DIESEL_S10: 'Diesel S10',
  GNV: 'GNV',
  FLEX: 'Flex',
  ELETRICO: 'Elétrico',
  HIBRIDO: 'Híbrido',
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDENTE: { label: 'Pendente', color: '#f59e0b' },
  AUTORIZADO: { label: 'Autorizado', color: '#10b981' },
  ABASTECIDO: { label: 'Abastecido', color: '#3b82f6' },
  NEGADO: { label: 'Negado', color: '#ef4444' },
  CANCELADO: { label: 'Cancelado', color: '#6b7280' },
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PostoPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const slug = params.slug as string

  // State
  const [tela, setTela] = useState<Tela>('login')
  const [postoInfo, setPostoInfo] = useState<PostoInfo | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  // Login
  const [senha, setSenha] = useState('')
  const [loginErro, setLoginErro] = useState('')
  const [loginCarregando, setLoginCarregando] = useState(false)

  // Verificação
  const [codigo, setCodigo] = useState('')
  const [requisicao, setRequisicao] = useState<RequisicaoVerificada | null>(null)
  const [verificandoCodigo, setVerificandoCodigo] = useState(false)
  const [erroVerificacao, setErroVerificacao] = useState('')

  // Confirmação de abastecimento
  const [qtdAbastecida, setQtdAbastecida] = useState('')
  const [kmHodometro, setKmHodometro] = useState('')
  const [atendenteNome, setAtendenteNome] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [confirmandoAbastecimento, setConfirmandoAbastecimento] = useState(false)
  const [erroConfirmacao, setErroConfirmacao] = useState('')

  // Troca de senha
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarNovaSenha, setConfirmarNovaSenha] = useState('')
  const [trocandoSenha, setTrocandoSenha] = useState(false)
  const [erroSenha, setErroSenha] = useState('')
  const [sucessoSenha, setSucessoSenha] = useState('')

  // ─── Utils ─────────────────────────────────────────────────────────────────

  const getToken = useCallback(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(TOKEN_KEY)
  }, [])

  const saveToken = useCallback((t: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, t)
    }
    setToken(t)
  }, [])

  const clearToken = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY)
    }
    setToken(null)
    setRequisicao(null)
    setCodigo('')
    setTela('login')
  }, [])

  const authHeaders = useCallback((t?: string | null) => {
    const tok = t ?? getToken()
    return {
      'Content-Type': 'application/json',
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
    }
  }, [getToken])

  // ─── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      setCarregando(true)
      // Busca info pública do posto
      try {
        const res = await fetch(`/api/frota-pub/posto/${slug}/info`)
        if (res.ok) {
          const data = await res.json()
          setPostoInfo(data)
        }
      } catch { /* ignore */ }

      // Verifica token salvo
      const savedToken = getToken()
      if (savedToken) {
        setToken(savedToken)
        setTela('verificar')
        // Verifica se token QR veio na URL
        const tokenQr = searchParams.get('token')
        if (tokenQr) {
          verificarTokenQr(tokenQr, savedToken)
        }
      }
      setCarregando(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  // ─── Verificar token QR (vindo da URL) ─────────────────────────────────────

  async function verificarTokenQr(tokenQr: string, authToken: string) {
    setVerificandoCodigo(true)
    setErroVerificacao('')
    try {
      const res = await fetch(`/api/frota-pub/req/${tokenQr}`, {
        headers: authHeaders(authToken),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setErroVerificacao(err.message || 'Requisição não encontrada ou inválida.')
        setRequisicao(null)
        setVerificandoCodigo(false)
        return
      }
      const data = await res.json()
      setRequisicao(data)
      setQtdAbastecida(data.quantidade_autorizada?.toString() || '')
    } catch {
      setErroVerificacao('Erro ao verificar requisição.')
    }
    setVerificandoCodigo(false)
  }

  // ─── Login ─────────────────────────────────────────────────────────────────

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
        setLoginCarregando(false)
        return
      }
      const data = await res.json()
      saveToken(data.access_token)
      setSenha('')
      setTela('verificar')

      // Verifica token QR da URL após login
      const tokenQr = searchParams.get('token')
      if (tokenQr) {
        verificarTokenQr(tokenQr, data.access_token)
      }
    } catch {
      setLoginErro('Erro ao conectar ao servidor.')
    }
    setLoginCarregando(false)
  }

  // ─── Verificar código manual ────────────────────────────────────────────────

  async function handleVerificarCodigo(e: React.FormEvent) {
    e.preventDefault()
    if (!codigo.trim()) return
    setVerificandoCodigo(true)
    setErroVerificacao('')
    setRequisicao(null)
    try {
      const res = await fetch(`/api/frota-pub/posto/verificar/${encodeURIComponent(codigo.trim())}`, {
        headers: authHeaders(),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (res.status === 401) { clearToken(); return }
        setErroVerificacao(err.message || 'Requisição não encontrada ou não autorizada.')
        setVerificandoCodigo(false)
        return
      }
      const data = await res.json()
      setRequisicao(data)
      setQtdAbastecida(data.quantidade_autorizada?.toString() || '')
    } catch {
      setErroVerificacao('Erro ao verificar código.')
    }
    setVerificandoCodigo(false)
  }

  // ─── Confirmar abastecimento ────────────────────────────────────────────────

  async function handleConfirmar(e: React.FormEvent) {
    e.preventDefault()
    if (!requisicao) return
    if (!qtdAbastecida || isNaN(parseFloat(qtdAbastecida)) || parseFloat(qtdAbastecida) <= 0) {
      setErroConfirmacao('Informe a quantidade abastecida.')
      return
    }
    setConfirmandoAbastecimento(true)
    setErroConfirmacao('')
    try {
      const res = await fetch(`/api/frota-pub/posto/confirmar/${requisicao.id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          quantidade_abastecida: parseFloat(qtdAbastecida),
          km_hodometro: kmHodometro ? parseFloat(kmHodometro) : undefined,
          atendente_nome: atendenteNome || undefined,
          observacoes: observacoes || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (res.status === 401) { clearToken(); return }
        setErroConfirmacao(err.message || 'Erro ao confirmar abastecimento.')
        setConfirmandoAbastecimento(false)
        return
      }
      setTela('sucesso')
    } catch {
      setErroConfirmacao('Erro ao conectar ao servidor.')
    }
    setConfirmandoAbastecimento(false)
  }

  // ─── Troca de senha ─────────────────────────────────────────────────────────

  async function handleTrocarSenha(e: React.FormEvent) {
    e.preventDefault()
    setErroSenha('')
    setSucessoSenha('')
    if (novaSenha !== confirmarNovaSenha) {
      setErroSenha('A nova senha e a confirmação não coincidem.')
      return
    }
    if (novaSenha.length < 6) {
      setErroSenha('A nova senha deve ter pelo menos 6 caracteres.')
      return
    }
    setTrocandoSenha(true)
    try {
      const res = await fetch('/api/frota-pub/posto/senha', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ senha_atual: senhaAtual, nova_senha: novaSenha }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (res.status === 401) { clearToken(); return }
        setErroSenha(err.message || 'Erro ao trocar senha.')
        setTrocandoSenha(false)
        return
      }
      setSucessoSenha('Senha alterada com sucesso!')
      setSenhaAtual('')
      setNovaSenha('')
      setConfirmarNovaSenha('')
    } catch {
      setErroSenha('Erro ao conectar ao servidor.')
    }
    setTrocandoSenha(false)
  }

  // ─── Novo abastecimento ─────────────────────────────────────────────────────

  function handleNovoAbastecimento() {
    setRequisicao(null)
    setCodigo('')
    setQtdAbastecida('')
    setKmHodometro('')
    setAtendenteNome('')
    setObservacoes('')
    setErroVerificacao('')
    setErroConfirmacao('')
    setTela('verificar')
  }

  // ─── Render helpers ─────────────────────────────────────────────────────────

  function fmtData(d: string) {
    if (!d) return '-'
    return new Date(d).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  function fmtLitros(n: number) {
    return n?.toFixed(3).replace('.', ',') + ' L'
  }

  if (carregando) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f172a',
        color: '#94a3b8',
        fontFamily: 'system-ui, sans-serif',
      }}>
        Carregando...
      </div>
    )
  }

  // ─── Tela: Login ───────────────────────────────────────────────────────────

  if (tela === 'login') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '1rem',
      }}>
        <div style={{
          width: '100%',
          maxWidth: '400px',
          background: '#1e293b',
          borderRadius: '16px',
          padding: '2rem',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
          border: '1px solid #334155',
        }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              width: '64px',
              height: '64px',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              borderRadius: '16px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem',
              marginBottom: '1rem',
            }}>⛽</div>
            <h1 style={{ color: '#f8fafc', fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
              {postoInfo?.nome || 'Painel do Posto'}
            </h1>
            {postoInfo?.orgao_nome && (
              <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: '0.25rem 0 0' }}>
                {postoInfo.orgao_nome}
              </p>
            )}
          </div>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 500 }}>
                Senha de acesso
              </label>
              <input
                type="password"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                placeholder="Digite sua senha"
                required
                autoFocus
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '1rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {loginErro && (
              <div style={{
                background: '#450a0a',
                border: '1px solid #7f1d1d',
                borderRadius: '8px',
                padding: '0.75rem',
                color: '#fca5a5',
                fontSize: '0.875rem',
                marginBottom: '1rem',
              }}>
                {loginErro}
              </div>
            )}

            <button
              type="submit"
              disabled={loginCarregando}
              style={{
                width: '100%',
                padding: '0.875rem',
                background: loginCarregando ? '#64748b' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: loginCarregando ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {loginCarregando ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <p style={{
            textAlign: 'center',
            color: '#475569',
            fontSize: '0.75rem',
            marginTop: '1.5rem',
          }}>
            Acesso restrito. Todos os acessos são registrados.
          </p>
        </div>
      </div>
    )
  }

  // ─── Tela: Troca de Senha ──────────────────────────────────────────────────

  if (tela === 'senha') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '1rem',
      }}>
        <div style={{
          width: '100%',
          maxWidth: '400px',
          background: '#1e293b',
          borderRadius: '16px',
          padding: '2rem',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
          border: '1px solid #334155',
        }}>
          <button
            onClick={() => setTela('verificar')}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '0.875rem',
              marginBottom: '1.5rem',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            ← Voltar
          </button>

          <h2 style={{ color: '#f8fafc', fontSize: '1.25rem', fontWeight: 700, margin: '0 0 1.5rem' }}>
            Alterar Senha
          </h2>

          <form onSubmit={handleTrocarSenha}>
            {[
              { label: 'Senha atual', value: senhaAtual, onChange: setSenhaAtual },
              { label: 'Nova senha', value: novaSenha, onChange: setNovaSenha },
              { label: 'Confirmar nova senha', value: confirmarNovaSenha, onChange: setConfirmarNovaSenha },
            ].map(({ label, value, onChange }) => (
              <div key={label} style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', color: '#cbd5e1', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 500 }}>
                  {label}
                </label>
                <input
                  type="password"
                  value={value}
                  onChange={e => onChange(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '1rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            ))}

            {erroSenha && (
              <div style={{
                background: '#450a0a',
                border: '1px solid #7f1d1d',
                borderRadius: '8px',
                padding: '0.75rem',
                color: '#fca5a5',
                fontSize: '0.875rem',
                marginBottom: '1rem',
              }}>
                {erroSenha}
              </div>
            )}
            {sucessoSenha && (
              <div style={{
                background: '#052e16',
                border: '1px solid #14532d',
                borderRadius: '8px',
                padding: '0.75rem',
                color: '#86efac',
                fontSize: '0.875rem',
                marginBottom: '1rem',
              }}>
                {sucessoSenha}
              </div>
            )}

            <button
              type="submit"
              disabled={trocandoSenha}
              style={{
                width: '100%',
                padding: '0.875rem',
                background: trocandoSenha ? '#64748b' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: trocandoSenha ? 'not-allowed' : 'pointer',
              }}
            >
              {trocandoSenha ? 'Salvando...' : 'Salvar nova senha'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ─── Tela: Sucesso ─────────────────────────────────────────────────────────

  if (tela === 'sucesso') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '1rem',
      }}>
        <div style={{
          width: '100%',
          maxWidth: '400px',
          background: '#1e293b',
          borderRadius: '16px',
          padding: '2.5rem 2rem',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
          border: '1px solid #334155',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✅</div>
          <h2 style={{ color: '#22c55e', fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
            Abastecimento Confirmado!
          </h2>
          {requisicao && (
            <div style={{ marginBottom: '1.5rem' }}>
              <p style={{ color: '#94a3b8', margin: '0.25rem 0' }}>
                Código: <strong style={{ color: '#f8fafc' }}>{requisicao.codigo}</strong>
              </p>
              <p style={{ color: '#94a3b8', margin: '0.25rem 0' }}>
                Veículo: <strong style={{ color: '#f8fafc' }}>{requisicao.veiculo_placa}</strong>
              </p>
              <p style={{ color: '#94a3b8', margin: '0.25rem 0' }}>
                Solicitante: <strong style={{ color: '#f8fafc' }}>{requisicao.solicitante_nome}</strong>
              </p>
              <p style={{ color: '#94a3b8', margin: '0.25rem 0' }}>
                Quantidade: <strong style={{ color: '#f8fafc' }}>{fmtLitros(parseFloat(qtdAbastecida) || 0)}</strong>
              </p>
            </div>
          )}
          <button
            onClick={handleNovoAbastecimento}
            style={{
              padding: '0.875rem 2rem',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Novo Abastecimento
          </button>
        </div>
      </div>
    )
  }

  // ─── Tela: Verificar / Confirmar ──────────────────────────────────────────

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f172a',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#f8fafc',
    }}>
      {/* Header */}
      <div style={{
        background: '#1e293b',
        borderBottom: '1px solid #334155',
        padding: '1rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.5rem' }}>⛽</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>
              {postoInfo?.nome || 'Painel do Posto'}
            </div>
            {postoInfo?.orgao_nome && (
              <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{postoInfo.orgao_nome}</div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => { setTela('senha'); setErroSenha(''); setSucessoSenha('') }}
            title="Alterar senha"
            style={{
              background: '#334155',
              border: 'none',
              borderRadius: '8px',
              padding: '0.5rem',
              cursor: 'pointer',
              color: '#94a3b8',
              fontSize: '1rem',
            }}
          >
            🔑
          </button>
          <button
            onClick={clearToken}
            title="Sair"
            style={{
              background: '#334155',
              border: 'none',
              borderRadius: '8px',
              padding: '0.5rem 0.75rem',
              cursor: 'pointer',
              color: '#94a3b8',
              fontSize: '0.875rem',
            }}
          >
            Sair
          </button>
        </div>
      </div>

      <div style={{ padding: '1.5rem', maxWidth: '600px', margin: '0 auto' }}>
        {/* Verificar código */}
        {!requisicao && (
          <>
            <div style={{
              background: '#1e293b',
              borderRadius: '16px',
              padding: '1.5rem',
              border: '1px solid #334155',
              marginBottom: '1.5rem',
            }}>
              <h2 style={{ margin: '0 0 1rem', color: '#f8fafc', fontSize: '1.125rem', fontWeight: 700 }}>
                Verificar Autorização
              </h2>
              <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: '0 0 1.25rem' }}>
                Digite o código da autorização ou escaneie o QR Code para verificar e confirmar um abastecimento.
              </p>

              <form onSubmit={handleVerificarCodigo}>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <input
                    type="text"
                    value={codigo}
                    onChange={e => setCodigo(e.target.value.toUpperCase())}
                    placeholder="REQ-2025-0001"
                    style={{
                      flex: 1,
                      padding: '0.875rem 1rem',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      fontSize: '1rem',
                      outline: 'none',
                      fontFamily: 'monospace',
                      letterSpacing: '0.1em',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={verificandoCodigo || !codigo.trim()}
                    style={{
                      padding: '0.875rem 1.25rem',
                      background: verificandoCodigo || !codigo.trim() ? '#334155' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                      border: 'none',
                      borderRadius: '8px',
                      color: verificandoCodigo || !codigo.trim() ? '#64748b' : '#fff',
                      fontSize: '1rem',
                      fontWeight: 600,
                      cursor: verificandoCodigo || !codigo.trim() ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {verificandoCodigo ? '...' : 'Verificar'}
                  </button>
                </div>
              </form>

              {erroVerificacao && (
                <div style={{
                  background: '#450a0a',
                  border: '1px solid #7f1d1d',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  color: '#fca5a5',
                  fontSize: '0.875rem',
                  marginTop: '1rem',
                }}>
                  {erroVerificacao}
                </div>
              )}
            </div>

            {/* Info sobre QR */}
            <div style={{
              background: '#1e293b',
              borderRadius: '16px',
              padding: '1.5rem',
              border: '1px solid #334155',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>📱</div>
              <h3 style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
                QR Code
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0 }}>
                Peça ao motorista para apresentar o QR Code da autorização no celular. Escaneie para verificar automaticamente.
              </p>
            </div>
          </>
        )}

        {/* Requisição verificada */}
        {requisicao && (
          <div>
            {/* Status badge */}
            <div style={{
              background: '#1e293b',
              borderRadius: '16px',
              padding: '1.5rem',
              border: `2px solid ${STATUS_LABELS[requisicao.status]?.color || '#334155'}`,
              marginBottom: '1.5rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '1.125rem', fontWeight: 700 }}>
                  Autorização Verificada
                </h2>
                <span style={{
                  background: STATUS_LABELS[requisicao.status]?.color + '22',
                  color: STATUS_LABELS[requisicao.status]?.color,
                  padding: '0.25rem 0.75rem',
                  borderRadius: '20px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: `1px solid ${STATUS_LABELS[requisicao.status]?.color}44`,
                }}>
                  {STATUS_LABELS[requisicao.status]?.label || requisicao.status}
                </span>
              </div>

              <div style={{
                fontFamily: 'monospace',
                fontSize: '1.5rem',
                fontWeight: 700,
                color: '#f59e0b',
                letterSpacing: '0.1em',
                marginBottom: '1.25rem',
              }}>
                {requisicao.codigo}
              </div>

              {/* Detalhes grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.75rem',
                marginBottom: '1rem',
              }}>
                {[
                  { label: 'Solicitante', value: requisicao.solicitante_nome },
                  { label: 'Cargo', value: requisicao.solicitante_cargo },
                  { label: 'Placa', value: requisicao.veiculo_placa },
                  { label: 'Veículo', value: requisicao.veiculo_modelo },
                  { label: 'Combustível', value: TIPO_COMBUSTIVEL_LABELS[requisicao.tipo_combustivel] || requisicao.tipo_combustivel },
                  { label: 'Qtd. Autorizada', value: fmtLitros(requisicao.quantidade_autorizada) },
                  { label: 'Autorizado por', value: requisicao.autorizado_por },
                  { label: 'Data autorização', value: fmtData(requisicao.data_autorizacao) },
                ].map(({ label, value }) => (
                  <div key={label} style={{
                    background: '#0f172a',
                    borderRadius: '8px',
                    padding: '0.75rem',
                  }}>
                    <div style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {label}
                    </div>
                    <div style={{ color: '#f8fafc', fontSize: '0.9rem', fontWeight: 500, marginTop: '0.25rem' }}>
                      {value || '-'}
                    </div>
                  </div>
                ))}
              </div>

              {requisicao.finalidade && (
                <div style={{
                  background: '#0f172a',
                  borderRadius: '8px',
                  padding: '0.75rem',
                }}>
                  <div style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Finalidade
                  </div>
                  <div style={{ color: '#f8fafc', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                    {requisicao.finalidade}
                  </div>
                </div>
              )}

              {/* Botão cancelar */}
              <button
                onClick={() => {
                  setRequisicao(null)
                  setCodigo('')
                  setErroVerificacao('')
                  setErroConfirmacao('')
                }}
                style={{
                  marginTop: '1rem',
                  background: 'none',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  padding: '0.5rem 1rem',
                  color: '#94a3b8',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                ← Verificar outro código
              </button>
            </div>

            {/* Formulário de confirmação (apenas se AUTORIZADO) */}
            {requisicao.status === 'AUTORIZADO' && (
              <div style={{
                background: '#1e293b',
                borderRadius: '16px',
                padding: '1.5rem',
                border: '1px solid #334155',
              }}>
                <h3 style={{ margin: '0 0 1.25rem', color: '#f8fafc', fontSize: '1.125rem', fontWeight: 700 }}>
                  Confirmar Abastecimento
                </h3>

                <form onSubmit={handleConfirmar}>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', color: '#cbd5e1', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 500 }}>
                      Quantidade abastecida (L) *
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      max={requisicao.quantidade_autorizada * 1.1}
                      value={qtdAbastecida}
                      onChange={e => setQtdAbastecida(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        color: '#f8fafc',
                        fontSize: '1rem',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                      Autorizado: {fmtLitros(requisicao.quantidade_autorizada)}
                    </div>
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', color: '#cbd5e1', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 500 }}>
                      KM do hodômetro
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={kmHodometro}
                      onChange={e => setKmHodometro(e.target.value)}
                      placeholder="Ex: 45200"
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        color: '#f8fafc',
                        fontSize: '1rem',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', color: '#cbd5e1', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 500 }}>
                      Nome do atendente
                    </label>
                    <input
                      type="text"
                      value={atendenteNome}
                      onChange={e => setAtendenteNome(e.target.value)}
                      placeholder="Ex: João Silva"
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        color: '#f8fafc',
                        fontSize: '1rem',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', color: '#cbd5e1', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 500 }}>
                      Observações
                    </label>
                    <textarea
                      value={observacoes}
                      onChange={e => setObservacoes(e.target.value)}
                      placeholder="Observações opcionais..."
                      rows={2}
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        color: '#f8fafc',
                        fontSize: '1rem',
                        outline: 'none',
                        boxSizing: 'border-box',
                        resize: 'vertical',
                      }}
                    />
                  </div>

                  {erroConfirmacao && (
                    <div style={{
                      background: '#450a0a',
                      border: '1px solid #7f1d1d',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      color: '#fca5a5',
                      fontSize: '0.875rem',
                      marginBottom: '1rem',
                    }}>
                      {erroConfirmacao}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={confirmandoAbastecimento}
                    style={{
                      width: '100%',
                      padding: '1rem',
                      background: confirmandoAbastecimento ? '#334155' : 'linear-gradient(135deg, #22c55e, #16a34a)',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '1.125rem',
                      fontWeight: 700,
                      cursor: confirmandoAbastecimento ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {confirmandoAbastecimento ? 'Confirmando...' : '✅ Confirmar Abastecimento'}
                  </button>
                </form>
              </div>
            )}

            {/* Abastecido ou não autorizado */}
            {requisicao.status !== 'AUTORIZADO' && (
              <div style={{
                background: '#1e293b',
                borderRadius: '16px',
                padding: '1.5rem',
                border: '1px solid #334155',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
                  {requisicao.status === 'ABASTECIDO' ? '✅' : '⚠️'}
                </div>
                <p style={{ color: '#94a3b8', margin: 0 }}>
                  {requisicao.status === 'ABASTECIDO'
                    ? 'Esta autorização já foi utilizada para abastecimento.'
                    : `Esta autorização não pode ser utilizada (status: ${STATUS_LABELS[requisicao.status]?.label || requisicao.status}).`}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

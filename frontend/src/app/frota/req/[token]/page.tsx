'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { API_URL } from '@/lib/api'

// ─── Types ───────────────────────────────────────────────────────────────────

interface RequisicaoPublica {
  id: string
  codigo: string
  codigo_posto?: string
  solicitante_nome: string
  solicitante_cargo: string
  veiculo_placa: string
  veiculo_modelo: string
  veiculo_chassi?: string
  veiculo_renavam?: string
  tipo_combustivel: string
  quantidade_autorizada: number
  finalidade: string
  status: string
  data_requisicao: string
  data_autorizacao: string
  token_expiry?: string
  autorizado_por: string
  orgao_id: string
  orgao_nome?: string
  orgao_logo?: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const POSTO_TOKEN_KEY = 'frota_posto_token'

const TIPO_COMBUSTIVEL_LABELS: Record<string, string> = {
  GASOLINA: 'Gasolina', ETANOL: 'Etanol', DIESEL: 'Diesel',
  DIESEL_S10: 'Diesel S10', GNV: 'GNV', FLEX: 'Flex',
  ELETRICO: 'Elétrico', HIBRIDO: 'Híbrido',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDataHora(d: string) {
  if (!d) return '-'
  return new Date(d).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtData(d: string) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('pt-BR')
}

function fmtLitros(n: number | string | undefined) {
  return (parseFloat(n as any) || 0).toFixed(3).replace('.', ',') + ' L'
}

function getQrUrl(token: string, origin: string) {
  const url = `${origin}/frota/req/${token}`
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=10&data=${encodeURIComponent(url)}`
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ReqTokenPage() {
  const params = useParams()
  const token = params.token as string

  const [requisicao, setRequisicao] = useState<RequisicaoPublica | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [postoToken, setPostoToken] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')

  // Confirmação
  const [confirmando, setConfirmando] = useState(false)
  const [qtdAbastecida, setQtdAbastecida] = useState('')
  const [kmHodometro, setKmHodometro] = useState('')
  const [atendenteNome, setAtendenteNome] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [erroConfirmacao, setErroConfirmacao] = useState('')
  const [confirmado, setConfirmado] = useState(false)
  const [mostrandoFormConfirmacao, setMostrandoFormConfirmacao] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    setOrigin(window.location.origin)
    const pt = localStorage.getItem(POSTO_TOKEN_KEY)
    setPostoToken(pt)

    async function carregar() {
      setCarregando(true)
      setErro('')
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 35000)
      try {
        const base = (typeof window !== 'undefined' ? API_URL : '') || ''
        const url = base ? `${base.replace(/\/$/, '')}/api/frota-pub/req/${token}` : `/api/frota-pub/req/${token}`
        const res = await fetch(url, { signal: controller.signal })
        clearTimeout(timeoutId)
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          setErro(err.message || 'Requisição não encontrada ou token inválido.')
          setCarregando(false)
          return
        }
        const data = await res.json()
        setRequisicao(data)
        setQtdAbastecida(parseFloat(data.quantidade_autorizada) > 0 ? String(parseFloat(data.quantidade_autorizada)) : '')
      } catch (e) {
        clearTimeout(timeoutId)
        if ((e as Error).name === 'AbortError') {
          setErro('A requisição demorou muito. Verifique sua conexão e tente novamente.')
        } else {
          setErro('Erro ao carregar requisição. Verifique sua conexão.')
        }
      }
      setCarregando(false)
    }
    carregar()
  }, [token, retryKey])

  async function handleConfirmar(e: React.FormEvent) {
    e.preventDefault()
    if (!requisicao || !postoToken) return
    if (!qtdAbastecida || parseFloat(qtdAbastecida) <= 0) {
      setErroConfirmacao('Informe a quantidade abastecida.')
      return
    }
    setConfirmando(true)
    setErroConfirmacao('')
    try {
      const res = await fetch(`/api/frota-pub/req/${token}/confirmar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${postoToken}` },
        body: JSON.stringify({
          quantidade_abastecida: parseFloat(qtdAbastecida),
          km_hodometro: kmHodometro ? parseFloat(kmHodometro) : undefined,
          atendente_nome: atendenteNome || undefined,
          observacoes: observacoes || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setErroConfirmacao(err.message || 'Erro ao confirmar abastecimento.')
        setConfirmando(false)
        return
      }
      setConfirmado(true)
    } catch {
      setErroConfirmacao('Erro ao conectar ao servidor.')
    }
    setConfirmando(false)
  }

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (carregando) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center', color: '#64748b' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⛽</div>
          Carregando autorização...
        </div>
      </div>
    )
  }

  // ─── Erro ──────────────────────────────────────────────────────────────────

  if (erro || !requisicao) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: '1rem' }}>
        <div style={{ maxWidth: '400px', width: '100%', background: '#1e293b', borderRadius: '16px', padding: '2rem', border: '1px solid #7f1d1d', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
          <h2 style={{ color: '#ef4444', fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem' }}>Autorização Inválida</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0 }}>
            {erro || 'Esta autorização não foi encontrada ou o QR Code é inválido.'}
          </p>
          <button
            onClick={() => setRetryKey(k => k + 1)}
            style={{ marginTop: '1.25rem', padding: '0.625rem 1.25rem', background: '#f97316', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  // ─── Confirmado ────────────────────────────────────────────────────────────

  if (confirmado) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: '1rem' }}>
        <div style={{ maxWidth: '400px', width: '100%', background: '#1e293b', borderRadius: '16px', padding: '2.5rem 2rem', border: '2px solid #22c55e', textAlign: 'center' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✅</div>
          <h2 style={{ color: '#22c55e', fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem' }}>Abastecimento Confirmado!</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: '0 0 1.5rem' }}>
            Código: <strong style={{ color: '#f8fafc', fontFamily: 'monospace' }}>{requisicao.codigo}</strong>
          </p>
          <p style={{ color: '#64748b', fontSize: '0.75rem', margin: 0 }}>Registro salvo com sucesso.</p>
        </div>
      </div>
    )
  }

  const isAutorizado = requisicao.status === 'AUTORIZADO'
  const isAbastecido = requisicao.status === 'ABASTECIDO'

  // ─── Ordem de Fornecimento ─────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1e293b', overflowX: 'hidden', padding: '0 0.5rem', boxSizing: 'border-box' }}>

      {/* Ações (ocultas na impressão) */}
      <div className="no-print" style={{ background: '#1e293b', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#94a3b8', fontSize: '0.875rem' }}>
          <span>⛽</span>
          <span>Ordem de Fornecimento de Combustível</span>
          <span style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>· {requisicao.codigo}</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => window.print()}
            style={{ padding: '0.5rem 1.25rem', background: '#3b82f6', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
          >
            🖨️ Imprimir / Salvar PDF
          </button>
          {isAutorizado && postoToken && !mostrandoFormConfirmacao && (
            <button
              onClick={() => setMostrandoFormConfirmacao(true)}
              style={{ padding: '0.5rem 1.25rem', background: '#22c55e', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
            >
              ⛽ Confirmar Abastecimento
            </button>
          )}
        </div>
      </div>

      {/* Documento principal */}
      <div className="doc-container" style={{ maxWidth: '760px', width: '100%', margin: '1.5rem auto', padding: '0 0.75rem', boxSizing: 'border-box', background: '#fff', borderRadius: '12px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', overflow: 'hidden' }}>

        {/* Cabeçalho */}
        <div className="doc-header" style={{ borderBottom: '3px solid #f97316', padding: '1.5rem 1rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem' }}>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            {requisicao.orgao_nome && (
              <p style={{ margin: '0 0 0.25rem', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {requisicao.orgao_nome}
              </p>
            )}
            <h1 style={{ margin: 0, fontSize: 'clamp(1rem, 4vw, 1.2rem)', fontWeight: 800, color: '#1e293b', lineHeight: 1.2 }}>
              ORDEM DE FORNECIMENTO<br />
              <span style={{ color: '#f97316' }}>DE COMBUSTÍVEL</span>
            </h1>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ margin: '0 0 0.25rem', fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>{requisicao.codigo}</p>
            <p style={{ margin: '0 0 0.1rem', fontSize: '0.75rem', color: '#64748b' }}>Emitido em: {fmtDataHora(requisicao.data_autorizacao)}</p>
            {requisicao.token_expiry && (
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 }}>
                Válido até: {fmtData(requisicao.token_expiry)}
              </p>
            )}
          </div>
        </div>

        {/* Status banner */}
        {isAbastecido ? (
          <div style={{ background: '#dcfce7', borderBottom: '1px solid #bbf7d0', padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#166534', fontSize: '0.875rem', fontWeight: 600 }}>
            ✅ AUTORIZAÇÃO UTILIZADA — Abastecimento confirmado
          </div>
        ) : !isAutorizado ? (
          <div style={{ background: '#fef3c7', borderBottom: '1px solid #fde68a', padding: '0.6rem 1rem', color: '#92400e', fontSize: '0.875rem', fontWeight: 600 }}>
            ⚠️ Status: {requisicao.status}
          </div>
        ) : null}

        <div className="doc-body" style={{ padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '2rem', alignItems: 'stretch' }}>

          {/* Dados da ordem */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0 }}>

            {/* Solicitante */}
            <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '1rem', border: '1px solid #e2e8f0' }}>
              <p style={{ margin: '0 0 0.6rem', fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Solicitante
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <Field label="Nome" value={requisicao.solicitante_nome} />
                <Field label="Cargo" value={requisicao.solicitante_cargo} />
              </div>
            </div>

            {/* Veículo */}
            <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '1rem', border: '1px solid #e2e8f0' }}>
              <p style={{ margin: '0 0 0.6rem', fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Veículo
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <Field label="Placa" value={requisicao.veiculo_placa} mono />
                <Field label="Modelo" value={requisicao.veiculo_modelo || '-'} />
                {requisicao.veiculo_chassi && <Field label="Chassi" value={requisicao.veiculo_chassi} mono />}
                {requisicao.veiculo_renavam && <Field label="Renavam" value={requisicao.veiculo_renavam} mono />}
              </div>
            </div>

            {/* Combustível */}
            <div style={{ background: '#fff7ed', borderRadius: '10px', padding: '1rem', border: '1px solid #fed7aa' }}>
              <p style={{ margin: '0 0 0.6rem', fontSize: '0.7rem', fontWeight: 700, color: '#ea580c', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Combustível Autorizado
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <Field label="Tipo" value={TIPO_COMBUSTIVEL_LABELS[requisicao.tipo_combustivel] || requisicao.tipo_combustivel} />
                <Field label="Quantidade" value={fmtLitros(requisicao.quantidade_autorizada)} highlight />
              </div>
              {requisicao.finalidade && (
                <div style={{ marginTop: '0.5rem' }}>
                  <Field label="Finalidade / Destino" value={requisicao.finalidade} />
                </div>
              )}
            </div>

            {/* Autorização */}
            <div style={{ background: '#f0fdf4', borderRadius: '10px', padding: '1rem', border: '1px solid #bbf7d0' }}>
              <p style={{ margin: '0 0 0.6rem', fontSize: '0.7rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Autorização
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <Field label="Autorizado por" value={requisicao.autorizado_por || '-'} />
                <Field label="Data de autorização" value={fmtDataHora(requisicao.data_autorizacao)} />
                <Field label="Data da solicitação" value={fmtDataHora(requisicao.data_requisicao)} />
              </div>
            </div>

          </div>

          {/* QR Code + código postal */}
          <div className="doc-qr-section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', minWidth: 0, width: '100%' }}>
            {isAutorizado && origin && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getQrUrl(token, origin)}
                  alt="QR Code de verificação"
                  style={{ width: 200, height: 200, maxWidth: '100%', border: '3px solid #e2e8f0', borderRadius: '12px', background: '#fff' }}
                />
                <p style={{ margin: 0, fontSize: '0.65rem', color: '#94a3b8', textAlign: 'center', maxWidth: '220px' }}>
                  Escaneie para verificar autenticidade
                </p>
              </>
            )}
            {requisicao.codigo_posto && (
              <div style={{ border: '2px solid #f97316', borderRadius: '12px', padding: '0.75rem 1.25rem', textAlign: 'center', background: '#fff7ed', width: '100%', maxWidth: '220px', boxSizing: 'border-box' }}>
                <p style={{ margin: '0 0 0.25rem', fontSize: '0.65rem', fontWeight: 700, color: '#ea580c', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Código do Atendente
                </p>
                <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '1.75rem', fontWeight: 800, color: '#1e293b', letterSpacing: '0.2em', wordBreak: 'break-all' }}>
                  {requisicao.codigo_posto}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Rodapé */}
        <div style={{ borderTop: '1px solid #e2e8f0', padding: '1rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', background: '#f8fafc' }}>
          <p style={{ margin: 0, fontSize: '0.7rem', color: '#94a3b8' }}>
            🔒 Documento verificado digitalmente · Portal DCP
          </p>
          <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.65rem', color: '#cbd5e1' }}>
            {requisicao.id.slice(0, 8).toUpperCase()}
          </p>
        </div>
      </div>

      {/* Formulário de confirmação (apenas para posto autenticado) */}
      {isAutorizado && postoToken && mostrandoFormConfirmacao && (
        <div className="no-print form-confirm" style={{ maxWidth: '760px', width: '100%', margin: '0 auto 2rem', padding: '1.5rem 1rem', boxSizing: 'border-box', background: '#fff', borderRadius: '12px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: '2px solid #22c55e' }}>
          <h3 style={{ color: '#15803d', margin: '0 0 1.25rem', fontWeight: 700 }}>⛽ Confirmar Abastecimento</h3>
          <form onSubmit={handleConfirmar}>
            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', color: '#374151', fontSize: '0.875rem', marginBottom: '0.4rem', fontWeight: 500 }}>
                  Quantidade abastecida (L) *
                </label>
                <input type="number" step="0.001" min="0.001" value={qtdAbastecida}
                  onChange={e => setQtdAbastecida(e.target.value)} required
                  style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
                <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  Autorizado: {fmtLitros(requisicao.quantidade_autorizada)}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', color: '#374151', fontSize: '0.875rem', marginBottom: '0.4rem', fontWeight: 500 }}>KM do hodômetro</label>
                <input type="number" step="1" min="0" value={kmHodometro}
                  onChange={e => setKmHodometro(e.target.value)} placeholder="Ex: 45200"
                  style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', color: '#374151', fontSize: '0.875rem', marginBottom: '0.4rem', fontWeight: 500 }}>Atendente</label>
                <input type="text" value={atendenteNome} onChange={e => setAtendenteNome(e.target.value)} placeholder="Nome do atendente"
                  style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', color: '#374151', fontSize: '0.875rem', marginBottom: '0.4rem', fontWeight: 500 }}>Observações</label>
                <input type="text" value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Opcional"
                  style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            {erroConfirmacao && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.75rem', color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' }}>
                {erroConfirmacao}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" onClick={() => setMostrandoFormConfirmacao(false)}
                style={{ flex: 1, padding: '0.75rem', background: 'none', border: '1px solid #d1d5db', borderRadius: '8px', color: '#6b7280', fontSize: '0.875rem', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button type="submit" disabled={confirmando}
                style={{ flex: 2, padding: '0.75rem', background: confirmando ? '#d1fae5' : '#22c55e', border: 'none', borderRadius: '8px', color: confirmando ? '#15803d' : '#fff', fontSize: '1rem', fontWeight: 700, cursor: confirmando ? 'not-allowed' : 'pointer' }}>
                {confirmando ? 'Confirmando...' : '✅ Confirmar Abastecimento'}
              </button>
            </div>
          </form>
        </div>
      )}

      <style>{`
        .doc-container { box-sizing: border-box; }
        @media (min-width: 640px) {
          .doc-body { flex-direction: row !important; }
          .doc-body > div:first-child { flex: 1; min-width: 0; }
          .doc-qr-section { width: auto !important; min-width: 200px; }
          .form-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (min-width: 760px) {
          .doc-container { padding-left: 2rem !important; padding-right: 2rem !important; }
          .doc-header { padding-left: 2rem !important; padding-right: 2rem !important; }
          .doc-body { padding: 1.5rem 2rem !important; }
          .form-confirm { padding: 1.5rem 2rem !important; }
        }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          div[style*="background: #f1f5f9"] { background: white !important; }
        }
        @page { margin: 1cm; }
      `}</style>
    </div>
  )
}

// ─── Field helper ─────────────────────────────────────────────────────────────

function Field({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div>
      <p style={{ margin: '0 0 0.15rem', fontSize: '0.65rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </p>
      <p style={{
        margin: 0,
        fontSize: highlight ? '1.1rem' : '0.9rem',
        fontWeight: highlight ? 700 : 500,
        color: highlight ? '#f97316' : '#1e293b',
        fontFamily: mono ? 'monospace' : 'inherit',
      }}>
        {value}
      </p>
    </div>
  )
}

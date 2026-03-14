'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

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
  autorizado_por: string
  orgao_id: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const POSTO_TOKEN_KEY = 'frota_posto_token'

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

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  PENDENTE:   { label: 'Pendente',   color: '#f59e0b', bg: '#451a03', icon: '⏳' },
  AUTORIZADO: { label: 'Autorizado', color: '#22c55e', bg: '#052e16', icon: '✅' },
  ABASTECIDO: { label: 'Abastecido', color: '#3b82f6', bg: '#172554', icon: '⛽' },
  NEGADO:     { label: 'Negado',     color: '#ef4444', bg: '#450a0a', icon: '❌' },
  CANCELADO:  { label: 'Cancelado',  color: '#6b7280', bg: '#1c1c1c', icon: '🚫' },
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ReqTokenPage() {
  const params = useParams()
  const token = params.token as string

  const [requisicao, setRequisicao] = useState<RequisicaoPublica | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [postoToken, setPostoToken] = useState<string | null>(null)

  // Confirmação
  const [confirmando, setConfirmando] = useState(false)
  const [qtdAbastecida, setQtdAbastecida] = useState('')
  const [kmHodometro, setKmHodometro] = useState('')
  const [atendenteNome, setAtendenteNome] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [erroConfirmacao, setErroConfirmacao] = useState('')
  const [confirmado, setConfirmado] = useState(false)
  const [mostrandoFormConfirmacao, setMostrandoFormConfirmacao] = useState(false)

  useEffect(() => {
    // Verifica se há token do posto no localStorage
    const pt = typeof window !== 'undefined' ? localStorage.getItem(POSTO_TOKEN_KEY) : null
    setPostoToken(pt)

    async function carregar() {
      setCarregando(true)
      try {
        const res = await fetch(`/api/frota-pub/req/${token}`)
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          setErro(err.message || 'Requisição não encontrada ou token inválido.')
          setCarregando(false)
          return
        }
        const data = await res.json()
        setRequisicao(data)
        setQtdAbastecida(data.quantidade_autorizada?.toString() || '')
      } catch {
        setErro('Erro ao carregar requisição.')
      }
      setCarregando(false)
    }
    carregar()
  }, [token])

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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${postoToken}`,
        },
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

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (carregando) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0f172a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#94a3b8',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⛽</div>
          Verificando autorização...
        </div>
      </div>
    )
  }

  // ─── Erro ─────────────────────────────────────────────────────────────────

  if (erro || !requisicao) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0f172a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
        padding: '1rem',
      }}>
        <div style={{
          maxWidth: '400px',
          width: '100%',
          background: '#1e293b',
          borderRadius: '16px',
          padding: '2rem',
          border: '1px solid #7f1d1d',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
          <h2 style={{ color: '#ef4444', fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
            Autorização Inválida
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0 }}>
            {erro || 'Esta autorização não foi encontrada ou o QR Code é inválido.'}
          </p>
        </div>
      </div>
    )
  }

  const statusInfo = STATUS_CONFIG[requisicao.status] || {
    label: requisicao.status, color: '#94a3b8', bg: '#1e293b', icon: '❓'
  }

  // ─── Confirmado ───────────────────────────────────────────────────────────

  if (confirmado) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0f172a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
        padding: '1rem',
      }}>
        <div style={{
          maxWidth: '400px',
          width: '100%',
          background: '#1e293b',
          borderRadius: '16px',
          padding: '2.5rem 2rem',
          border: '2px solid #22c55e',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✅</div>
          <h2 style={{ color: '#22c55e', fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
            Abastecimento Confirmado!
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: '0 0 1.5rem' }}>
            Código: <strong style={{ color: '#f8fafc', fontFamily: 'monospace' }}>{requisicao.codigo}</strong>
          </p>
          <p style={{ color: '#64748b', fontSize: '0.75rem', margin: 0 }}>
            Registro salvo com sucesso.
          </p>
        </div>
      </div>
    )
  }

  // ─── Main ─────────────────────────────────────────────────────────────────

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
        gap: '0.75rem',
      }}>
        <span style={{ fontSize: '1.5rem' }}>⛽</span>
        <div>
          <div style={{ fontWeight: 700 }}>Autorização de Combustível</div>
          <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Portal DCP</div>
        </div>
      </div>

      <div style={{ padding: '1.5rem', maxWidth: '600px', margin: '0 auto' }}>
        {/* Status card */}
        <div style={{
          background: statusInfo.bg,
          border: `2px solid ${statusInfo.color}`,
          borderRadius: '16px',
          padding: '1.5rem',
          marginBottom: '1.5rem',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{statusInfo.icon}</div>
          <div style={{
            display: 'inline-block',
            background: statusInfo.color + '22',
            color: statusInfo.color,
            padding: '0.25rem 1rem',
            borderRadius: '20px',
            fontSize: '0.875rem',
            fontWeight: 700,
            border: `1px solid ${statusInfo.color}44`,
            marginBottom: '0.75rem',
          }}>
            {statusInfo.label}
          </div>
          {requisicao.codigo_posto && (
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ color: statusInfo.color, fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>
                Código do posto
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '2.25rem', fontWeight: 700, color: '#f8fafc', letterSpacing: '0.2em' }}>
                {requisicao.codigo_posto}
              </div>
            </div>
          )}
          <div style={{
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: '#94a3b8',
            letterSpacing: '0.05em',
          }}>
            {requisicao.codigo}
          </div>
        </div>

        {/* Detalhes */}
        <div style={{
          background: '#1e293b',
          borderRadius: '16px',
          padding: '1.5rem',
          border: '1px solid #334155',
          marginBottom: '1.5rem',
        }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>
            Detalhes da Autorização
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {[
              { label: 'Solicitante', value: requisicao.solicitante_nome },
              { label: 'Cargo', value: requisicao.solicitante_cargo },
              { label: 'Placa', value: requisicao.veiculo_placa },
              { label: 'Veículo', value: requisicao.veiculo_modelo || '-' },
              { label: 'Combustível', value: TIPO_COMBUSTIVEL_LABELS[requisicao.tipo_combustivel] || requisicao.tipo_combustivel },
              { label: 'Qtd. Autorizada', value: fmtLitros(requisicao.quantidade_autorizada) },
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
                  {value}
                </div>
              </div>
            ))}
          </div>

          {requisicao.finalidade && (
            <div style={{
              background: '#0f172a',
              borderRadius: '8px',
              padding: '0.75rem',
              marginTop: '0.75rem',
            }}>
              <div style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Finalidade
              </div>
              <div style={{ color: '#f8fafc', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                {requisicao.finalidade}
              </div>
            </div>
          )}

          <div style={{
            background: '#0f172a',
            borderRadius: '8px',
            padding: '0.75rem',
            marginTop: '0.75rem',
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}>
            <div>
              <div style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Autorizado por
              </div>
              <div style={{ color: '#f8fafc', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                {requisicao.autorizado_por || '-'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Data
              </div>
              <div style={{ color: '#f8fafc', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                {fmtData(requisicao.data_autorizacao)}
              </div>
            </div>
          </div>
        </div>

        {/* Dados do veículo (extras) */}
        {(requisicao.veiculo_chassi || requisicao.veiculo_renavam) && (
          <div style={{
            background: '#1e293b',
            borderRadius: '16px',
            padding: '1.25rem 1.5rem',
            border: '1px solid #334155',
            marginBottom: '1.5rem',
          }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Identificação do Veículo
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
              {requisicao.veiculo_chassi && (
                <div>
                  <div style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: 600 }}>Chassi</div>
                  <div style={{ color: '#f8fafc', fontFamily: 'monospace', fontSize: '0.875rem' }}>{requisicao.veiculo_chassi}</div>
                </div>
              )}
              {requisicao.veiculo_renavam && (
                <div>
                  <div style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: 600 }}>Renavam</div>
                  <div style={{ color: '#f8fafc', fontFamily: 'monospace', fontSize: '0.875rem' }}>{requisicao.veiculo_renavam}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Ação do posto — apenas se AUTORIZADO e há token de posto */}
        {requisicao.status === 'AUTORIZADO' && postoToken && (
          <div style={{
            background: '#1e293b',
            borderRadius: '16px',
            padding: '1.5rem',
            border: '2px solid #22c55e',
          }}>
            {!mostrandoFormConfirmacao ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⛽</div>
                <h3 style={{ color: '#22c55e', margin: '0 0 0.5rem', fontWeight: 700 }}>
                  Posto Autenticado
                </h3>
                <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: '0 0 1.25rem' }}>
                  Você está logado como atendente do posto. Confirme o abastecimento após realizá-lo.
                </p>
                <button
                  onClick={() => setMostrandoFormConfirmacao(true)}
                  style={{
                    padding: '0.875rem 2rem',
                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '1rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Confirmar Abastecimento
                </button>
              </div>
            ) : (
              <form onSubmit={handleConfirmar}>
                <h3 style={{ color: '#22c55e', margin: '0 0 1.25rem', fontWeight: 700 }}>
                  Confirmar Abastecimento
                </h3>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', color: '#cbd5e1', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 500 }}>
                    Quantidade abastecida (L) *
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
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
                    Atendente
                  </label>
                  <input
                    type="text"
                    value={atendenteNome}
                    onChange={e => setAtendenteNome(e.target.value)}
                    placeholder="Nome do atendente"
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

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={() => setMostrandoFormConfirmacao(false)}
                    style={{
                      flex: 1,
                      padding: '0.875rem',
                      background: 'none',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#94a3b8',
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={confirmando}
                    style={{
                      flex: 2,
                      padding: '0.875rem',
                      background: confirmando ? '#334155' : 'linear-gradient(135deg, #22c55e, #16a34a)',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '1rem',
                      fontWeight: 700,
                      cursor: confirmando ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {confirmando ? 'Confirmando...' : '✅ Confirmar'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Botão imprimir / salvar PDF */}
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button
            onClick={() => window.print()}
            style={{
              padding: '0.75rem 2rem',
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            🖨️ Imprimir / Salvar PDF
          </button>
        </div>

        {/* Info de validação */}
        <div style={{
          textAlign: 'center',
          marginTop: '1.5rem',
          paddingBottom: '2rem',
          color: '#475569',
          fontSize: '0.75rem',
        }}>
          <div>🔒 Documento verificado pelo Portal DCP</div>
          <div style={{ marginTop: '0.25rem', fontFamily: 'monospace' }}>
            {new Date().toLocaleString('pt-BR')}
          </div>
        </div>

        <style>{`
          @media print {
            body { background: white !important; }
            button { display: none !important; }
          }
        `}</style>
      </div>
    </div>
  )
}

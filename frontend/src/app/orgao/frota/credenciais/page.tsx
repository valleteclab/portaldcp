'use client'

import { useEffect, useState, useCallback } from 'react'
import { getAuthToken } from '@/lib/api'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Credencial {
  id: string
  tipo: 'POSTO' | 'VEREADOR'
  nome: string
  codigo_acesso: string
  solicitante_cargo?: string
  cota_mensal_litros?: number
  url_slug?: string
  ativo: boolean
  ultimo_acesso?: string
  created_at: string
}

interface LogAcesso {
  id: string
  credencial_id?: string
  orgao_id: string
  ip: string
  user_agent: string
  acao: string
  detalhes?: string
  sucesso: boolean
  created_at: string
}

type AbaAtiva = 'postos' | 'vereadores' | 'logs'

const ACAO_LABELS: Record<string, string> = {
  LOGIN: 'Login',
  FALHA_LOGIN: 'Falha de login',
  LOGOUT: 'Logout',
  VERIFICAR_REQ: 'Verificação de requisição',
  CONFIRMAR_ABASTECIMENTO: 'Confirmação de abastecimento',
  CRIAR_REQUISICAO: 'Criação de requisição',
  ALTERAR_SENHA: 'Alteração de senha',
  VER_QR: 'Visualização de QR',
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function FrotaCredenciaisPage() {
  const token = getAuthToken()
  const [aba, setAba] = useState<AbaAtiva>('postos')
  const [credenciais, setCredenciais] = useState<Credencial[]>([])
  const [logs, setLogs] = useState<LogAcesso[]>([])
  const [carregando, setCarregando] = useState(true)
  const [carregandoLogs, setCarregandoLogs] = useState(false)
  const [erro, setErro] = useState('')

  // Modal
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Credencial | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erroModal, setErroModal] = useState('')

  // Form
  const [formTipo, setFormTipo] = useState<'POSTO' | 'VEREADOR'>('POSTO')
  const [formNome, setFormNome] = useState('')
  const [formCodigo, setFormCodigo] = useState('')
  const [formSenha, setFormSenha] = useState('')
  const [formCargo, setFormCargo] = useState('')
  const [formCota, setFormCota] = useState('')
  const [formSlug, setFormSlug] = useState('')
  const [formAtivo, setFormAtivo] = useState(true)

  // Excluir
  const [excluindo, setExcluindo] = useState<string | null>(null)

  // URL copiada
  const [copiado, setCopiado] = useState<string | null>(null)

  // ─── API ──────────────────────────────────────────────────────────────────

  const authHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }), [token])

  const carregarCredenciais = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const res = await fetch('/api/frota/credenciais', { headers: authHeaders() })
      if (!res.ok) throw new Error('Erro ao carregar credenciais')
      const data = await res.json()
      setCredenciais(data)
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro desconhecido')
    }
    setCarregando(false)
  }, [authHeaders])

  const carregarLogs = useCallback(async () => {
    setCarregandoLogs(true)
    try {
      const res = await fetch('/api/frota/credenciais/logs?limit=200', { headers: authHeaders() })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setLogs(data)
    } catch { /* ignore */ }
    setCarregandoLogs(false)
  }, [authHeaders])

  useEffect(() => {
    carregarCredenciais()
  }, [carregarCredenciais])

  useEffect(() => {
    if (aba === 'logs') carregarLogs()
  }, [aba, carregarLogs])

  // ─── Modal helpers ────────────────────────────────────────────────────────

  function abrirNovo(tipo: 'POSTO' | 'VEREADOR') {
    setEditando(null)
    setFormTipo(tipo)
    setFormNome('')
    setFormCodigo('')
    setFormSenha('')
    setFormCargo('')
    setFormCota('')
    setFormSlug('')
    setFormAtivo(true)
    setErroModal('')
    setModalAberto(true)
  }

  function abrirEditar(c: Credencial) {
    setEditando(c)
    setFormTipo(c.tipo)
    setFormNome(c.nome)
    setFormCodigo(c.codigo_acesso)
    setFormSenha('')
    setFormCargo(c.solicitante_cargo || '')
    setFormCota(c.cota_mensal_litros?.toString() || '')
    setFormSlug(c.url_slug || '')
    setFormAtivo(c.ativo)
    setErroModal('')
    setModalAberto(true)
  }

  // ─── Salvar ───────────────────────────────────────────────────────────────

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErroModal('')

    const body: Record<string, unknown> = {
      tipo: formTipo,
      nome: formNome.trim(),
      codigo_acesso: formCodigo.trim(),
      solicitante_cargo: formCargo.trim() || undefined,
      cota_mensal_litros: formCota ? parseFloat(formCota) : undefined,
      url_slug: formSlug.trim() || undefined,
      ativo: formAtivo,
    }
    if (formSenha.trim()) body.senha = formSenha.trim()

    try {
      const url = editando ? `/api/frota/credenciais/${editando.id}` : '/api/frota/credenciais'
      const method = editando ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setErroModal(err.message || 'Erro ao salvar credencial.')
        setSalvando(false)
        return
      }
      setModalAberto(false)
      carregarCredenciais()
    } catch {
      setErroModal('Erro ao conectar ao servidor.')
    }
    setSalvando(false)
  }

  // ─── Excluir ──────────────────────────────────────────────────────────────

  async function handleExcluir(id: string) {
    if (!confirm('Excluir esta credencial? O acesso será revogado imediatamente.')) return
    setExcluindo(id)
    try {
      await fetch(`/api/frota/credenciais/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      carregarCredenciais()
    } catch { /* ignore */ }
    setExcluindo(null)
  }

  // ─── Copiar URL do posto ──────────────────────────────────────────────────

  function copiarUrl(slug: string) {
    const url = `${window.location.origin}/frota/posto/${slug}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiado(slug)
      setTimeout(() => setCopiado(null), 2000)
    })
  }

  // ─── Utils ────────────────────────────────────────────────────────────────

  function fmtData(d?: string) {
    if (!d) return '-'
    return new Date(d).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const postos = credenciais.filter(c => c.tipo === 'POSTO')
  const vereadores = credenciais.filter(c => c.tipo === 'VEREADOR')

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Credenciais de Acesso — Frota</h1>
          <p className="text-gray-500 text-sm mt-1">
            Gerencie acessos de postos de combustível e vereadores ao módulo de frota.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(['postos', 'vereadores', 'logs'] as AbaAtive[]).map(a => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              aba === a
                ? 'bg-white border border-b-white border-gray-200 text-blue-600 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {a === 'postos' && `⛽ Postos (${postos.length})`}
            {a === 'vereadores' && `👤 Vereadores (${vereadores.length})`}
            {a === 'logs' && '📋 Logs de Acesso'}
          </button>
        ))}
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-red-700 text-sm">
          {erro}
        </div>
      )}

      {/* ─── Tab Postos ─────────────────────────────────────────────────────── */}

      {aba === 'postos' && (
        <div>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => abrirNovo('POSTO')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
            >
              + Novo Posto
            </button>
          </div>

          {carregando ? (
            <div className="text-center text-gray-400 py-12">Carregando...</div>
          ) : postos.length === 0 ? (
            <div className="text-center text-gray-400 py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <div className="text-4xl mb-2">⛽</div>
              <p>Nenhum posto cadastrado.</p>
              <button onClick={() => abrirNovo('POSTO')} className="mt-2 text-blue-600 text-sm hover:underline">
                Cadastrar primeiro posto
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {postos.map(c => (
                <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">{c.nome}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          c.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {c.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 space-y-0.5">
                        <div>Código: <code className="bg-gray-100 px-1 rounded text-xs">{c.codigo_acesso}</code></div>
                        {c.url_slug && (
                          <div className="flex items-center gap-2">
                            <span>URL:</span>
                            <code className="bg-gray-100 px-1 rounded text-xs truncate max-w-xs">
                              /frota/posto/{c.url_slug}
                            </code>
                            <button
                              onClick={() => copiarUrl(c.url_slug!)}
                              className="text-blue-600 hover:text-blue-800 text-xs"
                            >
                              {copiado === c.url_slug ? '✅ Copiado!' : '📋 Copiar URL'}
                            </button>
                          </div>
                        )}
                        <div className="text-xs text-gray-400">
                          Último acesso: {fmtData(c.ultimo_acesso)}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => abrirEditar(c)}
                        className="text-gray-500 hover:text-blue-600 text-sm px-2 py-1 rounded border border-gray-200 hover:border-blue-300 transition-colors"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleExcluir(c.id)}
                        disabled={excluindo === c.id}
                        className="text-gray-500 hover:text-red-600 text-sm px-2 py-1 rounded border border-gray-200 hover:border-red-300 transition-colors"
                      >
                        {excluindo === c.id ? '...' : 'Excluir'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Tab Vereadores ──────────────────────────────────────────────────── */}

      {aba === 'vereadores' && (
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-700">
              <span className="font-medium">Portal do Vereador:</span>
              <code className="bg-white px-2 py-0.5 rounded border border-blue-200 text-xs select-all">{typeof window !== 'undefined' ? window.location.origin : ''}/frota/vereador</code>
              <button
                onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/frota/vereador`)}
                className="text-blue-500 hover:text-blue-700 text-xs underline ml-1"
              >
                Copiar
              </button>
            </div>
            <button
              onClick={() => abrirNovo('VEREADOR')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              + Novo Vereador
            </button>
          </div>

          {carregando ? (
            <div className="text-center text-gray-400 py-12">Carregando...</div>
          ) : vereadores.length === 0 ? (
            <div className="text-center text-gray-400 py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <div className="text-4xl mb-2">👤</div>
              <p>Nenhum vereador cadastrado.</p>
              <button onClick={() => abrirNovo('VEREADOR')} className="mt-2 text-blue-600 text-sm hover:underline">
                Cadastrar primeiro vereador
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {vereadores.map(c => (
                <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">{c.nome}</span>
                        {c.solicitante_cargo && (
                          <span className="text-xs text-gray-500">{c.solicitante_cargo}</span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          c.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {c.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 space-y-0.5">
                        <div>Código: <code className="bg-gray-100 px-1 rounded text-xs">{c.codigo_acesso}</code></div>
                        {c.cota_mensal_litros && (
                          <div>Cota mensal: <strong className="text-gray-700">{Number(c.cota_mensal_litros).toFixed(3).replace('.', ',')} L</strong></div>
                        )}
                        <div className="text-xs text-gray-400">
                          Último acesso: {fmtData(c.ultimo_acesso)}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => abrirEditar(c)}
                        className="text-gray-500 hover:text-blue-600 text-sm px-2 py-1 rounded border border-gray-200 hover:border-blue-300 transition-colors"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleExcluir(c.id)}
                        disabled={excluindo === c.id}
                        className="text-gray-500 hover:text-red-600 text-sm px-2 py-1 rounded border border-gray-200 hover:border-red-300 transition-colors"
                      >
                        {excluindo === c.id ? '...' : 'Excluir'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Tab Logs ─────────────────────────────────────────────────────── */}

      {aba === 'logs' && (
        <div>
          <div className="flex justify-end mb-4">
            <button
              onClick={carregarLogs}
              className="text-gray-500 hover:text-gray-700 text-sm px-3 py-1.5 border border-gray-200 rounded-lg"
            >
              🔄 Atualizar
            </button>
          </div>

          {carregandoLogs ? (
            <div className="text-center text-gray-400 py-12">Carregando logs...</div>
          ) : logs.length === 0 ? (
            <div className="text-center text-gray-400 py-12">Nenhum log encontrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Data/Hora</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Ação</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">IP</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Status</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 text-gray-600 whitespace-nowrap font-mono text-xs">
                        {fmtData(log.created_at)}
                      </td>
                      <td className="py-2 px-3 font-medium text-gray-800">
                        {ACAO_LABELS[log.acao] || log.acao}
                      </td>
                      <td className="py-2 px-3 text-gray-500 font-mono text-xs">{log.ip}</td>
                      <td className="py-2 px-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          log.sucesso
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {log.sucesso ? 'Sucesso' : 'Falha'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-gray-400 text-xs truncate max-w-xs">
                        {log.detalhes || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Modal ────────────────────────────────────────────────────────── */}

      {modalAberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget) setModalAberto(false) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              {editando ? 'Editar Credencial' : `Nova Credencial — ${formTipo === 'POSTO' ? 'Posto' : 'Vereador'}`}
            </h2>

            <form onSubmit={handleSalvar} className="space-y-4">
              {/* Tipo (apenas novo) */}
              {!editando && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                  <div className="flex gap-3">
                    {(['POSTO', 'VEREADOR'] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setFormTipo(t)}
                        className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                          formTipo === t
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                        }`}
                      >
                        {t === 'POSTO' ? '⛽ Posto' : '👤 Vereador'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  type="text"
                  value={formNome}
                  onChange={e => setFormNome(e.target.value)}
                  required
                  placeholder={formTipo === 'POSTO' ? 'Ex: Posto Central' : 'Ex: Vereador João Silva'}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código de Acesso *</label>
                <input
                  type="text"
                  value={formCodigo}
                  onChange={e => setFormCodigo(e.target.value.toUpperCase().replace(/\s/g, ''))}
                  required
                  placeholder="Ex: POSTO01 ou VEREADOR01"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <p className="text-xs text-gray-400 mt-1">Identificador único para login. Sem espaços.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {editando ? 'Nova Senha (deixe em branco para não alterar)' : 'Senha *'}
                </label>
                <input
                  type="password"
                  value={formSenha}
                  onChange={e => setFormSenha(e.target.value)}
                  required={!editando}
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {formTipo === 'VEREADOR' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                    <input
                      type="text"
                      value={formCargo}
                      onChange={e => setFormCargo(e.target.value)}
                      placeholder="Ex: Vereador"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cota Mensal (litros)</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={formCota}
                      onChange={e => setFormCota(e.target.value)}
                      placeholder="Ex: 150.000"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">Limite de litros que este vereador pode solicitar por mês.</p>
                  </div>
                </>
              )}

              {formTipo === 'POSTO' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">URL Slug (para link direto)</label>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-sm whitespace-nowrap">/frota/posto/</span>
                    <input
                      type="text"
                      value={formSlug}
                      onChange={e => setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                      placeholder="posto-central"
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Deixe em branco para não usar link direto. Apenas letras, números e hífen.</p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="ativo"
                  checked={formAtivo}
                  onChange={e => setFormAtivo(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="ativo" className="text-sm text-gray-700">Acesso ativo</label>
              </div>

              {erroModal && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                  {erroModal}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalAberto(false)}
                  className="flex-1 py-2 border border-gray-200 rounded-lg text-gray-600 text-sm hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg text-sm font-medium"
                >
                  {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Criar credencial'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// Fix TypeScript type alias for tab
type AbaAtive = AbaAtiva

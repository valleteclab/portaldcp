'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, ArrowRightLeft, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { API_URL } from '@/lib/api'

type Lote = {
  orgao: { nome: string }
  lote_id: string
  status: string
  setor_origem_nome: string | null
  setor_destino_nome: string | null
  responsavel_destino_nome: string | null
  solicitado_por: string | null
  motivo: string | null
  created_at: string
  aceito_por: string | null
  aceito_em: string | null
  recusa_motivo: string | null
  bens: { id: string; plaqueta: string | null; descricao: string; categoria: string | null; foto_url: string | null; setor_origem_nome: string | null; status: string }[]
}

/** Link de aceite de transferência de bens (responsável do setor de destino). */
export default function AceiteTransferenciaPage() {
  const params = useParams()
  const token = String(params.token || '')
  const [lote, setLote] = useState<Lote | null>(null)
  const [erro, setErro] = useState('')
  const [nome, setNome] = useState('')
  const [motivo, setMotivo] = useState('')
  const [recusando, setRecusando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [feito, setFeito] = useState<'aceita' | 'recusada' | null>(null)

  const carregar = () =>
    fetch(`${API_URL}/api/patrimonio-pub/movimentacao/${token}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message || 'Link inválido'); const d = await r.json(); setLote(d); setNome((n) => n || d.responsavel_destino_nome || '') })
      .catch((e) => setErro(e.message))
  useEffect(() => { carregar() }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const responder = async (aceitar: boolean) => {
    setEnviando(true)
    setErro('')
    try {
      const r = await fetch(`${API_URL}/api/patrimonio-pub/movimentacao/${token}/responder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, aceitar, motivo: aceitar ? undefined : motivo }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.message || 'Erro ao responder')
      setFeito(aceitar ? 'aceita' : 'recusada')
      carregar()
    } catch (e: any) { setErro(e.message) } finally { setEnviando(false) }
  }

  if (erro && !lote) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center"><div><AlertTriangle className="w-10 h-10 mx-auto text-rose-500 mb-3" /><p className="font-semibold">{erro}</p></div></div>
  }
  if (!lote) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>

  const pendente = lote.status === 'PENDENTE' && !feito

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-[#1f3a5f] text-white px-5 pt-[max(16px,env(safe-area-inset-top))] pb-5">
        <p className="text-[11px] uppercase tracking-wider text-blue-200">{lote.orgao.nome} · Patrimônio</p>
        <h1 className="text-lg font-bold flex items-center gap-2 mt-1"><ArrowRightLeft className="w-5 h-5 text-amber-300" />Transferência de {lote.bens.length === 1 ? '1 bem' : `${lote.bens.length} bens`}</h1>
        <p className="text-sm text-blue-100 mt-1">{lote.setor_origem_nome || 'sem setor'} → <strong>{lote.setor_destino_nome}</strong></p>
      </header>
      <main className="p-5 space-y-4 max-w-md mx-auto">
        {(feito || !pendente) && (
          <div className={`rounded-2xl p-4 flex items-center gap-3 ${lote.status === 'ACEITA' || feito === 'aceita' ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'}`}>
            {lote.status === 'ACEITA' || feito === 'aceita' ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
            <div className="text-sm">
              <p className="font-semibold">{lote.status === 'ACEITA' || feito === 'aceita' ? 'Transferência aceita' : lote.status === 'RECUSADA' || feito === 'recusada' ? 'Transferência recusada' : `Situação: ${lote.status.toLowerCase()}`}</p>
              {lote.aceito_por && <p>{lote.aceito_por}{lote.aceito_em ? ` · ${new Date(lote.aceito_em).toLocaleString('pt-BR')}` : ''}</p>}
              {lote.recusa_motivo && <p>{lote.recusa_motivo}</p>}
            </div>
          </div>
        )}
        <div className="rounded-2xl bg-white border border-slate-200 p-4 text-sm space-y-1">
          <p><span className="text-slate-500">Solicitado por:</span> {lote.solicitado_por || '—'} em {new Date(lote.created_at).toLocaleDateString('pt-BR')}</p>
          {lote.motivo && <p><span className="text-slate-500">Motivo:</span> {lote.motivo}</p>}
        </div>
        <div className="rounded-2xl bg-white border border-slate-200 divide-y">
          {lote.bens.map((b) => (
            <div key={b.id} className="p-3 flex gap-3 items-center">
              {b.foto_url && <img src={`${API_URL}${b.foto_url}`} alt="" className="w-12 h-12 rounded-lg object-cover bg-slate-200" />}
              <div className="min-w-0">
                <p className="font-mono text-amber-700 text-sm">{b.plaqueta || '—'}</p>
                <p className="font-medium leading-snug">{b.descricao}</p>
                <p className="text-xs text-slate-500">{[b.categoria, b.setor_origem_nome && `de ${b.setor_origem_nome}`].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
          ))}
        </div>
        {pendente && (
          <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
            <p className="text-sm">Ao aceitar, os bens passam à responsabilidade do setor <strong>{lote.setor_destino_nome}</strong> e ficam sob sua guarda.</p>
            <div>
              <label className="text-xs text-slate-500">Seu nome</label>
              <input id="nome-aceite" value={nome} onChange={(e) => setNome(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="Nome completo" />
            </div>
            {recusando && (
              <div>
                <label className="text-xs text-slate-500">Motivo da recusa</label>
                <textarea id="motivo-recusa" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
              </div>
            )}
            {erro && <p className="text-sm text-rose-600">{erro}</p>}
            {!recusando ? (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setRecusando(true)} className="rounded-xl border border-slate-300 py-3 font-semibold">Recusar</button>
                <button onClick={() => responder(true)} disabled={enviando || nome.trim().length < 3} className="rounded-xl bg-emerald-600 disabled:opacity-50 text-white py-3 font-bold">Aceitar</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setRecusando(false)} className="rounded-xl border border-slate-300 py-3 font-semibold">Voltar</button>
                <button onClick={() => responder(false)} disabled={enviando || nome.trim().length < 3} className="rounded-xl bg-rose-600 disabled:opacity-50 text-white py-3 font-bold">Confirmar recusa</button>
              </div>
            )}
          </div>
        )}
        <p className="text-[11px] text-slate-400 text-center">Portal DCP · controle patrimonial</p>
      </main>
    </div>
  )
}

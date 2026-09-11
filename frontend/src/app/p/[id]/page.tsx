'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, Tag, ClipboardCheck, AlertTriangle } from 'lucide-react'
import { API_URL } from '@/lib/api'

type Bem = {
  id: string; plaqueta: string | null; descricao: string; categoria: string | null; setor_nome: string | null
  responsavel_nome: string | null; estado_conservacao: string | null; status: string; marca: string | null; modelo: string | null
  foto_url: string | null; ultima_conferencia_em: string | null
  orgao: { nome: string; logo_url: string | null }
  conferencia: { link: string; setor_nome: string; ano: number } | null
}

const STATUS: Record<string, string> = { ATIVO: 'Ativo', EM_MANUTENCAO: 'Em manutenção', BAIXADO: 'Baixado', DEVOLVIDO: 'Devolvido' }
const ESTADO: Record<string, string> = { BOM: 'Bom', REGULAR: 'Regular', RUIM: 'Ruim', INSERVIVEL: 'Inservível' }

/** Página pública aberta ao ler o QR da plaqueta com a câmera do celular. */
export default function BemPublicoPage() {
  const params = useParams()
  const [bem, setBem] = useState<Bem | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    fetch(`${API_URL}/api/patrimonio-pub/bem/${params.id}`)
      .then(async (r) => { if (!r.ok) throw new Error('Bem não encontrado'); setBem(await r.json()) })
      .catch((e) => setErro(e.message))
  }, [params.id])

  if (erro) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
        <div><AlertTriangle className="w-10 h-10 mx-auto text-rose-500 mb-3" /><p className="font-semibold">{erro}</p></div>
      </div>
    )
  }
  if (!bem) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-[#1f3a5f] text-white px-5 pt-[max(16px,env(safe-area-inset-top))] pb-5">
        <p className="text-[11px] uppercase tracking-wider text-blue-200">{bem.orgao.nome}</p>
        <div className="flex items-center gap-2 mt-1"><Tag className="w-5 h-5 text-amber-300" /><span className="font-mono text-2xl font-bold">{bem.plaqueta || '—'}</span></div>
      </header>
      <main className="p-5 space-y-4 max-w-md mx-auto">
        {bem.foto_url && <img src={`${API_URL}${bem.foto_url}`} alt="" className="w-full rounded-2xl object-cover max-h-64 bg-slate-200" />}
        <div className="rounded-2xl bg-white border border-slate-200 p-4">
          <h1 className="text-lg font-bold leading-snug">{bem.descricao}</h1>
          <dl className="mt-3 text-sm space-y-1.5">
            {bem.categoria && <Linha k="Categoria" v={bem.categoria} />}
            {(bem.marca || bem.modelo) && <Linha k="Marca / modelo" v={[bem.marca, bem.modelo].filter(Boolean).join(' ')} />}
            <Linha k="Setor" v={bem.setor_nome || '—'} />
            {bem.responsavel_nome && <Linha k="Responsável" v={bem.responsavel_nome} />}
            <Linha k="Situação" v={STATUS[bem.status] || bem.status} />
            {bem.estado_conservacao && <Linha k="Conservação" v={ESTADO[bem.estado_conservacao] || bem.estado_conservacao} />}
            <Linha k="Última conferência" v={bem.ultima_conferencia_em ? new Date(bem.ultima_conferencia_em).toLocaleDateString('pt-BR') : 'nunca'} />
          </dl>
        </div>
        {bem.conferencia && (
          <a href={bem.conferencia.link} className="block rounded-2xl bg-amber-500 text-slate-900 font-bold text-center py-4">
            <ClipboardCheck className="w-5 h-5 inline mr-2 -mt-0.5" />Conferir no inventário {bem.conferencia.ano} · {bem.conferencia.setor_nome}
          </a>
        )}
        <p className="text-[11px] text-slate-400 text-center">Portal DCP · controle patrimonial</p>
      </main>
    </div>
  )
}

function Linha({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
}

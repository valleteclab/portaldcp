'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Loader2, Plus, Send, Pencil, Trash2, FileText, Megaphone } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import AdicionarServicoPublicidadeModal, { LinhaPayload } from '@/components/contratos/AdicionarServicoPublicidadeModal'

interface PreOs {
  id: string
  sequencial: number
  titulo: string
  justificativa?: string | null
  linhas: LinhaPayload[]
  valor_total_estimado: number
  status: 'RASCUNHO' | 'ENVIADA' | 'DEVOLVIDA' | 'ACEITA' | 'CONVERTIDA'
  motivo_devolucao?: string | null
  enviada_em?: string | null
  respondida_em?: string | null
  pdf_url?: string | null
  os_numero?: string | null
  os_status?: string | null
}

const fmtBRL = (v: number | null | undefined) =>
  v == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v))

const STATUS_BADGE: Record<PreOs['status'], { label: string; cls: string }> = {
  RASCUNHO: { label: 'Rascunho', cls: 'bg-gray-100 text-gray-700' },
  ENVIADA: { label: 'Enviada — aguardando o órgão', cls: 'bg-blue-100 text-blue-700' },
  DEVOLVIDA: { label: 'Devolvida — corrija e reenvie', cls: 'bg-amber-100 text-amber-800' },
  ACEITA: { label: 'Aprovada pelo órgão', cls: 'bg-emerald-100 text-emerald-700' },
  CONVERTIDA: { label: 'OS emitida', cls: 'bg-indigo-100 text-indigo-700' },
}

/** Pré-OS convertida: o que vale para o fornecedor é o status da OS gerada */
const badgeDaOs = (p: PreOs): { label: string; cls: string } => {
  if (p.status !== 'CONVERTIDA' || !p.os_status) return STATUS_BADGE[p.status]
  const numero = p.os_numero ? `${p.os_numero} — ` : 'OS '
  switch (p.os_status) {
    case 'AUTORIZADA':
    case 'ORDEM_GERADA':
      return { label: `${numero}autorizada ✓`, cls: 'bg-emerald-100 text-emerald-700' }
    case 'AGUARDANDO_AUTORIZACAO':
      return { label: `${numero}aguardando autorização do órgão`, cls: 'bg-amber-100 text-amber-800' }
    case 'RASCUNHO':
      return { label: `${numero}em preparação no órgão`, cls: 'bg-gray-100 text-gray-700' }
    case 'NEGADA':
      return { label: `${numero}negada pelo órgão`, cls: 'bg-red-100 text-red-700' }
    default:
      return STATUS_BADGE.CONVERTIDA
  }
}

export default function PreOsFornecedorSection({ contratoId, fornecedorId, onDisponivel }: { contratoId: string; fornecedorId: string; onDisponivel?: (ok: boolean) => void }) {
  const [pub, setPub] = useState<{ tabela_referencia_id: string | null; remuneracao_publicidade: any } | null>(null)
  const [lista, setLista] = useState<PreOs[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)

  // Formulário (novo/editar)
  const [formAberto, setFormAberto] = useState(false)
  const [editando, setEditando] = useState<PreOs | null>(null)
  const [titulo, setTitulo] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [linhas, setLinhas] = useState<LinhaPayload[]>([])
  const [pickerAberto, setPickerAberto] = useState(false)

  const qs = `fornecedorId=${fornecedorId}`

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const resPub = await authFetch(`${API_URL}/api/fornecedor/contratos/${contratoId}/tabela-publicidade?${qs}`)
      if (!resPub.ok) { setPub(null); onDisponivel?.(false); return } // contrato não é de publicidade
      setPub(await resPub.json())
      onDisponivel?.(true)
      const resLista = await authFetch(`${API_URL}/api/fornecedor/contratos/${contratoId}/pre-os?${qs}`)
      if (resLista.ok) setLista(await resLista.json())
    } finally {
      setLoading(false)
    }
  }, [contratoId, fornecedorId])

  useEffect(() => { carregar() }, [carregar])

  // Atalho externo (ex.: botão ao lado de "Abrir Medição do Mês"): rola até a
  // seção e abre o formulário de nova pré-OS
  useEffect(() => {
    const handler = () => {
      document.getElementById('pre-os-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setEditando(null); setTitulo(''); setJustificativa(''); setLinhas([]); setFormAberto(true)
    }
    window.addEventListener('abrir-pre-os', handler)
    return () => window.removeEventListener('abrir-pre-os', handler)
  }, [])

  if (loading) return null
  if (!pub) return null // só contratos de publicidade

  const totalLinhas = linhas.reduce((s, l) => s + Number(l.preco_unit || 0) * (Number(l.quantidade) || 1), 0)

  const abrirNova = () => {
    setEditando(null); setTitulo(''); setJustificativa(''); setLinhas([]); setFormAberto(true)
  }
  const abrirEdicao = (p: PreOs) => {
    setEditando(p); setTitulo(p.titulo); setJustificativa(p.justificativa || ''); setLinhas(p.linhas || []); setFormAberto(true)
  }

  const salvar = async (enviarDepois: boolean) => {
    if (!titulo.trim()) { alert('Informe o título/campanha.'); return }
    if (linhas.length === 0) { alert('Monte os serviços da pré-OS.'); return }
    setSalvando(true)
    try {
      let id = editando?.id
      const body = JSON.stringify({ titulo: titulo.trim(), justificativa: justificativa.trim() || undefined, linhas })
      const res = id
        ? await authFetch(`${API_URL}/api/fornecedor/contratos/pre-os/${id}?${qs}`, { method: 'PUT', body })
        : await authFetch(`${API_URL}/api/fornecedor/contratos/${contratoId}/pre-os?${qs}`, { method: 'POST', body })
      const data = await res.json()
      if (!res.ok) { alert(data.message || 'Erro ao salvar a pré-OS.'); return }
      id = data.id
      if (enviarDepois && id) {
        const resEnv = await authFetch(`${API_URL}/api/fornecedor/contratos/pre-os/${id}/enviar?${qs}`, { method: 'POST' })
        const dEnv = await resEnv.json()
        if (!resEnv.ok) { alert(dEnv.message || 'Salvo como rascunho, mas o envio falhou.'); }
      }
      setFormAberto(false)
      await carregar()
    } finally {
      setSalvando(false)
    }
  }

  const enviarExistente = async (p: PreOs) => {
    if (!confirm(`Enviar a pré-OS #${p.sequencial} "${p.titulo}" para análise do órgão?`)) return
    const res = await authFetch(`${API_URL}/api/fornecedor/contratos/pre-os/${p.id}/enviar?${qs}`, { method: 'POST' })
    if (res.ok) await carregar()
    else { const d = await res.json().catch(() => ({})); alert(d.message || 'Erro ao enviar.') }
  }

  const excluir = async (p: PreOs) => {
    if (!confirm(`Excluir o rascunho #${p.sequencial} "${p.titulo}"?`)) return
    const res = await authFetch(`${API_URL}/api/fornecedor/contratos/pre-os/${p.id}?${qs}`, { method: 'DELETE' })
    if (res.ok) await carregar()
  }

  return (
    <Card className="border-amber-200" id="pre-os-section">
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Megaphone className="w-5 h-5" /> Pré-OS de publicidade</CardTitle>
            <CardDescription>
              Monte a proposta de serviços (SINAPRO, terceiros, mídia) e envie para aprovação prévia do órgão — cláusula 3.6 do contrato.
            </CardDescription>
          </div>
          <Button onClick={abrirNova}><Plus className="w-4 h-4 mr-1" /> Nova pré-OS</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {lista.length === 0 ? (
          <p className="text-sm text-gray-500 py-2">Nenhuma pré-OS ainda. Clique em "Nova pré-OS" para montar a primeira proposta.</p>
        ) : (
          lista.map((p) => (
            <div key={p.id} className="border rounded-md px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">#{p.sequencial} — {p.titulo}</p>
                <p className="text-xs text-gray-500">
                  {p.linhas?.length || 0} serviço(s) · {fmtBRL(Number(p.valor_total_estimado))}
                  {p.status === 'DEVOLVIDA' && p.motivo_devolucao && (
                    <span className="block text-amber-700 mt-0.5">↩ Motivo da devolução: {p.motivo_devolucao}</span>
                  )}
                  {(p.status === 'ACEITA' || p.status === 'CONVERTIDA') && p.pdf_url && (
                    <a href={p.pdf_url} target="_blank" rel="noreferrer" className="block text-indigo-600 underline mt-0.5">📄 Baixar aprovação prévia (PDF)</a>
                  )}
                  {p.status === 'CONVERTIDA' && p.os_status === 'AGUARDANDO_AUTORIZACAO' && (
                    <span className="block text-amber-700 font-medium mt-0.5">⏳ A OS ainda não foi autorizada — aguarde a autorização antes de executar e emitir a nota fiscal.</span>
                  )}
                  {p.status === 'CONVERTIDA' && (p.os_status === 'AUTORIZADA' || p.os_status === 'ORDEM_GERADA') && (
                    <span className="block text-emerald-700 mt-0.5">✅ OS autorizada — liberado para executar e emitir a nota fiscal.</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={badgeDaOs(p).cls}>{badgeDaOs(p).label}</Badge>
                {(p.status === 'RASCUNHO' || p.status === 'DEVOLVIDA') && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => abrirEdicao(p)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="sm" onClick={() => enviarExistente(p)}><Send className="w-4 h-4 mr-1" /> Enviar</Button>
                  </>
                )}
                {p.status === 'RASCUNHO' && (
                  <Button variant="ghost" size="sm" onClick={() => excluir(p)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>

      {/* Formulário da pré-OS */}
      <Dialog open={formAberto} onOpenChange={setFormAberto}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? `Editar pré-OS #${editando.sequencial}` : 'Nova pré-OS'}</DialogTitle>
            <DialogDescription>Descreva a campanha/ação e monte os serviços. O órgão analisará antes da emissão da OS.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Título / campanha *</Label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: OS 01 — Criação — Campanha Rede Câmara" /></div>
            <div><Label>Justificativa</Label><Textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} className="h-20" placeholder="Contexto/objetivo da ação (opcional)" /></div>
            <div className="border rounded-md p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium flex items-center gap-1"><FileText className="w-4 h-4" /> Serviços ({linhas.length}) — {fmtBRL(totalLinhas)}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => setPickerAberto(true)}>
                  {linhas.length > 0 ? 'Editar serviços' : 'Montar serviços'}
                </Button>
              </div>
              {linhas.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-gray-600 max-h-40 overflow-y-auto">
                  {linhas.map((l, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="truncate">[{l.tipo}] {l.descricao || '(item da tabela)'}</span>
                      <span className="whitespace-nowrap">{l.quantidade || 1} × {fmtBRL(Number(l.preco_unit || 0))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormAberto(false)}>Cancelar</Button>
            <Button variant="outline" onClick={() => salvar(false)} disabled={salvando}>Salvar rascunho</Button>
            <Button onClick={() => salvar(true)} disabled={salvando}>
              {salvando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
              Salvar e enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Picker de serviços (modo retornar) */}
      <AdicionarServicoPublicidadeModal
        contratoId={contratoId}
        tabelaId={pub.tabela_referencia_id}
        remuneracao={pub.remuneracao_publicidade}
        open={pickerAberto}
        onOpenChange={setPickerAberto}
        itensUrl={`${API_URL}/api/fornecedor/contratos/${contratoId}/tabela-publicidade?${qs}`}
        modo="retornar"
        submitLabel="Adicionar à pré-OS"
        linhasIniciais={linhas}
        onLinhas={(ls) => setLinhas(ls)}
      />
    </Card>
  )
}

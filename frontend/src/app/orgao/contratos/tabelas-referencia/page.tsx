'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { ArrowLeft, Plus, Upload, FileText, Loader2, Trash2, Table2, Sparkles, Eye, Pencil, Search } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'

interface TabelaReferencia {
  id: string
  nome: string
  fonte: string | null
  uf: string | null
  edicao: string | null
  ativa: boolean
  total_itens?: number
  created_at: string
}

interface ItemTabela {
  id?: string
  categoria_codigo?: string | null
  categoria_nome?: string | null
  codigo?: string | null
  descricao: string
  valor_criacao?: number | null
  valor_finalizacao?: number | null
  valor_total?: number | null
  valor_reformulacao?: number | null
  sob_orcamento?: boolean
}

const fmtBRL = (v: number | null | undefined) =>
  v == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v))

export default function TabelasReferenciaPage() {
  const [tabelas, setTabelas] = useState<TabelaReferencia[]>([])
  const [loading, setLoading] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Import modal
  const [showImport, setShowImport] = useState(false)
  // quando setado, o import substitui os itens desta tabela em vez de criar nova
  const [atualizarAlvo, setAtualizarAlvo] = useState<TabelaReferencia | null>(null)
  const [importMeta, setImportMeta] = useState({ nome: '', fonte: 'SINAPRO', uf: 'BA', edicao: '' })
  const [previewItens, setPreviewItens] = useState<ItemTabela[]>([])
  const [processando, setProcessando] = useState(false)
  const [csvTexto, setCsvTexto] = useState('')

  // Itens viewer + edição
  const [viewTabela, setViewTabela] = useState<TabelaReferencia | null>(null)
  const [viewItens, setViewItens] = useState<ItemTabela[]>([])
  const [loadingItens, setLoadingItens] = useState(false)
  const [buscaItens, setBuscaItens] = useState('')
  const [editando, setEditando] = useState<{
    id?: string
    novo: boolean
    descricao: string
    codigo: string
    categoria_nome: string
    criacao: string
    finalizacao: string
    total: string
  } | null>(null)
  const [salvandoItem, setSalvandoItem] = useState(false)

  const parseBR = (s: string): number | null => {
    const t = s.trim()
    if (!t) return null
    const n = parseFloat(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
    return isNaN(n) ? null : n
  }

  const recarregarItens = async (tabelaId: string) => {
    const res = await authFetch(`${API_URL}/api/contratos/tabelas-referencia/${tabelaId}/itens`)
    if (res.ok) setViewItens(await res.json())
  }

  const salvarItem = async () => {
    if (!editando || !viewTabela) return
    setSalvandoItem(true)
    try {
      const payload = {
        descricao: editando.descricao.trim(),
        codigo: editando.codigo.trim() || null,
        categoria_nome: editando.categoria_nome.trim() || null,
        valor_criacao: parseBR(editando.criacao),
        valor_finalizacao: parseBR(editando.finalizacao),
        valor_total: parseBR(editando.total),
      }
      const res = editando.novo
        ? await authFetch(`${API_URL}/api/contratos/tabelas-referencia/${viewTabela.id}/itens`, { method: 'POST', body: JSON.stringify(payload) })
        : await authFetch(`${API_URL}/api/contratos/tabelas-referencia/itens/${editando.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      if (res.ok) {
        setEditando(null)
        await recarregarItens(viewTabela.id)
        await carregar()
      } else {
        const e = await res.json().catch(() => ({}))
        alert(e.message || 'Erro ao salvar o item.')
      }
    } finally {
      setSalvandoItem(false)
    }
  }

  const excluirItem = async (it: ItemTabela) => {
    if (!viewTabela || !it.id) return
    if (!confirm(`Excluir o item "${it.codigo || ''} ${it.descricao.slice(0, 60)}"?`)) return
    const res = await authFetch(`${API_URL}/api/contratos/tabelas-referencia/itens/${it.id}`, { method: 'DELETE' })
    if (res.ok) {
      await recarregarItens(viewTabela.id)
      await carregar()
    } else {
      const e = await res.json().catch(() => ({}))
      alert(e.message || 'Erro ao excluir o item.')
    }
  }

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/tabelas-referencia`)
      if (res.ok) setTabelas(await res.json())
      else setErro('Erro ao carregar tabelas.')
    } catch {
      setErro('Erro de conexão.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const semearSinapro = async () => {
    if (!confirm('Importar a tabela SINAPRO-BA 2025/2026 (345 itens) para este órgão?')) return
    setSeeding(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/tabelas-referencia/seed/sinapro-ba`, { method: 'POST' })
      if (res.ok) await carregar()
      else {
        const e = await res.json().catch(() => ({}))
        setErro(e.message || 'Erro ao semear SINAPRO-BA.')
      }
    } finally {
      setSeeding(false)
    }
  }

  const previewPdf = async (file: File) => {
    setProcessando(true)
    setErro(null)
    setPreviewItens([])
    try {
      const fd = new FormData()
      fd.append('arquivo', file)
      const res = await authFetch(`${API_URL}/api/contratos/tabelas-referencia/preview/pdf`, { method: 'POST', body: fd })
      const data = await res.json()
      if (res.ok) {
        setPreviewItens(data.itens)
        if (!importMeta.nome) setImportMeta((m) => ({ ...m, nome: file.name.replace(/\.pdf$/i, '') }))
      } else setErro(data.message || 'Falha ao ler o PDF.')
    } catch {
      setErro('Erro ao processar o PDF.')
    } finally {
      setProcessando(false)
    }
  }

  const previewCsv = async () => {
    if (!csvTexto.trim()) return
    setProcessando(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/tabelas-referencia/preview/csv`, {
        method: 'POST',
        body: JSON.stringify({ conteudo: csvTexto }),
      })
      const data = await res.json()
      if (res.ok) setPreviewItens(data.itens)
      else setErro(data.message || 'Falha ao ler o CSV.')
    } finally {
      setProcessando(false)
    }
  }

  const abrirImportarNova = () => {
    setAtualizarAlvo(null)
    setPreviewItens([])
    setCsvTexto('')
    setImportMeta({ nome: '', fonte: 'SINAPRO', uf: 'BA', edicao: '' })
    setShowImport(true)
  }

  const abrirAtualizar = (t: TabelaReferencia) => {
    setAtualizarAlvo(t)
    setPreviewItens([])
    setCsvTexto('')
    setImportMeta({ nome: t.nome, fonte: t.fonte || '', uf: t.uf || '', edicao: t.edicao || '' })
    setShowImport(true)
  }

  const confirmarImport = async () => {
    if (previewItens.length === 0) return
    if (!atualizarAlvo && !importMeta.nome) return
    setProcessando(true)
    try {
      const url = atualizarAlvo
        ? `${API_URL}/api/contratos/tabelas-referencia/${atualizarAlvo.id}/substituir-itens`
        : `${API_URL}/api/contratos/tabelas-referencia`
      const body = atualizarAlvo
        ? { itens: previewItens, edicao: importMeta.edicao }
        : { ...importMeta, itens: previewItens }
      const res = await authFetch(url, { method: 'POST', body: JSON.stringify(body) })
      if (res.ok) {
        setShowImport(false)
        setAtualizarAlvo(null)
        setPreviewItens([])
        setCsvTexto('')
        setImportMeta({ nome: '', fonte: 'SINAPRO', uf: 'BA', edicao: '' })
        await carregar()
      } else {
        const e = await res.json().catch(() => ({}))
        setErro(e.message || 'Erro ao salvar a tabela.')
      }
    } finally {
      setProcessando(false)
    }
  }

  const excluir = async (t: TabelaReferencia) => {
    if (!confirm(`Excluir a tabela "${t.nome}"? Os itens serão removidos.`)) return
    const res = await authFetch(`${API_URL}/api/contratos/tabelas-referencia/${t.id}`, { method: 'DELETE' })
    if (res.ok) await carregar()
    else {
      const e = await res.json().catch(() => ({}))
      alert(e.message || 'Erro ao excluir.')
    }
  }

  const verItens = async (t: TabelaReferencia) => {
    setViewTabela(t)
    setLoadingItens(true)
    setViewItens([])
    setEditando(null)
    setBuscaItens('')
    try {
      const res = await authFetch(`${API_URL}/api/contratos/tabelas-referencia/${t.id}/itens`)
      if (res.ok) setViewItens(await res.json())
    } finally {
      setLoadingItens(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/orgao/contratos"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Contratos</Button></Link>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Table2 className="w-6 h-6" /> Tabelas de Referência de Preços</h1>
          <p className="text-gray-500 mt-1 max-w-2xl">
            Tabelas como a <strong>SINAPRO</strong> usadas em contratos de agência de publicidade (Lei 12.232/2010).
            Importe uma vez e reaproveite em todos os contratos do órgão — o desconto contratual é aplicado ao gerar os itens do contrato.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={semearSinapro} disabled={seeding}>
            {seeding ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
            Semear SINAPRO-BA
          </Button>
          <Button onClick={abrirImportarNova}><Plus className="w-4 h-4 mr-1" /> Importar tabela</Button>
        </div>
      </div>

      {erro && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{erro}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : tabelas.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-gray-500">
          <Table2 className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          Nenhuma tabela cadastrada. Use <strong>Semear SINAPRO-BA</strong> para o caso LOOP ou <strong>Importar tabela</strong>.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {tabelas.map((t) => (
            <Card key={t.id}>
              <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-semibold">{t.nome}</p>
                  <p className="text-sm text-gray-500">
                    {[t.fonte, t.uf, t.edicao].filter(Boolean).join(' · ')} · {t.total_itens ?? 0} itens
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => verItens(t)}><Eye className="w-4 h-4 mr-1" /> Ver itens</Button>
                  <Button variant="outline" size="sm" onClick={() => abrirAtualizar(t)}><Upload className="w-4 h-4 mr-1" /> Atualizar itens</Button>
                  <Button variant="ghost" size="sm" onClick={() => excluir(t)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de importação */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{atualizarAlvo ? `Atualizar itens — ${atualizarAlvo.nome}` : 'Importar tabela de referência'}</DialogTitle>
            <DialogDescription>
              {atualizarAlvo
                ? 'Envie a nova edição (PDF/CSV). Os itens atuais serão substituídos; os contratos vinculados seguem usando esta tabela com os novos preços.'
                : 'Envie o PDF da SINAPRO ou cole um CSV. Revise os itens antes de salvar.'}
            </DialogDescription>
          </DialogHeader>

          {atualizarAlvo ? (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
              Substituindo os itens de <strong>{atualizarAlvo.nome}</strong> ({atualizarAlvo.total_itens ?? 0} itens atuais).
              <div className="mt-2 w-40"><Label className="text-xs">Nova edição</Label><Input value={importMeta.edicao} onChange={(e) => setImportMeta({ ...importMeta, edicao: e.target.value })} placeholder="2026/2027" /></div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nome *</Label><Input value={importMeta.nome} onChange={(e) => setImportMeta({ ...importMeta, nome: e.target.value })} placeholder="SINAPRO-BA — Custos Internos" /></div>
              <div><Label>Fonte</Label><Input value={importMeta.fonte} onChange={(e) => setImportMeta({ ...importMeta, fonte: e.target.value })} /></div>
              <div><Label>UF</Label><Input value={importMeta.uf} onChange={(e) => setImportMeta({ ...importMeta, uf: e.target.value })} maxLength={2} /></div>
              <div><Label>Edição</Label><Input value={importMeta.edicao} onChange={(e) => setImportMeta({ ...importMeta, edicao: e.target.value })} placeholder="2025/2026" /></div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mt-2">
            <div className="border rounded-md p-3">
              <Label className="flex items-center gap-1"><FileText className="w-4 h-4" /> Por PDF</Label>
              <input type="file" accept="application/pdf" className="mt-2 text-sm" disabled={processando}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) previewPdf(f) }} />
            </div>
            <div className="border rounded-md p-3">
              <Label className="flex items-center gap-1"><Upload className="w-4 h-4" /> Por CSV</Label>
              <Textarea className="mt-2 h-20 text-xs font-mono" placeholder="categoria_codigo;categoria_nome;codigo;descricao;valor_criacao;valor_finalizacao;valor_total" value={csvTexto} onChange={(e) => setCsvTexto(e.target.value)} />
              <Button size="sm" variant="outline" className="mt-2" onClick={previewCsv} disabled={processando || !csvTexto.trim()}>Ler CSV</Button>
            </div>
          </div>

          {processando && <div className="flex items-center gap-2 text-sm text-gray-500 mt-2"><Loader2 className="w-4 h-4 animate-spin" /> Processando…</div>}

          {previewItens.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium mb-2">{previewItens.length} itens encontrados</p>
              <div className="border rounded-md max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0"><tr>
                    <th className="text-left p-2">Cód.</th><th className="text-left p-2">Descrição</th>
                    <th className="text-right p-2">Criação</th><th className="text-right p-2">Finalização</th><th className="text-right p-2">Total</th>
                  </tr></thead>
                  <tbody>
                    {previewItens.slice(0, 400).map((it, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2 text-gray-500">{it.codigo}</td>
                        <td className="p-2">{it.descricao}{it.sob_orcamento && <span className="ml-1 text-amber-600">(sob orçamento)</span>}</td>
                        <td className="p-2 text-right">{fmtBRL(it.valor_criacao)}</td>
                        <td className="p-2 text-right">{fmtBRL(it.valor_finalizacao)}</td>
                        <td className="p-2 text-right font-medium">{fmtBRL(it.valor_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImport(false)}>Cancelar</Button>
            <Button onClick={confirmarImport} disabled={processando || previewItens.length === 0 || (!atualizarAlvo && !importMeta.nome)}>
              {atualizarAlvo ? 'Substituir' : 'Salvar'} {previewItens.length > 0 ? `(${previewItens.length} itens)` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Viewer de itens */}
      <Dialog open={!!viewTabela} onOpenChange={(o) => !o && setViewTabela(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{viewTabela?.nome}</DialogTitle></DialogHeader>
          {loadingItens ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input className="pl-9 h-8 text-sm" placeholder="Buscar item…" value={buscaItens} onChange={(e) => setBuscaItens(e.target.value)} />
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditando({ novo: true, descricao: '', codigo: '', categoria_nome: '', criacao: '', finalizacao: '', total: '' })}>
                  <Plus className="w-4 h-4 mr-1" /> Adicionar item
                </Button>
              </div>

              {editando && (
                <div className="border border-indigo-200 bg-indigo-50/40 rounded-md p-3 grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
                  <div className="col-span-2"><Label className="text-xs">Descrição *</Label><Input className="h-8 text-xs" value={editando.descricao} onChange={(e) => setEditando({ ...editando, descricao: e.target.value })} /></div>
                  <div><Label className="text-xs">Código</Label><Input className="h-8 text-xs" value={editando.codigo} onChange={(e) => setEditando({ ...editando, codigo: e.target.value })} /></div>
                  <div><Label className="text-xs">Categoria</Label><Input className="h-8 text-xs" value={editando.categoria_nome} onChange={(e) => setEditando({ ...editando, categoria_nome: e.target.value })} /></div>
                  <div><Label className="text-xs">Criação (R$)</Label><Input className="h-8 text-xs" placeholder="4.254,00" value={editando.criacao} onChange={(e) => setEditando({ ...editando, criacao: e.target.value })} /></div>
                  <div><Label className="text-xs">Finalização (R$)</Label><Input className="h-8 text-xs" placeholder="2.836,00" value={editando.finalizacao} onChange={(e) => setEditando({ ...editando, finalizacao: e.target.value })} /></div>
                  <div><Label className="text-xs">Total (R$)</Label><Input className="h-8 text-xs" placeholder="7.090,00" value={editando.total} onChange={(e) => setEditando({ ...editando, total: e.target.value })} /></div>
                  <div className="col-span-2 md:col-span-5 flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
                    <Button size="sm" onClick={salvarItem} disabled={salvandoItem || !editando.descricao.trim()}>
                      {salvandoItem ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                      {editando.novo ? 'Adicionar' : 'Salvar alteração'}
                    </Button>
                  </div>
                </div>
              )}

              <div className="border rounded-md max-h-[58vh] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0"><tr>
                    <th className="text-left p-2">Categoria</th><th className="text-left p-2">Cód.</th><th className="text-left p-2">Descrição</th>
                    <th className="text-right p-2">Criação</th><th className="text-right p-2">Finalização</th><th className="text-right p-2">Total</th>
                    <th className="w-16"></th>
                  </tr></thead>
                  <tbody>
                    {viewItens
                      .filter((it) => {
                        const q = buscaItens.trim().toLowerCase()
                        if (!q) return true
                        return it.descricao.toLowerCase().includes(q) || (it.codigo || '').toLowerCase().includes(q) || (it.categoria_nome || '').toLowerCase().includes(q)
                      })
                      .map((it) => (
                      <tr key={it.id} className={`border-t ${editando?.id === it.id ? 'bg-indigo-50' : ''}`}>
                        <td className="p-2 text-gray-400">{it.categoria_nome}</td>
                        <td className="p-2 text-gray-500">{it.codigo}</td>
                        <td className="p-2">{it.descricao}{it.sob_orcamento && <span className="ml-1 text-amber-600">(sob orçamento)</span>}</td>
                        <td className="p-2 text-right">{fmtBRL(it.valor_criacao)}</td>
                        <td className="p-2 text-right">{fmtBRL(it.valor_finalizacao)}</td>
                        <td className="p-2 text-right font-medium">{fmtBRL(it.valor_total)}</td>
                        <td className="p-2">
                          <div className="flex gap-1 justify-end">
                            <button title="Editar" onClick={() => setEditando({
                              id: it.id, novo: false,
                              descricao: it.descricao, codigo: it.codigo || '', categoria_nome: it.categoria_nome || '',
                              criacao: it.valor_criacao != null ? String(it.valor_criacao).replace('.', ',') : '',
                              finalizacao: it.valor_finalizacao != null ? String(it.valor_finalizacao).replace('.', ',') : '',
                              total: it.valor_total != null ? String(it.valor_total).replace('.', ',') : '',
                            })}><Pencil className="w-3.5 h-3.5 text-indigo-500" /></button>
                            <button title="Excluir" onClick={() => excluirItem(it)}><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

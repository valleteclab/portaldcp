'use client'

/**
 * DFD CONSOLIDADO — detalhe (unidade de planejamento).
 * Campos do DFD, itens somados com a origem de cada quantidade (o
 * planejamento ajusta antes de abrir), demandas de origem, alerta de
 * parecidos, PDF, 2ª aprovação (quando ligada em Configurações › Fluxo) e
 * "Abrir processo" (fase interna guiada ou feita fora).
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle, FileDown, Loader2, Lock, Plus, Rocket, Save, Send, Trash2, Undo2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ModuleGuard } from '@/components/ModuleGuard'
import { ModuloSistema } from '@/hooks/useModulosOrgao'
import { API_URL, authFetch } from '@/lib/api'
import { toast } from 'sonner'
import { confirmarAcao, pedirTextoAcao } from '@/components/DialogoGlobal'
import { type ModoFaseInterna, lembrarEscolhaModo, rotaFaseInternaFeitaFora, ultimaEscolhaModo } from '@/lib/fase-interna/criacao'
import { OpcoesModoFaseInterna } from '@/components/fase-interna/externa/EscolhaModoFaseInterna'
import { AlertaParecidos, COR_STATUS_DFD, ROTULO_STATUS_DFD, formatarMoeda, type Parecido } from '@/components/demandas/dfd-comum'

interface ItemDfd {
  chave: string
  numero: number
  categoria: string
  codigo_item_catalogo: string | null
  codigo_classe: string | null
  nome_classe: string | null
  descricao: string
  unidade_medida: string
  quantidade_somada: number
  quantidade: number
  valor_unitario_estimado: number
  valor_total_estimado: number
  origens: Array<{ demanda_id: string; setor: string; quantidade: number }>
  ajustado: boolean
  justificativa_ajuste: string | null
}

interface Dfd {
  id: string
  rotulo: string
  ano: number
  numero: number
  status: string
  origem: string
  objeto: string
  justificativa: string | null
  unidade_planejamento_id: string | null
  unidade_planejamento_nome: string | null
  responsavel_id: string | null
  responsavel_nome: string | null
  data_pretendida: string | null
  prioridade: string | null
  item_pca_id: string | null
  itens: ItemDfd[]
  ajustes: Record<string, { quantidade?: number; valor_unitario_estimado?: number; descricao?: string; justificativa?: string; remover?: boolean }>
  valor_total_estimado: number
  aprovacao: { por_nome: string; em: string; observacao: string | null } | null
  devolucao: { por_nome: string; em: string; motivo: string } | null
  historico: Array<{ em: string; por_nome: string | null; acao: string; texto: string }>
  demandas: Array<{ id: string; unidade_requisitante: string; descricao_sucinta_objeto: string | null; status: string; data_aprovacao: string | null; aprovado_por: string | null; n_itens: number; valor: number }>
  processo: { id: string; numero_processo: string; fase: string } | null
  alertas: Parecido[]
  permissoes: {
    pode_montar: boolean
    pode_aprovar_dfd: boolean
    exige_aprovacao_dfd: boolean
    aprovador_dfd: string
    responsavel_dfd: string
    editar: boolean
    enviar_aprovacao: boolean
    aprovar: boolean
    abrir_processo: boolean
    cancelar: boolean
  }
  opcoes: {
    setores: Array<{ id: string; nome: string }>
    usuarios: Array<{ id: string; nome: string; cargo: string | null }>
    itens_pca: Array<{ id: string; numero_item: number; descricao_objeto: string; ano: number }>
  }
}

const PRIORIDADES = [
  { v: 'URGENTE', r: 'Urgente' },
  { v: 'ALTA', r: 'Alta' },
  { v: 'MEDIA', r: 'Média' },
  { v: 'BAIXA', r: 'Baixa' },
]
const MODALIDADES = [
  { valor: 'DISPENSA_ELETRONICA', nome: 'Dispensa Eletrônica', desc: 'Art. 75 — contratação direta com disputa' },
  { valor: 'PREGAO_ELETRONICO', nome: 'Pregão Eletrônico', desc: 'Art. 28, I — bens e serviços comuns' },
  { valor: 'INEXIGIBILIDADE', nome: 'Inexigibilidade', desc: 'Art. 74 — inviabilidade de competição' },
  { valor: 'CONCORRENCIA', nome: 'Concorrência', desc: 'Art. 28, II — obras e serviços especiais' },
]
const dataHora = (s: string) => new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

async function lerErro(r: Response) {
  const j = await r.json().catch(() => null)
  return j?.message ? (Array.isArray(j.message) ? j.message.join(' ') : j.message) : `HTTP ${r.status}`
}

function DfdDetalhe() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [dfd, setDfd] = useState<Dfd | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState<Record<string, any>>({})
  const [ajustes, setAjustes] = useState<Dfd['ajustes']>({})
  const [disponiveis, setDisponiveis] = useState<Array<{ id: string; unidade_requisitante: string; descricao_sucinta_objeto?: string }>>([])
  const [paraIncluir, setParaIncluir] = useState('')
  const [modalAbrir, setModalAbrir] = useState(false)
  const [modalidade, setModalidade] = useState('DISPENSA_ELETRONICA')
  const [modo, setModo] = useState<ModoFaseInterna | null>(null)
  const [abrindo, setAbrindo] = useState(false)

  const aplicar = useCallback((d: Dfd) => {
    setDfd(d)
    setForm({
      objeto: d.objeto,
      justificativa: d.justificativa ?? '',
      unidade_planejamento_id: d.unidade_planejamento_id ?? '',
      responsavel_id: d.responsavel_id ?? '',
      data_pretendida: d.data_pretendida ?? '',
      prioridade: d.prioridade ?? '',
      item_pca_id: d.item_pca_id ?? '',
    })
    setAjustes(d.ajustes ?? {})
  }, [])

  const carregar = useCallback(async () => {
    const r = await authFetch(`${API_URL}/api/dfds-consolidados/${id}`)
    if (!r.ok) {
      toast.error(`DFD: ${await lerErro(r)}`)
      setCarregando(false)
      return
    }
    const d: Dfd = await r.json()
    aplicar(d)
    setCarregando(false)
    if (d.permissoes.editar) {
      const rd = await authFetch(`${API_URL}/api/dfds-consolidados/demandas-disponiveis?ano=${d.ano}`)
      setDisponiveis(rd.ok ? await rd.json() : [])
    }
  }, [id, aplicar])

  useEffect(() => {
    carregar()
  }, [carregar])

  const acao = async (url: string, corpo?: any, metodo = 'POST'): Promise<Dfd | null> => {
    setSalvando(true)
    try {
      const r = await authFetch(`${API_URL}/api/dfds-consolidados/${id}${url}`, {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      })
      if (!r.ok) throw new Error(await lerErro(r))
      const d: Dfd = await r.json()
      aplicar(d)
      return d
    } catch (e: any) {
      toast.error(e.message)
      return null
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-gray-400" aria-label="Carregando" /></div>
  if (!dfd) return <div className="p-6"><Link href="/orgao/demandas/consolidacao" className="text-blue-700 underline">Voltar aos DFDs</Link></div>

  const p = dfd.permissoes
  const editavel = p.editar
  const salvarCampos = async () => {
    const d = await acao('', { ...form, ajustes }, 'PUT')
    if (d) toast.success(`DFD salvo às ${new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}.`)
  }
  const ajustar = (chave: string, campo: string, valor: any) => setAjustes((a) => ({ ...a, [chave]: { ...(a[chave] ?? {}), [campo]: valor } }))
  const tirarDemanda = async (demandaId: string) => {
    if (!(await confirmarAcao({ titulo: 'Tirar a demanda do DFD', mensagem: 'A demanda volta a ficar livre (aprovada) e os itens dela saem do DFD.' }))) return
    await acao('', { demanda_ids: dfd.demandas.map((d) => d.id).filter((x) => x !== demandaId) }, 'PUT')
  }
  const incluirDemanda = async () => {
    if (!paraIncluir) return
    const d = await acao('', { demanda_ids: [...dfd.demandas.map((x) => x.id), paraIncluir] }, 'PUT')
    if (d) {
      setParaIncluir('')
      setDisponiveis((l) => l.filter((x) => x.id !== paraIncluir))
    }
  }
  const baixarPdf = async () => {
    const r = await authFetch(`${API_URL}/api/dfds-consolidados/${id}/pdf`)
    if (!r.ok) return toast.error(`PDF: ${await lerErro(r)}`)
    const url = URL.createObjectURL(await r.blob())
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  const devolver = async () => {
    const motivo = await pedirTextoAcao({ titulo: 'Motivo da devolução (vai para o planejamento e fica no histórico):' })
    if (motivo?.trim()) await acao('/devolver', { motivo: motivo.trim() })
  }
  const aprovar = async () => {
    if (!(await confirmarAcao({ titulo: 'Aprovar o DFD', mensagem: `Aprovar o ${dfd.rotulo}? Depois dele o processo pode ser aberto.` }))) return
    await acao('/aprovar', {})
  }
  const cancelar = async () => {
    const motivo = await pedirTextoAcao({ titulo: 'Motivo do cancelamento (as demandas voltam a ficar livres):' })
    if (motivo?.trim()) await acao('/cancelar', { motivo: motivo.trim() })
  }
  const abrirProcesso = async () => {
    if (!modo) return
    lembrarEscolhaModo(modo)
    if (modo === 'FORA') {
      router.push(rotaFaseInternaFeitaFora({ modalidade, dfdId: dfd.id }))
      return
    }
    setAbrindo(true)
    try {
      const r = await authFetch(`${API_URL}/api/dfds-consolidados/${id}/abrir-processo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modalidade }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`)
      if (j?.alerta) toast.warning(j.alerta, { duration: 12000 })
      router.push(`/orgao/processos/${j.licitacao.id}`)
    } catch (e: any) {
      toast.error(`Processo não aberto: ${e.message}`)
      setAbrindo(false)
    }
  }

  return (
    // min-w-0/w-full: nada (select com opção longa, tabela) empurra a página para o lado — rolagem só dentro da tabela
    <div className="p-3 sm:p-6 space-y-5 bg-gray-50 min-h-screen max-w-6xl w-full min-w-0 overflow-x-hidden">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-[1_1_280px]">
          <Link href="/orgao/demandas/consolidacao" className="text-sm text-blue-800 hover:underline inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> DFDs consolidados
          </Link>
          <h1 className="text-2xl font-bold mt-1 flex items-center gap-2 flex-wrap">
            {dfd.rotulo}
            <Badge className={COR_STATUS_DFD[dfd.status]}>{ROTULO_STATUS_DFD[dfd.status] ?? dfd.status}</Badge>
          </h1>
          <p className="text-sm text-gray-600 break-words">
            Documento de Formalização da Demanda — {dfd.demandas.length} demanda(s) de {[...new Set(dfd.demandas.map((d) => d.unidade_requisitante))].join(', ') || '—'}
          </p>
          {dfd.processo && (
            <p className="text-sm mt-1">
              Processo aberto: <Link href={`/orgao/processos/${dfd.processo.id}`} className="text-blue-700 underline">{dfd.processo.numero_processo}</Link>
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={baixarPdf}><FileDown className="h-4 w-4 mr-2" aria-hidden="true" />PDF do DFD</Button>
          {p.enviar_aprovacao && (
            <Button onClick={() => acao('/enviar-aprovacao')} disabled={salvando}><Send className="h-4 w-4 mr-2" aria-hidden="true" />Enviar para aprovação</Button>
          )}
          {p.aprovar && (
            <>
              <Button className="bg-green-600 hover:bg-green-700" onClick={aprovar} disabled={salvando}><CheckCircle className="h-4 w-4 mr-2" aria-hidden="true" />Aprovar</Button>
              <Button variant="outline" className="text-red-700 border-red-300" onClick={devolver} disabled={salvando}><Undo2 className="h-4 w-4 mr-2" aria-hidden="true" />Devolver</Button>
            </>
          )}
          {p.abrir_processo && (
            <Button className="bg-green-600 hover:bg-green-700" onClick={() => { setModo(ultimaEscolhaModo()); setModalAbrir(true) }} disabled={salvando}>
              <Rocket className="h-4 w-4 mr-2" aria-hidden="true" />Abrir processo
            </Button>
          )}
          {p.cancelar && (
            <Button variant="ghost" className="text-red-700" onClick={cancelar} disabled={salvando}><XCircle className="h-4 w-4 mr-2" aria-hidden="true" />Cancelar DFD</Button>
          )}
        </div>
      </div>

      {p.exige_aprovacao_dfd && ['RASCUNHO', 'AGUARDANDO_APROVACAO'].includes(dfd.status) && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          A 2ª aprovação do DFD está ligada neste órgão ({p.aprovador_dfd}): o processo só abre depois dela.
        </div>
      )}
      {dfd.devolucao && dfd.status === 'RASCUNHO' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          Devolvido por {dfd.devolucao.por_nome} em {dataHora(dfd.devolucao.em)}: <b>{dfd.devolucao.motivo}</b>
        </div>
      )}
      {dfd.aprovacao && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
          Aprovado por {dfd.aprovacao.por_nome} em {dataHora(dfd.aprovacao.em)}{dfd.aprovacao.observacao ? ` — ${dfd.aprovacao.observacao}` : ''}.
        </div>
      )}
      {!p.pode_montar && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2">
          <Lock className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" /> Só a unidade de planejamento altera o DFD e abre o processo ({p.responsavel_dfd}).
        </div>
      )}
      {dfd.status !== 'EM_PROCESSO' && <AlertaParecidos alertas={dfd.alertas} />}

      <Card>
        <CardHeader><CardTitle className="text-base">Dados do DFD</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 [&>*]:min-w-0">
          <div className="md:col-span-2">
            <label htmlFor="dfd-objeto" className="block text-sm font-medium mb-1">Objeto</label>
            <Textarea id="dfd-objeto" rows={2} value={form.objeto ?? ''} disabled={!editavel} onChange={(e) => setForm({ ...form, objeto: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="dfd-just" className="block text-sm font-medium mb-1">Justificativa consolidada da necessidade</label>
            <Textarea id="dfd-just" rows={5} value={form.justificativa ?? ''} disabled={!editavel} onChange={(e) => setForm({ ...form, justificativa: e.target.value })} />
          </div>
          <div>
            <label htmlFor="dfd-unidade" className="block text-sm font-medium mb-1">Unidade de planejamento</label>
            <select id="dfd-unidade" className="w-full min-w-0 max-w-full truncate border rounded-md h-9 px-2 bg-white" value={form.unidade_planejamento_id ?? ''} disabled={!editavel} onChange={(e) => setForm({ ...form, unidade_planejamento_id: e.target.value })}>
              <option value="">—</option>
              {dfd.opcoes.setores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="dfd-resp" className="block text-sm font-medium mb-1">Responsável</label>
            <select id="dfd-resp" className="w-full min-w-0 max-w-full truncate border rounded-md h-9 px-2 bg-white" value={form.responsavel_id ?? ''} disabled={!editavel} onChange={(e) => setForm({ ...form, responsavel_id: e.target.value })}>
              <option value="">—</option>
              {dfd.opcoes.usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}{u.cargo ? ` — ${u.cargo}` : ''}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="dfd-data" className="block text-sm font-medium mb-1">Data pretendida</label>
            <Input id="dfd-data" type="date" value={form.data_pretendida ?? ''} disabled={!editavel} onChange={(e) => setForm({ ...form, data_pretendida: e.target.value })} />
          </div>
          <div>
            <label htmlFor="dfd-prio" className="block text-sm font-medium mb-1">Prioridade</label>
            <select id="dfd-prio" className="w-full min-w-0 max-w-full truncate border rounded-md h-9 px-2 bg-white" value={form.prioridade ?? ''} disabled={!editavel} onChange={(e) => setForm({ ...form, prioridade: e.target.value })}>
              <option value="">—</option>
              {PRIORIDADES.map((x) => <option key={x.v} value={x.v}>{x.r}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="dfd-pca" className="block text-sm font-medium mb-1">Item do PCA (comum ao DFD)</label>
            <select id="dfd-pca" className="w-full min-w-0 max-w-full truncate border rounded-md h-9 px-2 bg-white" value={form.item_pca_id ?? ''} disabled={!editavel} onChange={(e) => setForm({ ...form, item_pca_id: e.target.value })}>
              <option value="">Sem item comum (o vínculo fica por item no processo)</option>
              {dfd.opcoes.itens_pca.map((i) => <option key={i.id} value={i.id}>PCA {i.ano} — item {i.numero_item}: {i.descricao_objeto}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Itens consolidados</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto min-w-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="py-2 pr-2">Nº</th>
                <th className="py-2 pr-2">Item</th>
                <th className="py-2 pr-2 text-right">Somado</th>
                <th className="py-2 pr-2 text-right">Quantidade do DFD</th>
                <th className="py-2 pr-2 text-right">Valor unit.</th>
                <th className="py-2 pr-2 text-right">Total</th>
                <th className="py-2 pr-2">De onde veio</th>
                {editavel && <th className="py-2" />}
              </tr>
            </thead>
            <tbody>
              {dfd.itens.map((i) => {
                const aj = ajustes[i.chave] ?? {}
                return (
                  <tr key={i.chave} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-2">{i.numero}</td>
                    <td className="py-2 pr-2">
                      <div>{i.descricao}</div>
                      <div className="text-xs text-gray-500">{i.codigo_item_catalogo ? `Cód. ${i.codigo_item_catalogo}` : i.nome_classe ? `Classe ${i.codigo_classe ?? ''} ${i.nome_classe}` : ''}</div>
                      {i.ajustado && <div className="text-xs text-amber-700">Ajustado pelo planejamento{i.justificativa_ajuste ? `: ${i.justificativa_ajuste}` : ''}</div>}
                      {editavel && (
                        <Input aria-label={`Justificativa do ajuste do item ${i.numero}`} className="mt-1 h-8 text-xs" placeholder="Por que ajustou (opcional)" value={aj.justificativa ?? ''} onChange={(e) => ajustar(i.chave, 'justificativa', e.target.value)} />
                      )}
                    </td>
                    <td className="py-2 pr-2 text-right">{Number(i.quantidade_somada).toLocaleString('pt-BR')} {i.unidade_medida}</td>
                    <td className="py-2 pr-2 text-right">
                      {editavel ? (
                        <Input aria-label={`Quantidade do item ${i.numero}`} type="number" min="0" step="any" className="h-8 w-24 ml-auto text-right" value={aj.quantidade ?? i.quantidade} onChange={(e) => ajustar(i.chave, 'quantidade', e.target.value)} />
                      ) : (
                        Number(i.quantidade).toLocaleString('pt-BR')
                      )}
                    </td>
                    <td className="py-2 pr-2 text-right">
                      {editavel ? (
                        <Input aria-label={`Valor unitário do item ${i.numero}`} type="number" min="0" step="0.01" className="h-8 w-28 ml-auto text-right" value={aj.valor_unitario_estimado ?? i.valor_unitario_estimado} onChange={(e) => ajustar(i.chave, 'valor_unitario_estimado', e.target.value)} />
                      ) : (
                        formatarMoeda(i.valor_unitario_estimado)
                      )}
                    </td>
                    <td className="py-2 pr-2 text-right">{formatarMoeda(i.valor_total_estimado)}</td>
                    <td className="py-2 pr-2 text-xs text-gray-600">{i.origens.map((o) => `${o.setor}: ${Number(o.quantidade).toLocaleString('pt-BR')}`).join('; ')}</td>
                    {editavel && (
                      <td className="py-2">
                        <Button variant="ghost" size="sm" aria-label={`Tirar o item ${i.numero} do DFD`} onClick={() => ajustar(i.chave, 'remover', true)}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="text-sm font-semibold text-right mt-2">Total estimado: {formatarMoeda(dfd.valor_total_estimado)}</p>
          {editavel && Object.entries(ajustes).some(([, a]) => a?.remover) && (
            <div className="mt-2 text-xs text-gray-600 space-y-1">
              <p className="font-medium">Itens retirados pelo planejamento (salve para aplicar):</p>
              {Object.entries(ajustes)
                .filter(([, a]) => a?.remover)
                .map(([chave]) => (
                  <div key={chave} className="flex items-center gap-2">
                    <span className="font-mono">{chave.replace(/^(COD|CLS):/, '').split('|').filter(Boolean).join(' · ')}</span>
                    <Button variant="ghost" size="sm" onClick={() => ajustar(chave, 'remover', false)}>Restaurar</Button>
                  </div>
                ))}
            </div>
          )}
          {editavel && (
            <div className="flex justify-end mt-3">
              <Button onClick={salvarCampos} disabled={salvando}>
                {salvando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4 mr-2" aria-hidden="true" />}
                Salvar dados e ajustes
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Demandas de origem</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {dfd.demandas.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 flex-wrap rounded-lg border bg-white p-3">
              <div className="min-w-0 flex-[1_1_220px]">
                <Link href={`/orgao/demandas/${d.id}`} className="font-medium text-blue-700 hover:underline">Demanda — {d.unidade_requisitante}</Link>
                <p className="text-sm text-gray-700 truncate">{d.descricao_sucinta_objeto || 'Sem descrição'}</p>
                <p className="text-xs text-gray-500">{d.n_itens} item(ns){d.aprovado_por ? ` • aprovada por ${d.aprovado_por}` : ''}{d.data_aprovacao ? ` em ${dataHora(d.data_aprovacao)}` : ''}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-semibold">{formatarMoeda(d.valor)}</span>
                {editavel && dfd.demandas.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => tirarDemanda(d.id)}>Tirar</Button>
                )}
              </div>
            </div>
          ))}
          {editavel && disponiveis.length > 0 && (
            <div className="flex gap-2 items-center pt-2 flex-wrap">
              <label htmlFor="dfd-incluir" className="sr-only">Incluir demanda aprovada</label>
              <select id="dfd-incluir" className="flex-1 min-w-0 max-w-full truncate border rounded-md h-9 px-2 bg-white" value={paraIncluir} onChange={(e) => setParaIncluir(e.target.value)}>
                <option value="">Incluir outra demanda aprovada…</option>
                {disponiveis.map((d) => <option key={d.id} value={d.id}>{d.unidade_requisitante} — {d.descricao_sucinta_objeto || 'sem descrição'}</option>)}
              </select>
              <Button variant="outline" onClick={incluirDemanda} disabled={!paraIncluir || salvando}><Plus className="h-4 w-4 mr-1" aria-hidden="true" />Incluir</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {dfd.historico.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Histórico</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {[...dfd.historico].reverse().map((h, n) => (
                <li key={n} className="text-gray-700 break-words">
                  <span className="text-gray-500">{dataHora(h.em)}</span> — {h.por_nome ?? 'Sistema'}: {h.texto}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Dialog open={modalAbrir} onOpenChange={setModalAbrir}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[92vh] overflow-y-auto">
          <h2 className="text-lg font-semibold">Abrir processo a partir do {dfd.rotulo}</h2>
          <p className="text-sm text-gray-600 -mt-1">
            O processo nasce com os itens consolidados ({dfd.itens.length}), o valor estimado de <b>{formatarMoeda(dfd.valor_total_estimado)}</b> e a peça
            DFD já preenchida (unidade, responsável, data pretendida, prioridade e PCA).
          </p>
          <AlertaParecidos alertas={dfd.alertas} />
          <div className="space-y-2">
            <p className="text-sm font-semibold">Modalidade da contratação</p>
            {MODALIDADES.map((m) => (
              <button key={m.valor} type="button" onClick={() => setModalidade(m.valor)}
                className={`w-full text-left border rounded-md px-3 py-2 hover:bg-gray-50 ${modalidade === m.valor ? 'border-blue-600 bg-blue-50' : ''}`}>
                <span className="text-sm font-medium">{m.nome}</span>
                <p className="text-xs text-gray-500">{m.desc}</p>
              </button>
            ))}
          </div>
          <OpcoesModoFaseInterna valor={modo} onChange={setModo} modalidade={modalidade} compacto />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setModalAbrir(false)} disabled={abrindo}>Cancelar</Button>
            <Button onClick={abrirProcesso} disabled={abrindo || !modo} className="bg-green-600 hover:bg-green-700">
              {abrindo ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : null}
              {modo === 'FORA' ? 'Continuar: dados, itens e PDFs →' : 'Abrir o processo'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function DfdConsolidadoDetalhePage() {
  return (
    <ModuleGuard modulo={ModuloSistema.DEMANDAS}>
      <DfdDetalhe />
    </ModuleGuard>
  )
}

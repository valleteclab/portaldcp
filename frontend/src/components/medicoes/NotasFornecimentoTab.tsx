'use client'

/**
 * Aba "Notas de fornecimento" da tela Medições.
 *
 * Aparece quando o órgão escolhe (Configurações › Dados do órgão) que a nota
 * fiscal das ordens de fornecimento chegue também, ou só, a quem cuida das
 * medições. Aqui a pessoa vê a nota e a situação do recebimento, imprime,
 * baixa o pacote, devolve ao fornecedor, colhe assinaturas num termo de atesto
 * e marca o envio à contabilidade. O aceite do material continua no Recebimento.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Archive, CheckCircle, Eye, FileText, Loader2, PenLine, Plus, Printer, RotateCcw, Search, Send, Trash2, X,
} from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { toast } from 'sonner'
import { confirmarAcao } from '@/components/DialogoGlobal'

export type DestinoNotaFornecimento = 'ALMOXARIFADO' | 'MEDICOES' | 'AMBOS'

interface Signatario { nome: string; papel: string | null; status: string; interno: boolean; data_assinatura: string | null }
export interface NotaFornecimento {
  id: string
  numero: string | null
  serie: string | null
  chave_acesso: string | null
  data_emissao: string | null
  valor_total: number | null
  status: string
  motivo_recusa: string | null
  recebida_em: string
  tem_pdf: boolean
  tem_xml: boolean
  qtd_itens: number
  ordem: { id: string; numero: string; descricao?: string | null } | null
  contrato: { id: string; numero?: string | null; objeto?: string | null } | null
  fornecedor: { razao_social: string; cpf_cnpj: string | null }
  recebimento: { status: string; rotulo: string; numero: string | null; aceito: boolean; data_aceite: string | null; tem_comprovante: boolean }
  assinatura: { documento_id: string; status: string; criado_em: string; signatarios: Signatario[] } | null
  contabilidade: { enviado_em: string; enviado_por: string | null } | null
  pode_devolver: boolean
  itens?: Array<{ descricao: string; unidade: string; quantidade: number; valor_unitario: number; valor_total: number }>
  historico?: Array<{ data: string; tipo: string; descricao: string; usuario: string }>
}
interface UsuarioOrgao { id: string; nome: string; cargo: string | null; fiscal: boolean }
interface LinhaSignatario { tipo: 'interno' | 'externo'; usuario_id: string; nome: string; email: string; cpf_cnpj: string; papel: string }

const BASE = `${API_URL}/api/notas-fornecimento`
const moeda = (v: number | null | undefined) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBr = (d: string | null | undefined, hora = false) => {
  if (!d) return '—'
  // data pura (AAAA-MM-DD) não passa por fuso
  if (!hora && /^\d{4}-\d{2}-\d{2}/.test(d)) { const [a, m, dia] = d.slice(0, 10).split('-'); return `${dia}/${m}/${a}` }
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleString('pt-BR', hora ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' })
}
const mensagemDeErro = async (res: Response, padrao: string) => {
  try { const j = await res.json(); return Array.isArray(j?.message) ? j.message.join(' ') : j?.message || padrao } catch { return padrao }
}
const linhaVazia = (): LinhaSignatario => ({ tipo: 'interno', usuario_id: '', nome: '', email: '', cpf_cnpj: '', papel: '' })

function SituacaoNota({ n }: { n: NotaFornecimento }) {
  if (n.status === 'RECUSADA') return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Devolvida ao fornecedor</Badge>
  if (n.contabilidade) return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Enviada à contabilidade</Badge>
  if (n.status === 'ERRO') return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Arquivo com erro</Badge>
  return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Recebida</Badge>
}
function SituacaoRecebimento({ n }: { n: NotaFornecimento }) {
  const cor = n.recebimento.aceito
    ? 'bg-emerald-100 text-emerald-700'
    : ['REJEITADO', 'ESTORNADO'].includes(n.recebimento.status) ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
  return <Badge className={`${cor} hover:${cor.split(' ')[0]}`}>{n.recebimento.rotulo}</Badge>
}
function SituacaoAssinatura({ n }: { n: NotaFornecimento }) {
  const a = n.assinatura
  if (!a || a.status === 'CANCELADO') return <span className="text-xs text-gray-400">Não solicitadas</span>
  const feitas = a.signatarios.filter((s) => s.status === 'ASSINADO').length
  if (a.status === 'CONCLUIDO') return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Assinado ({feitas}/{a.signatarios.length})</Badge>
  return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Aguardando ({feitas}/{a.signatarios.length})</Badge>
}

export default function NotasFornecimentoTab({ destino, onContagem }: { destino: DestinoNotaFornecimento; onContagem?: (n: number) => void }) {
  const [notas, setNotas] = useState<NotaFornecimento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<'pendentes' | 'todas' | 'devolvidas' | 'enviadas'>('pendentes')
  const [aberta, setAberta] = useState<NotaFornecimento | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [devolver, setDevolver] = useState<NotaFornecimento | null>(null)
  const [motivo, setMotivo] = useState('')
  const [assinar, setAssinar] = useState<NotaFornecimento | null>(null)
  const [linhas, setLinhas] = useState<LinhaSignatario[]>([linhaVazia()])
  const [usuarios, setUsuarios] = useState<UsuarioOrgao[]>([])

  const carregar = useCallback(async () => {
    try {
      const res = await authFetch(BASE)
      if (!res.ok) { toast.error(await mensagemDeErro(res, 'Não foi possível carregar as notas de fornecimento')); return }
      const j = await res.json()
      setNotas(j.notas || [])
    } finally {
      setCarregando(false)
    }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const pendente = (n: NotaFornecimento) => n.status !== 'RECUSADA' && !n.contabilidade
  useEffect(() => { onContagem?.(notas.filter(pendente).length) }, [notas, onContagem])

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return notas.filter((n) => {
      if (filtro === 'pendentes' && !pendente(n)) return false
      if (filtro === 'devolvidas' && n.status !== 'RECUSADA') return false
      if (filtro === 'enviadas' && !n.contabilidade) return false
      if (!t) return true
      return [n.numero, n.ordem?.numero, n.contrato?.numero, n.fornecedor.razao_social, n.fornecedor.cpf_cnpj]
        .some((v) => String(v || '').toLowerCase().includes(t))
    })
  }, [notas, busca, filtro])

  const atualizar = (n: NotaFornecimento) => {
    setNotas((ns) => ns.map((x) => (x.id === n.id ? { ...x, ...n } : x)))
    setAberta((a) => (a && a.id === n.id ? { ...a, ...n } : a))
  }

  const abrir = async (n: NotaFornecimento) => {
    setAberta(n)
    const res = await authFetch(`${BASE}/${n.id}`)
    if (res.ok) atualizar(await res.json())
  }

  /** Abre o arquivo numa aba (para ver e imprimir) ou baixa. */
  const arquivo = async (n: NotaFornecimento, tipo: 'pdf' | 'xml' | 'termo' | 'comprovante', baixar = false) => {
    setOcupado(`${tipo}-${n.id}`)
    try {
      const res = await authFetch(`${BASE}/${n.id}/arquivo/${tipo}${baixar ? '?baixar=1' : ''}`)
      if (!res.ok) { toast.error(await mensagemDeErro(res, 'Arquivo não disponível')); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      if (baixar) {
        const a = document.createElement('a')
        a.href = url
        a.download = `NF-${n.numero || n.id}.${tipo === 'xml' ? 'xml' : 'pdf'}`
        document.body.appendChild(a); a.click(); a.remove()
      } else {
        window.open(url, '_blank', 'noopener')
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } finally { setOcupado(null) }
  }

  const pacote = async (n: NotaFornecimento) => {
    setOcupado(`zip-${n.id}`)
    try {
      const res = await authFetch(`${BASE}/${n.id}/pacote`)
      if (!res.ok) { toast.error(await mensagemDeErro(res, 'Não foi possível gerar o pacote')); return }
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = `NF-${n.numero || n.id}-documentos.zip`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } finally { setOcupado(null) }
  }

  const confirmarDevolucao = async () => {
    if (!devolver) return
    if (motivo.trim().length < 5) { toast.error('Informe o motivo da devolução'); return }
    setOcupado(`dev-${devolver.id}`)
    try {
      const res = await authFetch(`${BASE}/${devolver.id}/devolver`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo: motivo.trim() }),
      })
      if (!res.ok) { toast.error(await mensagemDeErro(res, 'Não foi possível devolver a nota')); return }
      atualizar(await res.json())
      toast.success('Nota devolvida. O fornecedor foi avisado.')
      setDevolver(null); setMotivo('')
    } finally { setOcupado(null) }
  }

  const abrirAssinar = async (n: NotaFornecimento) => {
    setAssinar(n); setLinhas([linhaVazia()])
    if (usuarios.length === 0) {
      const res = await authFetch(`${BASE}/usuarios`)
      if (res.ok) setUsuarios(await res.json())
    }
  }
  const mudarLinha = (i: number, campos: Partial<LinhaSignatario>) =>
    setLinhas((ls) => ls.map((l, k) => (k === i ? { ...l, ...campos } : l)))

  const confirmarAssinaturas = async () => {
    if (!assinar) return
    const signatarios = linhas
      .filter((l) => (l.tipo === 'interno' ? l.usuario_id : l.nome.trim() || l.email.trim()))
      .map((l) => l.tipo === 'interno'
        ? { usuario_id: l.usuario_id, papel: l.papel.trim() || undefined }
        : { nome: l.nome.trim(), email: l.email.trim(), cpf_cnpj: l.cpf_cnpj, papel: l.papel.trim() || undefined })
    if (signatarios.length === 0) { toast.error('Escolha pelo menos uma pessoa para assinar'); return }
    setOcupado(`ass-${assinar.id}`)
    try {
      const res = await authFetch(`${BASE}/${assinar.id}/assinaturas`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signatarios }),
      })
      if (!res.ok) { toast.error(await mensagemDeErro(res, 'Não foi possível abrir a coleta de assinaturas')); return }
      atualizar(await res.json())
      toast.success('Termo de atesto gerado. As pessoas escolhidas foram avisadas para assinar.')
      setAssinar(null)
    } finally { setOcupado(null) }
  }

  const cancelarAssinaturas = async (n: NotaFornecimento) => {
    if (!(await confirmarAcao({ titulo: 'Cancelar a coleta de assinaturas?', mensagem: 'As assinaturas já feitas neste termo de atesto são descartadas.', destrutivo: true }))) return
    setOcupado(`can-${n.id}`)
    try {
      const res = await authFetch(`${BASE}/${n.id}/assinaturas`, { method: 'DELETE' })
      if (!res.ok) { toast.error(await mensagemDeErro(res, 'Não foi possível cancelar')); return }
      atualizar(await res.json())
      toast.success('Coleta de assinaturas cancelada.')
    } finally { setOcupado(null) }
  }

  const enviarContabilidade = async (n: NotaFornecimento) => {
    if (!(await confirmarAcao({ titulo: 'Enviar à contabilidade', mensagem: `Marcar a nota ${n.numero || ''} como enviada à contabilidade?` }))) return
    setOcupado(`cont-${n.id}`)
    try {
      const res = await authFetch(`${BASE}/${n.id}/enviado-contabilidade`, { method: 'PATCH' })
      if (!res.ok) { toast.error(await mensagemDeErro(res, 'Não foi possível marcar o envio')); return }
      atualizar(await res.json())
      toast.success('Nota marcada como enviada à contabilidade.')
    } finally { setOcupado(null) }
  }

  const coletaAberta = (n: NotaFornecimento) => n.assinatura?.status === 'AGUARDANDO_ASSINATURAS'
  const podeAssinar = (n: NotaFornecimento) => n.status !== 'RECUSADA' && !coletaAberta(n) && n.assinatura?.status !== 'CONCLUIDO'
  const temTermo = (n: NotaFornecimento) => !!n.assinatura && n.assinatura.status !== 'CANCELADO'

  if (carregando) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
  }

  return (
    <div className="space-y-4" data-testid="aba-notas-fornecimento">
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Notas fiscais enviadas pelos fornecedores nas ordens de fornecimento.{' '}
        {destino === 'AMBOS'
          ? 'O almoxarifado e o patrimônio continuam conferindo e aceitando o material em Recebimentos; aqui você acompanha, imprime, colhe as assinaturas e encaminha a nota.'
          : 'Este órgão encaminha as notas só para cá. A conferência e o aceite do material continuam na tela Recebimentos.'}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input className="pl-9" placeholder="Buscar por nota, ordem, contrato ou fornecedor" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 text-sm">
          {([['pendentes', 'A tratar'], ['enviadas', 'Enviadas à contabilidade'], ['devolvidas', 'Devolvidas'], ['todas', 'Todas']] as const).map(([k, rotulo]) => (
            <button key={k} type="button" onClick={() => setFiltro(k)}
              className={`px-3 py-1.5 rounded-md ${filtro === k ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nota</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Ordem / contrato</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Recebimento</TableHead>
              <TableHead>Assinaturas</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-sm text-gray-500">
                  {notas.length === 0 ? 'Nenhuma nota de fornecimento recebida ainda.' : 'Nenhuma nota neste filtro.'}
                </TableCell>
              </TableRow>
            )}
            {visiveis.map((n) => (
              <TableRow key={n.id}>
                <TableCell>
                  <div className="font-medium text-gray-900">NF {n.numero || 's/n'}{n.serie ? `/${n.serie}` : ''}</div>
                  <div className="text-xs text-gray-500">emitida em {dataBr(n.data_emissao)} · recebida em {dataBr(n.recebida_em, true)}</div>
                </TableCell>
                <TableCell className="max-w-[220px]"><div className="truncate" title={n.fornecedor.razao_social}>{n.fornecedor.razao_social}</div></TableCell>
                <TableCell>
                  <div>{n.ordem?.numero || '—'}</div>
                  <div className="text-xs text-gray-500">Contrato {n.contrato?.numero || '—'}</div>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">{moeda(n.valor_total)}</TableCell>
                <TableCell><SituacaoRecebimento n={n} /></TableCell>
                <TableCell><SituacaoAssinatura n={n} /></TableCell>
                <TableCell><SituacaoNota n={n} /></TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" title="Ver a nota" onClick={() => abrir(n)}><Eye className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" title="Abrir o PDF da nota para imprimir" disabled={!n.tem_pdf || ocupado === `pdf-${n.id}`} onClick={() => arquivo(n, 'pdf')}>
                      {ocupado === `pdf-${n.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="sm" title="Baixar o pacote de documentos" disabled={ocupado === `zip-${n.id}`} onClick={() => pacote(n)}>
                      {ocupado === `zip-${n.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* ============ DETALHE DA NOTA ============ */}
      <Dialog open={!!aberta} onOpenChange={(o) => { if (!o) setAberta(null) }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {aberta && (
            <>
              <DialogHeader>
                <DialogTitle>Nota fiscal {aberta.numero || 's/n'}{aberta.serie ? ` · série ${aberta.serie}` : ''}</DialogTitle>
                <DialogDescription>
                  {aberta.fornecedor.razao_social} · {aberta.ordem?.numero} · contrato {aberta.contrato?.numero || '—'}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div><div className="text-gray-500">Valor</div><div className="font-medium">{moeda(aberta.valor_total)}</div></div>
                <div><div className="text-gray-500">Emissão</div><div className="font-medium">{dataBr(aberta.data_emissao)}</div></div>
                <div className="col-span-2"><div className="text-gray-500">Chave de acesso</div><div className="font-mono text-xs break-all">{aberta.chave_acesso || '—'}</div></div>
                <div><div className="text-gray-500">Recebimento do material</div><div className="mt-0.5"><SituacaoRecebimento n={aberta} />{aberta.recebimento.numero ? <span className="ml-2 text-xs text-gray-500">{aberta.recebimento.numero}</span> : null}</div></div>
                <div><div className="text-gray-500">Situação da nota</div><div className="mt-0.5"><SituacaoNota n={aberta} /></div></div>
              </div>

              {aberta.status === 'RECUSADA' && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <strong>Devolvida ao fornecedor.</strong> Motivo: {aberta.motivo_recusa || '—'}
                </div>
              )}
              {aberta.contabilidade && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  Enviada à contabilidade em {dataBr(aberta.contabilidade.enviado_em, true)} por {aberta.contabilidade.enviado_por || '—'}.
                </div>
              )}

              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2">Arquivos</h4>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" disabled={!aberta.tem_pdf} onClick={() => arquivo(aberta, 'pdf')}><Printer className="w-4 h-4 mr-1.5" />Abrir e imprimir a nota</Button>
                  <Button variant="outline" size="sm" disabled={!aberta.tem_xml} onClick={() => arquivo(aberta, 'xml', true)}><FileText className="w-4 h-4 mr-1.5" />Baixar XML</Button>
                  <Button variant="outline" size="sm" disabled={!aberta.recebimento.tem_comprovante} onClick={() => arquivo(aberta, 'comprovante')}><CheckCircle className="w-4 h-4 mr-1.5" />Comprovante de aceite</Button>
                  <Button variant="outline" size="sm" disabled={!temTermo(aberta)} onClick={() => arquivo(aberta, 'termo')}><PenLine className="w-4 h-4 mr-1.5" />Termo de atesto</Button>
                  <Button variant="outline" size="sm" onClick={() => pacote(aberta)}><Archive className="w-4 h-4 mr-1.5" />Baixar tudo (ZIP)</Button>
                </div>
              </div>

              {aberta.itens && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">Itens da nota ({aberta.itens.length})</h4>
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <Table>
                      <TableHeader><TableRow><TableHead>Descrição</TableHead><TableHead className="text-right">Qtd.</TableHead><TableHead className="text-right">Unitário</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {aberta.itens.map((it, i) => (
                          <TableRow key={i}>
                            <TableCell>{it.descricao}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">{Number(it.quantidade).toLocaleString('pt-BR')} {it.unidade}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">{moeda(it.valor_unitario)}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">{moeda(it.valor_total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2">Assinaturas do termo de atesto</h4>
                {temTermo(aberta) ? (
                  <ul className="rounded-lg border border-gray-200 divide-y divide-gray-100 text-sm">
                    {aberta.assinatura!.signatarios.map((s, i) => (
                      <li key={i} className="flex items-center justify-between px-3 py-2">
                        <span>{s.nome}{s.papel ? <span className="text-gray-500"> · {s.papel}</span> : null}{!s.interno ? <span className="text-gray-400"> · por link no e-mail</span> : null}</span>
                        {s.status === 'ASSINADO'
                          ? <span className="text-emerald-700">Assinou em {dataBr(s.data_assinatura, true)}</span>
                          : <span className="text-amber-700">Aguardando</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500">
                    Nenhuma assinatura solicitada. Ao solicitar, o sistema gera um termo de atesto com os dados da nota e avisa cada pessoa para assinar.
                  </p>
                )}
              </div>

              <DialogFooter className="flex-wrap gap-2 sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  {aberta.pode_devolver && (
                    <Button variant="outline" className="text-red-700 border-red-200 hover:bg-red-50" onClick={() => { setDevolver(aberta); setMotivo('') }}>
                      <RotateCcw className="w-4 h-4 mr-1.5" />Devolver ao fornecedor
                    </Button>
                  )}
                  {coletaAberta(aberta) && (
                    <Button variant="outline" disabled={ocupado === `can-${aberta.id}`} onClick={() => cancelarAssinaturas(aberta)}>
                      <X className="w-4 h-4 mr-1.5" />Cancelar coleta de assinaturas
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {podeAssinar(aberta) && (
                    <Button variant="outline" onClick={() => abrirAssinar(aberta)}><PenLine className="w-4 h-4 mr-1.5" />Colher assinaturas</Button>
                  )}
                  {aberta.status !== 'RECUSADA' && !aberta.contabilidade && (
                    <Button className="bg-blue-600 hover:bg-blue-700" disabled={!aberta.recebimento.aceito || ocupado === `cont-${aberta.id}`}
                      title={aberta.recebimento.aceito ? '' : 'Disponível depois que o material for aceito no recebimento'}
                      onClick={() => enviarContabilidade(aberta)}>
                      <Send className="w-4 h-4 mr-1.5" />Enviar à contabilidade
                    </Button>
                  )}
                </div>
              </DialogFooter>
              {aberta.status !== 'RECUSADA' && !aberta.contabilidade && !aberta.recebimento.aceito && (
                <p className="text-xs text-gray-500 text-right -mt-2">O envio à contabilidade fica disponível depois que o material for aceito no recebimento.</p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ============ DEVOLVER ============ */}
      <Dialog open={!!devolver} onOpenChange={(o) => { if (!o) setDevolver(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Devolver a nota ao fornecedor</DialogTitle>
            <DialogDescription>
              O fornecedor é avisado com o motivo e envia uma nova nota pela ordem de fornecimento. Uma coleta de assinaturas em andamento é cancelada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo-devolucao-nf">Motivo</Label>
            <Textarea id="motivo-devolucao-nf" rows={4} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: CNPJ do destinatário diferente do contrato" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDevolver(null)}>Cancelar</Button>
            <Button className="bg-red-600 hover:bg-red-700" disabled={!!ocupado} onClick={confirmarDevolucao}>
              {ocupado?.startsWith('dev-') ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}Devolver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ COLHER ASSINATURAS ============ */}
      <Dialog open={!!assinar} onOpenChange={(o) => { if (!o) setAssinar(null) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Colher assinaturas</DialogTitle>
            <DialogDescription>
              O sistema gera o termo de atesto da nota {assinar?.numero || ''} e avisa cada pessoa. Usuário do órgão assina dentro do sistema, em Aprovações; pessoa de fora recebe um link por e-mail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {linhas.map((l, i) => (
              <div key={i} className="rounded-lg border border-gray-200 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex rounded-md border border-gray-200 p-0.5 text-xs">
                    <button type="button" className={`px-2 py-1 rounded ${l.tipo === 'interno' ? 'bg-blue-600 text-white' : 'text-gray-600'}`} onClick={() => mudarLinha(i, { tipo: 'interno' })}>Usuário do órgão</button>
                    <button type="button" className={`px-2 py-1 rounded ${l.tipo === 'externo' ? 'bg-blue-600 text-white' : 'text-gray-600'}`} onClick={() => mudarLinha(i, { tipo: 'externo' })}>Pessoa de fora</button>
                  </div>
                  {linhas.length > 1 && (
                    <Button variant="ghost" size="sm" title="Remover" onClick={() => setLinhas((ls) => ls.filter((_, k) => k !== i))}><Trash2 className="w-4 h-4 text-gray-500" /></Button>
                  )}
                </div>
                {l.tipo === 'interno' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label>Quem assina</Label>
                      <select className="w-full h-9 rounded-md border border-gray-200 bg-white px-2 text-sm" value={l.usuario_id}
                        onChange={(e) => { const u = usuarios.find((x) => x.id === e.target.value); mudarLinha(i, { usuario_id: e.target.value, papel: l.papel || u?.cargo || (u?.fiscal ? 'Fiscal do contrato' : '') }) }}>
                        <option value="">Selecione</option>
                        {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}{u.fiscal ? ' (fiscal)' : ''}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label>Papel no termo</Label>
                      <Input value={l.papel} onChange={(e) => mudarLinha(i, { papel: e.target.value })} placeholder="Ex.: Fiscal do contrato" />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1"><Label>Nome</Label><Input value={l.nome} onChange={(e) => mudarLinha(i, { nome: e.target.value })} /></div>
                    <div className="space-y-1"><Label>E-mail</Label><Input type="email" value={l.email} onChange={(e) => mudarLinha(i, { email: e.target.value })} /></div>
                    <div className="space-y-1"><Label>CPF</Label><Input value={l.cpf_cnpj} onChange={(e) => mudarLinha(i, { cpf_cnpj: e.target.value })} placeholder="000.000.000-00" /></div>
                    <div className="space-y-1"><Label>Papel no termo</Label><Input value={l.papel} onChange={(e) => mudarLinha(i, { papel: e.target.value })} placeholder="Ex.: Ordenador de despesa" /></div>
                  </div>
                )}
              </div>
            ))}
            {linhas.length < 10 && (
              <Button variant="outline" size="sm" onClick={() => setLinhas((ls) => [...ls, linhaVazia()])}><Plus className="w-4 h-4 mr-1.5" />Adicionar pessoa</Button>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssinar(null)}>Cancelar</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" disabled={!!ocupado} onClick={confirmarAssinaturas}>
              {ocupado?.startsWith('ass-') ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}Gerar termo e pedir assinaturas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

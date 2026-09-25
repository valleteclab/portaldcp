'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Award, Download, FileText, Loader2 } from 'lucide-react'
import { API_URL } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export interface ResultadoPublico {
  licitacaoId: string
  modalidade: string
  homologada: boolean
  dataHomologacao: string | null
  valorHomologado: number | null
  sessao: { id: string; status: string; etapa: string; ataDisponivel: boolean } | null
  ataDispensaDisponivel: boolean
  itens: Array<{
    numero: number
    lote: number | null
    descricao: string
    quantidade: number
    unidadeMedida: string
    status: string
    vencedor: { fornecedorId: string; razaoSocial: string; cpfCnpj: string } | null
    valorUnitario: number | null
    valorTotal: number | null
  }>
  contratos: Array<{ id: string; numero: string; fornecedor: string; cpfCnpj: string; valor: number; status: string; vigenciaInicio: string | null; vigenciaFim: string | null }>
  atas: Array<{ id: string; numero: string; fornecedor: string; cpfCnpj: string; valor: number; status: string; vigenciaInicio: string | null; vigenciaFim: string | null }>
  termos: Array<{ id: string; titulo: string; autoridade_nome: string; autoridade_cargo: string; efetivado_em: string | null; assinado: boolean }>
}

const moeda = (v?: number | null) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const data = (v?: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—')

const ROTULO_ITEM: Record<string, string> = {
  HOMOLOGADO: 'Homologado',
  ADJUDICADO: 'Adjudicado',
  DESERTO: 'Deserto',
  FRACASSADO: 'Fracassado',
  CANCELADO: 'Cancelado',
}

/** Carrega o resultado público (GET /api/resultado/publico/licitacao/:id). */
export function useResultadoPublico(licitacaoId?: string | null) {
  const [resultado, setResultado] = useState<ResultadoPublico | null>(null)
  const [carregando, setCarregando] = useState(true)
  useEffect(() => {
    if (!licitacaoId) return
    let ativo = true
    setCarregando(true)
    fetch(`${API_URL}/api/resultado/publico/licitacao/${licitacaoId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => ativo && setResultado(j))
      .catch(() => ativo && setResultado(null))
      .finally(() => ativo && setCarregando(false))
    return () => {
      ativo = false
    }
  }, [licitacaoId])
  return { resultado, carregando }
}

/**
 * RESULTADO DA LICITAÇÃO (plano E8 itens 8 e 10): ata da sessão (após o
 * encerramento), vencedor e valor por item, termos de adjudicação/homologação
 * e contratos/atas publicados — tudo depois da homologação (art. 71 IV).
 * Mesmo cartão no portal público, na sala e nas participações do fornecedor;
 * `destaqueFornecedorId` realça os itens do fornecedor logado.
 */
export function ResultadoLicitacaoCard({
  licitacaoId,
  destaqueFornecedorId,
  ocultarSeVazio,
}: {
  licitacaoId: string
  destaqueFornecedorId?: string | null
  /** Não renderiza nada antes da homologação e sem ata disponível. */
  ocultarSeVazio?: boolean
}) {
  const { resultado, carregando } = useResultadoPublico(licitacaoId)

  if (carregando) {
    return ocultarSeVazio ? null : (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando resultado...
        </CardContent>
      </Card>
    )
  }
  if (!resultado) return null

  const ataSessao = resultado.sessao?.ataDisponivel
  const vazio = !resultado.homologada && !ataSessao && !resultado.ataDispensaDisponivel
  if (vazio && ocultarSeVazio) return null

  const vencidos = destaqueFornecedorId ? resultado.itens.filter((i) => i.vencedor?.fornecedorId === destaqueFornecedorId) : []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="h-5 w-5 text-emerald-600" />
          Resultado
        </CardTitle>
        <CardDescription>
          {resultado.homologada
            ? `Homologada em ${data(resultado.dataHomologacao)}${resultado.valorHomologado != null ? ` — valor homologado ${moeda(resultado.valorHomologado)}` : ''}`
            : 'O vencedor e os valores são publicados após a homologação (Lei 14.133/2021, art. 71).'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {destaqueFornecedorId && resultado.homologada && (
          <div className={`rounded-lg border p-3 text-sm ${vencidos.length ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
            {vencidos.length
              ? `Você venceu ${vencidos.length} item(ns) — total ${moeda(vencidos.reduce((s, i) => s + (i.valorTotal ?? 0), 0))}.`
              : 'Você não foi vencedor nesta licitação.'}
          </div>
        )}

        {(ataSessao || resultado.ataDispensaDisponivel || resultado.termos.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {ataSessao && resultado.sessao && (
              <a href={`${API_URL}/api/sessao/${resultado.sessao.id}/ata`} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  <FileText className="mr-2 h-4 w-4" /> Ata da sessão
                </Button>
              </a>
            )}
            {resultado.ataDispensaDisponivel && (
              <a href={`${API_URL}/api/licitacoes/${licitacaoId}/dispensa/ata`} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  <FileText className="mr-2 h-4 w-4" /> Ata da sessão de lances (PDF)
                </Button>
              </a>
            )}
            {resultado.termos.map((t) => (
              <a key={t.id} href={`${API_URL}/api/resultado/publico/formalizacao/${t.id}/arquivo`} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" title={`${t.autoridade_nome} — ${t.autoridade_cargo}`}>
                  <Download className="mr-2 h-4 w-4" /> {t.titulo}
                  {t.assinado ? ' (assinado)' : ''}
                </Button>
              </a>
            ))}
          </div>
        )}

        {resultado.homologada && resultado.itens.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Vencedor</TableHead>
                  <TableHead className="text-right">Valor unitário</TableHead>
                  <TableHead className="text-right">Valor total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultado.itens.map((i) => {
                  const meu = !!destaqueFornecedorId && i.vencedor?.fornecedorId === destaqueFornecedorId
                  return (
                    <TableRow key={`${i.lote ?? ''}-${i.numero}`} className={meu ? 'bg-emerald-50' : undefined}>
                      <TableCell className="whitespace-nowrap">
                        {i.lote != null ? `Lote ${i.lote} · ` : ''}
                        {i.numero}
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate" title={i.descricao}>{i.descricao}</TableCell>
                      <TableCell>
                        {i.vencedor ? (
                          <div>
                            <div className="font-medium">{i.vencedor.razaoSocial || '—'}</div>
                            <div className="text-xs text-slate-500">{i.vencedor.cpfCnpj}</div>
                          </div>
                        ) : (
                          <Badge variant="outline">{ROTULO_ITEM[i.status] || 'Sem vencedor'}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{moeda(i.valorUnitario)}</TableCell>
                      <TableCell className="text-right font-medium">{moeda(i.valorTotal)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {(resultado.contratos.length > 0 || resultado.atas.length > 0) && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-slate-800">{resultado.atas.length > 0 ? 'Atas de registro de preços e contratos' : 'Contratos'}</h4>
            {resultado.atas.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
                <span>
                  Ata {a.numero} — {a.fornecedor} — {moeda(a.valor)} · vigência {data(a.vigenciaInicio)} a {data(a.vigenciaFim)}
                </span>
                <Link href={`/atas/${a.id}`} className="text-blue-700 hover:underline">Ver ata</Link>
              </div>
            ))}
            {resultado.contratos.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
                <span>
                  Contrato {c.numero} — {c.fornecedor} — {moeda(c.valor)} · vigência {data(c.vigenciaInicio)} a {data(c.vigenciaFim)}
                </span>
                <Link href={`/contratos/${c.id}`} className="text-blue-700 hover:underline">Ver contrato</Link>
              </div>
            ))}
          </div>
        )}

        {vazio && <p className="text-sm text-slate-500">Nenhum resultado publicado ainda.</p>}
      </CardContent>
    </Card>
  )
}

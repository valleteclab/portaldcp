'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertTriangle, ExternalLink, Loader2, RefreshCw, Scale, Search } from 'lucide-react'
import { API_URL, adminFetch } from '@/lib/api'

interface Linha {
  contrato_id: string
  numero_contrato: string
  fornecedor: string
  valor_global: number
  pago_exercicio: number
  medido_exercicio: number
  em_analise_exercicio: number
  migracao: number
  saldo_sistema: number
  diferenca: number
  situacao: 'OK' | 'DENTRO_DA_DEFASAGEM' | 'PAGO_SEM_MEDICAO' | 'PAGO_MAIOR_QUE_MEDIDO' | 'MEDIDO_MAIOR_QUE_PAGO' | 'SEM_PAGAMENTO_IDENTIFICADO'
  pago_ciclo_anterior: number
  corte_ciclo: string | null
  tolerancia: number
  quantidade_pagamentos: number
  quantidade_medicoes: number
  ordens_sem_medicao: number
  processo_portal_vazio: boolean
}

interface Detalhe {
  contrato: {
    id: string; numero_contrato: string; fornecedor: string; valor_global: number
    vigencia_inicio: string | null; vigencia_fim: string | null
    data_renovacao_ciclo: string | null; processo_licitatorio_portal: string | null
  }
  resumo: Linha
  pagamentos: Array<{ ciclo_anterior: boolean; numero_empenho: string; data: string; valor: number; bem_servico: string; os_citada?: string; confirmacao: string; medicao_do_mes: number | null }>
  medicoes: Array<{ id: string; numero_medicao: number; status: string; competencia: string | null; periodo_inicio: string | null; valor_medido: number; nota_fiscal_numero: string | null; lancamento_retroativo: boolean }>
  ordens_sem_medicao: Array<{ requisicao_id: string; numero: string; valor: number; data_solicitacao: string | null; pagamento: { numero_empenho: string; data: string; valor: number; motivo: string } | null }>
  itens_migracao: Array<{ numero_item: number; descricao: string; unidade_medida: string; quantidade: number; quantidade_medida: number; valor_unitario: number; valor_migracao_reais: number | null }>
}

const SITUACAO: Record<Linha['situacao'], { rotulo: string; cor: string }> = {
  OK: { rotulo: 'Batendo', cor: 'bg-green-100 text-green-800' },
  DENTRO_DA_DEFASAGEM: { rotulo: 'Defasagem de um mês', cor: 'bg-emerald-50 text-emerald-700' },
  PAGO_SEM_MEDICAO: { rotulo: 'Pago sem medição', cor: 'bg-red-100 text-red-800' },
  PAGO_MAIOR_QUE_MEDIDO: { rotulo: 'Pago > medido', cor: 'bg-amber-100 text-amber-800' },
  MEDIDO_MAIOR_QUE_PAGO: { rotulo: 'Medido > pago', cor: 'bg-blue-100 text-blue-800' },
  SEM_PAGAMENTO_IDENTIFICADO: { rotulo: 'Portal não identificou', cor: 'bg-gray-200 text-gray-700' },
}

const moeda = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)

export default function ConferenciaExecucaoPage() {
  const [orgaos, setOrgaos] = useState<Array<{ id: string; nome: string }>>([])
  const [orgaoId, setOrgaoId] = useState('')
  const [ano, setAno] = useState(String(new Date().getFullYear()))
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<'todos' | Linha['situacao']>('todos')
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null)
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false)

  useEffect(() => {
    adminFetch(`${API_URL}/api/orgaos`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const lista = Array.isArray(d) ? d : d?.data || []
        setOrgaos(lista.map((o: any) => ({ id: o.id, nome: o.nome_fantasia || o.nome })))
        if (lista.length === 1) setOrgaoId(lista[0].id)
      })
      .catch(() => setOrgaos([]))
  }, [])

  const conferir = useCallback(async () => {
    if (!orgaoId) return
    setCarregando(true)
    setErro('')
    try {
      const res = await adminFetch(`${API_URL}/api/admin/conferencia-execucao?orgaoId=${orgaoId}&ano=${ano}`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || 'Falha ao conferir')
      const data = await res.json()
      setLinhas(data.linhas || [])
    } catch (e: any) {
      setErro(e?.message || 'Falha ao conferir')
      setLinhas([])
    } finally {
      setCarregando(false)
    }
  }, [orgaoId, ano])

  const abrirDetalhe = async (contratoId: string) => {
    setCarregandoDetalhe(true)
    try {
      const res = await adminFetch(`${API_URL}/api/admin/conferencia-execucao/${contratoId}?ano=${ano}`)
      if (!res.ok) throw new Error('Falha ao abrir o contrato')
      setDetalhe(await res.json())
    } catch (e: any) {
      setErro(e?.message || 'Falha ao abrir o contrato')
    } finally {
      setCarregandoDetalhe(false)
    }
  }

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return linhas
      .filter((l) => filtro === 'todos' || l.situacao === filtro)
      .filter((l) => !q || `${l.numero_contrato} ${l.fornecedor}`.toLowerCase().includes(q))
      .sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca))
  }, [linhas, filtro, busca])

  const totais = useMemo(() => {
    const por = (s: Linha['situacao']) => linhas.filter((l) => l.situacao === s)
    return {
      pagoSemMedicao: por('PAGO_SEM_MEDICAO'),
      defasagem: por('DENTRO_DA_DEFASAGEM'),
      pagoMaior: por('PAGO_MAIOR_QUE_MEDIDO'),
      medidoMaior: por('MEDIDO_MAIOR_QUE_PAGO'),
      naoIdentificado: por('SEM_PAGAMENTO_IDENTIFICADO'),
      ok: por('OK'),
    }
  }, [linhas])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Scale className="w-6 h-6" /> Conferência com a contabilidade
          </h1>
          <p className="text-muted-foreground">
            Pagamentos do exercício no portal da transparência, comparados com as medições e o saldo do sistema.
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="w-64">
            <label className="text-xs text-muted-foreground">Órgão</label>
            <Select value={orgaoId} onValueChange={setOrgaoId}>
              <SelectTrigger><SelectValue placeholder="Selecione o órgão" /></SelectTrigger>
              <SelectContent>
                {orgaos.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-28">
            <label className="text-xs text-muted-foreground">Exercício</label>
            <Input value={ano} onChange={(e) => setAno(e.target.value.replace(/\D/g, '').slice(0, 4))} />
          </div>
          <Button onClick={conferir} disabled={!orgaoId || carregando}>
            {carregando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            {carregando ? 'Consultando o portal...' : 'Conferir'}
          </Button>
        </div>
      </div>

      {erro && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {erro}
        </div>
      )}

      {linhas.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {([
            ['Pago sem medição', totais.pagoSemMedicao, 'border-red-200'],
            ['Pago > medido', totais.pagoMaior, 'border-amber-200'],
            ['Medido > pago', totais.medidoMaior, 'border-blue-200'],
            ['Portal não identificou', totais.naoIdentificado, 'border-gray-200'],
            ['Defasagem de um mês', totais.defasagem, 'border-emerald-200'],
            ['Batendo', totais.ok, 'border-green-200'],
          ] as Array<[string, Linha[], string]>).map(([rotulo, itens, cor]) => (
            <Card key={rotulo} className={cor}>
              <CardHeader className="pb-1">
                <CardDescription className="text-xs">{rotulo}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{itens.length}</div>
                <div className="text-xs text-muted-foreground">
                  {moeda(itens.reduce((s, l) => s + Math.abs(l.diferenca), 0))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {linhas.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-base">Contratos vigentes — exercício {ano}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Só o ciclo vigente entra na conta: pagamentos anteriores à renovação aparecem à parte. Diferença de até uma competência é tratada como defasagem normal.
                </p>
              </div>
              <div className="flex gap-2 items-center">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input className="pl-8 w-64" placeholder="Contrato ou fornecedor" value={busca} onChange={(e) => setBusca(e.target.value)} />
                </div>
                <Select value={filtro} onValueChange={(v: any) => setFiltro(v)}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas as situações</SelectItem>
                    {Object.entries(SITUACAO).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.rotulo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contrato</TableHead>
                  <TableHead className="text-right">Pago {ano}</TableHead>
                  <TableHead className="text-right">Medido {ano}</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                  <TableHead className="text-right">Migração</TableHead>
                  <TableHead className="text-right">Saldo no sistema</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((l) => (
                  <TableRow key={l.contrato_id} className="cursor-pointer" onClick={() => abrirDetalhe(l.contrato_id)}>
                    <TableCell>
                      <div className="font-medium">{l.numero_contrato}</div>
                      <div className="text-xs text-muted-foreground">{l.fornecedor}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{moeda(l.pago_exercicio)}
                      <div className="text-xs text-muted-foreground">{l.quantidade_pagamentos} pgto(s)</div>
                      {l.pago_ciclo_anterior > 0 && (
                        <div className="text-xs text-muted-foreground" title={`Pago em ${ano} com competência anterior à renovação do ciclo em ${l.corte_ciclo}`}>
                          + {moeda(l.pago_ciclo_anterior)} do ciclo anterior
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{moeda(l.medido_exercicio)}
                      <div className="text-xs text-muted-foreground">{l.quantidade_medicoes} medição(ões)</div>
                    </TableCell>
                    <TableCell className={`text-right tabular-nums font-medium ${l.diferenca > 1 ? 'text-red-700' : l.diferenca < -1 ? 'text-blue-700' : ''}`}>
                      {moeda(l.diferenca)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{l.migracao ? moeda(l.migracao) : '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{moeda(l.saldo_sistema)}</TableCell>
                    <TableCell>
                      <Badge className={SITUACAO[l.situacao].cor}>{SITUACAO[l.situacao].rotulo}</Badge>
                      {l.ordens_sem_medicao > 0 && (
                        <div className="text-xs text-amber-700 mt-1">{l.ordens_sem_medicao} OS sem medição</div>
                      )}
                      {l.processo_portal_vazio && l.situacao === 'SEM_PAGAMENTO_IDENTIFICADO' && (
                        <div className="text-xs text-muted-foreground mt-1">sem processo do portal</div>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <a href={`/orgao/contratos/${l.contrato_id}?tab=medicao`} target="_blank" rel="noreferrer" className="text-blue-700 inline-flex items-center gap-1 text-sm">
                        abrir <ExternalLink className="w-3 h-3" />
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!detalhe || carregandoDetalhe} onOpenChange={(a) => { if (!a) setDetalhe(null) }}>
        <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
          {carregandoDetalhe && !detalhe ? (
            <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          ) : detalhe ? (
            <>
              <DialogHeader>
                <DialogTitle>{detalhe.contrato.numero_contrato} — {detalhe.contrato.fornecedor}</DialogTitle>
                <DialogDescription>
                  Contrato de {moeda(detalhe.contrato.valor_global)} · vigência {detalhe.contrato.vigencia_inicio} a {detalhe.contrato.vigencia_fim}
                  {detalhe.resumo.corte_ciclo ? ` · ciclo considerado desde ${detalhe.resumo.corte_ciclo}` : ''}
                  {detalhe.contrato.processo_licitatorio_portal ? ` · processo no portal ${detalhe.contrato.processo_licitatorio_portal}` : ' · sem processo do portal cadastrado'}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 sm:grid-cols-4 text-sm">
                {([
                  ['Pago no exercício', detalhe.resumo.pago_exercicio],
                  ['Medido no exercício', detalhe.resumo.medido_exercicio],
                  ['Em análise', detalhe.resumo.em_analise_exercicio],
                  ['Saldo no sistema', detalhe.resumo.saldo_sistema],
                ] as Array<[string, number]>).map(([r, v]) => (
                  <div key={r} className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">{r}</div>
                    <div className="font-semibold tabular-nums">{moeda(v)}</div>
                  </div>
                ))}
              </div>

              <section className="space-y-2">
                <h3 className="font-semibold text-sm">Pagamentos no portal ({detalhe.pagamentos.length})</h3>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Empenho</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Medição do mês</TableHead>
                        <TableHead>Histórico</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalhe.pagamentos.map((p, i) => (
                        <TableRow key={`${p.numero_empenho}-${i}`} className={p.ciclo_anterior ? 'opacity-60' : ''}>
                          <TableCell className="whitespace-nowrap">{p.numero_empenho || '—'}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {p.data}
                            {p.ciclo_anterior && <span className="block text-xs text-muted-foreground">ciclo anterior</span>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{moeda(p.valor)}</TableCell>
                          <TableCell className={p.medicao_do_mes || p.ciclo_anterior ? '' : 'text-red-700'}>
                            {p.medicao_do_mes ? moeda(p.medicao_do_mes) : p.ciclo_anterior ? '—' : 'sem medição'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[22rem] truncate" title={p.bem_servico}>
                            {p.os_citada ? `${p.os_citada} · ` : ''}{p.bem_servico}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="font-semibold text-sm">Medições ({detalhe.medicoes.length})</h3>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nº</TableHead>
                        <TableHead>Competência</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>NF</TableHead>
                        <TableHead>Situação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalhe.medicoes.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell>{m.numero_medicao}ª</TableCell>
                          <TableCell>{m.competencia || m.periodo_inicio || '—'}</TableCell>
                          <TableCell className="text-right tabular-nums">{moeda(m.valor_medido)}</TableCell>
                          <TableCell>{m.nota_fiscal_numero || '—'}</TableCell>
                          <TableCell>
                            {m.status}
                            {m.lancamento_retroativo && <Badge className="ml-2 bg-violet-100 text-violet-800">retroativa</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>

              {detalhe.ordens_sem_medicao.length > 0 && (
                <section className="space-y-2">
                  <h3 className="font-semibold text-sm">Ordens de serviço sem medição ({detalhe.ordens_sem_medicao.length})</h3>
                  <ul className="rounded-md border divide-y text-sm">
                    {detalhe.ordens_sem_medicao.map((o) => (
                      <li key={o.requisicao_id} className="p-3 flex justify-between gap-3">
                        <span>
                          <span className="font-medium">{o.numero}</span> · {moeda(o.valor)}
                          <span className="block text-xs text-muted-foreground">
                            {o.pagamento
                              ? `Pago: empenho ${o.pagamento.numero_empenho} em ${o.pagamento.data} (${o.pagamento.motivo})`
                              : 'Sem pagamento identificado na contabilidade'}
                          </span>
                        </span>
                        {o.pagamento && (
                          <a href={`/orgao/contratos/${detalhe.contrato.id}?tab=requisicoes`} target="_blank" rel="noreferrer" className="text-blue-700 text-sm whitespace-nowrap">
                            registrar medição
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {detalhe.itens_migracao.some((i) => i.quantidade_medida > 0) && (
                <section className="space-y-2">
                  <h3 className="font-semibold text-sm">Itens com execução registrada</h3>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Contratado</TableHead>
                          <TableHead className="text-right">Medido</TableHead>
                          <TableHead className="text-right">Saldo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detalhe.itens_migracao.map((i) => (
                          <TableRow key={i.numero_item}>
                            <TableCell className="max-w-[24rem]">
                              <span className="text-xs text-muted-foreground">{i.numero_item}</span> {i.descricao}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{i.quantidade} {i.unidade_medida}</TableCell>
                            <TableCell className="text-right tabular-nums">{i.quantidade_medida}</TableCell>
                            <TableCell className="text-right tabular-nums">{(i.quantidade - i.quantidade_medida).toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

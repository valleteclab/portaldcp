'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { ArrowLeft, Download, FileText, Fuel, Loader2, Pencil, RefreshCw } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import ConfiguracaoSiga from '@/components/siga/ConfiguracaoSiga'
import { baixarArquivoSiga } from '@/services/siga.service'

interface VeiculoSiga {
  id: string
  placa: string
  modelo: string
  marca: string
  ano: number
  tipo_combustivel: string
  chassi: string | null
  renavam: string | null
  ativo: boolean
  siga_tipo_veiculo: number | null
  siga_marca_veiculo: number | null
  alugado: boolean
  nota_fiscal_ou_contrato: string | null
  valor_aquisicao: number | null
  numero_empenho: string | null
  data_aquisicao: string | null
  data_baixa: string | null
  siga_enviado_em: string | null
  anterior_siga: boolean
  pendencias: string[]
  situacao: 'PRONTO' | 'PENDENTE' | 'ENVIADO'
}

interface Resumo {
  config_pendencias: string[]
  total: number
  prontos: number
  pendentes: number
  enviados: number
}

interface LinhaConsumo {
  veiculo_id: string | null
  placa: string
  combustivel: string
  litros: number
  custo: number
  abastecimentos: number
  pendencias: string[]
  avisos: string[]
}

interface PreviaCombustivel {
  competencia: string
  config_pendencias: string[]
  linhas: LinhaConsumo[]
  totais: {
    linhas: number
    linhas_no_arquivo: number
    linhas_com_pendencia: number
    litros: number
    custo: number
    litros_no_arquivo: number
    custo_no_arquivo: number
  }
}

const BASE = `${API_URL}/api/frota/siga`

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const fmtLitros = (v: number) => `${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} L`
const fmtData = (d: string | null) => (d ? d.split('T')[0].split('-').reverse().join('/') : '-')
const LABEL_COMB: Record<string, string> = { GASOLINA: 'Gasolina', ETANOL: 'Etanol', DIESEL: 'Diesel', FLEX: 'Flex', GNV: 'GNV', ELETRICO: 'Elétrico' }

/** Mês anterior em 'AAAA-MM' (horário de Brasília). */
function mesAnterior() {
  const agora = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - 1, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

async function lerErro(res: Response, padrao: string) {
  try {
    const json = await res.json()
    return Array.isArray(json.message) ? json.message.join(' ') : json.message || padrao
  } catch {
    return padrao
  }
}

const formVazio = {
  siga_tipo_veiculo: '', siga_marca_veiculo: '', alugado: false, nota_fiscal_ou_contrato: '',
  valor_aquisicao: '', numero_empenho: '', data_aquisicao: '', data_baixa: '',
  renavam: '', chassi: '', ano: '',
}

export default function FrotaSigaPage() {
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [veiculos, setVeiculos] = useState<VeiculoSiga[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const [editando, setEditando] = useState<VeiculoSiga | null>(null)
  const [form, setForm] = useState(formVazio)
  const [salvando, setSalvando] = useState(false)
  const [erroForm, setErroForm] = useState<string | null>(null)

  const [incluirEnviados, setIncluirEnviados] = useState(false)
  const [gerandoFrota, setGerandoFrota] = useState(false)
  const [confirmarIds, setConfirmarIds] = useState<string[] | null>(null)
  const [marcando, setMarcando] = useState(false)

  const [competencia, setCompetencia] = useState(mesAnterior())
  const [previa, setPrevia] = useState<PreviaCombustivel | null>(null)
  const [carregandoPrevia, setCarregandoPrevia] = useState(false)
  const [gerandoCombustivel, setGerandoCombustivel] = useState(false)

  const carregar = useCallback(async () => {
    setErro(null)
    try {
      const [r, v] = await Promise.all([authFetch(`${BASE}/resumo`), authFetch(`${BASE}/veiculos`)])
      if (!r.ok) throw new Error(await lerErro(r, 'Não foi possível carregar o resumo do SIGA.'))
      if (!v.ok) throw new Error(await lerErro(v, 'Não foi possível carregar os veículos.'))
      setResumo(await r.json())
      setVeiculos(await v.json())
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar.')
    } finally {
      setLoading(false)
    }
  }, [])

  const carregarPrevia = useCallback(async (comp: string) => {
    if (!/^\d{4}-\d{2}$/.test(comp)) return
    setCarregandoPrevia(true)
    try {
      const res = await authFetch(`${BASE}/combustivel/previa?competencia=${comp}`)
      if (!res.ok) throw new Error(await lerErro(res, 'Não foi possível carregar o consumo do mês.'))
      setPrevia(await res.json())
    } catch (e) {
      setPrevia(null)
      setErro(e instanceof Error ? e.message : 'Erro ao carregar o consumo.')
    } finally {
      setCarregandoPrevia(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { carregarPrevia(competencia) }, [competencia, carregarPrevia])

  function abrirEdicao(v: VeiculoSiga) {
    setEditando(v)
    setErroForm(null)
    setForm({
      siga_tipo_veiculo: v.siga_tipo_veiculo != null ? String(v.siga_tipo_veiculo) : '',
      siga_marca_veiculo: v.siga_marca_veiculo != null ? String(v.siga_marca_veiculo) : '',
      alugado: v.alugado,
      nota_fiscal_ou_contrato: v.nota_fiscal_ou_contrato || '',
      valor_aquisicao: v.valor_aquisicao != null ? String(v.valor_aquisicao) : '',
      numero_empenho: v.numero_empenho || '',
      data_aquisicao: v.data_aquisicao || '',
      data_baixa: v.data_baixa || '',
      renavam: v.renavam || '',
      chassi: v.chassi || '',
      ano: v.ano ? String(v.ano) : '',
    })
  }

  async function salvar() {
    if (!editando) return
    setSalvando(true)
    setErroForm(null)
    try {
      const res = await authFetch(`${BASE}/veiculos/${editando.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error(await lerErro(res, 'Não foi possível salvar.'))
      setEditando(null)
      await carregar()
      carregarPrevia(competencia)
    } catch (e) {
      setErroForm(e instanceof Error ? e.message : 'Erro ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function gerarFrota() {
    setGerandoFrota(true)
    setErro(null)
    setAviso(null)
    const qs = `somente_nao_enviados=${incluirEnviados ? 'false' : 'true'}`
    try {
      const idsRes = await authFetch(`${BASE}/arquivo-frota/ids?${qs}`)
      if (!idsRes.ok) throw new Error(await lerErro(idsRes, 'Não foi possível listar os veículos do arquivo.'))
      const { veiculo_ids } = await idsRes.json()
      await baixarArquivoSiga(`${BASE}/arquivo-frota?${qs}`, 'Frota.txt')
      const pendentesDeEnvio = veiculos
        .filter((v) => veiculo_ids.includes(v.id) && !v.siga_enviado_em)
        .map((v) => v.id)
      if (pendentesDeEnvio.length) setConfirmarIds(pendentesDeEnvio)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao gerar o arquivo.')
    } finally {
      setGerandoFrota(false)
    }
  }

  async function marcarEnviados() {
    if (!confirmarIds) return
    setMarcando(true)
    try {
      const res = await authFetch(`${BASE}/marcar-enviados`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ veiculo_ids: confirmarIds }),
      })
      if (!res.ok) throw new Error(await lerErro(res, 'Não foi possível marcar os veículos.'))
      const { marcados } = await res.json()
      setAviso(`${marcados} veículo(s) marcado(s) como enviado(s) ao SIGA.`)
      setConfirmarIds(null)
      await carregar()
      carregarPrevia(competencia)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao marcar.')
    } finally {
      setMarcando(false)
    }
  }

  async function gerarCombustivel() {
    if (previa && previa.totais.linhas_com_pendencia > 0) {
      const ok = window.confirm(
        `${previa.totais.linhas_com_pendencia} linha(s) com pendência NÃO entram no arquivo. Gerar mesmo assim?`,
      )
      if (!ok) return
    }
    setGerandoCombustivel(true)
    setErro(null)
    try {
      await baixarArquivoSiga(`${BASE}/combustivel/arquivo?competencia=${competencia}`, `Combustivel_${competencia.replace('-', '')}.txt`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao gerar o arquivo.')
    } finally {
      setGerandoCombustivel(false)
    }
  }

  const badgeSituacao = (v: VeiculoSiga) =>
    v.situacao === 'ENVIADO'
      ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Enviado</Badge>
      : v.situacao === 'PRONTO'
        ? <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Pronto</Badge>
        : <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pendente</Badge>

  const configPendente = (resumo?.config_pendencias.length ?? 0) > 0

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Link href="/orgao/frota">
            <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />Frota</Button>
          </Link>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />SIGA (TCM-BA) — Frota e Combustível
          </h1>
        </div>
        <Button variant="outline" onClick={() => { carregar(); carregarPrevia(competencia) }}>
          <RefreshCw className="w-4 h-4 mr-2" />Atualizar
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        O SIGA não recebe dados automaticamente: gere os arquivos aqui e importe-os no SIGA Captura.
        O cadastro da frota é enviado uma vez por veículo; o consumo de combustível, todo mês.
      </p>

      {erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      {aviso && <p role="status" className="rounded bg-green-50 p-3 text-sm text-green-800">{aviso}</p>}

      <ConfiguracaoSiga onChange={() => carregar()} />

      {/* ─── Resumo ─── */}
      {resumo && (
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { rotulo: 'Veículos', valor: resumo.total, cor: 'text-slate-800' },
            { rotulo: 'Prontos para enviar', valor: resumo.prontos, cor: 'text-blue-700' },
            { rotulo: 'Com pendências', valor: resumo.pendentes, cor: 'text-amber-700' },
            { rotulo: 'Já enviados', valor: resumo.enviados, cor: 'text-green-700' },
          ].map((c) => (
            <Card key={c.rotulo}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{c.rotulo}</p>
                <p className={`text-2xl font-bold ${c.cor}`}>{c.valor}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Veículos ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Veículos</CardTitle>
          <CardDescription>
            Complete os dados exigidos pelo SIGA. Só veículos sem pendências entram no arquivo de Frota.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : veiculos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nenhum veículo cadastrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Placa</TableHead>
                    <TableHead>Veículo</TableHead>
                    <TableHead>Tipo / Marca SIGA</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Aquisição</TableHead>
                    <TableHead>Pendências</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {veiculos.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono font-medium">{v.placa}</TableCell>
                      <TableCell className="text-sm">
                        {v.marca} {v.modelo} {v.ano}
                        <div className="text-xs text-muted-foreground">
                          {LABEL_COMB[v.tipo_combustivel] || v.tipo_combustivel} · {v.alugado ? 'Alugado' : 'Próprio'}
                          {!v.ativo && ' · inativo'}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {v.siga_tipo_veiculo ?? '—'} / {v.siga_marca_veiculo ?? '—'}
                      </TableCell>
                      <TableCell>
                        {badgeSituacao(v)}
                        {v.siga_enviado_em && (
                          <div className="text-xs text-muted-foreground mt-1">em {fmtData(v.siga_enviado_em)}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {fmtData(v.data_aquisicao)}
                        {v.anterior_siga && <div className="text-xs text-muted-foreground">anterior ao SIGA</div>}
                      </TableCell>
                      <TableCell className="text-xs text-amber-800 max-w-xs">
                        {v.pendencias.length ? v.pendencias.join('; ') : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => abrirEdicao(v)} aria-label={`Editar dados SIGA de ${v.placa}`}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Arquivo de Frota ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gerar arquivo de Frota</CardTitle>
          <CardDescription>
            Cadastro dos veículos (tabela 68). O SIGA cadastra por inclusão: cada veículo é enviado uma única vez.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Switch id="incluir-enviados" checked={incluirEnviados} onCheckedChange={setIncluirEnviados} />
            <Label htmlFor="incluir-enviados" className="text-sm">Incluir veículos já enviados (reenvio)</Label>
          </div>
          {configPendente && (
            <p className="text-sm text-amber-800">Preencha a configuração do SIGA acima para gerar o arquivo.</p>
          )}
          <Button onClick={gerarFrota} disabled={gerandoFrota || configPendente}>
            {gerandoFrota ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Gerar arquivo de Frota
          </Button>
        </CardContent>
      </Card>

      {/* ─── Consumo de combustível ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Fuel className="w-4 h-4" />Consumo de combustível (mensal)</CardTitle>
          <CardDescription>
            Informe mensal (tabela 70): litros e custo por veículo e combustível, a partir dos abastecimentos confirmados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1">
              <Label htmlFor="competencia">Competência</Label>
              <Input id="competencia" type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className="w-44" />
            </div>
            <Button onClick={gerarCombustivel} disabled={gerandoCombustivel || configPendente || !previa || previa.totais.linhas_no_arquivo === 0}>
              {gerandoCombustivel ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Gerar arquivo do mês
            </Button>
          </div>

          {carregandoPrevia ? (
            <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : previa && previa.linhas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum abastecimento registrado nesta competência.</p>
          ) : previa && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Placa</TableHead>
                    <TableHead>Combustível</TableHead>
                    <TableHead className="text-right">Abastecimentos</TableHead>
                    <TableHead className="text-right">Litros</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead>Observações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previa.linhas.map((l, i) => (
                    <TableRow key={`${l.veiculo_id ?? l.placa}-${l.combustivel}-${i}`} className={l.pendencias.length ? 'bg-amber-50/60' : undefined}>
                      <TableCell className="font-mono">{l.placa || '—'}</TableCell>
                      <TableCell>{l.combustivel}</TableCell>
                      <TableCell className="text-right">{l.abastecimentos}</TableCell>
                      <TableCell className="text-right font-mono">{fmtLitros(l.litros)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(l.custo)}</TableCell>
                      <TableCell className="text-xs">
                        {l.pendencias.length > 0 && (
                          <div className="text-amber-800">Não entra no arquivo: {l.pendencias.join('; ')}</div>
                        )}
                        {l.avisos.map((a) => <div key={a} className="text-blue-800">{a}</div>)}
                        {!l.pendencias.length && !l.avisos.length && <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold">
                    <TableCell colSpan={3}>
                      Total ({previa.totais.linhas_no_arquivo} de {previa.totais.linhas} linha(s) no arquivo)
                    </TableCell>
                    <TableCell className="text-right font-mono">{fmtLitros(previa.totais.litros_no_arquivo)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(previa.totais.custo_no_arquivo)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground font-normal">
                      {previa.totais.linhas_com_pendencia > 0 &&
                        `Total geral do mês: ${fmtLitros(previa.totais.litros)} · ${fmt(previa.totais.custo)}`}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Edição dos dados SIGA do veículo ─── */}
      <Dialog open={!!editando} onOpenChange={(aberto) => { if (!aberto) setEditando(null) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Dados do SIGA — {editando?.placa}</DialogTitle>
            <DialogDescription>{editando?.marca} {editando?.modelo}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="siga-tipo">Tipo de veículo (SIGA)</Label>
              <Input id="siga-tipo" inputMode="numeric" maxLength={2} value={form.siga_tipo_veiculo}
                onChange={(e) => setForm({ ...form, siga_tipo_veiculo: e.target.value.replace(/\D/g, '') })} />
              <p className="text-xs text-muted-foreground">Código da tabela do SIGA — consulte na tela de cadastro de frota do SIGA.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="siga-marca">Marca (SIGA)</Label>
              <Input id="siga-marca" inputMode="numeric" maxLength={3} value={form.siga_marca_veiculo}
                onChange={(e) => setForm({ ...form, siga_marca_veiculo: e.target.value.replace(/\D/g, '') })} />
              <p className="text-xs text-muted-foreground">Código da tabela do SIGA — consulte na tela de cadastro de frota do SIGA.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="siga-renavam">RENAVAM</Label>
              <Input id="siga-renavam" inputMode="numeric" value={form.renavam} onChange={(e) => setForm({ ...form, renavam: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="siga-chassi">Chassi</Label>
              <Input id="siga-chassi" value={form.chassi} onChange={(e) => setForm({ ...form, chassi: e.target.value.toUpperCase() })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="siga-ano">Ano de fabricação</Label>
              <Input id="siga-ano" inputMode="numeric" maxLength={4} value={form.ano}
                onChange={(e) => setForm({ ...form, ano: e.target.value.replace(/\D/g, '') })} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch id="siga-alugado" checked={form.alugado} onCheckedChange={(v) => setForm({ ...form, alugado: v })} />
              <Label htmlFor="siga-alugado">Veículo alugado (locação)</Label>
            </div>
            <div className="space-y-1">
              <Label htmlFor="siga-nf">{form.alugado ? 'Nº do contrato de locação' : 'Nº da nota fiscal de compra'}</Label>
              <Input id="siga-nf" maxLength={16} value={form.nota_fiscal_ou_contrato}
                onChange={(e) => setForm({ ...form, nota_fiscal_ou_contrato: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="siga-data-aq">{form.alugado ? 'Data do contrato de locação' : 'Data de aquisição'}</Label>
              <Input id="siga-data-aq" type="date" value={form.data_aquisicao}
                onChange={(e) => setForm({ ...form, data_aquisicao: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="siga-valor">Valor de aquisição (R$){form.alugado ? ' — opcional' : ''}</Label>
              <Input id="siga-valor" inputMode="decimal" value={form.valor_aquisicao}
                onChange={(e) => setForm({ ...form, valor_aquisicao: e.target.value })} placeholder="0,00" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="siga-empenho">Nº do empenho (campo do SIGA, opcional)</Label>
              <Input id="siga-empenho" value={form.numero_empenho}
                onChange={(e) => setForm({ ...form, numero_empenho: e.target.value })} placeholder="ex.: 577/2025" />
              <p className="text-xs text-muted-foreground">Vai só o número, sem zeros à esquerda.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="siga-baixa">Data de baixa (se houver)</Label>
              <Input id="siga-baixa" type="date" value={form.data_baixa}
                onChange={(e) => setForm({ ...form, data_baixa: e.target.value })} />
            </div>
          </div>
          {editando?.siga_enviado_em && (
            <p className="text-xs text-muted-foreground">
              Este veículo já foi enviado ao SIGA em {fmtData(editando.siga_enviado_em)}. Alterações aqui não atualizam o SIGA automaticamente.
            </p>
          )}
          {erroForm && <p role="alert" className="text-sm text-red-700">{erroForm}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Confirmação do envio ─── */}
      <Dialog open={!!confirmarIds} onOpenChange={(aberto) => { if (!aberto) setConfirmarIds(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arquivo de Frota gerado</DialogTitle>
            <DialogDescription>
              Depois de importar no SIGA Captura, confirme para marcar {confirmarIds?.length ?? 0} veículo(s) como enviado(s).
              Assim eles não entram de novo no próximo arquivo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmarIds(null)}>Ainda não importei</Button>
            <Button onClick={marcarEnviados} disabled={marcando}>
              {marcando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Importei — marcar como enviados
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

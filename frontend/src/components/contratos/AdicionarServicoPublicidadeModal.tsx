'use client'

import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Search, Plus, Trash2, Calculator, Download, Upload } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'

interface ItemTabela {
  id: string
  categoria_nome?: string | null
  codigo?: string | null
  descricao: string
  valor_criacao?: number | null
  valor_finalizacao?: number | null
  valor_total?: number | null
  sob_orcamento?: boolean
}

interface Remuneracao {
  desconto_tabela_pct?: number
  honorario_producao_pct?: number
  honorario_pesquisa_pct?: number
  honorario_terceiros_pct?: number
  honorario_reutilizacao_pct?: number
  desconto_agencia_pct?: number
}

type Linha =
  | { tipo: 'SINAPRO'; descricao: string; item_tabela_id: string; base: 'total' | 'criacao' | 'finalizacao'; quantidade: number; desconto_pct: number; precoUnit: number }
  | { tipo: 'TERCEIROS'; descricao: string; custo: number; honorario_pct: number; quantidade: number; precoUnit: number }
  | { tipo: 'MIDIA'; descricao: string; valor_midia: number; desconto_agencia_pct: number; quantidade: number; precoUnit: number }

interface Props {
  contratoId: string
  tabelaId?: string | null
  remuneracao?: Remuneracao | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated?: (itens: any[]) => void
}

const fmtBRL = (v: number | null | undefined) =>
  v == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v))
const r2 = (v: number) => Math.round(v * 100) / 100

export default function AdicionarServicoPublicidadeModal({ contratoId, tabelaId, remuneracao, open, onOpenChange, onCreated }: Props) {
  const rp = remuneracao || {}
  const [aba, setAba] = useState<'SINAPRO' | 'TERCEIROS' | 'MIDIA'>('SINAPRO')
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [salvando, setSalvando] = useState(false)

  // SINAPRO
  const [itensTabela, setItensTabela] = useState<ItemTabela[]>([])
  const [loadingTabela, setLoadingTabela] = useState(false)
  const [busca, setBusca] = useState('')
  const [selItem, setSelItem] = useState<ItemTabela | null>(null)
  const [base, setBase] = useState<'total' | 'criacao' | 'finalizacao'>('total')
  const [qtdSinapro, setQtdSinapro] = useState(1)

  // Terceiros
  const [tDesc, setTDesc] = useState('')
  const [tCusto, setTCusto] = useState('')
  const [tHonorario, setTHonorario] = useState<string>(String(rp.honorario_terceiros_pct ?? 8))
  const [tQtd, setTQtd] = useState(1)

  // Mídia
  const [mDesc, setMDesc] = useState('')
  const [mValor, setMValor] = useState('')
  const [mQtd, setMQtd] = useState(1)
  const descAgencia = rp.desconto_agencia_pct ?? 20
  const descTabela = rp.desconto_tabela_pct ?? 34

  useEffect(() => {
    if (!open) { setLinhas([]); setSelItem(null); setBusca(''); return }
    // Carrega a tabela ao abrir (necessária também para baixar modelo/importar planilha)
    if (tabelaId && itensTabela.length === 0) {
      setLoadingTabela(true)
      authFetch(`${API_URL}/api/contratos/tabelas-referencia/${tabelaId}/itens`)
        .then((r) => (r.ok ? r.json() : []))
        .then(setItensTabela)
        .finally(() => setLoadingTabela(false))
    }
  }, [open, tabelaId])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return itensTabela.slice(0, 60)
    return itensTabela.filter((it) => it.descricao.toLowerCase().includes(q) || (it.codigo || '').toLowerCase().includes(q)).slice(0, 60)
  }, [itensTabela, busca])

  const valorBaseSel = selItem ? (base === 'criacao' ? selItem.valor_criacao : base === 'finalizacao' ? selItem.valor_finalizacao : selItem.valor_total) : null
  const precoSinapro = valorBaseSel == null ? null : r2(Number(valorBaseSel) * (1 - descTabela / 100))

  const honorarios = [
    { pct: rp.honorario_producao_pct ?? 8, label: `Produção (${rp.honorario_producao_pct ?? 8}%)` },
    { pct: rp.honorario_pesquisa_pct ?? 7, label: `Pesquisa (${rp.honorario_pesquisa_pct ?? 7}%)` },
    { pct: rp.honorario_terceiros_pct ?? 8, label: `Outros terceiros (${rp.honorario_terceiros_pct ?? 8}%)` },
    { pct: rp.honorario_reutilizacao_pct ?? 4, label: `Reutilização (${rp.honorario_reutilizacao_pct ?? 4}%)` },
  ]

  const addSinapro = () => {
    if (!selItem || precoSinapro == null) return
    const sufixo = base === 'criacao' ? ' (Criação)' : base === 'finalizacao' ? ' (Finalização)' : ''
    setLinhas((p) => [...p, { tipo: 'SINAPRO', descricao: `${selItem.descricao}${sufixo}`, item_tabela_id: selItem.id, base, quantidade: qtdSinapro, desconto_pct: descTabela, precoUnit: precoSinapro }])
    setSelItem(null); setQtdSinapro(1)
  }
  const addTerceiros = () => {
    const custo = parseFloat(tCusto.replace(',', '.'))
    if (!tDesc.trim() || !custo || custo <= 0) return
    const h = parseFloat(tHonorario)
    setLinhas((p) => [...p, { tipo: 'TERCEIROS', descricao: tDesc.trim(), custo, honorario_pct: h, quantidade: tQtd, precoUnit: r2(custo * (1 + h / 100)) }])
    setTDesc(''); setTCusto(''); setTQtd(1)
  }
  const addMidia = () => {
    const valor = parseFloat(mValor.replace(',', '.'))
    if (!mDesc.trim() || !valor || valor <= 0) return
    setLinhas((p) => [...p, { tipo: 'MIDIA', descricao: mDesc.trim(), valor_midia: valor, desconto_agencia_pct: descAgencia, quantidade: mQtd, precoUnit: r2(valor * (1 - descAgencia / 100)) }])
    setMDesc(''); setMValor(''); setMQtd(1)
  }

  const totalGeral = linhas.reduce((s, l) => s + l.precoUnit * l.quantidade, 0)

  // ==========================================================================
  // Modelo de OS (CSV): baixar → fornecedor preenche → importar.
  // Governança: os valores são SEMPRE recalculados pela tabela do sistema
  // e pelos percentuais do contrato — nunca pelos valores do arquivo.
  // ==========================================================================
  const numBR = (s: string): number => {
    const t = (s || '').trim()
    if (!t) return 0
    const n = parseFloat(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
    return isNaN(n) ? 0 : n
  }

  const baixarModelo = () => {
    const fmtNum = (v: number | null | undefined) =>
      v == null ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const hProd = rp.honorario_producao_pct ?? 8
    const hPesq = rp.honorario_pesquisa_pct ?? 7
    const hTerc = rp.honorario_terceiros_pct ?? 8
    const hReut = rp.honorario_reutilizacao_pct ?? 4
    const out: string[] = [
      'tipo;codigo;referencia_tabela;base;quantidade;valor;servico_executado;ref_total;ref_criacao;ref_finalizacao;contrato_-' + descTabela + '%_(base_total)',
      '# Os valores finais sao SEMPRE calculados pela tabela vigente no sistema e pelos percentuais do contrato.',
      '#',
      '# ================= SECAO 1 - SERVICOS INTERNOS (TABELA SINAPRO - desconto ' + descTabela + '%) =================',
      '# Preencha QUANTIDADE e descreva em SERVICO_EXECUTADO o que foi feito (ex.: Criacao de arte - outdoor, 3 versoes).',
      '# BASE: total, criacao ou finalizacao. Valores de referencia nas colunas ref_* (informativas - nao altere).',
      '# Deixe a coluna VALOR vazia nesta secao: o sistema calcula pela tabela e pelo desconto do contrato.',
    ]
    for (const it of itensTabela) {
      if (it.sob_orcamento) continue
      const comDesconto = it.valor_total != null ? r2(Number(it.valor_total) * (1 - descTabela / 100)) : null
      out.push(
        `SINAPRO;${it.codigo || ''};${(it.descricao || '').replace(/[;\r\n]+/g, ' ')};total;;;;` +
        `${fmtNum(it.valor_total)};${fmtNum(it.valor_criacao)};${fmtNum(it.valor_finalizacao)};${fmtNum(comDesconto)}`,
      )
    }
    out.push(
      '#',
      '# ================= SECAO 2 - CUSTOS EXTERNOS / HONORARIOS (itens SEM valor de tabela) =================',
      `# Informe VALOR = custo do fornecedor externo e, na coluna BASE, o tipo de honorario do contrato:`,
      `#   producao (+${hProd}% - pecas/materiais, ex.: grafica) | pesquisa (+${hPesq}% - pre/pos-teste) | terceiros (+${hTerc}% - outros servicos) | reutilizacao (+${hReut}% - cache/direitos)`,
      '# Linhas sem VALOR sao ignoradas na importacao. Duplique linhas se precisar de mais.',
      'TERCEIROS;;;producao;1;;DESCREVA O SERVICO - ex.: Impressao de 6 outdoors (grafica);;;;',
      'TERCEIROS;;;producao;1;;DESCREVA O SERVICO;;;;',
      'TERCEIROS;;;pesquisa;1;;DESCREVA O SERVICO - ex.: Pesquisa pos-teste da campanha;;;;',
      'TERCEIROS;;;terceiros;1;;DESCREVA O SERVICO - ex.: Outro servico de terceiros sob supervisao;;;;',
      'TERCEIROS;;;reutilizacao;1;;DESCREVA O SERVICO - ex.: Reutilizacao de peca (cache/direitos);;;;',
      '#',
      `# ================= SECAO 3 - MIDIA / VEICULACAO (desconto de agencia de ${descAgencia}% repassado ao orgao) =================`,
      '# Informe VALOR = verba de veiculacao/locacao. O sistema aplica o desconto de agencia do contrato.',
      'MIDIA;;;;1;;DESCREVA A VEICULACAO - ex.: Locacao de pontos de outdoor;;;;',
      'MIDIA;;;;1;;DESCREVA A VEICULACAO - ex.: Locacao de paineis de LED;;;;',
      'MIDIA;;;;1;;DESCREVA A VEICULACAO - ex.: Trafego pago YouTube/Google/META;;;;',
    )
    const blob = new Blob(['﻿' + out.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'modelo-os-publicidade.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importarArquivo = async (file: File) => {
    const texto = await file.text()
    const linhasArq = texto.replace(/^﻿/, '').split(/\r?\n/)
    const novas: Linha[] = []
    const erros: string[] = []
    let ignoradas = 0
    for (const raw of linhasArq) {
      const l = raw.trim()
      if (!l || l.startsWith('#') || l.toLowerCase().startsWith('tipo;')) continue
      const c = l.split(';')
      const tipo = (c[0] || '').trim().toUpperCase()
      const codigo = (c[1] || '').trim().toLowerCase()
      const refTabela = (c[2] || '').trim()
      const baseCsv: string = (c[3] || '').trim().toLowerCase() || 'total'
      const qtd = numBR(c[4] || '')
      const valor = numBR(c[5] || '')
      // Descrição do serviço executado (coluna nova); arquivos antigos usavam a col. 3
      const servicoExec = ((c[6] || '').trim() || (tipo !== 'SINAPRO' ? refTabela : '')).trim()
      const upperExec = servicoExec.toUpperCase()
      if (upperExec.startsWith('EXEMPLO') || upperExec.startsWith('DESCREVA') || refTabela.toUpperCase().startsWith('EXEMPLO')) continue

      if (tipo === 'SINAPRO') {
        if (qtd <= 0) { ignoradas++; continue }
        const it = itensTabela.find((x) => (x.codigo || '').trim().toLowerCase() === codigo)
        if (!it) { erros.push(`Código "${c[1]}" não encontrado na tabela`); continue }
        const b: 'total' | 'criacao' | 'finalizacao' =
          baseCsv === 'criacao' || baseCsv === 'finalizacao' ? baseCsv : 'total'
        const vb = b === 'criacao' ? it.valor_criacao : b === 'finalizacao' ? it.valor_finalizacao : it.valor_total
        if (vb == null) { erros.push(`Código "${c[1]}": sem valor na base "${b}" (item sob orçamento?)`); continue }
        const sufixo = b === 'criacao' ? ' (Criação)' : b === 'finalizacao' ? ' (Finalização)' : ''
        // Serviço executado (descrição da OS) + referência SINAPRO rastreável
        const descricao = servicoExec
          ? `${servicoExec} — SINAPRO ${it.codigo || ''}${sufixo}`
          : `${it.descricao}${sufixo}`
        novas.push({ tipo: 'SINAPRO', descricao, item_tabela_id: it.id, base: b, quantidade: qtd, desconto_pct: descTabela, precoUnit: r2(Number(vb) * (1 - descTabela / 100)) })
      } else if (tipo === 'TERCEIROS') {
        if (!servicoExec || valor <= 0) { ignoradas++; continue }
        // Coluna BASE define o tipo de honorário do contrato
        const h =
          baseCsv === 'producao' ? (rp.honorario_producao_pct ?? 8)
          : baseCsv === 'pesquisa' ? (rp.honorario_pesquisa_pct ?? 7)
          : baseCsv === 'reutilizacao' ? (rp.honorario_reutilizacao_pct ?? 4)
          : (rp.honorario_terceiros_pct ?? 8)
        novas.push({ tipo: 'TERCEIROS', descricao: servicoExec, custo: valor, honorario_pct: h, quantidade: qtd > 0 ? qtd : 1, precoUnit: r2(valor * (1 + h / 100)) })
      } else if (tipo === 'MIDIA') {
        if (!servicoExec || valor <= 0) { ignoradas++; continue }
        novas.push({ tipo: 'MIDIA', descricao: servicoExec, valor_midia: valor, desconto_agencia_pct: descAgencia, quantidade: qtd > 0 ? qtd : 1, precoUnit: r2(valor * (1 - descAgencia / 100)) })
      } else if (tipo) {
        erros.push(`Tipo "${c[0]}" desconhecido (use SINAPRO, TERCEIROS ou MIDIA)`)
      }
    }
    if (novas.length > 0) setLinhas((p) => [...p, ...novas])
    const resumo = [`${novas.length} linha(s) importada(s).`]
    if (erros.length > 0) resumo.push(`\nProblemas:\n- ${erros.slice(0, 12).join('\n- ')}${erros.length > 12 ? `\n(+${erros.length - 12})` : ''}`)
    alert(resumo.join(''))
  }

  const gerar = async () => {
    if (linhas.length === 0) return
    setSalvando(true)
    try {
      const payload = {
        linhas: linhas.map((l) =>
          l.tipo === 'SINAPRO'
            ? { tipo: 'SINAPRO', item_tabela_id: l.item_tabela_id, base: l.base, quantidade: l.quantidade, desconto_pct: l.desconto_pct, descricao: l.descricao }
            : l.tipo === 'TERCEIROS'
            ? { tipo: 'TERCEIROS', descricao: l.descricao, custo: l.custo, honorario_pct: l.honorario_pct, quantidade: l.quantidade }
            : { tipo: 'MIDIA', descricao: l.descricao, valor_midia: l.valor_midia, desconto_agencia_pct: l.desconto_agencia_pct, quantidade: l.quantidade },
        ),
      }
      const res = await authFetch(`${API_URL}/api/contratos/tabelas-referencia/contrato/${contratoId}/gerar-linhas`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (res.ok) {
        onCreated?.(data.itens || [])
        onOpenChange(false)
      } else {
        alert(data.message || 'Erro ao gerar linhas.')
      }
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Calculator className="w-5 h-5" /> Adicionar serviço de publicidade</DialogTitle>
          <DialogDescription>
            SINAPRO (−{descTabela}%), serviços de terceiros (+honorário) ou mídia (−{descAgencia}%). As linhas viram itens do contrato para a OS.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 border-b flex-wrap">
          <div className="flex gap-1">
            {(['SINAPRO', 'TERCEIROS', 'MIDIA'] as const).map((t) => (
              <button key={t} onClick={() => setAba(t)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${aba === t ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'}`}>
                {t === 'SINAPRO' ? 'SINAPRO' : t === 'TERCEIROS' ? 'Terceiros' : 'Mídia'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 pb-1">
            <Button type="button" variant="ghost" size="sm" onClick={baixarModelo} disabled={itensTabela.length === 0} title="Baixa a planilha-modelo para o fornecedor preencher a OS">
              <Download className="w-4 h-4 mr-1" /> Modelo (CSV)
            </Button>
            <label className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md hover:bg-gray-100 cursor-pointer text-gray-700" title="Importa a planilha preenchida pelo fornecedor — valores recalculados pela tabela do sistema">
              <Upload className="w-4 h-4" /> Importar planilha
              <input type="file" accept=".csv,text/csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) importarArquivo(f); e.currentTarget.value = '' }} />
            </label>
          </div>
        </div>

        <div className="py-2">
          {aba === 'SINAPRO' && (
            !tabelaId ? (
              <p className="text-sm text-amber-700">Este contrato não tem tabela SINAPRO vinculada.</p>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input className="pl-9" placeholder="Buscar serviço na tabela…" value={busca} onChange={(e) => setBusca(e.target.value)} />
                </div>
                <div className="border rounded max-h-40 overflow-y-auto">
                  {loadingTabela ? <div className="p-4 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></div> :
                    filtrados.map((it) => (
                      <button key={it.id} onClick={() => setSelItem(it)} disabled={it.sob_orcamento}
                        className={`w-full text-left px-3 py-1.5 text-xs border-b hover:bg-indigo-50 ${selItem?.id === it.id ? 'bg-indigo-100' : ''} ${it.sob_orcamento ? 'opacity-40' : ''}`}>
                        <span className="text-gray-400">{it.codigo}</span> {it.descricao} <span className="text-gray-500">— {fmtBRL(it.valor_total)}</span>
                      </button>
                    ))}
                </div>
                {selItem && (
                  <div className="flex items-end gap-2 bg-gray-50 rounded p-2">
                    <div className="flex-1 text-xs"><span className="font-medium">{selItem.descricao}</span></div>
                    <div><Label className="text-xs">Base</Label>
                      <select value={base} onChange={(e) => setBase(e.target.value as any)} className="border rounded px-2 py-1 text-xs block">
                        <option value="total">Total</option>
                        {selItem.valor_criacao != null && <option value="criacao">Criação</option>}
                        {selItem.valor_finalizacao != null && <option value="finalizacao">Finalização</option>}
                      </select>
                    </div>
                    <div><Label className="text-xs">Qtd</Label><Input type="number" min="1" value={qtdSinapro} onChange={(e) => setQtdSinapro(parseInt(e.target.value) || 1)} className="h-8 w-16 text-xs" /></div>
                    <div className="text-xs"><Label className="text-xs">−{descTabela}%</Label><div className="font-semibold text-indigo-700 h-8 flex items-center">{fmtBRL(precoSinapro)}</div></div>
                    <Button size="sm" onClick={addSinapro}><Plus className="w-4 h-4" /></Button>
                  </div>
                )}
              </div>
            )
          )}

          {aba === 'TERCEIROS' && (
            <div className="flex items-end gap-2 flex-wrap bg-gray-50 rounded p-2">
              <div className="flex-1 min-w-[180px]"><Label className="text-xs">Descrição do serviço</Label><Input value={tDesc} onChange={(e) => setTDesc(e.target.value)} placeholder="Ex.: Impressão de folders (gráfica)" className="h-8 text-xs" /></div>
              <div><Label className="text-xs">Custo (R$)</Label><Input value={tCusto} onChange={(e) => setTCusto(e.target.value)} placeholder="1000,00" className="h-8 w-24 text-xs" /></div>
              <div><Label className="text-xs">Honorário</Label>
                <select value={tHonorario} onChange={(e) => setTHonorario(e.target.value)} className="border rounded px-2 py-1 text-xs block h-8">
                  {honorarios.map((h) => <option key={h.label} value={h.pct}>{h.label}</option>)}
                </select>
              </div>
              <div><Label className="text-xs">Qtd</Label><Input type="number" min="1" value={tQtd} onChange={(e) => setTQtd(parseInt(e.target.value) || 1)} className="h-8 w-16 text-xs" /></div>
              <div className="text-xs"><Label className="text-xs">+ honorário</Label><div className="font-semibold text-indigo-700 h-8 flex items-center">{tCusto ? fmtBRL(r2(parseFloat(tCusto.replace(',', '.') || '0') * (1 + parseFloat(tHonorario) / 100))) : '—'}</div></div>
              <Button size="sm" onClick={addTerceiros}><Plus className="w-4 h-4" /></Button>
            </div>
          )}

          {aba === 'MIDIA' && (
            <div className="flex items-end gap-2 flex-wrap bg-gray-50 rounded p-2">
              <div className="flex-1 min-w-[180px]"><Label className="text-xs">Descrição da veiculação</Label><Input value={mDesc} onChange={(e) => setMDesc(e.target.value)} placeholder="Ex.: 30 inserções rádio X" className="h-8 text-xs" /></div>
              <div><Label className="text-xs">Valor mídia (R$)</Label><Input value={mValor} onChange={(e) => setMValor(e.target.value)} placeholder="10000,00" className="h-8 w-28 text-xs" /></div>
              <div><Label className="text-xs">Qtd</Label><Input type="number" min="1" value={mQtd} onChange={(e) => setMQtd(parseInt(e.target.value) || 1)} className="h-8 w-16 text-xs" /></div>
              <div className="text-xs"><Label className="text-xs">−{descAgencia}%</Label><div className="font-semibold text-indigo-700 h-8 flex items-center">{mValor ? fmtBRL(r2(parseFloat(mValor.replace(',', '.') || '0') * (1 - descAgencia / 100))) : '—'}</div></div>
              <Button size="sm" onClick={addMidia}><Plus className="w-4 h-4" /></Button>
            </div>
          )}
        </div>

        {/* Linhas montadas */}
        <div className="flex-1 overflow-y-auto border rounded">
          {linhas.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">Nenhuma linha adicionada. Monte os serviços acima.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0"><tr>
                <th className="text-left p-2">Tipo</th><th className="text-left p-2">Descrição</th>
                <th className="text-right p-2">Preço unit.</th><th className="text-center p-2">Qtd</th><th className="text-right p-2">Total</th><th className="w-8"></th>
              </tr></thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2"><span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{l.tipo === 'SINAPRO' ? 'SINAPRO' : l.tipo === 'TERCEIROS' ? 'Terceiros' : 'Mídia'}</span></td>
                    <td className="p-2">{l.descricao}</td>
                    <td className="p-2 text-right">{fmtBRL(l.precoUnit)}</td>
                    <td className="p-2 text-center">{l.quantidade}</td>
                    <td className="p-2 text-right font-semibold">{fmtBRL(l.precoUnit * l.quantidade)}</td>
                    <td className="p-2"><button onClick={() => setLinhas((p) => p.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4 text-red-400" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between gap-4 sm:justify-between">
          <div className="text-sm"><span className="text-gray-500">{linhas.length} linha(s) · Total: </span><span className="font-bold text-indigo-700">{fmtBRL(totalGeral)}</span></div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={gerar} disabled={salvando || linhas.length === 0}>
              {salvando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Gerar {linhas.length} item(ns)
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  FileText,
  Download,
  Printer,
  Package,
  ArrowLeft,
  TrendingUp,
  DollarSign,
  BarChart2,
  CheckCircle,
} from 'lucide-react'

interface ItemContrato {
  id: string
  numero_item: number
  descricao: string
  descricao_detalhada?: string
  quantidade_contratada: number
  quantidade_empenhada: number
  quantidade_entregue: number
  saldo_disponivel: number
  valor_unitario: number
  valor_total: number
  unidade_medida: string
  lote_numero?: number
  lote_descricao?: string
  codigo_catalogo?: string
  codigo_catalogo_proprio?: string
}

interface Contrato {
  id: string
  numero_contrato: string
  ano: number
  objeto: string
  valor_inicial: number | string
  valor_global: number | string
  saldo_total_em_valor?: number
  valor_medido_total?: number
  data_assinatura: string
  data_vigencia_inicio: string
  data_vigencia_fim: string
  fornecedor_razao_social: string
  fornecedor_cnpj: string
  orgao: { nome: string; cnpj: string; cidade: string; uf: string }
  itens?: ItemContrato[]
}

interface TabRelatoriosProps {
  contrato: Contrato
}

const RELATORIOS = [
  {
    id: 'saldo_itens',
    titulo: 'Saldo de Itens do Contrato',
    descricao: 'Quantidade inicial, solicitada, entregue e saldo disponível por item, com valor executado e saldo financeiro.',
    icon: Package,
    badge: 'Disponível',
  },
]

function fmtMoeda(valor: number | string) {
  const n = typeof valor === 'string' ? parseFloat(valor) : Number(valor)
  return (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtNum(valor: number | string, decimais = 4) {
  const n = typeof valor === 'string' ? parseFloat(valor) : Number(valor)
  return (n || 0).toLocaleString('pt-BR', { maximumFractionDigits: decimais, minimumFractionDigits: 0 })
}

function fmtData(data: string) {
  if (!data) return '-'
  const d = data.split('T')[0].split('-')
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : '-'
}

export default function TabRelatorios({ contrato }: TabRelatoriosProps) {
  const [relatorioAtivo, setRelatorioAtivo] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)

  const itens = contrato.itens || []

  /* ── totais ── */
  const totalValorContratado = itens.reduce((s, i) => s + Number(i.valor_total), 0)
  const totalExecutado = itens.reduce((s, i) => s + Number(i.quantidade_entregue) * Number(i.valor_unitario), 0)
  const totalSaldoValor = itens.reduce((s, i) => s + Number(i.saldo_disponivel) * Number(i.valor_unitario), 0)
  const percExecGeral = totalValorContratado > 0 ? (totalExecutado / totalValorContratado) * 100 : 0

  /* ── PDF ── */
  async function exportarPDF() {
    setGerando(true)
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ])

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pageW = doc.internal.pageSize.width

      // Cabeçalho
      doc.setFillColor(19, 81, 180)
      doc.rect(0, 0, pageW, 18, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('RELATÓRIO DE SALDO DE ITENS DO CONTRATO', pageW / 2, 11, { align: 'center' })

      doc.setTextColor(30, 30, 30)
      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'normal')

      const info = [
        [`Órgão: ${contrato.orgao.nome}`, `CNPJ: ${contrato.orgao.cnpj}`],
        [`Contrato nº ${contrato.numero_contrato}/${contrato.ano}`, `Fornecedor: ${contrato.fornecedor_razao_social} — ${contrato.fornecedor_cnpj}`],
        [`Objeto: ${contrato.objeto}`, `Vigência: ${fmtData(contrato.data_vigencia_inicio)} a ${fmtData(contrato.data_vigencia_fim)}`],
        [`Valor Contratado (global): ${fmtMoeda(contrato.valor_global)}`, `Emitido em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`],
      ]

      let y = 24
      for (const [col1, col2] of info) {
        doc.text(col1, 10, y)
        doc.text(col2, pageW / 2 + 2, y)
        y += 5.5
      }

      // Linha separadora
      doc.setDrawColor(200, 200, 200)
      doc.line(10, y, pageW - 10, y)
      y += 4

      // Tabela de itens
      autoTable(doc, {
        startY: y,
        head: [[
          '#', 'Lote', 'Descrição', 'Unid.',
          'Qtd. Inicial', 'Solicitado', 'Entregue', 'Saldo Qtd.',
          '% Exec.', 'Valor Unit.', 'Valor Total', 'Valor Exec.', 'Saldo (R$)',
        ]],
        body: itens.map(item => {
          const valorExec = Number(item.quantidade_entregue) * Number(item.valor_unitario)
          const saldoVal = Number(item.saldo_disponivel) * Number(item.valor_unitario)
          const perc = Number(item.quantidade_contratada) > 0
            ? ((Number(item.quantidade_entregue) / Number(item.quantidade_contratada)) * 100).toFixed(1)
            : '0,0'
          return [
            item.numero_item,
            item.lote_numero ? `Lote ${item.lote_numero}` : '-',
            item.descricao,
            item.unidade_medida,
            fmtNum(item.quantidade_contratada),
            fmtNum(item.quantidade_empenhada),
            fmtNum(item.quantidade_entregue),
            fmtNum(item.saldo_disponivel),
            `${perc}%`,
            fmtMoeda(item.valor_unitario),
            fmtMoeda(item.valor_total),
            fmtMoeda(valorExec),
            fmtMoeda(saldoVal),
          ]
        }),
        foot: [[
          '', '', 'TOTAL GERAL', '', '', '', '', '', `${percExecGeral.toFixed(1)}%`,
          '', fmtMoeda(totalValorContratado), fmtMoeda(totalExecutado), fmtMoeda(totalSaldoValor),
        ]],
        styles: { fontSize: 7, cellPadding: 1.8 },
        headStyles: { fillColor: [19, 81, 180], textColor: 255, fontStyle: 'bold', halign: 'center' },
        footStyles: { fillColor: [235, 240, 255], textColor: [19, 81, 180], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 255] },
        columnStyles: {
          0: { halign: 'center', cellWidth: 8 },
          1: { halign: 'center', cellWidth: 14 },
          2: { cellWidth: 52 },
          3: { halign: 'center', cellWidth: 12 },
          4: { halign: 'right', cellWidth: 18 },
          5: { halign: 'right', cellWidth: 18 },
          6: { halign: 'right', cellWidth: 18 },
          7: { halign: 'right', cellWidth: 18 },
          8: { halign: 'center', cellWidth: 14 },
          9: { halign: 'right', cellWidth: 22 },
          10: { halign: 'right', cellWidth: 22 },
          11: { halign: 'right', cellWidth: 22 },
          12: { halign: 'right', cellWidth: 22 },
        },
      })

      // Rodapé de páginas
      const totalPags = (doc as any).internal.getNumberOfPages()
      for (let p = 1; p <= totalPags; p++) {
        doc.setPage(p)
        doc.setFontSize(7.5)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(120, 120, 120)
        const ph = doc.internal.pageSize.height
        doc.text(contrato.orgao.nome, 10, ph - 6)
        doc.text(`Página ${p} de ${totalPags}`, pageW - 10, ph - 6, { align: 'right' })
      }

      doc.save(`saldo-itens-${contrato.numero_contrato}-${contrato.ano}.pdf`)
    } finally {
      setGerando(false)
    }
  }

  /* ── Impressão HTML ── */
  function imprimirHTML() {
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>Saldo de Itens — Contrato ${contrato.numero_contrato}/${contrato.ano}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a1a; padding: 16px; }
  h1 { font-size: 15px; text-align: center; color: #1351B4; margin-bottom: 12px; text-transform: uppercase; letter-spacing: .5px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 20px; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 2px solid #1351B4; }
  .info-grid span { font-size: 10.5px; }
  .info-grid strong { color: #1351B4; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
  .card { border: 1px solid #dde3f0; border-radius: 6px; padding: 10px 12px; background: #f8faff; }
  .card .label { font-size: 9.5px; color: #666; text-transform: uppercase; letter-spacing: .3px; }
  .card .value { font-size: 14px; font-weight: bold; margin-top: 2px; }
  .card.green .value { color: #16a34a; }
  .card.blue .value { color: #1351B4; }
  .card.orange .value { color: #ea580c; }
  .card.purple .value { color: #7c3aed; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
  thead tr { background: #1351B4; color: #fff; }
  thead th { padding: 5px 4px; text-align: center; font-weight: bold; }
  tbody tr:nth-child(even) { background: #f0f4ff; }
  tbody tr:hover { background: #e0eaff; }
  td { padding: 4px; border-bottom: 1px solid #e5e7eb; }
  td.right { text-align: right; }
  td.center { text-align: center; }
  tfoot tr { background: #e8eeff; font-weight: bold; color: #1351B4; }
  tfoot td { padding: 5px 4px; border-top: 2px solid #1351B4; }
  .saldo-zero { color: #dc2626; }
  .saldo-ok { color: #16a34a; }
  .perc-bar-wrap { display: flex; align-items: center; gap: 4px; }
  .perc-bar { height: 6px; background: #e5e7eb; border-radius: 3px; flex: 1; overflow: hidden; }
  .perc-bar-fill { height: 100%; border-radius: 3px; background: #1351B4; }
  .footer { margin-top: 16px; font-size: 9px; color: #888; display: flex; justify-content: space-between; border-top: 1px solid #ddd; padding-top: 6px; }
  @media print {
    @page { size: A4 landscape; margin: 12mm; }
    body { padding: 0; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
<h1>Relatório de Saldo de Itens do Contrato</h1>
<div class="info-grid">
  <span><strong>Órgão:</strong> ${contrato.orgao.nome}</span>
  <span><strong>CNPJ:</strong> ${contrato.orgao.cnpj}</span>
  <span><strong>Contrato nº:</strong> ${contrato.numero_contrato}/${contrato.ano}</span>
  <span><strong>Fornecedor:</strong> ${contrato.fornecedor_razao_social}</span>
  <span><strong>Objeto:</strong> ${contrato.objeto}</span>
  <span><strong>CNPJ Fornecedor:</strong> ${contrato.fornecedor_cnpj}</span>
  <span><strong>Vigência:</strong> ${fmtData(contrato.data_vigencia_inicio)} a ${fmtData(contrato.data_vigencia_fim)}</span>
  <span><strong>Emitido em:</strong> ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</span>
</div>
<div class="summary">
  <div class="card blue"><div class="label">Valor Contratado (itens)</div><div class="value">${fmtMoeda(totalValorContratado)}</div></div>
  <div class="card green"><div class="label">Valor Executado</div><div class="value">${fmtMoeda(totalExecutado)}</div></div>
  <div class="card purple"><div class="label">Saldo Disponível (R$)</div><div class="value">${fmtMoeda(totalSaldoValor)}</div></div>
  <div class="card orange"><div class="label">% Executado</div><div class="value">${percExecGeral.toFixed(1)}%</div></div>
</div>
<table>
  <thead>
    <tr>
      <th>#</th><th>Lote</th><th style="text-align:left">Descrição</th><th>Unid.</th>
      <th>Qtd. Inicial</th><th>Solicitado</th><th>Entregue</th><th>Saldo Qtd.</th>
      <th>% Exec.</th><th>Valor Unit.</th><th>Valor Total</th><th>Valor Exec.</th><th>Saldo (R$)</th>
    </tr>
  </thead>
  <tbody>
    ${itens.map(item => {
      const valorExec = Number(item.quantidade_entregue) * Number(item.valor_unitario)
      const saldoVal = Number(item.saldo_disponivel) * Number(item.valor_unitario)
      const perc = Number(item.quantidade_contratada) > 0
        ? (Number(item.quantidade_entregue) / Number(item.quantidade_contratada) * 100)
        : 0
      return `<tr>
        <td class="center">${item.numero_item}</td>
        <td class="center">${item.lote_numero ? `Lote ${item.lote_numero}` : '-'}</td>
        <td>${item.descricao}${item.codigo_catalogo_proprio ? `<br/><small style="color:#7c3aed">Cat: ${item.codigo_catalogo_proprio}</small>` : ''}</td>
        <td class="center">${item.unidade_medida}</td>
        <td class="right">${fmtNum(item.quantidade_contratada)}</td>
        <td class="right" style="color:#d97706">${fmtNum(item.quantidade_empenhada)}</td>
        <td class="right" style="color:#16a34a">${fmtNum(item.quantidade_entregue)}</td>
        <td class="right ${Number(item.saldo_disponivel) <= 0 ? 'saldo-zero' : 'saldo-ok'}">${fmtNum(item.saldo_disponivel)}</td>
        <td class="center">
          <div class="perc-bar-wrap">
            <div class="perc-bar"><div class="perc-bar-fill" style="width:${Math.min(perc, 100)}%"></div></div>
            <span>${perc.toFixed(1)}%</span>
          </div>
        </td>
        <td class="right">${fmtMoeda(item.valor_unitario)}</td>
        <td class="right">${fmtMoeda(item.valor_total)}</td>
        <td class="right">${fmtMoeda(valorExec)}</td>
        <td class="right ${saldoVal <= 0 ? 'saldo-zero' : ''}">${fmtMoeda(saldoVal)}</td>
      </tr>`
    }).join('')}
  </tbody>
  <tfoot>
    <tr>
      <td colspan="4" style="text-align:right">TOTAL GERAL</td>
      <td></td><td></td><td></td><td></td>
      <td class="center">${percExecGeral.toFixed(1)}%</td>
      <td></td>
      <td class="right">${fmtMoeda(totalValorContratado)}</td>
      <td class="right">${fmtMoeda(totalExecutado)}</td>
      <td class="right">${fmtMoeda(totalSaldoValor)}</td>
    </tr>
  </tfoot>
</table>
<div class="footer">
  <span>${contrato.orgao.nome} — ${contrato.orgao.cidade}/${contrato.orgao.uf}</span>
  <span>Documento gerado pelo Portal DCP</span>
</div>
</body>
</html>`

    const w = window.open('', '_blank', 'width=1200,height=800')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 500)
  }

  /* ── Tela inicial: lista de relatórios ── */
  if (!relatorioAtivo) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold">Relatórios do Contrato</h3>
          <p className="text-sm text-gray-500 mt-1">
            Selecione um relatório para visualizar e exportar.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {RELATORIOS.map(rel => {
            const Icon = rel.icon
            return (
              <Card
                key={rel.id}
                className="cursor-pointer hover:shadow-md hover:border-blue-300 transition-all border-2"
                onClick={() => setRelatorioAtivo(rel.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <Icon className="w-6 h-6 text-blue-600" />
                    </div>
                    <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50">
                      {rel.badge}
                    </Badge>
                  </div>
                  <CardTitle className="text-base mt-3">{rel.titulo}</CardTitle>
                  <CardDescription className="text-xs">{rel.descricao}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button size="sm" className="w-full" onClick={() => setRelatorioAtivo(rel.id)}>
                    <FileText className="w-4 h-4 mr-2" />
                    Gerar Relatório
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    )
  }

  /* ── Relatório: Saldo de Itens ── */
  return (
    <div className="space-y-6">
      {/* Barra superior */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setRelatorioAtivo(null)}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Relatórios
          </Button>
          <div>
            <h3 className="text-lg font-semibold">Saldo de Itens do Contrato</h3>
            <p className="text-xs text-gray-500">
              {contrato.numero_contrato}/{contrato.ano} — {contrato.fornecedor_razao_social}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={imprimirHTML}>
            <Printer className="w-4 h-4 mr-2" />
            Imprimir / HTML
          </Button>
          <Button onClick={exportarPDF} disabled={gerando}>
            {gerando ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Gerando...
              </span>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Exportar PDF
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Cabeçalho do contrato */}
      <Card className="border-blue-100 bg-blue-50/40">
        <CardContent className="pt-4 pb-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-sm">
            <div><span className="text-gray-500 text-xs">Órgão</span><p className="font-medium">{contrato.orgao.nome}</p></div>
            <div><span className="text-gray-500 text-xs">Contrato</span><p className="font-medium">{contrato.numero_contrato}/{contrato.ano}</p></div>
            <div><span className="text-gray-500 text-xs">Fornecedor</span><p className="font-medium">{contrato.fornecedor_razao_social}</p></div>
            <div><span className="text-gray-500 text-xs">Vigência</span><p className="font-medium">{fmtData(contrato.data_vigencia_inicio)} a {fmtData(contrato.data_vigencia_fim)}</p></div>
            <div className="col-span-2 md:col-span-4 mt-1"><span className="text-gray-500 text-xs">Objeto</span><p className="font-medium text-sm leading-snug">{contrato.objeto}</p></div>
          </div>
        </CardContent>
      </Card>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-blue-600" />
              <span className="text-xs text-gray-500 uppercase tracking-wide">Valor Contratado</span>
            </div>
            <p className="text-xl font-bold text-blue-700">{fmtMoeda(totalValorContratado)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{itens.length} {itens.length === 1 ? 'item' : 'itens'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-xs text-gray-500 uppercase tracking-wide">Valor Executado</span>
            </div>
            <p className="text-xl font-bold text-green-700">{fmtMoeda(totalExecutado)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{itens.filter(i => Number(i.quantidade_entregue) > 0).length} itens com entrega</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart2 className="w-4 h-4 text-purple-600" />
              <span className="text-xs text-gray-500 uppercase tracking-wide">Saldo em Valor</span>
            </div>
            <p className={`text-xl font-bold ${totalSaldoValor < 0 ? 'text-red-600' : 'text-purple-700'}`}>
              {fmtMoeda(totalSaldoValor)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{itens.filter(i => Number(i.saldo_disponivel) <= 0).length} itens zerados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-orange-600" />
              <span className="text-xs text-gray-500 uppercase tracking-wide">% Executado</span>
            </div>
            <p className="text-xl font-bold text-orange-600">{percExecGeral.toFixed(1)}%</p>
            <div className="mt-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-400 rounded-full transition-all"
                style={{ width: `${Math.min(percExecGeral, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de itens */}
      {itens.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Package className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">Nenhum item cadastrado neste contrato.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-600" />
              Itens do Contrato
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#1351B4] text-white">
                    <th className="py-2.5 px-2 text-center font-semibold">#</th>
                    <th className="py-2.5 px-2 text-center font-semibold">Lote</th>
                    <th className="py-2.5 px-3 text-left font-semibold">Descrição</th>
                    <th className="py-2.5 px-2 text-center font-semibold">Unid.</th>
                    <th className="py-2.5 px-2 text-right font-semibold">Qtd. Inicial</th>
                    <th className="py-2.5 px-2 text-right font-semibold text-yellow-200">Solicitado</th>
                    <th className="py-2.5 px-2 text-right font-semibold text-green-200">Entregue</th>
                    <th className="py-2.5 px-2 text-right font-semibold">Saldo Qtd.</th>
                    <th className="py-2.5 px-2 text-center font-semibold">% Exec.</th>
                    <th className="py-2.5 px-2 text-right font-semibold">Valor Unit.</th>
                    <th className="py-2.5 px-2 text-right font-semibold">Valor Total</th>
                    <th className="py-2.5 px-2 text-right font-semibold text-green-200">Valor Exec.</th>
                    <th className="py-2.5 px-2 text-right font-semibold">Saldo (R$)</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((item, idx) => {
                    const valorExec = Number(item.quantidade_entregue) * Number(item.valor_unitario)
                    const saldoVal = Number(item.saldo_disponivel) * Number(item.valor_unitario)
                    const perc = Number(item.quantidade_contratada) > 0
                      ? (Number(item.quantidade_entregue) / Number(item.quantidade_contratada)) * 100
                      : 0

                    return (
                      <tr key={item.id} className={`border-b ${idx % 2 === 0 ? 'bg-white' : 'bg-blue-50/30'} hover:bg-blue-50`}>
                        <td className="py-2 px-2 text-center font-medium text-gray-600">{item.numero_item}</td>
                        <td className="py-2 px-2 text-center">
                          {item.lote_numero
                            ? <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px]">Lote {item.lote_numero}</span>
                            : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="py-2 px-3 max-w-xs">
                          <p className="font-medium text-gray-800 leading-snug">{item.descricao}</p>
                          {item.codigo_catalogo_proprio && (
                            <span className="text-[9px] bg-purple-50 text-purple-600 px-1 rounded">Cat: {item.codigo_catalogo_proprio}</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center text-gray-600">{item.unidade_medida}</td>
                        <td className="py-2 px-2 text-right font-medium">{fmtNum(item.quantidade_contratada)}</td>
                        <td className="py-2 px-2 text-right text-yellow-700">{fmtNum(item.quantidade_empenhada)}</td>
                        <td className="py-2 px-2 text-right text-green-700">{fmtNum(item.quantidade_entregue)}</td>
                        <td className="py-2 px-2 text-right font-semibold">
                          <span className={Number(item.saldo_disponivel) <= 0 ? 'text-red-600' : 'text-gray-800'}>
                            {fmtNum(item.saldo_disponivel)}
                          </span>
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden min-w-[28px]">
                              <div
                                className={`h-full rounded-full ${perc >= 100 ? 'bg-green-500' : perc >= 50 ? 'bg-blue-500' : 'bg-orange-400'}`}
                                style={{ width: `${Math.min(perc, 100)}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-gray-600 whitespace-nowrap">{perc.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right text-gray-600">{fmtMoeda(item.valor_unitario)}</td>
                        <td className="py-2 px-2 text-right font-semibold text-blue-700">{fmtMoeda(item.valor_total)}</td>
                        <td className="py-2 px-2 text-right text-green-700">{fmtMoeda(valorExec)}</td>
                        <td className="py-2 px-2 text-right font-semibold">
                          <span className={saldoVal < 0 ? 'text-red-600' : 'text-purple-700'}>
                            {fmtMoeda(saldoVal)}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-blue-50 border-t-2 border-blue-300 font-bold text-blue-800">
                    <td colSpan={4} className="py-2.5 px-3 text-right text-xs">TOTAL GERAL</td>
                    <td className="py-2.5 px-2 text-right text-xs">
                      {fmtNum(itens.reduce((s, i) => s + Number(i.quantidade_contratada), 0))}
                    </td>
                    <td className="py-2.5 px-2 text-right text-xs">
                      {fmtNum(itens.reduce((s, i) => s + Number(i.quantidade_empenhada), 0))}
                    </td>
                    <td className="py-2.5 px-2 text-right text-xs">
                      {fmtNum(itens.reduce((s, i) => s + Number(i.quantidade_entregue), 0))}
                    </td>
                    <td className="py-2.5 px-2 text-right text-xs">
                      {fmtNum(itens.reduce((s, i) => s + Number(i.saldo_disponivel), 0))}
                    </td>
                    <td className="py-2.5 px-2 text-center text-xs">{percExecGeral.toFixed(1)}%</td>
                    <td className="py-2.5 px-2"></td>
                    <td className="py-2.5 px-2 text-right text-xs">{fmtMoeda(totalValorContratado)}</td>
                    <td className="py-2.5 px-2 text-right text-xs text-green-700">{fmtMoeda(totalExecutado)}</td>
                    <td className="py-2.5 px-2 text-right text-xs text-purple-700">{fmtMoeda(totalSaldoValor)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="px-4 py-2 border-t text-[10px] text-gray-400 flex justify-between">
              <span>Gerado em {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR')}</span>
              <span>Portal DCP — {contrato.orgao.nome}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

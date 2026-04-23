'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { API_URL, authFetch } from '@/lib/api'
import {
  ArrowLeft,
  BarChart2,
  CheckCircle,
  ClipboardList,
  DollarSign,
  Download,
  FileText,
  Package,
  Printer,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Wrench,
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

interface PedidoDocumento {
  id: string
  numero: string
  tipo: string
  status: string
  valor_total: number
  data_documento: string | null
  data_prazo?: string | null
  requisicao_origem_id?: string | null
  empenhos: string[]
}

interface RelatorioPedidosData {
  contrato: {
    id: string
    numero_contrato: string
    ano: number
    objeto: string
    data_vigencia_inicio: string
    data_vigencia_fim: string
    fornecedor_razao_social: string
    fornecedor_cnpj: string
    orgao: { nome: string; cnpj: string; cidade: string; uf: string } | null
  }
  resumo: {
    total_ordens_fornecimento: number
    total_requisicoes: number
    total_ordens_servico: number
    total_documentos: number
    total_empenhos_vinculados: number
  }
  secoes: {
    ordens_fornecimento: PedidoDocumento[]
    requisicoes: PedidoDocumento[]
    ordens_servico: PedidoDocumento[]
  }
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
  {
    id: 'pedidos',
    titulo: 'Relatório de Pedidos',
    descricao: 'Ordens de Fornecimento, Requisições e Ordens de Serviço com os empenhos vinculados em cada documento.',
    icon: ClipboardList,
    badge: 'Novo',
  },
] as const

function fmtMoeda(valor: number | string) {
  const n = typeof valor === 'string' ? parseFloat(valor) : Number(valor)
  return (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtNum(valor: number | string, decimais = 4) {
  const n = typeof valor === 'string' ? parseFloat(valor) : Number(valor)
  return (n || 0).toLocaleString('pt-BR', { maximumFractionDigits: decimais, minimumFractionDigits: 0 })
}

function fmtData(data?: string | null) {
  if (!data) return '-'
  const base = data.includes('T') ? data.split('T')[0] : data
  const partes = base.split('-')
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : '-'
}

function statusLabel(status?: string | null) {
  return (status || '-')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, letra => letra.toUpperCase())
}

function joinEmpenhos(empenhos: string[]) {
  return empenhos.length ? empenhos.join(', ') : 'Sem empenho vinculado'
}

function getStatusClasses(status?: string | null) {
  const texto = status || ''
  if (['ATENDIDA', 'ATENDIDA_PARCIAL', 'CONCLUIDA', 'ACEITA', 'AUTORIZADA', 'ENVIADA', 'EMITIDA'].includes(texto)) {
    return 'bg-green-50 text-green-700 border-green-200'
  }
  if (['CANCELADA', 'NEGADA', 'REJEITADA'].includes(texto)) {
    return 'bg-red-50 text-red-700 border-red-200'
  }
  return 'bg-amber-50 text-amber-700 border-amber-200'
}

export default function TabRelatorios({ contrato }: TabRelatoriosProps) {
  const [relatorioAtivo, setRelatorioAtivo] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)
  const [dadosPedidos, setDadosPedidos] = useState<RelatorioPedidosData | null>(null)
  const [carregandoPedidos, setCarregandoPedidos] = useState(false)
  const [erroPedidos, setErroPedidos] = useState<string | null>(null)

  const itens = useMemo(() => contrato.itens ?? [], [contrato.itens])

  const totalValorContratado = useMemo(
    () => itens.reduce((soma, item) => soma + Number(item.valor_total), 0),
    [itens],
  )
  const totalExecutado = useMemo(
    () => itens.reduce((soma, item) => soma + Number(item.quantidade_entregue) * Number(item.valor_unitario), 0),
    [itens],
  )
  const totalSaldoValor = useMemo(
    () => itens.reduce((soma, item) => soma + Number(item.saldo_disponivel) * Number(item.valor_unitario), 0),
    [itens],
  )
  const percExecGeral = totalValorContratado > 0 ? (totalExecutado / totalValorContratado) * 100 : 0

  useEffect(() => {
    if (relatorioAtivo !== 'pedidos' || dadosPedidos || carregandoPedidos) return

    let ativo = true
    async function carregarRelatorioPedidos() {
      setCarregandoPedidos(true)
      setErroPedidos(null)
      try {
        const controller = new AbortController()
        const timeoutId = window.setTimeout(() => controller.abort(), 15000)
        const response = await authFetch(`${API_URL}/api/contratos/${contrato.id}/relatorio-pedidos`, {
          signal: controller.signal,
        })
        window.clearTimeout(timeoutId)
        if (!response.ok) {
          const error = await response.json().catch(() => ({ message: 'Erro ao carregar relatório de pedidos' }))
          throw new Error(error.message || 'Erro ao carregar relatório de pedidos')
        }
        const data = await response.json()
        if (ativo) setDadosPedidos(data)
      } catch (error) {
        const mensagem = error instanceof Error && error.name === 'AbortError'
          ? 'Tempo esgotado ao carregar o relatório de pedidos'
          : error instanceof Error
            ? error.message
            : 'Erro ao carregar relatório de pedidos'
        if (ativo) setErroPedidos(mensagem)
      } finally {
        if (ativo) setCarregandoPedidos(false)
      }
    }

    carregarRelatorioPedidos()
    return () => {
      ativo = false
    }
  }, [contrato.id, dadosPedidos, relatorioAtivo])

  async function exportarPDFSaldo() {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ])

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.width

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
      [`Contrato nº ${contrato.numero_contrato}/${contrato.ano}`, `Fornecedor: ${contrato.fornecedor_razao_social} - ${contrato.fornecedor_cnpj}`],
      [`Objeto: ${contrato.objeto}`, `Vigência: ${fmtData(contrato.data_vigencia_inicio)} a ${fmtData(contrato.data_vigencia_fim)}`],
      [`Valor Contratado (global): ${fmtMoeda(contrato.valor_global)}`, `Emitido em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`],
    ]

    let y = 24
    for (const [col1, col2] of info) {
      doc.text(col1, 10, y)
      doc.text(col2, pageW / 2 + 2, y)
      y += 5.5
    }

    doc.setDrawColor(200, 200, 200)
    doc.line(10, y, pageW - 10, y)
    y += 4

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

    const totalPags = doc.getNumberOfPages()
    for (let pagina = 1; pagina <= totalPags; pagina++) {
      doc.setPage(pagina)
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(120, 120, 120)
      const pageH = doc.internal.pageSize.height
      doc.text(contrato.orgao.nome, 10, pageH - 6)
      doc.text(`Página ${pagina} de ${totalPags}`, pageW - 10, pageH - 6, { align: 'right' })
    }

    doc.save(`saldo-itens-${contrato.numero_contrato}-${contrato.ano}.pdf`)
  }

  async function exportarPDFPedidos() {
    if (!dadosPedidos) return

    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ])

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }) as InstanceType<typeof jsPDF> & {
      lastAutoTable?: { finalY?: number }
    }
    const pageW = doc.internal.pageSize.width
    const secoes = [
      { titulo: 'Ordens de Fornecimento', dados: dadosPedidos.secoes.ordens_fornecimento },
      { titulo: 'Requisições', dados: dadosPedidos.secoes.requisicoes },
      { titulo: 'Ordens de Serviço', dados: dadosPedidos.secoes.ordens_servico },
    ]

    doc.setFillColor(19, 81, 180)
    doc.rect(0, 0, pageW, 18, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text('RELATÓRIO DE PEDIDOS', pageW / 2, 11, { align: 'center' })

    doc.setTextColor(30, 30, 30)
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'normal')

    const info = [
      [`Órgão: ${dadosPedidos.contrato.orgao?.nome || contrato.orgao.nome}`, `CNPJ: ${dadosPedidos.contrato.orgao?.cnpj || contrato.orgao.cnpj}`],
      [`Contrato nº ${contrato.numero_contrato}/${contrato.ano}`, `Fornecedor: ${contrato.fornecedor_razao_social} - ${contrato.fornecedor_cnpj}`],
      [`Objeto: ${contrato.objeto}`, `Vigência: ${fmtData(contrato.data_vigencia_inicio)} a ${fmtData(contrato.data_vigencia_fim)}`],
      [`Documentos: ${dadosPedidos.resumo.total_documentos}`, `Empenhos vinculados: ${dadosPedidos.resumo.total_empenhos_vinculados}`],
    ]

    let y = 24
    for (const [col1, col2] of info) {
      doc.text(col1, 10, y)
      doc.text(col2, pageW / 2 + 2, y)
      y += 5.5
    }

    for (const secao of secoes) {
      const inicio = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 8 : y + 2
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(19, 81, 180)
      doc.text(secao.titulo, 10, inicio)

      autoTable(doc, {
        startY: inicio + 2,
        head: [['Número', 'Tipo', 'Data', 'Status', 'Valor', 'Empenhos vinculados']],
        body: secao.dados.length > 0
          ? secao.dados.map(item => [
              item.numero || '-',
              statusLabel(item.tipo),
              fmtData(item.data_documento),
              statusLabel(item.status),
              fmtMoeda(item.valor_total),
              joinEmpenhos(item.empenhos),
            ])
          : [['Nenhum registro encontrado', '', '', '', '', '']],
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: [19, 81, 180], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 255] },
        columnStyles: {
          0: { cellWidth: 28 },
          1: { cellWidth: 26 },
          2: { cellWidth: 20, halign: 'center' },
          3: { cellWidth: 30 },
          4: { cellWidth: 24, halign: 'right' },
          5: { cellWidth: 'auto' },
        },
      })
    }

    const totalPags = doc.getNumberOfPages()
    for (let pagina = 1; pagina <= totalPags; pagina++) {
      doc.setPage(pagina)
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(120, 120, 120)
      const pageH = doc.internal.pageSize.height
      doc.text(dadosPedidos.contrato.orgao?.nome || contrato.orgao.nome, 10, pageH - 6)
      doc.text(`Página ${pagina} de ${totalPags}`, pageW - 10, pageH - 6, { align: 'right' })
    }

    doc.save(`pedidos-${contrato.numero_contrato}-${contrato.ano}.pdf`)
  }

  function imprimirHTMLSaldo() {
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>Saldo de Itens - Contrato ${contrato.numero_contrato}/${contrato.ano}</title>
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
  td { padding: 4px; border-bottom: 1px solid #e5e7eb; }
  td.right { text-align: right; }
  td.center { text-align: center; }
  tfoot tr { background: #e8eeff; font-weight: bold; color: #1351B4; }
  tfoot td { padding: 5px 4px; border-top: 2px solid #1351B4; }
  .footer { margin-top: 16px; font-size: 9px; color: #888; display: flex; justify-content: space-between; border-top: 1px solid #ddd; padding-top: 6px; }
  @media print { @page { size: A4 landscape; margin: 12mm; } body { padding: 0; } }
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
  <div class="card blue"><div class="label">Valor Contratado</div><div class="value">${fmtMoeda(totalValorContratado)}</div></div>
  <div class="card green"><div class="label">Valor Executado</div><div class="value">${fmtMoeda(totalExecutado)}</div></div>
  <div class="card purple"><div class="label">Saldo Disponível</div><div class="value">${fmtMoeda(totalSaldoValor)}</div></div>
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
      const perc = Number(item.quantidade_contratada) > 0 ? (Number(item.quantidade_entregue) / Number(item.quantidade_contratada) * 100) : 0
      return `<tr>
        <td class="center">${item.numero_item}</td>
        <td class="center">${item.lote_numero ? `Lote ${item.lote_numero}` : '-'}</td>
        <td>${item.descricao}</td>
        <td class="center">${item.unidade_medida}</td>
        <td class="right">${fmtNum(item.quantidade_contratada)}</td>
        <td class="right">${fmtNum(item.quantidade_empenhada)}</td>
        <td class="right">${fmtNum(item.quantidade_entregue)}</td>
        <td class="right">${fmtNum(item.saldo_disponivel)}</td>
        <td class="center">${perc.toFixed(1)}%</td>
        <td class="right">${fmtMoeda(item.valor_unitario)}</td>
        <td class="right">${fmtMoeda(item.valor_total)}</td>
        <td class="right">${fmtMoeda(valorExec)}</td>
        <td class="right">${fmtMoeda(saldoVal)}</td>
      </tr>`
    }).join('')}
  </tbody>
  <tfoot>
    <tr>
      <td colspan="8" style="text-align:right">TOTAL GERAL</td>
      <td class="center">${percExecGeral.toFixed(1)}%</td>
      <td></td>
      <td class="right">${fmtMoeda(totalValorContratado)}</td>
      <td class="right">${fmtMoeda(totalExecutado)}</td>
      <td class="right">${fmtMoeda(totalSaldoValor)}</td>
    </tr>
  </tfoot>
</table>
<div class="footer">
  <span>${contrato.orgao.nome} - ${contrato.orgao.cidade}/${contrato.orgao.uf}</span>
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

  function imprimirHTMLPedidos() {
    if (!dadosPedidos) return

    const htmlSecao = (titulo: string, itensSecao: PedidoDocumento[]) => `
      <section style="margin-bottom:18px;">
        <h2 style="font-size:13px;color:#1351B4;margin-bottom:8px;">${titulo}</h2>
        <table>
          <thead>
            <tr>
              <th>Número</th>
              <th>Tipo</th>
              <th>Data</th>
              <th>Status</th>
              <th>Valor</th>
              <th>Empenhos vinculados</th>
            </tr>
          </thead>
          <tbody>
            ${itensSecao.length ? itensSecao.map(item => `
              <tr>
                <td>${item.numero || '-'}</td>
                <td>${statusLabel(item.tipo)}</td>
                <td>${fmtData(item.data_documento)}</td>
                <td>${statusLabel(item.status)}</td>
                <td style="text-align:right;">${fmtMoeda(item.valor_total)}</td>
                <td>${joinEmpenhos(item.empenhos)}</td>
              </tr>
            `).join('') : `<tr><td colspan="6" style="text-align:center;color:#777;">Nenhum registro encontrado</td></tr>`}
          </tbody>
        </table>
      </section>
    `

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>Relatório de Pedidos - Contrato ${contrato.numero_contrato}/${contrato.ano}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a1a; padding: 16px; }
  h1 { font-size: 15px; text-align: center; color: #1351B4; margin-bottom: 12px; text-transform: uppercase; letter-spacing: .5px; }
  h2 { page-break-after: avoid; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 20px; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 2px solid #1351B4; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
  .card { border: 1px solid #dde3f0; border-radius: 6px; padding: 10px 12px; background: #f8faff; }
  .label { font-size: 9.5px; color: #666; text-transform: uppercase; }
  .value { font-size: 14px; font-weight: bold; margin-top: 2px; color: #1351B4; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
  thead tr { background: #1351B4; color: #fff; }
  thead th { padding: 6px 5px; text-align: left; }
  tbody tr:nth-child(even) { background: #f7faff; }
  td { padding: 5px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  .footer { margin-top: 16px; font-size: 9px; color: #888; display: flex; justify-content: space-between; border-top: 1px solid #ddd; padding-top: 6px; }
  @media print { @page { size: A4 landscape; margin: 12mm; } body { padding: 0; } }
</style>
</head>
<body>
<h1>Relatório de Pedidos</h1>
<div class="info-grid">
  <span><strong>Órgão:</strong> ${dadosPedidos.contrato.orgao?.nome || contrato.orgao.nome}</span>
  <span><strong>CNPJ:</strong> ${dadosPedidos.contrato.orgao?.cnpj || contrato.orgao.cnpj}</span>
  <span><strong>Contrato nº:</strong> ${contrato.numero_contrato}/${contrato.ano}</span>
  <span><strong>Fornecedor:</strong> ${contrato.fornecedor_razao_social}</span>
  <span><strong>Objeto:</strong> ${contrato.objeto}</span>
  <span><strong>Vigência:</strong> ${fmtData(contrato.data_vigencia_inicio)} a ${fmtData(contrato.data_vigencia_fim)}</span>
</div>
<div class="summary">
  <div class="card"><div class="label">Ordens de Fornecimento</div><div class="value">${dadosPedidos.resumo.total_ordens_fornecimento}</div></div>
  <div class="card"><div class="label">Requisições</div><div class="value">${dadosPedidos.resumo.total_requisicoes}</div></div>
  <div class="card"><div class="label">Ordens de Serviço</div><div class="value">${dadosPedidos.resumo.total_ordens_servico}</div></div>
  <div class="card"><div class="label">Empenhos vinculados</div><div class="value">${dadosPedidos.resumo.total_empenhos_vinculados}</div></div>
</div>
${htmlSecao('Ordens de Fornecimento', dadosPedidos.secoes.ordens_fornecimento)}
${htmlSecao('Requisições', dadosPedidos.secoes.requisicoes)}
${htmlSecao('Ordens de Serviço', dadosPedidos.secoes.ordens_servico)}
<div class="footer">
  <span>${contrato.orgao.nome} - ${contrato.orgao.cidade}/${contrato.orgao.uf}</span>
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

  async function exportarPDF() {
    setGerando(true)
    try {
      if (relatorioAtivo === 'pedidos') {
        await exportarPDFPedidos()
      } else {
        await exportarPDFSaldo()
      }
    } finally {
      setGerando(false)
    }
  }

  function imprimirHTML() {
    if (relatorioAtivo === 'pedidos') {
      imprimirHTMLPedidos()
    } else {
      imprimirHTMLSaldo()
    }
  }

  function renderTabelaPedidos(documentos: PedidoDocumento[], vazio: string) {
    if (documentos.length === 0) {
      return (
        <div className="text-center py-10 text-sm text-gray-500">
          {vazio}
        </div>
      )
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#1351B4] text-white">
              <th className="py-2.5 px-3 text-left font-semibold">Número</th>
              <th className="py-2.5 px-3 text-left font-semibold">Tipo</th>
              <th className="py-2.5 px-3 text-center font-semibold">Data</th>
              <th className="py-2.5 px-3 text-left font-semibold">Status</th>
              <th className="py-2.5 px-3 text-right font-semibold">Valor</th>
              <th className="py-2.5 px-3 text-left font-semibold">Empenhos Vinculados</th>
            </tr>
          </thead>
          <tbody>
            {documentos.map((item, index) => (
              <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-blue-50/30'}>
                <td className="px-3 py-3 font-medium text-slate-900">{item.numero || '-'}</td>
                <td className="px-3 py-3 text-slate-700">{statusLabel(item.tipo)}</td>
                <td className="px-3 py-3 text-center text-slate-700">{fmtData(item.data_documento)}</td>
                <td className="px-3 py-3">
                  <Badge variant="outline" className={getStatusClasses(item.status)}>
                    {statusLabel(item.status)}
                  </Badge>
                </td>
                <td className="px-3 py-3 text-right font-medium text-slate-900">{fmtMoeda(item.valor_total)}</td>
                <td className="px-3 py-3 text-slate-700">
                  {item.empenhos.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {item.empenhos.map(empenho => (
                        <Badge key={`${item.id}-${empenho}`} variant="secondary" className="bg-slate-100 text-slate-700 hover:bg-slate-100">
                          {empenho}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400">Sem empenho vinculado</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

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

  const titulo = relatorioAtivo === 'pedidos' ? 'Relatório de Pedidos' : 'Saldo de Itens do Contrato'
  const subtitulo = `${contrato.numero_contrato}/${contrato.ano} - ${contrato.fornecedor_razao_social}`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setRelatorioAtivo(null)}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Relatórios
          </Button>
          <div>
            <h3 className="text-lg font-semibold">{titulo}</h3>
            <p className="text-xs text-gray-500">{subtitulo}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={imprimirHTML} disabled={relatorioAtivo === 'pedidos' && (!dadosPedidos || carregandoPedidos)}>
            <Printer className="w-4 h-4 mr-2" />
            Imprimir / HTML
          </Button>
          <Button onClick={exportarPDF} disabled={gerando || (relatorioAtivo === 'pedidos' && (!dadosPedidos || carregandoPedidos))}>
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

      {relatorioAtivo === 'pedidos' ? (
        <>
          {carregandoPedidos ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-gray-500">
                Carregando relatório de pedidos...
              </CardContent>
            </Card>
          ) : erroPedidos ? (
            <Card className="border-red-200 bg-red-50/50">
              <CardContent className="py-8 text-sm text-red-700">
                {erroPedidos}
              </CardContent>
            </Card>
          ) : dadosPedidos ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <ShoppingCart className="w-4 h-4 text-blue-600" />
                      <span className="text-xs text-gray-500 uppercase tracking-wide">Ordens de Fornecimento</span>
                    </div>
                    <p className="text-xl font-bold text-blue-700">{dadosPedidos.resumo.total_ordens_fornecimento}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Receipt className="w-4 h-4 text-green-600" />
                      <span className="text-xs text-gray-500 uppercase tracking-wide">Requisições</span>
                    </div>
                    <p className="text-xl font-bold text-green-700">{dadosPedidos.resumo.total_requisicoes}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Wrench className="w-4 h-4 text-orange-600" />
                      <span className="text-xs text-gray-500 uppercase tracking-wide">Ordens de Serviço</span>
                    </div>
                    <p className="text-xl font-bold text-orange-600">{dadosPedidos.resumo.total_ordens_servico}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="w-4 h-4 text-purple-600" />
                      <span className="text-xs text-gray-500 uppercase tracking-wide">Empenhos Vinculados</span>
                    </div>
                    <p className="text-xl font-bold text-purple-700">{dadosPedidos.resumo.total_empenhos_vinculados}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{dadosPedidos.resumo.total_documentos} documentos no total</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-blue-600" />
                    Ordens de Fornecimento
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {renderTabelaPedidos(dadosPedidos.secoes.ordens_fornecimento, 'Nenhuma ordem de fornecimento encontrada neste contrato.')}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-green-600" />
                    Requisições
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {renderTabelaPedidos(dadosPedidos.secoes.requisicoes, 'Nenhuma requisição encontrada neste contrato.')}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-orange-600" />
                    Ordens de Serviço
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {renderTabelaPedidos(dadosPedidos.secoes.ordens_servico, 'Nenhuma ordem de serviço encontrada neste contrato.')}
                </CardContent>
              </Card>
            </>
          ) : null}
        </>
      ) : (
        <>
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
                <p className="text-xs text-gray-400 mt-0.5">{itens.filter(item => Number(item.quantidade_entregue) > 0).length} itens com entrega</p>
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
                <p className="text-xs text-gray-400 mt-0.5">{itens.filter(item => Number(item.saldo_disponivel) <= 0).length} itens zerados</p>
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
                  <div className="h-full bg-orange-400 rounded-full transition-all" style={{ width: `${Math.min(percExecGeral, 100)}%` }} />
                </div>
              </CardContent>
            </Card>
          </div>

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
                      {itens.map((item, index) => {
                        const valorExecutado = Number(item.quantidade_entregue) * Number(item.valor_unitario)
                        const saldoValor = Number(item.saldo_disponivel) * Number(item.valor_unitario)
                        const perc = Number(item.quantidade_contratada) > 0
                          ? (Number(item.quantidade_entregue) / Number(item.quantidade_contratada)) * 100
                          : 0

                        return (
                          <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-blue-50/30'}>
                            <td className="px-2 py-2.5 text-center font-medium">{item.numero_item}</td>
                            <td className="px-2 py-2.5 text-center">{item.lote_numero ? `Lote ${item.lote_numero}` : '-'}</td>
                            <td className="px-3 py-2.5 max-w-[420px]">
                              <div className="font-medium text-slate-900 leading-snug">{item.descricao}</div>
                              {item.codigo_catalogo_proprio && (
                                <div className="text-[11px] text-purple-700 mt-0.5">Catálogo: {item.codigo_catalogo_proprio}</div>
                              )}
                            </td>
                            <td className="px-2 py-2.5 text-center">{item.unidade_medida}</td>
                            <td className="px-2 py-2.5 text-right">{fmtNum(item.quantidade_contratada)}</td>
                            <td className="px-2 py-2.5 text-right text-amber-700 font-medium">{fmtNum(item.quantidade_empenhada)}</td>
                            <td className="px-2 py-2.5 text-right text-green-700 font-medium">{fmtNum(item.quantidade_entregue)}</td>
                            <td className={`px-2 py-2.5 text-right font-medium ${Number(item.saldo_disponivel) <= 0 ? 'text-red-600' : 'text-slate-900'}`}>
                              {fmtNum(item.saldo_disponivel)}
                            </td>
                            <td className="px-2 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 flex-1 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(perc, 100)}%` }} />
                                </div>
                                <span className="text-[11px] font-medium text-slate-700 min-w-[38px] text-right">{perc.toFixed(1)}%</span>
                              </div>
                            </td>
                            <td className="px-2 py-2.5 text-right">{fmtMoeda(item.valor_unitario)}</td>
                            <td className="px-2 py-2.5 text-right font-medium">{fmtMoeda(item.valor_total)}</td>
                            <td className="px-2 py-2.5 text-right text-green-700 font-medium">{fmtMoeda(valorExecutado)}</td>
                            <td className={`px-2 py-2.5 text-right font-medium ${saldoValor < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                              {fmtMoeda(saldoValor)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-blue-50/70 font-semibold text-slate-900 border-t">
                        <td colSpan={8} className="px-3 py-3 text-right">Total Geral</td>
                        <td className="px-2 py-3 text-center">{percExecGeral.toFixed(1)}%</td>
                        <td className="px-2 py-3" />
                        <td className="px-2 py-3 text-right">{fmtMoeda(totalValorContratado)}</td>
                        <td className="px-2 py-3 text-right text-green-700">{fmtMoeda(totalExecutado)}</td>
                        <td className="px-2 py-3 text-right">{fmtMoeda(totalSaldoValor)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

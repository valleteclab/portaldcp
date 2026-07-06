/**
 * ============================================================================
 * GERAÇÃO DE PDF — BOLETIM DE MEDIÇÃO
 * ============================================================================
 *
 * Gera o Boletim de Medição em PDF seguindo o modelo do órgão.
 * Inclui blocos de assinatura eletrônica no estilo gov.br.
 *
 * ============================================================================
 */

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ---- Interfaces ----

export interface ItemMedicaoPdf {
  numero: number
  descricao: string
  unidade: string
  quantidade_no_periodo: number
  /** Quantidade acumulada em medições ANTERIORES aprovadas (ItemCronograma.quantidade_medida) */
  quantidade_acumulada_aprovada: number
  quantidade_total_contrato: number
  valor_no_periodo: number
  valor_unitario: number
  /** Valor financeiro acumulado ANTES desta medição. Se definido, substitui quantidade_acumulada_aprovada × valor_unitario. */
  valor_acumulado_anterior?: number
  /** Valor total ORIGINAL do item no contrato. Se definido, substitui quantidade_total_contrato × valor_unitario. */
  valor_total_item?: number
  /** Quando boletim_por_quantidade: quantidade acumulada até o período */
  quantidade_ate_periodo?: number
  /** Quando boletim_por_quantidade: quantidade a executar */
  quantidade_a_executar?: number
  /** Restante financeiro do item (backend: trunc em 2 casas, sem arredondar) */
  valor_a_executar?: number
}

export interface ItemContratadoPdf {
  numero: number
  descricao: string
  unidade: string
  /** Texto como no cronograma (ex.: Serviço preço por m²); fallback: unidade */
  unidade_exibicao?: string
  frequencia_exibicao?: string
  numero_execucoes?: number | null
  quantidade: number
  valor_unitario: number
  /** Valor de uma execução (q × vl unit ou valor_mensal) */
  valor_por_frequencia?: number
  valor_total: number
}

export interface EtapaMedicaoPdf {
  numero: number
  descricao: string
  percentual_fisico: number
  percentual_executado_anterior: number
  percentual_executado_atual: number
  valor_previsto: number
  valor_medido: number
}

export interface DiscriminacaoPdf {
  numero: number
  descricao: string
  valor: number
  percentual: number
}

export interface DadosMedicaoPdf {
  // Contrato
  numero_contrato: string
  objeto_contrato: string
  orgao_nome: string
  fornecedor_nome: string
  fornecedor_cnpj: string
  valor_total_contrato?: number
  data_vigencia_inicio?: string   // data início vigência do contrato (para cálculo fiscal)
  data_vigencia_fim?: string      // data fim vigência do contrato (para cálculo fiscal)
  // Medição
  numero_medicao: number
  periodo_inicio: string
  periodo_fim: string
  competencia?: string          // ex: FEVEREIRO/2026 (gerado automaticamente se omitido)
  boletim_data_emissao?: string // override da DATA DE EMISSÃO (YYYY-MM-DD); padrão: data da assinatura do fornecedor
  valor_medido: number
  execucao_financeira_totais?: {
    no_periodo: number
    ate_periodo: number
    a_executar: number
  }
  nota_fiscal_numero?: string
  nota_fiscal_valor?: number
  /** Quando true, Execução Fiscal exibe quantidades (un, h, m) em vez de dias */
  execucao_fiscal_por_quantidade?: boolean
  /** Quando true, o campo "Período" exibe a competência gravada em vez do intervalo de datas */
  boletim_periodo_competencia?: boolean
  // Execução fiscal (calculada no backend com ano comercial)
  execucao_fiscal?: {
    vigencia_inicio: string;
    vigencia_fim: string;
    total_dias: number;
    dias_executados: number;
    dias_restantes: number;
    meses_executados: number;
    dias_executados_extra: number;
    meses_restantes: number;
    dias_restantes_extra: number;
    ano_comercial: boolean;
  };
  // Itens de medição (item_cronograma)
  itens?: ItemMedicaoPdf[]
  // Itens contratados (planilha completa)
  itens_contratados?: ItemContratadoPdf[]
  // Etapas de obra
  etapas?: EtapaMedicaoPdf[]
  // Discriminação das despesas
  discriminacoes?: DiscriminacaoPdf[]
  // Assinaturas
  assinatura_fornecedor?: {
    nome: string
    cnpj: string
    cargo?: string
    data_hora: string
    codigo_validacao?: string      // código formatado XXXX-XXXX-XXXX-XXXX
  }
  assinatura_fiscal?: {
    nome: string
    cpf?: string
    cargo?: string
    matricula?: string             // matrícula funcional do fiscal
    portaria?: string              // portaria que designou o fiscal
    data_hora: string
    codigo_validacao?: string      // código formatado XXXX-XXXX-XXXX-XXXX
  }
  assinatura_engenheiro?: {
    nome: string
    cpf?: string
    crea?: string
    cargo?: string
    data_hora: string
    codigo_validacao?: string
  }
  url_validacao?: string           // ex: portaldcp.com.br/validar-documento
  qr_code_data_url?: string        // Data URI PNG do QR Code para verificação
}

// ---- Helpers ----

function fmt(v: number): string {
  const truncado = truncarMoedaReais2Casas(v)
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(truncado)
}

/** Corta em 2 casas sem arredondar. +1e-9 neutraliza ruído IEEE 754 de floats já truncados. */
function truncarMoedaReais2Casas(v: number): number {
  const x = Number(v)
  if (!Number.isFinite(x)) return 0
  return (x < 0 ? -1 : 1) * Math.floor(Math.abs(x) * 100 + 1e-9) / 100
}

/** q×vu com até 2 casas cada → trunc em 2 casas reais (ex.: 2831,40×6,94 → 19.649,91). */
function produtoQuantidadeValorUnitarioCentavos(quantidade: number, valorUnitario: number): number {
  const qC = Math.round((Number(quantidade) || 0) * 100)
  const vuC = Math.round((Number(valorUnitario) || 0) * 100)
  return Math.floor((qC * vuC) / 100)
}

function centavosParaReaisTrunc2(centavos: number): number {
  return Number((centavos / 100).toFixed(2))
}

/** EXECUÇÃO FINANCEIRA: 2 casas; trunc (ex.: 15.318,489 → 15.318,48). */
function fmtExecFinanceira(v: number): string {
  const truncado = truncarMoedaReais2Casas(v)
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(truncado)
}

function fmtData(d: string): string {
  if (!d) return '-'
  const p = d.split('T')[0].split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d
}

function fmtCnpj(cnpj: string): string {
  const c = cnpj.replace(/\D/g, '')
  if (c.length !== 14) return cnpj
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`
}

/** Diferença em dias usando ANO COMERCIAL (360 dias = 12 meses x 30 dias) */
function diaFimComercialUtc(ano: number, mes: number, dia: number): number {
  const ultimoDiaDoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate()
  return dia === ultimoDiaDoMes ? 30 : Math.min(dia, 30)
}

function diasEntreDatasComercial(data1: string, data2: string, dataFimContrato?: string): number {
  const d1 = new Date(data1)
  const d2 = new Date(data2)
  const dataFimContratoDate = dataFimContrato ? new Date(dataFimContrato) : null
  
  // Usar UTC para evitar problemas de timezone
  const ano1 = d1.getUTCFullYear()
  const mes1 = d1.getUTCMonth()
  const dia1 = d1.getUTCDate()
  
  const ano2 = d2.getUTCFullYear()
  const mes2 = d2.getUTCMonth()
  const dia2 = d2.getUTCDate()
  
  let dias = 0
  
  // Se mesmo mês
  if (ano1 === ano2 && mes1 === mes2) {
    // Para períodos normais: conta ambos os dias (dia_fim - dia_início + 1)
    // Apenas não conta o dia final se for o último dia do contrato
    const ehUltimoDiaDoContrato = dataFimContratoDate
      ? ano2 === dataFimContratoDate.getUTCFullYear() &&
        mes2 === dataFimContratoDate.getUTCMonth() &&
        dia2 === dataFimContratoDate.getUTCDate()
      : false
    const dia2Com = ehUltimoDiaDoContrato
      ? Math.min(dia2 - 1, 30)
      : diaFimComercialUtc(ano2, mes2, dia2)
    dias = dia2Com - dia1 + 1
  } else {
    // Dias no primeiro mês (ano comercial) - conta o dia inicial
    const diasPrimeiroMes = Math.min(30 - dia1 + 1, 30)
    
    // Meses completos no meio
    let mesesCompletos = 0
    if (ano2 > ano1 || mes2 > mes1 + 1) {
      mesesCompletos = (ano2 - ano1) * 12 + (mes2 - mes1 - 1)
    }
    
    // Dias no último mês (ano comercial)
    // Não conta o dia final se for o último dia do contrato
    const ehUltimoDiaDoContrato = dataFimContratoDate
      ? ano2 === dataFimContratoDate.getUTCFullYear() &&
        mes2 === dataFimContratoDate.getUTCMonth() &&
        dia2 === dataFimContratoDate.getUTCDate()
      : false
    const diasUltimoMes = ehUltimoDiaDoContrato
      ? Math.min(dia2 - 1, 30)
      : diaFimComercialUtc(ano2, mes2, dia2)
    
    dias = diasPrimeiroMes + (mesesCompletos * 30) + diasUltimoMes
  }
  
  // IMPORTANTE: Ano comercial sempre = 360 dias
  return Math.max(0, Math.min(dias, 360))
}

function diasEntreDatas(data1: string, data2: string): number {
  const d1 = new Date(data1)
  const d2 = new Date(data2)
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
}

/** Formata dias como "X mês/meses [e Y dia/dias]" */
function fmtTempo(dias: number): string {
  if (dias <= 0) return '0 dias'
  const m = Math.floor(dias / 30)
  const d = dias % 30
  const pM = m === 1 ? '1 mês' : m > 1 ? `${m} meses` : ''
  const pD = d === 1 ? '1 dia' : d > 1 ? `${d} dias` : ''
  if (pM && pD) return `${pM} e ${pD}`
  return pM || pD || '0 dias'
}

/** Formata quantidade com unidade (ex: 100 h, 50 un, 1 mês) */
function fmtQuantidade(valor: number, unidade: string): string {
  const u = (unidade || 'UN').toUpperCase()
  const suf = u === 'HORA' || u === 'H' ? ' h'
    : u === 'METROS' || u === 'M' ? ' m'
    : u === 'LITROS' || u === 'L' ? ' l'
    : u === 'MENSAL' ? (valor === 1 ? ' mês' : ' meses')
    : u === 'UN' || u === 'UNIDADE' ? ' un'
    : ` ${(unidade || 'un').toLowerCase()}`
  return `${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 })}${suf}`
}

/** Colunas EXECUÇÃO FISCAL (por quantidade): no máx. 2 decimais — sem “2831,4003 m” */
function fmtQuantidadeExecucaoFiscal(valor: number, unidade: string): string {
  const u = (unidade || 'UN').toUpperCase()
  const suf = u === 'HORA' || u === 'H' ? ' h'
    : u === 'METROS' || u === 'M' ? ' m'
    : u === 'LITROS' || u === 'L' ? ' l'
    : u === 'MENSAL' ? (valor === 1 ? ' mês' : ' meses')
    : u === 'UN' || u === 'UNIDADE' ? ' un'
    : ` ${(unidade || 'un').toLowerCase()}`
  return `${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}${suf}`
}

/** Deriva "FEVEREIRO/2026" a partir de uma data ISO */
export function derivarCompetencia(periodoInicio: string): string {
  if (!periodoInicio) return ''
  const d = new Date(periodoInicio + 'T00:00:00')
  const meses = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO',
                 'JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO']
  return `${meses[d.getMonth()]}/${d.getFullYear()}`
}

/**
 * Desenha o quadro de assinaturas eletrônicas no estilo OS/OF (Lei 14.063/2020).
 * Retorna a altura total desenhada.
 */
function desenharQuadroAssinaturas(
  doc: jsPDF,
  y: number,
  mX: number,
  W: number,
  assinaturas: Array<{
    titulo: string
    cor: [number, number, number]
    nome: string
    identificacao: string
    cargo: string
    matricula?: string
    portaria?: string
    dataHora: string
    pendente: boolean
    codigoValidacao?: string
  }>,
  urlValidacao?: string,
  qrCodeDataUrl?: string,
): number {
  const contentW = W - 2 * mX
  let dy = 0

  // ── Linha separadora ────────────────────────────────────────────────────────
  doc.setDrawColor(107, 114, 128)
  doc.setLineWidth(0.6)
  doc.line(mX, y + dy, W - mX, y + dy)
  dy += 3.5

  // ── Título do quadro ──────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(30, 64, 175)
  doc.text('QUADRO DE ASSINATURAS ELETRÔNICAS', W / 2, y + dy, { align: 'center' })
  dy += 4

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(55, 65, 81)
  doc.text(
    'Este documento foi assinado eletronicamente em conformidade com a Lei nº 14.063/2020.',
    W / 2, y + dy, { align: 'center' },
  )
  dy += 4.5

  // ── Caixas por assinante (2 ou 3 boxes) ──────────────────────────────────
  const assinantesArr = assinaturas.slice(0, 3)
  const nBoxes = Math.max(1, assinantesArr.length)
  const gapBox = nBoxes >= 3 ? 3 : 4
  const boxW = (contentW - gapBox * (nBoxes - 1)) / nBoxes

  let maxBoxH = 0
  const boxesInfo: { x: number; boxH: number }[] = []

  for (let i = 0; i < assinantesArr.length; i++) {
    const a = assinantesArr[i]
    const bx = mX + i * (boxW + gapBox)
    const pendente = a.pendente
    // DEPOIS — altura dinâmica baseada no conteúdo
let boxH: number
if (pendente) {
  boxH = 18
} else {
  const linhasNome = doc.splitTextToSize(a.nome, boxW - 5)
  const numLinhasNome = Math.min(linhasNome.length, 2)
  // header(5) + topo(3.5) + nome + cargo/matricula + portaria + id + data + válida + padding
  const temCargoOuMatricula = !!(a.cargo || a.matricula)
  boxH = 5 + 3.5
    + numLinhasNome * 3.1
    + (temCargoOuMatricula ? 2.8 : 0)
    + (a.portaria ? 2.8 : 0)
    + (a.identificacao ? 2.8 : 0)
    + (a.dataHora ? 2.8 : 0)   // data/hora (omitida quando vazia)
    + 2.8   // ✓ assinatura válida
    + 2.5   // padding inferior
}
maxBoxH = Math.max(maxBoxH, boxH)
boxesInfo.push({ x: bx, boxH })
    // Fundo + borda
    doc.setFillColor(249, 250, 251)
    doc.setDrawColor(a.cor[0], a.cor[1], a.cor[2])
    doc.setLineWidth(0.4)
    doc.rect(bx, y + dy, boxW, boxH, 'FD')

    // Header colorido
    doc.setFillColor(a.cor[0], a.cor[1], a.cor[2])
    doc.rect(bx, y + dy, boxW, 5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(5.5)
    doc.setTextColor(255, 255, 255)
    doc.text(a.titulo, bx + boxW / 2, y + dy + 3.4, { align: 'center' })

    if (pendente) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(6)
      doc.setTextColor(156, 163, 175)
      doc.text('Pendente de assinatura', bx + boxW / 2, y + dy + 11.5, { align: 'center' })
    } else {
      let ly = y + dy + 8.5
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.2)
      doc.setTextColor(17, 24, 39)
      const linhasNome = doc.splitTextToSize(a.nome, boxW - 5)
      doc.text(linhasNome.slice(0, 2), bx + 3, ly)
      ly += linhasNome.slice(0, 2).length * 3.1

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(5.8)
      doc.setTextColor(55, 65, 81)
      // Linha: "CARGO  ·  Matrícula: XXXXX" (ou só cargo, ou só matrícula)
      if (a.cargo || a.matricula) {
        const cargoMatricula = a.cargo && a.matricula
          ? `${a.cargo}  ·  Matrícula: ${a.matricula}`
          : a.cargo ? a.cargo : `Matrícula: ${a.matricula}`
        doc.text(cargoMatricula, bx + 3, ly); ly += 2.8
      }
      // Linha: "Fiscal de Contratos  ·  Portaria XXX/XXXX"
      if (a.portaria) {
        doc.text(`Fiscal de Contratos  ·  Portaria ${a.portaria}`, bx + 3, ly); ly += 2.8
      }
      if (a.identificacao) { doc.text(a.identificacao, bx + 3, ly); ly += 2.8 }
      if (a.dataHora) { doc.text(`Data/Hora: ${a.dataHora}`, bx + 3, ly); ly += 2.8 }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(5.5)
      doc.setTextColor(22, 163, 74)
      doc.text('✓  Assinatura eletrônica válida', bx + 3, ly)
    }
  }
  dy += maxBoxH + 3

  // ── Rodapé: URL de verificação + código ─────────────────────────────────
  doc.setDrawColor(156, 163, 175)
  doc.setLineWidth(0.4)
  doc.line(mX, y + dy, W - mX, y + dy)
  dy += 3

  const baseUrl = urlValidacao || 'portaldcp.com.br/validar-documento'
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.3)
  doc.setTextColor(17, 24, 39)
  doc.text('VERIFICAR AUTENTICIDADE:', mX, y + dy)
  dy += 3.2
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.8)
  doc.setTextColor(55, 65, 81)
  doc.text(`Acesse: ${baseUrl}`, mX, y + dy)
  dy += 3.2

  // QR Code (renderizar à direita, alinhado com os textos)
  const qrSize = 20
  const qrX = W - mX - qrSize
  if (qrCodeDataUrl) {
    try {
      doc.addImage(qrCodeDataUrl, 'PNG', qrX, y + dy - 3, qrSize, qrSize)
    } catch { /* ignora se falhar */ }
  }

  // Códigos dos assinantes (texto à esquerda, QR ocupa a direita)
  const textMaxW = qrCodeDataUrl ? qrX - mX - 3 : W - 2 * mX
  const codigosValidos = assinantesArr.filter(a => !a.pendente && a.codigoValidacao)
  if (codigosValidos.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.1)
    doc.setTextColor(37, 99, 235)
    for (const a of codigosValidos) {
      const label = `Código (${a.titulo.split('—')[1]?.trim() || a.titulo}): ${a.codigoValidacao}`
      doc.text(label, mX, y + dy, { maxWidth: textMaxW })
      dy += 3.2
    }
  }

  // Garantir espaço suficiente para o QR Code
  if (qrCodeDataUrl) {
    dy = Math.max(dy, qrSize + 3)
  }

  return dy
}

// ---- Função principal ----

export function gerarPdfMedicao(dados: DadosMedicaoPdf): Blob {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const mX = 7
  let y = 8

  const competencia = dados.competencia || derivarCompetencia(dados.periodo_inicio)

  // =========================================================
  // CABEÇALHO
  // =========================================================
  const hCab = 20
  doc.setFillColor(22, 60, 100)
  doc.rect(mX, y, W - 2 * mX, hCab, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('BOLETIM DE MEDIÇÃO', W / 2, y + 6, { align: 'center' })
  doc.setFontSize(7.5)
  doc.text('RELATÓRIO DE ATIVIDADES / MEDIÇÃO DE EXECUÇÃO DE SERVIÇOS PRESTADOS', W / 2, y + 12, { align: 'center' })
  doc.setFontSize(8)
  doc.text(`Nº ${String(dados.numero_medicao).padStart(3, '0')}`, W / 2, y + 18, { align: 'center' })
  y += hCab + 5

  // =========================================================
  // INFORMAÇÕES DO CONTRATO
  // =========================================================
  const infoX2 = mX + 22
  const textoPretoPdf: [number, number, number] = [0, 0, 0]
  const textoCorpoTabelaPdf = {
    textColor: textoPretoPdf,
    fontStyle: 'bold' as const,
  }
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(8)

  const linhaInfo = (label: string, valor: string) => {
    doc.setFont('helvetica', 'bold')
    doc.text(`${label}:`, mX, y)
    doc.setFont('helvetica', 'bold')
    doc.text(valor, infoX2, y)
    y += 5
  }

  linhaInfo('ÓRGÃO', dados.orgao_nome)
  linhaInfo('CONTRATO', dados.numero_contrato)

  // Objeto pode ser longo — quebrar em até 3 linhas
  doc.setFont('helvetica', 'bold')
  doc.text('OBJETO:', mX, y)
  doc.setFont('helvetica', 'bold')
  const linhasObj = doc.splitTextToSize(dados.objeto_contrato, W - mX - infoX2 - 2)
  doc.text(linhasObj, infoX2, y)
  y += linhasObj.length * 4.5 + 1

  linhaInfo('FORNECEDOR', `${dados.fornecedor_nome}  —  CNPJ: ${fmtCnpj(dados.fornecedor_cnpj)}`)

  // Período + NF na mesma linha
  doc.setFont('helvetica', 'bold')
  doc.text('PERÍODO:', mX, y)
  doc.setFont('helvetica', 'bold')
  // Quando a flag do contrato está ligada, o campo Período exibe a competência gravada
  const textoPeriodo =
    dados.boletim_periodo_competencia && dados.competencia
      ? dados.competencia
      : `${fmtData(dados.periodo_inicio)} a ${fmtData(dados.periodo_fim)}`
  doc.text(textoPeriodo, infoX2, y)
  const nfX = W / 2
  doc.setFont('helvetica', 'bold')
  doc.text('Nº NF:', nfX, y)
  doc.setFont('helvetica', 'bold')
  doc.text(dados.nota_fiscal_numero ? `${dados.nota_fiscal_numero}` : '-', nfX + 12, y)
  y += 5

  // Data de emissão = override corrigido (boletim_data_emissao) ou, por padrão, a data em que o
  // FORNECEDOR assinou. Posiciona o valor após a largura do rótulo + 2mm.
  const dataEmissaoBoletim = dados.boletim_data_emissao
    ? fmtData(String(dados.boletim_data_emissao).slice(0, 10))
    : (String(dados.assinatura_fornecedor?.data_hora ?? '').match(/\d{2}\/\d{2}\/\d{4}/) || ['-'])[0]
  doc.setFont('helvetica', 'bold')
  doc.text('DATA DE EMISSÃO:', mX, y)
  doc.text(dataEmissaoBoletim, mX + doc.getTextWidth('DATA DE EMISSÃO:') + 2, y)
  y += 5

  // Valor Bruto (= valor da medição)
  linhaInfo('VALOR BRUTO', fmt(dados.valor_medido))

  // Competência
  if (competencia) {
    doc.setFont('helvetica', 'bold')
    doc.text('COMPETÊNCIA:', mX, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(22, 60, 100)
    doc.text(competencia, infoX2, y)
    doc.setTextColor(0, 0, 0)
    y += 5
  }
  y += 3

  // =========================================================
  // DISCRIMINAÇÃO DAS DESPESAS
  // =========================================================
  if (dados.discriminacoes && dados.discriminacoes.length > 0) {
    doc.setFillColor(22, 60, 100)
    doc.rect(mX, y, W - 2 * mX, 6, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.text('DISCRIMINAÇÃO DAS DESPESAS', W / 2, y + 4, { align: 'center' })
    y += 6
    doc.setTextColor(0, 0, 0)

    const totalDisc = dados.discriminacoes.reduce((s, d) => s + d.valor, 0)

    autoTable(doc, {
      startY: y,
      head: [[
        { content: 'Item', styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
        { content: 'Discriminação', styles: { fontStyle: 'bold' as const } },
        { content: 'Valor R$', styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
        { content: '%', styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
      ]],
      body: [
        ...dados.discriminacoes.map(d => [
          { content: d.numero, styles: { halign: 'center' as const } },
          d.descricao,
          { content: fmt(d.valor), styles: { halign: 'right' as const } },
          { content: `${Number(d.percentual || 0).toFixed(2)}%`, styles: { halign: 'right' as const } },
        ]),
        [
          { content: 'TOTAL', colSpan: 2, styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: [230, 230, 230] as [number,number,number] } },
          { content: fmt(totalDisc), styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: [230, 230, 230] as [number,number,number] } },
          { content: '100,00%', styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: [230, 230, 230] as [number,number,number] } },
        ],
      ],
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5, lineWidth: 0.2, lineColor: [200, 200, 200] as [number,number,number], ...textoCorpoTabelaPdf },
      headStyles: { fillColor: [22, 60, 100] as [number,number,number], textColor: [255, 255, 255] as [number,number,number] },
      columnStyles: { 0: { cellWidth: 12 }, 2: { cellWidth: 30 }, 3: { cellWidth: 18 } },
      margin: { left: mX, right: mX },
    })
    y = (doc as any).lastAutoTable.finalY + 4
  }

  // =========================================================
  // ITENS CONTRATADOS (planilha completa)
  // =========================================================
  if (dados.itens_contratados && dados.itens_contratados.length > 0) {
    doc.setFillColor(22, 60, 100)
    doc.rect(mX, y, W - 2 * mX, 6, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.text('ITENS CONTRATADOS', W / 2, y + 4, { align: 'center' })
    y += 6
    doc.setTextColor(0, 0, 0)

    const totalItens = dados.itens_contratados.reduce((s, ic) => s + ic.valor_total, 0)
    const exibirColunasFrequencia = dados.itens_contratados.some(
      (ic) => !!ic.frequencia_exibicao && ic.frequencia_exibicao !== '—',
    )

    const fmtNExec = (ic: ItemContratadoPdf) =>
      ic.numero_execucoes != null && ic.numero_execucoes !== undefined ? String(ic.numero_execucoes) : '—'
    const vlFreq = (ic: ItemContratadoPdf) =>
      ic.valor_por_frequencia != null && Number.isFinite(ic.valor_por_frequencia)
        ? fmt(ic.valor_por_frequencia)
        : fmt(ic.quantidade * ic.valor_unitario)

    autoTable(doc, {
      startY: y,
      head: [[
        { content: 'Nº', styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
        { content: 'Descrição', styles: { fontStyle: 'bold' as const } },
        { content: 'Unidade', styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
        ...(exibirColunasFrequencia
          ? [{ content: 'Freq.', styles: { halign: 'center' as const, fontStyle: 'bold' as const } }]
          : []),
        { content: 'Qtd.', styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
        { content: 'Vl. Unit.', styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
        ...(exibirColunasFrequencia
          ? [{ content: 'Nº exec.', styles: { halign: 'right' as const, fontStyle: 'bold' as const } }]
          : []),
        ...(exibirColunasFrequencia
          ? [{ content: 'Vl./freq.', styles: { halign: 'right' as const, fontStyle: 'bold' as const } }]
          : []),
        { content: 'Vl. Total', styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
      ]],
      body: [
        ...dados.itens_contratados.map(ic => [
          { content: ic.numero, styles: { halign: 'center' as const } },
          ic.descricao,
          { content: ic.unidade_exibicao || ic.unidade, styles: { halign: 'center' as const, fontSize: 5.5 } },
          ...(exibirColunasFrequencia
            ? [{ content: ic.frequencia_exibicao ?? '—', styles: { halign: 'center' as const, fontSize: 5.5 } }]
            : []),
          { content: ic.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 4 }), styles: { halign: 'right' as const } },
          { content: fmt(ic.valor_unitario), styles: { halign: 'right' as const } },
          ...(exibirColunasFrequencia
            ? [{ content: fmtNExec(ic), styles: { halign: 'right' as const } }]
            : []),
          ...(exibirColunasFrequencia
            ? [{ content: vlFreq(ic), styles: { halign: 'right' as const } }]
            : []),
          { content: fmt(ic.valor_total), styles: { halign: 'right' as const } },
        ]),
        [
          { content: 'TOTAL', colSpan: exibirColunasFrequencia ? 8 : 5, styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: [230, 230, 230] as [number,number,number] } },
          { content: fmt(totalItens), styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: [230, 230, 230] as [number,number,number] } },
        ],
      ],
      theme: 'grid',
      styles: { fontSize: 6, cellPadding: 0.9, lineWidth: 0.2, lineColor: [200, 200, 200] as [number,number,number], overflow: 'linebreak', ...textoCorpoTabelaPdf },
      headStyles: { fillColor: [22, 60, 100] as [number,number,number], textColor: [255, 255, 255] as [number,number,number] },
      // Larguras somam 196 mm (= A4 − 2×mX), alinhado ao bloco EXECUÇÃO FISCAL / FINANCEIRA
      columnStyles: {
        0: { cellWidth: 8 },
        ...(exibirColunasFrequencia
          ? {
              1: { cellWidth: 62 },
              2: { cellWidth: 22 },
              3: { cellWidth: 16 },
              4: { cellWidth: 16 },
              5: { cellWidth: 18 },
              6: { cellWidth: 12 },
              7: { cellWidth: 20 },
              8: { cellWidth: 22 },
            }
          : {
              1: { cellWidth: 82 },
              2: { cellWidth: 26 },
              3: { cellWidth: 24 },
              4: { cellWidth: 26 },
              5: { cellWidth: 30 },
            }),
      },
      margin: { left: mX, right: mX },
    })
    y = (doc as any).lastAutoTable.finalY + 4
  }

  // =========================================================
  // EXECUÇÃO FISCAL / FINANCEIRA (item_cronograma)
  // =========================================================
  if (dados.itens && dados.itens.length > 0) {
    doc.setFillColor(22, 60, 100)
    doc.rect(mX, y, W - 2 * mX, 6, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.text('EXECUÇÃO FISCAL / FINANCEIRA', W / 2, y + 4, { align: 'center' })
    y += 6
    doc.setTextColor(0, 0, 0)

    const fCor: [number,number,number]    = [0, 70, 140]     // azul fiscal
    const fCorSub: [number,number,number] = [60, 120, 185]   // azul fiscal (subheader)
    const fCor2: [number,number,number]    = [0, 110, 55]    // verde financeiro
    const fCor2Sub: [number,number,number] = [50, 150, 85]   // verde financeiro (subheader)

    const head: import('jspdf-autotable').RowInput[] = [
      [
        { content: 'ITEM\nNº', rowSpan: 2, styles: { halign: 'center' as const, valign: 'middle' as const, fontStyle: 'bold' as const, fontSize: 6 } },
        { content: 'DESCRIÇÃO', rowSpan: 2, styles: { halign: 'left' as const, valign: 'middle' as const, fontStyle: 'bold' as const, fontSize: 6 } },
        { content: 'EXECUÇÃO FISCAL', colSpan: 3, styles: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 6, fillColor: fCor, textColor: [255, 255, 255] as [number,number,number] } },
        { content: 'EXECUÇÃO FINANCEIRA', colSpan: 3, styles: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 6, fillColor: fCor2, textColor: [255, 255, 255] as [number,number,number] } },
      ],
      [
        { content: 'NO PERÍODO', styles: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 5.5, fillColor: fCorSub, textColor: [255, 255, 255] as [number,number,number] } },
        { content: 'ATÉ O PERÍODO', styles: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 5.5, fillColor: fCorSub, textColor: [255, 255, 255] as [number,number,number] } },
        { content: 'A EXECUTAR', styles: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 5.5, fillColor: fCorSub, textColor: [255, 255, 255] as [number,number,number] } },
        { content: 'NO PERÍODO', styles: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 5.5, fillColor: fCor2Sub, textColor: [255, 255, 255] as [number,number,number] } },
        { content: 'ATÉ O PERÍODO', styles: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 5.5, fillColor: fCor2Sub, textColor: [255, 255, 255] as [number,number,number] } },
        { content: 'A EXECUTAR', styles: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 5.5, fillColor: fCor2Sub, textColor: [255, 255, 255] as [number,number,number] } },
      ],
    ]

    const porQuantidade = !!dados.execucao_fiscal_por_quantidade

    // --- Execução Fiscal: tempo (dias) ou quantidade ---
    let txtFiscalNoPeriodo: string, txtFiscalAtePeriodo: string, txtFiscalAExecutar: string
    if (porQuantidade) {
      txtFiscalNoPeriodo = txtFiscalAtePeriodo = txtFiscalAExecutar = '' // por item
    } else {
      const diasPeriodo = Math.max(1, diasEntreDatasComercial(dados.periodo_inicio, dados.periodo_fim, dados.data_vigencia_fim))
      txtFiscalNoPeriodo = fmtTempo(diasPeriodo)
      if (dados.execucao_fiscal) {
        txtFiscalAtePeriodo = fmtTempo(dados.execucao_fiscal.dias_executados)
        txtFiscalAExecutar = fmtTempo(dados.execucao_fiscal.dias_restantes)
      } else if (dados.data_vigencia_inicio && dados.data_vigencia_fim) {
        const diasAte = Math.max(0, diasEntreDatasComercial(dados.data_vigencia_inicio, dados.periodo_fim, dados.data_vigencia_fim))
        txtFiscalAtePeriodo = fmtTempo(diasAte)
        txtFiscalAExecutar = fmtTempo(Math.max(0, 360 - diasAte))
      } else {
        txtFiscalAtePeriodo = txtFiscalAExecutar = '-'
      }
    }

    let totalNoCent = 0
    let totalAteCent = 0
    let totalAExecCent = 0

    const body: any[][] = dados.itens.map(item => {
      const vu = Number(item.valor_unitario) || 0
      const cNo =
        item.valor_no_periodo !== undefined && item.valor_no_periodo !== null
          ? Math.round(truncarMoedaReais2Casas(Number(item.valor_no_periodo)) * 100)
          : produtoQuantidadeValorUnitarioCentavos(item.quantidade_no_periodo, vu)
      const cAcum =
        item.valor_acumulado_anterior !== undefined && item.valor_acumulado_anterior !== null
          ? Math.round(truncarMoedaReais2Casas(Number(item.valor_acumulado_anterior)) * 100)
          : produtoQuantidadeValorUnitarioCentavos(item.quantidade_acumulada_aprovada, vu)
      const cAte = cNo + cAcum
      const cTotal =
        item.valor_total_item !== undefined && item.valor_total_item !== null
          ? Math.round(truncarMoedaReais2Casas(Number(item.valor_total_item)) * 100)
          : produtoQuantidadeValorUnitarioCentavos(item.quantidade_total_contrato, vu)
      const cAExec =
        item.valor_a_executar !== undefined && item.valor_a_executar !== null
          ? Math.round(truncarMoedaReais2Casas(Number(item.valor_a_executar)) * 100)
          : Math.max(0, cTotal - cAte)

      const vlrNoPeriodo = centavosParaReaisTrunc2(cNo)
      const vlrAtePeriodo = centavosParaReaisTrunc2(cAte)
      const vlrAExecutar = centavosParaReaisTrunc2(cAExec)

      totalNoCent += cNo
      totalAteCent += cAte
      totalAExecCent += cAExec

      const un = item.unidade || 'UNIDADE'
      const fiscalNo = porQuantidade ? fmtQuantidadeExecucaoFiscal(item.quantidade_no_periodo, un) : txtFiscalNoPeriodo
      const fiscalAte = porQuantidade ? fmtQuantidadeExecucaoFiscal(item.quantidade_ate_periodo ?? (item.quantidade_acumulada_aprovada + item.quantidade_no_periodo), un) : txtFiscalAtePeriodo
      const fiscalExec = porQuantidade ? fmtQuantidadeExecucaoFiscal(item.quantidade_a_executar ?? Math.max(0, item.quantidade_total_contrato - (item.quantidade_ate_periodo ?? item.quantidade_acumulada_aprovada + item.quantidade_no_periodo)), un) : txtFiscalAExecutar

      return [
        { content: item.numero, styles: { halign: 'center' as const, fontSize: 6 } },
        { content: item.descricao, styles: { fontSize: 6 } },
        { content: fiscalNo, styles: { halign: 'center' as const, fontSize: 6 } },
        { content: fiscalAte, styles: { halign: 'center' as const, fontSize: 6 } },
        { content: fiscalExec, styles: { halign: 'center' as const, fontSize: 6 } },
        { content: fmtExecFinanceira(vlrNoPeriodo), styles: { halign: 'right' as const, fontSize: 6 } },
        { content: fmtExecFinanceira(vlrAtePeriodo), styles: { halign: 'right' as const, fontSize: 6 } },
        { content: fmtExecFinanceira(vlrAExecutar), styles: { halign: 'right' as const, fontSize: 6 } },
      ]
    })

    const totalNoPeriodoExibicao =
      dados.valor_medido ?? dados.execucao_financeira_totais?.no_periodo ?? centavosParaReaisTrunc2(totalNoCent)
    const totalAtePeriodoExibicao =
      dados.execucao_financeira_totais?.ate_periodo ?? centavosParaReaisTrunc2(totalAteCent)
    const totalAExecutarExibicao =
      dados.execucao_financeira_totais?.a_executar ?? centavosParaReaisTrunc2(totalAExecCent)

    body.push([
      { content: 'TOTAL', colSpan: 5, styles: { halign: 'right' as const, fontStyle: 'bold' as const, fontSize: 6.5, fillColor: [230, 230, 230] as [number,number,number] } },
      { content: fmtExecFinanceira(totalNoPeriodoExibicao), styles: { halign: 'right' as const, fontStyle: 'bold' as const, fontSize: 6.5, fillColor: [230, 230, 230] as [number,number,number] } },
      { content: fmtExecFinanceira(totalAtePeriodoExibicao), styles: { halign: 'right' as const, fontStyle: 'bold' as const, fontSize: 6.5, fillColor: [230, 230, 230] as [number,number,number] } },
      { content: fmtExecFinanceira(totalAExecutarExibicao), styles: { halign: 'right' as const, fontStyle: 'bold' as const, fontSize: 6.5, fillColor: [230, 230, 230] as [number,number,number] } },
    ])

    autoTable(doc, {
      startY: y,
      head,
      body,
      theme: 'grid',
      styles: { fontSize: 5.8, cellPadding: 1.1, lineWidth: 0.2, lineColor: [190, 190, 190] as [number,number,number], overflow: 'linebreak', ...textoCorpoTabelaPdf },
      headStyles: { fillColor: [22, 60, 100] as [number,number,number], textColor: [255, 255, 255] as [number,number,number] },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 66 },
        2: { cellWidth: 19 },
        3: { cellWidth: 19 },
        4: { cellWidth: 18 },
        5: { cellWidth: 19 },
        6: { cellWidth: 23 },
        7: { cellWidth: 22 },
      },
      margin: { left: mX, right: mX },
    })
    y = (doc as any).lastAutoTable.finalY + 4
  }

  // =========================================================
  // ETAPAS DE OBRA
  // =========================================================
  if (dados.etapas && dados.etapas.length > 0) {
    doc.setFillColor(22, 60, 100)
    doc.rect(mX, y, W - 2 * mX, 6, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.text('PLANILHA ORÇAMENTÁRIA — ETAPAS', W / 2, y + 4, { align: 'center' })
    y += 6
    doc.setTextColor(0, 0, 0)

    autoTable(doc, {
      startY: y,
      head: [[
        { content: 'Nº', styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
        { content: 'Descrição', styles: { fontStyle: 'bold' as const } },
        { content: '% Físico', styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
        { content: '% Anterior', styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
        { content: '% Medido', styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
        { content: 'Avanço Global', styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
        { content: 'Vl. Medido', styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
      ]],
      body: dados.etapas.map(e => [
        { content: e.numero, styles: { halign: 'center' as const } },
        e.descricao,
        { content: `${e.percentual_fisico.toFixed(1)}%`, styles: { halign: 'center' as const } },
        { content: `${e.percentual_executado_anterior.toFixed(1)}%`, styles: { halign: 'center' as const } },
        { content: `${e.percentual_executado_atual.toFixed(1)}%`, styles: { halign: 'center' as const } },
        { content: `${((e.percentual_fisico * (e.percentual_executado_anterior + e.percentual_executado_atual)) / 100).toFixed(1)}%`, styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
        { content: fmt(e.valor_medido), styles: { halign: 'right' as const } },
      ]),
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5, ...textoCorpoTabelaPdf },
      headStyles: { fillColor: [22, 60, 100] as [number,number,number], textColor: [255, 255, 255] as [number,number,number] },
      margin: { left: mX, right: mX },
    })
    y = (doc as any).lastAutoTable.finalY + 5
  }

  // =========================================================
  // RESUMO — apenas VALOR DA MEDIÇÃO (sem acumulado/% físico)
  // =========================================================
  if (y + 14 > H - 24) { doc.addPage(); y = 10 }

  doc.setFillColor(235, 245, 255)
  doc.setDrawColor(22, 60, 100)
  doc.setLineWidth(0.4)
  doc.rect(mX, y, W - 2 * mX, 14, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(0, 0, 0)
  doc.text('VALOR DA MEDIÇÃO:', mX + 4, y + 5.5)
  doc.setFontSize(13)
  doc.setTextColor(22, 60, 100)
  doc.text(fmt(dados.valor_medido), mX + 4, y + 12)
  y += 16

  // =========================================================
  // ASSINATURAS (estilo OS/OF — Lei 14.063/2020)
  // =========================================================
  if (y + 52 > H - 8) { doc.addPage(); y = 10 }

  const aForn = dados.assinatura_fornecedor
  const aFisc = dados.assinatura_fiscal
  const aEng = dados.assinatura_engenheiro

  const assinaturasArr: Parameters<typeof desenharQuadroAssinaturas>[4] = [
    {
      titulo: 'FORNECEDOR',
      cor: [22, 60, 100] as [number, number, number],
      nome: aForn?.nome || '',
      identificacao: aForn ? `CNPJ: ${fmtCnpj(aForn.cnpj)}` : '',
      cargo: aForn?.cargo || '',
      dataHora: aForn?.data_hora || '',
      pendente: !aForn,
      codigoValidacao: aForn?.codigo_validacao,
    },
    {
      titulo: 'FISCAL DE CONTRATO',
      cor: [0, 100, 50] as [number, number, number],
      nome: aFisc?.nome || '',
      identificacao: aFisc?.cpf ? `CPF: ${aFisc.cpf}` : '',
      cargo: aFisc?.cargo || '',
      matricula: aFisc?.matricula,
      portaria: aFisc?.portaria,
      dataHora: aFisc?.data_hora || '',
      pendente: !aFisc,
      codigoValidacao: aFisc?.codigo_validacao,
    },
    ...(aEng
      ? [{
          titulo: 'ENGENHEIRO RESPONSÁVEL TÉCNICO',
          cor: [124, 58, 173] as [number, number, number],
          nome: aEng?.nome || '',
          identificacao: aEng?.cpf ? `CPF: ${aEng.cpf}` : '',
          cargo: aEng?.crea ? `CREA: ${aEng.crea}` : (aEng?.cargo || ''),
          dataHora: '', // assinatura do engenheiro exibida sem data/hora
          pendente: !aEng,
          codigoValidacao: aEng?.codigo_validacao,
        }]
      : []),
  ]

  const altQuadro = desenharQuadroAssinaturas(doc, y, mX, W, assinaturasArr, dados.url_validacao, dados.qr_code_data_url)

  y += altQuadro + 4

  // =========================================================
  // PÁGINA EXCLUSIVA DE ASSINATURAS
  // =========================================================
  doc.addPage('a4', 'portrait')
  let yPA = 20
  doc.setFontSize(10).setFont('helvetica', 'bold').setTextColor(22, 60, 100)
  doc.text(
    `BOLETIM DE MEDIÇÃO Nº ${String(dados.numero_medicao).padStart(3, '0')}`,
    W / 2, yPA, { align: 'center' },
  )
  doc.setFontSize(8).setFont('helvetica', 'normal').setTextColor(55, 65, 81)
  if (dados.orgao_nome) doc.text(dados.orgao_nome, W / 2, yPA + 6, { align: 'center' })
  doc.text(`Contrato: ${dados.numero_contrato}`, W / 2, yPA + 11, { align: 'center' })
  yPA += 20
  desenharQuadroAssinaturas(doc, yPA, mX, W, assinaturasArr, dados.url_validacao, dados.qr_code_data_url)

  // =========================================================
  // RODAPÉ em todas as páginas
  // =========================================================
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(5.5)
    doc.setTextColor(160, 160, 160)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `Portal DCP  |  Boletim de Medição Nº ${dados.numero_medicao}  |  Contrato: ${dados.numero_contrato}  |  Competência: ${competencia}  |  Página ${i}/${pages}`,
      W / 2, H - 5, { align: 'center' },
    )
  }

  const nomeArq = `BM_${dados.numero_contrato.replace(/[/\\]/g, '-')}_${String(dados.numero_medicao).padStart(3, '0')}_${competencia.replace('/', '-')}.pdf`
  
  // Fazer download do PDF
  doc.save(nomeArq)
  
  // Retornar blob para upload
  return doc.output('blob')
}

/**
 * AVISO DE CONTRATAÇÃO DIRETA — Dispensa Eletrônica (art. 75, §3º, Lei 14.133/2021).
 * PDF real anexado ao PNCP na inclusão da compra (substitui o antigo placeholder).
 * Gerado dos dados da licitação: identificação, objeto, itens, prazos e forma
 * de participação.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fundamentoLegalTexto } from '../pncp/mapeamento-pncp';
import { REFERENCIA_COM_LANCES, REFERENCIA_SEM_LANCES, textoFormaDisputa } from './modo-disputa-dispensa';

const fmtMoeda = (v: any) =>
  Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
// Horário de Brasília (UTC-3) fixo — o PDF é o mesmo em qualquer servidor.
const fmtDataHora = (d: any) =>
  d ? `${new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Bahia', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} (horário de Brasília)` : '—';

export interface DadosAvisoDispensa {
  orgao_nome: string;
  orgao_cnpj?: string;
  licitacao: any;
  itens: any[];
  /** URL do sistema onde as propostas são recebidas (portal do fornecedor) */
  url_sistema?: string;
  /**
   * Disputa da dispensa (fase interna, Entrega 5 — escolha do agente no
   * processo): com disputa de lances ou só recebimento de propostas.
   */
  com_lances?: boolean;
}

export function gerarAvisoDispensaPdf(dados: DadosAvisoDispensa): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const mX = 14;
  let y = 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(dados.orgao_nome || 'ÓRGÃO', W / 2, y, { align: 'center' });
  if (dados.orgao_cnpj) {
    y += 5;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`CNPJ: ${dados.orgao_cnpj}`, W / 2, y, { align: 'center' });
  }
  y += 9;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('AVISO DE CONTRATAÇÃO DIRETA', W / 2, y, { align: 'center' });
  y += 6;
  doc.setFontSize(10);
  doc.text('DISPENSA ELETRÔNICA — Art. 75, §3º, da Lei nº 14.133/2021', W / 2, y, { align: 'center' });
  y += 9;

  const lic = dados.licitacao;
  const comLances = dados.com_lances !== false;
  const linhas: Array<[string, string]> = [
    ['Processo', String(lic.numero_processo || '—')],
    // Fundamento: campo único do processo (fundamento-legal.ts) — o mesmo do PNCP
    ['Fundamento legal', fundamentoLegalTexto(lic) || '—'],
    ['Objeto', String(lic.objeto || '—')],
    ['Critério de julgamento', comLances ? 'Menor preço unitário por item' : 'Menor preço unitário por item (empate: prevalece a proposta registrada primeiro)'],
    [
      'Disputa',
      comLances
        ? `Com disputa de lances (sessão de lances em tempo real, de 6 a 10 horas, depois do prazo de propostas) — ${REFERENCIA_COM_LANCES}`
        : `Sem disputa de lances (só recebimento de propostas no prazo do aviso) — ${REFERENCIA_SEM_LANCES}`,
    ],
    ['Valor total estimado', fmtMoeda(lic.valor_total_estimado)],
    [
      'Divulgação oficial (PNCP)',
      lic.data_divulgacao_oficial
        ? fmtDataHora(lic.data_divulgacao_oficial)
        : `Envio ao PNCP em ${fmtDataHora(lic.data_publicacao_edital)} — o prazo corre da confirmação da publicação no PNCP`,
    ],
    [
      'Recebimento de propostas até',
      fmtDataHora(lic.data_fim_acolhimento || lic.data_abertura_sessao),
    ],
    [
      'Forma de participação',
      `Eletrônica, pelo sistema ${dados.url_sistema || 'Portal DCP'} (cadastro gratuito de fornecedores). ${
        comLances ? 'Encerrado o prazo de propostas, haverá sessão de disputa de lances (IN SEGES 67/2021, art. 11).' : 'Não haverá disputa de lances: valem as propostas recebidas até o fim do prazo do aviso.'
      }`,
    ],
  ];
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 1.8 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
    body: linhas,
    margin: { left: mX, right: mX },
  });
  y = (doc as any).lastAutoTable.finalY + 7;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('ITENS', mX, y);
  autoTable(doc, {
    startY: y + 2,
    theme: 'striped',
    styles: { fontSize: 8.5, cellPadding: 1.6 },
    head: [['Item', 'Descrição', 'Unid.', 'Qtd', 'Vl. unit. estimado', 'Vl. total estimado']],
    body: (dados.itens || []).map((i) => [
      String(i.numero_item ?? '—'),
      String(i.descricao_resumida || i.descricao_detalhada || '').slice(0, 80),
      String(i.unidade_medida || '—'),
      Number(i.quantidade || 0).toLocaleString('pt-BR'),
      i.valor_unitario_estimado != null ? fmtMoeda(i.valor_unitario_estimado) : '—',
      i.valor_total_estimado != null ? fmtMoeda(i.valor_total_estimado) : '—',
    ]),
    margin: { left: mX, right: mX },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  if (y > 250) {
    doc.addPage();
    y = 20;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const texto =
    'Os interessados deverão encaminhar proposta exclusivamente por meio do sistema indicado, até a data e hora ' +
    'limites deste aviso, respeitado o prazo mínimo de 3 (três) dias úteis contado da divulgação no PNCP (art. 75, §3º, ' +
    'da Lei 14.133/2021; IN SEGES 67/2021, art. 6º, parágrafo único) — se a confirmação da publicação no PNCP ocorrer ' +
    'depois, as datas serão estendidas até o mínimo legal. O conteúdo das propostas é sigiloso até a abertura. ' +
    textoFormaDisputa(comLances) +
    ' A comunicação entre o órgão e os fornecedores é feita pelas mensagens do sistema ' +
    '(IN SEGES 67/2021, art. 10). O resultado e o contrato serão divulgados no PNCP.';
  const linhasTexto = doc.splitTextToSize(texto, W - mX * 2);
  doc.text(linhasTexto, mX, y);
  y += linhasTexto.length * 4.2 + 8;

  doc.setFontSize(8.5);
  doc.text(
    `Aviso gerado eletronicamente pelo Portal DCP em ${fmtDataHora(new Date())}.`,
    mX,
    y,
  );

  return Buffer.from(doc.output('arraybuffer'));
}

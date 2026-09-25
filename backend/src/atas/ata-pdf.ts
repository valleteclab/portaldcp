/**
 * TERMO DA ATA DE REGISTRO DE PREÇOS (Lei 14.133/2021 arts. 82–86; Decreto
 * 11.462/2023) — PDF gerado pelo sistema com os itens, preços e quantidades
 * registrados, a vigência, as regras de adesão e o cadastro de reserva, com
 * página final de assinaturas em posições fixas (mesmo assinador do contrato).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { dataIso } from './regras-arp';

const fmtMoeda = (v: any) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 });
const fmtData = (d: any) => {
  if (!d) return '—';
  const s = dataIso(d) || '';
  const [a, m, dia] = s.split('-');
  return `${dia}/${m}/${a}`;
};
const fmtQtd = (v: any) => Number(v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
const fmtCnpj = (v: any) => {
  const s = String(v || '').replace(/\D/g, '');
  if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return String(v || '—');
};

/** Posições relativas (0-1) dos blocos de assinatura na ÚLTIMA página. */
export const POSICAO_ASSINATURA_GERENCIADOR = { pos_x: 0.5, pos_y: 0.42 };
export const POSICAO_ASSINATURA_FORNECEDOR = { pos_x: 0.5, pos_y: 0.66 };

export interface DadosTermoAta {
  ata: any; // numero_ata, objeto, fornecedor_*, prazo_vigencia_meses, data_vigencia_fim (reserva), origem
  orgao: any;
  licitacao?: any;
  itens: any[]; // numero_item, descricao, unidade_medida, quantidade_registrada, valor_unitario, valor_total, marca
  reserva: Array<{ numero_item: number; posicao: number; razao_social: string; cpf_cnpj: string }>;
  responsavel_orgao?: { nome?: string };
  ataOrigem?: { numero_ata: string; cancelamento_motivo?: string | null } | null;
}

export function gerarTermoAtaPdf(dados: DadosTermoAta): { buffer: Buffer; ultimaPagina: number } {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const mX = 16;
  let y = 18;
  const a = dados.ata;
  const lic = dados.licitacao || {};
  const orgao = dados.orgao || {};

  const quebra = (min = 24) => {
    if (y > H - min) {
      doc.addPage();
      y = 18;
    }
  };
  const paragrafo = (texto: string, opts?: { bold?: boolean; gap?: number }) => {
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setFontSize(10);
    for (const linha of doc.splitTextToSize(texto, W - mX * 2)) {
      quebra();
      doc.text(linha, mX, y);
      y += 4.8;
    }
    y += opts?.gap ?? 2.5;
  };
  const clausula = (titulo: string, texto: string) => {
    quebra(30);
    paragrafo(titulo, { bold: true, gap: 1 });
    paragrafo(texto);
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(String(orgao.nome || 'ÓRGÃO GERENCIADOR').toUpperCase(), W / 2, y, { align: 'center' });
  y += 7;
  doc.setFontSize(13);
  doc.text(`ATA DE REGISTRO DE PREÇOS Nº ${a.numero_ata || '—'}`, W / 2, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Processo ${lic.numero_processo || '—'} · Sistema de Registro de Preços · Lei nº 14.133/2021`, W / 2, y, { align: 'center' });
  y += 9;

  paragrafo(
    `O ${orgao.nome || 'ÓRGÃO GERENCIADOR'}, inscrito no CNPJ nº ${fmtCnpj(orgao.cnpj)}, doravante ÓRGÃO GERENCIADOR, ` +
      `registra os preços ofertados por ${a.fornecedor_razao_social || 'FORNECEDOR'}, inscrito(a) no CNPJ/CPF nº ${fmtCnpj(a.fornecedor_cnpj)}, ` +
      `doravante FORNECEDOR, ${
        dados.ataOrigem
          ? `convocado(a) do cadastro de reserva em razão do cancelamento do registro da Ata nº ${dados.ataOrigem.numero_ata}, `
          : ''
      }` +
      `vencedor(a) do procedimento ${lic.numero_edital ? `(edital ${lic.numero_edital}) ` : ''}homologado, ` +
      `nos termos dos arts. 82 a 86 da Lei nº 14.133/2021, observadas as condições a seguir.`,
  );

  clausula('CLÁUSULA PRIMEIRA — DO OBJETO', String(a.objeto || lic.objeto || '—'));

  if (dados.itens?.length) {
    quebra(40);
    autoTable(doc, {
      startY: y,
      margin: { left: mX, right: mX },
      styles: { fontSize: 8.5, cellPadding: 1.6 },
      headStyles: { fillColor: [40, 60, 100] },
      head: [['Item', 'Descrição', 'Marca', 'Un.', 'Qtde registrada', 'Preço unitário', 'Total']],
      body: dados.itens.map((i: any) => [
        String(i.numero_item ?? '—'),
        String(i.descricao || '—').slice(0, 70),
        String(i.marca || '—'),
        String(i.unidade_medida || 'UN'),
        fmtQtd(i.quantidade_registrada),
        fmtMoeda(i.valor_unitario),
        fmtMoeda(i.valor_total),
      ]),
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  clausula(
    'CLÁUSULA SEGUNDA — DA VIGÊNCIA',
    dados.ataOrigem
      ? `Esta ata vigora da data da última assinatura até ${fmtData(a.data_vigencia_fim)} (restante da vigência da ata de origem — art. 84 da Lei nº 14.133/2021).`
      : `A vigência desta ata é de ${a.prazo_vigencia_meses || 12} (${a.prazo_vigencia_meses || 12}) meses, contados da data da última assinatura, ` +
          `prorrogável uma única vez por igual período, desde que comprovado o preço vantajoso (art. 84 da Lei nº 14.133/2021).`,
  );
  clausula(
    'CLÁUSULA TERCEIRA — DA UTILIZAÇÃO',
    'A existência de preços registrados não obriga a Administração a contratar (art. 83). As contratações serão formalizadas por contrato, ' +
      'ordem de fornecimento ou de serviço, até o limite das quantidades registradas, com controle de saldo no sistema.',
  );
  clausula(
    'CLÁUSULA QUARTA — DA ADESÃO',
    a.permite_adesao === false
      ? 'Não é admitida a adesão a esta ata por órgãos ou entidades não participantes.'
      : 'Órgãos e entidades não participantes poderão aderir a esta ata mediante justificativa da vantagem, consulta e anuência do órgão gerenciador ' +
          'e aceite do fornecedor (art. 86 §2º), limitada cada adesão a 50% dos quantitativos de cada item registrado (art. 86 §4º) ' +
          'e o total das adesões ao dobro desses quantitativos (art. 86 §5º).',
  );

  const reserva = dados.reserva || [];
  clausula(
    'CLÁUSULA QUINTA — DO CADASTRO DE RESERVA',
    reserva.length
      ? 'Integram o cadastro de reserva, na ordem de classificação, os licitantes que aceitaram cotar ao preço do vencedor (art. 82 VII; Decreto 11.462/2023 art. 18), ' +
          'a serem convocados em caso de cancelamento do registro do fornecedor:'
      : 'Não houve licitante que aceitasse cotar ao preço do vencedor até a assinatura desta ata; não há cadastro de reserva.',
  );
  if (reserva.length) {
    quebra(30);
    autoTable(doc, {
      startY: y,
      margin: { left: mX, right: mX },
      styles: { fontSize: 8.5, cellPadding: 1.4 },
      headStyles: { fillColor: [90, 100, 120] },
      head: [['Item', 'Ordem', 'Licitante', 'CNPJ/CPF']],
      body: reserva.map((r) => [String(r.numero_item), `${r.posicao}º`, r.razao_social || '—', fmtCnpj(r.cpf_cnpj)]),
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  clausula(
    'CLÁUSULA SEXTA — DO CANCELAMENTO DO REGISTRO',
    'O registro do fornecedor poderá ser cancelado quando descumprir as condições da ata, não retirar o instrumento no prazo sem justificativa, ' +
      'não aceitar reduzir o preço registrado superior ao de mercado, sofrer sanção impeditiva ou por razões de interesse público, ' +
      'assegurado o contraditório (Decreto 11.462/2023, arts. 28 e 29).',
  );
  clausula(
    'CLÁUSULA SÉTIMA — DA PUBLICAÇÃO',
    'O ÓRGÃO GERENCIADOR divulgará esta ata no Portal Nacional de Contratações Públicas (PNCP) — arts. 94 e 174 da Lei nº 14.133/2021.',
  );

  doc.addPage();
  const ultimaPagina = (doc as any).internal.getNumberOfPages();
  y = 24;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('ASSINATURAS', W / 2, y, { align: 'center' });
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`As partes assinam a presente ata. Local: ${orgao.cidade || '—'}${orgao.uf ? `/${orgao.uf}` : ''}.`, mX, y, { maxWidth: W - mX * 2 });

  const y1 = H * POSICAO_ASSINATURA_GERENCIADOR.pos_y;
  doc.line(W / 2 - 45, y1, W / 2 + 45, y1);
  doc.setFontSize(9.5);
  doc.text('ÓRGÃO GERENCIADOR', W / 2, y1 + 5, { align: 'center' });
  doc.text(`${orgao.nome || '—'}${dados.responsavel_orgao?.nome ? ` — ${dados.responsavel_orgao.nome}` : ''}`, W / 2, y1 + 10, {
    align: 'center',
    maxWidth: W - mX * 2,
  });
  const y2 = H * POSICAO_ASSINATURA_FORNECEDOR.pos_y;
  doc.line(W / 2 - 45, y2, W / 2 + 45, y2);
  doc.text('FORNECEDOR', W / 2, y2 + 5, { align: 'center' });
  doc.text(`${a.fornecedor_razao_social || '—'} — CNPJ/CPF ${fmtCnpj(a.fornecedor_cnpj)}`, W / 2, y2 + 10, { align: 'center', maxWidth: W - mX * 2 });

  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    'Documento assinado eletronicamente pelo Portal DCP — a autenticidade pode ser verificada com o código de validação de cada assinatura.',
    W / 2,
    H - 12,
    { align: 'center', maxWidth: W - mX * 2 },
  );
  return { buffer: Buffer.from(doc.output('arraybuffer')), ultimaPagina };
}

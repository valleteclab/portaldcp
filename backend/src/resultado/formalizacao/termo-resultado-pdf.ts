/**
 * TERMO DE ADJUDICAÇÃO / TERMO DE ADJUDICAÇÃO E HOMOLOGAÇÃO (Lei 14.133/2021
 * art. 71 IV) — PDF gerado pelo sistema com objeto, modalidade, número, itens
 * ou lotes com vencedor/CNPJ/valores, total, fundamentação, data, autoridade
 * (nome/cargo/delegação) e o rodapé "registrado no sistema por <operador>".
 * O bloco de assinatura da autoridade fica em posição fixa na ÚLTIMA página
 * (o assinador carimba a assinatura eletrônica ali).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AutoridadeDoAto, TipoFormalizacao, identificacaoAutoridade, tituloDoTermo } from './regras-formalizacao';

/** Posição relativa (0-1) do bloco de assinatura da autoridade na última página. */
export const POSICAO_ASSINATURA_AUTORIDADE = { pos_x: 0.3, pos_y: 0.7 };

const fmtMoeda = (v: any) =>
  Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 });
const fmtQtd = (v: any) => Number(v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
const fmtDataIso = (iso: string) => {
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : String(iso);
};
/** Data/hora em Brasília (UTC-3), sem deslocar o dia. */
export const fmtDataHoraBrasilia = (d: Date | string | null | undefined, comHora = true) => {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(comHora ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
};
const fmtCnpj = (v: any) => {
  const s = String(v || '').replace(/\D/g, '');
  if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return String(v || '—');
};
const mascararCpf = (cpf: string | null) => {
  const s = String(cpf || '').replace(/\D/g, '');
  return s.length === 11 ? `***.${s.slice(3, 6)}.${s.slice(6, 9)}-**` : null;
};

const ROTULO_MODALIDADE: Record<string, string> = {
  PREGAO_ELETRONICO: 'Pregão Eletrônico',
  PREGAO_PRESENCIAL: 'Pregão Presencial',
  CONCORRENCIA: 'Concorrência',
  CONCORRENCIA_ELETRONICA: 'Concorrência Eletrônica',
  DISPENSA_ELETRONICA: 'Dispensa Eletrônica',
  DISPENSA: 'Dispensa',
  INEXIGIBILIDADE: 'Inexigibilidade',
  CONCURSO: 'Concurso',
  LEILAO: 'Leilão',
  DIALOGO_COMPETITIVO: 'Diálogo Competitivo',
};
export const rotuloModalidade = (m: string | null | undefined) => ROTULO_MODALIDADE[String(m)] ?? String(m || '—').replace(/_/g, ' ');

/** Uma linha do quadro: item (ou item dentro do lote) com vencedor e valores. */
export interface LinhaTermo {
  unidade: string; // "Item 1" | "Lote 2"
  numeroItem: number;
  descricao: string;
  quantidade: number;
  unidadeMedida?: string | null;
  fornecedor: string;
  cnpj: string;
  valorUnitario: number;
  valorTotal: number;
}

export interface DadosTermoResultado {
  tipo: TipoFormalizacao;
  orgao: { nome?: string; cnpj?: string; cidade?: string; uf?: string };
  licitacao: { numero_processo?: string; numero_edital?: string | null; objeto?: string; modalidade?: string; srp?: boolean };
  linhas: LinhaTermo[];
  total: number;
  autoridade: AutoridadeDoAto;
  /** Data do ato (efeito) — REGISTRO_DIRETO/TERMO_EXTERNO: agora; ASSINATURA: data da assinatura (a confirmar). */
  dataAto: Date | null;
  dataAdjudicacao?: Date | string | null;
  operador: { nome: string; em: Date };
  modo: string;
  /** Rascunho/prévia (sem efeito): marca d'água textual. */
  previa?: boolean;
}

export function gerarTermoResultadoPdf(d: DadosTermoResultado): { buffer: Buffer; ultimaPagina: number } {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const mX = 16;
  let y = 18;
  const homolog = d.tipo === TipoFormalizacao.HOMOLOGACAO;

  const quebra = (min = 24) => {
    if (y > H - min) {
      doc.addPage();
      y = 18;
    }
  };
  const paragrafo = (texto: string, opts?: { bold?: boolean; gap?: number; size?: number }) => {
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setFontSize(opts?.size ?? 10);
    for (const linha of doc.splitTextToSize(texto, W - mX * 2)) {
      quebra();
      doc.text(linha, mX, y);
      y += 4.8;
    }
    y += opts?.gap ?? 2.5;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(String(d.orgao.nome || 'ÓRGÃO').toUpperCase(), W / 2, y, { align: 'center' });
  y += 5;
  if (d.orgao.cnpj) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`CNPJ ${fmtCnpj(d.orgao.cnpj)}`, W / 2, y, { align: 'center' });
    y += 6;
  } else {
    y += 2;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(tituloDoTermo(d.tipo), W / 2, y, { align: 'center' });
  y += 8;
  if (d.previa) {
    doc.setFontSize(9);
    doc.setTextColor(180, 0, 0);
    doc.text('PRÉVIA — SEM EFEITO ATÉ O REGISTRO DO ATO', W / 2, y, { align: 'center' });
    doc.setTextColor(0);
    y += 6;
  }

  const lic = d.licitacao;
  const ident: Array<[string, string]> = [
    ['Processo', lic.numero_processo || '—'],
    ['Modalidade', `${rotuloModalidade(lic.modalidade)}${lic.srp ? ' — Sistema de Registro de Preços' : ''}`],
    ['Número', lic.numero_edital || lic.numero_processo || '—'],
    ['Objeto', String(lic.objeto || '—')],
  ];
  if (homolog && d.dataAdjudicacao) ident.push(['Adjudicação', fmtDataHoraBrasilia(d.dataAdjudicacao, false)]);
  autoTable(doc, {
    startY: y,
    margin: { left: mX, right: mX },
    theme: 'plain',
    styles: { fontSize: 9.5, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30 } },
    body: ident,
  });
  y = (doc as any).lastAutoTable.finalY + 5;

  const autoridadeTxt = identificacaoAutoridade(d.autoridade, fmtDataIso);
  paragrafo(
    homolog
      ? `${autoridadeTxt}, no uso de suas atribuições legais e com fundamento no art. 71, inciso IV, da Lei nº 14.133/2021, ` +
          'considerando o julgamento das propostas, a habilitação e o encerramento da fase recursal, e verificada a regularidade dos atos ' +
          'praticados, RESOLVE ADJUDICAR o objeto aos licitantes vencedores e HOMOLOGAR o resultado do procedimento acima identificado, ' +
          'conforme o quadro abaixo:'
      : `${autoridadeTxt}, no uso de suas atribuições legais e com fundamento no art. 71, inciso IV, da Lei nº 14.133/2021, ` +
          'considerando o julgamento das propostas, a habilitação e a fase recursal, RESOLVE ADJUDICAR o objeto do procedimento acima ' +
          'identificado aos licitantes vencedores, pelos valores da proposta adequada aceita, conforme o quadro abaixo:',
  );

  quebra(40);
  autoTable(doc, {
    startY: y,
    margin: { left: mX, right: mX },
    styles: { fontSize: 8, cellPadding: 1.4 },
    headStyles: { fillColor: [40, 60, 100] },
    head: [['Unidade', 'Item', 'Descrição', 'Qtde', 'Vencedor', 'CNPJ/CPF', 'Unitário', 'Total']],
    body: d.linhas.map((l) => [
      l.unidade,
      String(l.numeroItem),
      String(l.descricao || '—').slice(0, 60),
      `${fmtQtd(l.quantidade)}${l.unidadeMedida ? ` ${l.unidadeMedida}` : ''}`,
      String(l.fornecedor || '—').slice(0, 40),
      fmtCnpj(l.cnpj),
      fmtMoeda(l.valorUnitario),
      fmtMoeda(l.valorTotal),
    ]),
    foot: [['', '', '', '', '', '', homolog ? 'Total homologado' : 'Total adjudicado', fmtMoeda(d.total)]],
    footStyles: { fillColor: [235, 238, 245], textColor: 20, fontStyle: 'bold' },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  if (homolog) {
    paragrafo(
      `Valor total ${lic.srp ? 'registrado' : 'homologado'}: ${fmtMoeda(d.total)}. ` +
        (lic.srp
          ? 'Convoquem-se os vencedores para a assinatura da ata de registro de preços (arts. 82 a 86).'
          : 'Convoquem-se os adjudicatários para a assinatura do contrato (art. 90).') +
        ' Publique-se no Portal Nacional de Contratações Públicas (art. 94) e no veículo oficial do órgão.',
    );
  }

  // Bloco de assinatura na última página, em posição fixa
  const yLinha = H * POSICAO_ASSINATURA_AUTORIDADE.pos_y + 22;
  if (y > H * POSICAO_ASSINATURA_AUTORIDADE.pos_y - 18) {
    doc.addPage();
    y = 24;
  }
  const local = `${d.orgao.cidade || ''}${d.orgao.uf ? `/${d.orgao.uf}` : ''}`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    `${local ? `${local}, ` : ''}${d.dataAto ? fmtDataHoraBrasilia(d.dataAto, false) : 'data da assinatura eletrônica'}.`,
    W - mX,
    H * POSICAO_ASSINATURA_AUTORIDADE.pos_y - 8,
    { align: 'right' },
  );
  doc.line(W / 2 - 55, yLinha, W / 2 + 55, yLinha);
  doc.setFont('helvetica', 'bold');
  doc.text(d.autoridade.nome, W / 2, yLinha + 5, { align: 'center', maxWidth: W - mX * 2 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(d.autoridade.cargo, W / 2, yLinha + 10, { align: 'center', maxWidth: W - mX * 2 });
  let yExtra = yLinha + 15;
  const cpf = mascararCpf(d.autoridade.cpf);
  if (cpf) {
    doc.text(`CPF ${cpf}`, W / 2, yExtra, { align: 'center' });
    yExtra += 5;
  }
  if (d.autoridade.ato_delegacao_numero) {
    doc.text(
      `Competência delegada — ato nº ${d.autoridade.ato_delegacao_numero}${d.autoridade.ato_delegacao_data ? `, de ${fmtDataIso(d.autoridade.ato_delegacao_data)}` : ''}`,
      W / 2,
      yExtra,
      { align: 'center', maxWidth: W - mX * 2 },
    );
  }

  // Rodapé em todas as páginas: operador × autoridade
  const paginas = (doc as any).internal.getNumberOfPages();
  const modoTxt =
    d.modo === 'ASSINATURA_ELETRONICA'
      ? 'Ato com efeito a partir da assinatura eletrônica da autoridade.'
      : d.modo === 'TERMO_EXTERNO'
        ? 'Termo assinado/publicado fora do sistema e anexado ao processo.'
        : 'Ato registrado no sistema com os dados da autoridade competente.';
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(110);
    doc.text(
      `Registrado no sistema por ${d.operador.nome} em ${fmtDataHoraBrasilia(d.operador.em)} (horário de Brasília). ${modoTxt}`,
      W / 2,
      H - 12,
      { align: 'center', maxWidth: W - mX * 2 },
    );
    doc.text(`Página ${p} de ${paginas}`, W - mX, H - 6, { align: 'right' });
    doc.setTextColor(0);
  }
  return { buffer: Buffer.from(doc.output('arraybuffer')), ultimaPagina: paginas };
}

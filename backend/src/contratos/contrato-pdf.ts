/**
 * TERMO DE CONTRATO (arts. 89 e 92 da Lei 14.133/2021) — PDF gerado pelo
 * sistema a partir dos dados do contrato/licitação, com página final de
 * assinaturas em posições fixas (usadas pelo assinador eletrônico para
 * carimbar as assinaturas das partes).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmtMoeda = (v: any) =>
  Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtData = (d: any) =>
  d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
const fmtCnpj = (v: any) => {
  const s = String(v || '').replace(/\D/g, '');
  if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return String(v || '—');
};

/**
 * Posições relativas (0-1) dos blocos de assinatura na ÚLTIMA página do
 * termo — o assinador usa esses valores em pagina_assinatura/pos_x/pos_y.
 */
export const POSICAO_ASSINATURA_CONTRATANTE = { pos_x: 0.5, pos_y: 0.42 };
export const POSICAO_ASSINATURA_CONTRATADA = { pos_x: 0.5, pos_y: 0.66 };

export interface DadosTermoContrato {
  contrato: any; // numero_contrato, objeto, valor_global, datas, fornecedor_*
  orgao: any; // nome, cnpj, cidade, uf, endereco?
  licitacao?: any; // numero_processo, modalidade, tipo_contratacao, numero_controle_pncp
  itens: any[]; // itens do fornecedor: numero_item, descricao, quantidade, unidade, valor unit/total homologado
  responsavel_orgao?: { nome?: string; cargo?: string };
}

export function gerarTermoContratoPdf(dados: DadosTermoContrato): { buffer: Buffer; ultimaPagina: number } {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const mX = 16;
  let y = 18;

  const c = dados.contrato;
  const lic = dados.licitacao || {};
  const orgao = dados.orgao || {};

  const quebra = (minAltura = 24) => {
    if (y > H - minAltura) {
      doc.addPage();
      y = 18;
    }
  };
  const paragrafo = (texto: string, opts?: { bold?: boolean; size?: number; gap?: number }) => {
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setFontSize(opts?.size ?? 10);
    const linhas = doc.splitTextToSize(texto, W - mX * 2);
    for (const linha of linhas) {
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

  // Cabeçalho
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(String(orgao.nome || 'ÓRGÃO').toUpperCase(), W / 2, y, { align: 'center' });
  y += 7;
  doc.setFontSize(13);
  doc.text(`TERMO DE CONTRATO Nº ${c.numero_contrato || '—'}`, W / 2, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Processo ${c.numero_processo || lic.numero_processo || '—'} · Lei nº 14.133/2021`, W / 2, y, { align: 'center' });
  y += 9;

  // Preâmbulo — qualificação das partes
  const fundamentacao =
    lic.modalidade === 'DISPENSA_ELETRONICA'
      ? `dispensa eletrônica de licitação (art. 75 da Lei nº 14.133/2021), processo ${c.numero_processo || lic.numero_processo || '—'}`
      : lic.modalidade === 'INEXIGIBILIDADE'
        ? `inexigibilidade de licitação (art. 74 da Lei nº 14.133/2021), processo ${c.numero_processo || lic.numero_processo || '—'}`
        : `procedimento licitatório (Lei nº 14.133/2021), processo ${c.numero_processo || lic.numero_processo || '—'}`;
  paragrafo(
    `O ${orgao.nome || 'ÓRGÃO CONTRATANTE'}, inscrito no CNPJ nº ${fmtCnpj(orgao.cnpj)}, ` +
      `com sede em ${[orgao.endereco, orgao.cidade, orgao.uf].filter(Boolean).join(', ') || '—'}, ` +
      `doravante denominado CONTRATANTE, e ${c.fornecedor_razao_social || 'FORNECEDOR'}, ` +
      `inscrito(a) no CNPJ/CPF nº ${fmtCnpj(c.fornecedor_cnpj)}, doravante denominado(a) CONTRATADA, ` +
      `resolvem celebrar o presente Termo de Contrato, decorrente de ${fundamentacao}, ` +
      `mediante as cláusulas e condições a seguir.`,
  );

  // Cláusulas essenciais (art. 92)
  clausula('CLÁUSULA PRIMEIRA — DO OBJETO', String(c.objeto || lic.objeto || '—'));

  // Itens do contrato
  if (dados.itens?.length) {
    quebra(40);
    autoTable(doc, {
      startY: y,
      margin: { left: mX, right: mX },
      styles: { fontSize: 8.5, cellPadding: 1.6 },
      headStyles: { fillColor: [40, 60, 100] },
      head: [['Item', 'Descrição', 'Qtde', 'Un.', 'Vl. unitário', 'Vl. total']],
      body: dados.itens.map((i: any) => [
        String(i.numero_item ?? '—'),
        String(i.descricao_resumida || i.descricao || '—').slice(0, 70),
        String(Number(i.quantidade) || '—'),
        String(i.unidade_medida || 'UN'),
        fmtMoeda(i.valor_unitario_homologado ?? i.valor_unitario_estimado),
        fmtMoeda(
          i.valor_total_homologado ??
            (Number(i.valor_unitario_homologado || 0) * Number(i.quantidade || 0) || undefined),
        ),
      ]),
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  clausula(
    'CLÁUSULA SEGUNDA — DO VALOR',
    `O valor global do presente contrato é de ${fmtMoeda(c.valor_global ?? c.valor_inicial)}, ` +
      `nele incluídas todas as despesas diretas e indiretas necessárias à execução do objeto.`,
  );
  clausula(
    'CLÁUSULA TERCEIRA — DA VIGÊNCIA',
    `A vigência do contrato é de ${fmtData(c.data_vigencia_inicio)} a ${fmtData(c.data_vigencia_fim)}, ` +
      `contada na forma do art. 105 da Lei nº 14.133/2021, admitidas prorrogações nos termos da lei.`,
  );
  clausula(
    'CLÁUSULA QUARTA — DO PAGAMENTO',
    'O pagamento será efetuado após o regular ateste da execução/entrega, mediante apresentação do documento fiscal, ' +
      'observadas a ordem cronológica (art. 141 da Lei nº 14.133/2021) e as retenções legais aplicáveis.',
  );
  clausula(
    'CLÁUSULA QUINTA — DAS OBRIGAÇÕES DAS PARTES',
    'Constituem obrigações da CONTRATADA executar fielmente o objeto, manter as condições de habilitação, ' +
      'responder pelos encargos trabalhistas, previdenciários, fiscais e comerciais, e reparar vícios e defeitos. ' +
      'Constituem obrigações do CONTRATANTE acompanhar e fiscalizar a execução e efetuar os pagamentos devidos.',
  );
  clausula(
    'CLÁUSULA SEXTA — DA FISCALIZAÇÃO',
    'A execução será acompanhada e fiscalizada por representante(s) designado(s) pelo CONTRATANTE (arts. 117 e 140 da Lei nº 14.133/2021), ' +
      'com registro das ocorrências no sistema eletrônico do processo.',
  );
  clausula(
    'CLÁUSULA SÉTIMA — DAS SANÇÕES E DA RESCISÃO',
    'Pela inexecução total ou parcial aplicam-se as sanções dos arts. 155 a 163 da Lei nº 14.133/2021, garantidos o contraditório e a ampla defesa. ' +
      'O contrato poderá ser extinto nas hipóteses dos arts. 137 a 139 da mesma lei.',
  );
  clausula(
    'CLÁUSULA OITAVA — DA PUBLICAÇÃO E DO FORO',
    `O CONTRATANTE divulgará este contrato no Portal Nacional de Contratações Públicas (PNCP), condição indispensável de eficácia ` +
      `(art. 94 da Lei nº 14.133/2021)${lic.numero_controle_pncp ? `, vinculado à contratação nº ${lic.numero_controle_pncp}` : ''}. ` +
      `Fica eleito o foro da comarca de ${orgao.cidade || 'sede do CONTRATANTE'}${orgao.uf ? `/${orgao.uf}` : ''} para dirimir questões oriundas deste contrato.`,
  );

  // ===== PÁGINA DE ASSINATURAS (posições fixas p/ o assinador) =====
  doc.addPage();
  const ultimaPagina = (doc as any).internal.getNumberOfPages();
  y = 24;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('ASSINATURAS', W / 2, y, { align: 'center' });
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    `E por estarem justas e contratadas, as partes assinam o presente termo. ` +
      `Local e data: ${orgao.cidade || '—'}${orgao.uf ? `/${orgao.uf}` : ''}, ${fmtData(new Date())}.`,
    mX,
    y,
    { maxWidth: W - mX * 2 },
  );

  // Bloco CONTRATANTE (assinatura eletrônica é carimbada acima da linha)
  const yContratante = H * POSICAO_ASSINATURA_CONTRATANTE.pos_y;
  doc.line(W / 2 - 45, yContratante, W / 2 + 45, yContratante);
  doc.setFontSize(9.5);
  doc.text('CONTRATANTE', W / 2, yContratante + 5, { align: 'center' });
  doc.text(
    `${orgao.nome || '—'}${dados.responsavel_orgao?.nome ? ` — ${dados.responsavel_orgao.nome}` : ''}`,
    W / 2,
    yContratante + 10,
    { align: 'center', maxWidth: W - mX * 2 },
  );

  // Bloco CONTRATADA
  const yContratada = H * POSICAO_ASSINATURA_CONTRATADA.pos_y;
  doc.line(W / 2 - 45, yContratada, W / 2 + 45, yContratada);
  doc.text('CONTRATADA', W / 2, yContratada + 5, { align: 'center' });
  doc.text(
    `${c.fornecedor_razao_social || '—'} — CNPJ/CPF ${fmtCnpj(c.fornecedor_cnpj)}`,
    W / 2,
    yContratada + 10,
    { align: 'center', maxWidth: W - mX * 2 },
  );

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

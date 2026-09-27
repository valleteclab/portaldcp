import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { dataPorExtenso, quebrarLinhas, textoSeguroPdf } from '../licitacoes/autos/autos-regras';
import { dataBrasilia, dataHoraBrasilia } from './tramitacao-regras';

/**
 * DESPACHO DE TRAMITAÇÃO EM PDF (espinha da tramitação — F2): a folha que
 * entra nos autos a cada envio/devolução, como no processo em papel.
 * Órgão, processo, de → para, texto do despacho, data/hora em Brasília e
 * quem enviou; no lançamento posterior, "lançado em X por Y, ocorrido em Z".
 */
export interface DadosDespachoPdf {
  orgao_nome: string;
  cidade?: string | null;
  uf?: string | null;
  numero_processo: string;
  objeto?: string | null;
  sequencia: number;
  devolucao: boolean;
  de: string;
  para: string;
  despacho: string;
  prazo_dias_uteis?: number | null;
  data_prazo?: Date | null;
  /** Quando ocorreu o envio. */
  ocorrido_em: Date;
  /** Quando foi registrado no sistema. */
  registrado_em: Date;
  enviado_por: string;
  cargo?: string | null;
  automatico?: boolean;
  lancado_posteriormente?: boolean;
  lancado_por?: string | null;
  /** F3 (despacho de etapa de registro): título próprio no lugar de "DESPACHO DE TRAMITAÇÃO Nº N". */
  titulo?: string | null;
  /** F3: campos no lugar de De/Para (ex.: [['Etapa', 'Autorização de início']]). */
  campos?: Array<[string, string]> | null;
  /** F3: rodapé no lugar de "Enviado eletronicamente…". */
  rodape?: string[] | null;
}

const A4: [number, number] = [595.28, 841.89];
const MARGEM = 64;
const PRETO = rgb(0.1, 0.1, 0.1);
const CINZA = rgb(0.4, 0.4, 0.4);
const AZUL = rgb(0.07, 0.32, 0.71);

export async function gerarPdfDespacho(d: DadosDespachoPdf): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(textoSeguroPdf(`Despacho ${d.sequencia} — Processo ${d.numero_processo}`));
  doc.setProducer('Portal DCP');
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const [larg, alt] = A4;
  const largura = larg - 2 * MARGEM;
  let pg: PDFPage = doc.addPage(A4);
  let y = alt - 70;

  const novaPagina = () => {
    pg = doc.addPage(A4);
    y = alt - 70;
  };
  const centro = (txt: string, tam: number, f: PDFFont, cor = PRETO) => {
    const t = textoSeguroPdf(txt);
    const w = f.widthOfTextAtSize(t, tam);
    pg.drawText(t, { x: Math.max(MARGEM, (larg - w) / 2), y, size: tam, font: f, color: cor });
    y -= tam + 6;
  };
  const paragrafo = (txt: string, tam = 10.5, f: PDFFont = fonte, cor = PRETO, entre = 4) => {
    for (const bloco of String(txt ?? '').split(/\r?\n/)) {
      const linhas = bloco.trim() ? quebrarLinhas(bloco, largura, (s) => f.widthOfTextAtSize(s, tam)) : [''];
      for (const l of linhas) {
        if (y < 80) novaPagina();
        pg.drawText(l, { x: MARGEM, y, size: tam, font: f, color: cor });
        y -= tam + 4;
      }
    }
    y -= entre;
  };
  const campo = (rotulo: string, valor: string) => {
    if (y < 80) novaPagina();
    const r = textoSeguroPdf(`${rotulo}: `);
    const wr = negrito.widthOfTextAtSize(r, 10);
    const linhas = quebrarLinhas(valor || '-', largura - wr, (s) => fonte.widthOfTextAtSize(s, 10));
    pg.drawText(r, { x: MARGEM, y, size: 10, font: negrito, color: PRETO });
    linhas.forEach((l, i) => {
      if (i > 0) {
        y -= 14;
        if (y < 80) novaPagina();
      }
      pg.drawText(l, { x: MARGEM + wr, y, size: 10, font: fonte, color: PRETO });
    });
    y -= 16;
  };

  centro(d.orgao_nome.toUpperCase(), 12, negrito);
  y -= 6;
  centro(d.titulo || `${d.devolucao ? 'DESPACHO DE DEVOLUÇÃO' : 'DESPACHO DE TRAMITAÇÃO'} Nº ${d.sequencia}`, 13, negrito, AZUL);
  centro(`Processo administrativo nº ${d.numero_processo}`, 10, fonte, CINZA);
  y -= 10;
  if (d.objeto) campo('Objeto', d.objeto);
  if (d.campos?.length) {
    for (const [rotulo, valor] of d.campos) campo(rotulo, valor);
  } else {
    campo('De', d.de);
    campo('Para', d.para);
  }
  if (d.prazo_dias_uteis && d.data_prazo) {
    campo('Prazo', `${d.prazo_dias_uteis} dia(s) útil(eis), até ${dataBrasilia(d.data_prazo)} (art. 183 da Lei nº 14.133/2021)`);
  }
  y -= 10;
  paragrafo(d.despacho, 11, fonte, PRETO, 16);

  const local = [d.cidade, d.uf].filter(Boolean).join('/');
  paragrafo(`${local ? `${local}, ` : ''}${dataPorExtenso(d.ocorrido_em)}.`, 10.5, fonte, PRETO, 26);
  paragrafo(d.enviado_por, 10.5, negrito, PRETO, 0);
  if (d.cargo) paragrafo(d.cargo, 9.5, fonte, CINZA, 0);
  y -= 22;

  const rodape: string[] = [];
  if (d.rodape?.length) {
    rodape.push(...d.rodape);
  } else if (d.lancado_posteriormente) {
    rodape.push(
      `Movimentação lançada posteriormente: lançada em ${dataHoraBrasilia(d.registrado_em)} por ${d.lancado_por || d.enviado_por}, ocorrida em ${dataBrasilia(d.ocorrido_em)}.`,
    );
  } else {
    rodape.push(`${d.devolucao ? 'Devolvido' : 'Enviado'} eletronicamente em ${dataHoraBrasilia(d.ocorrido_em)} (horário de Brasília) por ${d.enviado_por}.`);
  }
  if (d.automatico) rodape.push('Encaminhamento registrado automaticamente pelo sistema ao concluir a etapa.');
  for (const r of rodape) paragrafo(r, 8.5, fonte, CINZA, 2);

  return Buffer.from(await doc.save());
}

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { dataPorExtenso, quebrarLinhas, textoSeguroPdf } from '../licitacoes/autos/autos-regras';
import { dataHoraBrasilia } from '../fase-interna/tramitacao-regras';
import { localDoOrgao } from '../fase-interna/textos-documento';
import { BlocoDaPeca } from './peca-documento';

/**
 * PDF da peça feita no sistema: cabeçalho do órgão, número do processo,
 * blocos do texto, local/data e assinatura eletrônica de quem juntou.
 * Mesma família visual do despacho de tramitação.
 */
export interface DadosPdfPeca {
  orgao_nome: string;
  cidade?: string | null;
  uf?: string | null;
  setor_nome?: string | null;
  numero_processo: string;
  titulo: string;
  blocos: BlocoDaPeca[];
  autor_nome: string;
  autor_cargo?: string | null;
  juntada_em: Date;
  ia_modelo?: string | null;
  /** Documento assinado (ofício): o rodapé diz "assinado eletronicamente" em vez de só "juntada". */
  assinatura_eletronica?: boolean;
  /** Logo do órgão (PNG ou JPG) para o cabeçalho; ignorada no papel timbrado. */
  logo?: { bytes: Buffer; tipo: 'png' | 'jpg' } | null;
  /** Sem logo nem nome do órgão no cabeçalho: o órgão imprime em papel timbrado. */
  papel_timbrado?: boolean;
}

const A4: [number, number] = [595.28, 841.89];
const MARGEM = 64;
const PRETO = rgb(0.1, 0.1, 0.1);
const CINZA = rgb(0.4, 0.4, 0.4);

export async function gerarPdfPeca(d: DadosPdfPeca): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(textoSeguroPdf(`${d.titulo} — Processo ${d.numero_processo}`));
  doc.setProducer('Portal DCP');
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const [larg, alt] = A4;
  const largura = larg - 2 * MARGEM;
  let logo: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  if (d.logo && !d.papel_timbrado) {
    try {
      logo = d.logo.tipo === 'png' ? await doc.embedPng(d.logo.bytes) : await doc.embedJpg(d.logo.bytes);
    } catch {
      logo = null;
    }
  }
  // Papel timbrado: o topo fica livre para o timbre impresso
  const topo = d.papel_timbrado ? alt - 120 : alt - 70;
  let pg: PDFPage = doc.addPage(A4);
  let y = topo;

  const cabecalho = () => {
    if (!d.papel_timbrado) {
      if (logo) {
        const h = 40;
        const w = (logo.width / logo.height) * h;
        pg.drawImage(logo, { x: MARGEM, y: y - h + 10, width: Math.min(w, 120), height: h });
      }
      const t = textoSeguroPdf(d.orgao_nome.toUpperCase());
      pg.drawText(t, { x: Math.max(MARGEM, (larg - negrito.widthOfTextAtSize(t, 11)) / 2), y, size: 11, font: negrito, color: PRETO });
      y -= 15;
    }
    const sub = textoSeguroPdf(`${d.setor_nome ? `${d.setor_nome} · ` : ''}Processo administrativo nº ${d.numero_processo}`);
    pg.drawText(sub, { x: Math.max(MARGEM, (larg - fonte.widthOfTextAtSize(sub, 9)) / 2), y, size: 9, font: fonte, color: CINZA });
    y -= logo && !d.papel_timbrado ? 34 : 22;
  };
  const novaPagina = () => {
    pg = doc.addPage(A4);
    y = topo;
    cabecalho();
  };
  const garantir = (altura: number) => {
    if (y - altura < 70) novaPagina();
  };
  const linhaDeTexto = (l: string, tam: number, f: PDFFont, cor: ReturnType<typeof rgb>, alinhamento: BlocoDaPeca['alinhamento'], x0 = MARGEM, w = largura) => {
    const t = textoSeguroPdf(l);
    const lw = f.widthOfTextAtSize(t, tam);
    const x = alinhamento === 'center' ? x0 + (w - lw) / 2 : alinhamento === 'right' ? x0 + w - lw : x0;
    pg.drawText(t, { x: Math.max(x0, x), y, size: tam, font: f, color: cor });
  };
  const paragrafo = (txt: string, tam: number, f: PDFFont, alinhamento: BlocoDaPeca['alinhamento'], entre: number, x0 = MARGEM, w = largura, cor = PRETO) => {
    for (const bloco of txt.split(/\n/)) {
      const linhas = bloco.trim() ? quebrarLinhas(bloco, w, (s) => f.widthOfTextAtSize(textoSeguroPdf(s), tam)) : [''];
      for (const l of linhas) {
        garantir(tam + 4);
        linhaDeTexto(l, tam, f, cor, alinhamento, x0, w);
        y -= tam + 4;
      }
    }
    y -= entre;
  };

  cabecalho();
  for (const b of d.blocos) {
    if (b.tipo === 'titulo') {
      y -= 4;
      paragrafo(b.texto, 12.5, negrito, b.alinhamento === 'left' ? 'center' : b.alinhamento, 10);
    } else if (b.tipo === 'item') {
      const marcador = b.numero ? `${b.numero}.` : '•';
      garantir(15);
      pg.drawText(textoSeguroPdf(marcador), { x: MARGEM + 10, y, size: 11, font: fonte, color: PRETO });
      paragrafo(b.texto, 11, fonte, 'left', 2, MARGEM + 28, largura - 28);
    } else {
      paragrafo(b.texto, 11, fonte, b.alinhamento, 8);
    }
  }

  y -= 10;
  const local = localDoOrgao({ cidade: d.cidade, uf: d.uf });
  paragrafo(`${local ? `${local}, ` : ''}${dataPorExtenso(d.juntada_em)}.`, 10.5, fonte, 'left', 26);
  paragrafo(d.autor_nome, 10.5, negrito, 'left', 0);
  if (d.autor_cargo) paragrafo(d.autor_cargo, 9.5, fonte, 'left', 0, MARGEM, largura, CINZA);
  y -= 18;
  const rodape = d.assinatura_eletronica
    ? [`Documento assinado eletronicamente por ${d.autor_nome}${d.autor_cargo ? `, ${d.autor_cargo}` : ''}, em ${dataHoraBrasilia(d.juntada_em)} (horário de Brasília), com fundamento na Lei nº 14.063/2020.`]
    : [`Peça juntada eletronicamente aos autos em ${dataHoraBrasilia(d.juntada_em)} (horário de Brasília) por ${d.autor_nome}.`];
  if (d.ia_modelo) rodape.push(`Rascunho inicial preparado com apoio de inteligência artificial (${d.ia_modelo}) e revisado pelo servidor que assina.`);
  for (const r of rodape) paragrafo(r, 8.5, fonte, 'left', 2, MARGEM, largura, CINZA);

  return Buffer.from(await doc.save());
}

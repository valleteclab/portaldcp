import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import PDFDocument = require('pdfkit');
import * as QRCode from 'qrcode';
import { BemPatrimonial } from './entities/bem-patrimonial.entity';
import { GerarEtiquetaDto, GerarZplDto } from './dto/gerar-etiqueta.dto';
import { TipoEtiqueta } from './entities/enums';
import { existsSync } from 'fs';
import { join } from 'path';
import { dimensoesPlaqueta, gradeA4, layoutPlaqueta, tomboImpresso, TamanhoPlaqueta } from './plaqueta-layout.util';

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');

interface OpcoesPlaqueta {
  tamanho: TamanhoPlaqueta;
  incluir_epc: boolean;
}

/** URL pública do bem — é o conteúdo do QR code da plaqueta. */
export function urlPublicaDoBem(bemId: string): string {
  const base = process.env.APP_URL || process.env.FRONTEND_URL || 'https://portaldcp.com.br';
  return `${base.replace(/\/$/, '')}/p/${bemId}`;
}

/** mm → pontos do PDF (1 pt = 1/72 pol). */
const MM = 72 / 25.4;

@Injectable()
export class PatrimonioEtiquetasService {
  constructor(
    @InjectRepository(BemPatrimonial)
    private readonly bemRepository: Repository<BemPatrimonial>,
  ) {}

  private async carregarBens(orgaoId: string, ids: string[]) {
    const bens = await this.bemRepository.find({
      where: { id: In(ids), orgao_id: orgaoId },
      relations: ['categoria', 'setor', 'orgao', 'locacoes', 'servidores', 'comodatos'],
    });
    if (!bens.length) throw new BadRequestException('Nenhum bem encontrado para etiquetar');
    // mantém a ordem pedida (útil para a sequência de impressão)
    const pos = new Map(ids.map((id, i) => [id, i]));
    return bens.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
  }

  async gerarEtiquetas(
    orgaoId: string,
    dto: GerarEtiquetaDto,
  ): Promise<Buffer> {
    const bens = await this.carregarBens(orgaoId, dto.bem_ids);

    if (dto.tipo === TipoEtiqueta.PLAQUETA) {
      const opcoes: OpcoesPlaqueta = { tamanho: dimensoesPlaqueta(dto.tamanho).tamanho, incluir_epc: !!dto.incluir_epc };
      return dto.formato === 'folha_a4'
        ? this.gerarPlaquetasA4(bens, opcoes)
        : this.gerarPlaquetasIndividuais(bens, opcoes);
    }
    if (dto.formato === 'folha_a4') {
      return this.gerarFolhaA4(bens, dto.tipo);
    }
    return this.gerarIndividual(bens, dto.tipo);
  }

  // ─── PLAQUETA COM QR CODE ──────────────────────────────────────────

  private async qrPng(bem: BemPatrimonial): Promise<Buffer> {
    return QRCode.toBuffer(urlPublicaDoBem(bem.id), {
      errorCorrectionLevel: 'M',
      margin: 0,
      width: 360,
    });
  }

  /** Caminho do brasão do órgão no disco (null se não houver). */
  private caminhoLogo(bens: BemPatrimonial[]): string | null {
    const url = bens.find((b) => b.orgao?.logo_url)?.orgao?.logo_url;
    if (!url) return null;
    const caminho = join(UPLOAD_DIR, url.replace(/^\/api\/uploads\//, ''));
    return existsSync(caminho) ? caminho : null;
  }

  /** Uma etiqueta por página, no tamanho da etiqueta (impressora de etiquetas). */
  private async gerarPlaquetasIndividuais(bens: BemPatrimonial[], opcoes: OpcoesPlaqueta): Promise<Buffer> {
    const { w, h } = dimensoesPlaqueta(opcoes.tamanho);
    const doc = new PDFDocument({ size: [w * MM, h * MM], margin: 0 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const logo = this.caminhoLogo(bens);
    for (let i = 0; i < bens.length; i++) {
      if (i > 0) doc.addPage({ size: [w * MM, h * MM], margin: 0 });
      await this.desenharPlaqueta(doc, bens[i], 0, 0, w, h, false, logo, opcoes);
    }
    doc.end();
    return new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  }

  /** Folha A4 adesiva com a grade que couber no tamanho escolhido. */
  private async gerarPlaquetasA4(bens: BemPatrimonial[], opcoes: OpcoesPlaqueta): Promise<Buffer> {
    const { w, h } = dimensoesPlaqueta(opcoes.tamanho);
    const g = gradeA4(w, h);
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const logo = this.caminhoLogo(bens);
    for (let i = 0; i < bens.length; i++) {
      const p = i % g.porPagina;
      if (i > 0 && p === 0) doc.addPage({ size: 'A4', margin: 0 });
      const x = g.x0 + (p % g.colunas) * (w + g.espaco);
      const y = g.y0 + Math.floor(p / g.colunas) * (h + g.espaco);
      await this.desenharPlaqueta(doc, bens[i], x, y, w, h, true, logo, opcoes);
    }
    doc.end();
    return new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  }

  /**
   * Plaqueta: brasão do órgão à esquerda, "PATRIMÔNIO PÚBLICO", tombo em
   * destaque e EPC (opcional) no meio, QR à direita. Coordenadas em mm.
   */
  private async desenharPlaqueta(
    doc: PDFKit.PDFDocument,
    bem: BemPatrimonial,
    xMm: number,
    yMm: number,
    w: number,
    h: number,
    borda: boolean,
    logo: string | null,
    opcoes: OpcoesPlaqueta,
  ) {
    const X = (mm: number) => (xMm + mm) * MM;
    const Y = (mm: number) => (yMm + mm) * MM;
    const pt = (capMm: number) => (capMm * MM) / 0.72; // altura de maiúscula → corpo da fonte
    if (borda) doc.roundedRect(X(0), Y(0), w * MM, h * MM, 1.5 * MM).lineWidth(0.3).stroke('#c4c4c4');

    let L = layoutPlaqueta(w, h, !!logo);
    if (logo && L.logo) {
      try {
        doc.image(logo, X(L.logo.x), Y(L.logo.y), { fit: [L.logo.w * MM, L.logo.h * MM], align: 'center', valign: 'center' });
        doc.moveTo(X(L.divisoria!), Y(L.margem + 1)).lineTo(X(L.divisoria!), Y(h - L.margem - 1)).lineWidth(0.3).stroke('#cfcfcf');
      } catch {
        L = layoutPlaqueta(w, h, false);
      }
    }

    const png = await this.qrPng(bem);
    doc.image(png, X(L.qr.x), Y(L.qr.y), { width: L.qr.w * MM, height: L.qr.h * MM });

    const t = L.texto;
    const k = Math.min(1.35, Math.max(1, t.h / 16.8)); // etiquetas mais altas ganham letra maior
    const larguraPt = t.w * MM;
    // pdfkit quebra linha mesmo com lineBreak:false; corta à mão para caber numa linha só
    const linha = (texto: string, x: number, yMm: number) => {
      let v = texto;
      if (doc.widthOfString(v) > larguraPt) {
        while (v.length > 1 && doc.widthOfString(v + '…') > larguraPt) v = v.slice(0, -1);
        v = v.trimEnd() + '…';
      }
      doc.text(v, x, Y(yMm), { lineBreak: false });
    };
    let y = t.y;

    // Sem brasão, o nome do órgão entra acima do título
    const orgaoNome = (bem.orgao?.nome_fantasia || bem.orgao?.nome || '').toUpperCase();
    if (!logo && orgaoNome) {
      doc.font('Helvetica-Bold').fontSize(pt(1.0 * k)).fillColor('#111827');
      linha(orgaoNome, X(t.x), y);
      y += 1.0 * k * 1.55;
    }
    doc.font('Helvetica-Bold').fontSize(pt(1.3 * k)).fillColor('#12268c');
    if (doc.widthOfString('PATRIMÔNIO PÚBLICO') <= t.w * MM) {
      linha('PATRIMÔNIO PÚBLICO', X(t.x), y);
      y += 1.3 * k * 1.5;
    } else {
      linha('PATRIMÔNIO', X(t.x), y);
      y += 1.3 * k * 1.4;
      linha('PÚBLICO', X(t.x), y);
      y += 1.3 * k * 1.5;
    }
    y += 0.3 * k;
    doc.font('Helvetica').fontSize(pt(0.9 * k)).fillColor('#555555');
    linha('TOMBO', X(t.x), y);
    y += 0.9 * k * 1.45;

    // Tombo: o maior corpo que couber na largura
    const tombo = tomboImpresso(bem.plaqueta);
    let capTombo = (L.cabeDescricao ? 5 : 3.1) * k;
    doc.font('Helvetica-Bold');
    while (capTombo > 1.5 && doc.fontSize(pt(capTombo)).widthOfString(tombo) > t.w * MM) capTombo -= 0.1;
    doc.fillColor('#000000');
    linha(tombo, X(t.x), y);
    y += capTombo * 1.4;

    const resto = t.y + t.h - y; // mm livres até a margem de baixo
    const pequeno = 0.85 * k;
    doc.font('Helvetica').fontSize(pt(pequeno)).fillColor('#000000');
    if (opcoes.incluir_epc && bem.epc) {
      if (L.epcUmaLinha) {
        linha(`EPC ${bem.epc}`, X(t.x), y);
      } else if (resto >= pequeno * 2.6) {
        linha(bem.epc.slice(0, 12), X(t.x), y);
        linha(bem.epc.slice(12), X(t.x), y + pequeno * 1.45);
      } else {
        linha(bem.epc, X(t.x), y);
      }
    } else if (resto >= pequeno * 1.3) {
      // Sem EPC: a descrição ajuda a colar a etiqueta no bem certo
      doc.fillColor('#444444');
      linha(bem.descricao || '', X(t.x), y);
    }
  }

  // ─── ZPL (impressora Zebra) ────────────────────────────────────────

  /**
   * Gera o arquivo ZPL com uma etiqueta por bem, no tamanho da etiqueta do
   * órgão. Envie para a impressora pelo Zebra Setup Utilities, pelo driver
   * ("imprimir arquivo") ou pelo Zebra Browser Print.
   */
  async gerarZpl(orgaoId: string, dto: GerarZplDto): Promise<string> {
    const bens = await this.carregarBens(orgaoId, dto.bem_ids);
    const dpi = dto.dpi === 300 ? 300 : 203;
    const dpmm = dpi / 25.4;
    const larguraMm = dto.largura_mm || 50;
    const alturaMm = dto.altura_mm || 25;
    const W = Math.round(larguraMm * dpmm);
    const H = Math.round(alturaMm * dpmm);
    const m = Math.round(1.5 * dpmm); // margem
    // QR: ~33 módulos (versão 3 + quieto) cabendo na altura útil
    const mag = Math.max(2, Math.min(10, Math.floor((H - 2 * m) / 33)));
    const qrLado = mag * 33;
    const tx = m + qrLado + Math.round(1.5 * dpmm);
    const tw = Math.max(40, W - tx - m);

    const esc = (s: string) =>
      String(s || '')
        .replace(/[\^~\\]/g, ' ')
        .replace(/\r?\n/g, ' ')
        .trim();

    const fonte = (mm: number) => Math.max(8, Math.round(mm * dpmm));
    const h1 = fonte(1.9); // órgão
    const h2 = fonte(1.6); // rótulo
    const h3 = fonte(4.2); // número
    const h4 = fonte(1.7); // descrição

    const blocos = bens.map((bem) => {
      const orgaoNome = esc((bem.orgao?.nome_fantasia || bem.orgao?.nome || 'PATRIMÔNIO').toUpperCase());
      const setor = esc(bem.setor?.nome || bem.localizacao_nome || '');
      const y1 = m;
      const y2 = y1 + h1 + Math.round(0.4 * dpmm);
      const y3 = y2 + h2 + Math.round(0.3 * dpmm);
      const y4 = y3 + h3 + Math.round(0.6 * dpmm);
      const linhasDesc = setor ? 1 : 2;
      const y5 = H - m - h4;
      return [
        '^XA',
        '^CI28',
        `^PW${W}`,
        `^LL${H}`,
        '^LH0,0',
        `^FO${m},${m}^BQN,2,${mag}^FDQA,${esc(urlPublicaDoBem(bem.id))}^FS`,
        `^FO${tx},${y1}^A0N,${h1},${h1}^FB${tw},1,0,L,0^FD${orgaoNome}^FS`,
        `^FO${tx},${y2}^A0N,${h2},${h2}^FDPATRIMÔNIO Nº^FS`,
        `^FO${tx},${y3}^A0N,${h3},${h3}^FD${esc(bem.plaqueta || '')}^FS`,
        `^FO${tx},${y4}^A0N,${h4},${h4}^FB${tw},${linhasDesc},0,L,0^FD${esc(bem.descricao)}^FS`,
        setor ? `^FO${tx},${y5}^A0N,${h4},${h4}^FB${tw},1,0,L,0^FD${setor}^FS` : '',
        '^XZ',
      ].filter(Boolean).join('\n');
    });
    return blocos.join('\n') + '\n';
  }

  // ─── ETIQUETAS DE SITUAÇÃO (texto) ─────────────────────────────────

  private async gerarIndividual(
    bens: BemPatrimonial[],
    tipo: TipoEtiqueta,
  ): Promise<Buffer> {
    // Etiqueta individual ~10cm x 6cm (283 x 170 pts)
    const doc = new PDFDocument({
      size: [283, 170],
      margins: { top: 10, bottom: 10, left: 10, right: 10 },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    for (let i = 0; i < bens.length; i++) {
      if (i > 0) doc.addPage();
      this.desenharEtiqueta(doc, bens[i], tipo, 0, 0, 283, 170);
    }

    doc.end();
    return new Promise((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  private async gerarFolhaA4(
    bens: BemPatrimonial[],
    tipo: TipoEtiqueta,
  ): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 30, bottom: 30, left: 30, right: 30 },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const etiquetaLargura = 250;
    const etiquetaAltura = 150;
    const colunas = 2;
    const linhas = 5;
    const espacoH = 15;
    const espacoV = 10;
    const porPagina = colunas * linhas;

    for (let i = 0; i < bens.length; i++) {
      const posNaPagina = i % porPagina;
      if (i > 0 && posNaPagina === 0) doc.addPage();

      const col = posNaPagina % colunas;
      const lin = Math.floor(posNaPagina / colunas);
      const x = 30 + col * (etiquetaLargura + espacoH);
      const y = 30 + lin * (etiquetaAltura + espacoV);

      // Borda da etiqueta
      doc
        .rect(x, y, etiquetaLargura, etiquetaAltura)
        .lineWidth(0.5)
        .stroke('#999');

      this.desenharEtiqueta(
        doc,
        bens[i],
        tipo,
        x,
        y,
        etiquetaLargura,
        etiquetaAltura,
      );
    }

    doc.end();
    return new Promise((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  private desenharEtiqueta(
    doc: PDFKit.PDFDocument,
    bem: BemPatrimonial,
    tipo: TipoEtiqueta,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    const padding = 8;
    const innerX = x + padding;
    let currentY = y + padding;
    const maxWidth = w - padding * 2;

    const titulo = this.getTituloEtiqueta(tipo);

    // Cabeçalho colorido
    doc
      .rect(x, y, w, 22)
      .fill(this.getCorEtiqueta(tipo));
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .fillColor('#fff')
      .text(titulo, innerX, y + 6, { width: maxWidth, align: 'center' });

    currentY = y + 28;
    doc.fillColor('#000').font('Helvetica').fontSize(7);

    const setorNome = bem.setor?.nome || bem.localizacao_nome || '';

    switch (tipo) {
      case TipoEtiqueta.AVARIA:
        this.linhaEtiqueta(doc, innerX, currentY, maxWidth, 'Tipo de Defeito:', '');
        currentY += 14;
        this.linhaEtiqueta(doc, innerX, currentY, maxWidth, 'Setor/Centro de Custo:', setorNome);
        currentY += 14;
        this.linhaEtiqueta(doc, innerX, currentY, maxWidth, 'Data de Identificação:', '');
        currentY += 14;
        this.linhaEtiqueta(doc, innerX, currentY, maxWidth, 'Responsável:', bem.responsavel_nome || '');
        break;

      case TipoEtiqueta.SITUACAO_PATRIMONIO:
        this.linhaEtiqueta(doc, innerX, currentY, maxWidth, 'Plaqueta:', bem.plaqueta || '-');
        currentY += 14;
        this.linhaEtiqueta(doc, innerX, currentY, maxWidth, 'Descrição:', bem.descricao);
        currentY += 14;
        this.linhaEtiqueta(doc, innerX, currentY, maxWidth, 'Categoria:', bem.categoria?.nome || '-');
        currentY += 14;
        this.linhaEtiqueta(doc, innerX, currentY, maxWidth, 'Status:', bem.status);
        currentY += 14;
        this.linhaEtiqueta(doc, innerX, currentY, maxWidth, 'Localização:', setorNome || '-');
        break;

      case TipoEtiqueta.BEM_PARTICULAR_SERVIDOR:
        this.linhaEtiqueta(doc, innerX, currentY, maxWidth, 'Descrição:', bem.descricao);
        currentY += 14;
        const serv = bem.servidores?.[0];
        this.linhaEtiqueta(doc, innerX, currentY, maxWidth, 'Proprietário:', serv?.proprietario_nome || '-');
        currentY += 14;
        this.linhaEtiqueta(doc, innerX, currentY, maxWidth, 'Cargo:', serv?.proprietario_cargo || '-');
        currentY += 14;
        this.linhaEtiqueta(doc, innerX, currentY, maxWidth, 'Data Entrada:', serv?.data_entrada?.toString() || '-');
        break;

      case TipoEtiqueta.BEM_LOCADO:
        this.linhaEtiqueta(doc, innerX, currentY, maxWidth, 'Descrição:', bem.descricao);
        currentY += 14;
        const loc = bem.locacoes?.[0];
        this.linhaEtiqueta(doc, innerX, currentY, maxWidth, 'Locador:', loc?.locador || '-');
        currentY += 14;
        this.linhaEtiqueta(doc, innerX, currentY, maxWidth, 'Contrato:', loc?.numero_contrato || '-');
        currentY += 14;
        this.linhaEtiqueta(doc, innerX, currentY, maxWidth, 'Início:', loc?.data_inicio?.toString() || '-');
        currentY += 14;
        this.linhaEtiqueta(doc, innerX, currentY, maxWidth, 'Fim:', loc?.data_fim?.toString() || '-');
        break;

      case TipoEtiqueta.BEM_COMODATO:
        this.linhaEtiqueta(doc, innerX, currentY, maxWidth, 'Descrição:', bem.descricao);
        currentY += 14;
        const com = bem.comodatos?.[0];
        this.linhaEtiqueta(doc, innerX, currentY, maxWidth, 'Comodante:', com?.comodante || '-');
        currentY += 14;
        this.linhaEtiqueta(doc, innerX, currentY, maxWidth, 'Termo:', com?.numero_termo || '-');
        currentY += 14;
        this.linhaEtiqueta(doc, innerX, currentY, maxWidth, 'Início:', com?.data_inicio?.toString() || '-');
        currentY += 14;
        this.linhaEtiqueta(doc, innerX, currentY, maxWidth, 'Fim:', com?.data_fim?.toString() || '-');
        break;
    }
  }

  private linhaEtiqueta(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    maxWidth: number,
    label: string,
    valor: string,
  ) {
    doc.font('Helvetica-Bold').text(label, x, y, { continued: true });
    doc.font('Helvetica').text(` ${valor}`, { width: maxWidth });
  }

  private getTituloEtiqueta(tipo: TipoEtiqueta): string {
    const titulos: Record<TipoEtiqueta, string> = {
      [TipoEtiqueta.PLAQUETA]: 'PATRIMÔNIO',
      [TipoEtiqueta.AVARIA]: 'ETIQUETA DE AVARIA',
      [TipoEtiqueta.SITUACAO_PATRIMONIO]: 'SITUAÇÃO PATRIMÔNIO',
      [TipoEtiqueta.BEM_PARTICULAR_SERVIDOR]: 'BEM PARTICULAR - SERVIDOR',
      [TipoEtiqueta.BEM_LOCADO]: 'BEM LOCADO',
      [TipoEtiqueta.BEM_COMODATO]: 'BEM EM COMODATO',
    };
    return titulos[tipo];
  }

  private getCorEtiqueta(tipo: TipoEtiqueta): string {
    const cores: Record<TipoEtiqueta, string> = {
      [TipoEtiqueta.PLAQUETA]: '#1f3a5f',
      [TipoEtiqueta.AVARIA]: '#dc2626',
      [TipoEtiqueta.SITUACAO_PATRIMONIO]: '#2563eb',
      [TipoEtiqueta.BEM_PARTICULAR_SERVIDOR]: '#9333ea',
      [TipoEtiqueta.BEM_LOCADO]: '#16a34a',
      [TipoEtiqueta.BEM_COMODATO]: '#0891b2',
    };
    return cores[tipo];
  }
}

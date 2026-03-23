import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as PDFDocument from 'pdfkit';
import { BemPatrimonial } from './entities/bem-patrimonial.entity';
import { GerarEtiquetaDto } from './dto/gerar-etiqueta.dto';
import { TipoEtiqueta } from './entities/enums';

@Injectable()
export class PatrimonioEtiquetasService {
  constructor(
    @InjectRepository(BemPatrimonial)
    private readonly bemRepository: Repository<BemPatrimonial>,
  ) {}

  async gerarEtiquetas(
    orgaoId: string,
    dto: GerarEtiquetaDto,
  ): Promise<Buffer> {
    const bens = await this.bemRepository.find({
      where: { id: In(dto.bem_ids), orgao_id: orgaoId },
      relations: ['categoria', 'locacoes', 'servidores', 'comodatos'],
    });

    if (dto.formato === 'folha_a4') {
      return this.gerarFolhaA4(bens, dto.tipo);
    }
    return this.gerarIndividual(bens, dto.tipo);
  }

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

    switch (tipo) {
      case TipoEtiqueta.AVARIA:
        this.linhaEtiqueta(doc, innerX, currentY, maxWidth, 'Tipo de Defeito:', '');
        currentY += 14;
        this.linhaEtiqueta(doc, innerX, currentY, maxWidth, 'Setor/Centro de Custo:', bem.localizacao_nome || '');
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
        this.linhaEtiqueta(doc, innerX, currentY, maxWidth, 'Localização:', bem.localizacao_nome || '-');
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
      [TipoEtiqueta.AVARIA]: '#dc2626',
      [TipoEtiqueta.SITUACAO_PATRIMONIO]: '#2563eb',
      [TipoEtiqueta.BEM_PARTICULAR_SERVIDOR]: '#9333ea',
      [TipoEtiqueta.BEM_LOCADO]: '#16a34a',
      [TipoEtiqueta.BEM_COMODATO]: '#0891b2',
    };
    return cores[tipo];
  }
}

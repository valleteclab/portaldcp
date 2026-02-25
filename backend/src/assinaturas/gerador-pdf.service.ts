import { Injectable, Logger } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { join } from 'path';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { AssinaturaDigital } from './entities/assinatura-digital.entity';

const PDFDocument = require('pdfkit');

const PAPEL_LABELS: Record<string, string> = {
  GESTOR: 'Gestor / Ordenador de Despesa',
  FISCAL: 'Fiscal de Contrato',
  FORNECEDOR: 'Fornecedor / Contratado',
};

@Injectable()
export class GeradorPdfService {
  private readonly logger = new Logger(GeradorPdfService.name);
  private readonly uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');

  constructor() {
    const docDir = join(this.uploadDir, 'documentos_assinados');
    if (!existsSync(docDir)) {
      mkdirSync(docDir, { recursive: true });
    }
    this.logger.log('GeradorPdfService inicializado (pdfkit)');
  }

  /**
   * Gera o PDF da Ordem de Serviço com as assinaturas
   */
  async gerarPdfOrdemServico(dadosOS: any, assinaturas: AssinaturaDigital[], urlValidacaoBase: string): Promise<string> {
    const filename = `OS_${dadosOS.numero.replace(/\//g, '_')}_${Date.now()}.pdf`;
    const filePath = join(this.uploadDir, 'documentos_assinados', filename);

    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const writeStream = createWriteStream(filePath);
        doc.pipe(writeStream);

        const orgao = dadosOS.orgao || {};
        const pageW = doc.page.width;
        const marginL = 50;
        const contentW = pageW - marginL * 2;

        // ── CABEÇALHO: logo + dados do órgão ──────────────────────────────────
        let logoWidth = 0;
        const logoPath = orgao.logo_url
          ? join(this.uploadDir, orgao.logo_url.replace(/^\/api\/uploads\//, ''))
          : null;
        if (logoPath && existsSync(logoPath)) {
          try {
            doc.image(logoPath, marginL, 40, { width: 60, height: 60 });
            logoWidth = 70;
          } catch (e) {
            this.logger.warn(`Erro ao incluir logo no PDF: ${(e as Error).message}`);
          }
        }

        const textX = marginL + logoWidth;
        const textW = contentW - logoWidth;
        let lineY = 40;

        doc.fontSize(13).font('Helvetica-Bold').fillColor('#111827')
          .text((orgao.nome || 'ÓRGÃO').toUpperCase(), textX, lineY, { width: textW });
        lineY += 17;

        if (orgao.logradouro && orgao.logradouro !== 'A definir') {
          doc.fontSize(9).font('Helvetica').fillColor('#374151')
            .text(orgao.logradouro.toUpperCase(), textX, lineY, { width: textW });
          lineY += 13;
        }
        if (orgao.bairro && orgao.bairro !== 'Centro') {
          doc.fontSize(9).font('Helvetica').fillColor('#374151')
            .text(orgao.bairro.toUpperCase(), textX, lineY, { width: textW });
          lineY += 13;
        }
        if (orgao.cidade) {
          const cidadeUF = `${orgao.cidade.toUpperCase()} - ${(orgao.uf || '').toUpperCase()}`;
          doc.fontSize(9).font('Helvetica').fillColor('#374151')
            .text(cidadeUF, textX, lineY, { width: textW });
          lineY += 13;
        }

        const headerBottom = Math.max(lineY + 5, 110);
        doc.y = headerBottom;
        doc.moveTo(marginL, doc.y).lineTo(pageW - marginL, doc.y).lineWidth(1).stroke('#374151');
        doc.moveDown(0.5);

        // ── TÍTULO + NÚMERO DA OS ──────────────────────────────────────────────
        const tituloY = doc.y;
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#111827')
          .text('ORDEM DE SERVIÇO', marginL, tituloY, { width: contentW - 80, align: 'center' });

        const numOS = dadosOS.numero || '';
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e40af')
          .text(numOS, pageW - marginL - 80, tituloY, { width: 80, align: 'right' });

        doc.moveDown(0.3);
        doc.moveTo(marginL, doc.y).lineTo(pageW - marginL, doc.y).lineWidth(1).stroke('#374151');
        doc.moveDown(0.6);

        // ── CAMPOS INFORMATIVOS ────────────────────────────────────────────────
        const labelW = 100;
        const valueW = contentW / 2 - labelW - 10;
        const col2X = marginL + contentW / 2;

        const campo = (label: string, valor: string, x: number, y: number, w: number) => {
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#374151').text(label, x, y, { width: labelW, continued: false });
          doc.fontSize(9).font('Helvetica').fillColor('#111827').text(valor || '-', x + labelW, y, { width: w });
        };

        let rowY = doc.y;

        campo('Número da OS:', numOS, marginL, rowY, valueW);
        campo('Data Autorização:', dadosOS.data_autorizacao ? new Date(dadosOS.data_autorizacao).toLocaleDateString('pt-BR') : '-', col2X, rowY, valueW);
        rowY += 16;

        campo('Órgão:', (orgao.nome || '-').toUpperCase(), marginL, rowY, contentW - labelW);
        rowY += 16;

        if (dadosOS.contrato?.numero_contrato) {
          campo('Contrato:', dadosOS.contrato.numero_contrato, marginL, rowY, valueW);
          if (dadosOS.contrato?.fornecedor?.cpf_cnpj) {
            campo('CNPJ/CPF:', dadosOS.contrato.fornecedor.cpf_cnpj, col2X, rowY, valueW);
          }
          rowY += 16;
        }

        if (dadosOS.contrato?.fornecedor?.razao_social) {
          campo('Fornecedor:', (dadosOS.contrato.fornecedor.razao_social || '-').toUpperCase(), marginL, rowY, contentW - labelW);
          rowY += 16;
        }

        if (dadosOS.setor_solicitante) {
          campo('Setor:', dadosOS.setor_solicitante, marginL, rowY, valueW);
          if (dadosOS.prioridade) {
            campo('Prioridade:', dadosOS.prioridade, col2X, rowY, valueW);
          }
          rowY += 16;
        }

        if (dadosOS.local_execucao) {
          campo('Local de Execução:', dadosOS.local_execucao, marginL, rowY, contentW - labelW);
          rowY += 16;
        }

        doc.y = rowY + 4;
        doc.moveTo(marginL, doc.y).lineTo(pageW - marginL, doc.y).lineWidth(0.5).stroke('#9ca3af');
        doc.moveDown(0.6);

        // ── OBJETO / JUSTIFICATIVA (largura total) ─────────────────────────────
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#374151')
          .text('Objeto / Justificativa:', marginL, doc.y, { width: contentW });
        doc.moveDown(0.2);
        doc.fontSize(9).font('Helvetica').fillColor('#111827')
          .text(dadosOS.descricao_os || dadosOS.justificativa || 'Sem descrição', marginL, doc.y, { width: contentW, align: 'justify' });
        doc.moveDown(0.5);
        doc.moveTo(marginL, doc.y).lineTo(pageW - marginL, doc.y).lineWidth(0.5).stroke('#9ca3af');
        doc.moveDown(0.6);

        // ── TABELA DE ITENS ────────────────────────────────────────────────────
        if (dadosOS.itensOS?.length > 0) {
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151')
            .text('Itens da Ordem de Serviço:', marginL, doc.y, { width: contentW });
          doc.moveDown(0.3);
          this.escreverTabelaItensOS(doc, dadosOS.itensOS);
        }

        // ── ASSINATURAS (nova página se restar menos de 180pt) ────────────────
        if (doc.y > doc.page.height - 200) {
          doc.addPage();
        }
        await this.escreverQuadroAssinaturas(doc, assinaturas, urlValidacaoBase);

        doc.end();
        writeStream.on('finish', () => resolve(filePath));
        writeStream.on('error', reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Gera o PDF do Boletim de Medição com as assinaturas
   */
  async gerarPdfMedicao(dadosMedicao: any, assinaturas: AssinaturaDigital[], urlValidacaoBase: string): Promise<string> {
    const filename = `Medicao_${dadosMedicao.numero_medicao}_${Date.now()}.pdf`;
    const filePath = join(this.uploadDir, 'documentos_assinados', filename);

    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const writeStream = createWriteStream(filePath);
        doc.pipe(writeStream);

        // Cabeçalho (com logo do órgão se disponível)
        this.escreverCabecalho(doc, 'BOLETIM DE MEDIÇÃO', dadosMedicao.orgao);

        // Dados da Medição
        doc.fontSize(11).font('Helvetica-Bold').text(`Medição Nº: `, { continued: true })
          .font('Helvetica').text(`${dadosMedicao.numero_medicao}ª`);
        doc.moveDown(0.3);

        if (dadosMedicao.contrato?.numero_contrato) {
          doc.font('Helvetica-Bold').text('Contrato: ', { continued: true })
            .font('Helvetica').text(dadosMedicao.contrato.numero_contrato);
          doc.moveDown(0.3);
        }

        if (dadosMedicao.periodo_inicio && dadosMedicao.periodo_fim) {
          doc.font('Helvetica-Bold').text('Período: ', { continued: true })
            .font('Helvetica').text(
              `${new Date(dadosMedicao.periodo_inicio).toLocaleDateString('pt-BR')} a ${new Date(dadosMedicao.periodo_fim).toLocaleDateString('pt-BR')}`
            );
          doc.moveDown(0.3);
        }

        doc.font('Helvetica-Bold').text('Valor Medido: ', { continued: true })
          .font('Helvetica').text(`R$ ${Number(dadosMedicao.valor_medido || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
        doc.moveDown(0.3);

        doc.font('Helvetica-Bold').text('Percentual Físico: ', { continued: true })
          .font('Helvetica').text(`${Number(dadosMedicao.percentual_fisico_medido || 0).toFixed(2)}%`);

        // Quadro de assinaturas
        await this.escreverQuadroAssinaturas(doc, assinaturas, urlValidacaoBase);

        doc.end();
        writeStream.on('finish', () => resolve(filePath));
        writeStream.on('error', reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  private escreverCabecalho(doc: any, titulo: string, orgao?: { logo_url?: string }): void {
    doc.rect(50, 40, doc.page.width - 100, 60).fillAndStroke('#1e40af', '#1e40af');

    const logoPath = orgao?.logo_url
      ? join(this.uploadDir, orgao.logo_url.replace(/^\/api\/uploads\//, ''))
      : null;
    if (logoPath && existsSync(logoPath)) {
      try {
        doc.image(logoPath, 55, 45, { width: 45, height: 45 });
      } catch (e) {
        this.logger.warn(`Erro ao incluir logo no PDF: ${(e as Error).message}`);
      }
    }
    doc.fillColor('white').fontSize(14).font('Helvetica-Bold')
      .text(titulo, 50, 55, { width: doc.page.width - 100, align: 'center' });
    doc.fillColor('black').moveDown(3);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke('#1e40af');
    doc.moveDown(0.5);
  }

  private async escreverQuadroAssinaturas(doc: any, assinaturas: AssinaturaDigital[], urlValidacaoBase: string): Promise<void> {
    if (!assinaturas || assinaturas.length === 0) return;

    const codigoValidacao = assinaturas[0].codigo_validacao;
    const urlCompleta = `${urlValidacaoBase}/${codigoValidacao}`;

    doc.moveDown(1.5);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke('#6b7280');
    doc.moveDown(0.5);

    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e40af')
      .text('QUADRO DE ASSINATURAS ELETRÔNICAS', { align: 'center' });
    doc.moveDown(0.3);

    doc.fontSize(9).font('Helvetica').fillColor('#374151')
      .text(
        'Este documento foi assinado eletronicamente em conformidade com a Lei nº 14.063/2020.',
        { align: 'center' }
      );
    doc.moveDown(0.8);

    for (const ass of assinaturas) {
      const yStart = doc.y;
      doc.rect(50, yStart, doc.page.width - 100, 60).fillAndStroke('#f3f4f6', '#e5e7eb');

      doc.fillColor('#111827').fontSize(10).font('Helvetica-Bold')
        .text(`Assinado por: ${ass.usuario_nome}`, 60, yStart + 8);
      doc.fontSize(9).font('Helvetica').fillColor('#374151')
        .text(`Papel: ${PAPEL_LABELS[ass.papel_assinante] || ass.papel_assinante}`, 60, yStart + 22);
      doc.fillColor('#6b7280')
        .text(`Data/Hora: ${this.formatarDataHora(ass.data_assinatura)}`, 60, yStart + 34);
      doc.fillColor('#16a34a').font('Helvetica-Bold')
        .text('✓ Assinatura eletrônica válida', 60, yStart + 46);

      doc.y = yStart + 68;
      doc.moveDown(0.3);
    }

    // Rodapé com QR Code
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke('#6b7280');
    doc.moveDown(0.5);

    try {
      const qrBuffer = await QRCode.toBuffer(urlCompleta, { type: 'png', width: 80 });
      const qrX = doc.page.width - 130;
      const qrY = doc.y;

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#111827')
        .text('VERIFICAR AUTENTICIDADE:', 50, qrY);
      doc.moveDown(0.3);
      doc.font('Helvetica').fillColor('#374151')
        .text(`Acesse: ${urlValidacaoBase}`, 50, doc.y);
      doc.moveDown(0.2);
      doc.font('Helvetica-Bold').fillColor('#2563eb')
        .text(`Código: ${codigoValidacao}`, 50, doc.y);

      doc.image(qrBuffer, qrX, qrY, { width: 70 });
    } catch (err) {
      this.logger.warn(`Erro ao gerar QR Code: ${err.message}`);
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#111827')
        .text('VERIFICAR AUTENTICIDADE:');
      doc.font('Helvetica').fillColor('#374151').text(`Acesse: ${urlValidacaoBase}`);
      doc.font('Helvetica-Bold').fillColor('#2563eb').text(`Código: ${codigoValidacao}`);
    }
  }

  private formatarDataHora(data: Date): string {
    return new Date(data).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }

  private escreverTabelaItensOS(doc: any, itensOS: Array<{ quantidade_solicitada: number; itemCronograma?: { descricao?: string; unidade_medida?: string; valor_unitario?: number; quantidade_meses?: number | null; valor_mensal?: number } }>): void {
    const pageWidth = doc.page.width - 100;
    const colDesc  = pageWidth * 0.44;
    const colUnid  = pageWidth * 0.10;
    const colQtd   = pageWidth * 0.11;
    const colValor = pageWidth * 0.17;
    const colTotal = pageWidth * 0.18;

    const x0 = 50;
    const x1 = x0 + colDesc;
    const x2 = x1 + colUnid;
    const x3 = x2 + colQtd;
    const x4 = x3 + colValor;

    // ── Cabeçalho da tabela
    const headerY = doc.y;
    doc.rect(x0, headerY, pageWidth, 18).fillAndStroke('#e5e7eb', '#9ca3af');
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#111827');
    doc.text('Descrição',   x0 + 3, headerY + 5, { width: colDesc - 6 });
    doc.text('Unidade',     x1,     headerY - 13 + 5, { width: colUnid,  align: 'center' });
    doc.text('Qtd.',        x2,     headerY - 13 + 5, { width: colQtd,   align: 'right' });
    doc.text('Valor Unit.', x3,     headerY - 13 + 5, { width: colValor, align: 'right' });
    doc.text('Total',       x4,     headerY - 13 + 5, { width: colTotal, align: 'right' });
    doc.y = headerY + 20;

    // ── Linhas
    doc.font('Helvetica').fillColor('#374151');
    let totalGeral = 0;

    for (const item of itensOS) {
      const ic  = item.itemCronograma || {};
      const desc = (ic.descricao || '-').substring(0, 90);
      const unid = ic.unidade_medida || '-';
      const qtd  = Number(item.quantidade_solicitada);
      const vlUnit = Number(ic.valor_unitario ?? 0);
      const meses  = ic.quantidade_meses ? Number(ic.quantidade_meses) : null;
      const vlMensal = ic.valor_mensal ?? (qtd * vlUnit);
      const total  = meses ? vlMensal * meses : qtd * vlUnit;
      totalGeral  += total;

      const rowStart = doc.y;
      if (rowStart > doc.page.height - 80) {
        doc.addPage(); doc.y = 50;
      }

      const rowY = doc.y + 2;
      doc.fontSize(8);
      doc.text(desc,  x0 + 3, rowY, { width: colDesc - 6 });
      doc.text(unid,  x1, rowY, { width: colUnid,  align: 'center' });
      doc.text(
        qtd.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
        x2, rowY, { width: colQtd, align: 'right' }
      );
      doc.text(
        vlUnit > 0 ? `R$ ${vlUnit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-',
        x3, rowY, { width: colValor, align: 'right' }
      );
      doc.text(
        `R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        x4, rowY, { width: colTotal, align: 'right' }
      );
      doc.y = rowY + 14;
      doc.moveTo(x0, doc.y).lineTo(x0 + pageWidth, doc.y).lineWidth(0.3).stroke('#e5e7eb');
      doc.y += 1;
    }

    // ── Linha de total geral
    doc.moveDown(0.2);
    doc.rect(x0, doc.y, pageWidth, 18).fillAndStroke('#f3f4f6', '#9ca3af');
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#111827');
    doc.text('TOTAL GERAL', x0 + 3, doc.y + 5, { width: colDesc + colUnid + colQtd + colValor - 6 });
    doc.text(
      `R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      x4, doc.y - 14 + 5, { width: colTotal, align: 'right' }
    );
    doc.y += 20;
    doc.moveDown(0.5);
  }
}

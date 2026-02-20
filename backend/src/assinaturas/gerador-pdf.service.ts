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

        // Cabeçalho
        this.escreverCabecalho(doc, 'AUTORIZAÇÃO DE INÍCIO DE OBRA / ORDEM DE SERVIÇO');

        // Dados da OS
        doc.fontSize(11).font('Helvetica-Bold').text('Número: ', { continued: true })
          .font('Helvetica').text(dadosOS.numero || '');
        doc.moveDown(0.3);

        doc.font('Helvetica-Bold').text('Órgão: ', { continued: true })
          .font('Helvetica').text(dadosOS.orgao?.nome || dadosOS.setor_solicitante || 'Não informado');
        doc.moveDown(0.3);

        if (dadosOS.contrato?.numero_contrato) {
          doc.font('Helvetica-Bold').text('Contrato: ', { continued: true })
            .font('Helvetica').text(dadosOS.contrato.numero_contrato);
          doc.moveDown(0.3);
        }

        if (dadosOS.contrato?.fornecedor?.razao_social) {
          doc.font('Helvetica-Bold').text('Fornecedor: ', { continued: true })
            .font('Helvetica').text(dadosOS.contrato.fornecedor.razao_social);
          doc.moveDown(0.3);
        }

        if (dadosOS.local_execucao) {
          doc.font('Helvetica-Bold').text('Local de Execução: ', { continued: true })
            .font('Helvetica').text(dadosOS.local_execucao);
          doc.moveDown(0.3);
        }

        if (dadosOS.data_autorizacao) {
          doc.font('Helvetica-Bold').text('Data de Autorização: ', { continued: true })
            .font('Helvetica').text(new Date(dadosOS.data_autorizacao).toLocaleDateString('pt-BR'));
          doc.moveDown(0.3);
        }

        doc.moveDown(0.5);
        doc.font('Helvetica-Bold').text('Descrição / Objeto:');
        doc.font('Helvetica').text(dadosOS.descricao_os || dadosOS.justificativa || 'Sem descrição', { align: 'justify' });

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

        // Cabeçalho
        this.escreverCabecalho(doc, 'BOLETIM DE MEDIÇÃO');

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

  private escreverCabecalho(doc: any, titulo: string): void {
    doc.rect(50, 40, doc.page.width - 100, 60).fillAndStroke('#1e40af', '#1e40af');
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
}

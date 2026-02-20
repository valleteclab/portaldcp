import { Injectable, Logger } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { join } from 'path';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { AssinaturaDigital } from './entities/assinatura-digital.entity';

const PdfPrinter = require('pdfmake');

// Configuração de fontes para o pdfmake
const fonts = {
  Roboto: {
    normal: 'node_modules/roboto-font/fonts/Roboto/roboto-regular-webfont.ttf',
    bold: 'node_modules/roboto-font/fonts/Roboto/roboto-bold-webfont.ttf',
    italics: 'node_modules/roboto-font/fonts/Roboto/roboto-italic-webfont.ttf',
    bolditalics: 'node_modules/roboto-font/fonts/Roboto/roboto-bolditalic-webfont.ttf'
  }
};

@Injectable()
export class GeradorPdfService {
  private readonly logger = new Logger(GeradorPdfService.name);
  private printer: any;
  private readonly uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');

  constructor() {
    // Usar fontes padrão que o sistema ofereça ou injetar via base64, 
    // mas pdfmake precisa dos arquivos físicos. Para simplificar, 
    // vamos usar fontes padrão embutidas se não achar Roboto.
    try {
      this.printer = new PdfPrinter(fonts);
    } catch (e) {
      // Fallback para fontes do sistema operacionais básicas se Roboto falhar (evita crash)
      // Em produção real, você deve garantir que npm install roboto-font foi rodado.
      this.printer = new PdfPrinter({
        Roboto: {
          normal: 'Helvetica',
          bold: 'Helvetica-Bold',
          italics: 'Helvetica-Oblique',
          bolditalics: 'Helvetica-BoldOblique',
        }
      });
    }

    const docDir = join(this.uploadDir, 'documentos_assinados');
    if (!existsSync(docDir)) {
      mkdirSync(docDir, { recursive: true });
    }
  }

  /**
   * Gera o PDF da Ordem de Serviço com as assinaturas
   */
  async gerarPdfOrdemServico(dadosOS: any, assinaturas: AssinaturaDigital[], urlValidacaoBase: string): Promise<string> {
    const filename = `OS_${dadosOS.numero.replace(/\//g, '_')}_${Date.now()}.pdf`;
    const filePath = join(this.uploadDir, 'documentos_assinados', filename);

    const docDefinition = await this.construirDefinicaoOS(dadosOS, assinaturas, urlValidacaoBase);
    
    return new Promise((resolve, reject) => {
      const pdfDoc = this.printer.createPdfKitDocument(docDefinition);
      const writeStream = createWriteStream(filePath);
      
      pdfDoc.pipe(writeStream);
      pdfDoc.end();
      
      writeStream.on('finish', () => resolve(`documentos_assinados/${filename}`));
      writeStream.on('error', reject);
    });
  }

  /**
   * Gera o PDF do Boletim de Medição com as assinaturas
   */
  async gerarPdfMedicao(dadosMedicao: any, assinaturas: AssinaturaDigital[], urlValidacaoBase: string): Promise<string> {
    const filename = `Medicao_${dadosMedicao.numero_medicao}_${Date.now()}.pdf`;
    const filePath = join(this.uploadDir, 'documentos_assinados', filename);

    const docDefinition = await this.construirDefinicaoMedicao(dadosMedicao, assinaturas, urlValidacaoBase);
    
    return new Promise((resolve, reject) => {
      const pdfDoc = this.printer.createPdfKitDocument(docDefinition);
      const writeStream = createWriteStream(filePath);
      
      pdfDoc.pipe(writeStream);
      pdfDoc.end();
      
      writeStream.on('finish', () => resolve(`documentos_assinados/${filename}`));
      writeStream.on('error', reject);
    });
  }

  private async gerarQrCodeBase64(url: string): Promise<string> {
    try {
      return await QRCode.toDataURL(url);
    } catch (err) {
      this.logger.error('Erro ao gerar QR Code', err);
      return '';
    }
  }

  private formatarDataHora(data: Date): string {
    return new Date(data).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }

  private async construirQuadroAssinaturas(assinaturas: AssinaturaDigital[], urlValidacaoBase: string): Promise<any[]> {
    if (!assinaturas || assinaturas.length === 0) return [];

    // O código de validação principal é do primeiro assinante (que gerou o documento)
    const codigoValidacao = assinaturas[0].codigo_validacao;
    const urlValidacaoCompleta = `${urlValidacaoBase}/${codigoValidacao}`;
    const qrCode = await this.gerarQrCodeBase64(urlValidacaoCompleta);

    const blockAssinaturas = [
      { text: 'QUADRO DE ASSINATURAS ELETRÔNICAS', style: 'header', margin: [0, 20, 0, 10] },
      { text: 'Este documento foi assinado eletronicamente com Duplo Fator de Autenticação (WhatsApp), em conformidade com a Lei 14.063/2020.', fontSize: 10, margin: [0, 0, 0, 15] },
    ];

    assinaturas.forEach((ass) => {
      blockAssinaturas.push({
        margin: [0, 5, 0, 5],
        table: {
          widths: ['*'],
          body: [
            [
              {
                fillColor: '#f3f4f6',
                border: [false, false, false, false],
                stack: [
                  { text: `Assinado eletronicamente por: ${ass.usuario_nome}`, bold: true, fontSize: 11 },
                  { text: `Papel: ${ass.papel_assinante} | CPF/CNPJ: ${this.mascararDocumento(ass.usuario_cpf_cnpj)}`, fontSize: 10 },
                  { text: `Data/Hora: ${this.formatarDataHora(ass.data_assinatura)} | IP: ${ass.ip_address || 'Não registrado'}`, fontSize: 9, color: 'gray' },
                  { text: `Validação via 2FA (WhatsApp) concluída com sucesso.`, fontSize: 9, color: '#16a34a', margin: [0, 2, 0, 0] }
                ]
              }
            ]
          ]
        }
      } as any);
    });

    // Rodapé de Validação (com QR Code)
    blockAssinaturas.push({
      margin: [0, 20, 0, 0],
      columns: [
        qrCode ? { image: qrCode, width: 80 } : { text: '' },
        {
          margin: [15, 10, 0, 0],
          stack: [
            { text: 'PARA VERIFICAR A AUTENTICIDADE DESTE DOCUMENTO:', bold: true, fontSize: 10 },
            { text: `Acesse: ${urlValidacaoBase}`, fontSize: 10, margin: [0, 5, 0, 2] },
            { text: `E informe o código: ${codigoValidacao}`, bold: true, fontSize: 12, color: '#2563eb' }
          ]
        }
      ]
    } as any);

    return blockAssinaturas;
  }

  private mascararDocumento(doc: string): string {
    if (!doc) return '';
    const limpo = doc.replace(/\D/g, '');
    if (limpo.length === 11) {
      return `***.${limpo.substring(3, 6)}.${limpo.substring(6, 9)}-**`;
    }
    if (limpo.length === 14) {
      return `**.***.${limpo.substring(5, 8)}/****-**`;
    }
    return '***';
  }

  // Definições de layouts específicos (mock básico para expansão)
  private async construirDefinicaoOS(dadosOS: any, assinaturas: AssinaturaDigital[], urlValidacaoBase: string): Promise<any> {
    const quadroAssinaturas = await this.construirQuadroAssinaturas(assinaturas, urlValidacaoBase);

    return {
      content: [
        { text: 'AUTORIZAÇÃO DE INÍCIO DE OBRA / ORDEM DE SERVIÇO', style: 'title', alignment: 'center', margin: [0, 0, 0, 20] },
        { text: `Número: ${dadosOS.numero}`, style: 'subheader' },
        { text: `Órgão: ${dadosOS.orgao?.nome || 'Não informado'}`, margin: [0, 5, 0, 5] },
        { text: `Fornecedor: ${dadosOS.fornecedor?.razao_social || 'Não informado'}`, margin: [0, 5, 0, 5] },
        { text: `Contrato Vinculado: ${dadosOS.contrato?.numero_contrato || 'N/A'}`, margin: [0, 5, 0, 5] },
        { text: `Descrição da OS:`, bold: true, margin: [0, 15, 0, 5] },
        { text: dadosOS.descricao_os || dadosOS.justificativa || 'Sem descrição' },
        
        ...quadroAssinaturas
      ],
      styles: {
        title: { fontSize: 16, bold: true },
        header: { fontSize: 14, bold: true },
        subheader: { fontSize: 12, bold: true }
      },
      defaultStyle: { font: 'Roboto' }
    };
  }

  private async construirDefinicaoMedicao(dadosMedicao: any, assinaturas: AssinaturaDigital[], urlValidacaoBase: string): Promise<any> {
    const quadroAssinaturas = await this.construirQuadroAssinaturas(assinaturas, urlValidacaoBase);

    return {
      content: [
        { text: 'BOLETIM DE MEDIÇÃO', style: 'title', alignment: 'center', margin: [0, 0, 0, 20] },
        { text: `Medição Nº: ${dadosMedicao.numero_medicao}ª`, style: 'subheader' },
        { text: `Contrato: ${dadosMedicao.contrato?.numero_contrato || 'N/A'}`, margin: [0, 5, 0, 5] },
        { text: `Período: ${new Date(dadosMedicao.periodo_inicio).toLocaleDateString()} a ${new Date(dadosMedicao.periodo_fim).toLocaleDateString()}`, margin: [0, 5, 0, 5] },
        { text: `Valor Medido: R$ ${Number(dadosMedicao.valor_medido).toFixed(2)}`, margin: [0, 5, 0, 5] },
        { text: `Percentual Físico: ${Number(dadosMedicao.percentual_fisico_medido).toFixed(2)}%`, margin: [0, 5, 0, 15] },
        
        ...quadroAssinaturas
      ],
      styles: {
        title: { fontSize: 16, bold: true },
        header: { fontSize: 14, bold: true },
        subheader: { fontSize: 12, bold: true }
      },
      defaultStyle: { font: 'Roboto' }
    };
  }
}

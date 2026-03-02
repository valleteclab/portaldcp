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
        // Prioridade: itensOS > itens > etapasOS (mapeadas para o mesmo formato)
        let itensParaRender: Array<{ quantidade_solicitada: number; itemCronograma: any }> = [];

        if (dadosOS.itensOS?.length > 0) {
          itensParaRender = dadosOS.itensOS;
        } else if (dadosOS.itens?.length > 0) {
          itensParaRender = dadosOS.itens.map((item: any) => ({
            quantidade_solicitada: item.quantidade_solicitada ?? item.quantidade ?? 1,
            itemCronograma: item.itemCronograma ?? (item.item_contrato ? {
              descricao: item.item_contrato.descricao_item ?? item.item_contrato.descricao ?? item.item_contrato.nome ?? '-',
              unidade_medida: item.item_contrato.unidade_medida ?? 'UN',
              valor_unitario: item.item_contrato.valor_unitario ?? item.item_contrato.valor_unitario_estimado ?? 0,
              quantidade_meses: item.quantidade_meses ?? null,
              valor_mensal: item.valor_mensal ?? null,
            } : {
              descricao: item.descricao_item ?? item.descricao ?? '-',
              unidade_medida: item.unidade_medida ?? 'UN',
              valor_unitario: item.valor_unitario_estimado ?? item.valor_unitario ?? 0,
              quantidade_meses: item.quantidade_meses ?? null,
              valor_mensal: item.valor_mensal ?? null,
            }),
          }));
        } else if (dadosOS.etapasOS?.length > 0) {
          itensParaRender = dadosOS.etapasOS.map((etapa: any) => {
            const perc = Number(etapa.percentual_solicitado ?? 0);
            const valorPrevisto = etapa.etapa?.valor_previsto ?? etapa.etapa?.valor_etapa ?? etapa.valor_previsto ?? etapa.valor_etapa ?? 0;
            const percEfetivo = perc > 0 ? perc : 100;
            const totalEtapa = valorPrevisto * percEfetivo / 100;
            return {
              quantidade_solicitada: percEfetivo,
              total_override: totalEtapa,
              itemCronograma: etapa.etapa ? {
                descricao: `Etapa ${etapa.etapa.numero_etapa}: ${etapa.etapa.descricao ?? '-'}`,
                unidade_medida: '%',
                valor_unitario: valorPrevisto,
                quantidade_meses: null,
                valor_mensal: null,
              } : {
                descricao: etapa.descricao ?? `Etapa ${etapa.numero_etapa ?? ''}`,
                unidade_medida: '%',
                valor_unitario: valorPrevisto,
                quantidade_meses: null,
                valor_mensal: null,
              },
            };
          });
        }

        if (itensParaRender.length > 0) {
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151')
            .text('Itens da Ordem de Serviço:', marginL, doc.y, { width: contentW });
          doc.moveDown(0.3);
          this.escreverTabelaItensOS(doc, itensParaRender);
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
   * Gera o PDF da Ordem de Fornecimento (mesmo modelo visual da Ordem de Serviço)
   * Usado para ordens de materiais geradas a partir de requisições autorizadas.
   * Quando assinaturas e urlValidacaoBase são fornecidos, inclui quadro de assinaturas eletrônicas.
   */
  async gerarPdfOrdemFornecimento(
    ordem: {
      numero: string;
      tipo?: string;
      data_emissao: Date;
      descricao?: string | null;
      local_entrega?: string | null;
      valor_total: number;
      itens: Array<{
        numero_item?: number;
        descricao: string;
        unidade_medida?: string;
        quantidade: number;
        valor_unitario: number;
        valor_total: number;
      }>;
      orgao?: { nome?: string; logo_url?: string; logradouro?: string; bairro?: string; cidade?: string; uf?: string; cnpj?: string };
      contrato?: { numero_contrato?: string; numero_processo?: string; objeto?: string; fornecedor?: { razao_social?: string; cpf_cnpj?: string } };
      requisicao?: { usuario_solicitante_nome?: string; setor_solicitante?: string; prioridade?: string };
      usuario_emitente_nome?: string;
    },
    outputDir?: string,
    opcoes?: { assinaturas?: AssinaturaDigital[]; urlValidacaoBase?: string },
  ): Promise<string> {
    const dir = outputDir || join(this.uploadDir, 'documentos_assinados');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const filename = `OF_${ordem.numero.replace(/\//g, '_')}_${Date.now()}.pdf`;
    const filePath = join(dir, filename);

    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const writeStream = createWriteStream(filePath);
        doc.pipe(writeStream);

        const orgao = ordem.orgao || {};
        const pageW = doc.page.width;
        const marginL = 50;
        const contentW = pageW - marginL * 2;

        // ── CABEÇALHO: logo + dados do órgão (mesmo modelo da OS) ─────────────
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

        // ── TÍTULO + NÚMERO ──────────────────────────────────────────────────
        const titulo = ordem.tipo === 'SERVICO' ? 'ORDEM DE SERVIÇO' : 'ORDEM DE FORNECIMENTO';
        const numOF = ordem.numero || '';
        const tituloY = doc.y;
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#111827')
          .text(titulo, marginL, tituloY, { width: contentW - 80, align: 'center' });
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e40af')
          .text(numOF, pageW - marginL - 80, tituloY, { width: 80, align: 'right' });

        doc.moveDown(0.3);
        doc.moveTo(marginL, doc.y).lineTo(pageW - marginL, doc.y).lineWidth(1).stroke('#374151');
        doc.moveDown(0.6);

        // ── CAMPOS INFORMATIVOS ─────────────────────────────────────────────
        const labelW = 100;
        const valueW = contentW / 2 - labelW - 10;
        const col2X = marginL + contentW / 2;

        const campo = (label: string, valor: string, x: number, y: number, w: number) => {
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#374151').text(label, x, y, { width: labelW, continued: false });
          doc.fontSize(9).font('Helvetica').fillColor('#111827').text(valor || '-', x + labelW, y, { width: w });
        };

        let rowY = doc.y;

        campo('Número:', numOF, marginL, rowY, valueW);
        campo('Data Emissão:', ordem.data_emissao ? new Date(ordem.data_emissao).toLocaleDateString('pt-BR') : '-', col2X, rowY, valueW);
        rowY += 16;

        campo('Órgão:', (orgao.nome || '-').toUpperCase(), marginL, rowY, contentW - labelW);
        rowY += 16;

        if (ordem.contrato?.numero_contrato) {
          campo('Contrato:', ordem.contrato.numero_contrato, marginL, rowY, valueW);
          if (ordem.contrato?.fornecedor?.cpf_cnpj) {
            campo('CNPJ/CPF:', ordem.contrato.fornecedor.cpf_cnpj, col2X, rowY, valueW);
          }
          rowY += 16;
        }

        if (ordem.contrato?.fornecedor?.razao_social) {
          campo('Fornecedor:', (ordem.contrato.fornecedor.razao_social || '-').toUpperCase(), marginL, rowY, contentW - labelW);
          rowY += 16;
        }

        if (ordem.requisicao?.setor_solicitante) {
          campo('Setor:', ordem.requisicao.setor_solicitante, marginL, rowY, valueW);
          if (ordem.requisicao?.prioridade) {
            campo('Prioridade:', ordem.requisicao.prioridade, col2X, rowY, valueW);
          }
          rowY += 16;
        }

        if (ordem.local_entrega) {
          campo('Local de Entrega:', ordem.local_entrega, marginL, rowY, contentW - labelW);
          rowY += 16;
        }

        if (ordem.requisicao?.usuario_solicitante_nome) {
          campo('Solicitante:', ordem.requisicao.usuario_solicitante_nome, marginL, rowY, contentW - labelW);
          rowY += 16;
        }

        doc.y = rowY + 4;
        doc.moveTo(marginL, doc.y).lineTo(pageW - marginL, doc.y).lineWidth(0.5).stroke('#9ca3af');
        doc.moveDown(0.6);

        // ── OBJETO / JUSTIFICATIVA ───────────────────────────────────────────
        if (ordem.descricao || ordem.contrato?.objeto) {
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#374151')
            .text('Objeto / Justificativa:', marginL, doc.y, { width: contentW });
          doc.moveDown(0.2);
          doc.fontSize(9).font('Helvetica').fillColor('#111827')
            .text(ordem.descricao || ordem.contrato?.objeto || 'Sem descrição', marginL, doc.y, { width: contentW, align: 'justify' });
          doc.moveDown(0.5);
          doc.moveTo(marginL, doc.y).lineTo(pageW - marginL, doc.y).lineWidth(0.5).stroke('#9ca3af');
          doc.moveDown(0.6);
        }

        // ── TABELA DE ITENS ──────────────────────────────────────────────────
        const itensParaRender = (ordem.itens || []).map((item) => ({
          quantidade_solicitada: Number(item.quantidade),
          itemCronograma: {
            descricao: item.descricao || '-',
            unidade_medida: item.unidade_medida || 'UN',
            valor_unitario: Number(item.valor_unitario),
            quantidade_meses: undefined,
            valor_mensal: undefined,
          },
          total_override: Number(item.valor_total),
        }));

        if (itensParaRender.length > 0) {
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151')
            .text('Itens da Ordem de Fornecimento:', marginL, doc.y, { width: contentW });
          doc.moveDown(0.3);
          this.escreverTabelaItensOS(doc, itensParaRender);
        }

        // ── RODAPÉ: assinaturas eletrônicas ou espaço para assinatura manual ───
        if (opcoes?.assinaturas?.length && opcoes?.urlValidacaoBase) {
          if (doc.y > doc.page.height - 200) doc.addPage();
          await this.escreverQuadroAssinaturas(doc, opcoes.assinaturas, opcoes.urlValidacaoBase);
        } else {
          if (doc.y > doc.page.height - 120) doc.addPage();
          doc.moveDown(1);
          doc.moveTo(marginL, doc.y).lineTo(pageW - marginL, doc.y).lineWidth(0.8).stroke('#6b7280');
          doc.moveDown(0.5);

          doc.fontSize(9).font('Helvetica').fillColor('#374151')
            .text(
              'A NOTA FISCAL SÓ TERÁ VALIDADE NO LANÇAMENTO DO EMPENHO, SE ACOMPANHADA DESTA ORDEM DEVIDAMENTE ASSINADA PELO RESPONSÁVEL.',
              marginL, doc.y, { width: contentW, align: 'center' }
            );
          doc.moveDown(1);

          doc.fontSize(8).font('Helvetica-Bold').fillColor('#111827').text('Assinatura(s):');
          doc.moveDown(0.5);
          if (ordem.usuario_emitente_nome) {
            doc.fontSize(8).font('Helvetica').fillColor('#374151')
              .text(`Emitente: ${ordem.usuario_emitente_nome}`);
          }
          doc.moveDown(1.5);
          doc.moveTo(marginL, doc.y).lineTo(marginL + 200, doc.y).lineWidth(0.5).stroke('#9ca3af');
          doc.fontSize(7).font('Helvetica').fillColor('#6b7280')
            .text('Responsável', marginL, doc.y + 2, { width: 200 });
        }

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
    const marginL = 50;
    const pageW = doc.page.width;
    const contentW = pageW - marginL * 2;

    doc.moveDown(1);
    doc.moveTo(marginL, doc.y).lineTo(pageW - marginL, doc.y).lineWidth(0.8).stroke('#6b7280');
    doc.moveDown(0.5);

    doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e40af')
      .text('QUADRO DE ASSINATURAS ELETRÔNICAS', marginL, doc.y, { width: contentW, align: 'center' });
    doc.moveDown(0.25);

    doc.fontSize(7.5).font('Helvetica').fillColor('#374151')
      .text(
        'Este documento foi assinado eletronicamente em conformidade com a Lei nº 14.063/2020.',
        marginL, doc.y, { width: contentW, align: 'center' }
      );
    doc.moveDown(0.6);

    for (const ass of assinaturas) {
      if (doc.y > doc.page.height - 80) { doc.addPage(); doc.y = 50; }
      const yStart = doc.y;
      const boxH = 52;
      doc.rect(marginL, yStart, contentW, boxH).fillAndStroke('#f9fafb', '#e5e7eb');

      doc.fillColor('#111827').fontSize(8.5).font('Helvetica-Bold')
        .text(`Assinado por: ${ass.usuario_nome}`, marginL + 8, yStart + 7, { width: contentW - 16 });
      doc.fontSize(8).font('Helvetica').fillColor('#374151')
        .text(`Papel: ${PAPEL_LABELS[ass.papel_assinante] || ass.papel_assinante}`, marginL + 8, yStart + 19, { width: contentW - 16 });
      doc.fillColor('#6b7280')
        .text(`Data/Hora: ${this.formatarDataHora(ass.data_assinatura)}`, marginL + 8, yStart + 30, { width: contentW - 16 });
      doc.fillColor('#16a34a').font('Helvetica-Bold').fontSize(7.5)
        .text('✓  Assinatura eletrônica válida', marginL + 8, yStart + 41, { width: contentW - 16 });

      doc.y = yStart + boxH + 5;
    }

    // ── Rodapé: QR Code + verificação ─────────────────────────────────────────
    doc.moveDown(0.5);
    doc.moveTo(marginL, doc.y).lineTo(pageW - marginL, doc.y).lineWidth(0.5).stroke('#9ca3af');
    doc.moveDown(0.4);

    const rodapeY = doc.y;
    const qrSize  = 65;
    const qrX     = pageW - marginL - qrSize;

    doc.fontSize(8).font('Helvetica-Bold').fillColor('#111827')
      .text('VERIFICAR AUTENTICIDADE:', marginL, rodapeY, { width: contentW - qrSize - 10 });
    doc.fontSize(7.5).font('Helvetica').fillColor('#374151')
      .text(`Acesse: ${urlValidacaoBase}`, marginL, doc.y, { width: contentW - qrSize - 10 });
    doc.moveDown(0.2);
    doc.font('Helvetica-Bold').fillColor('#2563eb').fontSize(7.5)
      .text(`Código: ${codigoValidacao}`, marginL, doc.y, { width: contentW - qrSize - 10 });

    try {
      const qrBuffer = await QRCode.toBuffer(urlCompleta, { type: 'png', width: 80 });
      doc.image(qrBuffer, qrX, rodapeY, { width: qrSize });
    } catch (err) {
      this.logger.warn(`Erro ao gerar QR Code: ${(err as Error).message}`);
    }
  }

  private formatarDataHora(data: Date): string {
    return new Date(data).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }

  private escreverTabelaItensOS(doc: any, itensOS: Array<{ quantidade_solicitada: number; total_override?: number; itemCronograma?: { descricao?: string; unidade_medida?: string; valor_unitario?: number; quantidade_meses?: number | null; valor_mensal?: number } }>): void {
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
      const desc = ic.descricao || '-';
      const unid = ic.unidade_medida || '-';
      const qtd  = Number(item.quantidade_solicitada);
      const vlUnit = Number(ic.valor_unitario ?? 0);
      const meses  = ic.quantidade_meses ? Number(ic.quantidade_meses) : null;
      const vlMensal = ic.valor_mensal ?? (qtd * vlUnit);
      const total  = item.total_override !== undefined ? item.total_override : (meses ? vlMensal * meses : qtd * vlUnit);
      totalGeral  += total;

      doc.fontSize(8);
      const descHeight = doc.heightOfString(desc, { width: colDesc - 6 });
      const rowH = Math.max(descHeight, 12);

      if (doc.y + rowH + 4 > doc.page.height - 80) {
        doc.addPage(); doc.y = 50;
      }

      const rowY = doc.y + 2;
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
      doc.y = rowY + rowH + 2;
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

  /**
   * Gera o PDF da Comprovação de Aceite do Recebimento (para o fiscal).
   * Inclui dados do recebimento, itens aceitos e quadro de assinaturas.
   */
  async gerarPdfComprovacaoAceite(
    recebimento: {
      numero: string;
      data_recebimento: Date;
      numero_nota_fiscal?: string | null;
      valor_total_recebido: number;
      valor_aceito: number;
      aceite_almoxarifado_data?: Date | null;
      aceite_almoxarifado_usuario_nome?: string | null;
      aceite_patrimonio_data?: Date | null;
      aceite_patrimonio_usuario_nome?: string | null;
      itens?: Array<{
        numero_item?: number;
        descricao: string;
        unidade_medida?: string;
        tipo_item?: string;
        quantidade_recebida: number;
        quantidade_aceita: number;
        valor_unitario: number;
        valor_total: number;
      }>;
      ordem_fornecimento?: {
        numero: string;
        fornecedor?: { razao_social?: string };
      };
      orgao?: { nome?: string; logo_url?: string; logradouro?: string; bairro?: string; cidade?: string; uf?: string };
    },
    outputDir?: string,
    opcoes?: { assinaturas?: AssinaturaDigital[]; urlValidacaoBase?: string },
  ): Promise<string> {
    const dir = outputDir || join(this.uploadDir, 'documentos_assinados');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const filename = `ComprovacaoAceite_${recebimento.numero.replace(/\//g, '_')}_${Date.now()}.pdf`;
    const filePath = join(dir, filename);

    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const writeStream = createWriteStream(filePath);
        doc.pipe(writeStream);

        const orgao = recebimento.orgao || {};
        const pageW = doc.page.width;
        const marginL = 50;
        const contentW = pageW - marginL * 2;

        // ── CABEÇALHO ────────────────────────────────────────────────────────
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

        doc.fontSize(14).font('Helvetica-Bold').fillColor('#1e40af')
          .text('COMPROVAÇÃO DE ACEITE DO RECEBIMENTO', marginL, lineY, { width: contentW, align: 'center' });
        lineY += 22;

        doc.moveTo(marginL, lineY).lineTo(pageW - marginL, lineY).lineWidth(1).stroke('#374151');
        doc.moveDown(0.6);

        // ── DADOS DO RECEBIMENTO ─────────────────────────────────────────────
        const campo = (label: string, valor: string, x: number, y: number, w: number) => {
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#374151').text(label, x, y, { width: 90, continued: false });
          doc.fontSize(9).font('Helvetica').fillColor('#111827').text(valor || '-', x + 92, y, { width: w });
        };

        let rowY = doc.y;
        const col2X = marginL + contentW / 2;

        campo('Nº Recebimento:', recebimento.numero, marginL, rowY, contentW / 2 - 100);
        campo('Data Recebimento:', recebimento.data_recebimento ? new Date(recebimento.data_recebimento).toLocaleDateString('pt-BR') : '-', col2X, rowY, contentW / 2 - 100);
        rowY += 16;

        campo('Nº Nota Fiscal:', recebimento.numero_nota_fiscal || '-', marginL, rowY, contentW / 2 - 100);
        campo('Ordem:', recebimento.ordem_fornecimento?.numero || '-', col2X, rowY, contentW / 2 - 100);
        rowY += 16;

        campo('Fornecedor:', recebimento.ordem_fornecimento?.fornecedor?.razao_social || '-', marginL, rowY, contentW - 100);
        rowY += 16;

        campo('Valor Total Recebido:', `R$ ${Number(recebimento.valor_total_recebido || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, marginL, rowY, contentW / 2 - 100);
        campo('Valor Aceito:', `R$ ${Number(recebimento.valor_aceito || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, col2X, rowY, contentW / 2 - 100);
        rowY += 20;

        // Aceites realizados
        const aceites: string[] = [];
        if (recebimento.aceite_almoxarifado_data && recebimento.aceite_almoxarifado_usuario_nome) {
          aceites.push(`Almoxarifado: ${recebimento.aceite_almoxarifado_usuario_nome} em ${new Date(recebimento.aceite_almoxarifado_data).toLocaleString('pt-BR')}`);
        }
        if (recebimento.aceite_patrimonio_data && recebimento.aceite_patrimonio_usuario_nome) {
          aceites.push(`Patrimônio: ${recebimento.aceite_patrimonio_usuario_nome} em ${new Date(recebimento.aceite_patrimonio_data).toLocaleString('pt-BR')}`);
        }
        if (aceites.length > 0) {
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151').text('Aceites realizados:', marginL, doc.y);
          doc.moveDown(0.2);
          doc.fontSize(8).font('Helvetica').fillColor('#111827');
          aceites.forEach((a) => {
            doc.text(`• ${a}`, marginL, doc.y);
            doc.moveDown(0.15);
          });
          doc.moveDown(0.3);
        }

        // ── TABELA DE ITENS ──────────────────────────────────────────────────
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151')
          .text('Itens aceitos:', marginL, doc.y);
        doc.moveDown(0.3);

        const itens = recebimento.itens || [];
        if (itens.length > 0) {
          const colDesc = contentW * 0.40;
          const colTipo = contentW * 0.12;
          const colQtd = contentW * 0.12;
          const colValor = contentW * 0.18;
          const colTotal = contentW * 0.18;

          const x0 = marginL;
          const x1 = x0 + colDesc;
          const x2 = x1 + colTipo;
          const x3 = x2 + colQtd;
          const x4 = x3 + colValor;

          const headerY = doc.y;
          doc.rect(x0, headerY, contentW, 16).fillAndStroke('#e5e7eb', '#9ca3af');
          doc.fontSize(7).font('Helvetica-Bold').fillColor('#111827');
          doc.text('Descrição', x0 + 3, headerY + 4, { width: colDesc - 6 });
          doc.text('Tipo', x1, headerY + 4, { width: colTipo - 4, align: 'center' });
          doc.text('Qtd.', x2, headerY + 4, { width: colQtd - 4, align: 'right' });
          doc.text('Valor Unit.', x3, headerY + 4, { width: colValor - 4, align: 'right' });
          doc.text('Total', x4, headerY + 4, { width: colTotal - 4, align: 'right' });
          doc.y = headerY + 18;

          doc.font('Helvetica').fillColor('#374151');
          for (const item of itens) {
            const rowY = doc.y + 2;
            if (rowY > doc.page.height - 120) doc.addPage();
            doc.fontSize(8);
            doc.text((item.descricao || '-').substring(0, 60), x0 + 3, rowY, { width: colDesc - 6 });
            doc.text((item as any).tipo_item === 'CONSUMO' ? 'Consumo' : (item as any).tipo_item === 'PERMANENTE' ? 'Permanente' : '-', x1, rowY, { width: colTipo - 4, align: 'center' });
            doc.text(String(item.quantidade_aceita ?? item.quantidade_recebida ?? 0), x2, rowY, { width: colQtd - 4, align: 'right' });
            doc.text(`R$ ${Number(item.valor_unitario || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, x3, rowY, { width: colValor - 4, align: 'right' });
            doc.text(`R$ ${Number(item.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, x4, rowY, { width: colTotal - 4, align: 'right' });
            doc.y = rowY + 14;
          }
          doc.moveDown(0.5);
        }

        // ── ASSINATURAS ──────────────────────────────────────────────────────
        if (opcoes?.assinaturas?.length && opcoes?.urlValidacaoBase) {
          if (doc.y > doc.page.height - 200) doc.addPage();
          await this.escreverQuadroAssinaturas(doc, opcoes.assinaturas, opcoes.urlValidacaoBase);
        } else {
          doc.moveDown(1);
          doc.fontSize(8).font('Helvetica').fillColor('#6b7280')
            .text('Documento gerado automaticamente pelo sistema.', marginL, doc.y, { width: contentW });
        }

        doc.end();
        writeStream.on('finish', () => resolve(filePath));
        writeStream.on('error', reject);
      } catch (err) {
        reject(err);
      }
    });
  }
}

import { Injectable, Logger } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { join } from 'path';
import { createWriteStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { AssinaturaDigital } from './entities/assinatura-digital.entity';
import { gerarBoletimMedicaoPdf } from './medicao-pdf-jspdf';

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

        const alturaLinha = (texto: string, largura: number) => {
          doc.fontSize(9).font('Helvetica');
          return Math.max(18, doc.heightOfString(texto || '-', { width: largura }) + 6);
        };

        let rowY = doc.y;

        campo('Número da OS:', numOS, marginL, rowY, valueW);
        campo('Data Autorização:', dadosOS.data_autorizacao ? new Date(dadosOS.data_autorizacao).toLocaleDateString('pt-BR') : '-', col2X, rowY, valueW);
        rowY += 18;

        const nomeOrgao = (orgao.nome || '-').toUpperCase();
        campo('Órgão:', nomeOrgao, marginL, rowY, contentW - labelW);
        rowY += alturaLinha(nomeOrgao, contentW - labelW);

        const tipoInstrumentoLabels: Record<string, string> = {
          CONTRATO: 'Contrato', NOTA_EMPENHO: 'Nota de Empenho', ORDEM_SERVICO: 'Ordem de Serviço',
          ORDEM_FORNECIMENTO: 'Ordem de Fornecimento', CARTA_CONTRATO: 'Carta Contrato',
          TERMO_ADESAO: 'Termo de Adesão', ATA_REGISTRO_PRECO: 'Ata de Reg. de Preço',
        };
        const tipoInstrumentoOS = tipoInstrumentoLabels[dadosOS.contrato?.tipo] || 'Contrato';

        if (dadosOS.contrato?.numero_contrato) {
          campo(`${tipoInstrumentoOS}:`, dadosOS.contrato.numero_contrato, marginL, rowY, valueW);
          if (dadosOS.contrato?.fornecedor?.cpf_cnpj) {
            campo('CNPJ/CPF:', dadosOS.contrato.fornecedor.cpf_cnpj, col2X, rowY, valueW);
          }
          rowY += 18;
        }

        if (dadosOS.contrato?.numero_processo) {
          campo('Proc. Administrativo:', dadosOS.contrato.numero_processo, marginL, rowY, contentW - labelW);
          rowY += alturaLinha(dadosOS.contrato.numero_processo, contentW - labelW);
        }

        if (dadosOS.contrato?.fornecedor?.razao_social) {
          const nomeForn = (dadosOS.contrato.fornecedor.razao_social || '-').toUpperCase();
          campo('Fornecedor:', nomeForn, marginL, rowY, contentW - labelW);
          rowY += alturaLinha(nomeForn, contentW - labelW);
        }

        if (dadosOS.setor_solicitante) {
          const altSetor = alturaLinha(dadosOS.setor_solicitante, valueW);
          campo('Setor:', dadosOS.setor_solicitante, marginL, rowY, valueW);
          if (dadosOS.prioridade) {
            campo('Prioridade:', dadosOS.prioridade, col2X, rowY, valueW);
          }
          rowY += altSetor;
        }

        if (dadosOS.local_execucao) {
          campo('Local de Execução:', dadosOS.local_execucao, marginL, rowY, contentW - labelW);
          rowY += alturaLinha(dadosOS.local_execucao, contentW - labelW);
        }

        // ── EMPENHOS VINCULADOS ──────────────────────────────────────────────
        if (dadosOS.numeros_empenhos) {
          let numsEmpenho: string[] = [];
          try {
            const parsed = JSON.parse(dadosOS.numeros_empenhos);
            if (Array.isArray(parsed)) numsEmpenho = parsed;
          } catch {}
          if (numsEmpenho.length > 0) {
            const empenhoStr = numsEmpenho.map(n => `#${n}`).join(', ');
            campo('Nota de Empenho:', empenhoStr, marginL, rowY, contentW - labelW);
            rowY += alturaLinha(empenhoStr, contentW - labelW);
          }
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
          const arredondar = dadosOS.contrato?.arredondar_calculo ?? true;
          const configuracaoMaoDeObra = dadosOS.contrato?.exige_relacao_funcionarios
            ? { loteNumero: dadosOS.contrato.lote_relacao_funcionarios ?? null }
            : undefined;
          this.escreverTabelaItensOS(doc, itensParaRender, arredondar, configuracaoMaoDeObra);
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
      itens_avulsos?: Array<{
        descricao: string;
        quantidade: number;
        valor_unitario: number;
        valor_total: number;
      }>;
      orgao?: { nome?: string; logo_url?: string; logradouro?: string; bairro?: string; cidade?: string; uf?: string; cnpj?: string };
      contrato?: { numero_contrato?: string; numero_processo?: string; tipo?: string; objeto?: string; fornecedor?: { razao_social?: string; cpf_cnpj?: string } };
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
        // Este documento é sempre uma Ordem de Fornecimento (mesmo quando o tipo é SERVICO).
        const titulo = 'ORDEM DE FORNECIMENTO';
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

        const alturaLinha = (texto: string, largura: number) => {
          doc.fontSize(9).font('Helvetica');
          return Math.max(18, doc.heightOfString(texto || '-', { width: largura }) + 6);
        };

        let rowY = doc.y;

        campo('Número:', numOF, marginL, rowY, valueW);
        campo('Data Emissão:', this.formatarDataSomenteDia(ordem.data_emissao), col2X, rowY, valueW);
        rowY += 18;

        const nomeOrgaoOF = (orgao.nome || '-').toUpperCase();
        campo('Órgão:', nomeOrgaoOF, marginL, rowY, contentW - labelW);
        rowY += alturaLinha(nomeOrgaoOF, contentW - labelW);

        const tipoInstrumentoLabelsOF: Record<string, string> = {
          CONTRATO: 'Contrato', NOTA_EMPENHO: 'Nota de Empenho', ORDEM_SERVICO: 'Ordem de Serviço',
          ORDEM_FORNECIMENTO: 'Ordem de Fornecimento', CARTA_CONTRATO: 'Carta Contrato',
          TERMO_ADESAO: 'Termo de Adesão', ATA_REGISTRO_PRECO: 'Ata de Reg. de Preço',
        };
        const tipoInstrumentoOF = tipoInstrumentoLabelsOF[ordem.contrato?.tipo] || 'Contrato';

        if (ordem.contrato?.numero_contrato) {
          campo(`${tipoInstrumentoOF}:`, ordem.contrato.numero_contrato, marginL, rowY, valueW);
          if (ordem.contrato?.fornecedor?.cpf_cnpj) {
            campo('CNPJ/CPF:', ordem.contrato.fornecedor.cpf_cnpj, col2X, rowY, valueW);
          }
          rowY += 18;
        }

        if (ordem.contrato?.numero_processo) {
          campo('Proc. Administrativo:', ordem.contrato.numero_processo, marginL, rowY, contentW - labelW);
          rowY += alturaLinha(ordem.contrato.numero_processo, contentW - labelW);
        }

        if (ordem.contrato?.fornecedor?.razao_social) {
          const nomeFornOF = (ordem.contrato.fornecedor.razao_social || '-').toUpperCase();
          campo('Fornecedor:', nomeFornOF, marginL, rowY, contentW - labelW);
          rowY += alturaLinha(nomeFornOF, contentW - labelW);
        }

        if (ordem.requisicao?.setor_solicitante) {
          const altSetorOF = alturaLinha(ordem.requisicao.setor_solicitante, valueW);
          campo('Setor:', ordem.requisicao.setor_solicitante, marginL, rowY, valueW);
          if (ordem.requisicao?.prioridade) {
            campo('Prioridade:', ordem.requisicao.prioridade, col2X, rowY, valueW);
          }
          rowY += altSetorOF;
        }

        if (ordem.local_entrega) {
          campo('Local de Entrega:', ordem.local_entrega, marginL, rowY, contentW - labelW);
          rowY += alturaLinha(ordem.local_entrega, contentW - labelW);
        }

        if (ordem.requisicao?.usuario_solicitante_nome) {
          campo('Solicitante:', ordem.requisicao.usuario_solicitante_nome, marginL, rowY, contentW - labelW);
          rowY += alturaLinha(ordem.requisicao.usuario_solicitante_nome, contentW - labelW);
        }

        // ── EMPENHOS VINCULADOS ──────────────────────────────────────────────
        const empenhosFontOF = (ordem as any).numeros_empenhos ?? (ordem.requisicao as any)?.numeros_empenhos;
        if (empenhosFontOF) {
          let numsEmpenho: string[] = [];
          try {
            const parsed = typeof empenhosFontOF === 'string' ? JSON.parse(empenhosFontOF) : empenhosFontOF;
            if (Array.isArray(parsed)) numsEmpenho = parsed;
          } catch {}
          if (numsEmpenho.length > 0) {
            const empenhoStr = numsEmpenho.map(n => `#${n}`).join(', ');
            campo('Nota de Empenho:', empenhoStr, marginL, rowY, contentW - labelW);
            rowY += alturaLinha(empenhoStr, contentW - labelW);
          }
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

        // ── TABELA DE ITENS AVULSOS (pós-NF) ─────────────────────────────────
        const avulsosParaRender = (ordem.itens_avulsos || []).map((item) => ({
          quantidade_solicitada: Number(item.quantidade),
          itemCronograma: {
            descricao: item.descricao || '-',
            unidade_medida: 'UN',
            valor_unitario: Number(item.valor_unitario),
            quantidade_meses: undefined,
            valor_mensal: undefined,
          },
          total_override: Number(item.valor_total),
        }));
        if (avulsosParaRender.length > 0) {
          doc.moveDown(0.6);
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151')
            .text('Itens avulsos (conforme nota fiscal):', marginL, doc.y, { width: contentW });
          doc.moveDown(0.3);
          this.escreverTabelaItensOS(doc, avulsosParaRender);
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
   * Gera o PDF do Boletim de Medição usando jsPDF (layout idêntico ao frontend)
   */
  async gerarPdfMedicao(dados: any, assinaturas: AssinaturaDigital[], urlValidacaoBase: string, outputPath?: string): Promise<string> {
    const filename = `Medicao_${dados.numero_medicao}_${Date.now()}.pdf`;
    const filePath = outputPath || join(this.uploadDir, 'documentos_assinados', filename);

    // Extrair código de validação bruto (sem formatação) da primeira assinatura
    const codigoValidacaoRaw = assinaturas?.[0]?.codigo_validacao || undefined;

    const buffer = await gerarBoletimMedicaoPdf(dados, codigoValidacaoRaw, urlValidacaoBase);
    writeFileSync(filePath, buffer);

    return filePath;
  }

  private escreverTabelaItensContratados(doc: any, itens: any[]): void {
    const pageWidth = doc.page.width - 100;
    const marginL = 50;
    const colNum   = pageWidth * 0.06;
    const colDesc  = pageWidth * 0.40;
    const colUnid  = pageWidth * 0.10;
    const colQtd   = pageWidth * 0.11;
    const colValor = pageWidth * 0.16;
    const colTotal = pageWidth * 0.17;

    const x0 = marginL;
    const x1 = x0 + colNum;
    const x2 = x1 + colDesc;
    const x3 = x2 + colUnid;
    const x4 = x3 + colQtd;
    const x5 = x4 + colValor;

    const headerY = doc.y;
    doc.rect(x0, headerY, pageWidth, 18).fillAndStroke('#e5e7eb', '#9ca3af');
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#111827');
    doc.text('Nº',          x0 + 2, headerY + 5, { width: colNum - 4, align: 'center' });
    doc.text('Descrição',   x1 + 3, headerY + 5, { width: colDesc - 6 });
    doc.text('Unid.',       x2,     headerY + 5, { width: colUnid,  align: 'center' });
    doc.text('Qtd.',        x3,     headerY + 5, { width: colQtd,   align: 'right' });
    doc.text('Valor Unit.', x4,     headerY + 5, { width: colValor, align: 'right' });
    doc.text('Valor Total', x5,     headerY + 5, { width: colTotal, align: 'right' });
    doc.y = headerY + 20;

    doc.font('Helvetica').fillColor('#374151');
    let totalGeral = 0;

    for (const item of itens) {
      const desc = item.descricao || '-';
      doc.fontSize(7.5);
      const descHeight = doc.heightOfString(desc, { width: colDesc - 6 });
      const rowH = Math.max(descHeight, 12);

      if (doc.y + rowH + 4 > doc.page.height - 80) {
        doc.addPage(); doc.y = 50;
      }

      const rowY = doc.y + 2;
      const total = Number(item.valor_total || 0);
      totalGeral += total;

      doc.text(String(item.numero || '-'), x0 + 2, rowY, { width: colNum - 4, align: 'center' });
      doc.text(desc, x1 + 3, rowY, { width: colDesc - 6 });
      doc.text(item.unidade || '-', x2, rowY, { width: colUnid, align: 'center' });
      doc.text(Number(item.quantidade || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), x3, rowY, { width: colQtd, align: 'right' });
      doc.text(`R$ ${Number(item.valor_unitario || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, x4, rowY, { width: colValor, align: 'right' });
      doc.text(`R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, x5, rowY, { width: colTotal, align: 'right' });

      doc.y = rowY + rowH + 2;
      doc.moveTo(x0, doc.y).lineTo(x0 + pageWidth, doc.y).lineWidth(0.3).stroke('#e5e7eb');
      doc.y += 1;
    }

    doc.moveDown(0.2);
    doc.rect(x0, doc.y, pageWidth, 18).fillAndStroke('#f3f4f6', '#9ca3af');
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#111827');
    doc.text('TOTAL', x0 + 3, doc.y + 5, { width: colNum + colDesc + colUnid + colQtd + colValor - 6 });
    doc.text(`R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, x5, doc.y + 5, { width: colTotal, align: 'right' });
    doc.y += 20;
  }

  private escreverTabelaDiscriminacoes(doc: any, discriminacoes: any[]): void {
    const pageWidth = doc.page.width - 100;
    const marginL = 50;
    const colNum  = pageWidth * 0.08;
    const colDesc = pageWidth * 0.52;
    const colVal  = pageWidth * 0.22;
    const colPerc = pageWidth * 0.18;

    const x0 = marginL;
    const x1 = x0 + colNum;
    const x2 = x1 + colDesc;
    const x3 = x2 + colVal;

    const headerY = doc.y;
    doc.rect(x0, headerY, pageWidth, 18).fillAndStroke('#e5e7eb', '#9ca3af');
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#111827');
    doc.text('Nº',          x0 + 2, headerY + 5, { width: colNum - 4, align: 'center' });
    doc.text('Descrição',   x1 + 3, headerY + 5, { width: colDesc - 6 });
    doc.text('Valor (R$)',  x2,     headerY + 5, { width: colVal,  align: 'right' });
    doc.text('%',           x3,     headerY + 5, { width: colPerc, align: 'right' });
    doc.y = headerY + 20;

    doc.font('Helvetica').fillColor('#374151');
    let totalValor = 0;

    for (const disc of discriminacoes) {
      const desc = disc.descricao || '-';
      doc.fontSize(7.5);
      const descHeight = doc.heightOfString(desc, { width: colDesc - 6 });
      const rowH = Math.max(descHeight, 12);

      if (doc.y + rowH + 4 > doc.page.height - 80) {
        doc.addPage(); doc.y = 50;
      }

      const rowY = doc.y + 2;
      const valor = Number(disc.valor || 0);
      totalValor += valor;

      doc.text(String(disc.numero || '-'), x0 + 2, rowY, { width: colNum - 4, align: 'center' });
      doc.text(desc, x1 + 3, rowY, { width: colDesc - 6 });
      doc.text(`R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, x2, rowY, { width: colVal, align: 'right' });
      doc.text(`${Number(disc.percentual || 0).toFixed(2)}%`, x3, rowY, { width: colPerc, align: 'right' });

      doc.y = rowY + rowH + 2;
      doc.moveTo(x0, doc.y).lineTo(x0 + pageWidth, doc.y).lineWidth(0.3).stroke('#e5e7eb');
      doc.y += 1;
    }

    doc.moveDown(0.2);
    doc.rect(x0, doc.y, pageWidth, 18).fillAndStroke('#f3f4f6', '#9ca3af');
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#111827');
    doc.text('TOTAL', x0 + 3, doc.y + 5, { width: colNum + colDesc - 6 });
    doc.text(`R$ ${totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, x2, doc.y + 5, { width: colVal, align: 'right' });
    doc.y += 20;
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
        .text(`Assinado por: ${this.normalizarNome(ass.usuario_nome)}`, marginL + 8, yStart + 7, { width: contentW - 16 });
      doc.fontSize(8).font('Helvetica').fillColor('#374151')
        .text(`Cargo: ${ass.usuario_cargo || ass.papel_assinante || '-'}`, marginL + 8, yStart + 19, { width: contentW - 16 });
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
    const d = data instanceof Date ? data : new Date(data as any);
    // timestamp without time zone: pg driver interpreta como LOCAL.
    // Desfaz offset local para obter UTC real, depois converte para BRT.
    const trueUtcMs = d.getTime() - d.getTimezoneOffset() * 60 * 1000;
    const brt = new Date(trueUtcMs - 3 * 60 * 60 * 1000);
    const dd = String(brt.getUTCDate()).padStart(2, '0');
    const mm = String(brt.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = brt.getUTCFullYear();
    const hh = String(brt.getUTCHours()).padStart(2, '0');
    const mi = String(brt.getUTCMinutes()).padStart(2, '0');
    const ss = String(brt.getUTCSeconds()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy}, ${hh}:${mi}:${ss}`;
  }

  /**
   * Formata uma coluna DATE (sem hora) como DD/MM/YYYY SEM conversão de fuso.
   * Evita o bug de `new Date("YYYY-MM-DD")` ser interpretado como UTC e voltar 1 dia
   * em servidores com fuso negativo (Brasília, UTC-3).
   */
  private formatarDataSomenteDia(valor: Date | string | null | undefined): string {
    if (!valor) return '-';
    const s =
      typeof valor === 'string'
        ? valor
        : valor instanceof Date
          ? valor.toISOString()
          : String(valor);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    const d = new Date(valor as any);
    return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('pt-BR');
  }

  private normalizarNome(nome: string): string {
    if (!nome) return '';
    // Se o nome estiver todo em minúsculo ou maiúsculo, normalizar para Title Case
    const estaMinusculo = nome === nome.toLowerCase();
    const estaMaiusculo = nome === nome.toUpperCase();
    if (estaMinusculo || estaMaiusculo) {
      return nome
        .toLowerCase()
        .split(' ')
        .map(palavra => palavra.charAt(0).toUpperCase() + palavra.slice(1))
        .join(' ');
    }
    return nome;
  }

  private escreverTabelaItensOS(doc: any, itensOS: Array<{ quantidade_solicitada: number; meses_solicitados?: number | null; total_override?: number; descricao_avulso?: string | null; quantidade_avulso?: number | null; valor_unitario_avulso?: number | null; valor_total_avulso?: number | null; itemCronograma?: { numero_item?: number; lote_numero?: number | null; descricao?: string; unidade_medida?: string; valor_unitario?: number; quantidade_meses?: number | null; valor_mensal?: number } }>, arredondar = true, configuracaoMaoDeObra?: { loteNumero: number | null }): void {
    const pageWidth = doc.page.width - 100;
    const colNum   = pageWidth * 0.05;
    const temMaoDeObra = itensOS.some((item) => {
      if (!configuracaoMaoDeObra || !item.itemCronograma) return false;
      return configuracaoMaoDeObra.loteNumero == null ||
        Number(item.itemCronograma.lote_numero) === Number(configuracaoMaoDeObra.loteNumero);
    });
    const colDesc  = pageWidth * (temMaoDeObra ? 0.34 : 0.39);
    const colUnid  = pageWidth * (temMaoDeObra ? 0.09 : 0.10);
    const colQtd   = pageWidth * (temMaoDeObra ? 0.17 : 0.11);
    const colValor = pageWidth * 0.17;
    const colTotal = pageWidth * 0.18;

    const x0 = 50;
    const x1 = x0 + colNum;
    const x2 = x1 + colDesc;
    const x3 = x2 + colUnid;
    const x4 = x3 + colQtd;
    const x5 = x4 + colValor;

    // ── Cabeçalho da tabela
    const headerY = doc.y;
    doc.rect(x0, headerY, pageWidth, 18).fillAndStroke('#e5e7eb', '#9ca3af');
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#111827');
    doc.text('#',           x0 + 3, headerY + 5, { width: colNum - 4 });
    doc.text('Descrição',   x1 + 3, headerY + 5, { width: colDesc - 6 });
    doc.text('Unidade',     x2,     headerY - 13 + 5, { width: colUnid,  align: 'center' });
    doc.text(temMaoDeObra ? 'Composição' : 'Qtd.', x3, headerY - 13 + 5, { width: colQtd, align: 'right' });
    doc.text('Valor Unit.', x4,     headerY - 13 + 5, { width: colValor, align: 'right' });
    doc.text('Total',       x5,     headerY - 13 + 5, { width: colTotal, align: 'right' });
    doc.y = headerY + 20;

    // ── Linhas
    doc.font('Helvetica').fillColor('#374151');
    let totalGeral = 0;

    for (const item of itensOS) {
      const ic  = item.itemCronograma || {};
      // Item avulso (não vinculado ao cronograma): usa os campos *_avulso
      const isAvulso = !item.itemCronograma && !!item.descricao_avulso;
      // Publicidade (Lei 12.232): imprime o memorial de apropriação de custos
      // (valor de referência da tabela + percentual) sob a descrição — cláusula 4.3
      const memorial = (ic as any).observacoes as string | undefined;
      const temMemorial = !!memorial && /^(SINAPRO|Terceiros|Mídia)/.test(memorial);
      const qtd  = isAvulso ? Number(item.quantidade_avulso ?? 0) : Number(item.quantidade_solicitada);
      const isMaoDeObra =
        !isAvulso &&
        !!configuracaoMaoDeObra &&
        (configuracaoMaoDeObra.loteNumero == null ||
          Number(ic.lote_numero) === Number(configuracaoMaoDeObra.loteNumero));
      // MENSAL fracionado (período parcial): exibe em DIAS comerciais (ex.: 0,2333 mês → 7 dias).
      // Apenas exibição — o valor continua calculado pela fração exata.
      const isMensalFracionado =
        !isMaoDeObra &&
        !isAvulso &&
        String(ic.unidade_medida || '').toUpperCase() === 'MENSAL' &&
        qtd > 0 &&
        Math.abs(qtd - Math.round(qtd)) > 0.0001;
      const unid = isMensalFracionado ? 'DIAS' : (isAvulso ? '-' : (ic.unidade_medida || '-'));
      const quantidadeExibida = isMensalFracionado
        ? String(Math.round(qtd * 30))
        : qtd.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
      const desc = (isAvulso ? (item.descricao_avulso as string) : (ic.descricao || '-')) +
        (temMemorial ? `\n${memorial}` : '');
      const vlUnit = isAvulso ? Number(item.valor_unitario_avulso ?? 0) : Number(ic.valor_unitario ?? 0);
      const ap = (v: number) => arredondar ? Math.round(v * 100) / 100 : Math.floor(v * 100) / 100;
      // total: avulso usa valor_total_avulso; cronograma usa qtd × vlUnit (qtd já inclui meses × qty/período)
      const total  = isAvulso
        ? Number(item.valor_total_avulso ?? 0)
        : (item.total_override !== undefined ? item.total_override : ap(qtd * vlUnit));
      totalGeral  += total;

      if (isMaoDeObra) {
        const totalDiasPosto = Math.round(qtd * 30);
        const postosInteiros = Math.floor(totalDiasPosto / 30);
        const diasParciais = totalDiasPosto % 30;
        const totalPostosInteiros = ap(postosInteiros * vlUnit);
        // O restante é obtido do total original para preservar exatamente os
        // centavos da OS, inclusive quando o contrato usa truncamento.
        const totalPeriodoParcial = Math.round((total - totalPostosInteiros) * 100) / 100;

        const renderizarLinha = (
          numero: string,
          descricao: string,
          unidade: string,
          composicao: string,
          valorUnitario: number | null,
          valorLinha: number | null,
          subitem = false,
          casasValorUnitario = 2,
        ) => {
          doc.fontSize(8);
          const descHeight = doc.heightOfString(descricao, { width: colDesc - 6 });
          const qtdHeight = doc.heightOfString(composicao, { width: colQtd - 4 });
          const rowH = Math.max(descHeight, qtdHeight, 12);

          if (doc.y + rowH + 4 > doc.page.height - 80) {
            doc.addPage(); doc.y = 50;
          }

          const rowY = doc.y + 2;
          if (subitem) {
            doc.rect(x0, doc.y, pageWidth, rowH + 3).fill('#f9fafb');
          }
          doc.font(subitem ? 'Helvetica-Oblique' : 'Helvetica').fillColor('#374151');
          doc.text(numero, x0 + 3, rowY, { width: colNum - 4 });
          doc.text(descricao, x1 + 3, rowY, { width: colDesc - 6 });
          doc.text(unidade, x2, rowY, { width: colUnid, align: 'center' });
          doc.text(composicao, x3, rowY, { width: colQtd, align: 'right' });
          doc.text(
            valorUnitario != null
              ? `R$ ${valorUnitario.toLocaleString('pt-BR', {
                  minimumFractionDigits: casasValorUnitario,
                  maximumFractionDigits: casasValorUnitario,
                })}`
              : '-',
            x4, rowY, { width: colValor, align: 'right' },
          );
          doc.text(
            valorLinha != null
              ? `R$ ${valorLinha.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : '-',
            x5, rowY, { width: colTotal, align: 'right' },
          );
          doc.y = rowY + rowH + 2;
          doc.moveTo(x0, doc.y).lineTo(x0 + pageWidth, doc.y).lineWidth(0.3).stroke('#e5e7eb');
          doc.y += 1;
        };

        // Mantém o item contratual como linha principal. Quando todo o período
        // é parcial, a linha funciona como cabeçalho e o valor fica no subitem.
        renderizarLinha(
          ic.numero_item != null ? String(ic.numero_item) : '-',
          desc,
          'POSTO/MÊS',
          postosInteiros > 0
            ? `${postosInteiros} ${postosInteiros === 1 ? 'funcionário' : 'funcionários'}`
            : 'Período parcial',
          postosInteiros > 0 ? vlUnit : null,
          // O total aparece uma única vez e já consolida item + subitem.
          total,
        );

        if (diasParciais > 0) {
          renderizarLinha(
            ic.numero_item != null ? `${ic.numero_item}.1` : '-',
            '↳ Subitem — período parcial do posto',
            'DIA',
            `1 funcionário\n${diasParciais} ${diasParciais === 1 ? 'dia trabalhado' : 'dias trabalhados'}`,
            totalPeriodoParcial / diasParciais,
            null,
            true,
            4,
          );
        }
        continue;
      }

      doc.fontSize(8);
      const descHeight = doc.heightOfString(desc, { width: colDesc - 6 });
      const qtdHeight = doc.heightOfString(quantidadeExibida, { width: colQtd - 4 });
      const rowH = Math.max(descHeight, qtdHeight, 12);

      if (doc.y + rowH + 4 > doc.page.height - 80) {
        doc.addPage(); doc.y = 50;
      }

      const rowY = doc.y + 2;
      doc.text(ic.numero_item != null ? String(ic.numero_item) : '-', x0 + 3, rowY, { width: colNum - 4 });
      doc.text(desc,  x1 + 3, rowY, { width: colDesc - 6 });
      doc.text(unid,  x2, rowY, { width: colUnid,  align: 'center' });
      doc.text(quantidadeExibida, x3, rowY, { width: colQtd, align: 'right' });
      doc.text(
        vlUnit > 0 ? `R$ ${vlUnit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-',
        x4, rowY, { width: colValor, align: 'right' }
      );
      doc.text(
        `R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        x5, rowY, { width: colTotal, align: 'right' }
      );
      doc.y = rowY + rowH + 2;
      doc.moveTo(x0, doc.y).lineTo(x0 + pageWidth, doc.y).lineWidth(0.3).stroke('#e5e7eb');
      doc.y += 1;
    }

    // ── Linha de total geral
    doc.moveDown(0.2);
    doc.rect(x0, doc.y, pageWidth, 18).fillAndStroke('#f3f4f6', '#9ca3af');
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#111827');
    doc.text('TOTAL GERAL', x0 + 3, doc.y + 5, { width: colNum + colDesc + colUnid + colQtd + colValor - 6 });
    doc.text(
      `R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      x5, doc.y - 14 + 5, { width: colTotal, align: 'right' }
    );
    doc.y += 20;
    if (temMaoDeObra) {
      doc.moveDown(0.35);
      doc.fontSize(7).font('Helvetica').fillColor('#4b5563').text(
        'Nos itens de mão de obra, cada posto/mês corresponde a um funcionário por 30 dias. O valor total do item consolida os postos integrais e o período parcial indicado no subitem.',
        x0,
        doc.y,
        { width: pageWidth },
      );
    }
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
          const pageWidth = contentW;
          const colNum   = pageWidth * 0.06;  // Nº Item
          const colDesc  = pageWidth * 0.44;  // Descrição (aumentada)
          const colUnid  = pageWidth * 0.10;  // Unidade
          const colQtd   = pageWidth * 0.10;  // Qtd.
          const colValor = pageWidth * 0.15;  // Valor Unit.
          const colTotal = pageWidth * 0.15;  // Total

          const x0 = marginL;
          const x1 = x0 + colNum;
          const x2 = x1 + colDesc;
          const x3 = x2 + colUnid;
          const x4 = x3 + colQtd;
          const x5 = x4 + colValor;

          // ── Cabeçalho da tabela
          const headerY = doc.y;
          doc.rect(x0, headerY, pageWidth, 18).fillAndStroke('#e5e7eb', '#9ca3af');
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#111827');
          doc.text('Nº',      x0 + 3,  headerY + 5, { width: colNum - 6, align: 'center' });
          doc.text('Descrição',   x1 + 3,  headerY + 5, { width: colDesc - 6 });
          doc.text('Unidade',     x2,      headerY - 13 + 5, { width: colUnid,  align: 'center' });
          doc.text('Qtd.',        x3,      headerY - 13 + 5, { width: colQtd,   align: 'right' });
          doc.text('Valor Unit.', x4,      headerY - 13 + 5, { width: colValor, align: 'right' });
          doc.text('Total',       x5,      headerY - 13 + 5, { width: colTotal, align: 'right' });
          doc.y = headerY + 20;

          // ── Linhas
          doc.font('Helvetica').fillColor('#374151');
          let totalGeral = 0;

          for (const item of itens) {
            const numeroItem = item.numero_item || '-';
            const desc = item.descricao || '-';
            const unid = item.unidade_medida || 'UN';
            const qtd  = Number(item.quantidade_aceita ?? item.quantidade_recebida ?? 0);
            const vlUnit = Number(item.valor_unitario || 0);
            const total  = Number(item.valor_total || 0);
            totalGeral  += total;

            doc.fontSize(8);
            const descHeight = doc.heightOfString(desc, { width: colDesc - 6 });
            const rowH = Math.max(descHeight, 12);

            if (doc.y + rowH + 4 > doc.page.height - 80) {
              doc.addPage(); doc.y = 50;
            }

            const rowY = doc.y + 2;
            doc.text(numeroItem.toString(), x0 + 3, rowY, { width: colNum - 6, align: 'center' });
            doc.text(desc,  x1 + 3, rowY, { width: colDesc - 6 });
            doc.text(unid,  x2, rowY, { width: colUnid,  align: 'center' });
            doc.text(
              qtd.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
              x3, rowY, { width: colQtd, align: 'right' }
            );
            doc.text(
              vlUnit > 0 ? `R$ ${vlUnit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-',
              x4, rowY, { width: colValor, align: 'right' }
            );
            doc.text(
              `R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
              x5, rowY, { width: colTotal, align: 'right' }
            );
            doc.y = rowY + rowH + 2;
            doc.moveTo(x0, doc.y).lineTo(x0 + pageWidth, doc.y).lineWidth(0.3).stroke('#e5e7eb');
            doc.y += 1;
          }

          // ── Linha de total geral
          doc.moveDown(0.2);
          doc.rect(x0, doc.y, pageWidth, 18).fillAndStroke('#f3f4f6', '#9ca3af');
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#111827');
          doc.text('TOTAL GERAL', x0 + 3, doc.y + 5, { width: colNum + colDesc + colUnid + colQtd + colValor - 6 });
          doc.text(
            `R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
            x5, doc.y - 14 + 5, { width: colTotal, align: 'right' }
          );
          doc.y += 20;
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

  /**
   * PDF da PRÉ-OS de publicidade aprovada — registro da aprovação prévia por
   * escrito exigida pelas cláusulas 3.6/3.7 (Lei 12.232/2010), com a
   * apropriação de custos de cada linha. Retorna a URL relativa do arquivo.
   */
  async gerarPdfPreOsPublicidade(dados: {
    id: string;
    orgao_nome: string;
    contrato_numero: string;
    fornecedor_razao_social: string;
    pre_os_sequencial: number;
    titulo: string;
    justificativa?: string | null;
    linhas: Array<{ tipo: string; servico: string; detalhe: string; qtd: number; unit: number; total: number }>;
    valor_total: number;
    aprovado_por?: string | null;
    aprovado_em: Date;
    requisicao_numero?: string | null;
  }): Promise<string> {
    const docDir = join(this.uploadDir, 'documentos_assinados');
    if (!existsSync(docDir)) mkdirSync(docDir, { recursive: true });
    const filename = `pre-os-${dados.id}-${Date.now()}.pdf`;
    const filePath = join(docDir, filename);
    const brl = (v: number) =>
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
    const dataBR = (d: Date) =>
      new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const ws = createWriteStream(filePath);
        doc.pipe(ws);

        // Cabeçalho
        doc.font('Helvetica-Bold').fontSize(13).fillColor('#111827')
          .text(dados.orgao_nome, { align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(12).text(`PRÉ-OS Nº ${String(dados.pre_os_sequencial).padStart(3, '0')} — APROVAÇÃO PRÉVIA DE DESPESAS`, { align: 'center' });
        doc.font('Helvetica').fontSize(9).fillColor('#4b5563')
          .text('Lei nº 12.232/2010 — aprovação prévia por escrito (cláusulas 3.6/3.7 do contrato)', { align: 'center' });
        doc.moveDown(0.8);

        // Bloco de informações
        doc.fontSize(10).fillColor('#111827');
        doc.font('Helvetica-Bold').text('Contrato: ', { continued: true }).font('Helvetica').text(dados.contrato_numero);
        doc.font('Helvetica-Bold').text('Contratada: ', { continued: true }).font('Helvetica').text(dados.fornecedor_razao_social);
        doc.font('Helvetica-Bold').text('Campanha/ação: ', { continued: true }).font('Helvetica').text(dados.titulo);
        if (dados.justificativa) {
          doc.font('Helvetica-Bold').text('Justificativa: ', { continued: true }).font('Helvetica').text(dados.justificativa);
        }
        doc.moveDown(0.6);

        // Tabela de linhas
        const x0 = 50, wTipo = 62, wServ = 250, wQtd = 36, wUnit = 72, wTot = 75;
        const xServ = x0 + wTipo, xQtd = xServ + wServ, xUnit = xQtd + wQtd, xTot = xUnit + wUnit;
        const headerY = doc.y;
        doc.rect(x0, headerY, wTipo + wServ + wQtd + wUnit + wTot, 16).fill('#1f2937');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
        doc.text('TIPO', x0 + 3, headerY + 4, { width: wTipo - 6 });
        doc.text('SERVIÇO / APROPRIAÇÃO DE CUSTOS', xServ + 3, headerY + 4, { width: wServ - 6 });
        doc.text('QTD', xQtd, headerY + 4, { width: wQtd - 3, align: 'right' });
        doc.text('VLR UNIT.', xUnit, headerY + 4, { width: wUnit - 3, align: 'right' });
        doc.text('TOTAL', xTot, headerY + 4, { width: wTot - 3, align: 'right' });
        let y = headerY + 18;

        doc.font('Helvetica').fontSize(8).fillColor('#111827');
        for (const l of dados.linhas) {
          const texto = `${l.servico}\n${l.detalhe}`;
          const h = Math.max(16, doc.heightOfString(texto, { width: wServ - 6 }) + 6);
          if (y + h > doc.page.height - 90) { doc.addPage(); y = 50; }
          doc.fillColor('#6b7280').text(l.tipo, x0 + 3, y + 2, { width: wTipo - 6 });
          doc.fillColor('#111827').text(texto, xServ + 3, y + 2, { width: wServ - 6 });
          doc.text(String(l.qtd), xQtd, y + 2, { width: wQtd - 3, align: 'right' });
          doc.text(brl(l.unit), xUnit, y + 2, { width: wUnit - 3, align: 'right' });
          doc.font('Helvetica-Bold').text(brl(l.total), xTot, y + 2, { width: wTot - 3, align: 'right' });
          doc.font('Helvetica');
          doc.moveTo(x0, y + h).lineTo(xTot + wTot, y + h).strokeColor('#e5e7eb').stroke();
          y += h;
        }

        // Total
        y += 6;
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827');
        doc.text(`VALOR TOTAL APROVADO: ${brl(dados.valor_total)}`, x0, y, {
          width: wTipo + wServ + wQtd + wUnit + wTot,
          align: 'right',
        });
        y = doc.y + 14;

        // Aprovação
        doc.font('Helvetica').fontSize(9).fillColor('#374151');
        doc.text(
          `Aprovação prévia registrada em ${dataBR(dados.aprovado_em)}` +
            (dados.aprovado_por ? ` por ${dados.aprovado_por}` : '') +
            (dados.requisicao_numero ? ` — Ordem de Serviço vinculada: ${dados.requisicao_numero}.` : '.'),
          x0,
          y,
          { width: wTipo + wServ + wQtd + wUnit + wTot },
        );
        doc.moveDown(0.5);
        doc.fontSize(7.5).fillColor('#6b7280').text(
          'Valores calculados pela tabela de referência vigente e pelos percentuais do contrato ' +
            '(desconto sobre tabela, honorários sobre custos de terceiros e desconto de agência sobre veiculação). ' +
            'Documento gerado eletronicamente pelo Portal DCP.',
        );

        doc.end();
        ws.on('finish', () => resolve(`/api/uploads/documentos_assinados/${filename}`));
        ws.on('error', reject);
      } catch (err) {
        reject(err);
      }
    });
  }
}

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { join } from 'path';
import { existsSync, mkdirSync, createWriteStream } from 'fs';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { ItemPesquisaPrecos } from './types/pesquisa-precos.type';

const PDFDocument = require('pdfkit');

export interface DadosGeradorPP {
  numeroProcesso: string;
  objeto: string;
  orgao: string;
  itens: ItemPesquisaPrecos[];
  metodologia: 'MEDIA' | 'MEDIANA' | 'MENOR_VALOR' | 'OUTRA';
  justificativaMetodologia?: string;
  valorTotalEstimado: number;
  responsavel: { nome: string; cargo: string; matricula?: string };
  dataAssinatura: string;
}

@Injectable()
export class GeradorPpService {
  private readonly logger = new Logger(GeradorPpService.name);
  private readonly uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');

  constructor(
    @InjectRepository(Licitacao)
    private readonly licitacaoRepository: Repository<Licitacao>,
  ) {
    this.logger.log('GeradorPpService inicializado (pdfkit)');
  }

  async gerarDocumentoPP(licitacaoId: string, dados: DadosGeradorPP): Promise<string> {
    // Enriquece com dados da licitação se não fornecidos
    if (!dados.numeroProcesso || dados.numeroProcesso === licitacaoId || !dados.objeto) {
      const licitacao = await this.licitacaoRepository.findOne({
        where: { id: licitacaoId },
        relations: ['orgao'],
      });
      if (licitacao) {
        if (!dados.numeroProcesso || dados.numeroProcesso === licitacaoId) {
          dados = { ...dados, numeroProcesso: licitacao.numero_processo || licitacaoId };
        }
        if (!dados.objeto) {
          dados = { ...dados, objeto: licitacao.objeto || '' };
        }
        if (!dados.orgao) {
          dados = { ...dados, orgao: (licitacao as any).orgao?.nome || '' };
        }
      }
    }

    const dirPath = join(this.uploadDir, 'pesquisa-precos', licitacaoId);
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }

    const timestamp = Date.now();
    const filename = `PP_${timestamp}.pdf`;
    const filePath = join(dirPath, filename);
    const relativePath = `pesquisa-precos/${licitacaoId}/${filename}`;

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
        const writeStream = createWriteStream(filePath);
        doc.pipe(writeStream);

        const pageW = doc.page.width;
        const marginL = 50;
        const marginR = 50;
        const contentW = pageW - marginL - marginR;

        // ─── Helpers ──────────────────────────────────────────────────────────

        const addPageHeader = () => {
          doc.fontSize(7).font('Helvetica').fillColor('#6b7280')
            .text(`PESQUISA DE PREÇOS  —  ${dados.numeroProcesso}`, marginL, 20, {
              width: contentW,
              align: 'left',
            });
          doc.moveTo(marginL, 35).lineTo(pageW - marginR, 35).lineWidth(0.5).stroke('#d1d5db');
        };

        const formatCurrency = (val: number) =>
          val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        const metodologiaLabel: Record<string, string> = {
          MEDIA: 'Média aritmética',
          MEDIANA: 'Mediana',
          MENOR_VALOR: 'Menor valor',
          OUTRA: 'Outra',
        };

        // ─── CABEÇALHO ────────────────────────────────────────────────────────
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#111827')
          .text('PESQUISA DE PREÇOS', marginL, 60, { width: contentW, align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica').fillColor('#374151')
          .text(`Art. 23 da Lei 14.133/2021  ·  IN SEGES/ME 65/2021`, marginL, doc.y, {
            width: contentW,
            align: 'center',
          });

        doc.moveDown(0.8);
        doc.moveTo(marginL, doc.y).lineTo(pageW - marginR, doc.y).lineWidth(1).stroke('#374151');
        doc.moveDown(0.5);

        // Dados do processo
        const dadosProcesso = [
          ['Processo:', dados.numeroProcesso],
          ['Órgão:', dados.orgao],
          ['Data:', dados.dataAssinatura],
        ];
        for (const [label, value] of dadosProcesso) {
          const y = doc.y;
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151')
            .text(label, marginL, y, { width: 80, continued: false });
          doc.fontSize(9).font('Helvetica').fillColor('#111827')
            .text(value, marginL + 85, y, { width: contentW - 85 });
        }

        doc.moveDown(0.4);
        const objY = doc.y;
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151')
          .text('Objeto:', marginL, objY, { width: 80, continued: false });
        doc.fontSize(9).font('Helvetica').fillColor('#111827')
          .text(dados.objeto, marginL + 85, objY, { width: contentW - 85 });

        doc.moveDown(0.8);
        doc.moveTo(marginL, doc.y).lineTo(pageW - marginR, doc.y).lineWidth(0.5).stroke('#9ca3af');
        doc.moveDown(0.5);

        // ─── ITENS ────────────────────────────────────────────────────────────
        for (let i = 0; i < dados.itens.length; i++) {
          const item = dados.itens[i];

          // Garantir espaço suficiente para cabeçalho do item
          if (doc.y > doc.page.height - 150) {
            doc.addPage();
            addPageHeader();
            doc.y = 55;
          }

          // Cabeçalho do item
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e40af')
            .text(`ITEM ${item.item_numero} — ${item.descricao}`, marginL, doc.y, { width: contentW });
          doc.moveDown(0.2);
          doc.fontSize(9).font('Helvetica').fillColor('#374151')
            .text(`Quantidade: ${item.quantidade} ${item.unidade}`, marginL, doc.y);
          doc.moveDown(0.4);

          // Tabela de cotações
          if (item.cotacoes && item.cotacoes.length > 0) {
            const colWidths = [25, 70, 110, 55, 70, 90, 40];
            const headers = ['Nº', 'Fonte', 'Descrição', 'Data', 'Vl. Unit.', 'URL', 'Válida'];
            const tableX = marginL;
            let tableY = doc.y;

            // Cabeçalho da tabela
            doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#ffffff');
            doc.rect(tableX, tableY, contentW, 15).fill('#374151');
            let colX = tableX;
            for (let col = 0; col < headers.length; col++) {
              doc.fillColor('#ffffff').text(headers[col], colX + 3, tableY + 4, {
                width: colWidths[col] - 6,
                lineBreak: false,
              });
              colX += colWidths[col];
            }
            tableY += 15;

            // Linhas de cotações
            for (let ci = 0; ci < item.cotacoes.length; ci++) {
              const cot = item.cotacoes[ci];
              const rowBg = ci % 2 === 0 ? '#f9fafb' : '#ffffff';

              // Calcular altura necessária para a linha (descrição pode ser longa)
              const descText = cot.descricao_fonte || '-';
              doc.fontSize(7).font('Helvetica');
              const descH = doc.heightOfString(descText, { width: colWidths[2] - 6 });
              const rowH = Math.max(15, descH + 4);

              if (tableY + rowH > doc.page.height - 60) {
                doc.addPage();
                addPageHeader();
                tableY = 55;
              }

              doc.rect(tableX, tableY, contentW, rowH).fill(rowBg);
              doc.moveTo(tableX, tableY).lineTo(tableX + contentW, tableY).lineWidth(0.3).stroke('#e5e7eb');

              colX = tableX;
              const rowData = [
                String(ci + 1),
                cot.fonte || '-',
                descText,
                cot.data_pesquisa ? cot.data_pesquisa.substring(0, 10) : '-',
                formatCurrency(cot.valor_unitario || 0),
                cot.url_referencia || '-',
                cot.documento_comprobatorio_path ? 'Sim' : 'Não',
              ];

              for (let col = 0; col < rowData.length; col++) {
                doc.fontSize(7).font('Helvetica').fillColor('#111827')
                  .text(rowData[col], colX + 3, tableY + 3, {
                    width: colWidths[col] - 6,
                    height: rowH - 4,
                    ellipsis: true,
                    lineBreak: col === 2,
                  });
                colX += colWidths[col];
              }
              tableY += rowH;
            }

            // Linha final da tabela
            doc.moveTo(tableX, tableY).lineTo(tableX + contentW, tableY).lineWidth(0.3).stroke('#e5e7eb');
            doc.y = tableY + 6;
          }

          // Estatísticas
          doc.moveDown(0.3);
          const statsY = doc.y;
          const statsCols = [
            ['Mínimo', formatCurrency(item.valor_minimo || 0)],
            ['Máximo', formatCurrency(item.valor_maximo || 0)],
            ['Média', formatCurrency(item.valor_medio || 0)],
            ['Mediana', formatCurrency(item.valor_mediano || 0)],
            ['CV%', `${(item.cv_percent || 0).toFixed(2)}%`],
          ];
          const statColW = contentW / statsCols.length;
          for (let s = 0; s < statsCols.length; s++) {
            const sx = marginL + s * statColW;
            doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#374151')
              .text(statsCols[s][0], sx, statsY, { width: statColW, align: 'center' });
            doc.fontSize(8).font('Helvetica').fillColor('#111827')
              .text(statsCols[s][1], sx, statsY + 11, { width: statColW, align: 'center' });
          }
          doc.y = statsY + 26;

          // Alerta de CV elevado
          if ((item.cv_percent || 0) > 25) {
            doc.moveDown(0.2);
            doc.fontSize(8).font('Helvetica-Bold').fillColor('#b91c1c')
              .text(
                `⚠  Coeficiente de Variação elevado (${(item.cv_percent || 0).toFixed(2)}% > 25%). ` +
                `Recomenda-se revisar as cotações ou justificar formalmente a dispersão dos preços.`,
                marginL,
                doc.y,
                { width: contentW },
              );
            doc.moveDown(0.3);
          }

          // Valor referencial
          doc.moveDown(0.2);
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#065f46')
            .text(
              `Valor referencial adotado (${metodologiaLabel[item.metodologia] || item.metodologia}): ` +
              `${formatCurrency(item.valor_referencial)}`,
              marginL,
              doc.y,
              { width: contentW },
            );

          if (item.justificativa_metodologia) {
            doc.moveDown(0.2);
            doc.fontSize(8).font('Helvetica').fillColor('#374151')
              .text(`Justificativa: ${item.justificativa_metodologia}`, marginL, doc.y, { width: contentW });
          }

          doc.moveDown(0.6);
          doc.moveTo(marginL, doc.y).lineTo(pageW - marginR, doc.y).lineWidth(0.5).stroke('#e5e7eb');
          doc.moveDown(0.5);
        }

        // ─── METODOLOGIA GERAL ────────────────────────────────────────────────
        if (doc.y > doc.page.height - 160) {
          doc.addPage();
          addPageHeader();
          doc.y = 55;
        }

        doc.fontSize(11).font('Helvetica-Bold').fillColor('#111827')
          .text('METODOLOGIA ADOTADA', marginL, doc.y, { width: contentW });
        doc.moveDown(0.3);
        doc.fontSize(9).font('Helvetica').fillColor('#374151')
          .text(`Método: ${metodologiaLabel[dados.metodologia] || dados.metodologia}`, marginL, doc.y, { width: contentW });

        if (dados.justificativaMetodologia) {
          doc.moveDown(0.2);
          doc.fontSize(9).font('Helvetica').fillColor('#374151')
            .text(`Justificativa: ${dados.justificativaMetodologia}`, marginL, doc.y, { width: contentW });
        }

        // ─── VALOR TOTAL ESTIMADO ─────────────────────────────────────────────
        doc.moveDown(0.8);
        doc.moveTo(marginL, doc.y).lineTo(pageW - marginR, doc.y).lineWidth(0.5).stroke('#9ca3af');
        doc.moveDown(0.4);
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#111827')
          .text(`VALOR TOTAL ESTIMADO: ${formatCurrency(dados.valorTotalEstimado)}`, marginL, doc.y, {
            width: contentW,
            align: 'right',
          });

        // ─── RESPONSÁVEL ──────────────────────────────────────────────────────
        doc.moveDown(1);
        doc.moveTo(marginL, doc.y).lineTo(pageW - marginR, doc.y).lineWidth(0.5).stroke('#9ca3af');
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#111827')
          .text('RESPONSÁVEL PELA PESQUISA', marginL, doc.y, { width: contentW });
        doc.moveDown(0.4);

        const resp = dados.responsavel;
        doc.fontSize(9).font('Helvetica').fillColor('#374151')
          .text(`Nome: ${resp.nome}`, marginL, doc.y, { width: contentW });
        doc.moveDown(0.2);
        doc.text(`Cargo: ${resp.cargo}`, marginL, doc.y, { width: contentW });
        if (resp.matricula) {
          doc.moveDown(0.2);
          doc.text(`Matrícula: ${resp.matricula}`, marginL, doc.y, { width: contentW });
        }
        doc.moveDown(0.2);
        doc.text(`Data: ${dados.dataAssinatura}`, marginL, doc.y, { width: contentW });

        // Linha para assinatura
        doc.moveDown(1.5);
        const assinaturaX = marginL + contentW / 2 - 100;
        doc.moveTo(assinaturaX, doc.y).lineTo(assinaturaX + 200, doc.y).lineWidth(0.7).stroke('#111827');
        doc.moveDown(0.2);
        doc.fontSize(8).font('Helvetica').fillColor('#374151')
          .text(resp.nome, assinaturaX, doc.y, { width: 200, align: 'center' });
        doc.moveDown(0.15);
        doc.text(resp.cargo, assinaturaX, doc.y, { width: 200, align: 'center' });

        // ─── RODAPÉS ──────────────────────────────────────────────────────────
        const totalPages = doc.bufferedPageRange().count;
        for (let p = 0; p < totalPages; p++) {
          doc.switchToPage(p);
          const footerY = doc.page.height - 30;
          doc.moveTo(marginL, footerY - 5)
            .lineTo(pageW - marginR, footerY - 5)
            .lineWidth(0.5)
            .stroke('#d1d5db');
          doc.fontSize(7).font('Helvetica').fillColor('#6b7280')
            .text(
              `Pesquisa de Preços  —  ${dados.numeroProcesso}  —  Página ${p + 1} de ${totalPages}`,
              marginL,
              footerY,
              { width: contentW, align: 'center' },
            );
        }

        doc.end();

        writeStream.on('finish', () => resolve(relativePath));
        writeStream.on('error', reject);
      } catch (err) {
        reject(err);
      }
    });
  }
}

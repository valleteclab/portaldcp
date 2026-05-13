import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { join } from 'path';
import { existsSync, mkdirSync, createWriteStream } from 'fs';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { ItemPesquisaPrecos } from './types/pesquisa-precos.type';
import * as QRCode from 'qrcode';

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
  private readonly uploadDir =
    process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');

  constructor(
    @InjectRepository(Licitacao)
    private readonly licitacaoRepository: Repository<Licitacao>,
  ) {
    this.logger.log('GeradorPpService inicializado (pdfkit)');
  }

  async gerarDocumentoPP(
    licitacaoId: string,
    dados: DadosGeradorPP,
  ): Promise<string> {
    const licitacao = await this.licitacaoRepository.findOne({
      where: { id: licitacaoId },
      relations: ['orgao'],
    });
    const orgaoDetalhes = (licitacao as any)?.orgao;

    // Enriquece com dados da licitação se não fornecidos
    if (
      !dados.numeroProcesso ||
      dados.numeroProcesso === licitacaoId ||
      !dados.objeto
    ) {
      if (licitacao) {
        if (!dados.numeroProcesso || dados.numeroProcesso === licitacaoId) {
          dados = {
            ...dados,
            numeroProcesso: licitacao.numero_processo || licitacaoId,
          };
        }
        if (!dados.objeto) {
          dados = { ...dados, objeto: licitacao.objeto || '' };
        }
        if (!dados.orgao) {
          dados = { ...dados, orgao: orgaoDetalhes?.nome || '' };
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
    const urlPublica = `${this.getFrontendUrl()}/pesquisa-precos/publica/${licitacaoId}`;
    const qrCodeBuffer = await QRCode.toBuffer(urlPublica, {
      type: 'png',
      width: 160,
      margin: 1,
    });

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          margin: 50,
          size: 'A4',
          bufferPages: true,
        });
        const writeStream = createWriteStream(filePath);
        doc.pipe(writeStream);

        const pageW = doc.page.width;
        const marginL = 50;
        const marginR = 50;
        const contentW = pageW - marginL - marginR;

        // ─── Helpers ──────────────────────────────────────────────────────────

        const addPageHeader = () => {
          doc
            .fontSize(7)
            .font('Helvetica')
            .fillColor('#6b7280')
            .text(
              `PESQUISA DE PREÇOS  —  ${dados.numeroProcesso}`,
              marginL,
              20,
              {
                width: contentW,
                align: 'left',
              },
            );
          doc
            .moveTo(marginL, 35)
            .lineTo(pageW - marginR, 35)
            .lineWidth(0.5)
            .stroke('#d1d5db');
        };

        const formatCurrency = (val: number) =>
          val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        const formatDateBR = (val?: string) => {
          if (!val) return '-';
          const match = String(val).match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (match) return `${match[3]}/${match[2]}/${match[1]}`;
          const parsed = new Date(val);
          if (Number.isNaN(parsed.getTime())) return val;
          return parsed.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
        };

        const limitarTexto = (texto: string, limite = 650) =>
          texto.length > limite ? `${texto.slice(0, limite - 3)}...` : texto;

        const limparObservacaoCotacao = (observacao?: string) =>
          String(observacao || '')
            .split('|')
            .map((parte) => parte.trim())
            .filter(
              (parte) =>
                parte &&
                !/Fonte complementar Fonte de Precos: validar comprovante antes de aprovar como fonte oficial/i.test(
                  parte,
                ),
            )
            .join(' | ');

        const montarOrigemCotacao = (
          cot: ItemPesquisaPrecos['cotacoes'][number],
        ) => {
          const partes = [
            cot.descricao_fonte,
            cot.fornecedor_razao_social
              ? `Fornecedor: ${cot.fornecedor_razao_social}${cot.fornecedor_cnpj ? ` (${cot.fornecedor_cnpj})` : ''}`
              : '',
            limparObservacaoCotacao(cot.observacao),
          ]
            .filter(Boolean)
            .map((parte) => String(parte).replace(/\s+/g, ' ').trim());

          return limitarTexto(partes.join('\n'), 720) || '-';
        };

        const formatFonteCotacao = (
          cot: ItemPesquisaPrecos['cotacoes'][number],
        ) => {
          if (
            /Fonte de Precos/i.test(`${cot.descricao_fonte} ${cot.observacao}`)
          ) {
            return 'Fonte de Preços';
          }
          const labels: Record<string, string> = {
            PAINEL_DE_PRECOS: 'Compras.gov.br',
            PNCP: 'PNCP',
            CONTRATO_VIGENTE_SISTEMA: 'Contrato vigente',
            MIDIA_ESPECIALIZADA: 'Mídia especializada',
            FORNECEDOR_DIRETO: 'Fornecedor',
            NOTA_FISCAL_ELETRONICA: 'NF-e',
            OUTRA: 'Outra',
          };
          return labels[cot.fonte] || cot.fonte || '-';
        };

        const metodologiaLabel: Record<string, string> = {
          MEDIA: 'Média aritmética',
          MEDIANA: 'Mediana',
          MENOR_VALOR: 'Menor valor',
          OUTRA: 'Outra',
        };

        // ─── CABEÇALHO ────────────────────────────────────────────────────────
        let logoWidth = 0;
        const logoPath = this.resolverLogoPath(orgaoDetalhes?.logo_url);
        if (logoPath && existsSync(logoPath)) {
          try {
            doc.image(logoPath, marginL, 40, {
              fit: [62, 62],
              align: 'center',
              valign: 'center',
            });
            logoWidth = 76;
          } catch (err) {
            this.logger.warn(
              `Nao foi possivel inserir a logo do orgao no PP: ${(err as Error).message}`,
            );
          }
        }

        const cabecalhoX = marginL + logoWidth;
        const cabecalhoW = contentW - logoWidth;
        const nomeOrgao = (
          dados.orgao ||
          orgaoDetalhes?.nome ||
          'ORGAO'
        ).toUpperCase();
        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .fillColor('#111827')
          .text(nomeOrgao, cabecalhoX, 42, {
            width: cabecalhoW,
            align: 'center',
          });
        const endereco = [
          [orgaoDetalhes?.logradouro, orgaoDetalhes?.numero]
            .filter(Boolean)
            .join(', '),
          orgaoDetalhes?.bairro,
          [orgaoDetalhes?.cidade, orgaoDetalhes?.uf]
            .filter(Boolean)
            .join(' - '),
          orgaoDetalhes?.cep ? `CEP ${orgaoDetalhes.cep}` : '',
        ]
          .filter(Boolean)
          .join(' | ');

        if (orgaoDetalhes?.cnpj) {
          doc.moveDown(0.15);
          doc
            .fontSize(8)
            .font('Helvetica')
            .fillColor('#374151')
            .text(`CNPJ: ${orgaoDetalhes.cnpj}`, cabecalhoX, doc.y, {
              width: cabecalhoW,
              align: 'center',
            });
        }
        if (endereco) {
          doc.moveDown(0.15);
          doc
            .fontSize(8)
            .font('Helvetica')
            .fillColor('#374151')
            .text(endereco, cabecalhoX, doc.y, {
              width: cabecalhoW,
              align: 'center',
            });
        }
        if (orgaoDetalhes?.telefone || orgaoDetalhes?.email) {
          doc.moveDown(0.15);
          doc
            .fontSize(8)
            .font('Helvetica')
            .fillColor('#374151')
            .text(
              [orgaoDetalhes.telefone, orgaoDetalhes.email]
                .filter(Boolean)
                .join(' | '),
              cabecalhoX,
              doc.y,
              {
                width: cabecalhoW,
                align: 'center',
              },
            );
        }

        const headerBottom = Math.max(doc.y + 12, 112);
        doc
          .moveTo(marginL, headerBottom)
          .lineTo(pageW - marginR, headerBottom)
          .lineWidth(0.8)
          .stroke('#111827');
        doc.y = headerBottom + 16;

        doc
          .fontSize(15)
          .font('Helvetica-Bold')
          .fillColor('#111827')
          .text('PESQUISA DE PREÇOS', marginL, doc.y, {
            width: contentW,
            align: 'center',
          });
        doc.moveDown(0.25);
        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor('#374151')
          .text(
            'Estimativa do valor da contratação - Art. 23 da Lei 14.133/2021 - IN SEGES/ME 65/2021',
            marginL,
            doc.y,
            {
              width: contentW,
              align: 'center',
            },
          );

        doc.moveDown(0.9);
        const infoY = doc.y;
        const infoColW = contentW / 3;
        const dadosProcesso = [
          ['Processo', dados.numeroProcesso || '-'],
          ['Órgão', dados.orgao || orgaoDetalhes?.nome || '-'],
          ['Data', formatDateBR(dados.dataAssinatura)],
        ];
        for (let i = 0; i < dadosProcesso.length; i++) {
          const x = marginL + i * infoColW;
          doc
            .fontSize(8)
            .font('Helvetica-Bold')
            .fillColor('#374151')
            .text(dadosProcesso[i][0], x, infoY, { width: infoColW - 8 });
          doc
            .fontSize(9)
            .font('Helvetica')
            .fillColor('#111827')
            .text(dadosProcesso[i][1], x, infoY + 12, { width: infoColW - 8 });
        }
        doc.y = infoY + 36;

        const objetoTexto = dados.objeto || licitacao?.objeto || '-';
        const objetoAltura = Math.max(
          52,
          doc.heightOfString(objetoTexto, { width: contentW - 24 }) + 32,
        );
        const objetoY = doc.y;
        doc
          .roundedRect(marginL, objetoY, contentW, objetoAltura, 4)
          .lineWidth(0.5)
          .stroke('#d1d5db');
        doc
          .fontSize(8)
          .font('Helvetica-Bold')
          .fillColor('#374151')
          .text('OBJETO DA LICITAÇÃO', marginL + 12, objetoY + 10, {
            width: contentW - 24,
          });
        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor('#111827')
          .text(objetoTexto, marginL + 12, objetoY + 24, {
            width: contentW - 24,
          });

        doc.y = objetoY + objetoAltura + 16;

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
          doc
            .fontSize(11)
            .font('Helvetica-Bold')
            .fillColor('#1e40af')
            .text(
              `ITEM ${item.item_numero} — ${item.descricao}`,
              marginL,
              doc.y,
              { width: contentW },
            );
          doc.moveDown(0.2);
          doc
            .fontSize(9)
            .font('Helvetica')
            .fillColor('#374151')
            .text(
              `Quantidade: ${item.quantidade} ${item.unidade}`,
              marginL,
              doc.y,
            );
          doc.moveDown(0.4);

          // Tabela de cotações
          if (item.cotacoes && item.cotacoes.length > 0) {
            const colWidths = [25, 90, 250, 58, 72];
            const headers = [
              'Nº',
              'Fonte',
              'Origem / processo / fornecedor',
              'Data',
              'Vl. Unit.',
            ];
            const tableX = marginL;
            let tableY = doc.y;

            // Cabeçalho da tabela
            doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#ffffff');
            doc.rect(tableX, tableY, contentW, 15).fill('#374151');
            let colX = tableX;
            for (let col = 0; col < headers.length; col++) {
              doc
                .fillColor('#ffffff')
                .text(headers[col], colX + 3, tableY + 4, {
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

              // Calcular altura necessária para a linha (origem pode ser longa)
              const origemText = montarOrigemCotacao(cot);
              doc.fontSize(7).font('Helvetica');
              const descH = doc.heightOfString(origemText, {
                width: colWidths[2] - 6,
              });
              const rowH = Math.max(24, Math.min(82, descH + 7));

              if (tableY + rowH > doc.page.height - 60) {
                doc.addPage();
                addPageHeader();
                tableY = 55;
              }

              doc.rect(tableX, tableY, contentW, rowH).fill(rowBg);
              doc
                .moveTo(tableX, tableY)
                .lineTo(tableX + contentW, tableY)
                .lineWidth(0.3)
                .stroke('#e5e7eb');

              colX = tableX;
              const rowData = [
                String(ci + 1),
                formatFonteCotacao(cot),
                origemText,
                formatDateBR(cot.data_pesquisa),
                formatCurrency(cot.valor_unitario || 0),
              ];

              for (let col = 0; col < rowData.length; col++) {
                doc
                  .fontSize(7)
                  .font('Helvetica')
                  .fillColor('#111827')
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
            doc
              .moveTo(tableX, tableY)
              .lineTo(tableX + contentW, tableY)
              .lineWidth(0.3)
              .stroke('#e5e7eb');
            doc.y = tableY + 6;

            const cotacoesComReferencia = item.cotacoes.filter(
              (cot) => cot.url_referencia || cot.documento_comprobatorio_path,
            );
            if (cotacoesComReferencia.length > 0) {
              if (doc.y > doc.page.height - 120) {
                doc.addPage();
                addPageHeader();
                doc.y = 55;
              }

              doc
                .fontSize(8)
                .font('Helvetica-Bold')
                .fillColor('#374151')
                .text(
                  'Referências e comprovantes das cotações',
                  marginL,
                  doc.y,
                  {
                    width: contentW,
                  },
                );
              doc.moveDown(0.2);

              for (const [refIndex, cot] of cotacoesComReferencia.entries()) {
                const originalIndex = item.cotacoes.indexOf(cot) + 1;
                const linhas = [
                  cot.url_referencia ? `URL: ${cot.url_referencia}` : '',
                  cot.documento_comprobatorio_path
                    ? `Comprovante gerado/anexado: ${cot.documento_comprobatorio_path}`
                    : '',
                ].filter(Boolean);
                const textoRef = `${originalIndex}. ${linhas.join(' | ')}`;
                const refH =
                  doc.heightOfString(textoRef, { width: contentW - 10 }) + 4;

                if (doc.y + refH > doc.page.height - 55) {
                  doc.addPage();
                  addPageHeader();
                  doc.y = 55;
                }

                doc
                  .fontSize(7)
                  .font('Helvetica')
                  .fillColor('#374151')
                  .text(textoRef, marginL + 6, doc.y, {
                    width: contentW - 10,
                    link: cot.url_referencia || undefined,
                    underline: Boolean(cot.url_referencia),
                  });
                if (refIndex < cotacoesComReferencia.length - 1) {
                  doc.moveDown(0.1);
                }
              }
              doc.moveDown(0.4);
            }
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
            doc
              .fontSize(7.5)
              .font('Helvetica-Bold')
              .fillColor('#374151')
              .text(statsCols[s][0], sx, statsY, {
                width: statColW,
                align: 'center',
              });
            doc
              .fontSize(8)
              .font('Helvetica')
              .fillColor('#111827')
              .text(statsCols[s][1], sx, statsY + 11, {
                width: statColW,
                align: 'center',
              });
          }
          doc.y = statsY + 26;

          // Alerta de CV elevado
          if ((item.cv_percent || 0) > 25) {
            doc.moveDown(0.2);
            doc
              .fontSize(8)
              .font('Helvetica-Bold')
              .fillColor('#b91c1c')
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
          doc
            .fontSize(9)
            .font('Helvetica-Bold')
            .fillColor('#065f46')
            .text(
              `Valor referencial adotado (${metodologiaLabel[item.metodologia] || item.metodologia}): ` +
                `${formatCurrency(item.valor_referencial)}`,
              marginL,
              doc.y,
              { width: contentW },
            );

          if (item.justificativa_metodologia) {
            doc.moveDown(0.2);
            doc
              .fontSize(8)
              .font('Helvetica')
              .fillColor('#374151')
              .text(
                `Justificativa: ${item.justificativa_metodologia}`,
                marginL,
                doc.y,
                { width: contentW },
              );
          }

          doc.moveDown(0.6);
          doc
            .moveTo(marginL, doc.y)
            .lineTo(pageW - marginR, doc.y)
            .lineWidth(0.5)
            .stroke('#e5e7eb');
          doc.moveDown(0.5);
        }

        // ─── METODOLOGIA GERAL ────────────────────────────────────────────────
        if (doc.y > doc.page.height - 160) {
          doc.addPage();
          addPageHeader();
          doc.y = 55;
        }

        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .fillColor('#111827')
          .text('METODOLOGIA ADOTADA', marginL, doc.y, { width: contentW });
        doc.moveDown(0.3);
        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor('#374151')
          .text(
            `Método: ${metodologiaLabel[dados.metodologia] || dados.metodologia}`,
            marginL,
            doc.y,
            { width: contentW },
          );

        if (dados.justificativaMetodologia) {
          doc.moveDown(0.2);
          doc
            .fontSize(9)
            .font('Helvetica')
            .fillColor('#374151')
            .text(
              `Justificativa: ${dados.justificativaMetodologia}`,
              marginL,
              doc.y,
              { width: contentW },
            );
        }

        // ─── VALOR TOTAL ESTIMADO ─────────────────────────────────────────────
        doc.moveDown(0.8);
        doc
          .moveTo(marginL, doc.y)
          .lineTo(pageW - marginR, doc.y)
          .lineWidth(0.5)
          .stroke('#9ca3af');
        doc.moveDown(0.4);
        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .fillColor('#111827')
          .text(
            `VALOR TOTAL ESTIMADO: ${formatCurrency(dados.valorTotalEstimado)}`,
            marginL,
            doc.y,
            {
              width: contentW,
              align: 'right',
            },
          );

        // ─── RESPONSÁVEL ──────────────────────────────────────────────────────
        doc.moveDown(1);
        doc
          .moveTo(marginL, doc.y)
          .lineTo(pageW - marginR, doc.y)
          .lineWidth(0.5)
          .stroke('#9ca3af');
        doc.moveDown(0.5);
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .fillColor('#111827')
          .text('RESPONSÁVEL PELA PESQUISA', marginL, doc.y, {
            width: contentW,
          });
        doc.moveDown(0.4);

        const resp = dados.responsavel;
        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor('#374151')
          .text(`Nome: ${resp.nome}`, marginL, doc.y, { width: contentW });
        doc.moveDown(0.2);
        doc.text(`Cargo: ${resp.cargo}`, marginL, doc.y, { width: contentW });
        if (resp.matricula) {
          doc.moveDown(0.2);
          doc.text(`Matrícula: ${resp.matricula}`, marginL, doc.y, {
            width: contentW,
          });
        }
        doc.moveDown(0.2);
        doc.text(
          `Data: ${formatDateBR(dados.dataAssinatura)}`,
          marginL,
          doc.y,
          {
            width: contentW,
          },
        );

        // Linha para assinatura
        doc.moveDown(1.5);
        const assinaturaX = marginL + contentW / 2 - 100;
        doc
          .moveTo(assinaturaX, doc.y)
          .lineTo(assinaturaX + 200, doc.y)
          .lineWidth(0.7)
          .stroke('#111827');
        doc.moveDown(0.2);
        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor('#374151')
          .text(resp.nome, assinaturaX, doc.y, { width: 200, align: 'center' });
        doc.moveDown(0.15);
        doc.text(resp.cargo, assinaturaX, doc.y, {
          width: 200,
          align: 'center',
        });

        // ─── QR CODE PÚBLICO ─────────────────────────────────────────────────
        if (doc.y > doc.page.height - 145) {
          doc.addPage();
          addPageHeader();
          doc.y = 55;
        }

        doc.moveDown(1);
        const qrSize = 72;
        const qrY = doc.y;
        const qrX = pageW - marginR - qrSize;
        doc
          .moveTo(marginL, qrY - 6)
          .lineTo(pageW - marginR, qrY - 6)
          .lineWidth(0.5)
          .stroke('#d1d5db');
        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .fillColor('#111827')
          .text('Consulta pública da cotação', marginL, qrY, {
            width: contentW - qrSize - 18,
          });
        doc.moveDown(0.25);
        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor('#374151')
          .text(
            'Aponte a câmera para o QR Code para consultar os dados públicos da pesquisa de preços, itens, fontes, valores e referências.',
            marginL,
            doc.y,
            { width: contentW - qrSize - 18 },
          );
        doc.moveDown(0.2);
        doc
          .fontSize(7)
          .fillColor('#1d4ed8')
          .text(urlPublica, marginL, doc.y, {
            width: contentW - qrSize - 18,
            link: urlPublica,
            underline: true,
          });
        doc.image(qrCodeBuffer, qrX, qrY, { width: qrSize, height: qrSize });
        doc.y = Math.max(doc.y, qrY + qrSize + 6);

        // ─── RODAPÉS ──────────────────────────────────────────────────────────
        const totalPages = doc.bufferedPageRange().count;
        for (let p = 0; p < totalPages; p++) {
          doc.switchToPage(p);
          const footerY = doc.page.height - 30;
          doc
            .moveTo(marginL, footerY - 5)
            .lineTo(pageW - marginR, footerY - 5)
            .lineWidth(0.5)
            .stroke('#d1d5db');
          doc
            .fontSize(7)
            .font('Helvetica')
            .fillColor('#6b7280')
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

  private resolverLogoPath(logoUrl?: string | null): string | null {
    if (!logoUrl || /^https?:\/\//i.test(logoUrl)) {
      return null;
    }

    const caminhoRelativo = logoUrl
      .replace(/^\/api\/uploads\//, '')
      .replace(/^\/uploads\//, '')
      .replace(/^uploads\//, '')
      .replace(/^\/+/, '');

    return caminhoRelativo ? join(this.uploadDir, caminhoRelativo) : null;
  }

  private getFrontendUrl(): string {
    return (
      process.env.FRONTEND_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      'http://localhost:3001'
    ).replace(/\/$/, '');
  }
}

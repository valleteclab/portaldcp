import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import PDFDocument = require('pdfkit');

import { DocumentoFaseInterna, TipoDocumentoFaseInterna } from './entities/documento-fase-interna.entity';
import { AcaoLogFaseInterna } from './entities/log-fase-interna.entity';
import { AuditLogService, ContextoUsuario } from './audit-log.service';
import { ModeloDocumentoService } from './modelo-documento.service';

import { EtpDados } from './types/etp-dados.type';
import { TrDados } from './types/tr-dados.type';
import { PesquisaPrecosDados, calcularEstatisticasItem, ItemPesquisaPrecos } from './types/pesquisa-precos.type';
import { MatrizRiscosDados, calcularGrauRisco, RiscoIdentificado } from './types/matriz-riscos.type';

/**
 * Serviço de geração de documentos da Fase Interna em PDF e DOCX.
 *
 * Bibliotecas detectadas em backend/package.json: pdfkit, pdfmake, jspdf, pdf-lib.
 * Não há biblioteca docx (.docx via OOXML) instalada.
 *
 * Estratégia atual:
 *  - PDF: gerado via pdfkit a partir de uma representação HTML "lógica" pré-renderizada
 *    (o HTML é construído internamente para reutilização e estruturação por seções).
 *  - DOCX: NÃO há biblioteca `docx`/`docxtemplater` instalada. Como fallback (sem fazer
 *    `npm install`, conforme orientação), o método `gerarDocx` salva um arquivo `.html`
 *    com layout estilizado que pode ser aberto/importado pelo Word/LibreOffice.
 *    TODO(infra): instalar a lib `docx` (https://docx.js.org) para gerar OOXML real.
 */
@Injectable()
export class GeradorDocumentoService {
  private readonly logger = new Logger(GeradorDocumentoService.name);
  private readonly UPLOAD_BASE = path.resolve(process.cwd(), 'uploads', 'fase-interna');

  constructor(
    @InjectRepository(DocumentoFaseInterna)
    private readonly docRepo: Repository<DocumentoFaseInterna>,
    private readonly auditLog: AuditLogService,
    private readonly modeloDocumentoService: ModeloDocumentoService,
  ) {}

  /**
   * Cabeçalho/rodapé do PDF conforme o MODELO configurado pelo órgão em
   * Configurações → Modelos de documento (fallback: modelo padrão do
   * sistema; último recurso: identificação real do órgão — nunca mais o
   * placeholder genérico). Variáveis {{...}} são substituídas.
   */
  private async resolverEstiloDocumento(doc: DocumentoFaseInterna): Promise<{
    cabecalhoLinhas: string[];
    rodapeTexto: string | null;
  }> {
    const lic: any = (doc as any).licitacao || {};
    const orgao: any = lic.orgao || {};
    const stripHtml = (html: string) =>
      html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6])>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim();
    const vars: Record<string, string> = {
      orgao_nome: orgao.nome || 'Órgão',
      orgao_cnpj: orgao.cnpj || '',
      numero_processo: lic.numero_processo || doc.licitacao_id,
      numero_edital: lic.numero_edital || '',
      documento_titulo: doc.titulo || doc.tipo,
      data: new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    };
    const aplicarVars = (texto: string) =>
      texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? '');

    try {
      const modelo = await this.modeloDocumentoService.resolverModelo(
        lic.orgao_id || null,
        doc.tipo,
      );
      const cabecalho = modelo?.cabecalho_html ? aplicarVars(stripHtml(modelo.cabecalho_html)) : '';
      const rodape = modelo?.rodape_html ? aplicarVars(stripHtml(modelo.rodape_html)) : null;
      const cabecalhoLinhas = cabecalho
        ? cabecalho.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3)
        : [];
      if (cabecalhoLinhas.length > 0 || rodape) {
        return {
          cabecalhoLinhas:
            cabecalhoLinhas.length > 0
              ? cabecalhoLinhas
              : [vars.orgao_nome, `Processo nº ${vars.numero_processo}`],
          rodapeTexto: rodape,
        };
      }
    } catch (e: any) {
      this.logger.warn(`Modelo de documento não resolvido (${doc.tipo}): ${e.message}`);
    }
    // Fallback: identificação REAL do órgão
    return {
      cabecalhoLinhas: [vars.orgao_nome, `Processo nº ${vars.numero_processo}`],
      rodapeTexto: null,
    };
  }

  // ============================================================================
  // API PÚBLICA
  // ============================================================================

  async gerarPdf(
    documentoId: string,
    contexto?: ContextoUsuario,
  ): Promise<{ caminho: string; hash: string }> {
    const documento = await this.carregarDocumento(documentoId);
    const licitacaoNumero = await this.resolverNumeroLicitacao(documento);

    const dir = path.join(this.UPLOAD_BASE, documento.licitacao_id);
    await fs.promises.mkdir(dir, { recursive: true });
    const caminho = path.join(dir, `${documento.id}.pdf`);

    const html = this.renderPorTipo(documento, licitacaoNumero);
    const estilo = await this.resolverEstiloDocumento(documento);
    await this.escreverPdf(caminho, documento, licitacaoNumero, html, estilo);

    const hash = await this.calcularHashArquivo(caminho);
    documento.arquivo_pdf_path = caminho;
    documento.data_geracao_arquivo = new Date();
    documento.hash_arquivo = hash;
    await this.docRepo.save(documento);

    await this.auditLog.log({
      licitacao_id: documento.licitacao_id,
      documento_id: documento.id,
      acao: AcaoLogFaseInterna.PDF_GERADO,
      descricao: `PDF gerado para documento ${documento.tipo} — ${documento.titulo}`,
      dados_depois: { caminho, hash },
      contexto,
    });

    return { caminho, hash };
  }

  async gerarDocx(
    documentoId: string,
    contexto?: ContextoUsuario,
  ): Promise<{ caminho: string; hash: string }> {
    const documento = await this.carregarDocumento(documentoId);
    const licitacaoNumero = await this.resolverNumeroLicitacao(documento);

    const dir = path.join(this.UPLOAD_BASE, documento.licitacao_id);
    await fs.promises.mkdir(dir, { recursive: true });

    // TODO(infra): trocar por docx.Packer.toBuffer quando a lib `docx` for instalada.
    // Hoje, sem docx instalado, salvamos HTML estilizado (compatível com import no Word/LibreOffice).
    this.logger.warn(
      'Biblioteca DOCX (OOXML) não instalada — salvando documento como .html estilizado em substituição. TODO: instalar `docx` para OOXML real.',
    );

    const html = this.documentoHtmlCompleto(documento, licitacaoNumero);
    const caminho = path.join(dir, `${documento.id}.html`);
    await fs.promises.writeFile(caminho, html, 'utf8');

    const hash = await this.calcularHashArquivo(caminho);
    documento.arquivo_docx_path = caminho;
    documento.data_geracao_arquivo = new Date();
    documento.hash_arquivo = hash;
    await this.docRepo.save(documento);

    await this.auditLog.log({
      licitacao_id: documento.licitacao_id,
      documento_id: documento.id,
      acao: AcaoLogFaseInterna.DOCX_GERADO,
      descricao: `DOCX (HTML fallback) gerado para documento ${documento.tipo} — ${documento.titulo}`,
      dados_depois: { caminho, hash, formato_real: 'html' },
      contexto,
    });

    return { caminho, hash };
  }

  // ============================================================================
  // INFRA — leitura, hash, escrita PDF
  // ============================================================================

  private async carregarDocumento(documentoId: string): Promise<DocumentoFaseInterna> {
    const doc = await this.docRepo.findOne({
      where: { id: documentoId },
      relations: ['licitacao', 'licitacao.orgao'],
    });
    if (!doc) throw new NotFoundException(`Documento ${documentoId} não encontrado`);
    return doc;
  }

  private async resolverNumeroLicitacao(doc: DocumentoFaseInterna): Promise<string> {
    const lic: any = (doc as any).licitacao;
    if (!lic) return doc.licitacao_id;
    return (
      lic.numero_edital ||
      lic.numero_processo ||
      lic.numero_controle_pncp ||
      doc.licitacao_id
    );
  }

  private async calcularHashArquivo(caminho: string): Promise<string> {
    const buf = await fs.promises.readFile(caminho);
    return crypto.createHash('sha256').update(buf).digest('hex');
  }

  /**
   * Escreve um PDF estruturado a partir do HTML lógico.
   * Como pdfkit não renderiza HTML diretamente, convertemos as marcas
   * intermediárias (h1, h2, p, table, ...) em comandos pdfkit.
   */
  private async escreverPdf(
    caminho: string,
    documento: DocumentoFaseInterna,
    licitacaoNumero: string,
    htmlConteudo: string,
    estilo?: { cabecalhoLinhas: string[]; rodapeTexto: string | null },
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const pdf = new PDFDocument({
          size: 'A4',
          margins: { top: 70, bottom: 60, left: 60, right: 60 },
          info: {
            Title: documento.titulo,
            Author: 'Portal DCP',
            Subject: `Documento da Fase Interna — ${documento.tipo}`,
            Keywords: 'Lei 14.133/2021, Fase Interna, Licitação',
          },
        });

        const stream = fs.createWriteStream(caminho);
        pdf.pipe(stream);

        // Cabeçalho institucional + rodapé em todas as páginas — seguem o
        // MODELO configurado pelo órgão (Configurações → Modelos de documento)
        const linhasCabecalho =
          estilo?.cabecalhoLinhas?.length
            ? estilo.cabecalhoLinhas
            : ['Documento da Fase Interna', `Licitação nº ${licitacaoNumero}`];
        const desenharCabecalhoRodape = () => {
          const original = (pdf as any).page;
          // Cabeçalho
          pdf.save();
          pdf
            .fontSize(9)
            .fillColor('#444')
            .font('Times-Bold')
            .text(linhasCabecalho[0], 60, 30, { align: 'left' });
          pdf.font('Times-Roman').fontSize(8).fillColor('#666');
          let yCab = 44;
          for (const linha of linhasCabecalho.slice(1)) {
            pdf.text(linha, 60, yCab, { align: 'left' });
            yCab += 12;
          }
          pdf
            .moveTo(60, original.height - 70)
            .lineTo(original.width - 60, original.height - 70)
            .strokeColor('#999')
            .lineWidth(0.5)
            .stroke();
          pdf.restore();

          // Rodapé
          const rodapeY = original.height - 50;
          pdf.save();
          pdf
            .fontSize(8)
            .fillColor('#666')
            .font('Times-Italic')
            .text(
              estilo?.rodapeTexto ||
                `Gerado em ${new Date().toLocaleString('pt-BR')} — Fundamento: Lei nº 14.133/2021`,
              60,
              rodapeY,
              { align: 'left', width: original.width - 120 },
            );
          pdf
            .font('Times-Roman')
            .text(`Página ${(pdf as any).bufferedPageRange().count}`, 60, rodapeY, {
              align: 'right',
              width: original.width - 120,
            });
          pdf.restore();
        };

        pdf.on('pageAdded', desenharCabecalhoRodape);
        // Primeira página
        desenharCabecalhoRodape();

        // Cabeçalho do documento
        pdf
          .moveDown(1)
          .font('Times-Bold')
          .fontSize(16)
          .fillColor('#000')
          .text(documento.titulo, { align: 'center' });
        pdf
          .moveDown(0.3)
          .font('Times-Italic')
          .fontSize(10)
          .fillColor('#555')
          .text(this.tipoDescricao(documento.tipo), { align: 'center' });
        pdf
          .moveDown(0.2)
          .font('Times-Roman')
          .fontSize(9)
          .fillColor('#777')
          .text(`Licitação: ${licitacaoNumero}`, { align: 'center' });
        pdf.moveDown(1);

        // Render do conteúdo (token-based — simplificação de HTML)
        this.renderTokensNoPdf(pdf, htmlConteudo);

        pdf.end();
        stream.on('finish', () => resolve());
        stream.on('error', reject);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Renderiza um HTML simplificado (apenas tags suportadas) em comandos pdfkit.
   * Tags suportadas: <h1>, <h2>, <h3>, <p>, <strong>, <em>, <ul>, <li>, <table>,
   * <thead>, <tbody>, <tr>, <th>, <td>, <hr>, <span class="...">.
   */
  private renderTokensNoPdf(pdf: PDFKit.PDFDocument, html: string): void {
    // Parser muito simples: divide por blocos top-level com regex.
    const blocos = this.splitBlocos(html);

    for (const bloco of blocos) {
      const tag = bloco.tag;
      const conteudo = bloco.conteudo;
      const attrs = bloco.attrs || '';

      if (tag === 'h1') {
        pdf
          .moveDown(0.6)
          .font('Times-Bold')
          .fontSize(14)
          .fillColor('#000')
          .text(this.stripTags(conteudo));
        pdf.moveDown(0.2);
      } else if (tag === 'h2') {
        pdf
          .moveDown(0.5)
          .font('Times-Bold')
          .fontSize(12)
          .fillColor('#1a3a6c')
          .text(this.stripTags(conteudo));
        pdf.moveDown(0.15);
      } else if (tag === 'h3') {
        pdf
          .moveDown(0.4)
          .font('Times-Bold')
          .fontSize(11)
          .fillColor('#333')
          .text(this.stripTags(conteudo));
        pdf.moveDown(0.1);
      } else if (tag === 'p') {
        pdf
          .font('Times-Roman')
          .fontSize(10.5)
          .fillColor('#000')
          .text(this.stripTags(conteudo), { align: 'justify', lineGap: 2 });
        pdf.moveDown(0.4);
      } else if (tag === 'ul') {
        const itens = (conteudo.match(/<li[^>]*>([\s\S]*?)<\/li>/g) || []).map(li =>
          this.stripTags(li.replace(/<\/?li[^>]*>/g, '')),
        );
        pdf.font('Times-Roman').fontSize(10.5).fillColor('#000');
        for (const it of itens) {
          pdf.text(`• ${it}`, { indent: 12, align: 'justify', lineGap: 2 });
        }
        pdf.moveDown(0.3);
      } else if (tag === 'hr') {
        const y = pdf.y + 4;
        const w = (pdf as any).page.width - 120;
        pdf.moveTo(60, y).lineTo(60 + w, y).strokeColor('#bbb').lineWidth(0.5).stroke();
        pdf.moveDown(0.5);
      } else if (tag === 'table') {
        this.renderTabelaNoPdf(pdf, conteudo, attrs);
      } else if (tag === 'div') {
        // recursão simples
        this.renderTokensNoPdf(pdf, conteudo);
      } else {
        // texto solto
        const texto = this.stripTags(bloco.raw);
        if (texto.trim().length) {
          pdf.font('Times-Roman').fontSize(10.5).fillColor('#000').text(texto, { align: 'justify' });
          pdf.moveDown(0.3);
        }
      }
    }
  }

  private splitBlocos(html: string): Array<{ tag: string; attrs?: string; conteudo: string; raw: string }> {
    const out: Array<{ tag: string; attrs?: string; conteudo: string; raw: string }> = [];
    const re = /<(h1|h2|h3|p|ul|table|hr|div)([^>]*)\s*\/?>([\s\S]*?)<\/\1>|<(hr)\s*\/?>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      if (m[4]) {
        out.push({ tag: 'hr', conteudo: '', raw: m[0] });
      } else {
        out.push({ tag: m[1].toLowerCase(), attrs: m[2], conteudo: m[3], raw: m[0] });
      }
    }
    return out;
  }

  private stripTags(s: string): string {
    return (s || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|h[1-3])>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  /**
   * Renderiza uma <table> rudimentar com <thead>/<tbody>/<tr>/<th>/<td>.
   * Suporta atributo class="risco-BAIXO|MEDIO|ALTO" em <tr> para colorir.
   */
  private renderTabelaNoPdf(pdf: PDFKit.PDFDocument, html: string, _attrs?: string): void {
    const linhas: Array<{ celulas: string[]; header: boolean; bg?: string }> = [];

    const headerMatch = /<thead[^>]*>([\s\S]*?)<\/thead>/i.exec(html);
    if (headerMatch) {
      const trs = headerMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
      for (const tr of trs) {
        const ths = (tr.match(/<th[^>]*>([\s\S]*?)<\/th>/gi) || []).map(th =>
          this.stripTags(th.replace(/<\/?th[^>]*>/g, '')),
        );
        if (ths.length) linhas.push({ celulas: ths, header: true });
      }
    }

    const bodyMatch = /<tbody[^>]*>([\s\S]*?)<\/tbody>/i.exec(html) || [null, html];
    const corpo = bodyMatch[1] || '';
    const trs = corpo.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    for (const tr of trs) {
      const classMatch = /class\s*=\s*"([^"]*)"/i.exec(tr);
      let bg: string | undefined;
      if (classMatch) {
        if (/risco-ALTO/.test(classMatch[1])) bg = '#fde0e0';
        else if (/risco-MEDIO/.test(classMatch[1])) bg = '#fff5cc';
        else if (/risco-BAIXO/.test(classMatch[1])) bg = '#dff5e1';
      }
      const tds = (tr.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || []).map(td =>
        this.stripTags(td.replace(/<\/?t[dh][^>]*>/g, '')),
      );
      if (tds.length) linhas.push({ celulas: tds, header: false, bg });
    }

    if (!linhas.length) return;

    const startX = 60;
    const pageWidth = (pdf as any).page.width;
    const totalWidth = pageWidth - 120;
    const numCols = linhas[0].celulas.length;
    const colW = totalWidth / numCols;
    const padding = 4;

    pdf.moveDown(0.3);

    for (const linha of linhas) {
      // Quebra de página se necessário
      const altura = this.estimarAlturaLinha(pdf, linha.celulas, colW, padding, linha.header);
      if (pdf.y + altura > (pdf as any).page.height - 80) {
        pdf.addPage();
      }

      const yIni = pdf.y;
      // Fundo
      if (linha.header) {
        pdf.save().rect(startX, yIni, totalWidth, altura).fill('#1a3a6c').restore();
      } else if (linha.bg) {
        pdf.save().rect(startX, yIni, totalWidth, altura).fill(linha.bg).restore();
      }

      // Bordas + texto
      for (let i = 0; i < numCols; i++) {
        const x = startX + i * colW;
        pdf.save();
        pdf.rect(x, yIni, colW, altura).strokeColor('#888').lineWidth(0.4).stroke();
        pdf
          .fillColor(linha.header ? '#fff' : '#000')
          .font(linha.header ? 'Times-Bold' : 'Times-Roman')
          .fontSize(linha.header ? 9.5 : 9)
          .text(linha.celulas[i] ?? '', x + padding, yIni + padding, {
            width: colW - 2 * padding,
            height: altura - 2 * padding,
            align: linha.header ? 'center' : 'left',
          });
        pdf.restore();
      }
      pdf.y = yIni + altura;
    }
    pdf.moveDown(0.5);
  }

  private estimarAlturaLinha(
    pdf: PDFKit.PDFDocument,
    celulas: string[],
    colW: number,
    padding: number,
    header: boolean,
  ): number {
    let max = 0;
    pdf.font(header ? 'Times-Bold' : 'Times-Roman').fontSize(header ? 9.5 : 9);
    for (const c of celulas) {
      const h = pdf.heightOfString(c || ' ', { width: colW - 2 * padding });
      if (h > max) max = h;
    }
    return max + 2 * padding;
  }

  // ============================================================================
  // RENDERIZADORES (HTML lógico) — cada tipo de documento
  // ============================================================================

  private renderPorTipo(documento: DocumentoFaseInterna, licitacaoNumero: string): string {
    const dados = documento.dados_estruturados || {};
    switch (documento.tipo) {
      case TipoDocumentoFaseInterna.ESTUDO_TECNICO_PRELIMINAR:
        return this.renderEtp(dados as EtpDados, licitacaoNumero);
      case TipoDocumentoFaseInterna.TERMO_REFERENCIA:
        return this.renderTr(dados as TrDados, licitacaoNumero);
      case TipoDocumentoFaseInterna.PESQUISA_PRECOS:
      case TipoDocumentoFaseInterna.MAPA_COMPARATIVO_PRECOS:
        return this.renderPesquisaPrecos(dados as PesquisaPrecosDados, licitacaoNumero);
      case TipoDocumentoFaseInterna.ANALISE_RISCOS:
        return this.renderMatrizRiscos(dados as MatrizRiscosDados, licitacaoNumero);
      default:
        return this.renderGenerico(documento);
    }
  }

  private tipoDescricao(tipo: TipoDocumentoFaseInterna): string {
    const map: Partial<Record<TipoDocumentoFaseInterna, string>> = {
      [TipoDocumentoFaseInterna.ESTUDO_TECNICO_PRELIMINAR]:
        'Estudo Técnico Preliminar — Art. 18, §1º da Lei nº 14.133/2021',
      [TipoDocumentoFaseInterna.TERMO_REFERENCIA]:
        'Termo de Referência — Art. 6º, XXIII da Lei nº 14.133/2021',
      [TipoDocumentoFaseInterna.PESQUISA_PRECOS]:
        'Pesquisa de Preços — Art. 23 da Lei nº 14.133/2021',
      [TipoDocumentoFaseInterna.MAPA_COMPARATIVO_PRECOS]:
        'Mapa Comparativo de Preços — Art. 23 da Lei nº 14.133/2021',
      [TipoDocumentoFaseInterna.ANALISE_RISCOS]:
        'Matriz de Riscos — Art. 18, X e Art. 22 da Lei nº 14.133/2021',
    };
    return map[tipo] ?? `Documento ${tipo} — Lei nº 14.133/2021`;
  }

  // ----------------------- ETP -----------------------
  private renderEtp(d: EtpDados, licitacaoNumero: string): string {
    const safe = (s?: string) => this.escapeHtml(s ?? '—');
    const moeda = (n?: number) => this.fmtMoeda(n ?? 0);

    const incisos: Array<{ num: string; titulo: string; corpo: string }> = [
      {
        num: 'I',
        titulo: 'Descrição da necessidade da contratação',
        corpo: `<p>${safe(d.descricao_necessidade)}</p>`,
      },
      {
        num: 'II',
        titulo: 'Previsão no Plano de Contratações Anual (PCA)',
        corpo:
          d.previsao_pca?.consta_no_pca
            ? `<p>Contratação <strong>consta</strong> no PCA${d.previsao_pca?.pca_id ? ' (PCA ' + safe(d.previsao_pca.pca_id) + ')' : ''}${d.previsao_pca?.item_pca ? ', item ' + safe(d.previsao_pca.item_pca) : ''}.</p>`
            : `<p>Contratação <strong>não consta</strong> no PCA. Justificativa: ${safe(d.previsao_pca?.justificativa_se_nao)}</p>`,
      },
      {
        num: 'III',
        titulo: 'Requisitos da contratação',
        corpo: `<p>${safe(d.requisitos_contratacao)}</p>`,
      },
      {
        num: 'IV',
        titulo: 'Estimativa das quantidades — memória de cálculo',
        corpo:
          `<p><strong>Descrição:</strong> ${safe(d.estimativas_quantidades?.descricao)}</p>` +
          `<p><strong>Memória de cálculo:</strong> ${safe(d.estimativas_quantidades?.memoria_calculo)}</p>` +
          (d.estimativas_quantidades?.documentos_suporte?.length
            ? `<p><strong>Documentos de suporte:</strong></p><ul>${d.estimativas_quantidades.documentos_suporte.map(x => `<li>${safe(x)}</li>`).join('')}</ul>`
            : ''),
      },
      {
        num: 'V',
        titulo: 'Levantamento de mercado',
        corpo:
          (d.levantamento_mercado?.alternativas_analisadas?.length
            ? `<p><strong>Alternativas analisadas:</strong></p><ul>${d.levantamento_mercado.alternativas_analisadas
                .map(
                  a =>
                    `<li><strong>${safe(a.descricao)}</strong> — Vantagens: ${safe(a.vantagens)}; Desvantagens: ${safe(a.desvantagens)}</li>`,
                )
                .join('')}</ul>`
            : '') +
          `<p><strong>Solução escolhida:</strong> ${safe(d.levantamento_mercado?.solucao_escolhida)}</p>` +
          `<p><strong>Justificativa técnica:</strong> ${safe(d.levantamento_mercado?.justificativa_tecnica)}</p>` +
          `<p><strong>Justificativa econômica:</strong> ${safe(d.levantamento_mercado?.justificativa_economica)}</p>`,
      },
      {
        num: 'VI',
        titulo: 'Estimativa do valor da contratação',
        corpo:
          `<p><strong>Valor total estimado:</strong> ${moeda(d.estimativa_valor?.valor_total)}</p>` +
          `<p><strong>Método de cálculo:</strong> ${safe(d.estimativa_valor?.metodo_calculo)}</p>` +
          (d.estimativa_valor?.referencia_pesquisa_id
            ? `<p><strong>Pesquisa de preços de referência:</strong> ${safe(d.estimativa_valor.referencia_pesquisa_id)}</p>`
            : ''),
      },
      {
        num: 'VII',
        titulo: 'Descrição da solução como um todo',
        corpo: `<p>${safe(d.descricao_solucao)}</p>`,
      },
      {
        num: 'VIII',
        titulo: 'Justificativa do parcelamento',
        corpo:
          `<p><strong>Tipo:</strong> ${safe(d.justificativa_parcelamento?.tipo)}</p>` +
          `<p>${safe(d.justificativa_parcelamento?.justificativa)}</p>`,
      },
      {
        num: 'IX',
        titulo: 'Resultados pretendidos',
        corpo: `<p>${safe(d.resultados_pretendidos)}</p>`,
      },
      {
        num: 'X',
        titulo: 'Providências prévias à celebração do contrato',
        corpo: `<p>${safe(d.providencias_previas)}</p>`,
      },
      {
        num: 'XI',
        titulo: 'Contratações correlatas e/ou interdependentes',
        corpo: d.contratacoes_correlatas?.length
          ? `<ul>${d.contratacoes_correlatas
              .map(
                c =>
                  `<li><strong>${safe(c.tipo_relacao)}</strong>${c.numero_processo ? ' — Proc. ' + safe(c.numero_processo) : ''}: ${safe(c.descricao)}</li>`,
              )
              .join('')}</ul>`
          : '<p>Não há contratações correlatas identificadas.</p>',
      },
      {
        num: 'XII',
        titulo: 'Impactos ambientais e medidas mitigadoras',
        corpo: d.impactos_ambientais?.aplicavel
          ? `<p><strong>Impactos identificados:</strong> ${safe(d.impactos_ambientais.impactos_identificados)}</p>` +
            `<p><strong>Medidas mitigadoras:</strong> ${safe(d.impactos_ambientais.medidas_mitigadoras)}</p>` +
            (d.impactos_ambientais.criterios_sustentabilidade
              ? `<p><strong>Critérios de sustentabilidade:</strong> ${safe(d.impactos_ambientais.criterios_sustentabilidade)}</p>`
              : '')
          : '<p>Não aplicável à presente contratação.</p>',
      },
      {
        num: 'XIII',
        titulo: 'Posicionamento conclusivo sobre a viabilidade',
        corpo:
          `<p><strong>Contratação ${d.posicionamento_conclusivo?.contratacao_viavel ? 'VIÁVEL' : 'NÃO VIÁVEL'}.</strong></p>` +
          `<p>${safe(d.posicionamento_conclusivo?.justificativa)}</p>` +
          (d.posicionamento_conclusivo?.recomendacoes
            ? `<p><strong>Recomendações:</strong> ${safe(d.posicionamento_conclusivo.recomendacoes)}</p>`
            : ''),
      },
    ];

    let html = `<h1>Estudo Técnico Preliminar (ETP)</h1>`;
    html += `<p><em>Documento elaborado nos termos do Art. 18, §1º da Lei nº 14.133/2021, contemplando os 13 incisos obrigatórios.</em></p>`;
    html += `<p><strong>Licitação:</strong> ${this.escapeHtml(licitacaoNumero)}</p><hr/>`;

    for (const inc of incisos) {
      html += `<h2>${inc.num} — ${this.escapeHtml(inc.titulo)}</h2>${inc.corpo}`;
    }

    if (d.responsavel_elaboracao) {
      html += `<hr/><h3>Responsável pela elaboração</h3>`;
      html += `<p>${this.escapeHtml(d.responsavel_elaboracao.nome)} — ${this.escapeHtml(d.responsavel_elaboracao.cargo)}${d.responsavel_elaboracao.matricula ? ' (matr. ' + this.escapeHtml(d.responsavel_elaboracao.matricula) + ')' : ''}</p>`;
    }

    return html;
  }

  // ----------------------- TR -----------------------
  private renderTr(d: TrDados, licitacaoNumero: string): string {
    const safe = (s?: string) => this.escapeHtml(s ?? '—');
    const moeda = (n?: number) => this.fmtMoeda(n ?? 0);

    const elementos: Array<{ letra: string; titulo: string; corpo: string }> = [
      {
        letra: 'a',
        titulo: 'Definição do objeto',
        corpo:
          `<p><strong>Natureza:</strong> ${safe(d.definicao_objeto?.natureza)}</p>` +
          `<p><strong>Descrição detalhada:</strong> ${safe(d.definicao_objeto?.descricao_detalhada)}</p>` +
          `<p><strong>Prazo do contrato:</strong> ${d.definicao_objeto?.prazo_contrato_meses ?? '—'} meses</p>` +
          `<p><strong>Permite prorrogação:</strong> ${d.definicao_objeto?.permite_prorrogacao ? 'Sim' : 'Não'}${d.definicao_objeto?.limite_prorrogacao ? ' — ' + safe(d.definicao_objeto.limite_prorrogacao) : ''}</p>`,
      },
      {
        letra: 'b',
        titulo: 'Fundamentação da contratação',
        corpo: `<p>${safe(d.fundamentacao_contratacao)}</p>`,
      },
      {
        letra: 'c',
        titulo: 'Descrição da solução (ciclo de vida)',
        corpo: `<p>${safe(d.descricao_solucao)}</p>`,
      },
      {
        letra: 'd',
        titulo: 'Requisitos da contratação',
        corpo:
          `<p><strong>Gerais:</strong> ${safe(d.requisitos_contratacao?.requisitos_gerais)}</p>` +
          (d.requisitos_contratacao?.sustentabilidade
            ? `<p><strong>Sustentabilidade:</strong> ${safe(d.requisitos_contratacao.sustentabilidade)}</p>`
            : '') +
          (d.requisitos_contratacao?.acessibilidade
            ? `<p><strong>Acessibilidade:</strong> ${safe(d.requisitos_contratacao.acessibilidade)}</p>`
            : '') +
          (d.requisitos_contratacao?.seguranca
            ? `<p><strong>Segurança:</strong> ${safe(d.requisitos_contratacao.seguranca)}</p>`
            : ''),
      },
      {
        letra: 'e',
        titulo: 'Modelo de execução do objeto',
        corpo: `<p>${safe(d.modelo_execucao)}</p>`,
      },
      {
        letra: 'f',
        titulo: 'Modelo de gestão do contrato',
        corpo:
          `<p>${safe(d.modelo_gestao?.descricao)}</p>` +
          (d.modelo_gestao?.fiscal_titular
            ? `<p><strong>Fiscal titular:</strong> ${safe(d.modelo_gestao.fiscal_titular)}</p>`
            : '') +
          (d.modelo_gestao?.fiscal_substituto
            ? `<p><strong>Fiscal substituto:</strong> ${safe(d.modelo_gestao.fiscal_substituto)}</p>`
            : '') +
          (d.modelo_gestao?.gestor_contrato
            ? `<p><strong>Gestor do contrato:</strong> ${safe(d.modelo_gestao.gestor_contrato)}</p>`
            : ''),
      },
      {
        letra: 'g',
        titulo: 'Critérios de medição e pagamento',
        corpo:
          `<p><strong>Forma de medição:</strong> ${safe(d.criterios_medicao_pagamento?.forma_medicao)}</p>` +
          `<p><strong>Periodicidade:</strong> ${safe(d.criterios_medicao_pagamento?.periodicidade)}</p>` +
          `<p><strong>Forma de pagamento:</strong> ${safe(d.criterios_medicao_pagamento?.forma_pagamento)}</p>` +
          `<p><strong>Prazo de pagamento:</strong> ${d.criterios_medicao_pagamento?.prazo_pagamento_dias ?? '—'} dias</p>` +
          (d.criterios_medicao_pagamento?.instrumento_medicao
            ? `<p><strong>Instrumento:</strong> ${safe(d.criterios_medicao_pagamento.instrumento_medicao)}</p>`
            : ''),
      },
      {
        letra: 'h',
        titulo: 'Forma e critérios de seleção do fornecedor',
        corpo:
          `<p><strong>Modalidade:</strong> ${safe(d.forma_criterios_selecao?.modalidade)}</p>` +
          `<p><strong>Critério de julgamento:</strong> ${safe(d.forma_criterios_selecao?.criterio_julgamento)}</p>` +
          `<p><strong>Modo de disputa:</strong> ${safe(d.forma_criterios_selecao?.modo_disputa)}</p>` +
          this.renderHabilitacao(d.forma_criterios_selecao?.requisitos_habilitacao),
      },
      {
        letra: 'i',
        titulo: 'Estimativa do valor da contratação',
        corpo:
          `<p><strong>Valor total estimado:</strong> ${moeda(d.estimativas_valor?.valor_total)}</p>` +
          (d.estimativas_valor?.valor_unitario_medio
            ? `<p><strong>Valor unitário médio:</strong> ${moeda(d.estimativas_valor.valor_unitario_medio)}</p>`
            : '') +
          `<p><strong>Sigilo do orçamento:</strong> ${d.estimativas_valor?.sigilo_orcamento ? 'Sim' : 'Não'}</p>` +
          (d.estimativas_valor?.justificativa_sigilo
            ? `<p><strong>Justificativa do sigilo:</strong> ${safe(d.estimativas_valor.justificativa_sigilo)}</p>`
            : ''),
      },
      {
        letra: 'j',
        titulo: 'Adequação orçamentária',
        corpo:
          `<p><strong>Fonte de recurso:</strong> ${safe(d.adequacao_orcamentaria?.fonte_recurso)}</p>` +
          `<p><strong>Elemento de despesa:</strong> ${safe(d.adequacao_orcamentaria?.elemento_despesa)}</p>` +
          `<p><strong>Dotação orçamentária:</strong> ${safe(d.adequacao_orcamentaria?.dotacao_orcamentaria)}</p>` +
          `<p><strong>Exercício financeiro:</strong> ${d.adequacao_orcamentaria?.exercicio_financeiro ?? '—'}</p>`,
      },
      {
        letra: 'k',
        titulo: 'Quantitativos / Itens',
        corpo: this.renderQuantitativosTr(d.quantitativos),
      },
    ];

    let html = `<h1>Termo de Referência (TR)</h1>`;
    html += `<p><em>Documento elaborado nos termos do Art. 6º, XXIII da Lei nº 14.133/2021.</em></p>`;
    html += `<p><strong>Licitação:</strong> ${this.escapeHtml(licitacaoNumero)}</p><hr/>`;

    for (const e of elementos) {
      html += `<h2>${e.letra}) ${this.escapeHtml(e.titulo)}</h2>${e.corpo}`;
    }

    if (d.responsavel_elaboracao) {
      html += `<hr/><h3>Responsável pela elaboração</h3>`;
      html += `<p>${this.escapeHtml(d.responsavel_elaboracao.nome)} — ${this.escapeHtml(d.responsavel_elaboracao.cargo)}${d.responsavel_elaboracao.matricula ? ' (matr. ' + this.escapeHtml(d.responsavel_elaboracao.matricula) + ')' : ''}</p>`;
    }

    return html;
  }

  private renderHabilitacao(req?: TrDados['forma_criterios_selecao']['requisitos_habilitacao']): string {
    if (!req) return '';
    const bloco = (titulo: string, lista?: string[]) =>
      lista && lista.length
        ? `<p><strong>${titulo}:</strong></p><ul>${lista.map(x => `<li>${this.escapeHtml(x)}</li>`).join('')}</ul>`
        : '';
    return (
      bloco('Habilitação jurídica', req.juridica) +
      bloco('Regularidade fiscal e trabalhista', req.fiscal_trabalhista) +
      bloco('Qualificação técnica', req.tecnica) +
      bloco('Qualificação econômico-financeira', req.economica_financeira)
    );
  }

  private renderQuantitativosTr(itens?: TrDados['quantitativos']): string {
    if (!itens || !itens.length) return '<p>Sem itens informados.</p>';
    let h = `<table><thead><tr><th>Item</th><th>Descrição</th><th>Qtd.</th><th>Unid.</th><th>Vlr. Unit. Estimado</th></tr></thead><tbody>`;
    for (const it of itens) {
      h += `<tr><td>${it.item_numero}</td><td>${this.escapeHtml(it.descricao)}</td><td>${it.quantidade}</td><td>${this.escapeHtml(it.unidade)}</td><td>${it.valor_unitario_estimado != null ? this.fmtMoeda(it.valor_unitario_estimado) : '—'}</td></tr>`;
    }
    h += `</tbody></table>`;
    return h;
  }

  // ----------------------- Pesquisa de Preços -----------------------
  private renderPesquisaPrecos(d: PesquisaPrecosDados, licitacaoNumero: string): string {
    let html = `<h1>Pesquisa de Preços</h1>`;
    html += `<p><em>Documento elaborado nos termos do Art. 23 da Lei nº 14.133/2021 e IN SEGES/ME 65/2021.</em></p>`;
    html += `<p><strong>Licitação:</strong> ${this.escapeHtml(licitacaoNumero)}</p>`;
    if (d.metodologia_geral) {
      html += `<h2>Metodologia geral</h2><p>${this.escapeHtml(d.metodologia_geral)}</p>`;
    }
    html += `<hr/>`;

    let valorTotal = 0;

    (d.itens || []).forEach((itemRaw, idx) => {
      const item: ItemPesquisaPrecos = calcularEstatisticasItem(itemRaw);
      valorTotal += (item.valor_referencial || 0) * (item.quantidade || 0);

      html += `<h2>Item ${item.item_numero ?? idx + 1} — ${this.escapeHtml(item.descricao)}</h2>`;
      html += `<p><strong>Quantidade:</strong> ${item.quantidade} ${this.escapeHtml(item.unidade)}</p>`;

      // Tabela de cotações
      html += `<h3>Cotações</h3>`;
      html += `<table><thead><tr><th>#</th><th>Fonte</th><th>Descrição/Fornecedor</th><th>Data</th><th>Valor Unit.</th><th>Obs.</th></tr></thead><tbody>`;
      item.cotacoes.forEach((c, ci) => {
        const desc =
          c.fornecedor_razao_social
            ? `${c.fornecedor_razao_social}${c.fornecedor_cnpj ? ' (' + c.fornecedor_cnpj + ')' : ''}`
            : c.descricao_fonte;
        html += `<tr><td>${ci + 1}</td><td>${this.escapeHtml(c.fonte)}</td><td>${this.escapeHtml(desc)}</td><td>${this.escapeHtml(this.fmtData(c.data_pesquisa))}</td><td>${this.fmtMoeda(c.valor_unitario)}</td><td>${this.escapeHtml(c.observacao ?? '')}</td></tr>`;
      });
      html += `</tbody></table>`;

      // Estatísticas
      html += `<h3>Estatísticas</h3>`;
      html += `<table><thead><tr><th>Mínimo</th><th>Máximo</th><th>Média</th><th>Mediana</th><th>Desvio padrão</th><th>CV (%)</th></tr></thead><tbody>`;
      html += `<tr><td>${this.fmtMoeda(item.valor_minimo ?? 0)}</td><td>${this.fmtMoeda(item.valor_maximo ?? 0)}</td><td>${this.fmtMoeda(item.valor_medio ?? 0)}</td><td>${this.fmtMoeda(item.valor_mediano ?? 0)}</td><td>${this.fmtNum(item.desvio_padrao ?? 0)}</td><td>${this.fmtNum(item.cv_percent ?? 0)}</td></tr>`;
      html += `</tbody></table>`;

      html += `<p><strong>Metodologia adotada:</strong> ${this.escapeHtml(item.metodologia)}</p>`;
      if (item.justificativa_metodologia) {
        html += `<p><strong>Justificativa:</strong> ${this.escapeHtml(item.justificativa_metodologia)}</p>`;
      }
      if (item.outliers_descartados?.length) {
        html += `<p><strong>Outliers descartados:</strong></p><ul>`;
        for (const o of item.outliers_descartados) {
          html += `<li>Cotação #${o.cotacao_index + 1}: ${this.escapeHtml(o.motivo)}</li>`;
        }
        html += `</ul>`;
      }
      html += `<p><strong>Valor referencial unitário:</strong> ${this.fmtMoeda(item.valor_referencial)}</p>`;
      html += `<p><strong>Valor total do item:</strong> ${this.fmtMoeda((item.valor_referencial || 0) * (item.quantidade || 0))}</p>`;
      html += `<hr/>`;
    });

    html += `<h2>Resumo</h2>`;
    html += `<p><strong>Valor total estimado da contratação:</strong> ${this.fmtMoeda(d.valor_total_estimado ?? valorTotal)}</p>`;
    if (d.observacoes) {
      html += `<p><strong>Observações:</strong> ${this.escapeHtml(d.observacoes)}</p>`;
    }
    if (d.responsavel_pesquisa) {
      html += `<h3>Responsável pela pesquisa</h3>`;
      html += `<p>${this.escapeHtml(d.responsavel_pesquisa.nome)} — ${this.escapeHtml(d.responsavel_pesquisa.cargo)}${d.responsavel_pesquisa.matricula ? ' (matr. ' + this.escapeHtml(d.responsavel_pesquisa.matricula) + ')' : ''}</p>`;
    }

    return html;
  }

  // ----------------------- Matriz de Riscos -----------------------
  private renderMatrizRiscos(d: MatrizRiscosDados, licitacaoNumero: string): string {
    let html = `<h1>Matriz de Riscos</h1>`;
    html += `<p><em>Documento elaborado nos termos do Art. 18, X e Art. 22 da Lei nº 14.133/2021.</em></p>`;
    html += `<p><strong>Licitação:</strong> ${this.escapeHtml(licitacaoNumero)}</p>`;

    if (d.resumo_executivo) {
      html += `<h2>Resumo executivo</h2><p>${this.escapeHtml(d.resumo_executivo)}</p>`;
    }
    html += `<hr/>`;

    // Calcular nível para cada risco caso ainda não esteja preenchido
    const riscos: RiscoIdentificado[] = (d.riscos || []).map(r => {
      if (r.grau != null && r.nivel != null) return r;
      const calc = calcularGrauRisco(r.probabilidade, r.impacto);
      return { ...r, grau: calc.grau, nivel: calc.nivel };
    });

    // Estatísticas
    const total = riscos.length;
    const baixo = riscos.filter(r => r.nivel === 'BAIXO').length;
    const medio = riscos.filter(r => r.nivel === 'MEDIO').length;
    const alto = riscos.filter(r => r.nivel === 'ALTO').length;

    html += `<h2>Estatísticas gerais</h2>`;
    html += `<table><thead><tr><th>Total</th><th>Baixo</th><th>Médio</th><th>Alto</th></tr></thead><tbody>`;
    html += `<tr><td>${total}</td><td>${baixo}</td><td>${medio}</td><td>${alto}</td></tr></tbody></table>`;

    // Tabela de riscos com coloração por nível
    html += `<h2>Riscos identificados</h2>`;
    html += `<table><thead><tr><th>Nº</th><th>Categoria</th><th>Descrição</th><th>P</th><th>I</th><th>Grau</th><th>Nível</th><th>Resp.</th><th>Status</th></tr></thead><tbody>`;
    for (const r of riscos) {
      const cls = `risco-${r.nivel}`;
      html += `<tr class="${cls}">`;
      html += `<td>R-${String(r.numero).padStart(2, '0')}</td>`;
      html += `<td>${this.escapeHtml(r.categoria)}</td>`;
      html += `<td>${this.escapeHtml(r.descricao)}</td>`;
      html += `<td>${r.probabilidade}</td>`;
      html += `<td>${r.impacto}</td>`;
      html += `<td>${r.grau}</td>`;
      html += `<td>${this.escapeHtml(r.nivel ?? '')}</td>`;
      html += `<td>${this.escapeHtml(r.responsavel)}</td>`;
      html += `<td>${this.escapeHtml(r.status)}</td>`;
      html += `</tr>`;
    }
    html += `</tbody></table>`;

    // Detalhamento por risco
    html += `<h2>Detalhamento dos riscos</h2>`;
    for (const r of riscos) {
      html += `<h3>R-${String(r.numero).padStart(2, '0')} — ${this.escapeHtml(r.descricao)}</h3>`;
      html += `<p><strong>Categoria:</strong> ${this.escapeHtml(r.categoria)} | <strong>Fase:</strong> ${this.escapeHtml(r.fase_aplicavel)} | <strong>Nível:</strong> ${this.escapeHtml(r.nivel ?? '')} (grau ${r.grau})</p>`;
      html += `<p><strong>Causa:</strong> ${this.escapeHtml(r.causa)}</p>`;
      html += `<p><strong>Consequência:</strong> ${this.escapeHtml(r.consequencia)}</p>`;
      html += `<p><strong>Responsável (alocação):</strong> ${this.escapeHtml(r.responsavel)}</p>`;
      html += `<p><strong>Ações preventivas:</strong> ${this.escapeHtml(r.acoes_preventivas)}</p>`;
      html += `<p><strong>Ações de contingência:</strong> ${this.escapeHtml(r.acoes_contingencia)}</p>`;
      if (r.responsavel_monitoramento) {
        html += `<p><strong>Monitoramento:</strong> ${this.escapeHtml(r.responsavel_monitoramento)}</p>`;
      }
      if (r.observacoes) {
        html += `<p><strong>Observações:</strong> ${this.escapeHtml(r.observacoes)}</p>`;
      }
    }

    if (d.responsavel_elaboracao) {
      html += `<hr/><h3>Responsável pela elaboração</h3>`;
      html += `<p>${this.escapeHtml(d.responsavel_elaboracao.nome)} — ${this.escapeHtml(d.responsavel_elaboracao.cargo)}${d.responsavel_elaboracao.matricula ? ' (matr. ' + this.escapeHtml(d.responsavel_elaboracao.matricula) + ')' : ''}</p>`;
    }

    return html;
  }

  // ----------------------- Genérico -----------------------
  private renderGenerico(documento: DocumentoFaseInterna): string {
    let html = `<h1>${this.escapeHtml(documento.titulo)}</h1>`;
    html += `<p><em>${this.escapeHtml(this.tipoDescricao(documento.tipo))}</em></p>`;
    if (documento.descricao) {
      html += `<h2>Descrição</h2><p>${this.escapeHtml(documento.descricao)}</p>`;
    }
    if (documento.dados_estruturados) {
      html += `<h2>Dados estruturados</h2>`;
      html += `<p style="font-family: monospace; white-space: pre-wrap;">${this.escapeHtml(
        JSON.stringify(documento.dados_estruturados, null, 2),
      )}</p>`;
    }
    return html;
  }

  // ============================================================================
  // HTML COMPLETO (para fallback DOCX)
  // ============================================================================

  private documentoHtmlCompleto(documento: DocumentoFaseInterna, licitacaoNumero: string): string {
    const corpo = this.renderPorTipo(documento, licitacaoNumero);
    const css = `
      @page { size: A4; margin: 2.5cm 2cm 2.5cm 2cm; }
      body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; color: #000; line-height: 1.5; counter-reset: page; }
      header.institucional {
        border-bottom: 1.5px solid #1a3a6c;
        padding-bottom: 8px; margin-bottom: 24px;
      }
      header.institucional .titulo { font-weight: bold; font-size: 12pt; color: #1a3a6c; }
      header.institucional .sub { font-size: 9pt; color: #555; }
      h1 { font-size: 18pt; text-align: center; color: #000; margin: 16px 0 4px; }
      h2 { font-size: 13pt; color: #1a3a6c; margin-top: 18px; border-bottom: 0.5px solid #ccc; padding-bottom: 2px; }
      h3 { font-size: 11.5pt; color: #333; margin-top: 12px; }
      p { text-align: justify; margin: 4px 0 8px; }
      ul { margin: 4px 0 8px 24px; }
      hr { border: none; border-top: 0.5px solid #bbb; margin: 12px 0; }
      table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; font-size: 10pt; }
      th { background: #1a3a6c; color: #fff; padding: 6px; border: 0.5px solid #555; text-align: center; }
      td { padding: 6px; border: 0.5px solid #888; vertical-align: top; }
      tr.risco-BAIXO td { background: #dff5e1; }
      tr.risco-MEDIO td { background: #fff5cc; }
      tr.risco-ALTO  td { background: #fde0e0; }
      footer.rodape {
        margin-top: 32px; border-top: 0.5px solid #999; padding-top: 6px;
        font-size: 8.5pt; color: #666; font-style: italic;
      }
      .pagina { page-break-after: always; }
    `;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>${this.escapeHtml(documento.titulo)}</title>
<style>${css}</style>
</head>
<body>
  <header class="institucional">
    <div class="titulo">PORTAL DCP — Departamento Central de Pregão</div>
    <div class="sub">Licitação nº ${this.escapeHtml(licitacaoNumero)} — ${this.escapeHtml(this.tipoDescricao(documento.tipo))}</div>
  </header>

  <main>
    ${corpo}
  </main>

  <footer class="rodape">
    Documento gerado em ${new Date().toLocaleString('pt-BR')} pelo Portal DCP.<br/>
    Fundamento legal: Lei nº 14.133/2021 (Nova Lei de Licitações e Contratos).
  </footer>
</body>
</html>`;
  }

  // ============================================================================
  // UTIL
  // ============================================================================

  private escapeHtml(s: string): string {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private fmtMoeda(n: number): string {
    if (n == null || isNaN(n as any)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  }

  private fmtNum(n: number): string {
    if (n == null || isNaN(n as any)) return '0,00';
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n);
  }

  private fmtData(iso?: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('pt-BR');
  }
}

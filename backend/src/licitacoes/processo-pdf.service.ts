import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import { Licitacao } from './entities/licitacao.entity';
import { GeradorDocumentoService } from '../fase-interna/gerador-documento.service';
import { LicitacoesService } from './licitacoes.service';
import { gerarAvisoDispensaPdf } from './aviso-dispensa-pdf';

/**
 * AUTOS DO PROCESSO — compila o processo administrativo INTEIRO num único
 * PDF: capa, sumário paginado e as peças em ordem processual (DFD → ETP →
 * pesquisa de preços → TR → pareceres → autorização → aviso publicado →
 * ata da sessão → contratos → registro de publicações no PNCP).
 * Peças indisponíveis são puladas e anotadas no sumário.
 */

const ORDEM_PECAS: Array<{ tipo: string; titulo: string }> = [
  { tipo: 'DFD', titulo: 'Documento de Formalização da Demanda (DFD)' },
  { tipo: 'ETP', titulo: 'Estudo Técnico Preliminar (ETP)' },
  { tipo: 'AR', titulo: 'Análise de Riscos' },
  { tipo: 'PP', titulo: 'Pesquisa de Preços' },
  { tipo: 'TR', titulo: 'Termo de Referência (TR)' },
  { tipo: 'PJ', titulo: 'Parecer Jurídico' },
  { tipo: 'PT', titulo: 'Parecer Técnico' },
  { tipo: 'DO', titulo: 'Dotação Orçamentária' },
  { tipo: 'JC', titulo: 'Justificativa da Contratação' },
  { tipo: 'AA', titulo: 'Autorização para Abertura' },
  { tipo: 'ME', titulo: 'Minuta do Edital' },
];

interface Peca {
  titulo: string;
  origem: string;
  buffer: Buffer;
  paginas?: number;
}

@Injectable()
export class ProcessoPdfService {
  private readonly logger = new Logger(ProcessoPdfService.name);
  private readonly uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

  constructor(
    @InjectRepository(Licitacao)
    private readonly licitacaoRepository: Repository<Licitacao>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly geradorDocumentoService: GeradorDocumentoService,
    private readonly licitacoesService: LicitacoesService,
  ) {}

  async gerarProcessoCompleto(licitacaoId: string): Promise<Buffer> {
    const licitacao = await this.licitacaoRepository.findOne({
      where: { id: licitacaoId },
      relations: ['orgao', 'itens'],
    });
    if (!licitacao) throw new NotFoundException('Processo não encontrado');
    const orgao: any = (licitacao as any).orgao || {};

    const pecas: Peca[] = [];
    const ausentes: string[] = [];

    // ── 1. Documentos da fase interna (gera o PDF de cada peça presente) ────
    const docs = await this.dataSource.query(
      `SELECT id, tipo, titulo, status, arquivo_pdf_path,
              LENGTH(COALESCE(descricao,'')) AS len,
              (dados_estruturados IS NOT NULL) AS tem_dados
       FROM documentos_fase_interna
       WHERE licitacao_id = $1 AND versao_atual = true`,
      [licitacaoId],
    );
    for (const ordem of ORDEM_PECAS) {
      const doc = docs.find((d: any) => d.tipo === ordem.tipo);
      if (!doc || (Number(doc.len) < 20 && !doc.tem_dados)) {
        continue; // peça não elaborada — não entra nos autos
      }
      try {
        // Reaproveita o PDF gerado ou gera na hora
        let caminho: string | null = doc.arquivo_pdf_path || null;
        if (!caminho || !fs.existsSync(caminho)) {
          const r = await this.geradorDocumentoService.gerarPdf(doc.id);
          caminho = r.caminho;
        }
        if (caminho && fs.existsSync(caminho)) {
          pecas.push({ titulo: ordem.titulo, origem: 'Fase interna', buffer: fs.readFileSync(caminho) });
        } else {
          ausentes.push(ordem.titulo);
        }
      } catch (e: any) {
        this.logger.warn(`Peça ${ordem.tipo} não incluída: ${e.message}`);
        ausentes.push(`${ordem.titulo} (falha ao gerar)`);
      }
    }

    // ── 2. Aviso de contratação direta (quando dispensa/inexigibilidade) ────
    const ehDireta = /DISPENSA|INEXIGIBILIDADE/.test(String(licitacao.modalidade || ''));
    if (ehDireta && licitacao.data_publicacao_edital) {
      try {
        pecas.push({
          titulo: 'Aviso de Contratação Direta (publicado)',
          origem: 'Divulgação',
          buffer: gerarAvisoDispensaPdf({
            orgao_nome: orgao.nome || 'Órgão',
            orgao_cnpj: orgao.cnpj,
            licitacao,
            itens: (licitacao as any).itens || [],
          } as any),
        });
      } catch (e: any) {
        ausentes.push(`Aviso de Contratação Direta (falha: ${String(e.message).slice(0, 40)})`);
      }
    }

    // ── 3. Ata da sessão (disponível após o julgamento) ─────────────────────
    if (ehDireta) {
      try {
        const ata = await this.licitacoesService.gerarAtaDispensa(licitacaoId);
        pecas.push({ titulo: 'Ata da Sessão da Dispensa Eletrônica', origem: 'Seleção', buffer: ata });
      } catch {
        ausentes.push('Ata da sessão (disponível após o julgamento)');
      }
    }

    // ── 4. Contratos (termo — assinado quando o fluxo concluiu) ─────────────
    const contratos = await this.dataSource.query(
      `SELECT c.numero_contrato, c.arquivo_contrato, da.status AS assinatura_status
       FROM contratos c
       LEFT JOIN documentos_assinatura da ON da.id = c.documento_assinatura_id
       WHERE c.licitacao_id = $1 ORDER BY c.numero_contrato ASC`,
      [licitacaoId],
    );
    for (const c of contratos) {
      if (!c.arquivo_contrato) {
        ausentes.push(`Termo do contrato ${c.numero_contrato} (não gerado)`);
        continue;
      }
      const p = path.isAbsolute(c.arquivo_contrato)
        ? c.arquivo_contrato
        : path.join(this.uploadDir, c.arquivo_contrato);
      if (fs.existsSync(p)) {
        pecas.push({
          titulo: `Termo de Contrato ${c.numero_contrato}${c.assinatura_status === 'CONCLUIDO' ? ' (assinado eletronicamente)' : ''}`,
          origem: 'Contratação',
          buffer: fs.readFileSync(p),
        });
      } else {
        ausentes.push(`Termo do contrato ${c.numero_contrato} (arquivo não encontrado)`);
      }
    }

    // ── 5. Registro de publicações no PNCP ──────────────────────────────────
    const pncp = await this.dataSource.query(
      `SELECT tipo, status, numero_controle_pncp, created_at
       FROM pncp_sync WHERE licitacao_id = $1 AND status = 'ENVIADO'
       ORDER BY created_at ASC`,
      [licitacaoId],
    );

    // ── Montagem: mede as páginas, gera capa+sumário e mescla tudo ─────────
    const merged = await PDFDocument.create();
    const fonteBold = await merged.embedFont(StandardFonts.HelveticaBold);
    const fonte = await merged.embedFont(StandardFonts.Helvetica);

    // Carrega cada peça para saber o total de páginas (sumário paginado)
    const carregadas: Array<Peca & { doc: PDFDocument }> = [];
    for (const p of pecas) {
      try {
        const doc = await PDFDocument.load(p.buffer, { ignoreEncryption: true });
        carregadas.push({ ...p, doc, paginas: doc.getPageCount() });
      } catch (e: any) {
        this.logger.warn(`Peça "${p.titulo}" ilegível para mesclagem: ${e.message}`);
        ausentes.push(`${p.titulo} (arquivo ilegível)`);
      }
    }

    const A4: [number, number] = [595.28, 841.89];
    const numPaginasPrefacio = 2; // capa + sumário
    let paginaCorrente = numPaginasPrefacio + 1;
    const indice = carregadas.map((p) => {
      const entrada = { titulo: p.titulo, origem: p.origem, pagina: paginaCorrente, paginas: p.paginas || 0 };
      paginaCorrente += p.paginas || 0;
      return entrada;
    });
    const totalPaginas = paginaCorrente - 1 + (pncp.length ? 1 : 0);

    // CAPA
    {
      const capa = merged.addPage(A4);
      const [w, h] = A4;
      const centro = (texto: string, y: number, size: number, bold = false) => {
        const f = bold ? fonteBold : fonte;
        capa.drawText(texto, { x: (w - f.widthOfTextAtSize(texto, size)) / 2, y, size, font: f, color: rgb(0.08, 0.15, 0.35) });
      };
      centro((orgao.nome || 'ÓRGÃO').toUpperCase(), h - 140, 14, true);
      centro('PROCESSO ADMINISTRATIVO DE CONTRATAÇÃO', h - 200, 18, true);
      centro(`Processo nº ${licitacao.numero_processo}`, h - 240, 14);
      centro(String(licitacao.modalidade || '').replaceAll('_', ' '), h - 265, 12);
      const objeto = String(licitacao.objeto || '').slice(0, 300);
      // objeto em linhas de ~85 chars
      let y = h - 320;
      for (let i = 0; i < objeto.length; i += 85) {
        centro(objeto.slice(i, i + 85), y, 10);
        y -= 16;
      }
      centro(`Valor total estimado: R$ ${Number(licitacao.valor_total_estimado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, y - 10, 11);
      centro(`Autuado em ${new Date((licitacao as any).created_at || Date.now()).toLocaleDateString('pt-BR')}`, 120, 10);
      centro(`Compilação gerada pelo Portal DCP em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} — ${totalPaginas} páginas`, 100, 9);
      centro('Lei nº 14.133/2021', 80, 10, true);
    }

    // SUMÁRIO
    {
      const sum = merged.addPage(A4);
      const [w, h] = A4;
      sum.drawText('SUMÁRIO DOS AUTOS', { x: 60, y: h - 80, size: 16, font: fonteBold, color: rgb(0.08, 0.15, 0.35) });
      let y = h - 120;
      for (const e of indice) {
        const linha = `${e.titulo}`;
        sum.drawText(linha.slice(0, 78), { x: 60, y, size: 10, font: fonte });
        sum.drawText(`p. ${e.pagina}`, { x: w - 100, y, size: 10, font: fonteBold });
        y -= 18;
        if (y < 80) break;
      }
      if (pncp.length) {
        sum.drawText('Registro de publicações no PNCP', { x: 60, y, size: 10, font: fonte });
        sum.drawText(`p. ${paginaCorrente}`, { x: w - 100, y, size: 10, font: fonteBold });
        y -= 18;
      }
      if (ausentes.length) {
        y -= 10;
        sum.drawText('Peças não incluídas nesta compilação:', { x: 60, y, size: 9, font: fonteBold, color: rgb(0.5, 0.3, 0) });
        y -= 14;
        for (const a of ausentes.slice(0, 12)) {
          sum.drawText(`• ${a.slice(0, 85)}`, { x: 66, y, size: 8.5, font: fonte, color: rgb(0.45, 0.45, 0.45) });
          y -= 13;
          if (y < 60) break;
        }
      }
    }

    // PEÇAS
    for (const p of carregadas) {
      const paginas = await merged.copyPages(p.doc, p.doc.getPageIndices());
      for (const pg of paginas) merged.addPage(pg);
    }

    // REGISTRO PNCP
    if (pncp.length) {
      const pg = merged.addPage(A4);
      const [, h] = A4;
      pg.drawText('REGISTRO DE PUBLICAÇÕES NO PNCP', { x: 60, y: h - 80, size: 14, font: fonteBold, color: rgb(0.08, 0.15, 0.35) });
      pg.drawText('Portal Nacional de Contratações Públicas — art. 54 e art. 94 da Lei nº 14.133/2021', { x: 60, y: h - 100, size: 9, font: fonte, color: rgb(0.4, 0.4, 0.4) });
      let y = h - 140;
      for (const s of pncp) {
        pg.drawText(`${s.tipo} — enviado em ${new Date(s.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, { x: 60, y, size: 10, font: fonteBold });
        y -= 15;
        if (s.numero_controle_pncp) {
          pg.drawText(`Nº de controle PNCP: ${s.numero_controle_pncp}`, { x: 72, y, size: 10, font: fonte });
          y -= 18;
        } else {
          y -= 6;
        }
        if (y < 70) break;
      }
      if ((licitacao as any).link_pncp) {
        pg.drawText(`Consulta pública: ${(licitacao as any).link_pncp}`, { x: 60, y: 60, size: 9, font: fonte, color: rgb(0.1, 0.3, 0.7) });
      }
    }

    // Numeração de páginas (rodapé) — padrão de autos
    const todas = merged.getPages();
    todas.forEach((pg, i) => {
      const { width } = pg.getSize();
      const texto = `Processo ${licitacao.numero_processo} — fl. ${i + 1}/${todas.length}`;
      pg.drawText(texto, { x: width - 60 - fonte.widthOfTextAtSize(texto, 8), y: 20, size: 8, font: fonte, color: rgb(0.55, 0.55, 0.55) });
    });

    const bytes = await merged.save();
    this.logger.log(
      `[autos] Processo ${licitacao.numero_processo}: ${carregadas.length} peça(s), ${todas.length} página(s), ${ausentes.length} ausente(s)`,
    );
    return Buffer.from(bytes);
  }
}

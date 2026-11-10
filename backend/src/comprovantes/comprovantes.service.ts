import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import PDFDocument = require('pdfkit');
import { ComprovanteFornecedor } from './comprovante.entity';
import { RetratoComprovante, TIPOS_COMPROVANTE, TipoComprovante, brl, codigoDeVerificacao, dataHoraBrasilia, numeroDoComprovante } from './comprovantes.regras';

/**
 * Emite e serve os comprovantes do fornecedor (ver comprovantes.regras.ts).
 * A emissão NUNCA derruba a ação principal: se falhar, registra no log e segue.
 * Só o próprio fornecedor lê os seus comprovantes — a proposta é sigilosa até a
 * abertura, e o comprovante traz o conteúdo dela.
 */
@Injectable()
export class ComprovantesService {
  private readonly logger = new Logger(ComprovantesService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** Retrato do que está gravado AGORA: proposta (com itens) e anexos de habilitação. */
  async retrato(licitacaoId: string, fornecedorId: string): Promise<RetratoComprovante> {
    const [lic] = await this.ds.query(
      `SELECT l.id::text AS id, l.numero_processo, l.numero_edital, l.objeto, o.nome AS orgao
         FROM licitacoes l LEFT JOIN orgaos o ON o.id = l.orgao_id WHERE l.id::text = $1`,
      [licitacaoId],
    );
    const [forn] = await this.ds.query(`SELECT id::text AS id, razao_social, cpf_cnpj FROM fornecedores WHERE id::text = $1`, [fornecedorId]);
    const [prop] = await this.ds.query(
      `SELECT id::text AS id, status::text AS status, data_envio, valor_total_proposta FROM propostas WHERE licitacao_id::text = $1 AND fornecedor_id::text = $2`,
      [licitacaoId, fornecedorId],
    );
    const itens: any[] = prop
      ? await this.ds.query(
          `SELECT i.numero_item, lt.numero AS lote, i.descricao_resumida, i.quantidade, i.unidade_medida, pi.valor_unitario, pi.valor_total, pi.marca, pi.modelo
             FROM proposta_itens pi
             JOIN itens_licitacao i ON i.id = pi.item_licitacao_id
             LEFT JOIN lotes_licitacao lt ON lt.id = i.lote_id
            WHERE pi.proposta_id::text = $1 ORDER BY i.numero_item`,
          [prop.id],
        )
      : [];
    const anexos: any[] = await this.ds.query(
      `SELECT e.descricao AS exigencia, COALESCE(d.arquivo_nome, d.cadastro->>'nomeArquivo', 'registro cadastral') AS arquivo,
              d.arquivo_tamanho, d.arquivo_sha256, d.enviado_em
         FROM documentos_habilitacao d JOIN exigencias_habilitacao e ON e.id = d.exigencia_id
        WHERE d.licitacao_id::text = $1 AND d.fornecedor_id::text = $2 ORDER BY e.ordem, d.enviado_em`,
      [licitacaoId, fornecedorId],
    );
    const num = (v: unknown) => Number(v ?? 0);
    return {
      licitacao: { id: licitacaoId, processo: lic?.numero_processo ?? null, edital: lic?.numero_edital ?? null, objeto: lic?.objeto ?? null, orgao: lic?.orgao ?? null },
      fornecedor: { id: fornecedorId, razaoSocial: forn?.razao_social ?? null, cpfCnpj: forn?.cpf_cnpj ?? null },
      proposta: prop
        ? {
            id: prop.id,
            status: prop.status,
            enviadaEm: prop.data_envio ? new Date(prop.data_envio).toISOString() : null,
            valorTotal: itens.reduce((t, i) => t + num(i.valor_total), 0) || num(prop.valor_total_proposta),
            itens: itens.map((i) => ({
              numero: num(i.numero_item),
              lote: i.lote == null ? null : num(i.lote),
              descricao: String(i.descricao_resumida ?? ''),
              quantidade: num(i.quantidade),
              unidade: i.unidade_medida ?? null,
              valorUnitario: num(i.valor_unitario),
              valorTotal: num(i.valor_total),
              marca: i.marca || null,
              modelo: i.modelo || null,
            })),
          }
        : null,
      anexos: anexos.map((a) => ({
        exigencia: String(a.exigencia ?? ''),
        arquivo: String(a.arquivo ?? ''),
        tamanho: a.arquivo_tamanho == null ? null : num(a.arquivo_tamanho),
        sha256: a.arquivo_sha256 ?? null,
        enviadoEm: a.enviado_em ? new Date(a.enviado_em).toISOString() : null,
      })),
    };
  }

  /**
   * Emite o comprovante de uma ação. `retratoPronto` serve à exclusão: o retrato
   * é tirado ANTES de apagar, para o comprovante mostrar o que foi excluído.
   */
  async emitir(p: {
    licitacaoId: string;
    fornecedorId: string;
    tipo: TipoComprovante;
    descricao?: string;
    retratoPronto?: RetratoComprovante;
  }): Promise<{ id: string; numero: string } | null> {
    try {
      const retrato = p.retratoPronto ?? (await this.retrato(p.licitacaoId, p.fornecedorId));
      const emitidoEm = new Date();
      const descricao = (p.descricao ?? TIPOS_COMPROVANTE[p.tipo]).slice(0, 500);
      const repo = this.ds.getRepository(ComprovanteFornecedor);
      const c = await repo.save(
        repo.create({
          licitacao_id: p.licitacaoId,
          fornecedor_id: p.fornecedorId,
          proposta_id: retrato.proposta?.id ?? null,
          tipo: p.tipo,
          descricao,
          retrato,
          codigo_verificacao: codigoDeVerificacao({ tipo: p.tipo, descricao, emitidoEm: emitidoEm.toISOString(), retrato }),
          emitido_em: emitidoEm,
        }),
      );
      const seq = c.sequencia ?? (await repo.findOne({ where: { id: c.id } }))?.sequencia ?? 0;
      return { id: c.id, numero: numeroDoComprovante(seq, emitidoEm) };
    } catch (e) {
      this.logger.error(`Comprovante não emitido (${p.tipo}, licitação ${p.licitacaoId}): ${(e as Error)?.message ?? e}`);
      return null;
    }
  }

  private visao(c: ComprovanteFornecedor) {
    return {
      id: c.id,
      numero: numeroDoComprovante(c.sequencia, c.emitido_em),
      tipo: c.tipo,
      rotulo: TIPOS_COMPROVANTE[c.tipo as TipoComprovante] ?? c.tipo,
      descricao: c.descricao,
      emitidoEm: c.emitido_em,
      codigoVerificacao: c.codigo_verificacao,
      valorTotal: c.retrato?.proposta?.valorTotal ?? null,
      itens: c.retrato?.proposta?.itens.length ?? 0,
      anexos: c.retrato?.anexos.length ?? 0,
    };
  }

  /** Comprovantes do fornecedor na licitação, do mais recente para o mais antigo. */
  async listar(licitacaoId: string, fornecedorId: string) {
    const lista = await this.ds.getRepository(ComprovanteFornecedor).find({ where: { licitacao_id: licitacaoId, fornecedor_id: fornecedorId }, order: { emitido_em: 'DESC' }, take: 200 });
    return lista.map((c) => this.visao(c));
  }

  private async doFornecedor(id: string, fornecedorId: string): Promise<ComprovanteFornecedor> {
    const c = await this.ds.getRepository(ComprovanteFornecedor).findOne({ where: { id } });
    if (!c || c.fornecedor_id !== fornecedorId) throw new NotFoundException('Comprovante não encontrado');
    return c;
  }

  /** PDF do comprovante — gerado do retrato gravado, sempre igual. */
  async pdf(id: string, fornecedorId: string): Promise<{ nome: string; conteudo: Buffer }> {
    const c = await this.doFornecedor(id, fornecedorId);
    const numero = numeroDoComprovante(c.sequencia, c.emitido_em);
    const r = c.retrato;
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Comprovante ${numero}` } });
    const chunks: Buffer[] = [];
    doc.on('data', (b: Buffer) => chunks.push(b));
    const fim = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
    const L = 40;
    const W = 515;
    const titulo = (t: string) => {
      doc.moveDown(0.8).font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text(t, L, doc.y, { width: W });
      doc.moveTo(L, doc.y + 2).lineTo(L + W, doc.y + 2).strokeColor('#cbd5e1').stroke();
      doc.moveDown(0.4).font('Helvetica').fontSize(9).fillColor('#1e293b');
    };
    const linha = (rotulo: string, valor: string) => {
      doc.font('Helvetica-Bold').fontSize(9).text(`${rotulo}: `, L, doc.y, { continued: true, width: W }).font('Helvetica').text(valor || '—');
    };

    doc.font('Helvetica-Bold').fontSize(15).fillColor('#0f172a').text('Comprovante de registro no sistema', L, 40, { width: W });
    doc.font('Helvetica').fontSize(9).fillColor('#475569').text('Portal DCP — Diário de Compras Públicas', { width: W });
    doc.moveDown(0.6).font('Helvetica-Bold').fontSize(12).fillColor('#065f46').text(`${numero} — ${TIPOS_COMPROVANTE[c.tipo as TipoComprovante] ?? c.tipo}`, { width: W });
    doc.font('Helvetica').fontSize(9).fillColor('#1e293b');
    linha('Registrado em', `${dataHoraBrasilia(c.emitido_em)} (horário de Brasília)`);
    linha('O que foi feito', c.descricao);

    titulo('Licitação');
    linha('Órgão', r.licitacao.orgao ?? '');
    linha('Processo', [r.licitacao.processo, r.licitacao.edital ? `edital ${r.licitacao.edital}` : null].filter(Boolean).join(' — '));
    linha('Objeto', r.licitacao.objeto ?? '');

    titulo('Fornecedor');
    linha('Razão social', r.fornecedor.razaoSocial ?? '');
    linha('CPF/CNPJ', r.fornecedor.cpfCnpj ?? '');

    titulo(c.tipo === 'PROPOSTA_EXCLUIDA' ? 'Proposta excluída (como estava antes da exclusão)' : 'Proposta gravada no sistema neste momento');
    if (!r.proposta) doc.text('Nenhuma proposta gravada.');
    else {
      linha('Situação', r.proposta.status);
      linha('Enviada em', dataHoraBrasilia(r.proposta.enviadaEm));
      linha('Valor total', brl(r.proposta.valorTotal));
      doc.moveDown(0.4);
      const col = [L, L + 30, L + 62, L + 290, L + 345, L + 430];
      const cab = () => {
        const y = doc.y;
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569');
        ['Item', 'Lote', 'Descrição / marca e modelo', 'Qtd.', 'Valor unitário', 'Total'].forEach((t, i) => doc.text(t, col[i], y, { width: (col[i + 1] ?? L + W) - col[i] - 4, align: i >= 3 ? 'right' : 'left' }));
        doc.moveDown(0.3).font('Helvetica').fillColor('#1e293b');
      };
      cab();
      for (const it of r.proposta.itens) {
        const desc = it.descricao + (it.marca || it.modelo ? `\n${[it.marca, it.modelo].filter(Boolean).join(' / ')}` : '');
        const alt = doc.heightOfString(desc, { width: col[3] - col[2] - 4 });
        if (doc.y + alt > 780) {
          doc.addPage();
          cab();
        }
        const y = doc.y;
        doc.fontSize(8);
        doc.text(String(it.numero), col[0], y, { width: 26 });
        doc.text(it.lote == null ? '—' : String(it.lote), col[1], y, { width: 28 });
        doc.text(desc, col[2], y, { width: col[3] - col[2] - 4 });
        doc.text(`${it.quantidade.toLocaleString('pt-BR')} ${it.unidade ?? ''}`.trim(), col[3], y, { width: col[4] - col[3] - 4, align: 'right' });
        doc.text(brl(it.valorUnitario), col[4], y, { width: col[5] - col[4] - 4, align: 'right' });
        doc.text(brl(it.valorTotal), col[5], y, { width: L + W - col[5], align: 'right' });
        doc.y = y + alt + 4;
      }
      doc.fontSize(9);
    }

    titulo(`Anexos gravados no sistema neste momento (${r.anexos.length})`);
    if (!r.anexos.length) doc.text('Nenhum documento de habilitação anexado.', L, doc.y, { width: W });
    for (const a of r.anexos) {
      if (doc.y > 760) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(8).text(a.arquivo, L, doc.y, { width: W });
      doc.font('Helvetica').fontSize(8).fillColor('#475569');
      doc.text(`${a.exigencia} · enviado em ${dataHoraBrasilia(a.enviadoEm)}${a.tamanho ? ` · ${(a.tamanho / 1024).toFixed(1)} KB` : ''}`, { width: W });
      if (a.sha256) doc.text(`SHA-256: ${a.sha256}`, { width: W });
      doc.fillColor('#1e293b').moveDown(0.3);
    }

    if (doc.y > 720) doc.addPage();
    titulo('Autenticidade');
    doc.fontSize(8).text(
      'Este comprovante foi gerado automaticamente pelo sistema no instante da ação e retrata o que ficou gravado. Ele não substitui o julgamento da proposta ou da habilitação.',
      L,
      doc.y,
      { width: W },
    );
    doc.moveDown(0.3).font('Helvetica-Bold').text(`Código de verificação: ${c.codigo_verificacao}`, { width: W });
    doc.end();
    return { nome: `comprovante-${numero}.pdf`, conteudo: await fim };
  }
}

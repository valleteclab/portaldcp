import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan } from 'typeorm';
import { randomBytes, randomUUID } from 'crypto';
import PDFDocument = require('pdfkit');
import { Orgao } from '../orgaos/entities/orgao.entity';
import { Setor } from '../orgaos/entities/setor.entity';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { BemPatrimonial } from './entities/bem-patrimonial.entity';
import { HistoricoBem } from './entities/historico-bem.entity';
import { MovimentacaoBem } from './entities/movimentacao-bem.entity';
import {
  TipoMovimentacao,
  StatusMovimentacao,
  StatusBem,
  MotivoBaixa,
} from './entities/enums';
import { SolicitarTransferenciaDto, BaixarBemDto, EmprestarBemDto } from './dto/movimentacao.dto';

function appUrl(): string {
  return (process.env.APP_URL || process.env.FRONTEND_URL || 'https://portaldcp.com.br').replace(/\/$/, '');
}

const MOTIVO_BAIXA_LABEL: Record<MotivoBaixa, string> = {
  [MotivoBaixa.INSERVIVEL]: 'Inservível',
  [MotivoBaixa.ALIENACAO]: 'Alienação',
  [MotivoBaixa.DOACAO]: 'Doação',
  [MotivoBaixa.FURTO_EXTRAVIO]: 'Furto ou extravio',
  [MotivoBaixa.OUTRO]: 'Outro',
};

const fmtMoeda = (v: any) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDataHora = (d?: Date | null) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');
const fmtData = (d?: Date | string | null) => (d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—');

/**
 * Ciclo de vida do bem depois do cadastro: transferência entre setores com
 * aceite do destino (link por WhatsApp), baixa formal e empréstimo temporário,
 * com termos em PDF e histórico no bem.
 */
@Injectable()
export class PatrimonioMovimentacaoService {
  private readonly logger = new Logger(PatrimonioMovimentacaoService.name);

  constructor(
    @InjectRepository(MovimentacaoBem) private readonly movRepo: Repository<MovimentacaoBem>,
    @InjectRepository(BemPatrimonial) private readonly bemRepo: Repository<BemPatrimonial>,
    @InjectRepository(HistoricoBem) private readonly historicoRepo: Repository<HistoricoBem>,
    @InjectRepository(Setor) private readonly setorRepo: Repository<Setor>,
    @InjectRepository(Orgao) private readonly orgaoRepo: Repository<Orgao>,
    private readonly whatsapp: WhatsAppService,
  ) {}

  private async historico(bemId: string, orgaoId: string, acao: string, descricao: string, usuarioNome: string) {
    await this.historicoRepo.save(this.historicoRepo.create({ bem_id: bemId, orgao_id: orgaoId, acao, descricao, usuario_nome: usuarioNome }));
  }

  // ─── TRANSFERÊNCIA ─────────────────────────────────────────────────

  async solicitarTransferencia(orgaoId: string, dto: SolicitarTransferenciaDto, usuarioNome: string) {
    if (!dto.bem_ids?.length) throw new BadRequestException('Selecione ao menos um bem');
    const destino = await this.setorRepo.findOne({ where: { id: dto.setor_destino_id, orgao_id: orgaoId } });
    if (!destino) throw new BadRequestException('Setor de destino não pertence a este órgão');

    const bens = await this.bemRepo.find({ where: { id: In(dto.bem_ids), orgao_id: orgaoId }, relations: ['setor'] });
    if (bens.length !== dto.bem_ids.length) throw new NotFoundException('Um ou mais bens não foram encontrados');
    const baixado = bens.find((b) => b.status === StatusBem.BAIXADO);
    if (baixado) throw new BadRequestException(`O bem ${baixado.plaqueta} está baixado e não pode ser transferido`);
    const jaNoDestino = bens.filter((b) => b.setor_id === destino.id);
    if (jaNoDestino.length === bens.length) throw new BadRequestException('Os bens já estão no setor de destino');
    const emprestado = bens.find((b) => b.emprestado_ate);
    if (emprestado) throw new BadRequestException(`O bem ${emprestado.plaqueta} está emprestado; registre a devolução antes`);

    const pendentes = await this.movRepo.find({
      where: { bem_id: In(bens.map((b) => b.id)), tipo: TipoMovimentacao.TRANSFERENCIA, status: StatusMovimentacao.PENDENTE },
      select: ['bem_id'],
    });
    if (pendentes.length) {
      const b = bens.find((x) => x.id === pendentes[0].bem_id);
      throw new BadRequestException(`O bem ${b?.plaqueta || ''} já tem uma transferência aguardando aceite`);
    }

    const loteId = randomUUID();
    const token = dto.aceite_imediato ? null : randomBytes(32).toString('hex');
    const telefone = dto.responsavel_destino_telefone?.replace(/\D/g, '') || null;
    const linhas = bens
      .filter((b) => b.setor_id !== destino.id)
      .map((b) =>
        this.movRepo.create({
          orgao_id: orgaoId,
          bem_id: b.id,
          lote_id: loteId,
          tipo: TipoMovimentacao.TRANSFERENCIA,
          status: StatusMovimentacao.PENDENTE,
          setor_origem_id: b.setor_id,
          setor_origem_nome: b.setor?.nome || b.localizacao_nome || null,
          setor_destino_id: destino.id,
          setor_destino_nome: destino.nome,
          responsavel_origem_nome: b.responsavel_nome || null,
          responsavel_destino_nome: dto.responsavel_destino_nome?.trim() || null,
          responsavel_destino_telefone: telefone,
          token_aceite: token,
          motivo: dto.motivo?.trim() || null,
          solicitado_por: usuarioNome,
          inventario_id: dto.inventario_id || null,
        }),
      );
    const salvas = await this.movRepo.save(linhas);

    if (dto.aceite_imediato) {
      for (const m of salvas) await this.aplicarTransferencia(m, usuarioNome, `aplicada por ${usuarioNome} (sem aceite)`);
      return { lote_id: loteId, aplicada: true, link: null, enviado: false, movimentacoes: salvas.length };
    }

    for (const m of salvas) {
      await this.historico(m.bem_id, orgaoId, 'TRANSFERENCIA_SOLICITADA', `Transferência para ${destino.nome} solicitada por ${usuarioNome}, aguardando aceite`, usuarioNome);
    }
    const link = `${appUrl()}/m/${token}`;
    let enviado = false;
    if (telefone) enviado = await this.enviarLinkAceite(orgaoId, telefone, dto.responsavel_destino_nome || '', destino.nome, salvas.length, link);
    return { lote_id: loteId, aplicada: false, link, enviado, movimentacoes: salvas.length };
  }

  private async enviarLinkAceite(orgaoId: string, telefone: string, nome: string, setorDestino: string, qtd: number, link: string) {
    const orgao = await this.orgaoRepo.findOne({ where: { id: orgaoId }, select: ['id', 'nome', 'nome_fantasia'] });
    const mensagem =
      `📦 *Transferência de patrimônio — ${orgao?.nome_fantasia || orgao?.nome || 'Portal DCP'}*\n\n` +
      `Olá${nome ? `, ${nome}` : ''}! ${qtd === 1 ? 'Um bem está sendo transferido' : `${qtd} bens estão sendo transferidos`} para o setor *${setorDestino}* sob sua responsabilidade.\n\n` +
      `Confira a relação e aceite (ou recuse) pelo link:\n${link}`;
    try {
      const ok = await this.whatsapp.enviar(orgaoId, { to: telefone, mensagem });
      if (ok) return true;
      return await this.whatsapp.enviarSistema(telefone, mensagem);
    } catch (err: any) {
      this.logger.warn(`WhatsApp de transferência não enviado (${telefone}): ${err?.message}`);
      return false;
    }
  }

  async reenviarLink(orgaoId: string, loteId: string) {
    const linhas = await this.movRepo.find({ where: { orgao_id: orgaoId, lote_id: loteId } });
    const pend = linhas.find((m) => m.status === StatusMovimentacao.PENDENTE && m.token_aceite);
    if (!pend) throw new BadRequestException('Este lote não está aguardando aceite');
    const link = `${appUrl()}/m/${pend.token_aceite}`;
    if (!pend.responsavel_destino_telefone) return { enviado: false, link, motivo: 'Sem telefone do responsável de destino' };
    const enviado = await this.enviarLinkAceite(orgaoId, pend.responsavel_destino_telefone, pend.responsavel_destino_nome || '', pend.setor_destino_nome || '', linhas.length, link);
    return { enviado, link };
  }

  private async aplicarTransferencia(m: MovimentacaoBem, quem: string, como: string) {
    const bem = await this.bemRepo.findOne({ where: { id: m.bem_id } });
    if (!bem) return;
    bem.setor_id = m.setor_destino_id;
    if (m.responsavel_destino_nome) bem.responsavel_nome = m.responsavel_destino_nome;
    await this.bemRepo.save(bem);
    m.status = StatusMovimentacao.ACEITA;
    m.aceito_por = quem;
    m.aceito_em = new Date();
    await this.movRepo.save(m);
    await this.historico(
      m.bem_id,
      m.orgao_id,
      'TRANSFERIDO',
      `Transferido de ${m.setor_origem_nome || 'sem setor'} para ${m.setor_destino_nome} — ${como}`,
      quem,
    );
  }

  /** Página pública do link de aceite (lote). */
  async obterLotePorToken(token: string) {
    if (!/^[a-f0-9]{64}$/i.test(token || '')) throw new NotFoundException('Link inválido');
    const linhas = await this.movRepo.find({ where: { token_aceite: token.toLowerCase() }, relations: ['bem', 'bem.categoria'], order: { created_at: 'ASC' } });
    if (!linhas.length) throw new NotFoundException('Transferência não encontrada');
    const orgao = await this.orgaoRepo.findOne({ where: { id: linhas[0].orgao_id }, select: ['id', 'nome', 'nome_fantasia'] });
    const p = linhas[0];
    return {
      orgao: { nome: orgao?.nome_fantasia || orgao?.nome || '' },
      lote_id: p.lote_id,
      status: linhas.every((m) => m.status === StatusMovimentacao.PENDENTE) ? 'PENDENTE' : linhas[0].status,
      setor_origem_nome: p.setor_origem_nome,
      setor_destino_nome: p.setor_destino_nome,
      responsavel_destino_nome: p.responsavel_destino_nome,
      solicitado_por: p.solicitado_por,
      motivo: p.motivo,
      created_at: p.created_at,
      aceito_por: p.aceito_por,
      aceito_em: p.aceito_em,
      recusa_motivo: p.recusa_motivo,
      bens: linhas.map((m) => ({
        id: m.bem?.id,
        plaqueta: m.bem?.plaqueta,
        descricao: m.bem?.descricao,
        categoria: m.bem?.categoria?.nome || null,
        foto_url: m.bem?.foto_url || null,
        setor_origem_nome: m.setor_origem_nome,
        status: m.status,
      })),
    };
  }

  async responderLote(token: string, input: { nome: string; aceitar: boolean; motivo?: string }) {
    if (!/^[a-f0-9]{64}$/i.test(token || '')) throw new NotFoundException('Link inválido');
    const nome = String(input.nome || '').trim();
    if (nome.length < 3) throw new BadRequestException('Informe seu nome');
    const linhas = await this.movRepo.find({ where: { token_aceite: token.toLowerCase(), status: StatusMovimentacao.PENDENTE } });
    if (!linhas.length) throw new BadRequestException('Esta transferência já foi respondida ou cancelada');
    for (const m of linhas) {
      if (input.aceitar) {
        await this.aplicarTransferencia(m, nome, 'aceite pelo link');
      } else {
        m.status = StatusMovimentacao.RECUSADA;
        m.aceito_por = nome;
        m.aceito_em = new Date();
        m.recusa_motivo = input.motivo?.trim() || null;
        await this.movRepo.save(m);
        await this.historico(m.bem_id, m.orgao_id, 'TRANSFERENCIA_RECUSADA', `Transferência para ${m.setor_destino_nome} recusada por ${nome}${m.recusa_motivo ? `: ${m.recusa_motivo}` : ''}`, nome);
      }
    }
    return { ok: true, aceita: !!input.aceitar, quantidade: linhas.length };
  }

  async cancelar(orgaoId: string, id: string, usuarioNome: string) {
    const m = await this.movRepo.findOne({ where: { id, orgao_id: orgaoId } });
    if (!m) throw new NotFoundException('Movimentação não encontrada');
    if (m.status !== StatusMovimentacao.PENDENTE) throw new BadRequestException('Só transferências aguardando aceite podem ser canceladas');
    m.status = StatusMovimentacao.CANCELADA;
    await this.movRepo.save(m);
    await this.historico(m.bem_id, orgaoId, 'TRANSFERENCIA_CANCELADA', `Transferência para ${m.setor_destino_nome} cancelada por ${usuarioNome}`, usuarioNome);
    return m;
  }

  // ─── BAIXA ─────────────────────────────────────────────────────────

  async baixar(orgaoId: string, dto: BaixarBemDto, usuarioNome: string) {
    const bem = await this.bemRepo.findOne({ where: { id: dto.bem_id, orgao_id: orgaoId }, relations: ['setor'] });
    if (!bem) throw new NotFoundException('Bem não encontrado');
    if (bem.status === StatusBem.BAIXADO) throw new BadRequestException('Este bem já está baixado');
    if (!dto.motivo?.trim()) throw new BadRequestException('Descreva o motivo da baixa');
    const pend = await this.movRepo.findOne({ where: { bem_id: bem.id, status: StatusMovimentacao.PENDENTE } });
    if (pend) throw new BadRequestException('Há uma transferência pendente para este bem; cancele-a antes da baixa');

    const dataBaixa = dto.data_baixa ? new Date(dto.data_baixa) : new Date();
    const mov = await this.movRepo.save(
      this.movRepo.create({
        orgao_id: orgaoId,
        bem_id: bem.id,
        lote_id: randomUUID(),
        tipo: TipoMovimentacao.BAIXA,
        status: StatusMovimentacao.CONCLUIDA,
        setor_origem_id: bem.setor_id,
        setor_origem_nome: bem.setor?.nome || bem.localizacao_nome || null,
        responsavel_origem_nome: bem.responsavel_nome || null,
        motivo: dto.motivo.trim(),
        motivo_baixa: dto.motivo_baixa,
        documento_url: dto.documento_url || null,
        solicitado_por: usuarioNome,
        aceito_por: usuarioNome,
        aceito_em: new Date(),
        inventario_id: dto.inventario_id || null,
      }),
    );
    bem.status = StatusBem.BAIXADO;
    bem.data_baixa = dataBaixa;
    bem.motivo_baixa = dto.motivo_baixa;
    bem.emprestado_para = null;
    bem.emprestado_ate = null;
    await this.bemRepo.save(bem);
    await this.historico(bem.id, orgaoId, 'BAIXADO', `Baixa (${MOTIVO_BAIXA_LABEL[dto.motivo_baixa]}): ${dto.motivo.trim()}`, usuarioNome);
    return mov;
  }

  // ─── EMPRÉSTIMO ────────────────────────────────────────────────────

  async emprestar(orgaoId: string, dto: EmprestarBemDto, usuarioNome: string) {
    const bem = await this.bemRepo.findOne({ where: { id: dto.bem_id, orgao_id: orgaoId }, relations: ['setor'] });
    if (!bem) throw new NotFoundException('Bem não encontrado');
    if (bem.status === StatusBem.BAIXADO) throw new BadRequestException('Bem baixado não pode ser emprestado');
    if (bem.emprestado_ate) throw new BadRequestException('Este bem já está emprestado');
    const destino = String(dto.destino_texto || '').trim();
    if (destino.length < 3) throw new BadRequestException('Informe para quem ou para onde o bem vai');
    const mov = await this.movRepo.save(
      this.movRepo.create({
        orgao_id: orgaoId,
        bem_id: bem.id,
        lote_id: randomUUID(),
        tipo: TipoMovimentacao.EMPRESTIMO,
        status: StatusMovimentacao.EM_ANDAMENTO,
        setor_origem_id: bem.setor_id,
        setor_origem_nome: bem.setor?.nome || bem.localizacao_nome || null,
        responsavel_origem_nome: bem.responsavel_nome || null,
        destino_texto: destino,
        responsavel_destino_nome: dto.responsavel_destino_nome?.trim() || null,
        data_prevista_retorno: new Date(dto.data_prevista_retorno),
        motivo: dto.motivo?.trim() || null,
        solicitado_por: usuarioNome,
      }),
    );
    bem.emprestado_para = destino;
    bem.emprestado_ate = new Date(dto.data_prevista_retorno);
    await this.bemRepo.save(bem);
    await this.historico(bem.id, orgaoId, 'EMPRESTADO', `Emprestado para ${destino}, retorno previsto ${fmtData(dto.data_prevista_retorno)}`, usuarioNome);
    return mov;
  }

  async devolver(orgaoId: string, id: string, usuarioNome: string) {
    const m = await this.movRepo.findOne({ where: { id, orgao_id: orgaoId, tipo: TipoMovimentacao.EMPRESTIMO } });
    if (!m) throw new NotFoundException('Empréstimo não encontrado');
    if (m.status !== StatusMovimentacao.EM_ANDAMENTO) throw new BadRequestException('Este empréstimo já foi encerrado');
    m.status = StatusMovimentacao.CONCLUIDA;
    m.data_retorno = new Date();
    m.aceito_por = usuarioNome;
    m.aceito_em = new Date();
    await this.movRepo.save(m);
    const bem = await this.bemRepo.findOne({ where: { id: m.bem_id } });
    if (bem) {
      bem.emprestado_para = null;
      bem.emprestado_ate = null;
      await this.bemRepo.save(bem);
    }
    await this.historico(m.bem_id, orgaoId, 'DEVOLVIDO', `Devolvido de ${m.destino_texto}`, usuarioNome);
    return m;
  }

  async emprestimosVencidos(orgaoId: string) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return this.movRepo.find({
      where: { orgao_id: orgaoId, tipo: TipoMovimentacao.EMPRESTIMO, status: StatusMovimentacao.EM_ANDAMENTO, data_prevista_retorno: LessThan(hoje) },
      relations: ['bem'],
      order: { data_prevista_retorno: 'ASC' },
    });
  }

  // ─── CONSULTAS ─────────────────────────────────────────────────────

  async listar(orgaoId: string, filtros?: { tipo?: TipoMovimentacao; status?: StatusMovimentacao; bem_id?: string; setor_id?: string }) {
    const qb = this.movRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.bem', 'bem')
      .where('m.orgao_id = :orgaoId', { orgaoId });
    if (filtros?.tipo) qb.andWhere('m.tipo = :tipo', { tipo: filtros.tipo });
    if (filtros?.status) qb.andWhere('m.status = :status', { status: filtros.status });
    if (filtros?.bem_id) qb.andWhere('m.bem_id = :bemId', { bemId: filtros.bem_id });
    if (filtros?.setor_id) qb.andWhere('(m.setor_origem_id = :setorId OR m.setor_destino_id = :setorId)', { setorId: filtros.setor_id });
    qb.orderBy('m.created_at', 'DESC').take(500);
    const linhas = await qb.getMany();
    return linhas.map((m) => ({
      ...m,
      link_aceite: m.token_aceite && m.status === StatusMovimentacao.PENDENTE ? `${appUrl()}/m/${m.token_aceite}` : null,
      bem: m.bem ? { id: m.bem.id, plaqueta: m.bem.plaqueta, descricao: m.bem.descricao, status: m.bem.status } : null,
    }));
  }

  // ─── TERMOS EM PDF ─────────────────────────────────────────────────

  private novoPdf(): { doc: PDFKit.PDFDocument; fim: Promise<Buffer> } {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const fim = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
    return { doc, fim };
  }

  private cabecalho(doc: PDFKit.PDFDocument, orgaoNome: string, titulo: string) {
    doc.font('Helvetica-Bold').fontSize(12).text(orgaoNome.toUpperCase(), { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(14).text(titulo, { align: 'center' });
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(9).fillColor('#555').text(`Emitido em ${fmtDataHora(new Date())} pelo Portal DCP`, { align: 'center' });
    doc.fillColor('#000').moveDown(1);
  }

  private tabelaBens(doc: PDFKit.PDFDocument, bens: { plaqueta: string | null; descricao: string; extra?: string; valor?: number | null }[], comValor = false) {
    const x0 = doc.page.margins.left;
    const larguras = comValor ? [70, 270, 80, 75] : [70, 330, 95];
    const cab = comValor ? ['Plaqueta', 'Descrição', 'Setor/obs.', 'Valor'] : ['Plaqueta', 'Descrição', 'Observação'];
    const linha = (cols: string[], bold = false) => {
      const y = doc.y;
      let x = x0;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
      const alturas = cols.map((c, i) => doc.heightOfString(c || '', { width: larguras[i] - 6 }));
      const h = Math.max(...alturas, 12) + 4;
      if (y + h > doc.page.height - doc.page.margins.bottom - 60) {
        doc.addPage();
      }
      const yy = doc.y;
      cols.forEach((c, i) => {
        doc.text(c || '', x + 3, yy + 2, { width: larguras[i] - 6, align: i === cols.length - 1 && comValor ? 'right' : 'left' });
        x += larguras[i];
      });
      doc.moveTo(x0, yy + h).lineTo(x0 + larguras.reduce((a, b) => a + b, 0), yy + h).lineWidth(0.3).strokeColor('#999').stroke();
      doc.y = yy + h;
      doc.x = x0;
    };
    linha(cab, true);
    let total = 0;
    for (const b of bens) {
      total += Number(b.valor || 0);
      linha(comValor ? [b.plaqueta || '—', b.descricao, b.extra || '', b.valor != null ? fmtMoeda(b.valor) : '—'] : [b.plaqueta || '—', b.descricao, b.extra || '']);
    }
    if (comValor) linha(['', `Total: ${bens.length} bem(ns)`, '', fmtMoeda(total)], true);
    doc.moveDown(1);
  }

  private assinaturas(doc: PDFKit.PDFDocument, pares: { rotulo: string; nome?: string | null }[]) {
    if (doc.y > doc.page.height - 170) doc.addPage();
    doc.moveDown(2);
    const largura = (doc.page.width - doc.page.margins.left - doc.page.margins.right - 40 * (pares.length - 1)) / pares.length;
    const y = doc.y + 30;
    pares.forEach((p, i) => {
      const x = doc.page.margins.left + i * (largura + 40);
      doc.moveTo(x, y).lineTo(x + largura, y).lineWidth(0.6).strokeColor('#000').stroke();
      doc.font('Helvetica-Bold').fontSize(9).text(p.nome || '', x, y + 4, { width: largura, align: 'center' });
      doc.font('Helvetica').fontSize(8).fillColor('#444').text(p.rotulo, x, y + 16, { width: largura, align: 'center' });
      doc.fillColor('#000');
    });
    doc.y = y + 40;
  }

  /** Termo de transferência do lote (após aceite ou aplicação direta). */
  async termoTransferenciaPdf(orgaoId: string, loteId: string): Promise<Buffer> {
    const linhas = await this.movRepo.find({ where: { orgao_id: orgaoId, lote_id: loteId, tipo: TipoMovimentacao.TRANSFERENCIA }, relations: ['bem'], order: { created_at: 'ASC' } });
    if (!linhas.length) throw new NotFoundException('Lote não encontrado');
    const orgao = await this.orgaoRepo.findOne({ where: { id: orgaoId }, select: ['id', 'nome', 'nome_fantasia'] });
    const p = linhas[0];
    const { doc, fim } = this.novoPdf();
    this.cabecalho(doc, orgao?.nome_fantasia || orgao?.nome || 'Órgão', 'TERMO DE TRANSFERÊNCIA DE BENS PATRIMONIAIS');
    doc.font('Helvetica').fontSize(10);
    doc.text(`Setor de origem: ${p.setor_origem_nome || 'sem setor'}${p.responsavel_origem_nome ? ` (responsável: ${p.responsavel_origem_nome})` : ''}`);
    doc.text(`Setor de destino: ${p.setor_destino_nome}${p.responsavel_destino_nome ? ` (responsável: ${p.responsavel_destino_nome})` : ''}`);
    doc.text(`Solicitado por: ${p.solicitado_por || '—'} em ${fmtDataHora(p.created_at)}`);
    doc.text(`Situação: ${p.status === StatusMovimentacao.ACEITA ? `aceita por ${p.aceito_por} em ${fmtDataHora(p.aceito_em)}` : p.status.toLowerCase()}`);
    if (p.motivo) doc.text(`Motivo: ${p.motivo}`);
    doc.moveDown(1);
    doc.text('Os bens abaixo relacionados passam à guarda e responsabilidade do setor de destino a partir do aceite, nos termos da legislação de controle patrimonial aplicável.');
    doc.moveDown(1);
    this.tabelaBens(doc, linhas.map((m) => ({ plaqueta: m.bem?.plaqueta || null, descricao: m.bem?.descricao || '', extra: m.status !== p.status ? m.status : '' })));
    this.assinaturas(doc, [
      { rotulo: 'Responsável pelo setor de origem', nome: p.responsavel_origem_nome },
      { rotulo: 'Responsável pelo setor de destino', nome: p.aceito_por || p.responsavel_destino_nome },
    ]);
    doc.end();
    return fim;
  }

  /** Termo de responsabilidade: relação dos bens ativos do setor. */
  async termoResponsabilidadePdf(orgaoId: string, setorId: string, responsavelNome?: string): Promise<Buffer> {
    const setor = await this.setorRepo.findOne({ where: { id: setorId, orgao_id: orgaoId } });
    if (!setor) throw new NotFoundException('Setor não encontrado');
    const bens = await this.bemRepo.find({
      where: { orgao_id: orgaoId, setor_id: setorId, status: In([StatusBem.ATIVO, StatusBem.EM_MANUTENCAO]) },
      relations: ['categoria'],
      order: { plaqueta: 'ASC' },
    });
    const orgao = await this.orgaoRepo.findOne({ where: { id: orgaoId }, select: ['id', 'nome', 'nome_fantasia'] });
    const responsavel = responsavelNome?.trim() || bens.find((b) => b.responsavel_nome)?.responsavel_nome || '';
    const { doc, fim } = this.novoPdf();
    this.cabecalho(doc, orgao?.nome_fantasia || orgao?.nome || 'Órgão', 'TERMO DE RESPONSABILIDADE — BENS PATRIMONIAIS');
    doc.font('Helvetica').fontSize(10);
    doc.text(`Setor: ${setor.nome}${setor.codigo ? ` (${setor.codigo})` : ''}`);
    doc.text(`Responsável: ${responsavel || '____________________________'}`);
    doc.moveDown(1);
    doc.text(
      `Declaro ter recebido e manter sob minha guarda os bens patrimoniais abaixo relacionados, comprometendo-me a zelar pela sua conservação, comunicar qualquer movimentação, avaria ou extravio ao setor de patrimônio e apresentá-los quando solicitado em inventário.`,
      { align: 'justify' },
    );
    doc.moveDown(1);
    this.tabelaBens(
      doc,
      bens.map((b) => ({ plaqueta: b.plaqueta, descricao: b.descricao, extra: [b.categoria?.nome, b.emprestado_para ? `emprestado a ${b.emprestado_para}` : ''].filter(Boolean).join(' · '), valor: b.valor_aquisicao })),
      true,
    );
    this.assinaturas(doc, [
      { rotulo: 'Responsável pelo setor', nome: responsavel },
      { rotulo: 'Setor de patrimônio / comissão', nome: '' },
    ]);
    doc.end();
    return fim;
  }

  /** Termo de baixa de um bem. */
  async termoBaixaPdf(orgaoId: string, movId: string): Promise<Buffer> {
    const m = await this.movRepo.findOne({ where: { id: movId, orgao_id: orgaoId, tipo: TipoMovimentacao.BAIXA }, relations: ['bem', 'bem.categoria'] });
    if (!m) throw new NotFoundException('Baixa não encontrada');
    const orgao = await this.orgaoRepo.findOne({ where: { id: orgaoId }, select: ['id', 'nome', 'nome_fantasia'] });
    const { doc, fim } = this.novoPdf();
    this.cabecalho(doc, orgao?.nome_fantasia || orgao?.nome || 'Órgão', 'TERMO DE BAIXA DE BEM PATRIMONIAL');
    doc.font('Helvetica').fontSize(10);
    doc.text(`Bem: ${m.bem?.plaqueta || '—'} — ${m.bem?.descricao}`);
    doc.text(`Categoria: ${m.bem?.categoria?.nome || '—'}`);
    doc.text(`Setor de origem: ${m.setor_origem_nome || '—'}${m.responsavel_origem_nome ? ` (${m.responsavel_origem_nome})` : ''}`);
    doc.text(`Valor de aquisição: ${m.bem?.valor_aquisicao != null ? fmtMoeda(m.bem.valor_aquisicao) : '—'}${m.bem?.data_aquisicao ? ` em ${fmtData(m.bem.data_aquisicao)}` : ''}`);
    doc.text(`Motivo da baixa: ${m.motivo_baixa ? MOTIVO_BAIXA_LABEL[m.motivo_baixa] : '—'}`);
    doc.text(`Justificativa: ${m.motivo || '—'}`);
    doc.text(`Data da baixa: ${fmtData(m.bem?.data_baixa)} · registrada por ${m.solicitado_por || '—'} em ${fmtDataHora(m.created_at)}`);
    if (m.documento_url) doc.text(`Documento anexado: ${m.documento_url}`);
    this.assinaturas(doc, [
      { rotulo: 'Responsável pelo setor', nome: m.responsavel_origem_nome },
      { rotulo: 'Comissão de patrimônio', nome: '' },
      { rotulo: 'Autoridade competente', nome: '' },
    ]);
    doc.end();
    return fim;
  }
}

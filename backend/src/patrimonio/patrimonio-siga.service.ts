import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Writable } from 'stream';
import PDFDocument = require('pdfkit');
import { Orgao } from '../orgaos/entities/orgao.entity';
import { Setor } from '../orgaos/entities/setor.entity';
import { configSigaDoOrgao, ConfigSiga, pendenciasConfigSiga } from '../siga/siga-config.controller';
import { montarArquivosSiga, SIGA_MAX_LINHAS } from '../siga/siga-arquivo.util';
import { BemPatrimonial } from './entities/bem-patrimonial.entity';
import { CategoriaBem } from './entities/categoria-bem.entity';
import { HistoricoBem } from './entities/historico-bem.entity';
import { StatusBem, TipoBem } from './entities/enums';
import {
  chaveTombo,
  cpfValido,
  linhaPatrimonioSiga,
  PendenciaSiga,
  pendenciasBemSiga,
  ROTULOS_PENDENCIA_SIGA,
  somenteDigitos,
  tipoSigaEfetivo,
  tipoSigaValido,
  TIPOS_BEM_SIGA,
  tombosRepetidos,
  TipoPendenciaSiga,
} from './siga-patrimonio.util';
import { sugerirTipoSiga } from './siga-classificacao.util';
import { decodificarImagem, paraPng, recortarMargem, reduzir } from './brasao-imagem.util';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const archiver = require('archiver');

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
const POR_PAGINA = 50;
/** Setor especial para os bens sem setor no cadastro. */
export const SEM_SETOR = 'SEM_SETOR';

const fmtMoeda = (v: any) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtData = (d?: Date | string | null) => (d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—');

/** Data de hoje em Brasília (aaaammdd). */
function hojeBrasilia(): string {
  const b = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return `${b.getUTCFullYear()}${String(b.getUTCMonth() + 1).padStart(2, '0')}${String(b.getUTCDate()).padStart(2, '0')}`;
}

/** Ordena por tombo numérico quando possível. */
function compararTombo(a: BemPatrimonial, b: BemPatrimonial) {
  const na = Number(a.plaqueta);
  const nb = Number(b.plaqueta);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return String(a.plaqueta || '').localeCompare(String(b.plaqueta || ''), 'pt-BR', { numeric: true });
}

interface BemAvaliado {
  bem: BemPatrimonial;
  pendencias: PendenciaSiga[];
}

/**
 * Exportação do patrimônio para o SIGA do TCM-BA (arquivo "Patrimonio",
 * tabela 69). O SIGA só aceita inclusão por arquivo: bem já enviado não vai
 * de novo, e baixa de bem já enviado é digitada na tela do SIGA.
 */
@Injectable()
export class PatrimonioSigaService {
  private readonly logger = new Logger(PatrimonioSigaService.name);

  constructor(
    @InjectRepository(BemPatrimonial) private readonly bemRepo: Repository<BemPatrimonial>,
    @InjectRepository(CategoriaBem) private readonly categoriaRepo: Repository<CategoriaBem>,
    @InjectRepository(HistoricoBem) private readonly historicoRepo: Repository<HistoricoBem>,
    @InjectRepository(Setor) private readonly setorRepo: Repository<Setor>,
    @InjectRepository(Orgao) private readonly orgaoRepo: Repository<Orgao>,
  ) {}

  // ─── Base ─────────────────────────────────────────────────────────

  private async orgaoEConfig(orgaoId: string): Promise<{ orgao: Orgao; config: ConfigSiga; pendencias: string[] }> {
    const orgao = await this.orgaoRepo.findOne({ where: { id: orgaoId } });
    if (!orgao) throw new NotFoundException('Órgão não encontrado');
    const config = configSigaDoOrgao(orgao);
    return { orgao, config, pendencias: pendenciasConfigSiga(config) };
  }

  /** Bens próprios do órgão (locados, de servidor e em comodato não são patrimônio do órgão). */
  private async bensDoOrgao(orgaoId: string): Promise<BemPatrimonial[]> {
    const bens = await this.bemRepo
      .createQueryBuilder('bem')
      .leftJoinAndSelect('bem.categoria', 'categoria')
      .leftJoinAndSelect('bem.setor', 'setor')
      .where('bem.orgao_id = :orgaoId', { orgaoId })
      .andWhere('bem.tipo = :tipo', { tipo: TipoBem.BEM_PROPRIO })
      .andWhere('bem.status <> :devolvido', { devolvido: StatusBem.DEVOLVIDO })
      .getMany();
    return bens.sort(compararTombo);
  }

  /** Bens ainda não enviados, cada um com suas pendências (inclui tombo repetido). */
  private avaliar(bens: BemPatrimonial[]): BemAvaliado[] {
    const repetidos = tombosRepetidos(bens);
    return bens
      .filter((b) => !b.siga_enviado_em)
      .map((bem) => {
        const pendencias = pendenciasBemSiga(bem);
        if (repetidos.has(chaveTombo(bem.plaqueta)))
          pendencias.push({ tipo: 'TOMBO_DUPLICADO', mensagem: `O tombo "${bem.plaqueta}" aparece em mais de um bem.` });
        return { bem, pendencias };
      });
  }

  private resumoBem(b: BemPatrimonial) {
    return {
      id: b.id,
      plaqueta: b.plaqueta,
      descricao: b.descricao,
      categoria_nome: b.categoria?.nome || null,
      setor_nome: b.setor?.nome || b.localizacao_nome || null,
      responsavel_nome: b.responsavel_nome || null,
      data_aquisicao: b.data_aquisicao,
      valor_aquisicao: b.valor_aquisicao,
      siga_tipo_bem: tipoSigaEfetivo(b),
    };
  }

  // ─── Resumo e pendências ──────────────────────────────────────────

  async resumo(orgaoId: string) {
    const [{ config, pendencias: pendenciasConfig }, bens] = await Promise.all([this.orgaoEConfig(orgaoId), this.bensDoOrgao(orgaoId)]);
    const avaliados = this.avaliar(bens);
    const prontos = avaliados.filter((a) => !a.pendencias.length).length;
    const porTipo: Partial<Record<TipoPendenciaSiga, number>> = {};
    for (const a of avaliados) for (const t of new Set(a.pendencias.map((p) => p.tipo))) porTipo[t] = (porTipo[t] || 0) + 1;
    const porArquivo = SIGA_MAX_LINHAS - 2;
    return {
      config,
      config_pendencias: pendenciasConfig,
      total: bens.length,
      prontos,
      com_pendencia: avaliados.length - prontos,
      enviados: bens.length - avaliados.length,
      baixas_a_lancar: bens.filter((b) => this.baixaALancar(b)).length,
      partes_arquivo: prontos ? Math.ceil(prontos / porArquivo) : 0,
      pendencias_por_tipo: Object.entries(porTipo)
        .map(([tipo, quantidade]) => ({ tipo, rotulo: ROTULOS_PENDENCIA_SIGA[tipo as TipoPendenciaSiga], quantidade }))
        .sort((a, b) => b.quantidade - a.quantidade),
      tipos_bem: TIPOS_BEM_SIGA,
    };
  }

  async pendencias(orgaoId: string, tipo?: string, pagina = 1) {
    const bens = await this.bensDoOrgao(orgaoId);
    let lista = this.avaliar(bens).filter((a) => a.pendencias.length);
    if (tipo) lista = lista.filter((a) => a.pendencias.some((p) => p.tipo === tipo));
    const page = Math.max(1, Math.floor(Number(pagina) || 1));
    return {
      total: lista.length,
      pagina: page,
      por_pagina: POR_PAGINA,
      itens: lista.slice((page - 1) * POR_PAGINA, page * POR_PAGINA).map((a) => ({ ...this.resumoBem(a.bem), pendencias: a.pendencias })),
    };
  }

  // ─── Classificação (tipo SIGA) ─────────────────────────────────────

  async sugestoesClassificacao(orgaoId: string, pagina = 1, comSugestao?: boolean) {
    const bens = (await this.bensDoOrgao(orgaoId)).filter((b) => !tipoSigaEfetivo(b));
    let lista = bens.map((b) => ({ ...this.resumoBem(b), sugestao: sugerirTipoSiga(b.descricao) }));
    const totalComSugestao = lista.filter((i) => i.sugestao).length;
    if (comSugestao === true) lista = lista.filter((i) => i.sugestao);
    if (comSugestao === false) lista = lista.filter((i) => !i.sugestao);
    const page = Math.max(1, Math.floor(Number(pagina) || 1));
    const porPagina = 100;
    return {
      total_sem_tipo: bens.length,
      total_com_sugestao: totalComSugestao,
      total: lista.length,
      pagina: page,
      por_pagina: porPagina,
      itens: lista.slice((page - 1) * porPagina, page * porPagina),
    };
  }

  async aplicarClassificacao(orgaoId: string, itens: { bem_id: string; siga_tipo_bem: number | null }[]) {
    if (!Array.isArray(itens) || !itens.length) throw new BadRequestException('Nenhum bem selecionado.');
    const porTipo = new Map<number | null, string[]>();
    for (const i of itens) {
      const tipo = i?.siga_tipo_bem === null || i?.siga_tipo_bem === undefined ? null : Number(i.siga_tipo_bem);
      if (tipo !== null && !tipoSigaValido(tipo)) throw new BadRequestException(`Tipo SIGA inválido: ${i.siga_tipo_bem}. Use de 1 a 9.`);
      if (!i?.bem_id) continue;
      porTipo.set(tipo, [...(porTipo.get(tipo) || []), String(i.bem_id)]);
    }
    let atualizados = 0;
    for (const [tipo, ids] of porTipo) {
      for (let i = 0; i < ids.length; i += 500) {
        const r = await this.bemRepo.update({ orgao_id: orgaoId, id: In(ids.slice(i, i + 500)) }, { siga_tipo_bem: tipo });
        atualizados += r.affected || 0;
      }
    }
    return { atualizados };
  }

  async classificarCategoria(orgaoId: string, categoriaId: string, tipo: number | null) {
    if (tipo !== null && !tipoSigaValido(tipo)) throw new BadRequestException('Tipo SIGA inválido. Use de 1 a 9.');
    const categoria = await this.categoriaRepo.findOne({
      where: [
        { id: categoriaId, orgao_id: orgaoId },
        { id: categoriaId, sistema: true },
      ],
    });
    if (!categoria) throw new NotFoundException('Categoria não encontrada');
    categoria.siga_tipo_bem = tipo;
    await this.categoriaRepo.save(categoria);
    return categoria;
  }

  // ─── Responsável por setor ─────────────────────────────────────────

  async aplicarResponsavelPorSetor(
    orgaoId: string,
    body: { setor_id: string; nome: string; cpf: string; somente_sem_responsavel?: boolean },
  ) {
    const nome = String(body?.nome || '').trim();
    const cpf = somenteDigitos(body?.cpf);
    if (!body?.setor_id) throw new BadRequestException('Escolha o setor.');
    if (!nome) throw new BadRequestException('Informe o nome do responsável.');
    if (!cpfValido(cpf)) throw new BadRequestException('CPF inválido. Confira os dígitos.');

    const qb = this.bemRepo
      .createQueryBuilder()
      .update(BemPatrimonial)
      .set({ responsavel_nome: nome, responsavel_cpf: cpf })
      .where('orgao_id = :orgaoId', { orgaoId });
    if (body.setor_id === SEM_SETOR) {
      qb.andWhere('setor_id IS NULL');
    } else {
      const setor = await this.setorRepo.findOne({ where: { id: body.setor_id, orgao_id: orgaoId } });
      if (!setor) throw new NotFoundException('Setor não encontrado');
      qb.andWhere('setor_id = :setorId', { setorId: setor.id });
    }
    if (body.somente_sem_responsavel) {
      // Sem responsável, ou com o mesmo nome e ainda sem CPF.
      qb.andWhere(
        "(responsavel_nome IS NULL OR TRIM(responsavel_nome) = '' OR (LOWER(TRIM(responsavel_nome)) = LOWER(:nome) AND (responsavel_cpf IS NULL OR responsavel_cpf = '')))",
        { nome },
      );
    }
    const r = await qb.execute();
    return { atualizados: r.affected || 0 };
  }

  // ─── Arquivo ───────────────────────────────────────────────────────

  /** Bens que entram no arquivo: sem pendência e, por padrão, ainda não enviados. */
  private async bensDoArquivo(orgaoId: string, somenteNaoEnviados: boolean) {
    const { orgao, config, pendencias } = await this.orgaoEConfig(orgaoId);
    if (pendencias.length)
      throw new BadRequestException(`Complete a configuração do SIGA antes de gerar o arquivo: ${pendencias.join(', ')}.`);
    const bens = await this.bensDoOrgao(orgaoId);
    const repetidos = tombosRepetidos(bens);
    const incluidos = bens.filter(
      (b) =>
        (!somenteNaoEnviados || !b.siga_enviado_em) &&
        !repetidos.has(chaveTombo(b.plaqueta)) &&
        !pendenciasBemSiga(b).length,
    );
    return { orgao, config, bens: incluidos };
  }

  async idsDoArquivo(orgaoId: string, somenteNaoEnviados = true) {
    const { bens } = await this.bensDoArquivo(orgaoId, somenteNaoEnviados);
    return { total: bens.length, bem_ids: bens.map((b) => b.id) };
  }

  /**
   * Arquivo "Patrimonio" pronto para o SIGA Captura. Até 4.998 bens vai um
   * .txt; acima disso, um .zip com as partes (ou só a `parte` pedida).
   * Não marca nada como enviado: isso é feito depois da importação.
   */
  async gerarArquivo(orgaoId: string, somenteNaoEnviados = true, parte?: number) {
    const { orgao, config, bens } = await this.bensDoArquivo(orgaoId, somenteNaoEnviados);
    if (!bens.length) throw new BadRequestException('Nenhum bem pronto para o arquivo (todos já enviados ou com pendência).');
    const cfg = { ...config, codigo_unidade: config.codigo_unidade! };
    const base = `Patrimonio_${config.codigo_unidade}_${hojeBrasilia()}`;
    const arquivos = montarArquivosSiga(
      { identificacao: 'Patrimonio', codigoUnidade: cfg.codigo_unidade, nomeUnidade: orgao.nome },
      bens,
      (bem, seq) => linhaPatrimonioSiga(bem, cfg, seq),
      base,
    );
    if (parte !== undefined) {
      const escolhido = arquivos[parte - 1];
      if (!escolhido) throw new BadRequestException(`Parte ${parte} não existe (o arquivo tem ${arquivos.length} parte(s)).`);
      return { nome: escolhido.nome, buffer: escolhido.buffer, tipo: 'text/plain; charset=ISO-8859-1', partes: arquivos.length, registros: escolhido.registros };
    }
    if (arquivos.length === 1) {
      return { nome: arquivos[0].nome, buffer: arquivos[0].buffer, tipo: 'text/plain; charset=ISO-8859-1', partes: 1, registros: arquivos[0].registros };
    }
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const archive = archiver('zip', { zlib: { level: 9 } });
      const chunks: Buffer[] = [];
      const saida = new Writable({
        write(chunk: Buffer, _enc, cb) {
          chunks.push(chunk);
          cb();
        },
      });
      saida.on('finish', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);
      archive.pipe(saida);
      for (const a of arquivos) archive.append(a.buffer, { name: a.nome });
      archive.finalize();
    });
    return { nome: `${base}.zip`, buffer, tipo: 'application/zip', partes: arquivos.length, registros: bens.length };
  }

  /** Confirma a importação no SIGA Captura. Bem já baixado foi com a baixa no arquivo. */
  async marcarEnviados(orgaoId: string, bemIds: string[], usuarioNome: string) {
    if (!Array.isArray(bemIds) || !bemIds.length) throw new BadRequestException('Nenhum bem informado.');
    const agora = new Date();
    let marcados = 0;
    for (let i = 0; i < bemIds.length; i += 500) {
      const lote = await this.bemRepo.find({
        where: { orgao_id: orgaoId, id: In(bemIds.slice(i, i + 500).map(String)) },
        select: ['id', 'plaqueta', 'data_baixa', 'siga_enviado_em'],
      });
      const novos = lote.filter((b) => !b.siga_enviado_em);
      if (!novos.length) continue;
      const comBaixa = novos.filter((b) => b.data_baixa).map((b) => b.id);
      const semBaixa = novos.filter((b) => !b.data_baixa).map((b) => b.id);
      if (semBaixa.length) await this.bemRepo.update({ id: In(semBaixa) }, { siga_enviado_em: agora });
      if (comBaixa.length) await this.bemRepo.update({ id: In(comBaixa) }, { siga_enviado_em: agora, siga_baixa_lancada_em: agora });
      await this.historicoRepo.insert(
        novos.map((b) => ({
          bem_id: b.id,
          orgao_id: orgaoId,
          acao: 'SIGA_ENVIADO',
          descricao: `Bem importado no SIGA (TCM-BA) pelo arquivo Patrimonio${b.data_baixa ? ', já com a data de baixa' : ''}`,
          usuario_nome: usuarioNome,
        })),
      );
      marcados += novos.length;
    }
    return { marcados };
  }

  // ─── Baixas a lançar na tela do SIGA ───────────────────────────────

  private baixaALancar(b: BemPatrimonial) {
    return !!b.data_baixa && !!b.siga_enviado_em && !b.siga_baixa_lancada_em;
  }

  async baixasALancar(orgaoId: string) {
    const bens = (await this.bensDoOrgao(orgaoId)).filter((b) => this.baixaALancar(b));
    return bens.map((b) => ({
      ...this.resumoBem(b),
      data_baixa: b.data_baixa,
      motivo_baixa: b.motivo_baixa,
      siga_enviado_em: b.siga_enviado_em,
    }));
  }

  async marcarBaixasLancadas(orgaoId: string, bemIds: string[], usuarioNome: string) {
    if (!Array.isArray(bemIds) || !bemIds.length) throw new BadRequestException('Nenhum bem informado.');
    const bens = await this.bemRepo.find({ where: { orgao_id: orgaoId, id: In(bemIds.map(String)) } });
    const alvo = bens.filter((b) => this.baixaALancar(b));
    if (!alvo.length) return { marcados: 0 };
    const agora = new Date();
    await this.bemRepo.update({ id: In(alvo.map((b) => b.id)) }, { siga_baixa_lancada_em: agora });
    await this.historicoRepo.insert(
      alvo.map((b) => ({
        bem_id: b.id,
        orgao_id: orgaoId,
        acao: 'SIGA_BAIXA_LANCADA',
        descricao: `Baixa de ${fmtData(b.data_baixa)} lançada na tela do SIGA (TCM-BA)`,
        usuario_nome: usuarioNome,
      })),
    );
    return { marcados: alvo.length };
  }

  // ─── Inventário anual (e-TCM, Resolução TCM-BA 1060/05) ────────────

  private brasaoPng(orgao: Orgao): Buffer | null {
    if (!orgao.logo_url) return null;
    const caminho = join(UPLOAD_DIR, orgao.logo_url.replace(/^\/api\/uploads\//, ''));
    try {
      if (!existsSync(caminho)) return null;
      return paraPng(reduzir(recortarMargem(decodificarImagem(readFileSync(caminho))), 400));
    } catch (err: any) {
      this.logger.warn(`Brasão do órgão não pôde ser lido (${caminho}): ${err?.message}`);
      return null;
    }
  }

  /**
   * Inventário dos bens existentes em 31/12 do ano, por setor, com a certidão
   * de registro no Livro Tombo — anexo da prestação de contas no e-TCM.
   */
  async inventarioAnualPdf(orgaoId: string, ano: number): Promise<Buffer> {
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) throw new BadRequestException('Ano inválido.');
    const orgao = await this.orgaoRepo.findOne({ where: { id: orgaoId } });
    if (!orgao) throw new NotFoundException('Órgão não encontrado');
    const fimAno = `${ano}-12-31`;
    const iso = (d: any) => (d ? String(d instanceof Date ? d.toISOString() : d).slice(0, 10) : null);
    const bens = (await this.bensDoOrgao(orgaoId)).filter((b) => {
      const aq = iso(b.data_aquisicao);
      const bx = iso(b.data_baixa);
      return (!aq || aq <= fimAno) && (!bx || bx > fimAno);
    });

    const grupos = new Map<string, BemPatrimonial[]>();
    for (const b of bens) {
      const setor = b.setor?.nome || b.localizacao_nome || 'Sem setor';
      grupos.set(setor, [...(grupos.get(setor) || []), b]);
    }
    const setores = [...grupos.keys()].sort((a, b) => (a === 'Sem setor' ? 1 : b === 'Sem setor' ? -1 : a.localeCompare(b, 'pt-BR')));

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const fim = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const nomeOrgao = (orgao.nome || 'Órgão').toUpperCase();
    const brasao = this.brasaoPng(orgao);
    const x0 = doc.page.margins.left;
    const largura = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colunas = [
      { titulo: 'Tombo', w: 60, align: 'left' as const },
      { titulo: 'Descrição', w: 360, align: 'left' as const },
      { titulo: 'Tipo SIGA', w: 170, align: 'left' as const },
      { titulo: 'Aquisição', w: 65, align: 'center' as const },
      { titulo: 'Valor (R$)', w: largura - 60 - 360 - 170 - 65, align: 'right' as const },
    ];

    const cabecalho = () => {
      const y = doc.page.margins.top;
      if (brasao) {
        try {
          doc.image(brasao, x0, y, { fit: [48, 48] });
        } catch {
          /* imagem inválida: segue sem brasão */
        }
      }
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#000').text(nomeOrgao, x0, y + 4, { width: largura, align: 'center' });
      doc.fontSize(13).text(`INVENTÁRIO ANUAL DE BENS PATRIMONIAIS — EXERCÍCIO ${ano}`, x0, doc.y + 2, { width: largura, align: 'center' });
      doc.font('Helvetica').fontSize(8.5).fillColor('#555')
        .text(`Posição em 31/12/${ano} · Resolução TCM-BA nº 1060/05 · Emitido em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} pelo Portal DCP`, x0, doc.y + 2, { width: largura, align: 'center' });
      doc.fillColor('#000');
      doc.y = Math.max(doc.y, y + 52) + 8;
      doc.x = x0;
    };

    const linha = (cols: string[], opts: { negrito?: boolean; fundo?: string } = {}) => {
      doc.font(opts.negrito ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
      const alturas = cols.map((c, i) => doc.heightOfString(c || '', { width: colunas[i].w - 6 }));
      const h = Math.max(...alturas, 10) + 4;
      if (doc.y + h > doc.page.height - doc.page.margins.bottom - 10) {
        doc.addPage();
        cabecalho();
        linhaTitulos();
      }
      const y = doc.y;
      if (opts.fundo) doc.rect(x0, y, largura, h).fill(opts.fundo).fillColor('#000');
      let x = x0;
      doc.font(opts.negrito ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
      cols.forEach((c, i) => {
        doc.text(c || '', x + 3, y + 2, { width: colunas[i].w - 6, align: colunas[i].align });
        x += colunas[i].w;
      });
      doc.moveTo(x0, y + h).lineTo(x0 + largura, y + h).lineWidth(0.3).strokeColor('#999').stroke();
      doc.y = y + h;
      doc.x = x0;
    };
    const linhaTitulos = () => linha(colunas.map((c) => c.titulo), { negrito: true, fundo: '#e8e8e8' });
    const setorTitulo = (nome: string) => {
      if (doc.y + 40 > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        cabecalho();
      }
      doc.moveDown(0.6);
      doc.font('Helvetica-Bold').fontSize(10).text(`Setor: ${nome}`, x0, doc.y, { width: largura });
      doc.moveDown(0.2);
      linhaTitulos();
    };

    const valorBR = (v: any) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const tipoTexto = (b: BemPatrimonial) => {
      const t = tipoSigaEfetivo(b);
      return t ? `${t} - ${TIPOS_BEM_SIGA[t]}` : 'Não classificado';
    };

    cabecalho();
    if (!bens.length) {
      doc.font('Helvetica').fontSize(10).text(`Nenhum bem patrimonial existente em 31/12/${ano}.`, x0, doc.y + 10);
    }
    let totalGeral = 0;
    for (const nome of setores) {
      const lista = grupos.get(nome)!;
      setorTitulo(nome);
      let total = 0;
      for (const b of lista) {
        total += Number(b.valor_aquisicao || 0);
        linha([b.plaqueta || '—', b.descricao, tipoTexto(b), fmtData(b.data_aquisicao), b.valor_aquisicao != null ? valorBR(b.valor_aquisicao) : '—']);
      }
      linha(['', `Total do setor: ${lista.length} bem(ns)`, '', '', valorBR(total)], { negrito: true });
      totalGeral += total;
    }
    if (bens.length) {
      doc.moveDown(0.8);
      linha(['', `TOTAL GERAL: ${bens.length} bem(ns) em ${setores.length} setor(es)`, '', '', valorBR(totalGeral)], { negrito: true, fundo: '#e8e8e8' });
    }

    // Certidão
    doc.addPage();
    cabecalho();
    doc.moveDown(2);
    doc.font('Helvetica-Bold').fontSize(14).text('CERTIDÃO', x0, doc.y, { width: largura, align: 'center' });
    doc.moveDown(1.5);
    const margemTexto = 80;
    doc.font('Helvetica').fontSize(12).text(
      'Certifico, para fins de prestação de contas junto ao Tribunal de Contas dos Municípios do Estado da Bahia, que todos os bens patrimoniais relacionados neste inventário encontram-se registrados no Livro Tombo desta Casa.',
      x0 + margemTexto,
      doc.y,
      { width: largura - 2 * margemTexto, align: 'justify', lineGap: 4 },
    );
    doc.moveDown(1);
    doc.text(
      `O inventário relaciona ${bens.length} bem(ns), no valor total de ${fmtMoeda(totalGeral)}, na posição de 31 de dezembro de ${ano}.`,
      x0 + margemTexto,
      doc.y,
      { width: largura - 2 * margemTexto, align: 'justify', lineGap: 4 },
    );
    doc.moveDown(2);
    const local = [orgao.cidade, orgao.uf].filter(Boolean).join(' - ');
    doc.text(`${local ? local + ', ' : ''}____ de ______________ de ${ano + 1}.`, x0, doc.y, { width: largura, align: 'center' });

    const yAss = doc.y + 70;
    const larguraAss = 260;
    const espaco = (largura - 2 * larguraAss) / 3;
    const assinaturas = [
      { nome: orgao.responsavel_nome || '', rotulo: orgao.responsavel_cargo || 'Presidente da Câmara' },
      { nome: '', rotulo: 'Responsável pelo Patrimônio' },
    ];
    assinaturas.forEach((a, i) => {
      const x = x0 + espaco + i * (larguraAss + espaco);
      doc.moveTo(x, yAss).lineTo(x + larguraAss, yAss).lineWidth(0.6).strokeColor('#000').stroke();
      doc.font('Helvetica-Bold').fontSize(10).text(a.nome, x, yAss + 4, { width: larguraAss, align: 'center' });
      doc.font('Helvetica').fontSize(9).fillColor('#444').text(a.rotulo, x, yAss + (a.nome ? 18 : 4), { width: larguraAss, align: 'center' });
      doc.fillColor('#000');
    });

    doc.end();
    return fim;
  }
}

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { TabelaReferenciaPreco } from './entities/tabela-referencia-preco.entity';
import { ItemTabelaReferencia } from './entities/item-tabela-referencia.entity';
import { ItemCronograma } from './entities/item-cronograma.entity';
import { Contrato } from './entities/contrato.entity';

/** Linha estruturada de item de tabela de referência (import/preview). */
export interface ItemTabelaInput {
  categoria_codigo?: string | null;
  categoria_nome?: string | null;
  codigo?: string | null;
  descricao: string;
  valor_criacao?: number | null;
  valor_finalizacao?: number | null;
  valor_total?: number | null;
  valor_reformulacao?: number | null;
  unidade?: string | null;
  sob_orcamento?: boolean;
  observacoes?: string | null;
  ordem?: number;
}

/** Converte texto monetário pt-BR ("1.234,56" ou "R$ 1.234,56") em número. */
export function parseValorBR(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return isNaN(raw) ? null : raw;
  const s = String(raw).replace(/R\$/gi, '').trim();
  if (!s) return null;
  // pt-BR: ponto = milhar, vírgula = decimal
  const normalized = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return isNaN(n) ? null : n;
}

const CODE_RE = /^\d+[a-z]{1,3}$/;
const CAT_RE = /^\d+$/;

/**
 * Parser da tabela SINAPRO a partir de linhas de texto (uma por linha).
 * Reconhece cabeçalhos de categoria (ex.: "3"), códigos de item (ex.: "3p")
 * e valores monetários. Retorna itens estruturados.
 */
export function parseTabelaLinhas(lines: string[]): ItemTabelaInput[] {
  const clean = lines.map((l) => l.trim()).filter((l) => l.length > 0);
  const items: ItemTabelaInput[] = [];
  let catCod: string | null = null;
  let catNome: string | null = null;
  let j = 0;
  while (j < clean.length) {
    const ln = clean[j];
    if (CODE_RE.test(ln)) {
      const codigo = ln;
      const desc: string[] = [];
      const vals: number[] = [];
      let k = j + 1;
      while (k < clean.length && !CODE_RE.test(clean[k]) && !CAT_RE.test(clean[k])) {
        const moneys = clean[k].match(/R\$\s*[\d.]+,\d{2}/g);
        if (moneys) {
          for (const m of moneys) {
            const v = parseValorBR(m);
            if (v !== null) vals.push(v);
          }
        } else if (!/^\d+$/.test(clean[k])) {
          desc.push(clean[k]);
        }
        k++;
      }
      let criacao: number | null = null;
      let finaliz: number | null = null;
      let total: number | null = null;
      let reform: number | null = null;
      if (vals.length === 1) total = vals[0];
      else if (vals.length === 2) {
        criacao = vals[0];
        total = vals[1];
      } else if (vals.length >= 3) {
        criacao = vals[0];
        finaliz = vals[1];
        total = vals[2];
        reform = vals.length > 3 ? vals[3] : null;
      }
      const descricao = desc.join(' ').trim();
      items.push({
        categoria_codigo: catCod,
        categoria_nome: catNome,
        codigo,
        descricao,
        valor_criacao: criacao,
        valor_finalizacao: finaliz,
        valor_total: total,
        valor_reformulacao: reform,
        sob_orcamento: vals.length === 0,
        ordem: items.length,
      });
      j = k;
    } else if (CAT_RE.test(ln)) {
      catCod = ln;
      catNome = j + 1 < clean.length ? clean[j + 1] : null;
      j += 1;
    } else {
      j += 1;
    }
  }
  return items;
}

/** Extrai linhas de texto de um PDF preservando a estrutura por posição (y). */
async function extrairLinhasPdf(buffer: Buffer): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdfDoc = await loadingTask.promise;
  const linhas: string[] = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const content = await page.getTextContent();
    // Agrupa itens por linha usando a coordenada Y (transform[5])
    const buckets = new Map<number, { x: number; str: string }[]>();
    for (const it of content.items as any[]) {
      const str = (it.str || '').trim();
      if (!str) continue;
      const y = Math.round(it.transform[5]);
      const x = it.transform[4];
      // agrupa Y próximos (tolerância 2px)
      let key = y;
      for (const existing of buckets.keys()) {
        if (Math.abs(existing - y) <= 2) {
          key = existing;
          break;
        }
      }
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push({ x, str });
    }
    const ys = Array.from(buckets.keys()).sort((a, b) => b - a); // topo -> base
    for (const y of ys) {
      const parts = buckets.get(y)!.sort((a, b) => a.x - b.x);
      linhas.push(parts.map((p) => p.str).join(' '));
    }
  }
  return linhas;
}

@Injectable()
export class TabelaReferenciaService {
  private readonly logger = new Logger(TabelaReferenciaService.name);

  constructor(
    @InjectRepository(TabelaReferenciaPreco)
    private tabelaRepo: Repository<TabelaReferenciaPreco>,
    @InjectRepository(ItemTabelaReferencia)
    private itemRepo: Repository<ItemTabelaReferencia>,
    @InjectRepository(ItemCronograma)
    private itemCronogramaRepo: Repository<ItemCronograma>,
    @InjectRepository(Contrato)
    private contratoRepo: Repository<Contrato>,
  ) {}

  // ==========================================================================
  // CRUD de tabelas
  // ==========================================================================

  async listarTabelas(orgaoId: string): Promise<TabelaReferenciaPreco[]> {
    const tabelas = await this.tabelaRepo.find({
      where: { orgao_id: orgaoId },
      order: { created_at: 'DESC' },
    });
    // anexa contagem de itens
    for (const t of tabelas) {
      (t as any).total_itens = await this.itemRepo.count({ where: { tabela_id: t.id } });
    }
    return tabelas;
  }

  async buscarTabela(id: string): Promise<TabelaReferenciaPreco> {
    const tabela = await this.tabelaRepo.findOne({ where: { id } });
    if (!tabela) throw new NotFoundException('Tabela de referência não encontrada');
    return tabela;
  }

  async listarItens(tabelaId: string): Promise<ItemTabelaReferencia[]> {
    return this.itemRepo.find({ where: { tabela_id: tabelaId }, order: { ordem: 'ASC' } });
  }

  async criarTabela(
    orgaoId: string,
    dados: Partial<TabelaReferenciaPreco>,
    itens: ItemTabelaInput[] = [],
  ): Promise<TabelaReferenciaPreco> {
    const tabela = this.tabelaRepo.create({
      orgao_id: orgaoId,
      nome: dados.nome || 'Tabela de referência',
      fonte: dados.fonte ?? null,
      uf: dados.uf ?? null,
      edicao: dados.edicao ?? null,
      vigencia_inicio: dados.vigencia_inicio ?? null,
      vigencia_fim: dados.vigencia_fim ?? null,
      observacoes: dados.observacoes ?? null,
      ativa: dados.ativa ?? true,
      usuario_cadastro_id: dados.usuario_cadastro_id ?? null,
      usuario_cadastro_nome: dados.usuario_cadastro_nome ?? null,
    });
    const saved = await this.tabelaRepo.save(tabela);
    if (itens.length > 0) await this.inserirItens(saved.id, itens);
    return saved;
  }

  async atualizarTabela(id: string, dados: Partial<TabelaReferenciaPreco>): Promise<TabelaReferenciaPreco> {
    const tabela = await this.buscarTabela(id);
    Object.assign(tabela, {
      nome: dados.nome ?? tabela.nome,
      fonte: dados.fonte ?? tabela.fonte,
      uf: dados.uf ?? tabela.uf,
      edicao: dados.edicao ?? tabela.edicao,
      vigencia_inicio: dados.vigencia_inicio ?? tabela.vigencia_inicio,
      vigencia_fim: dados.vigencia_fim ?? tabela.vigencia_fim,
      observacoes: dados.observacoes ?? tabela.observacoes,
      ativa: dados.ativa ?? tabela.ativa,
    });
    return this.tabelaRepo.save(tabela);
  }

  async excluirTabela(id: string): Promise<void> {
    const emUso = await this.contratoRepo.count({ where: { tabela_referencia_id: id } });
    if (emUso > 0) {
      throw new BadRequestException(
        `Esta tabela está vinculada a ${emUso} contrato(s) e não pode ser excluída.`,
      );
    }
    await this.tabelaRepo.delete(id);
  }

  /** Atualiza um item individual da tabela (valor, descrição, código etc.). */
  async atualizarItem(itemId: string, dados: Partial<ItemTabelaInput>): Promise<ItemTabelaReferencia> {
    const item = await this.itemRepo.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Item da tabela não encontrado');
    if (dados.descricao !== undefined) item.descricao = dados.descricao || item.descricao;
    if (dados.categoria_codigo !== undefined) item.categoria_codigo = dados.categoria_codigo ?? null;
    if (dados.categoria_nome !== undefined) item.categoria_nome = dados.categoria_nome ?? null;
    if (dados.codigo !== undefined) item.codigo = dados.codigo ?? null;
    if (dados.valor_criacao !== undefined) item.valor_criacao = dados.valor_criacao ?? null;
    if (dados.valor_finalizacao !== undefined) item.valor_finalizacao = dados.valor_finalizacao ?? null;
    if (dados.valor_total !== undefined) item.valor_total = dados.valor_total ?? null;
    if (dados.valor_reformulacao !== undefined) item.valor_reformulacao = dados.valor_reformulacao ?? null;
    if (dados.unidade !== undefined) item.unidade = dados.unidade ?? null;
    if (dados.observacoes !== undefined) item.observacoes = dados.observacoes ?? null;
    item.sob_orcamento = item.valor_total == null && item.valor_criacao == null;
    return this.itemRepo.save(item);
  }

  /** Adiciona um item avulso à tabela (no fim da ordenação). */
  async adicionarItem(tabelaId: string, dados: ItemTabelaInput): Promise<ItemTabelaReferencia> {
    await this.buscarTabela(tabelaId);
    if (!dados?.descricao?.trim()) throw new BadRequestException('Informe a descrição do item.');
    const max = await this.itemRepo
      .createQueryBuilder('i')
      .select('COALESCE(MAX(i.ordem), 0)', 'max')
      .where('i.tabela_id = :tabelaId', { tabelaId })
      .getRawOne();
    const item = this.itemRepo.create({
      tabela_id: tabelaId,
      categoria_codigo: dados.categoria_codigo ?? null,
      categoria_nome: dados.categoria_nome ?? null,
      codigo: dados.codigo ?? null,
      descricao: dados.descricao.trim(),
      valor_criacao: dados.valor_criacao ?? null,
      valor_finalizacao: dados.valor_finalizacao ?? null,
      valor_total: dados.valor_total ?? null,
      valor_reformulacao: dados.valor_reformulacao ?? null,
      unidade: dados.unidade ?? null,
      sob_orcamento: dados.valor_total == null && dados.valor_criacao == null,
      observacoes: dados.observacoes ?? null,
      ordem: Number(max?.max || 0) + 1,
    });
    return this.itemRepo.save(item);
  }

  /** Remove um item da tabela. */
  async removerItem(itemId: string): Promise<void> {
    const item = await this.itemRepo.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Item da tabela não encontrado');
    await this.itemRepo.delete(itemId);
  }

  /**
   * Substitui todos os itens de uma tabela existente (re-importação de nova
   * edição). Mantém o mesmo id da tabela — contratos vinculados seguem usando-a
   * com os preços atualizados. Opcionalmente atualiza a edição/observações.
   */
  async substituirItens(
    tabelaId: string,
    itens: ItemTabelaInput[],
    meta?: { edicao?: string; observacoes?: string },
  ): Promise<{ removidos: number; inseridos: number }> {
    const tabela = await this.buscarTabela(tabelaId);
    if (!itens?.length) throw new BadRequestException('Nenhum item para importar.');
    const removidos = await this.itemRepo.count({ where: { tabela_id: tabelaId } });
    await this.itemRepo.delete({ tabela_id: tabelaId });
    const inseridos = await this.inserirItens(tabelaId, itens);
    if (meta?.edicao !== undefined || meta?.observacoes !== undefined) {
      tabela.edicao = meta.edicao ?? tabela.edicao;
      tabela.observacoes = meta.observacoes ?? tabela.observacoes;
      await this.tabelaRepo.save(tabela);
    }
    return { removidos, inseridos };
  }

  private async inserirItens(tabelaId: string, itens: ItemTabelaInput[]): Promise<number> {
    const entidades = itens.map((it, idx) =>
      this.itemRepo.create({
        tabela_id: tabelaId,
        categoria_codigo: it.categoria_codigo ?? null,
        categoria_nome: it.categoria_nome ?? null,
        codigo: it.codigo ?? null,
        descricao: it.descricao || '(sem descrição)',
        valor_criacao: it.valor_criacao ?? null,
        valor_finalizacao: it.valor_finalizacao ?? null,
        valor_total: it.valor_total ?? null,
        valor_reformulacao: it.valor_reformulacao ?? null,
        unidade: it.unidade ?? null,
        sob_orcamento: it.sob_orcamento ?? (it.valor_total == null && it.valor_criacao == null),
        ordem: it.ordem ?? idx,
      }),
    );
    await this.itemRepo.save(entidades, { chunk: 100 });
    return entidades.length;
  }

  // ==========================================================================
  // Importação
  // ==========================================================================

  /** Prévia (não persiste): parseia um PDF e retorna itens estruturados. */
  async previewPdf(buffer: Buffer): Promise<ItemTabelaInput[]> {
    if (!buffer || buffer.length === 0) throw new BadRequestException('Arquivo PDF vazio.');
    const linhas = await extrairLinhasPdf(buffer);
    const itens = parseTabelaLinhas(linhas);
    if (itens.length === 0) {
      throw new BadRequestException(
        'Não foi possível extrair itens do PDF. Verifique se é a tabela SINAPRO ou use importação por CSV.',
      );
    }
    return itens;
  }

  /** Prévia (não persiste): parseia um CSV e retorna itens estruturados. */
  previewCsv(conteudo: string): ItemTabelaInput[] {
    const linhas = conteudo.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (linhas.length < 2) throw new BadRequestException('CSV vazio ou sem dados.');
    const sep = linhas[0].includes(';') ? ';' : ',';
    const header = linhas[0].split(sep).map((h) => h.trim().toLowerCase());
    const idx = (nome: string) => header.findIndex((h) => h === nome);
    const iDesc = idx('descricao') >= 0 ? idx('descricao') : idx('descrição');
    if (iDesc < 0) throw new BadRequestException('CSV precisa da coluna "descricao".');
    const iCatCod = idx('categoria_codigo');
    const iCatNome = idx('categoria_nome');
    const iCod = idx('codigo');
    const iCriacao = idx('valor_criacao');
    const iFinaliz = idx('valor_finalizacao');
    const iTotal = idx('valor_total');
    const iReform = idx('valor_reformulacao');
    const iUnid = idx('unidade');
    const itens: ItemTabelaInput[] = [];
    for (let l = 1; l < linhas.length; l++) {
      const cols = linhas[l].split(sep);
      const get = (i: number) => (i >= 0 && i < cols.length ? cols[i].trim() : '');
      const descricao = get(iDesc);
      if (!descricao) continue;
      const total = parseValorBR(get(iTotal));
      const criacao = parseValorBR(get(iCriacao));
      itens.push({
        categoria_codigo: get(iCatCod) || null,
        categoria_nome: get(iCatNome) || null,
        codigo: get(iCod) || null,
        descricao,
        valor_criacao: criacao,
        valor_finalizacao: parseValorBR(get(iFinaliz)),
        valor_total: total,
        valor_reformulacao: parseValorBR(get(iReform)),
        unidade: get(iUnid) || null,
        sob_orcamento: total == null && criacao == null,
        ordem: itens.length,
      });
    }
    if (itens.length === 0) throw new BadRequestException('Nenhum item válido no CSV.');
    return itens;
  }

  /**
   * Semeia a tabela SINAPRO-BA 2025/2026 (arquivo versionado) para um órgão.
   * Usado para o cadastro rápido do caso LOOP.
   */
  async seedSinaproBa(
    orgaoId: string,
    usuario?: { id?: string; nome?: string },
  ): Promise<TabelaReferenciaPreco> {
    const seedPath = this.resolveSeedPath('sinapro-ba-2025-2026.json');
    if (!fs.existsSync(seedPath)) {
      throw new BadRequestException('Arquivo de seed da SINAPRO-BA não encontrado no servidor.');
    }
    const itens: ItemTabelaInput[] = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
    return this.criarTabela(
      orgaoId,
      {
        nome: 'SINAPRO-BA — Tabela Referencial de Custos Internos',
        fonte: 'SINAPRO',
        uf: 'BA',
        edicao: '2025/2026',
        observacoes: 'Importada do PDF oficial do sindicato (345 itens).',
        usuario_cadastro_id: usuario?.id ?? null,
        usuario_cadastro_nome: usuario?.nome ?? null,
      },
      itens.map((it) => ({ ...it, sob_orcamento: it.valor_total == null && it.valor_criacao == null })),
    );
  }

  private resolveSeedPath(arquivo: string): string {
    // dist (build) e src (dev)
    const candidatos = [
      path.join(__dirname, 'seed', arquivo),
      path.join(process.cwd(), 'src', 'contratos', 'seed', arquivo),
      path.join(process.cwd(), 'dist', 'src', 'contratos', 'seed', arquivo),
    ];
    return candidatos.find((c) => fs.existsSync(c)) || candidatos[0];
  }

  // ==========================================================================
  // Aplicação ao contrato (Fase 3) — gera ItemCronograma com desconto
  // ==========================================================================

  /**
   * Calcula o preço contratado a partir de um item da tabela e do desconto.
   * base: 'total' | 'criacao' | 'finalizacao'
   */
  calcularPrecoComDesconto(
    item: ItemTabelaReferencia,
    base: 'total' | 'criacao' | 'finalizacao',
    descontoPct: number,
  ): number | null {
    const valorBase =
      base === 'criacao'
        ? item.valor_criacao
        : base === 'finalizacao'
        ? item.valor_finalizacao
        : item.valor_total;
    if (valorBase == null) return null;
    const desconto = descontoPct || 0;
    const preco = Number(valorBase) * (1 - desconto / 100);
    return Math.round(preco * 100) / 100;
  }

  /**
   * Aplica itens da tabela de referência ao contrato, criando ItemCronograma
   * com o preço já descontado. Retorna os itens criados.
   *
   * O fluxo de Requisição→OS/OF consome esses ItemCronograma normalmente.
   */
  async aplicarItensAoContrato(
    contratoId: string,
    selecoes: Array<{
      item_tabela_id: string;
      base?: 'total' | 'criacao' | 'finalizacao';
      quantidade?: number;
      desconto_pct?: number;
      descricao_override?: string;
    }>,
  ): Promise<ItemCronograma[]> {
    const contrato = await this.contratoRepo.findOne({ where: { id: contratoId } });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');

    const descontoPadrao =
      contrato.remuneracao_publicidade?.desconto_tabela_pct ?? 0;

    // número do próximo item do cronograma
    const existentes = await this.itemCronogramaRepo.find({ where: { contrato_id: contratoId } });
    let proximoNumero =
      existentes.reduce((max, it) => Math.max(max, it.numero_item || 0), 0) + 1;

    const criados: ItemCronograma[] = [];
    for (const sel of selecoes) {
      const itemTabela = await this.itemRepo.findOne({ where: { id: sel.item_tabela_id } });
      if (!itemTabela) continue;
      const base = sel.base || 'total';
      const desconto = sel.desconto_pct ?? descontoPadrao;
      const preco = this.calcularPrecoComDesconto(itemTabela, base, desconto);
      if (preco == null) {
        // item sob orçamento — pula (não tem valor de tabela)
        continue;
      }
      const quantidade = sel.quantidade && sel.quantidade > 0 ? sel.quantidade : 1;
      const descricaoBase = sel.descricao_override || itemTabela.descricao;
      const sufixoBase =
        base === 'criacao' ? ' (Criação)' : base === 'finalizacao' ? ' (Finalização)' : '';
      const item = this.itemCronogramaRepo.create({
        contrato_id: contratoId,
        numero_item: proximoNumero++,
        descricao: `${descricaoBase}${sufixoBase}`,
        unidade_medida: 'SERVICO',
        quantidade,
        valor_unitario: preco,
        valor_mensal: 0,
        valor_total: Math.round(preco * quantidade * 100) / 100,
        quantidade_meses: null,
        observacoes: `Tabela ${itemTabela.categoria_nome || ''} ${itemTabela.codigo || ''} — base ${base} ${
          base === 'total'
            ? Number(itemTabela.valor_total)
            : base === 'criacao'
            ? Number(itemTabela.valor_criacao)
            : Number(itemTabela.valor_finalizacao)
        } com desconto de ${desconto}%`.trim(),
      });
      criados.push(await this.itemCronogramaRepo.save(item));
    }
    return criados;
  }

  /**
   * Gera itens do contrato (ItemCronograma) para as 3 bases de remuneração de
   * publicidade, criando linhas prontas para a Ordem de Serviço:
   *  - SINAPRO   : valor da tabela − desconto (ex.: 34%)
   *  - TERCEIROS : custo do fornecedor + honorário (8/7/8/4%)
   *  - MIDIA     : valor da mídia − desconto de agência (ex.: 20%)
   */
  async gerarLinhasPublicidade(
    contratoId: string,
    linhas: Array<{
      tipo: 'SINAPRO' | 'TERCEIROS' | 'MIDIA';
      quantidade?: number;
      // SINAPRO
      item_tabela_id?: string;
      base?: 'total' | 'criacao' | 'finalizacao';
      desconto_pct?: number;
      // TERCEIROS / MIDIA
      descricao?: string;
      custo?: number;
      honorario_pct?: number;
      valor_midia?: number;
      desconto_agencia_pct?: number;
    }>,
  ): Promise<ItemCronograma[]> {
    const contrato = await this.contratoRepo.findOne({ where: { id: contratoId } });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    const rp = contrato.remuneracao_publicidade || {};

    const existentes = await this.itemCronogramaRepo.find({ where: { contrato_id: contratoId } });
    let proximoNumero = existentes.reduce((max, it) => Math.max(max, it.numero_item || 0), 0) + 1;

    const round2 = (v: number) => Math.round(v * 100) / 100;
    const criados: ItemCronograma[] = [];

    for (const l of linhas) {
      const quantidade = l.quantidade && l.quantidade > 0 ? l.quantidade : 1;
      let descricao = '';
      let precoUnit: number | null = null;
      let memorial = '';

      if (l.tipo === 'SINAPRO') {
        if (!l.item_tabela_id) continue;
        const itemTabela = await this.itemRepo.findOne({ where: { id: l.item_tabela_id } });
        if (!itemTabela) continue;
        const base = l.base || 'total';
        const desconto = l.desconto_pct ?? rp.desconto_tabela_pct ?? 0;
        precoUnit = this.calcularPrecoComDesconto(itemTabela, base, desconto);
        if (precoUnit == null) continue; // sob orçamento
        const sufixo = base === 'criacao' ? ' (Criação)' : base === 'finalizacao' ? ' (Finalização)' : '';
        const valorBase =
          base === 'criacao' ? itemTabela.valor_criacao : base === 'finalizacao' ? itemTabela.valor_finalizacao : itemTabela.valor_total;
        // Descrição do serviço executado (da OS do fornecedor) quando informada;
        // a referência SINAPRO fica sempre rastreável no memorial.
        descricao = l.descricao?.trim() || `${itemTabela.descricao}${sufixo}`;
        memorial = `SINAPRO ${itemTabela.codigo || ''} (${itemTabela.descricao}) — tabela ${Number(valorBase)} − ${desconto}% = ${precoUnit}`.trim();
      } else if (l.tipo === 'TERCEIROS') {
        const custo = Number(l.custo || 0);
        if (!l.descricao || custo <= 0) continue;
        const honorario = l.honorario_pct ?? rp.honorario_terceiros_pct ?? 0;
        precoUnit = round2(custo * (1 + honorario / 100));
        descricao = l.descricao;
        memorial = `Terceiros — custo ${custo} + honorário ${honorario}% = ${precoUnit}`;
      } else if (l.tipo === 'MIDIA') {
        const valorMidia = Number(l.valor_midia || 0);
        if (!l.descricao || valorMidia <= 0) continue;
        const descAgencia = l.desconto_agencia_pct ?? rp.desconto_agencia_pct ?? 0;
        precoUnit = round2(valorMidia * (1 - descAgencia / 100));
        descricao = l.descricao;
        memorial = `Mídia — veiculação ${valorMidia} − ${descAgencia}% (desconto de agência) = ${precoUnit}`;
      } else {
        continue;
      }

      if (precoUnit == null) continue;
      const item = this.itemCronogramaRepo.create({
        contrato_id: contratoId,
        numero_item: proximoNumero++,
        descricao,
        unidade_medida: 'SERVICO',
        quantidade,
        valor_unitario: precoUnit,
        valor_mensal: 0,
        valor_total: round2(precoUnit * quantidade),
        quantidade_meses: null,
        observacoes: memorial,
      });
      criados.push(await this.itemCronogramaRepo.save(item));
    }
    return criados;
  }
}

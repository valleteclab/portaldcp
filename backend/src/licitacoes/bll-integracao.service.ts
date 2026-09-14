import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { join } from 'path';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { Licitacao } from './entities/licitacao.entity';
import { IntegracaoPlataformaLicitacao } from './entities/integracao-plataforma.entity';
import { ItemLicitacao, StatusItem } from '../itens/entities/item-licitacao.entity';
import { Fornecedor, PorteEmpresa } from '../fornecedores/entities/fornecedor.entity';
import { FornecedoresService } from '../fornecedores/fornecedores.service';
import { LicitacoesService } from './licitacoes.service';

/**
 * Integração por arquivo com a BLL Compras (mesmo leiaute do Compras BR e do
 * VA Sistemas), conforme o "Manual de Importação e Exportação de Dados":
 *
 *  .IMP (sistema de gestão → portal): texto separado por pipe, ASCII, quebras
 *  de linha como "#13#10". Registro 1 = edital, 2 = lote, 3 = item do lote.
 *  .EXP (portal → sistema de gestão): registro 1 = fornecedor participante,
 *  registro 2 = lance por lote/item, com "1" no último campo para o vencedor.
 *
 * Nada do fluxo existente muda: a importação chama registrarResultadoExterno
 * e o cadastro rápido de fornecedor, como a tela de seleção externa já faz.
 */

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');

/** Sigla de unidade aceita pelos portais, a partir do enum interno. */
const UNIDADE_BLL: Record<string, string> = {
  UNIDADE: 'UN', PECA: 'PC', CAIXA: 'CX', PACOTE: 'PCT', METRO: 'M', METRO_QUADRADO: 'M2',
  METRO_CUBICO: 'M3', LITRO: 'L', QUILOGRAMA: 'KG', TONELADA: 'TON', HORA: 'H', DIARIA: 'DIA',
  MES: 'MES', ANO: 'ANO', SERVICO: 'SV', GLOBAL: 'GL',
};

const ascii = (s: any) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e\r\n\t]/g, '?');

/** Campo do arquivo: sem pipe, sem quebra real de linha, em ASCII. */
const campo = (s: any) => ascii(s).replace(/\|/g, '/').replace(/\r?\n/g, '#13#10').replace(/\t/g, ' ').trim();
const fmt4 = (n: any) => (Number(n) || 0).toFixed(4);
const soDigitos = (s: any) => String(s ?? '').replace(/\D/g, '');
const formatarDoc = (d: string) =>
  d.length === 14
    ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : d.length === 11
      ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
      : d;

export interface ExportarBllDto {
  numero_edital?: number | string;
  entrega_local?: string;
  entrega_prazo?: string;
  garantia_produto?: string;
  ata_vigencia_meses?: number;
}

interface FornecedorExp {
  tipo_documento: 1 | 2;
  documento: string;
  razao_social: string;
  logradouro: string;
  numero: string;
  bairro: string;
  complemento: string;
  cidade: string;
  uf: string;
  cep: string;
  contato: string;
  telefone: string;
  celular: string;
  email: string;
  micro_empresa: boolean;
}

interface LanceExp {
  lote: number;
  item: number;
  tipo_documento: 1 | 2;
  documento: string;
  preco: number;
  marca: string;
  vencedor: boolean;
}

@Injectable()
export class BllIntegracaoService {
  private readonly logger = new Logger(BllIntegracaoService.name);

  constructor(
    @InjectRepository(Licitacao) private readonly licRepo: Repository<Licitacao>,
    @InjectRepository(ItemLicitacao) private readonly itemRepo: Repository<ItemLicitacao>,
    @InjectRepository(IntegracaoPlataformaLicitacao) private readonly integracaoRepo: Repository<IntegracaoPlataformaLicitacao>,
    @InjectRepository(Fornecedor) private readonly fornecedorRepo: Repository<Fornecedor>,
    private readonly fornecedoresService: FornecedoresService,
    private readonly licitacoesService: LicitacoesService,
  ) {}

  // ─── Apoio ──────────────────────────────────────────────────────────

  private async carregar(licitacaoId: string) {
    const lic = await this.licRepo.findOne({ where: { id: licitacaoId }, relations: ['orgao'] });
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    const itens = await this.itemRepo.find({
      where: { licitacao_id: licitacaoId },
      relations: ['lote'],
      order: { numero_lote: 'ASC', numero_item: 'ASC' },
    });
    return { lic, itens };
  }

  /** Número do edital em inteiro, como a BLL exige. */
  private numeroEditalInteiro(lic: Licitacao, informado?: number | string): number | null {
    if (informado !== undefined && informado !== null && String(informado).trim() !== '') {
      const n = Number(soDigitos(informado));
      return n > 0 ? n : null;
    }
    const m = String(lic.numero_edital || '').match(/\d+/);
    if (m && Number(m[0]) > 0) return Number(m[0]);
    if (lic.sequencial) return Number(lic.sequencial);
    return null;
  }

  private anoDaLicitacao(lic: Licitacao): number {
    if (lic.ano) return Number(lic.ano);
    const m = String(lic.numero_edital || lic.numero_processo || '').match(/(20\d{2})/);
    return m ? Number(m[1]) : new Date().getFullYear();
  }

  /**
   * Lote de cada item para o arquivo. Itens sem lote viram lote próprio
   * (pregão por item na BLL). Se a licitação mistura lotes e itens soltos, os
   * soltos recebem números após o maior lote, para não colidir.
   */
  private montarLotes(itens: ItemLicitacao[]) {
    const lotes = new Map<number, { numero: number; descricao: string; itens: ItemLicitacao[] }>();
    const maiorLote = itens.reduce((m, i) => Math.max(m, Number(i.lote?.numero ?? i.numero_lote ?? 0)), 0);
    const temLotes = maiorLote > 0;
    let proximoSolto = maiorLote;
    for (const it of itens) {
      const numeroLote = Number(it.lote?.numero ?? it.numero_lote ?? 0);
      if (numeroLote > 0) {
        if (!lotes.has(numeroLote)) lotes.set(numeroLote, { numero: numeroLote, descricao: it.lote?.descricao || `Lote ${String(numeroLote).padStart(3, '0')}`, itens: [] });
        lotes.get(numeroLote)!.itens.push(it);
      } else {
        const numero = temLotes ? ++proximoSolto : Number(it.numero_item);
        lotes.set(numero, { numero, descricao: `Item ${String(it.numero_item).padStart(3, '0')}`, itens: [it] });
      }
    }
    return Array.from(lotes.values()).sort((a, b) => a.numero - b.numero);
  }

  private dirArquivos(licitacaoId: string) {
    const dir = join(UPLOAD_DIR, 'licitacoes', licitacaoId.replace(/[^a-zA-Z0-9-]/g, ''), 'bll');
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  // ─── Prévia / configuração da exportação ─────────────────────────────

  async previaExportacao(licitacaoId: string) {
    const { lic, itens } = await this.carregar(licitacaoId);
    const { erros, avisos } = this.validarExportacao(lic, itens, undefined);
    const lotes = this.montarLotes(itens);
    return {
      numero_edital_sugerido: this.numeroEditalInteiro(lic),
      numero_edital_cadastro: lic.numero_edital,
      ano: this.anoDaLicitacao(lic),
      processo: lic.numero_processo,
      orgao: lic.orgao?.nome_fantasia || lic.orgao?.nome || '',
      registro_precos: !!lic.srp,
      ata_vigencia_meses: lic.ata_vigencia_meses,
      entrega_local: lic.entrega_local,
      entrega_prazo: lic.entrega_prazo,
      garantia_produto: lic.garantia_produto,
      total_itens: itens.length,
      total_lotes: lotes.length,
      lotes: lotes.map((l) => ({ numero: l.numero, descricao: l.descricao, itens: l.itens.map((i) => i.numero_item) })),
      erros,
      avisos,
      pode_exportar: erros.length === 0,
    };
  }

  private validarExportacao(lic: Licitacao, itens: ItemLicitacao[], dto?: ExportarBllDto) {
    const erros: string[] = [];
    const avisos: string[] = [];
    if (!itens.length) erros.push('A licitação não tem itens cadastrados.');
    if (!this.numeroEditalInteiro(lic, dto?.numero_edital)) erros.push('Informe o número do edital como número inteiro (a BLL não aceita letras ou barras).');
    for (const it of itens) {
      if (!(Number(it.quantidade) > 0)) erros.push(`Item ${it.numero_item}: quantidade deve ser maior que zero.`);
      if (!it.unidade_medida) erros.push(`Item ${it.numero_item}: sem unidade de medida.`);
      if (!(Number(it.valor_unitario_estimado) > 0)) avisos.push(`Item ${it.numero_item}: sem valor estimado; irá com 0,0000.`);
      if (!(it.descricao_resumida || it.descricao_detalhada)) erros.push(`Item ${it.numero_item}: sem descrição.`);
    }
    if (lic.srp && !(Number(dto?.ata_vigencia_meses ?? lic.ata_vigencia_meses) > 0)) avisos.push('Registro de preços sem vigência da ata em meses; irá com 0.');
    return { erros, avisos };
  }

  // ─── Exportação (.IMP) ───────────────────────────────────────────────

  async exportar(licitacaoId: string, dto: ExportarBllDto, usuarioNome: string) {
    const { lic, itens } = await this.carregar(licitacaoId);
    const { erros, avisos } = this.validarExportacao(lic, itens, dto);
    if (erros.length) throw new BadRequestException({ message: 'Licitação não está pronta para exportar', erros });

    // Guarda o que foi informado para as próximas exportações (só campos novos e opcionais)
    let mudou = false;
    for (const k of ['entrega_local', 'entrega_prazo', 'garantia_produto'] as const) {
      if (dto[k] !== undefined && (dto[k] || null) !== lic[k]) { (lic as any)[k] = dto[k]?.trim() || null; mudou = true; }
    }
    if (dto.ata_vigencia_meses !== undefined && Number(dto.ata_vigencia_meses || 0) !== Number(lic.ata_vigencia_meses || 0)) {
      lic.ata_vigencia_meses = Number(dto.ata_vigencia_meses) || null; mudou = true;
    }
    if (mudou) await this.licRepo.save(lic);

    const edital = this.numeroEditalInteiro(lic, dto.numero_edital)!;
    const ano = this.anoDaLicitacao(lic);
    const orgao = lic.orgao?.nome_fantasia || lic.orgao?.nome || '';
    const meses = lic.srp ? Number(lic.ata_vigencia_meses || 0) : 0;
    const lotes = this.montarLotes(itens);

    const linhas: string[] = [];
    linhas.push(['1', edital, ano, campo(lic.numero_processo), campo(orgao), lic.srp ? '1' : '0', meses].join('|'));
    for (const lote of lotes) {
      linhas.push(['2', edital, ano, lote.numero, campo(lote.descricao), campo(lic.entrega_local || ''), campo(lic.entrega_prazo || ''), campo(lic.garantia_produto || '')].join('|'));
      for (const it of lote.itens) {
        const descricao = [it.descricao_resumida, it.descricao_detalhada].filter((x) => x && x.trim()).join(' - ');
        linhas.push([
          '3', edital, ano, lote.numero, it.numero_item,
          UNIDADE_BLL[String(it.unidade_medida)] || campo(it.unidade_medida).slice(0, 50),
          fmt4(it.quantidade), fmt4(it.valor_unitario_estimado), campo(descricao),
        ].join('|'));
      }
    }
    const conteudo = linhas.join('\r\n') + '\r\n';
    const buffer = Buffer.from(conteudo, 'latin1');
    const nome = `edital-${edital}-${ano}-${Date.now()}.imp`;
    const caminho = join(this.dirArquivos(licitacaoId), nome);
    writeFileSync(caminho, buffer);

    await this.integracaoRepo.save(
      this.integracaoRepo.create({
        licitacao_id: licitacaoId, plataforma: 'BLL', tipo: 'EXPORTACAO', status: 'GERADO',
        nome_arquivo: nome, caminho_arquivo: caminho, usuario_nome: usuarioNome,
        resumo: { edital, ano, lotes: lotes.length, itens: itens.length, avisos },
      }),
    );
    this.logger.log(`BLL: .IMP gerado para a licitação ${lic.numero_processo} (${lotes.length} lotes, ${itens.length} itens)`);
    return { buffer, nome, avisos, edital, ano };
  }

  // ─── Importação (.EXP) ───────────────────────────────────────────────

  /** Lê o .EXP tolerando linhas quebradas no meio de um registro. */
  private parseExp(buffer: Buffer) {
    const texto = buffer.toString('latin1');
    const brutas = texto.split(/\r?\n/);
    const registros: string[][] = [];
    let atual: string[] | null = null;
    const esperado = (tipo: string) => (tipo === '1' ? 18 : tipo === '2' ? 10 : 0);
    for (const linha of brutas) {
      if (!linha.trim()) continue;
      const campos = linha.split('|');
      if (atual && atual.length < esperado(atual[0])) {
        // continuação de um registro quebrado: o primeiro campo emenda no último
        atual[atual.length - 1] += ' ' + campos[0];
        atual.push(...campos.slice(1));
        continue;
      }
      atual = campos;
      registros.push(atual);
    }
    const fornecedores: FornecedorExp[] = [];
    const lances: LanceExp[] = [];
    let edital: number | null = null;
    let ano: number | null = null;
    let ignorados = 0;
    for (const r of registros) {
      const tipo = r[0]?.trim();
      if (tipo === '1' && r.length >= 6) {
        edital = edital ?? Number(r[1]); ano = ano ?? Number(r[2]);
        fornecedores.push({
          tipo_documento: r[3]?.trim() === '2' ? 2 : 1,
          documento: soDigitos(r[4]),
          razao_social: (r[5] || '').trim(),
          logradouro: (r[6] || '').trim(), numero: (r[7] || '').trim(), bairro: (r[8] || '').trim(),
          complemento: (r[9] || '').trim(), cidade: (r[10] || '').trim(), uf: (r[11] || '').trim().toUpperCase().slice(0, 2),
          cep: soDigitos(r[12]).padStart(8, '0').slice(-8), contato: (r[13] || '').trim(), telefone: (r[14] || '').trim(),
          celular: (r[15] || '').trim(), email: (r[16] || '').trim().toLowerCase(), micro_empresa: (r[17] || '').trim() === '1',
        });
      } else if (tipo === '2' && r.length >= 8) {
        edital = edital ?? Number(r[1]); ano = ano ?? Number(r[2]);
        lances.push({
          lote: Number(r[3]), item: Number(r[4]), tipo_documento: r[5]?.trim() === '2' ? 2 : 1,
          documento: soDigitos(r[6]), preco: Number(String(r[7] || '0').replace(',', '.')) || 0,
          marca: (r[8] || '').trim(), vencedor: (r[9] || '').trim() === '1',
        });
      } else {
        ignorados++;
      }
    }
    return { edital, ano, fornecedores, lances, ignorados };
  }

  private async acharFornecedor(documento: string) {
    if (!documento) return null;
    return this.fornecedorRepo.findOne({ where: [{ cpf_cnpj: documento }, { cpf_cnpj: formatarDoc(documento) }] });
  }

  /** Monta a prévia do resultado; com aplicar=true grava tudo. */
  async importar(licitacaoId: string, arquivo: { buffer: Buffer; originalname: string }, aplicar: boolean, usuarioNome: string, forcar = false) {
    const { lic, itens } = await this.carregar(licitacaoId);
    if (!arquivo?.buffer?.length) throw new BadRequestException('Envie o arquivo .EXP exportado da BLL');
    const parsed = this.parseExp(arquivo.buffer);
    if (!parsed.fornecedores.length && !parsed.lances.length) {
      throw new BadRequestException('O arquivo não tem registros no leiaute da BLL (registros 1 e 2 separados por pipe).');
    }

    const avisos: string[] = [];
    const erros: string[] = [];
    const editalLic = this.numeroEditalInteiro(lic);
    const anoLic = this.anoDaLicitacao(lic);
    if (parsed.edital && editalLic && parsed.edital !== editalLic) {
      (forcar ? avisos : erros).push(`O arquivo é do edital ${parsed.edital}/${parsed.ano}, e esta licitação é o edital ${editalLic}/${anoLic}.`);
    } else if (parsed.ano && parsed.ano !== anoLic) {
      (forcar ? avisos : erros).push(`O arquivo é do ano ${parsed.ano}, e esta licitação é de ${anoLic}.`);
    }
    if (parsed.ignorados) avisos.push(`${parsed.ignorados} linha(s) fora do leiaute foram ignoradas.`);
    if (lic.data_homologacao) erros.push('Licitação já homologada; o resultado não pode ser alterado.');

    // Fornecedores: existentes × novos
    const mapaForn = new Map<string, FornecedorExp>();
    for (const f of parsed.fornecedores) if (f.documento && !mapaForn.has(f.documento)) mapaForn.set(f.documento, f);
    const fornecedoresPrevia: any[] = [];
    const existentes = new Map<string, Fornecedor>();
    for (const f of mapaForn.values()) {
      const ex = await this.acharFornecedor(f.documento);
      if (ex) existentes.set(f.documento, ex);
      fornecedoresPrevia.push({
        documento: formatarDoc(f.documento), razao_social: f.razao_social, cidade: f.cidade, uf: f.uf,
        micro_empresa: f.micro_empresa, situacao: ex ? 'EXISTENTE' : 'NOVO', fornecedor_id: ex?.id || null,
        razao_social_cadastro: ex?.razao_social || null,
      });
    }

    // Vencedores por lote/item → item da licitação
    const lotes = this.montarLotes(itens);
    const porLoteItem = new Map<string, ItemLicitacao>();
    for (const l of lotes) for (const it of l.itens) porLoteItem.set(`${l.numero}:${it.numero_item}`, it);
    const porItem = new Map<number, ItemLicitacao[]>();
    for (const it of itens) porItem.set(Number(it.numero_item), [...(porItem.get(Number(it.numero_item)) || []), it]);

    const vencedores = new Map<string, { item: ItemLicitacao; lance: LanceExp }>();
    const naoLocalizados: string[] = [];
    for (const l of parsed.lances.filter((x) => x.vencedor)) {
      let item = porLoteItem.get(`${l.lote}:${l.item}`);
      if (!item) {
        const cands = porItem.get(l.item) || [];
        if (cands.length === 1) item = cands[0];
      }
      if (!item) { naoLocalizados.push(`lote ${l.lote} item ${l.item}`); continue; }
      const chave = item.id;
      const atual = vencedores.get(chave);
      if (!atual || l.preco < atual.lance.preco) vencedores.set(chave, { item, lance: l });
      else avisos.push(`Item ${item.numero_item}: mais de um lance marcado como vencedor; ficou o de menor preço.`);
    }
    if (naoLocalizados.length) avisos.push(`Lances vencedores sem item correspondente na licitação: ${naoLocalizados.join(', ')}.`);

    const vencedoresPrevia = Array.from(vencedores.values()).map(({ item, lance }) => {
      const f = mapaForn.get(lance.documento);
      const ex = existentes.get(lance.documento);
      const valorTotal = Math.round(lance.preco * Number(item.quantidade || 0) * 100) / 100;
      return {
        item_id: item.id, numero_item: item.numero_item, lote: lance.lote, descricao: item.descricao_resumida,
        quantidade: Number(item.quantidade), valor_unitario: lance.preco, valor_total: valorTotal, marca: lance.marca,
        documento: formatarDoc(lance.documento), fornecedor: f?.razao_social || ex?.razao_social || lance.documento,
        fornecedor_id: ex?.id || null, fornecedor_novo: !ex, valor_estimado: Number(item.valor_unitario_estimado || 0),
        acima_do_estimado: Number(item.valor_unitario_estimado || 0) > 0 && lance.preco > Number(item.valor_unitario_estimado),
        ja_adjudicado: item.status === StatusItem.ADJUDICADO || item.status === StatusItem.HOMOLOGADO,
      };
    }).sort((a, b) => a.numero_item - b.numero_item);
    for (const v of vencedoresPrevia) {
      if (!(v.valor_unitario > 0)) erros.push(`Item ${v.numero_item}: preço vencedor zerado no arquivo.`);
      if (v.acima_do_estimado) avisos.push(`Item ${v.numero_item}: preço vencedor acima do estimado.`);
      if (v.ja_adjudicado) avisos.push(`Item ${v.numero_item}: já tinha vencedor registrado; será substituído.`);
      if (!mapaForn.has(soDigitos(v.documento)) && !v.fornecedor_id) erros.push(`Item ${v.numero_item}: vencedor ${v.documento} não consta nem no arquivo nem no cadastro.`);
    }
    const semVencedor = itens.filter((it) => !vencedores.has(it.id)).map((it) => it.numero_item);
    if (semVencedor.length) avisos.push(`${semVencedor.length} item(ns) sem vencedor no arquivo (deserto, fracassado ou lote sem detalhamento): ${semVencedor.join(', ')}.`);
    if (!vencedoresPrevia.length) erros.push('Nenhum lance marcado como vencedor foi encontrado no arquivo.');

    const lancesOutros = parsed.lances.filter((l) => !l.vencedor).map((l) => ({
      lote: l.lote, item: l.item, documento: formatarDoc(l.documento), fornecedor: mapaForn.get(l.documento)?.razao_social || l.documento, preco: l.preco, marca: l.marca,
    }));

    const previa = {
      arquivo: arquivo.originalname, edital: parsed.edital, ano: parsed.ano,
      fornecedores: fornecedoresPrevia, vencedores: vencedoresPrevia, itens_sem_vencedor: semVencedor,
      lances_nao_vencedores: lancesOutros.length, erros, avisos, pode_aplicar: erros.length === 0,
    };
    if (!aplicar) return { aplicado: false, previa };
    if (erros.length) throw new BadRequestException({ message: 'O arquivo tem pendências; corrija antes de aplicar', erros, avisos });

    // Aplicar: fornecedores → resultado externo (rota existente) → marca → histórico
    const idPorDocumento = new Map<string, string>();
    for (const f of mapaForn.values()) {
      let ex = existentes.get(f.documento) || null;
      if (!ex) {
        ex = await this.fornecedoresService.cadastroRapidoOrgao(f.documento, f.razao_social || 'A informar');
        avisos.push(`Fornecedor ${f.razao_social} (${formatarDoc(f.documento)}) cadastrado a partir do arquivo.`);
      }
      await this.completarFornecedor(ex, f);
      idPorDocumento.set(f.documento, ex.id);
    }
    const itensResultado: Array<{ item_id: string; fornecedor_id: string; valor_unitario: number }> = [];
    for (const { item, lance } of vencedores.values()) {
      const fornecedorId = idPorDocumento.get(lance.documento) || (await this.acharFornecedor(lance.documento))?.id;
      if (!fornecedorId) continue;
      itensResultado.push({ item_id: item.id, fornecedor_id: fornecedorId, valor_unitario: lance.preco });
    }
    const resultado = await this.licitacoesService.registrarResultadoExterno(licitacaoId, {
      plataforma_externa: 'BLL Compras',
      numero_processo_externo: parsed.edital ? `${parsed.edital}/${parsed.ano}` : undefined,
      itens: itensResultado,
    });
    for (const { item, lance } of vencedores.values()) {
      if (lance.marca) await this.itemRepo.update(item.id, { marca_vencedora: lance.marca.slice(0, 255) });
    }

    const nome = `resultado-${parsed.edital || 'x'}-${parsed.ano || 'x'}-${Date.now()}.exp`;
    const caminho = join(this.dirArquivos(licitacaoId), nome);
    writeFileSync(caminho, arquivo.buffer);
    await this.integracaoRepo.save(
      this.integracaoRepo.create({
        licitacao_id: licitacaoId, plataforma: 'BLL', tipo: 'IMPORTACAO', status: 'APLICADO',
        nome_arquivo: nome, caminho_arquivo: caminho, usuario_nome: usuarioNome,
        resumo: { ...previa, lances_nao_vencedores_lista: lancesOutros, itens_adjudicados: itensResultado.length },
      }),
    );
    this.logger.log(`BLL: resultado importado na licitação ${lic.numero_processo}: ${itensResultado.length} item(ns)`);
    return { aplicado: true, previa: { ...previa, avisos }, resultado };
  }

  /** Preenche o que estiver vazio ou "A informar" no cadastro com os dados do arquivo. */
  private async completarFornecedor(ex: Fornecedor, f: FornecedorExp) {
    const vazio = (v: any) => !v || /a informar|^0+$|00000-000|a\.informar@/i.test(String(v));
    let mudou = false;
    const set = (k: keyof Fornecedor, v: string) => { if (v && vazio((ex as any)[k])) { (ex as any)[k] = v; mudou = true; } };
    set('logradouro', f.logradouro); set('numero', f.numero); set('bairro', f.bairro); set('complemento', f.complemento);
    set('cidade', f.cidade); set('uf', f.uf); set('telefone', f.telefone || f.celular); set('email', f.email);
    if (f.cep && f.cep !== '00000000') set('cep', f.cep.replace(/^(\d{5})(\d{3})$/, '$1-$2'));
    if (f.micro_empresa && !ex.porte) { ex.porte = PorteEmpresa.ME; mudou = true; }
    if (mudou) await this.fornecedorRepo.save(ex);
  }

  // ─── Histórico ───────────────────────────────────────────────────────

  async historico(licitacaoId: string) {
    const lista = await this.integracaoRepo.find({ where: { licitacao_id: licitacaoId }, order: { created_at: 'DESC' } });
    return lista.map((i) => ({
      id: i.id, plataforma: i.plataforma, tipo: i.tipo, status: i.status, nome_arquivo: i.nome_arquivo,
      usuario_nome: i.usuario_nome, created_at: i.created_at,
      resumo: i.resumo ? { edital: i.resumo.edital, ano: i.resumo.ano, lotes: i.resumo.lotes, itens: i.resumo.itens, itens_adjudicados: i.resumo.itens_adjudicados, fornecedores: i.resumo.fornecedores?.length, avisos: i.resumo.avisos } : null,
    }));
  }

  async arquivo(licitacaoId: string, integracaoId: string) {
    const i = await this.integracaoRepo.findOne({ where: { id: integracaoId, licitacao_id: licitacaoId } });
    if (!i || !existsSync(i.caminho_arquivo)) throw new NotFoundException('Arquivo não encontrado');
    return { nome: i.nome_arquivo, buffer: readFileSync(i.caminho_arquivo) };
  }
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ehFaseInterna } from '../../licitacoes/transicoes/fases';
import { basesDeLeitura, caminhoContido, diretorioDeGravacao, resolverArquivoDeUrl } from '../../common/arquivos/arquivos';
import {
  DocumentoFaseInterna,
  OrigemDocumento,
  StatusDocumento,
  TipoDocumentoFaseInterna,
} from '../entities/documento-fase-interna.entity';
import { AcaoLogFaseInterna } from '../entities/log-fase-interna.entity';
import { AuditLogService } from '../audit-log.service';
import { FaseInternaService } from '../fase-interna.service';
import { GeradorPpService } from '../gerador-pp.service';
import { ConsumoLimiteService } from '../../parametros-licitacao/consumo-limite.service';
import { hojeEmBrasilia, pareceSerPdf } from '../peca-regras';
import { pendenciasDoPortaoDoProcesso } from '../conformidade/portoes';
import { avisarPecaAlterada } from '../tarefas/aviso-tarefas';
import { calcularEstatisticasItem, CotacaoPorFonte, ItemPesquisaPrecos, PesquisaPrecosDados } from '../types/pesquisa-precos.type';
import {
  IncisoArt23,
  INCISOS_ART23,
  METODOLOGIA_DO_METODO,
  METODOS,
  MetodoPesquisa,
  ParametroArt23,
  metodoDaMetodologia,
  parametrosDaPesquisa,
  pendenciasDaPesquisa,
  propostasDiretas,
  resumoDaPesquisa,
  validarParametro,
  valorPeloMetodo,
} from './pesquisa-regras';

type Autor = { id: string | null; nome: string | null };

export interface ArquivoEnviado {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
}

/** Evidências e comprovantes: pasta sensível da licitação (dono = órgão). */
const PASTA = 'licitacoes';
const MAX_EVIDENCIA = 10 * 1024 * 1024;
const soDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');

/** CNPJ com dígitos verificadores válidos. */
export function cnpjValido(v: unknown): boolean {
  const c = soDigitos(v);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split('').reduce((s, d, i) => s + Number(d) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(c.slice(0, 12)) === Number(c[12]) && dv(c.slice(0, 13)) === Number(c[13]);
}
const formatarCnpj = (v: string) => {
  const c = soDigitos(v);
  return c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : v;
};

/**
 * TELA DA PESQUISA DE PREÇOS (Entrega 3A; mockup Pesquisa.dc.html). Os dados
 * ficam no documento PP (mesmo lugar do módulo de pesquisa, do agente e do
 * gerador do mapa); aqui entram os 5 parâmetros do art. 23, §1º (inclusive
 * "consultado sem retorno"), as cotações diretas como PROPOSTAS (vários itens,
 * emissão, validade, comprovante), o método com justificativa, a emissão do
 * mapa e da certidão e o caminho "pesquisa feita fora" (mapa anexado + valor
 * unitário digitado nos itens — decisão 2 do dono).
 */
@Injectable()
export class PesquisaTelaService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(DocumentoFaseInterna) private readonly docRepo: Repository<DocumentoFaseInterna>,
    private readonly faseInterna: FaseInternaService,
    private readonly geradorPp: GeradorPpService,
    private readonly consumoLimite: ConsumoLimiteService,
    private readonly auditLog: AuditLogService,
  ) {}

  private async licitacao(licitacaoId: string) {
    const [lic] = await this.ds.query(
      `SELECT id::text AS id, orgao_id::text AS orgao_id, numero_processo, objeto, modalidade::text AS modalidade, fase::text AS fase,
              situacao::text AS situacao, valor_total_estimado, sigilo_orcamento, data_publicacao_edital
         FROM licitacoes WHERE id::text = $1`,
      [licitacaoId],
    );
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    return lic;
  }

  private exigirFaseInterna(lic: { fase: string }) {
    if (!ehFaseInterna(lic.fase)) throw new ConflictException('A fase interna deste processo já foi encerrada — a pesquisa não muda mais.');
  }

  /**
   * Documento PP para EDITAR aqui. Versão anexada (feita fora), assinada ou em
   * assinatura não é alterada: abre versão nova em elaboração, com os dados
   * da última versão que tinha a pesquisa (itens, cotações, parâmetros).
   */
  private async docParaEditar(licitacaoId: string): Promise<DocumentoFaseInterna> {
    const atual = await this.docRepo.findOne({ where: { licitacao_id: licitacaoId, tipo: TipoDocumentoFaseInterna.PESQUISA_PRECOS, versao_atual: true } });
    const finalizada =
      !!atual &&
      (atual.origem !== OrigemDocumento.INTERNO || atual.status === StatusDocumento.ASSINADO || atual.status === StatusDocumento.AGUARDANDO_ASSINATURA);
    if (atual && finalizada) {
      const comDados = await this.docRepo
        .createQueryBuilder('d')
        .where('d.licitacao_id = :id AND d.tipo = :t', { id: licitacaoId, t: TipoDocumentoFaseInterna.PESQUISA_PRECOS })
        .andWhere(`jsonb_typeof(d.dados_estruturados->'itens') = 'array'`)
        .orderBy('d.versao', 'DESC')
        .getOne();
      await this.docRepo.update(atual.id, { versao_atual: false, status: StatusDocumento.SUBSTITUIDO });
      await this.docRepo.save(
        this.docRepo.create({
          licitacao_id: licitacaoId,
          tipo: TipoDocumentoFaseInterna.PESQUISA_PRECOS,
          titulo: 'Pesquisa de Preços',
          status: StatusDocumento.EM_ELABORACAO,
          origem: OrigemDocumento.INTERNO,
          versao: (atual.versao || 1) + 1,
          versao_atual: true,
          versao_anterior_id: atual.id,
          obrigatorio: atual.obrigatorio,
          dados_estruturados: comDados?.dados_estruturados ?? { itens: [] },
        }),
      );
    }
    return this.faseInterna.getOuCriarDocPP(licitacaoId);
  }

  /** Versão nova da pesquisa já emitida (a anterior vira SUBSTITUIDO, com o mapa e a certidão dela). */
  private async novaVersaoDaPesquisa(atual: DocumentoFaseInterna): Promise<DocumentoFaseInterna> {
    return this.docRepo.manager.transaction(async (m) => {
      await m.query(`SELECT id FROM licitacoes WHERE id::text = $1 FOR UPDATE`, [atual.licitacao_id]);
      const repo = m.getRepository(DocumentoFaseInterna);
      await repo.update(atual.id, { versao_atual: false, status: StatusDocumento.SUBSTITUIDO });
      return repo.save(
        repo.create({
          licitacao_id: atual.licitacao_id,
          tipo: TipoDocumentoFaseInterna.PESQUISA_PRECOS,
          titulo: atual.titulo || 'Pesquisa de Preços',
          status: StatusDocumento.EM_ELABORACAO,
          origem: OrigemDocumento.INTERNO,
          versao: (atual.versao || 1) + 1,
          versao_atual: true,
          versao_anterior_id: atual.id,
          obrigatorio: atual.obrigatorio,
          criado_por_id: atual.criado_por_id,
          criado_por_nome: atual.criado_por_nome,
          dados_estruturados: {},
        }),
      );
    });
  }

  private async salvarDados(doc: DocumentoFaseInterna, dados: PesquisaPrecosDados) {
    dados.itens = (dados.itens || []).map((i) => ({ ...i, ...calcularEstatisticasItem(i) }));
    doc.dados_estruturados = dados;
    await this.docRepo.save(doc);
  }

  private ref(dados: PesquisaPrecosDados, lic: any) {
    const prevista = dados.publicacao_prevista || (lic.data_publicacao_edital ? new Date(lic.data_publicacao_edital).toISOString().slice(0, 10) : null);
    return { hoje: hojeEmBrasilia(), publicacao_prevista: prevista };
  }

  // ==========================================================================
  // LEITURA
  // ==========================================================================

  async obter(licitacaoId: string) {
    const lic = await this.licitacao(licitacaoId);
    // Leitura não cria nem versiona: usa a versão atual (ou a última com dados)
    const atual = await this.docRepo.findOne({ where: { licitacao_id: licitacaoId, tipo: TipoDocumentoFaseInterna.PESQUISA_PRECOS, versao_atual: true } });
    let dados: PesquisaPrecosDados = atual?.dados_estruturados?.itens ? atual.dados_estruturados : { itens: [] };
    if (!atual?.dados_estruturados?.itens && ehFaseInterna(lic.fase)) {
      const doc = await this.faseInterna.getOuCriarDocPP(licitacaoId);
      dados = doc.dados_estruturados?.itens ? doc.dados_estruturados : dados;
    }
    const itens: ItemPesquisaPrecos[] = (dados.itens || []).map((i) => ({ ...i, ...calcularEstatisticasItem(i) }));
    const ref = this.ref(dados, lic);
    const metodo = dados.metodo ?? metodoDaMetodologia(dados.metodologia_geral);
    const resumo = resumoDaPesquisa(itens, metodo, ref, dados.justificativa_menos_de_tres);
    const propostas = propostasDiretas(itens, ref);
    const parametros = parametrosDaPesquisa(dados.parametros_art23, itens);
    const pendencias = pendenciasDaPesquisa(resumo, {
      justificativa_metodo: dados.justificativa_metodo,
      justificativa_fornecedores: dados.justificativa_fornecedores,
      tem_cotacao_direta: propostas.length > 0,
    });
    const alertas: Array<{ tipo: string; titulo: string; mensagem: string }> = [];
    for (const p of propostas) for (const a of p.alertas) alertas.push({ tipo: a.codigo, titulo: p.fornecedor, mensagem: a.mensagem });
    if (propostas.length && String(dados.justificativa_fornecedores ?? '').trim().length < 10) {
      alertas.push({ tipo: 'ESCOLHA_FORNECEDORES', titulo: 'Escolha dos fornecedores', mensagem: 'O inciso IV exige justificar por que estes fornecedores foram consultados.' });
    }
    const sigiloso = lic.sigilo_orcamento === 'SIGILOSO';
    if (sigiloso) {
      alertas.push({ tipo: 'SIGILO', titulo: 'Sigilo', mensagem: 'Com orçamento sigiloso (art. 24), o valor fica oculto no aviso e só é divulgado após o julgamento.' });
    }
    for (const p of parametros.filter((x) => x.situacao_tela === 'PENDENTE')) {
      alertas.push({ tipo: 'PARAMETRO_PENDENTE', titulo: `Inciso ${p.inciso}`, mensagem: `${p.titulo}: registre a consulta (com ou sem retorno) ou deixe como não consultado.` });
    }
    const itensLic = await this.ds.query(
      `SELECT id::text AS id, numero_item, descricao_resumida, quantidade, unidade_medida::text AS unidade_medida, valor_unitario_estimado, valor_total_estimado
         FROM itens_licitacao WHERE licitacao_id::text = $1 AND status::text <> 'CANCELADO' ORDER BY numero_item`,
      [licitacaoId],
    );
    let consumo: any = null;
    try {
      consumo = await this.consumoLimite.consumoDoProcesso(licitacaoId);
    } catch {
      consumo = null;
    }
    const mapa = await this.docRepo.findOne({ where: { licitacao_id: licitacaoId, tipo: TipoDocumentoFaseInterna.MAPA_COMPARATIVO_PRECOS, versao_atual: true } });
    return {
      licitacao: { id: lic.id, numero_processo: lic.numero_processo, objeto: lic.objeto, modalidade: lic.modalidade, fase: lic.fase, fase_interna: ehFaseInterna(lic.fase), sigiloso },
      peca: atual
        ? {
            documento_id: atual.id,
            versao: atual.versao,
            status: atual.status,
            origem: atual.origem,
            anexada: atual.origem !== OrigemDocumento.INTERNO,
            numero_peca: atual.numero_peca ?? null,
            data_documento: atual.data_documento ?? null,
            tem_arquivo: !!(atual.caminho_arquivo || atual.arquivo_pdf_path),
            folha_inicial: atual.folha_inicial ?? null,
            folha_final: atual.folha_final ?? null,
          }
        : null,
      mapa: mapa ? { documento_id: mapa.id, status: mapa.status, origem: mapa.origem, tem_arquivo: !!(mapa.caminho_arquivo || mapa.arquivo_pdf_path) } : null,
      certidao: dados.certidao ?? null,
      mapa_gerado_em: dados.mapa_gerado_em ?? null,
      parametros,
      propostas,
      itens: itens.map((i) => ({
        item_numero: i.item_numero,
        descricao: i.descricao,
        quantidade: i.quantidade,
        unidade: i.unidade,
        codigo: i.codigo_catser || i.codigo_catmat || i.codigo_catalogo || null,
        cotacoes: (i.cotacoes || []).length,
        valor_referencial: i.valor_referencial,
      })),
      resumo,
      metodo,
      justificativa_metodo: dados.justificativa_metodo ?? '',
      justificativa_fornecedores: dados.justificativa_fornecedores ?? '',
      justificativa_menos_de_tres: dados.justificativa_menos_de_tres ?? '',
      solicitacao_enviada_em: dados.solicitacao_enviada_em ?? null,
      publicacao_prevista: dados.publicacao_prevista ?? null,
      pendencias,
      alertas,
      consumo_limite: consumo,
      itens_licitacao: itensLic.map((i: any) => ({
        id: i.id,
        numero_item: Number(i.numero_item),
        descricao: i.descricao_resumida,
        quantidade: Number(i.quantidade),
        unidade: i.unidade_medida,
        valor_unitario: i.valor_unitario_estimado === null ? null : Number(i.valor_unitario_estimado),
        valor_total: i.valor_total_estimado === null ? null : Number(i.valor_total_estimado),
      })),
    };
  }

  // ==========================================================================
  // PARÂMETROS DO ART. 23, §1º
  // ==========================================================================

  async salvarParametro(licitacaoId: string, incisoParam: string, body: any, autor: Autor) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirFaseInterna(lic);
    const inciso = String(incisoParam || '').toUpperCase() as IncisoArt23;
    const p: Partial<ParametroArt23> = {
      inciso,
      situacao: String(body?.situacao ?? '').toUpperCase() as ParametroArt23['situacao'],
      data_consulta: body?.data_consulta ? String(body.data_consulta).slice(0, 10) : null,
      resultado: String(body?.resultado ?? '').trim().slice(0, 1000) || null,
    };
    const erro = validarParametro(p, hojeEmBrasilia());
    if (erro) throw new BadRequestException(erro);
    const doc = await this.docParaEditar(licitacaoId);
    const dados: PesquisaPrecosDados = doc.dados_estruturados || { itens: [] };
    const lista = (dados.parametros_art23 || []).filter((x) => x.inciso !== inciso);
    const anterior = (dados.parametros_art23 || []).find((x) => x.inciso === inciso);
    lista.push({
      ...(anterior || {}),
      inciso,
      situacao: p.situacao!,
      data_consulta: p.situacao === 'NAO_CONSULTADO' ? null : p.data_consulta!,
      resultado: p.resultado ?? null,
      registrado_por_nome: autor.nome,
      registrado_em: new Date().toISOString(),
    });
    dados.parametros_art23 = lista.sort((a, b) => INCISOS_ART23.indexOf(a.inciso) - INCISOS_ART23.indexOf(b.inciso));
    await this.salvarDados(doc, dados);
    return this.obter(licitacaoId);
  }

  private gravarArquivo(licitacaoId: string, prefixo: string, arquivo: ArquivoEnviado | undefined) {
    if (!arquivo?.buffer?.length) throw new BadRequestException('Envie o arquivo (campo "arquivo").');
    if (arquivo.buffer.length > MAX_EVIDENCIA) throw new BadRequestException('O arquivo passa do limite de 10 MB.');
    const nome = String(arquivo.originalname || '').toLowerCase();
    const ehPdf = pareceSerPdf(arquivo.buffer);
    const ehImagem = /^(image\/png|image\/jpe?g)$/.test(String(arquivo.mimetype)) && /\.(png|jpe?g)$/.test(nome);
    if (!ehPdf && !ehImagem) throw new BadRequestException('Só PDF, PNG ou JPG.');
    const ext = ehPdf ? '.pdf' : path.extname(nome) || '.png';
    const arq = `${prefixo}-${randomUUID()}${ext}`;
    const dir = path.join(diretorioDeGravacao(PASTA), licitacaoId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, arq), arquivo.buffer);
    return {
      rel: `${PASTA}/${licitacaoId}/${arq}`,
      nome: String(arquivo.originalname || arq).slice(0, 200),
      hash: createHash('sha256').update(arquivo.buffer).digest('hex'),
    };
  }

  /** Evidência da consulta (print, relatório do painel) — vale também para "sem retorno". */
  async anexarEvidencia(licitacaoId: string, incisoParam: string, arquivo: ArquivoEnviado | undefined, autor: Autor) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirFaseInterna(lic);
    const inciso = String(incisoParam || '').toUpperCase() as IncisoArt23;
    if (!INCISOS_ART23.includes(inciso)) throw new BadRequestException('Inciso do art. 23, §1º inválido (I a V).');
    const doc = await this.docParaEditar(licitacaoId);
    const dados: PesquisaPrecosDados = doc.dados_estruturados || { itens: [] };
    const p = (dados.parametros_art23 || []).find((x) => x.inciso === inciso);
    if (!p || p.situacao === 'NAO_CONSULTADO') throw new BadRequestException('Registre a consulta (data e resultado) antes de anexar a evidência.');
    const g = this.gravarArquivo(licitacaoId, `evidencia-art23-${inciso.toLowerCase()}`, arquivo);
    p.evidencia_path = g.rel;
    p.evidencia_nome = g.nome;
    p.evidencia_hash = g.hash;
    p.registrado_por_nome = autor.nome;
    await this.salvarDados(doc, dados);
    return this.obter(licitacaoId);
  }

  // ==========================================================================
  // COTAÇÕES DIRETAS (PROPOSTAS)
  // ==========================================================================

  /**
   * Proposta de fornecedor (cotação direta — art. 23, §1º, IV): fornecedor,
   * CNPJ válido, data de emissão (não futura), validade e o valor unitário de
   * cada item cotado. Vira uma cotação FORNECEDOR_DIRETO em cada item (mesmo
   * `grupo_id`) — o mapa, o agente e o relatório público continuam lendo dali.
   */
  async adicionarProposta(licitacaoId: string, body: any, autor: Autor) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirFaseInterna(lic);
    const fornecedor = String(body?.fornecedor ?? '').trim().slice(0, 250);
    if (!fornecedor) throw new BadRequestException('Informe o fornecedor.');
    if (!cnpjValido(body?.cnpj)) throw new BadRequestException('CNPJ do fornecedor inválido.');
    const hoje = hojeEmBrasilia();
    const emissao = String(body?.data_emissao ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(emissao)) throw new BadRequestException('Informe a data de emissão da proposta (AAAA-MM-DD).');
    if (emissao > hoje) throw new BadRequestException('A data de emissão não pode ser futura.');
    const validade = body?.validade_ate ? String(body.validade_ate).slice(0, 10) : '';
    if (validade && (!/^\d{4}-\d{2}-\d{2}$/.test(validade) || validade < emissao)) throw new BadRequestException('A validade precisa ser uma data igual ou posterior à emissão.');
    const itensCotados: Array<{ item_numero: number; valor_unitario: number }> = (Array.isArray(body?.itens) ? body.itens : [])
      .map((x: any) => ({ item_numero: Number(x?.item_numero), valor_unitario: Math.round(Number(x?.valor_unitario) * 10000) / 10000 }))
      .filter((x: any) => Number.isInteger(x.item_numero) && x.valor_unitario > 0);
    if (!itensCotados.length) throw new BadRequestException('Informe o valor unitário de ao menos um item.');

    const doc = await this.docParaEditar(licitacaoId);
    const dados: PesquisaPrecosDados = doc.dados_estruturados || { itens: [] };
    const cnpj = formatarCnpj(String(body.cnpj));
    const grupo = randomUUID();
    for (const ic of itensCotados) {
      const item = (dados.itens || []).find((i) => Number(i.item_numero) === ic.item_numero);
      if (!item) throw new BadRequestException(`Item ${ic.item_numero} não existe na pesquisa.`);
      const cotacao: CotacaoPorFonte = {
        fonte: 'FORNECEDOR_DIRETO',
        descricao_fonte: `Proposta de ${fornecedor}`,
        data_pesquisa: emissao,
        fornecedor_cnpj: cnpj,
        fornecedor_razao_social: fornecedor,
        valor_unitario: ic.valor_unitario,
        observacao: String(body?.observacao ?? '').trim().slice(0, 500) || undefined,
        grupo_id: grupo,
        data_emissao: emissao,
        ...(validade ? { validade_ate: validade } : {}),
      };
      item.cotacoes = [...(item.cotacoes || []), cotacao];
    }
    if (body?.solicitacao_enviada_em) {
      const s = String(body.solicitacao_enviada_em).slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s) && s <= hoje) dados.solicitacao_enviada_em = s;
    }
    await this.salvarDados(doc, dados);
    await this.log(licitacaoId, doc.id, `Cotação direta registrada: ${fornecedor} (${cnpj}) por ${autor.nome ?? 'usuário'}`, autor);
    return { ...(await this.obter(licitacaoId)), grupo_id: grupo };
  }

  async removerProposta(licitacaoId: string, grupoId: string, autor: Autor) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirFaseInterna(lic);
    const doc = await this.docParaEditar(licitacaoId);
    const dados: PesquisaPrecosDados = doc.dados_estruturados || { itens: [] };
    let removidas = 0;
    const alvo = (c: CotacaoPorFonte) =>
      c.fonte === 'FORNECEDOR_DIRETO' && (c.grupo_id === grupoId || (grupoId.startsWith('cnpj:') && !c.grupo_id && `cnpj:${soDigitos(c.fornecedor_cnpj)}` === grupoId));
    for (const item of dados.itens || []) {
      const antes = (item.cotacoes || []).length;
      // Índices dos outliers descartados deixam de valer quando a lista muda
      item.cotacoes = (item.cotacoes || []).filter((c) => !alvo(c));
      if (item.cotacoes.length !== antes) {
        removidas += antes - item.cotacoes.length;
        item.outliers_descartados = undefined;
      }
    }
    if (!removidas) throw new NotFoundException('Proposta não encontrada');
    await this.salvarDados(doc, dados);
    await this.log(licitacaoId, doc.id, `Cotação direta removida (${removidas} ${removidas === 1 ? 'preço' : 'preços'}) por ${autor.nome ?? 'usuário'}`, autor);
    return this.obter(licitacaoId);
  }

  async anexarComprovante(licitacaoId: string, grupoId: string, arquivo: ArquivoEnviado | undefined, autor: Autor) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirFaseInterna(lic);
    const doc = await this.docParaEditar(licitacaoId);
    const dados: PesquisaPrecosDados = doc.dados_estruturados || { itens: [] };
    const cotacoes = (dados.itens || []).flatMap((i) => i.cotacoes || []).filter((c) => c.grupo_id === grupoId);
    if (!cotacoes.length) throw new NotFoundException('Proposta não encontrada');
    const g = this.gravarArquivo(licitacaoId, 'comprovante-cotacao', arquivo);
    for (const c of cotacoes) {
      c.documento_comprobatorio_path = g.rel;
      c.documento_hash = g.hash;
    }
    await this.salvarDados(doc, dados);
    await this.log(licitacaoId, doc.id, `Comprovante da cotação anexado por ${autor.nome ?? 'usuário'}`, autor);
    return this.obter(licitacaoId);
  }

  // ==========================================================================
  // MÉTODO, EMISSÃO DO MAPA E DA CERTIDÃO
  // ==========================================================================

  async salvarMetodo(licitacaoId: string, body: any) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirFaseInterna(lic);
    const doc = await this.docParaEditar(licitacaoId);
    const dados: PesquisaPrecosDados = doc.dados_estruturados || { itens: [] };
    if (body?.metodo !== undefined && body.metodo !== null && body.metodo !== '') {
      const m = String(body.metodo).toUpperCase() as MetodoPesquisa;
      if (!METODOS.includes(m)) throw new BadRequestException('Método deve ser MENOR, MEDIA ou MEDIANA.');
      dados.metodo = m;
      dados.metodologia_geral = METODOLOGIA_DO_METODO[m];
    }
    for (const campo of ['justificativa_metodo', 'justificativa_fornecedores', 'justificativa_menos_de_tres'] as const) {
      if (body?.[campo] !== undefined) dados[campo] = String(body[campo] ?? '').trim().slice(0, 4000);
    }
    for (const campo of ['publicacao_prevista', 'solicitacao_enviada_em'] as const) {
      if (body?.[campo] === undefined) continue;
      const d = String(body[campo] ?? '').slice(0, 10);
      if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new BadRequestException('Data inválida (AAAA-MM-DD).');
      dados[campo] = d || undefined;
    }
    await this.salvarDados(doc, dados);
    return this.obter(licitacaoId);
  }

  /**
   * EMITIR o mapa e a certidão: confere as pendências (método, justificativas,
   * 3 preços), aplica o método em cada item (valor de referência), gera o
   * mapa (gerador-pp existente) e a certidão, e registra a peça PP — o valor
   * de referência vira o valor estimado dos itens na fase interna.
   */
  async emitir(licitacaoId: string, body: any, autor: Autor) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirFaseInterna(lic);
    const doc = await this.docParaEditar(licitacaoId);
    const dados: PesquisaPrecosDados = doc.dados_estruturados || { itens: [] };
    const itens = (dados.itens || []).map((i) => ({ ...i, ...calcularEstatisticasItem(i) }));
    const ref = this.ref(dados, lic);
    const metodo = dados.metodo ?? metodoDaMetodologia(dados.metodologia_geral);
    const resumo = resumoDaPesquisa(itens, metodo, ref, dados.justificativa_menos_de_tres);
    const propostas = propostasDiretas(itens, ref);
    const pend = pendenciasDaPesquisa(resumo, {
      justificativa_metodo: dados.justificativa_metodo,
      justificativa_fornecedores: dados.justificativa_fornecedores,
      tem_cotacao_direta: propostas.length > 0,
    });
    if (pend.bloqueios.length) throw new BadRequestException({ message: `Não é possível emitir: ${pend.bloqueios.join(' ')}`, pendencias: pend.bloqueios });

    // PORTÃO A (Entrega 4): concluir a pesquisa com o valor adotado não pode passar do limite
    // da dispensa no ramo (LIM-01 — soma das dispensas do órgão no exercício; art. 75, §1º)
    const valoresPrevistos: Record<number, number> = {};
    for (const r of resumo.itens) if (r.valor_total_adotado !== null) valoresPrevistos[Number(r.item_numero)] = r.valor_total_adotado;
    const portaoA = await pendenciasDoPortaoDoProcesso(licitacaoId, 'A', { ato: 'CONCLUIR_PESQUISA', valores_itens: valoresPrevistos });
    if (portaoA.length) throw new BadRequestException({ message: `Não é possível emitir: ${portaoA.join(' ')}`, pendencias: portaoA, portao: 'A' });

    // Valor de referência de cada item = o do método (sobre os preços válidos)
    dados.itens = itens.map((i) => {
      const r = resumo.itens.find((x) => x.item_numero === i.item_numero);
      return {
        ...i,
        metodologia: METODOLOGIA_DO_METODO[metodo!],
        justificativa_metodologia: dados.justificativa_metodo,
        valor_referencial: r?.valor_unitario_adotado ?? (valorPeloMetodo(r!.estatistica, metodo!) || 0),
      };
    });
    const [u] = autor.id
      ? await this.ds.query(`SELECT nome, cargo, matricula FROM usuarios WHERE id::text = $1`, [autor.id]).catch(() => [])
      : [];
    const responsavel = {
      nome: String(body?.responsavel?.nome || dados.responsavel_pesquisa?.nome || u?.nome || autor.nome || 'Responsável pela pesquisa'),
      cargo: String(body?.responsavel?.cargo || dados.responsavel_pesquisa?.cargo || u?.cargo || ''),
      matricula: body?.responsavel?.matricula || dados.responsavel_pesquisa?.matricula || u?.matricula || undefined,
    };
    dados.responsavel_pesquisa = responsavel;
    const total = resumo.total_adotado ?? 0;
    const mapa = await this.geradorPp.gerarDocumentoPP(licitacaoId, {
      numeroProcesso: '',
      objeto: '',
      orgao: '',
      itens: dados.itens,
      metodologia: METODOLOGIA_DO_METODO[metodo!],
      justificativaMetodologia: dados.justificativa_metodo,
      valorTotalEstimado: total,
      responsavel,
      dataAssinatura: hojeEmBrasilia(),
    });
    const parametros = parametrosDaPesquisa(dados.parametros_art23, itens);
    const certidao = await this.geradorPp.gerarCertidao(licitacaoId, {
      parametros,
      propostas,
      metodo: metodo!,
      justificativa_metodo: String(dados.justificativa_metodo),
      justificativa_fornecedores: dados.justificativa_fornecedores,
      justificativa_menos_de_tres: resumo.precos_validos_por_item_minimo < 3 ? dados.justificativa_menos_de_tres : null,
      total_adotado: total,
      sigiloso: lic.sigilo_orcamento === 'SIGILOSO',
      responsavel,
    });
    dados.certidao = { path: certidao, gerada_em: new Date().toISOString() };
    const jaEmitida = !!doc.dados_estruturados?.mapa_gerado_em;
    dados.mapa_gerado_em = new Date().toISOString();
    // Emitir de novo = VERSÃO NOVA da pesquisa (homologação E3): a emissão
    // anterior, com o mapa e a certidão dela, fica no histórico (SUBSTITUIDO).
    const alvo = jaEmitida ? await this.novaVersaoDaPesquisa(doc) : doc;
    await this.salvarDados(alvo, dados);
    await this.faseInterna.registrarDocumentoPPGerado(licitacaoId, mapa, total);
    await this.log(licitacaoId, doc.id, `Mapa e certidão da pesquisa emitidos por ${autor.nome ?? 'usuário'} (método ${metodo}, total ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`, autor);
    return this.obter(licitacaoId);
  }

  /**
   * PESQUISA FEITA FORA (decisão 2 do dono): o mapa vai como anexo da peça PP
   * (endpoint de anexo da Entrega 1) e o valor unitário é digitado em cada
   * item — o PNCP exige o valor por item. Atualiza itens e o valor do processo.
   */
  async salvarValoresItens(licitacaoId: string, body: any, autor: Autor) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirFaseInterna(lic);
    const lista: Array<{ item_id: string; valor_unitario: number }> = Array.isArray(body?.itens) ? body.itens : [];
    if (!lista.length) throw new BadRequestException('Informe o valor unitário dos itens.');
    const itens = await this.ds.query(`SELECT id::text AS id, numero_item, quantidade FROM itens_licitacao WHERE licitacao_id::text = $1 AND status::text <> 'CANCELADO'`, [licitacaoId]);
    const porId = new Map<string, any>(itens.map((i: any) => [i.id, i]));
    for (const x of lista) {
      const item = porId.get(String(x?.item_id));
      if (!item) throw new BadRequestException('Item não pertence a este processo.');
      const v = Number(x?.valor_unitario);
      if (!Number.isFinite(v) || v <= 0) throw new BadRequestException(`Item ${item.numero_item}: valor unitário deve ser maior que zero.`);
    }
    await this.ds.transaction(async (m) => {
      for (const x of lista) {
        const item = porId.get(String(x.item_id));
        const vu = Math.round(Number(x.valor_unitario) * 10000) / 10000;
        const vt = Math.round(Number(item.quantidade) * vu * 100) / 100;
        await m.query(`UPDATE itens_licitacao SET valor_unitario_estimado = $2, valor_total_estimado = $3, updated_at = now() WHERE id::text = $1`, [x.item_id, vu, vt]);
      }
      await m.query(
        `UPDATE licitacoes SET valor_total_estimado = (SELECT COALESCE(SUM(valor_total_estimado), 0) FROM itens_licitacao WHERE licitacao_id::text = $1 AND status::text <> 'CANCELADO'), updated_at = now() WHERE id::text = $1`,
        [licitacaoId],
      );
    });
    await this.log(licitacaoId, undefined, `Valores unitários informados nos itens (pesquisa feita fora) por ${autor.nome ?? 'usuário'}`, autor);
    // SQL cru não passa pelo gatilho: a conformidade (portão A — limite) e as tarefas revisam
    avisarPecaAlterada(licitacaoId);
    return this.obter(licitacaoId);
  }

  /** Arquivo de evidência, comprovante ou certidão — só os registrados na pesquisa deste processo. */
  async arquivo(licitacaoId: string, tipo: string, chave: string): Promise<{ caminho: string; nome: string; mime: string }> {
    const atual = await this.docRepo.findOne({ where: { licitacao_id: licitacaoId, tipo: TipoDocumentoFaseInterna.PESQUISA_PRECOS, versao_atual: true } });
    const dados: PesquisaPrecosDados = atual?.dados_estruturados || { itens: [] };
    let rel: string | undefined;
    let nome = 'arquivo';
    if (tipo === 'evidencia') {
      const p = (dados.parametros_art23 || []).find((x) => x.inciso === String(chave).toUpperCase());
      rel = p?.evidencia_path ?? undefined;
      nome = p?.evidencia_nome || `evidencia-${chave}`;
    } else if (tipo === 'comprovante') {
      const c = (dados.itens || []).flatMap((i) => i.cotacoes || []).find((x) => x.grupo_id === chave && x.documento_comprobatorio_path);
      rel = c?.documento_comprobatorio_path;
      nome = `comprovante-${chave.slice(0, 8)}${path.extname(rel || '') || '.pdf'}`;
    } else if (tipo === 'certidao') {
      rel = dados.certidao?.path;
      nome = 'certidao-pesquisa-precos.pdf';
    }
    if (!rel) throw new NotFoundException('Arquivo não encontrado');
    let caminho = resolverArquivoDeUrl(rel);
    if (!caminho) {
      for (const base of basesDeLeitura()) {
        const c = caminhoContido(base, rel);
        if (c && fs.existsSync(c)) {
          caminho = c;
          break;
        }
      }
    }
    if (!caminho || !fs.existsSync(caminho)) throw new NotFoundException('Arquivo não encontrado');
    const ext = path.extname(caminho).toLowerCase();
    return { caminho, nome: nome.replace(/[^\w.\-() ]+/g, '_'), mime: ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/pdf' };
  }

  private async log(licitacaoId: string, documentoId: string | undefined, descricao: string, autor: Autor) {
    await this.auditLog
      .log({
        licitacao_id: licitacaoId,
        documento_id: documentoId,
        acao: AcaoLogFaseInterna.DOCUMENTO_EDITADO,
        descricao,
        contexto: { usuario_id: autor.id ?? undefined, usuario_nome: autor.nome ?? undefined },
      })
      .catch(() => undefined);
  }
}

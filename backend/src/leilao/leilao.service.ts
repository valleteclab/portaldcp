import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource, EntityManager, In } from 'typeorm';
import { FaseLicitacao, Licitacao, ModalidadeLicitacao } from '../licitacoes/entities/licitacao.entity';
import { FASES_INTERNAS } from '../licitacoes/transicoes/fases';
import { TransicoesService } from '../licitacoes/transicoes/transicoes.service';
import { AtorTransicao, atorSistema } from '../licitacoes/transicoes/transicoes.tipos';
import { RankingService, UnidadeJulgamento } from '../julgamento/ranking.service';
import { SituacaoLicitante } from '../julgamento/regras-julgamento';
import { EventoSessao, TipoEvento } from '../sessao/entities/evento-sessao.entity';
import { estadoRecursalSql } from '../sessao/recursos.sql';
import { calendarioDoOrgao, fimDoPrazoEmDiasUteis } from '../common/prazos/dias-uteis';
import { diretorioDeGravacao, diretorioUploads } from '../common/arquivos/arquivos';
import { EntradaAdjudicacao, PlanoAdjudicacao, ResultadoService } from '../resultado/resultado.service';
import { fmtDataHoraBrasilia } from '../resultado/formalizacao/termo-resultado-pdf';
import { fmtDocumento, fmtMoeda, gerarTermoSimplesPdf } from '../modalidades-especiais/termo-pdf';
import { Arrematacao, LeilaoBem, LeilaoConfiguracao } from './leilao.entities';
import {
  STATUS_ARREMATACAO_ATIVA,
  alertasConfiguracaoLeilao,
  escolherArrematante,
  motivoTransicaoPagamentoInvalida,
  pendenciasPagamento,
  validarBem,
  validarConfiguracaoLeilao,
  valorComissao,
} from './regras-leilao';
import { pendenciasEditalLeilaoSql, unidadesDoLeilaoSql } from './leilao.sql';

export type VisaoLeilao = { tipo: 'ORGAO' } | { tipo: 'FORNECEDOR'; fornecedorId: string } | { tipo: 'PUBLICO' };

export interface ArquivoEnviado {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
}

const MIMES_FOTO = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
const MIMES_COMPROVANTE = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
export const TAMANHO_MAXIMO_FOTO = 8 * 1024 * 1024;
export const TAMANHO_MAXIMO_COMPROVANTE = 10 * 1024 * 1024;
export const PASTA_FOTOS_LEILAO = 'leilao-bens'; // PÚBLICA por natureza (TIPOS_PUBLICOS)
const PASTA_TERMOS = 'leilao'; // sensível

const r2 = (v: number) => Math.round(Number(v) * 100) / 100;

/**
 * ============================================================================
 * LEILÃO (Lei 14.133/2021 art. 31; plano E7c) — regras em `regras-leilao.ts`
 * ============================================================================
 *  - Edital: configuração (leiloeiro/servidor, pagamento, visitação) e bens
 *    (descrição, avaliação, preço mínimo, localização, ônus, fotos). Editável
 *    só na fase interna — depois, retificação (art. 55 §1º).
 *  - Disputa: motor único na direção MAIOR (item ou lote); a proposta é o
 *    lance inicial fechado ≥ preço mínimo (guarda da proposta).
 *  - JULGAMENTO: o agente DECLARA os arrematantes — maior lance ≥ preço
 *    mínimo (Dec. 11.461 art. 21) → licitante ACEITO + arrematação.
 *  - Recurso (E5, janela no JULGAMENTO). Superada a fase recursal, os
 *    arrematantes são CONVOCADOS a pagar (prazo em dias úteis do edital);
 *    o arrematante envia o comprovante; o órgão confirma (PAGA) ou declara a
 *    inadimplência → lance imediatamente subsequente (Dec. 11.461 art. 26 §3º).
 *  - ADJUDICAR/HOMOLOGAR pelo ResultadoService (plano = arrematações pagas;
 *    art. 31 §4º) e, homologado, o TERMO DE ARREMATAÇÃO (em vez de contrato).
 */
@Injectable()
export class LeilaoService implements OnModuleInit {
  private readonly logger = new Logger(LeilaoService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly transicoes: TransicoesService,
    private readonly ranking: RankingService,
    private readonly resultado: ResultadoService,
  ) {}

  onModuleInit(): void {
    this.resultado.registrarModalidade(ModalidadeLicitacao.LEILAO, {
      rotuloInstrumento: 'Termo de arrematação',
      planoAdjudicacao: (id, m) => this.planoAdjudicacao(id, m),
      gerarInstrumentos: (id, ator) => this.gerarTermos(id, ator),
      listarInstrumentos: (id) => this.listarTermos(id),
    });
  }

  // ==========================================================================
  // APOIO
  // ==========================================================================

  private async licitacao(id: string, m: EntityManager = this.ds.manager): Promise<Licitacao> {
    const lic = await m.getRepository(Licitacao).findOne({ where: { id } });
    if (!lic || lic.modalidade !== ModalidadeLicitacao.LEILAO) throw new NotFoundException('Leilão não encontrado');
    return lic;
  }

  private exigirAtiva(lic: Licitacao) {
    if (lic.situacao && lic.situacao !== 'ATIVA') throw new ConflictException(`Leilão ${String(lic.situacao).toLowerCase()} — ato não permitido`);
  }

  private exigirFaseInterna(lic: Licitacao, oque: string) {
    if (!FASES_INTERNAS.includes(lic.fase)) {
      throw new ConflictException(`${oque}: edital já publicado — altere pela retificação do edital (art. 55, §1º).`);
    }
  }

  private async evento(m: EntityManager, licitacaoId: string, descricao: string, dados: Record<string, any> = {}, fornecedorId?: string | null, valor?: number | null) {
    const [s] = await m.query(`SELECT id FROM sessoes_disputa WHERE licitacao_id = $1 ORDER BY created_at DESC LIMIT 1`, [licitacaoId]);
    if (!s) return;
    await m.save(
      m.create(EventoSessao, {
        sessao_id: s.id,
        tipo: TipoEvento.MENSAGEM_SISTEMA,
        descricao,
        fornecedor_id: fornecedorId ?? undefined,
        fornecedor_identificador: fornecedorId ?? undefined,
        valor: valor ?? undefined,
        usuario_nome: 'Leiloeiro',
        is_sistema: false,
        dados_adicionais: { origem: 'leilao', ...dados },
      }),
    );
  }

  private rotulo(u: { tipo: 'ITEM' | 'LOTE'; numero: number }) {
    return `${u.tipo === 'LOTE' ? 'Lote' : 'Item'} ${u.numero}`;
  }

  /** Preço mínimo da unidade (item: o do bem; lote: soma dos bens). */
  private async precoMinimo(m: EntityManager, u: UnidadeJulgamento): Promise<number> {
    const [r] = await m.query(
      `SELECT COALESCE(SUM(valor_minimo), 0) AS total FROM leilao_bens WHERE item_licitacao_id::text = ANY($1::text[])`,
      [u.itens.map((i) => i.id)],
    );
    return Number(r?.total ?? 0);
  }

  // ==========================================================================
  // EDITAL: configuração e bens
  // ==========================================================================

  async painel(licitacaoId: string, visao: VisaoLeilao) {
    const lic = await this.licitacao(licitacaoId);
    if (visao.tipo === 'PUBLICO' && FASES_INTERNAS.includes(lic.fase)) throw new NotFoundException('Leilão não encontrado');
    const config = await this.ds.getRepository(LeilaoConfiguracao).findOne({ where: { licitacao_id: licitacaoId } });
    const itens: any[] = await this.ds.query(
      `SELECT i.id::text AS id, i.numero_item, i.descricao_resumida, i.quantidade, i.status::text AS status, i.lote_id::text AS lote_id,
              i.fornecedor_vencedor_id, i.valor_total_homologado
         FROM itens_licitacao i WHERE i.licitacao_id = $1 ORDER BY i.numero_item`,
      [licitacaoId],
    );
    const bens = await this.ds.getRepository(LeilaoBem).find({ where: { licitacao_id: licitacaoId } });
    const arrs = await this.ds.getRepository(Arrematacao).find({ where: { licitacao_id: licitacaoId }, order: { numero_unidade: 'ASC', ordem: 'ASC' } });
    const nomes = await this.nomes(arrs.map((a) => a.fornecedor_id));
    const publicoConfig = config
      ? {
          tipo_leiloeiro: config.tipo_leiloeiro,
          servidor_nome: config.servidor_nome,
          ato_designacao: config.ato_designacao,
          leiloeiro_nome: config.leiloeiro_nome,
          leiloeiro_matricula: config.leiloeiro_matricula,
          leiloeiro_uf: config.leiloeiro_uf,
          comissao_percentual: config.comissao_percentual != null ? Number(config.comissao_percentual) : null,
          leiloeiro_forma_selecao: config.leiloeiro_forma_selecao,
          leiloeiro_processo_selecao: config.leiloeiro_processo_selecao,
          forma_pagamento: config.forma_pagamento,
          prazo_pagamento_dias_uteis: config.prazo_pagamento_dias_uteis,
          parcelas: config.parcelas,
          condicoes_pagamento: config.condicoes_pagamento,
          local_visitacao: config.local_visitacao,
          periodo_visitacao: config.periodo_visitacao,
          observacoes: config.observacoes,
        }
      : null;
    const homologado = !!lic.data_homologacao;
    const verArrematacao = (a: Arrematacao) =>
      visao.tipo === 'ORGAO' || (visao.tipo === 'FORNECEDOR' && visao.fornecedorId === a.fornecedor_id) || (homologado && a.status === 'PAGA');
    return {
      licitacao: { id: lic.id, numero_processo: lic.numero_processo, objeto: lic.objeto, fase: lic.fase, situacao: lic.situacao, base_lance: lic.base_lance },
      configuracao: visao.tipo === 'ORGAO' ? (config ? { ...publicoConfig, servidor_usuario_id: config.servidor_usuario_id, leiloeiro_cpf: config.leiloeiro_cpf } : null) : publicoConfig,
      alertas: visao.tipo === 'ORGAO' && config ? alertasConfiguracaoLeilao(config as any) : [],
      bens: itens.map((i) => {
        const b = bens.find((x) => x.item_licitacao_id === i.id);
        return {
          itemId: i.id,
          numero: Number(i.numero_item),
          loteId: i.lote_id,
          descricaoItem: i.descricao_resumida,
          quantidade: Number(i.quantidade),
          status: i.status,
          bem: b
            ? {
                id: b.id,
                tipo_bem: b.tipo_bem,
                descricao: b.descricao,
                valor_avaliacao: Number(b.valor_avaliacao),
                data_avaliacao: b.data_avaliacao,
                avaliacao_responsavel: b.avaliacao_responsavel,
                valor_minimo: Number(b.valor_minimo),
                localizacao: b.localizacao,
                visitacao: b.visitacao,
                onus_gravames: b.onus_gravames,
                matricula_imovel: b.matricula_imovel,
                situacao_divisas: b.situacao_divisas,
                autorizacao_legislativa: b.autorizacao_legislativa,
                fotos: b.fotos ?? [],
              }
            : null,
        };
      }),
      arrematacoes: arrs.filter(verArrematacao).map((a) => this.visaoArrematacao(a, nomes, visao)),
      pendenciasEdital: visao.tipo === 'ORGAO' && FASES_INTERNAS.includes(lic.fase) ? await pendenciasEditalLeilaoSql(this.ds.manager, licitacaoId) : [],
      pagamento: visao.tipo === 'ORGAO' ? await this.estadoPagamento(lic) : null,
    };
  }

  private visaoArrematacao(a: Arrematacao, nomes: Map<string, { nome: string; doc: string }>, visao: VisaoLeilao) {
    const orgaoOuDono = visao.tipo === 'ORGAO' || (visao.tipo === 'FORNECEDOR' && visao.fornecedorId === a.fornecedor_id);
    return {
      id: a.id,
      unidadeId: a.unidade_id,
      tipoUnidade: a.tipo_unidade,
      numero: a.numero_unidade,
      ordem: a.ordem,
      fornecedorId: a.fornecedor_id,
      arrematante: nomes.get(a.fornecedor_id)?.nome ?? null,
      documento: orgaoOuDono ? nomes.get(a.fornecedor_id)?.doc ?? null : null,
      valor: Number(a.valor),
      valorComissao: a.valor_comissao != null ? Number(a.valor_comissao) : null,
      status: a.status,
      declaradaEm: a.declarada_em,
      prazoPagamento: a.prazo_pagamento,
      pagamentoInformadoEm: orgaoOuDono ? a.pagamento_informado_em : null,
      comprovante: orgaoOuDono && a.comprovante_nome ? { nome: a.comprovante_nome, sha256: a.comprovante_sha256 } : null,
      pagamentoConfirmadoEm: a.pagamento_confirmado_em,
      motivo: orgaoOuDono ? a.motivo : null,
      termoGeradoEm: a.termo_gerado_em,
      temTermo: orgaoOuDono && !!a.termo_caminho,
    };
  }

  private async nomes(ids: string[]): Promise<Map<string, { nome: string; doc: string }>> {
    const v = [...new Set(ids.filter(Boolean))];
    if (!v.length) return new Map();
    const rows: any[] = await this.ds.query(`SELECT id::text AS id, razao_social, cpf_cnpj FROM fornecedores WHERE id::text = ANY($1)`, [v]);
    return new Map(rows.map((r) => [r.id, { nome: r.razao_social, doc: r.cpf_cnpj }]));
  }

  async salvarConfiguracao(licitacaoId: string, dto: Record<string, any>) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirAtiva(lic);
    this.exigirFaseInterna(lic, 'Configuração do leilão');
    const campos = [
      'tipo_leiloeiro', 'servidor_usuario_id', 'servidor_nome', 'ato_designacao', 'leiloeiro_nome', 'leiloeiro_cpf', 'leiloeiro_matricula',
      'leiloeiro_uf', 'comissao_percentual', 'leiloeiro_forma_selecao', 'leiloeiro_processo_selecao', 'forma_pagamento',
      'prazo_pagamento_dias_uteis', 'parcelas', 'condicoes_pagamento', 'local_visitacao', 'periodo_visitacao', 'observacoes',
    ];
    const dados: Record<string, any> = {};
    for (const c of campos) if (dto?.[c] !== undefined) dados[c] = dto[c] === '' ? null : dto[c];
    if (dados.servidor_usuario_id) {
      const [u] = await this.ds.query(`SELECT nome, orgao_id::text AS orgao_id FROM usuarios WHERE id::text = $1`, [dados.servidor_usuario_id]);
      if (!u || u.orgao_id !== String(lic.orgao_id)) throw new BadRequestException('O servidor designado deve ser usuário do órgão licitante.');
      dados.servidor_nome = dados.servidor_nome || u.nome;
    }
    if (dados.leiloeiro_cpf) dados.leiloeiro_cpf = String(dados.leiloeiro_cpf).replace(/\D/g, '').slice(0, 14);
    const repo = this.ds.getRepository(LeilaoConfiguracao);
    const atual = await repo.findOne({ where: { licitacao_id: licitacaoId } });
    const final = { ...(atual ?? {}), ...dados };
    const erros = validarConfiguracaoLeilao(final as any);
    if (erros.length) throw new BadRequestException({ message: erros.join(' | '), pendencias: erros });
    await repo.save(repo.create({ ...(atual ?? {}), ...dados, licitacao_id: licitacaoId }));
    return this.painel(licitacaoId, { tipo: 'ORGAO' });
  }

  async salvarBem(licitacaoId: string, itemId: string, dto: Record<string, any>) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirAtiva(lic);
    this.exigirFaseInterna(lic, 'Cadastro do bem');
    const [item] = await this.ds.query(`SELECT id::text AS id, numero_item, quantidade FROM itens_licitacao WHERE id::text = $1 AND licitacao_id = $2`, [itemId, licitacaoId]);
    if (!item) throw new NotFoundException('Item não pertence a este leilão');
    const campos = [
      'tipo_bem', 'descricao', 'valor_avaliacao', 'data_avaliacao', 'avaliacao_responsavel', 'valor_minimo', 'localizacao', 'visitacao',
      'onus_gravames', 'matricula_imovel', 'situacao_divisas', 'autorizacao_legislativa',
    ];
    const repo = this.ds.getRepository(LeilaoBem);
    const atual = await repo.findOne({ where: { item_licitacao_id: itemId } });
    const dados: Record<string, any> = {};
    for (const c of campos) if (dto?.[c] !== undefined) dados[c] = dto[c] === '' ? null : dto[c];
    const final = { ...(atual ?? {}), ...dados };
    const erros = validarBem({ ...(final as any), numero_item: Number(item.numero_item) });
    if (erros.length) throw new BadRequestException({ message: erros.join(' | '), pendencias: erros });
    await this.ds.transaction(async (m) => {
      await m.getRepository(LeilaoBem).save(m.getRepository(LeilaoBem).create({ ...(atual ?? {}), ...dados, licitacao_id: licitacaoId, item_licitacao_id: itemId }));
      // O "valor estimado" do item no leilão é o PREÇO MÍNIMO (referência do motor e do PNCP); bem = material
      const qtd = Number(item.quantidade) > 0 ? Number(item.quantidade) : 1;
      const minimo = r2(Number(final.valor_minimo));
      await m.query(
        `UPDATE itens_licitacao SET valor_unitario_estimado = $2, valor_total_estimado = $3, tipo_item = 'MATERIAL', updated_at = now() WHERE id::text = $1`,
        [itemId, Math.round((minimo / qtd) * 10000) / 10000, minimo],
      );
      const [{ total }] = await m.query(`SELECT COALESCE(SUM(valor_total_estimado), 0) AS total FROM itens_licitacao WHERE licitacao_id = $1`, [licitacaoId]);
      await m.query(`UPDATE licitacoes SET valor_total_estimado = $2 WHERE id = $1`, [licitacaoId, Number(total)]);
    });
    return this.painel(licitacaoId, { tipo: 'ORGAO' });
  }

  /** Foto do bem — pasta PÚBLICA por natureza (`leilao-bens/<licitação>/`). */
  async adicionarFoto(licitacaoId: string, itemId: string, arquivo: ArquivoEnviado | null) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirAtiva(lic);
    if (!arquivo?.buffer?.length) throw new BadRequestException('Envie a foto do bem');
    if (!MIMES_FOTO.includes(String(arquivo.mimetype))) throw new BadRequestException('Foto: use JPG, PNG ou WEBP.');
    if (Number(arquivo.size) > TAMANHO_MAXIMO_FOTO) throw new BadRequestException('Foto acima de 8 MB.');
    const repo = this.ds.getRepository(LeilaoBem);
    const bem = await repo.findOne({ where: { item_licitacao_id: itemId, licitacao_id: licitacaoId } });
    if (!bem) throw new NotFoundException('Cadastre o bem antes de enviar fotos');
    if ((bem.fotos ?? []).length >= 20) throw new BadRequestException('Limite de 20 fotos por bem.');
    const ext = (path.extname(arquivo.originalname || '').toLowerCase() || '.jpg').replace(/[^.a-z0-9]/g, '');
    const nome = `${randomUUID()}${ext}`;
    const dir = path.join(diretorioDeGravacao(PASTA_FOTOS_LEILAO), licitacaoId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, nome), arquivo.buffer);
    bem.fotos = [...(bem.fotos ?? []), { url: `/api/uploads/${PASTA_FOTOS_LEILAO}/${licitacaoId}/${nome}`, nome: String(arquivo.originalname || nome).slice(0, 200), enviadoEm: new Date().toISOString() }];
    await repo.save(bem);
    return { fotos: bem.fotos };
  }

  async removerFoto(licitacaoId: string, itemId: string, url: string) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirAtiva(lic);
    const repo = this.ds.getRepository(LeilaoBem);
    const bem = await repo.findOne({ where: { item_licitacao_id: itemId, licitacao_id: licitacaoId } });
    if (!bem) throw new NotFoundException('Bem não encontrado');
    const antes = bem.fotos ?? [];
    bem.fotos = antes.filter((f) => f.url !== url);
    if (bem.fotos.length === antes.length) throw new NotFoundException('Foto não encontrada');
    await repo.save(bem);
    const nome = String(url).split('/').pop();
    if (nome && !nome.includes('..')) {
      try {
        fs.unlinkSync(path.join(diretorioUploads(), PASTA_FOTOS_LEILAO, licitacaoId, nome));
      } catch {
        /* arquivo órfão não é problema */
      }
    }
    return { fotos: bem.fotos };
  }

  // ==========================================================================
  // JULGAMENTO: declaração dos arrematantes
  // ==========================================================================

  /**
   * Declara o arrematante de cada unidade encerrada ainda sem arrematação
   * ativa: maior lance ≥ preço mínimo (Dec. 11.461 art. 21) → ACEITO +
   * arrematação DECLARADA. Unidade sem lances → DESERTO; lances todos abaixo
   * do preço mínimo → FRACASSADO (roll-up da licitação). Idempotente.
   */
  async declararArrematantes(licitacaoId: string, ator: AtorTransicao) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirAtiva(lic);
    if (lic.fase !== FaseLicitacao.JULGAMENTO) {
      throw new ConflictException('Os arrematantes são declarados no julgamento, depois do encerramento da disputa de todos os bens.');
    }
    const cfg = await this.ds.getRepository(LeilaoConfiguracao).findOne({ where: { licitacao_id: licitacaoId } });
    const declaradas: string[] = [];
    await this.ds.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`leilao:${licitacaoId}`]);
      const unidades = await this.ranking.unidades(licitacaoId, m);
      for (const u of unidades) {
        if (!RankingService.unidadeComResultadoPossivel(u)) continue;
        if (!u.encerrada) throw new ConflictException(`${this.rotulo(u)}: disputa ainda não encerrada.`);
        const existentes = await m.getRepository(Arrematacao).find({ where: { unidade_id: u.id } });
        if (existentes.some((a) => STATUS_ARREMATACAO_ATIVA.includes(a.status))) continue;
        const r = await this.declararNaUnidade(m, lic, u, existentes, ator, cfg, 'DECLARADA');
        if (r) declaradas.push(r);
      }
    });
    await this.transicoes.aplicarRollup(licitacaoId, ator).catch(() => null);
    return { declaradas, painel: await this.painel(licitacaoId, { tipo: 'ORGAO' }) };
  }

  /** Arrematante da unidade (ou deserto/fracassado). Devolve o rótulo quando declarou. */
  private async declararNaUnidade(
    m: EntityManager,
    lic: Licitacao,
    u: UnidadeJulgamento,
    anteriores: Arrematacao[],
    ator: AtorTransicao,
    cfg: LeilaoConfiguracao | null,
    status: 'DECLARADA' | 'AGUARDANDO_PAGAMENTO',
  ): Promise<string | null> {
    const ranking = await this.ranking.ranking(u, m);
    const minimo = await this.precoMinimo(m, u);
    const ignorar = anteriores.filter((a) => a.status === 'INADIMPLENTE').map((a) => a.fornecedor_id);
    const escolhido = escolherArrematante(ranking, minimo, ignorar);
    const ids = u.itens.map((i) => i.id);
    if (!escolhido) {
      const semOfertas = !ranking.length;
      await m.query(`UPDATE itens_licitacao SET status = $2, updated_at = now() WHERE id::text = ANY($1::text[])`, [ids, semOfertas ? 'DESERTO' : 'FRACASSADO']);
      await this.evento(
        m,
        lic.id,
        semOfertas
          ? `${this.rotulo(u)}: sem lances — DESERTO.`
          : `${this.rotulo(u)}: nenhum lance válido acima do preço mínimo (${fmtMoeda(minimo)}) disponível — FRACASSADO.`,
        { unidade_id: u.id },
      );
      return null;
    }
    const agora = new Date();
    await this.ranking.definirSituacao(m, u, escolhido.fornecedorId, SituacaoLicitante.ACEITO, {
      motivo: `Arrematante: maior lance ${fmtMoeda(escolhido.melhorValor)} ≥ preço mínimo ${fmtMoeda(minimo)} (art. 31; Decreto 11.461/2023 art. 21)`,
      ator,
    });
    const prazo = status === 'AGUARDANDO_PAGAMENTO' ? await this.prazoPagamento(lic, cfg, agora) : null;
    await m.getRepository(Arrematacao).save(
      m.getRepository(Arrematacao).create({
        licitacao_id: lic.id,
        unidade_id: u.id,
        tipo_unidade: u.tipo,
        numero_unidade: u.numero,
        fornecedor_id: escolhido.fornecedorId,
        valor: r2(escolhido.melhorValor),
        valor_comissao: cfg?.tipo_leiloeiro === 'OFICIAL' ? valorComissao(escolhido.melhorValor, cfg.comissao_percentual) : null,
        ordem: anteriores.length + 1,
        status,
        declarada_em: agora,
        declarada_por_tipo: ator.tipo,
        declarada_por_id: ator.id,
        convocado_pagamento_em: prazo ? agora : null,
        prazo_pagamento: prazo,
      }),
    );
    await this.evento(
      m,
      lic.id,
      `${this.rotulo(u)}: arrematante declarado com o lance de ${fmtMoeda(escolhido.melhorValor)}` +
        (anteriores.length ? ` (lance subsequente — Decreto 11.461/2023, art. 26, §3º)` : '') +
        (prazo ? `; convocado a pagar até ${fmtDataHoraBrasilia(prazo)}.` : '.'),
      { unidade_id: u.id },
      escolhido.fornecedorId,
      escolhido.melhorValor,
    );
    return this.rotulo(u);
  }

  private async prazoPagamento(lic: Licitacao, cfg: LeilaoConfiguracao | null, agora: Date): Promise<Date> {
    const dias = Number(cfg?.prazo_pagamento_dias_uteis) >= 1 ? Number(cfg!.prazo_pagamento_dias_uteis) : 1;
    return fimDoPrazoEmDiasUteis(agora, dias, calendarioDoOrgao(lic.orgao_id ?? null));
  }

  // ==========================================================================
  // PAGAMENTO (art. 31 §4º)
  // ==========================================================================

  /** Fase recursal superada: janela encerrada, nada pendente, e a licitação em JULGAMENTO/ADJUDICACAO. */
  private async estadoPagamento(lic: Licitacao) {
    const e = await estadoRecursalSql(this.ds.manager, lic.id);
    const motivos: string[] = [];
    if (![FaseLicitacao.JULGAMENTO, FaseLicitacao.ADJUDICACAO].includes(lic.fase)) motivos.push('Pagamento só depois do julgamento e da fase recursal.');
    if (!e.janelaEncerrada && lic.fase === FaseLicitacao.JULGAMENTO) motivos.push('Abra e encerre a janela de intenção de recurso sobre os arrematantes declarados (art. 165).');
    if (e.janelaAberta) motivos.push('Janela de intenção de recurso em curso.');
    motivos.push(...e.pendentes.map((p) => `Efeito suspensivo (art. 168): ${p}`));
    return { faseRecursalSuperada: motivos.length === 0, motivos };
  }

  /** Convoca os arrematantes DECLARADOS a pagar (prazo em dias úteis do edital, calendário do órgão). */
  async convocarPagamento(licitacaoId: string, ator: AtorTransicao) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirAtiva(lic);
    const est = await this.estadoPagamento(lic);
    if (!est.faseRecursalSuperada) throw new ConflictException(est.motivos.join(' | '));
    const cfg = await this.ds.getRepository(LeilaoConfiguracao).findOne({ where: { licitacao_id: licitacaoId } });
    const agora = new Date();
    const prazo = await this.prazoPagamento(lic, cfg, agora);
    const convocadas = await this.ds.transaction(async (m) => {
      const declaradas = await m.getRepository(Arrematacao).find({ where: { licitacao_id: licitacaoId, status: 'DECLARADA' }, lock: { mode: 'pessimistic_write' } });
      for (const a of declaradas) {
        await m.update(Arrematacao, a.id, { status: 'AGUARDANDO_PAGAMENTO', convocado_pagamento_em: agora, prazo_pagamento: prazo });
        await this.evento(m, licitacaoId, `Arrematante do ${a.tipo_unidade === 'LOTE' ? 'Lote' : 'Item'} ${a.numero_unidade} convocado a pagar ${fmtMoeda(a.valor)} até ${fmtDataHoraBrasilia(prazo)} (art. 31, §4º).`, { arrematacao_id: a.id }, a.fornecedor_id);
      }
      return declaradas.length;
    });
    void ator;
    if (!convocadas) throw new ConflictException('Nenhuma arrematação declarada aguardando convocação para pagamento.');
    return { convocadas, prazo, painel: await this.painel(licitacaoId, { tipo: 'ORGAO' }) };
  }

  private async arrematacaoTravada(m: EntityManager, licitacaoId: string, id: string): Promise<Arrematacao> {
    const a = await m.getRepository(Arrematacao).findOne({ where: { id, licitacao_id: licitacaoId }, lock: { mode: 'pessimistic_write' } });
    if (!a) throw new NotFoundException('Arrematação não encontrada');
    return a;
  }

  /** O arrematante (token) envia o comprovante do pagamento, no prazo. */
  async informarPagamento(licitacaoId: string, arrematacaoId: string, fornecedorId: string, arquivo: ArquivoEnviado | null) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirAtiva(lic);
    if (!arquivo?.buffer?.length) throw new BadRequestException('Anexe o comprovante do pagamento');
    if (!MIMES_COMPROVANTE.includes(String(arquivo.mimetype))) throw new BadRequestException('Comprovante: use PDF, JPG ou PNG.');
    if (Number(arquivo.size) > TAMANHO_MAXIMO_COMPROVANTE) throw new BadRequestException('Comprovante acima de 10 MB.');
    await this.ds.transaction(async (m) => {
      const a = await this.arrematacaoTravada(m, licitacaoId, arrematacaoId);
      if (a.fornecedor_id !== fornecedorId) throw new NotFoundException('Arrematação não encontrada');
      const inv = motivoTransicaoPagamentoInvalida(a.status, 'PAGAMENTO_INFORMADO');
      if (inv) throw new ConflictException(inv);
      if (a.prazo_pagamento && Date.now() > new Date(a.prazo_pagamento).getTime()) {
        throw new ConflictException(`O prazo de pagamento terminou em ${fmtDataHoraBrasilia(a.prazo_pagamento)}.`);
      }
      await m.update(Arrematacao, a.id, {
        status: 'PAGAMENTO_INFORMADO',
        comprovante: arquivo.buffer,
        comprovante_nome: String(arquivo.originalname || 'comprovante').slice(0, 250),
        comprovante_mime: arquivo.mimetype,
        comprovante_sha256: createHash('sha256').update(arquivo.buffer).digest('hex'),
        pagamento_informado_em: new Date(),
      });
      await this.evento(m, licitacaoId, `Arrematante do ${a.tipo_unidade === 'LOTE' ? 'Lote' : 'Item'} ${a.numero_unidade} informou o pagamento.`, { arrematacao_id: a.id }, a.fornecedor_id);
    });
    return this.painel(licitacaoId, { tipo: 'FORNECEDOR', fornecedorId });
  }

  async confirmarPagamento(licitacaoId: string, arrematacaoId: string, ator: AtorTransicao) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirAtiva(lic);
    await this.ds.transaction(async (m) => {
      const a = await this.arrematacaoTravada(m, licitacaoId, arrematacaoId);
      const inv = motivoTransicaoPagamentoInvalida(a.status, 'PAGA');
      if (inv) throw new ConflictException(inv);
      await m.update(Arrematacao, a.id, { status: 'PAGA', pagamento_confirmado_em: new Date(), pagamento_confirmado_por: `${ator.tipo}:${ator.id ?? ''}` });
      await this.evento(m, licitacaoId, `Pagamento do ${a.tipo_unidade === 'LOTE' ? 'Lote' : 'Item'} ${a.numero_unidade} confirmado (${fmtMoeda(a.valor)}) — art. 31, §4º.`, { arrematacao_id: a.id }, a.fornecedor_id, Number(a.valor));
    });
    return this.painel(licitacaoId, { tipo: 'ORGAO' });
  }

  /**
   * Inadimplência (depois do prazo, ou comprovante recusado): arrematação
   * INADIMPLENTE, licitante DESCLASSIFICADO na unidade e o lance
   * imediatamente subsequente convocado a pagar (Dec. 11.461 art. 26 §3º).
   */
  async declararInadimplencia(licitacaoId: string, arrematacaoId: string, motivo: string, ator: AtorTransicao) {
    const lic = await this.licitacao(licitacaoId);
    this.exigirAtiva(lic);
    const texto = String(motivo ?? '').trim();
    if (texto.length < 10) throw new BadRequestException('Informe o motivo da inadimplência (mínimo 10 caracteres).');
    const cfg = await this.ds.getRepository(LeilaoConfiguracao).findOne({ where: { licitacao_id: licitacaoId } });
    let proximo: string | null = null;
    await this.ds.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`leilao:${licitacaoId}`]);
      const a = await this.arrematacaoTravada(m, licitacaoId, arrematacaoId);
      const inv = motivoTransicaoPagamentoInvalida(a.status, 'INADIMPLENTE');
      if (inv) throw new ConflictException(inv);
      if (a.status === 'AGUARDANDO_PAGAMENTO' && a.prazo_pagamento && Date.now() <= new Date(a.prazo_pagamento).getTime()) {
        throw new ConflictException(`O prazo de pagamento vai até ${fmtDataHoraBrasilia(a.prazo_pagamento)} — a inadimplência só se declara depois dele.`);
      }
      await m.update(Arrematacao, a.id, { status: 'INADIMPLENTE', motivo: texto });
      const u = await this.ranking.unidade(a.unidade_id, m);
      if (!u) throw new NotFoundException('Unidade não encontrada');
      await this.ranking.definirSituacao(m, u, a.fornecedor_id, SituacaoLicitante.DESCLASSIFICADO, {
        motivo: `Inadimplência do arrematante: ${texto} (art. 31, §4º; Decreto 11.461/2023, art. 26, §3º)`,
        ator,
      });
      await this.evento(m, licitacaoId, `${this.rotulo(u)}: arrematante inadimplente — ${texto}. Examina-se o lance subsequente.`, { arrematacao_id: a.id }, a.fornecedor_id);
      const anteriores = await m.getRepository(Arrematacao).find({ where: { unidade_id: u.id } });
      proximo = await this.declararNaUnidade(m, lic, u, anteriores, ator, cfg, 'AGUARDANDO_PAGAMENTO');
    });
    if (!proximo) await this.transicoes.aplicarRollup(licitacaoId, ator).catch(() => null);
    return { proximoConvocado: !!proximo, painel: await this.painel(licitacaoId, { tipo: 'ORGAO' }) };
  }

  async comprovante(licitacaoId: string, arrematacaoId: string, visao: VisaoLeilao) {
    const a = await this.ds
      .getRepository(Arrematacao)
      .createQueryBuilder('a')
      .addSelect('a.comprovante')
      .where('a.id = :id AND a.licitacao_id = :l', { id: arrematacaoId, l: licitacaoId })
      .getOne();
    if (!a || !a.comprovante) throw new NotFoundException('Comprovante não encontrado');
    if (visao.tipo === 'PUBLICO' || (visao.tipo === 'FORNECEDOR' && visao.fornecedorId !== a.fornecedor_id)) throw new NotFoundException('Comprovante não encontrado');
    return { nome: a.comprovante_nome ?? 'comprovante', mime: a.comprovante_mime ?? 'application/octet-stream', conteudo: a.comprovante };
  }

  // ==========================================================================
  // RESULTADO (gancho do ResultadoService) e TERMO DE ARREMATAÇÃO
  // ==========================================================================

  /** Plano da adjudicação: por unidade, a arrematação PAGA (art. 31 §4º) com o valor do lance (lote: rateio do lance). */
  async planoAdjudicacao(licitacaoId: string, m: EntityManager): Promise<PlanoAdjudicacao> {
    const plano: PlanoAdjudicacao = { unidades: [], pendencias: [] };
    const unidades = await this.ranking.unidades(licitacaoId, m);
    const arrs = await m.getRepository(Arrematacao).find({ where: { licitacao_id: licitacaoId } });
    plano.pendencias.push(
      ...pendenciasPagamento(
        unidades.map((u) => ({ id: u.id, rotulo: this.rotulo(u), comResultado: RankingService.unidadeComResultadoPossivel(u) })),
        arrs,
      ),
    );
    const [lic] = await m.query(`SELECT COALESCE(base_lance, 'TOTAL_ITEM') AS base FROM licitacoes WHERE id = $1`, [licitacaoId]);
    for (const u of unidades) {
      if (!RankingService.unidadeComResultadoPossivel(u)) continue;
      const a = arrs.find((x) => x.unidade_id === u.id && x.status === 'PAGA');
      if (!a) continue;
      const entrada: EntradaAdjudicacao = {
        tipo: u.tipo,
        unidadeId: u.id,
        numero: u.numero,
        fornecedorId: a.fornecedor_id,
        valores: [],
        origemValor: 'arrematação paga',
      };
      if (u.tipo === 'ITEM') {
        const it = u.itens[0];
        const qtd = it.quantidade || 1;
        const total = lic?.base === 'UNITARIO' ? r2(Number(a.valor) * qtd) : r2(Number(a.valor));
        entrada.valores = [{ itemId: it.id, numero: it.numero, quantidade: qtd, valorTotal: total, valorUnitario: Math.round((total / qtd) * 10000) / 10000 }];
      } else {
        const [lance] = await m.query(
          `SELECT id FROM lances WHERE lote_id = $1 AND item_id IS NULL AND fornecedor_id = $2 AND cancelado = false AND valor = $3
            ORDER BY created_at ASC LIMIT 1`,
          [u.id, a.fornecedor_id, Number(a.valor)],
        );
        const partes: any[] = lance
          ? await m.query(`SELECT item_id::text AS item_id, valor_total, valor_unitario FROM lances WHERE lance_lote_id = $1`, [lance.id])
          : [];
        if (!partes.length) {
          plano.pendencias.push(`${this.rotulo(u)}: rateio do lance arrematado não encontrado.`);
          continue;
        }
        entrada.valores = u.itens
          .filter((i) => !['DESERTO', 'FRACASSADO', 'CANCELADO'].includes(i.status))
          .map((i) => {
            const p = partes.find((x) => x.item_id === i.id);
            return { itemId: i.id, numero: i.numero, quantidade: i.quantidade, valorTotal: Number(p?.valor_total ?? 0), valorUnitario: Number(p?.valor_unitario ?? 0) };
          });
      }
      plano.unidades.push(entrada);
    }
    return plano;
  }

  /** Homologado: um termo de arrematação por arrematação paga (idempotente). */
  async gerarTermos(licitacaoId: string, ator: AtorTransicao = atorSistema('leilao')) {
    const lic = await this.licitacao(licitacaoId);
    if (lic.fase !== FaseLicitacao.HOMOLOGACAO) throw new ConflictException('O termo de arrematação é gerado depois da homologação.');
    const [orgao] = await this.ds.query(`SELECT nome, cnpj FROM orgaos WHERE id = $1`, [lic.orgao_id]);
    const cfg = await this.ds.getRepository(LeilaoConfiguracao).findOne({ where: { licitacao_id: licitacaoId } });
    const pagas = await this.ds.getRepository(Arrematacao).find({ where: { licitacao_id: licitacaoId, status: 'PAGA' } });
    const nomes = await this.nomes(pagas.map((a) => a.fornecedor_id));
    for (const a of pagas.filter((x) => !x.termo_caminho)) {
      const itens: any[] = await this.ds.query(
        `SELECT i.numero_item, COALESCE(b.descricao, i.descricao_resumida) AS descricao, i.quantidade, i.valor_total_homologado, b.valor_avaliacao, b.valor_minimo
           FROM itens_licitacao i LEFT JOIN leilao_bens b ON b.item_licitacao_id = i.id
          WHERE i.licitacao_id = $1 AND (i.id::text = $2 OR i.lote_id::text = $2) ORDER BY i.numero_item`,
        [licitacaoId, a.unidade_id],
      );
      const arrematante = nomes.get(a.fornecedor_id);
      const pdf = gerarTermoSimplesPdf({
        orgao: { nome: orgao?.nome ?? 'Órgão', cnpj: orgao?.cnpj },
        titulo: 'TERMO DE ARREMATAÇÃO',
        subtitulo: `Leilão — processo ${lic.numero_processo}${lic.numero_edital ? ` · edital ${lic.numero_edital}` : ''}`,
        paragrafos: [
          `Objeto: ${lic.objeto}.`,
          `Certifica-se que ${arrematante?.nome ?? a.fornecedor_id} (CPF/CNPJ ${fmtDocumento(arrematante?.doc)}) arrematou o ` +
            `${a.tipo_unidade === 'LOTE' ? 'Lote' : 'Item'} ${a.numero_unidade} pelo valor de ${fmtMoeda(a.valor)}` +
            (a.valor_comissao ? `, acrescido da comissão do leiloeiro de ${fmtMoeda(a.valor_comissao)}` : '') +
            `, com pagamento confirmado em ${fmtDataHoraBrasilia(a.pagamento_confirmado_em)}.`,
          `Leilão ${cfg?.tipo_leiloeiro === 'OFICIAL' ? `conduzido pelo leiloeiro oficial ${cfg?.leiloeiro_nome ?? ''} (matrícula ${cfg?.leiloeiro_matricula ?? '—'})` : `conduzido pelo servidor designado ${cfg?.servidor_nome ?? ''}${cfg?.ato_designacao ? ` (${cfg.ato_designacao})` : ''}`}, ` +
            `homologado em ${fmtDataHoraBrasilia(lic.data_homologacao)} por ${lic.homologacao_autoridade_nome ?? 'autoridade competente'} (Lei 14.133/2021, art. 31, §4º, e art. 71, IV).`,
          'A retirada do bem observará o local, o prazo e as condições do edital; eventuais ônus, gravames ou pendências são os descritos no edital (art. 31, §2º, V).',
        ],
        quadro: {
          cabecalho: ['Item', 'Descrição do bem', 'Qtd.', 'Avaliação', 'Preço mínimo', 'Valor arrematado'],
          linhas: itens.map((i) => [
            String(i.numero_item),
            String(i.descricao ?? ''),
            String(Number(i.quantidade)),
            i.valor_avaliacao != null ? fmtMoeda(i.valor_avaliacao) : '—',
            i.valor_minimo != null ? fmtMoeda(i.valor_minimo) : '—',
            i.valor_total_homologado != null ? fmtMoeda(i.valor_total_homologado) : '—',
          ]),
        },
        assinaturas: [
          { nome: cfg?.tipo_leiloeiro === 'OFICIAL' ? cfg?.leiloeiro_nome ?? 'Leiloeiro' : cfg?.servidor_nome ?? 'Servidor designado', papel: cfg?.tipo_leiloeiro === 'OFICIAL' ? 'Leiloeiro oficial' : 'Servidor designado (leiloeiro)' },
          { nome: arrematante?.nome ?? 'Arrematante', papel: 'Arrematante' },
        ],
      });
      const dir = path.join(diretorioDeGravacao(PASTA_TERMOS), licitacaoId);
      fs.mkdirSync(dir, { recursive: true });
      const nome = `termo-arrematacao-${a.id}.pdf`;
      fs.writeFileSync(path.join(dir, nome), pdf);
      await this.ds.getRepository(Arrematacao).update(a.id, { termo_caminho: `${PASTA_TERMOS}/${licitacaoId}/${nome}`, termo_gerado_em: new Date() });
    }
    this.logger.log(`[${lic.numero_processo}] termos de arrematação gerados (${pagas.length}) — ${ator.tipo}`);
    return this.listarTermos(licitacaoId);
  }

  async listarTermos(licitacaoId: string) {
    const arrs = await this.ds.getRepository(Arrematacao).find({ where: { licitacao_id: licitacaoId, status: In(['PAGA']) }, order: { numero_unidade: 'ASC' } });
    const nomes = await this.nomes(arrs.map((a) => a.fornecedor_id));
    return arrs.map((a) => ({
      id: a.id,
      tipo: 'TERMO_ARREMATACAO',
      titulo: `Termo de arrematação — ${a.tipo_unidade === 'LOTE' ? 'Lote' : 'Item'} ${a.numero_unidade}`,
      fornecedor_id: a.fornecedor_id,
      fornecedor_razao_social: nomes.get(a.fornecedor_id)?.nome ?? null,
      valor: Number(a.valor),
      gerado_em: a.termo_gerado_em,
    }));
  }

  async arquivoTermo(licitacaoId: string, arrematacaoId: string, visao: VisaoLeilao): Promise<{ caminho: string; nome: string }> {
    const a = await this.ds.getRepository(Arrematacao).findOne({ where: { id: arrematacaoId, licitacao_id: licitacaoId } });
    if (!a || !a.termo_caminho) throw new NotFoundException('Termo não encontrado');
    if (visao.tipo === 'PUBLICO' || (visao.tipo === 'FORNECEDOR' && visao.fornecedorId !== a.fornecedor_id)) throw new NotFoundException('Termo não encontrado');
    const [, ...resto] = a.termo_caminho.split('/');
    const caminho = path.join(diretorioDeGravacao(PASTA_TERMOS), ...resto);
    if (!fs.existsSync(caminho)) throw new NotFoundException('Arquivo do termo não encontrado');
    return { caminho, nome: path.basename(caminho) };
  }

  /** Fornecedor só age nas próprias arrematações; verificação usada pelo controller. */
  async exigirArrematante(licitacaoId: string, arrematacaoId: string, fornecedorId: string) {
    const a = await this.ds.getRepository(Arrematacao).findOne({ where: { id: arrematacaoId, licitacao_id: licitacaoId } });
    if (!a || a.fornecedor_id !== fornecedorId) throw new ForbiddenException('Arrematação de outro licitante');
  }

  /** Unidades do leilão (rótulos) — usado pela tela. */
  unidades(licitacaoId: string) {
    return unidadesDoLeilaoSql(this.ds.manager, licitacaoId);
  }
}

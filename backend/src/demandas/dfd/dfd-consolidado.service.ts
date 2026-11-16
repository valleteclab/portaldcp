import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ehUuid } from '../../auth/acesso/acesso-licitacao.service';
import type { Ator } from '../../auth/acesso/ator';
import { DestinatarioAviso, PlanejamentoFluxoService } from '../../fase-interna/fluxo/planejamento-fluxo.service';
import { rotuloRegra } from '../../fase-interna/fluxo/planejamento-fluxo';
import { NotificacoesService } from '../../notificacoes/notificacoes.service';
import { TipoNotificacao } from '../../notificacoes/entities/notificacao.entity';
import { STATUS_DEMANDA_PARA_DFD } from '../entities/demanda.entity';
import {
  AjusteItem,
  CandidatoParecido,
  DemandaParaDfd,
  ItemConsolidado,
  Parecido,
  PRIORIDADES_DFD,
  ajustesValidos,
  consolidarItens,
  marcasDosItens,
  parecidos,
  sugestoesDoDfd,
  textoDoAlerta,
  valorTotalDosItens,
} from './consolidacao-dfd';
import { gerarPdfDfdConsolidado } from './dfd-consolidado-pdf';
import { ProcessoTramitacaoService } from '../../processo/processo-tramitacao.service';
import { WorkflowService } from '../../workflow/workflow.service';
import { contarPaginasPdf } from '../../fase-interna/folhas-autos';
import { diretorioDeGravacao } from '../../common/arquivos/arquivos';
import { randomUUID } from 'crypto';
import { acaoDaEtapaDfdAberta } from './etapa-dfd-do-processo';
import * as fs from 'fs';
import * as path from 'path';
import { STATUS_DFD_ATIVO, StatusDfd } from './dfd-consolidado.entity';

type Autor = { id: string | null; nome: string | null; cargo: string | null };

export interface DemandaCarregada extends DemandaParaDfd {
  orgao_id: string;
  status: string;
  ano_referencia: number;
  responsavel_nome: string | null;
  data_envio: Date | null;
  data_aprovacao: Date | null;
  aprovado_por: string | null;
  criado_por_id: string | null;
}

export interface DfdLinha {
  id: string;
  orgao_id: string;
  ano: number;
  numero: number;
  status: StatusDfd;
  origem: string;
  objeto: string;
  justificativa: string | null;
  categoria: string;
  unidade_planejamento_id: string | null;
  unidade_planejamento_nome: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  responsavel_cargo: string | null;
  data_pretendida: string | null;
  prioridade: string | null;
  item_pca_id: string | null;
  itens: ItemConsolidado[];
  ajustes: Record<string, AjusteItem>;
  valor_total_estimado: number;
  exige_aprovacao: boolean;
  aprovacao: any;
  devolucao: any;
  historico: any[];
  licitacao_id: string | null;
  processo_id: string | null;
  criado_por_id: string | null;
  criado_por_nome: string | null;
  created_at: Date;
  updated_at: Date;
}

const APP_URL = () => process.env.APP_URL || 'https://portaldcp.com.br';
const texto = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const LINK_CENTRAL = '/orgao/aprovacoes?tab=demandas';
const rotuloDfd = (d: { numero: number; ano: number }) => `DFD nº ${d.numero}/${d.ano}`;

/**
 * DFD CONSOLIDADO (unidade de planejamento): junta demandas aprovadas dos
 * setores, soma os itens, gera o PDF e abre UM processo (pelo
 * LicitacoesService — `criarAPartirDeDfd`). As demandas juntadas ficam
 * travadas. Quem monta e a 2ª aprovação (opcional) vêm do modelo de fluxo
 * (`PlanejamentoFluxoService`). Isolamento: o órgão vem do token (os
 * controllers conferem o dono de cada id antes de chegar aqui).
 */
@Injectable()
export class DfdConsolidadoService {
  private readonly logger = new Logger(DfdConsolidadoService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly planejamento: PlanejamentoFluxoService,
    private readonly notificacoes: NotificacoesService,
    private readonly tramitacao: ProcessoTramitacaoService,
    private readonly workflow: WorkflowService,
  ) {}

  // ==========================================================================
  // QUEM
  // ==========================================================================

  async autor(ator: Ator): Promise<Autor> {
    if (ator.admin) return { id: ator.id, nome: 'Administrador da plataforma', cargo: null };
    if (ator.tipo === 'USUARIO' && ator.usuarioId) {
      const [u] = await this.ds.query(`SELECT nome, cargo FROM usuarios WHERE id::text = $1`, [ator.usuarioId]);
      return { id: ator.usuarioId, nome: u?.nome ?? null, cargo: u?.cargo ?? null };
    }
    const id = ator.orgaoId ?? ator.id;
    const [o] = await this.ds.query(`SELECT nome FROM orgaos WHERE id::text = $1`, [id]);
    return { id, nome: o?.nome ?? null, cargo: null };
  }

  async exigirMontar(ator: Ator, orgaoId: string): Promise<void> {
    if (await this.planejamento.podeMontarDfd(ator, orgaoId)) return;
    const p = await this.planejamento.vigente(orgaoId);
    throw new ForbiddenException(
      `Só a unidade de planejamento monta o DFD e abre o processo (${rotuloRegra(p.responsavel_dfd, 'MONTAR')} — Configurações › Fluxo).`,
    );
  }

  async permissoes(ator: Ator, orgaoId: string) {
    const p = await this.planejamento.vigente(orgaoId);
    return {
      pode_montar: await this.planejamento.podeMontarDfd(ator, orgaoId),
      pode_aprovar_demanda: await this.planejamento.podeAprovarDemanda(ator, orgaoId),
      pode_aprovar_dfd: await this.planejamento.podeAprovarDfd(ator, orgaoId),
      exige_aprovacao_dfd: p.aprovacao_dfd.exigida,
      responsavel_dfd: rotuloRegra(p.responsavel_dfd, 'MONTAR'),
      aprovador_dfd: rotuloRegra(p.aprovacao_dfd.aprovador, 'APROVAR'),
      aprovador_demanda: rotuloRegra(p.aprovador_demanda, 'APROVAR'),
    };
  }

  // ==========================================================================
  // LEITURA
  // ==========================================================================

  async orgaoDoDfd(id: string): Promise<string | null> {
    if (!ehUuid(id)) return null;
    const [r] = await this.ds.query(`SELECT orgao_id::text AS orgao_id FROM dfds_consolidados WHERE id::text = $1`, [id]);
    return r?.orgao_id ?? null;
  }

  private linha(r: any): DfdLinha {
    return {
      ...r,
      valor_total_estimado: Number(r.valor_total_estimado) || 0,
      itens: Array.isArray(r.itens) ? r.itens : [],
      ajustes: r.ajustes && typeof r.ajustes === 'object' ? r.ajustes : {},
      historico: Array.isArray(r.historico) ? r.historico : [],
      data_pretendida: r.data_pretendida ?? null,
    };
  }

  private async carregar(id: string, m: EntityManager | DataSource = this.ds): Promise<DfdLinha> {
    const [r] = ehUuid(id)
      ? await m.query(
          `SELECT id::text AS id, orgao_id::text AS orgao_id, ano, numero, status, origem, objeto, justificativa, categoria,
                  unidade_planejamento_id::text AS unidade_planejamento_id, unidade_planejamento_nome, responsavel_id::text AS responsavel_id,
                  responsavel_nome, responsavel_cargo, to_char(data_pretendida, 'YYYY-MM-DD') AS data_pretendida, prioridade,
                  item_pca_id::text AS item_pca_id, itens, ajustes, valor_total_estimado, exige_aprovacao, aprovacao, devolucao, historico,
                  licitacao_id::text AS licitacao_id, processo_id::text AS processo_id, criado_por_id, criado_por_nome, created_at, updated_at
             FROM dfds_consolidados WHERE id::text = $1`,
          [id],
        )
      : [];
    if (!r) throw new NotFoundException('DFD não encontrado');
    return this.linha(r);
  }

  /** Demandas (com itens), na ordem pedida. */
  async carregarDemandas(ids: string[], m: EntityManager | DataSource = this.ds): Promise<DemandaCarregada[]> {
    const validos = ids.filter((x) => ehUuid(x));
    if (!validos.length) return [];
    const ds: any[] = await m.query(
      `SELECT id::text AS id, orgao_id::text AS orgao_id, ano_referencia, unidade_requisitante, setor_id::text AS setor_id, status::text AS status,
              descricao_sucinta_objeto, observacoes, to_char(data_desejada_contratacao, 'YYYY-MM-DD') AS data_desejada_contratacao,
              responsavel_nome, data_envio, data_aprovacao, aprovado_por, criado_por_id
         FROM demandas WHERE id::text = ANY($1::text[])`,
      [validos],
    );
    const itens: any[] = await m.query(
      `SELECT id::text AS id, demanda_id::text AS demanda_id, categoria::text AS categoria, codigo_classe, nome_classe, codigo_item_catalogo,
              descricao_objeto, justificativa, quantidade_estimada, unidade_medida, valor_unitario_estimado, valor_total_estimado, prioridade,
              item_pca_id::text AS item_pca_id, to_char(data_desejada_contratacao, 'YYYY-MM-DD') AS data_desejada_contratacao
         FROM itens_demanda WHERE demanda_id::text = ANY($1::text[]) ORDER BY created_at, id`,
      [validos],
    );
    const porId = new Map(ds.map((d) => [d.id, { ...d, itens: itens.filter((i) => i.demanda_id === d.id) }]));
    return validos.map((id) => porId.get(id)).filter((d): d is DemandaCarregada => !!d);
  }

  /** Ids das demandas ligadas ao DFD (na ordem da ligação). */
  async idsDasDemandas(dfdId: string, m: EntityManager | DataSource = this.ds): Promise<string[]> {
    const r = await m.query(`SELECT demanda_id::text AS id FROM dfds_consolidados_demandas WHERE dfd_id::text = $1 ORDER BY created_at, id`, [dfdId]);
    return r.map((x: any) => x.id);
  }

  /** DFD em que a demanda está (ou null). */
  async dfdDaDemanda(demandaId: string): Promise<{ id: string; numero: number; ano: number; status: string; licitacao_id: string | null } | null> {
    if (!ehUuid(demandaId)) return null;
    const [r] = await this.ds.query(
      `SELECT f.id::text AS id, f.numero, f.ano, f.status, f.licitacao_id::text AS licitacao_id
         FROM dfds_consolidados_demandas fd JOIN dfds_consolidados f ON f.id = fd.dfd_id WHERE fd.demanda_id::text = $1`,
      [demandaId],
    );
    return r ?? null;
  }

  /** DFD de cada demanda (lista/tela das demandas). */
  async dfdsDasDemandas(ids: string[]): Promise<Map<string, { id: string; numero: number; ano: number; status: string; licitacao_id: string | null }>> {
    const validos = ids.filter((x) => ehUuid(x));
    if (!validos.length) return new Map();
    const r = await this.ds.query(
      `SELECT fd.demanda_id::text AS demanda_id, f.id::text AS id, f.numero, f.ano, f.status, f.licitacao_id::text AS licitacao_id
         FROM dfds_consolidados_demandas fd JOIN dfds_consolidados f ON f.id = fd.dfd_id WHERE fd.demanda_id::text = ANY($1::text[])`,
      [validos],
    );
    return new Map(r.map((x: any) => [x.demanda_id, { id: x.id, numero: x.numero, ano: x.ano, status: x.status, licitacao_id: x.licitacao_id }]));
  }

  /** Processo que já nasceu da demanda pelo vínculo antigo (`licitacoes.demanda_id`). */
  private async processoPelaDemanda(demandaId: string, m: EntityManager | DataSource = this.ds): Promise<{ id: string; numero_processo: string } | null> {
    const [l] = await m.query(`SELECT id::text AS id, numero_processo FROM licitacoes WHERE demanda_id::text = $1 ORDER BY created_at LIMIT 1`, [demandaId]);
    return l ?? null;
  }

  /**
   * As demandas podem entrar no DFD? Do órgão (senão 404, sem confirmar que
   * existe), aprovadas, fora de outro DFD e sem processo. Devolve as demandas.
   */
  async conferirDisponiveis(orgaoId: string, ids: string[], opcoes: { excetoDfd?: string; m?: EntityManager } = {}): Promise<DemandaCarregada[]> {
    const lista = [...new Set((ids ?? []).map(String))];
    if (!lista.length) throw new BadRequestException('Escolha ao menos uma demanda aprovada para o DFD.');
    const demandas = await this.carregarDemandas(lista, opcoes.m ?? this.ds);
    if (demandas.length !== lista.length || demandas.some((d) => d.orgao_id !== orgaoId)) throw new NotFoundException('Demanda não encontrada');
    const problemas: string[] = [];
    const dfds = await this.dfdsDasDemandas(lista);
    for (const d of demandas) {
      const nome = `"${d.descricao_sucinta_objeto || d.unidade_requisitante}" (${d.unidade_requisitante})`;
      if (!STATUS_DEMANDA_PARA_DFD.includes(d.status as any)) {
        problemas.push(`${nome} não está aprovada — só demandas aprovadas entram no DFD`);
        continue;
      }
      const noDfd = dfds.get(d.id);
      if (noDfd && noDfd.id !== opcoes.excetoDfd) {
        problemas.push(`${nome} já está no ${rotuloDfd(noDfd)}`);
        continue;
      }
      const proc = await this.processoPelaDemanda(d.id, opcoes.m ?? this.ds);
      if (proc) problemas.push(`${nome} já originou o processo ${proc.numero_processo}`);
    }
    if (problemas.length) throw new ConflictException(`Não dá para juntar: ${problemas.join('; ')}.`);
    return demandas;
  }

  /** Demandas aprovadas do exercício, livres (sem DFD e sem processo) — a tela do planejamento. */
  async demandasDisponiveis(orgaoId: string, ano: number) {
    const ids: Array<{ id: string }> = await this.ds.query(
      `SELECT d.id::text AS id FROM demandas d
        WHERE d.orgao_id::text = $1 AND d.ano_referencia = $2 AND d.status::text = ANY($3::text[])
          AND NOT EXISTS (SELECT 1 FROM dfds_consolidados_demandas fd WHERE fd.demanda_id = d.id)
          AND NOT EXISTS (SELECT 1 FROM licitacoes l WHERE l.demanda_id = d.id)
        ORDER BY d.unidade_requisitante, d.created_at`,
      [orgaoId, ano, STATUS_DEMANDA_PARA_DFD],
    );
    return this.carregarDemandas(ids.map((x) => x.id));
  }

  // ==========================================================================
  // CONSOLIDAÇÃO + ALERTA DE PARECIDOS
  // ==========================================================================

  /**
   * Outros pedidos do exercício com itens do mesmo código ou classe (art. 12,
   * VII; art. 75, §1º): demanda aprovada livre, DFD em andamento ou processo
   * do exercício (não revogado/anulado). Atenção, nunca bloqueio.
   */
  async alertas(orgaoId: string, ano: number, itens: ItemConsolidado[], excluir: { dfdId?: string | null; demandaIds?: string[]; licitacaoId?: string | null } = {}): Promise<Parecido[]> {
    if (!itens.length) return [];
    const candidatos: CandidatoParecido[] = [];
    const semDemandas = (excluir.demandaIds ?? []).filter((x) => ehUuid(x));
    try {
      const dem: any[] = await this.ds.query(
        `SELECT d.id::text AS id, d.unidade_requisitante, d.descricao_sucinta_objeto,
                COALESCE(json_agg(json_build_object('categoria', i.categoria::text, 'codigo', i.codigo_item_catalogo, 'classe', COALESCE(NULLIF(i.codigo_classe, ''), i.nome_classe)))
                         FILTER (WHERE i.id IS NOT NULL), '[]') AS itens
           FROM demandas d LEFT JOIN itens_demanda i ON i.demanda_id::text = d.id::text
          WHERE d.orgao_id::text = $1 AND d.ano_referencia = $2 AND d.status::text = ANY($3::text[])
            AND NOT (d.id::text = ANY($4::text[]))
            AND NOT EXISTS (SELECT 1 FROM dfds_consolidados_demandas fd WHERE fd.demanda_id = d.id)
            AND NOT EXISTS (SELECT 1 FROM licitacoes l WHERE l.demanda_id = d.id)
          GROUP BY d.id`,
        [orgaoId, ano, STATUS_DEMANDA_PARA_DFD, semDemandas],
      );
      for (const d of dem) {
        candidatos.push({ tipo: 'DEMANDA', id: d.id, rotulo: `${d.unidade_requisitante}${d.descricao_sucinta_objeto ? ` — ${d.descricao_sucinta_objeto}` : ''}`.slice(0, 160), link: `/orgao/demandas/${d.id}`, situacao: 'Aprovada, fora de DFD', itens: d.itens ?? [] });
      }
      const dfds: any[] = await this.ds.query(
        `SELECT id::text AS id, numero, ano, status, objeto, itens FROM dfds_consolidados
          WHERE orgao_id::text = $1 AND ano = $2 AND status IN ('RASCUNHO','AGUARDANDO_APROVACAO','APROVADO') AND ($3::text IS NULL OR id::text <> $3)`,
        [orgaoId, ano, excluir.dfdId ?? null],
      );
      for (const f of dfds) {
        candidatos.push({
          tipo: 'DFD',
          id: f.id,
          rotulo: `${rotuloDfd(f)} — ${String(f.objeto ?? '').slice(0, 120)}`,
          link: `/orgao/demandas/dfd/${f.id}`,
          situacao: f.status,
          itens: marcasDosItens(Array.isArray(f.itens) ? f.itens : []),
        });
      }
      const procs: any[] = await this.ds.query(
        `SELECT l.id::text AS id, l.numero_processo, l.objeto, l.fase::text AS fase,
                COALESCE(json_agg(json_build_object('codigo', i.codigo_catalogo, 'classe', COALESCE(i.codigo_catmat, i.codigo_catser, i.classe_catalogo), 'codigo2', COALESCE(i.codigo_catmat, i.codigo_catser)))
                         FILTER (WHERE i.id IS NOT NULL), '[]') AS itens
           FROM licitacoes l LEFT JOIN itens_licitacao i ON i.licitacao_id::text = l.id::text
          WHERE l.orgao_id::text = $1 AND l.ano = $2 AND COALESCE(l.situacao::text, 'ATIVA') NOT IN ('REVOGADA','ANULADA')
            AND ($3::text IS NULL OR l.id::text <> $3)
          GROUP BY l.id`,
        [orgaoId, ano, excluir.licitacaoId ?? null],
      );
      for (const p of procs) {
        const marcas = (p.itens ?? []).flatMap((i: any) => [
          { codigo: i.codigo, classe: i.classe },
          ...(i.codigo2 ? [{ codigo: i.codigo2, classe: null }] : []),
        ]);
        candidatos.push({ tipo: 'PROCESSO', id: p.id, rotulo: `${p.numero_processo} — ${String(p.objeto ?? '').slice(0, 120)}`, link: `/orgao/processos/${p.id}`, situacao: p.fase, itens: marcas });
      }
    } catch (e: any) {
      this.logger.warn(`Alerta de parecidos não calculado: ${e?.message ?? e}`);
      return [];
    }
    return parecidos(marcasDosItens(itens), candidatos);
  }

  /** Consolida (sem gravar): itens somados, sugestões e o alerta — a tela de montagem. */
  async previa(orgaoId: string, demandaIds: string[], ajustes: Record<string, AjusteItem> = {}, excetoDfd?: string) {
    const demandas = await this.conferirDisponiveis(orgaoId, demandaIds, { excetoDfd });
    const itens = consolidarItens(demandas, this.ajustesDoCorpo(ajustes));
    const sugestoes = sugestoesDoDfd(demandas, itens);
    const ano = this.anoDasDemandas(demandas);
    const alertas = await this.alertas(orgaoId, ano, itens, { dfdId: excetoDfd, demandaIds: demandas.map((d) => d.id) });
    return { ano, itens, valor_total_estimado: valorTotalDosItens(itens), sugestoes, alertas, alerta: textoDoAlerta(alertas) };
  }

  private anoDasDemandas(demandas: Array<{ ano_referencia: number }>): number {
    const anos = [...new Set(demandas.map((d) => Number(d.ano_referencia)).filter(Boolean))];
    if (anos.length > 1) throw new BadRequestException(`Junte no DFD demandas do mesmo exercício (vieram de ${anos.sort().join(' e ')}).`);
    return anos[0] ?? new Date().getFullYear();
  }

  private ajustesDoCorpo(v: any): Record<string, AjusteItem> {
    const r: Record<string, AjusteItem> = {};
    if (!v || typeof v !== 'object') return r;
    for (const [k, a] of Object.entries(v as Record<string, any>)) {
      if (!a || typeof a !== 'object') continue;
      const aj: AjusteItem = {};
      if (a.remover === true) aj.remover = true;
      if (a.quantidade !== undefined && a.quantidade !== null && a.quantidade !== '') {
        const n = Number(a.quantidade);
        if (!Number.isFinite(n) || n <= 0) throw new BadRequestException('Quantidade ajustada inválida (maior que zero).');
        aj.quantidade = n;
      }
      if (a.valor_unitario_estimado !== undefined && a.valor_unitario_estimado !== null && a.valor_unitario_estimado !== '') {
        const n = Number(a.valor_unitario_estimado);
        if (!Number.isFinite(n) || n < 0) throw new BadRequestException('Valor unitário ajustado inválido.');
        aj.valor_unitario_estimado = n;
      }
      if (a.descricao !== undefined) aj.descricao = texto(a.descricao, 4000) || null;
      if (a.justificativa !== undefined) aj.justificativa = texto(a.justificativa, 1000) || null;
      r[String(k).slice(0, 600)] = aj;
    }
    return r;
  }

  // ==========================================================================
  // CAMPOS (validados contra o órgão)
  // ==========================================================================

  private async camposDoCorpo(orgaoId: string, corpo: any): Promise<Partial<DfdLinha>> {
    const c: Partial<DfdLinha> = {};
    if (corpo?.objeto !== undefined) {
      const o = texto(corpo.objeto, 4000);
      if (o.length < 5) throw new BadRequestException('Descreva o objeto do DFD.');
      c.objeto = o;
    }
    if (corpo?.justificativa !== undefined) c.justificativa = texto(corpo.justificativa, 8000) || null;
    if (corpo?.unidade_planejamento_id !== undefined) {
      if (corpo.unidade_planejamento_id) {
        const id = String(corpo.unidade_planejamento_id);
        const [s] = ehUuid(id) ? await this.ds.query(`SELECT id::text AS id, nome FROM setores WHERE id::text = $1 AND orgao_id::text = $2`, [id, orgaoId]) : [];
        if (!s) throw new BadRequestException('Unidade de planejamento não encontrada nos setores do órgão.');
        c.unidade_planejamento_id = s.id;
        c.unidade_planejamento_nome = s.nome;
      } else {
        c.unidade_planejamento_id = null;
        c.unidade_planejamento_nome = null;
      }
    }
    if (corpo?.responsavel_id !== undefined) {
      if (corpo.responsavel_id) {
        const id = String(corpo.responsavel_id);
        const [u] = ehUuid(id) ? await this.ds.query(`SELECT id::text AS id, nome, cargo FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2 AND ativo = true`, [id, orgaoId]) : [];
        if (!u) throw new BadRequestException('Responsável: usuário não encontrado no órgão.');
        c.responsavel_id = u.id;
        c.responsavel_nome = u.nome;
        c.responsavel_cargo = u.cargo ?? null;
      } else {
        c.responsavel_id = null;
        c.responsavel_nome = null;
        c.responsavel_cargo = null;
      }
    }
    if (corpo?.data_pretendida !== undefined) {
      const d = texto(corpo.data_pretendida, 10);
      if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new BadRequestException('Data pretendida inválida (AAAA-MM-DD).');
      c.data_pretendida = d || null;
    }
    if (corpo?.prioridade !== undefined) {
      const p = texto(corpo.prioridade, 20).toUpperCase();
      if (p && !(PRIORIDADES_DFD as string[]).includes(p)) throw new BadRequestException('Prioridade inválida (BAIXA, MEDIA, ALTA ou URGENTE).');
      c.prioridade = p || null;
    }
    if (corpo?.item_pca_id !== undefined) {
      if (corpo.item_pca_id) {
        const id = String(corpo.item_pca_id);
        const [ok] = ehUuid(id)
          ? await this.ds.query(`SELECT 1 FROM itens_pca i JOIN planos_contratacao_anual p ON p.id = i.pca_id WHERE i.id::text = $1 AND p.orgao_id::text = $2`, [id, orgaoId])
          : [];
        if (!ok) throw new BadRequestException('Item do PCA não encontrado no plano do órgão.');
        c.item_pca_id = id;
      } else {
        c.item_pca_id = null;
      }
    }
    return c;
  }

  // ==========================================================================
  // ESCRITA
  // ==========================================================================

  private historico(autor: Autor, acao: string, textoH: string) {
    return { em: new Date().toISOString(), por_id: autor.id, por_nome: autor.nome, acao, texto: textoH };
  }

  /**
   * CRIA o DFD em rascunho com as demandas (travadas a partir daqui), os
   * itens somados e os campos sugeridos (o corpo sobrepõe). Número
   * sequencial por órgão e exercício.
   */
  async criar(orgaoId: string, corpo: any, ator: Ator, origem: 'CONSOLIDACAO' | 'DEMANDA_UNICA' = 'CONSOLIDACAO'): Promise<DfdLinha> {
    const ids: string[] = Array.isArray(corpo?.demanda_ids) ? corpo.demanda_ids.map(String) : [];
    const autor = await this.autor(ator);
    const ajustes = this.ajustesDoCorpo(corpo?.ajustes);
    const campos = await this.camposDoCorpo(orgaoId, corpo);
    const id = await this.ds.transaction(async (m) => {
      const demandas = await this.conferirDisponiveis(orgaoId, ids, { m });
      if (origem === 'CONSOLIDACAO' && !demandas.some((d) => d.itens.length)) throw new BadRequestException('As demandas escolhidas não têm itens.');
      const ano = this.anoDasDemandas(demandas);
      const itens = consolidarItens(demandas, ajustes);
      const s = sugestoesDoDfd(demandas, itens);
      // Unidade de planejamento e responsável: quem monta (o setor dele), salvo o que vier no corpo
      let unidade: { id: string | null; nome: string | null } = { id: null, nome: null };
      let resp: { id: string | null; nome: string | null; cargo: string | null } = { id: null, nome: null, cargo: null };
      if (ator.tipo === 'USUARIO' && ator.usuarioId) {
        const [u] = await m.query(
          `SELECT u.id::text AS id, u.nome, u.cargo, s.id::text AS setor_id, s.nome AS setor_nome FROM usuarios u LEFT JOIN setores s ON s.id = u.setor_id AND s.orgao_id::text = u.orgao_id::text WHERE u.id::text = $1 AND u.orgao_id::text = $2`,
          [ator.usuarioId, orgaoId],
        );
        if (u) {
          resp = { id: u.id, nome: u.nome, cargo: u.cargo ?? null };
          unidade = { id: u.setor_id ?? null, nome: u.setor_nome ?? null };
        }
      }
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`dfd:${orgaoId}:${ano}`]);
      const [{ n }] = await m.query(`SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM dfds_consolidados WHERE orgao_id::text = $1 AND ano = $2`, [orgaoId, ano]);
      const h = this.historico(autor, 'CRIADO', `DFD montado com ${demandas.length} demanda(s): ${[...new Set(demandas.map((d) => d.unidade_requisitante))].join(', ')}`);
      const [r] = await m.query(
        `INSERT INTO dfds_consolidados
           (orgao_id, ano, numero, status, origem, objeto, justificativa, categoria, unidade_planejamento_id, unidade_planejamento_nome,
            responsavel_id, responsavel_nome, responsavel_cargo, data_pretendida, prioridade, item_pca_id, itens, ajustes, valor_total_estimado,
            exige_aprovacao, historico, criado_por_id, criado_por_nome)
         VALUES ($1, $2, $3, 'RASCUNHO', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17::jsonb, $18, false, $19::jsonb, $20, $21)
         RETURNING id::text AS id`,
        [
          orgaoId,
          ano,
          Number(n),
          origem,
          campos.objeto ?? s.objeto,
          campos.justificativa !== undefined ? campos.justificativa : s.justificativa || null,
          s.categoria,
          campos.unidade_planejamento_id !== undefined ? campos.unidade_planejamento_id : unidade.id,
          campos.unidade_planejamento_nome !== undefined ? campos.unidade_planejamento_nome : unidade.nome,
          campos.responsavel_id !== undefined ? campos.responsavel_id : resp.id,
          campos.responsavel_nome !== undefined ? campos.responsavel_nome : resp.nome,
          campos.responsavel_cargo !== undefined ? campos.responsavel_cargo : resp.cargo,
          campos.data_pretendida !== undefined ? campos.data_pretendida : s.data_pretendida,
          campos.prioridade !== undefined ? campos.prioridade : s.prioridade,
          campos.item_pca_id !== undefined ? campos.item_pca_id : s.item_pca_id,
          JSON.stringify(itens),
          JSON.stringify(ajustes),
          valorTotalDosItens(itens),
          JSON.stringify([h]),
          autor.id,
          autor.nome,
        ],
      );
      for (const d of demandas) {
        try {
          await m.query(`INSERT INTO dfds_consolidados_demandas (dfd_id, demanda_id, orgao_id, setor) VALUES ($1, $2, $3, $4)`, [r.id, d.id, orgaoId, d.unidade_requisitante]);
        } catch {
          throw new ConflictException(`A demanda de ${d.unidade_requisitante} acabou de entrar em outro DFD — atualize a tela.`);
        }
      }
      return r.id as string;
    });
    return this.carregar(id);
  }

  /** "Iniciar contratação" a partir de UMA demanda (só a unidade de planejamento): DFD de 1 demanda. */
  async criarDeUmaDemanda(demandaId: string, orgaoId: string, ator: Ator): Promise<DfdLinha> {
    const existente = await this.dfdDaDemanda(demandaId);
    if (existente && existente.status !== 'EM_PROCESSO' && existente.status !== 'CANCELADO') {
      const ids = await this.idsDasDemandas(existente.id);
      if (ids.length === 1 && ids[0] === demandaId) return this.carregar(existente.id);
    }
    return this.criar(orgaoId, { demanda_ids: [demandaId] }, ator, 'DEMANDA_UNICA');
  }

  private exigirStatus(dfd: DfdLinha, permitidos: StatusDfd[], acao: string) {
    if (!permitidos.includes(dfd.status)) {
      const rotulos: Record<string, string> = { RASCUNHO: 'em elaboração', AGUARDANDO_APROVACAO: 'aguardando aprovação', APROVADO: 'aprovado', EM_PROCESSO: 'com processo aberto', CANCELADO: 'cancelado' };
      throw new ConflictException(`O ${rotuloDfd(dfd)} está ${rotulos[dfd.status] ?? dfd.status} — não dá para ${acao}.`);
    }
  }

  /** Edita o rascunho: campos, ajustes dos itens e as demandas (entrar/sair). */
  async atualizar(id: string, corpo: any, ator: Ator): Promise<DfdLinha> {
    const dfd = await this.carregar(id);
    this.exigirStatus(dfd, ['RASCUNHO'], 'alterar (só o rascunho é alterado; devolvido pela aprovação, ele volta a rascunho)');
    const autor = await this.autor(ator);
    const campos = await this.camposDoCorpo(dfd.orgao_id, corpo);
    await this.ds.transaction(async (m) => {
      const atuais = await this.idsDasDemandas(id, m);
      const novos: string[] = Array.isArray(corpo?.demanda_ids) ? [...new Set<string>(corpo.demanda_ids.map(String))] : atuais;
      if (!novos.length) throw new BadRequestException('O DFD precisa de ao menos uma demanda — para desfazer, cancele o DFD.');
      const demandas = await this.conferirDisponiveis(dfd.orgao_id, novos, { excetoDfd: id, m });
      const ano = this.anoDasDemandas(demandas);
      if (ano !== dfd.ano) throw new BadRequestException(`O ${rotuloDfd(dfd)} é do exercício ${dfd.ano}.`);
      const sair = atuais.filter((x) => !novos.includes(x));
      const entrar = demandas.filter((d) => !atuais.includes(d.id));
      if (sair.length) await m.query(`DELETE FROM dfds_consolidados_demandas WHERE dfd_id::text = $1 AND demanda_id::text = ANY($2::text[])`, [id, sair]);
      for (const d of entrar) {
        try {
          await m.query(`INSERT INTO dfds_consolidados_demandas (dfd_id, demanda_id, orgao_id, setor) VALUES ($1, $2, $3, $4)`, [id, d.id, dfd.orgao_id, d.unidade_requisitante]);
        } catch {
          throw new ConflictException(`A demanda de ${d.unidade_requisitante} acabou de entrar em outro DFD — atualize a tela.`);
        }
      }
      const ajustesBrutos = corpo?.ajustes !== undefined ? this.ajustesDoCorpo(corpo.ajustes) : dfd.ajustes;
      const semAjuste = consolidarItens(demandas, {});
      const ajustes = ajustesValidos(semAjuste, ajustesBrutos);
      const itens = consolidarItens(demandas, ajustes);
      const partes: string[] = [];
      if (entrar.length) partes.push(`entrou: ${entrar.map((d) => d.unidade_requisitante).join(', ')}`);
      if (sair.length) partes.push(`saiu(ram) ${sair.length} demanda(s)`);
      if (corpo?.ajustes !== undefined) partes.push('itens ajustados');
      const hist = [...dfd.historico];
      if (partes.length) hist.push(this.historico(autor, 'ALTERADO', partes.join('; ')));
      const final = { ...dfd, ...campos };
      await m.query(
        `UPDATE dfds_consolidados SET objeto = $2, justificativa = $3, unidade_planejamento_id = $4, unidade_planejamento_nome = $5, responsavel_id = $6,
                responsavel_nome = $7, responsavel_cargo = $8, data_pretendida = $9, prioridade = $10, item_pca_id = $11, itens = $12::jsonb, ajustes = $13::jsonb,
                valor_total_estimado = $14, categoria = $15, historico = $16::jsonb, devolucao = CASE WHEN $17 THEN NULL ELSE devolucao END, updated_at = now()
          WHERE id::text = $1`,
        [
          id,
          final.objeto,
          final.justificativa,
          final.unidade_planejamento_id,
          final.unidade_planejamento_nome,
          final.responsavel_id,
          final.responsavel_nome,
          final.responsavel_cargo,
          final.data_pretendida,
          final.prioridade,
          final.item_pca_id,
          JSON.stringify(itens),
          JSON.stringify(ajustes),
          valorTotalDosItens(itens),
          itens.some((i) => i.categoria === 'SERVICO') ? 'SERVICO' : 'MATERIAL',
          JSON.stringify(hist),
          false,
        ],
      );
    });
    return this.carregar(id);
  }

  /** 2ª aprovação ligada: envia o rascunho ao aprovador (aviso na Central de Aprovações). */
  async enviarParaAprovacao(id: string, ator: Ator): Promise<DfdLinha> {
    const dfd = await this.carregar(id);
    this.exigirStatus(dfd, ['RASCUNHO'], 'enviar para aprovação');
    const p = await this.planejamento.vigente(dfd.orgao_id);
    if (!p.aprovacao_dfd.exigida) throw new ConflictException('A 2ª aprovação do DFD está desligada neste órgão (Configurações › Fluxo) — abra o processo direto.');
    if (!dfd.itens.length) throw new BadRequestException('O DFD não tem itens.');
    const autor = await this.autor(ator);
    await this.ds.query(
      `UPDATE dfds_consolidados SET status = 'AGUARDANDO_APROVACAO', exige_aprovacao = true, historico = historico || $2::jsonb, updated_at = now()
        WHERE id::text = $1 AND status = 'RASCUNHO'`,
      [id, JSON.stringify([this.historico(autor, 'ENVIADO', 'Enviado para a 2ª aprovação')])],
    );
    await this.avisar(
      dfd.orgao_id,
      await this.planejamento.destinatarios(dfd.orgao_id, p.aprovacao_dfd.aprovador, 'APROVAR'),
      `${rotuloDfd(dfd)} aguarda a sua aprovação`,
      `${dfd.objeto.slice(0, 200)} — ${dfd.itens.length} item(ns), ${Number(dfd.valor_total_estimado).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. Enviado por ${autor.nome ?? 'o planejamento'}. Acesse a Central de Aprovações.`,
      LINK_CENTRAL,
      id,
    );
    return this.carregar(id);
  }

  async aprovar(id: string, ator: Ator, corpo: any): Promise<DfdLinha> {
    const dfd = await this.carregar(id);
    this.exigirStatus(dfd, ['AGUARDANDO_APROVACAO'], 'aprovar');
    if (!(await this.planejamento.podeAprovarDfd(ator, dfd.orgao_id))) {
      const p = await this.planejamento.vigente(dfd.orgao_id);
      throw new ForbiddenException(`Só quem foi designado aprova o DFD consolidado: ${rotuloRegra(p.aprovacao_dfd.aprovador, 'APROVAR')}.`);
    }
    const autor = await this.autor(ator);
    const observacao = texto(corpo?.observacao, 1000) || null;
    const r = await this.ds.query(
      `UPDATE dfds_consolidados SET status = 'APROVADO', aprovacao = $2::jsonb, devolucao = NULL, historico = historico || $3::jsonb, updated_at = now()
        WHERE id::text = $1 AND status = 'AGUARDANDO_APROVACAO' RETURNING id`,
      [id, JSON.stringify({ por_id: autor.id, por_nome: autor.nome, em: new Date().toISOString(), observacao }), JSON.stringify([this.historico(autor, 'APROVADO', observacao ?? 'Aprovado')])],
    );
    if (!(Array.isArray(r?.[0]) ? r[0].length : r?.length)) throw new ConflictException('O DFD mudou de situação — atualize a tela.');
    await this.avisarCriador(dfd, `${rotuloDfd(dfd)} aprovado`, `Aprovado por ${autor.nome ?? 'o aprovador'}${observacao ? `: ${observacao}` : ''}. Já pode abrir o processo.`);
    return this.carregar(id);
  }

  async devolver(id: string, ator: Ator, corpo: any): Promise<DfdLinha> {
    const dfd = await this.carregar(id);
    this.exigirStatus(dfd, ['AGUARDANDO_APROVACAO'], 'devolver');
    if (!(await this.planejamento.podeAprovarDfd(ator, dfd.orgao_id))) throw new ForbiddenException('Só quem foi designado para aprovar o DFD consolidado o devolve.');
    const motivo = texto(corpo?.motivo, 1000);
    if (motivo.length < 5) throw new BadRequestException('Informe o motivo da devolução (fica no histórico e vai para o planejamento).');
    const autor = await this.autor(ator);
    await this.ds.query(
      `UPDATE dfds_consolidados SET status = 'RASCUNHO', devolucao = $2::jsonb, historico = historico || $3::jsonb, updated_at = now()
        WHERE id::text = $1 AND status = 'AGUARDANDO_APROVACAO'`,
      [id, JSON.stringify({ por_id: autor.id, por_nome: autor.nome, em: new Date().toISOString(), motivo }), JSON.stringify([this.historico(autor, 'DEVOLVIDO', motivo)])],
    );
    await this.avisarCriador(dfd, `${rotuloDfd(dfd)} devolvido`, `Devolvido por ${autor.nome ?? 'o aprovador'}: ${motivo}`);
    return this.carregar(id);
  }

  /** Desfaz o DFD (antes do processo): as demandas voltam a ficar livres. */
  async cancelar(id: string, ator: Ator, corpo: any): Promise<DfdLinha> {
    const dfd = await this.carregar(id);
    this.exigirStatus(dfd, ['RASCUNHO', 'AGUARDANDO_APROVACAO', 'APROVADO'], 'cancelar');
    const motivo = texto(corpo?.motivo, 1000);
    if (motivo.length < 5) throw new BadRequestException('Informe o motivo do cancelamento.');
    const autor = await this.autor(ator);
    await this.ds.transaction(async (m) => {
      const r = await m.query(
        `UPDATE dfds_consolidados SET status = 'CANCELADO', historico = historico || $2::jsonb, updated_at = now()
          WHERE id::text = $1 AND status IN ('RASCUNHO','AGUARDANDO_APROVACAO','APROVADO') AND licitacao_id IS NULL RETURNING id`,
        [id, JSON.stringify([this.historico(autor, 'CANCELADO', motivo)])],
      );
      if (!(Array.isArray(r?.[0]) ? r[0].length : r?.length)) throw new ConflictException('O DFD mudou de situação — atualize a tela.');
      await m.query(`DELETE FROM dfds_consolidados_demandas WHERE dfd_id::text = $1`, [id]);
    });
    return this.carregar(id);
  }

  // ==========================================================================
  // PROCESSO
  // ==========================================================================

  /**
   * Reserva o DFD para abrir o processo (ninguém abre dois): confere a
   * situação (2ª aprovação ligada → só APROVADO), os itens e se as demandas
   * continuam aprovadas e sem outro processo. Devolve o DFD e a situação
   * anterior (para desfazer se a criação falhar).
   */
  async reservarParaProcesso(id: string, orgaoId: string | null): Promise<{ dfd: DfdLinha; anterior: StatusDfd; demandas: DemandaCarregada[] }> {
    const dfd = await this.carregar(id);
    if (orgaoId && dfd.orgao_id !== orgaoId) throw new NotFoundException('DFD não encontrado');
    if (dfd.status === 'EM_PROCESSO' || dfd.licitacao_id || dfd.processo_id) {
      const [l] = dfd.licitacao_id
        ? await this.ds.query(`SELECT numero_processo FROM licitacoes WHERE id::text = $1`, [dfd.licitacao_id])
        : dfd.processo_id
          ? await this.ds.query(`SELECT numero AS numero_processo FROM processos WHERE id::text = $1`, [dfd.processo_id])
          : [];
      throw new ConflictException(`O ${rotuloDfd(dfd)} já está no processo ${l?.numero_processo ?? ''}`.trim());
    }
    const p = await this.planejamento.vigente(dfd.orgao_id);
    if (p.aprovacao_dfd.exigida && dfd.status !== 'APROVADO') {
      throw new ConflictException(
        `A 2ª aprovação do DFD está ligada: o ${rotuloDfd(dfd)} precisa ser ${dfd.status === 'AGUARDANDO_APROVACAO' ? 'aprovado' : 'enviado para aprovação e aprovado'} antes de abrir o processo.`,
      );
    }
    this.exigirStatus(dfd, ['RASCUNHO', 'AGUARDANDO_APROVACAO', 'APROVADO'], 'abrir o processo');
    if (!dfd.itens.length && dfd.origem === 'CONSOLIDACAO') throw new BadRequestException('O DFD não tem itens.');
    const ids = await this.idsDasDemandas(id);
    const demandas = await this.conferirDisponiveis(dfd.orgao_id, ids, { excetoDfd: id });
    const r = await this.ds.query(
      `UPDATE dfds_consolidados SET status = 'EM_PROCESSO', exige_aprovacao = $3, updated_at = now()
        WHERE id::text = $1 AND status = $2 AND licitacao_id IS NULL AND processo_id IS NULL RETURNING id`,
      [id, dfd.status, p.aprovacao_dfd.exigida],
    );
    if (!(Array.isArray(r?.[0]) ? r[0].length : r?.length)) throw new ConflictException('O DFD mudou de situação — atualize a tela.');
    return { dfd: { ...dfd, exige_aprovacao: p.aprovacao_dfd.exigida }, anterior: dfd.status, demandas };
  }

  async liberarReserva(id: string, anterior: StatusDfd): Promise<void> {
    await this.ds.query(`UPDATE dfds_consolidados SET status = $2, updated_at = now() WHERE id::text = $1 AND licitacao_id IS NULL AND status = 'EM_PROCESSO'`, [id, anterior]).catch(() => undefined);
  }

  /** Grava a ligação processo ↔ DFD (as demandas seguem pela tabela de ligação). */
  async vincularProcesso(id: string, licitacaoId: string, ator: Ator | null, numeroProcesso: string): Promise<void> {
    const autor = ator ? await this.autor(ator) : { id: null, nome: 'Sistema', cargo: null };
    await this.ds.query(
      `UPDATE dfds_consolidados SET licitacao_id = $2, status = 'EM_PROCESSO', historico = historico || $3::jsonb, updated_at = now() WHERE id::text = $1`,
      [id, licitacaoId, JSON.stringify([this.historico(autor, 'PROCESSO_ABERTO', `Processo ${numeroProcesso} aberto a partir do DFD`)])],
    );
  }

  /**
   * ETAPA DFD DO FLUXO (processo eletrônico): junta este DFD consolidado aos
   * autos do processo como o documento da etapa DFD em andamento — o PDF do
   * DFD (com as demandas reunidas, art. 12, VII) vira a peça `no:<acao_id>`,
   * o que satisfaz a pendência da etapa. Mesmas regras de "abrir processo"
   * (2ª aprovação, demandas ainda disponíveis, um processo só); quem junta
   * precisa ser o responsável pela etapa (conferido no juntar). Se a juntada
   * falhar, o DFD volta à situação anterior.
   */
  async juntarAoProcessoEletronico(id: string, processoId: string, ator: Ator) {
    const orgaoId = ator.orgaoId;
    if (!orgaoId) throw new ForbiddenException('Ação exclusiva do órgão');
    if (!ehUuid(processoId)) throw new BadRequestException('Processo inválido');
    const [processo] = await this.ds.query(`SELECT id::text AS id, numero FROM processos WHERE id::text = $1 AND orgao_id::text = $2`, [processoId, orgaoId]);
    if (!processo) throw new NotFoundException('Processo não encontrado');
    const acaoId = acaoDaEtapaDfdAberta(await this.workflow.execucaoDoProcesso(orgaoId, processoId));
    if (!acaoId) throw new BadRequestException('O processo não está na etapa DFD do fluxo.');

    const { dfd, anterior } = await this.reservarParaProcesso(id, orgaoId);
    try {
      const autor = await this.autor(ator);
      await this.ds.query(
        `UPDATE dfds_consolidados SET processo_id = $2, historico = historico || $3::jsonb, updated_at = now() WHERE id::text = $1`,
        [id, processoId, JSON.stringify([this.historico(autor, 'PROCESSO_ABERTO', `Juntado ao processo ${processo.numero} na etapa DFD`)])],
      );
      const { buffer } = await this.pdf(id);
      const nome = `dfd-${dfd.numero}-${dfd.ano}-${randomUUID()}.pdf`;
      const dir = path.join(diretorioDeGravacao('processo'), processoId);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, nome), buffer);
      await this.tramitacao.juntar(ator, processoId, {
        titulo: `${rotuloDfd(dfd)} — ${dfd.objeto}`.slice(0, 300),
        arquivo_url: `/api/uploads/processo/${processoId}/${nome}`,
        arquivo_nome: `DFD-${dfd.numero}-${dfd.ano}.pdf`,
        paginas: Math.max(1, await contarPaginasPdf(buffer)),
        etapa: `no:${acaoId}`,
        tipo_peca: 'DFD',
      }, { documentoDoSistema: true });
    } catch (e) {
      await this.ds.query(`UPDATE dfds_consolidados SET processo_id = NULL, status = $2, updated_at = now() WHERE id::text = $1 AND licitacao_id IS NULL`, [id, anterior]).catch(() => undefined);
      throw e;
    }
    return { processo_id: processoId, numero_processo: processo.numero };
  }

  /** DFDs do órgão que ainda podem ir para um processo (não cancelados, sem processo). */
  async disponiveisParaProcesso(orgaoId: string) {
    return this.ds.query(
      `SELECT id::text AS id, ano, numero, status, objeto, valor_total_estimado
         FROM dfds_consolidados
        WHERE orgao_id::text = $1 AND status IN ('RASCUNHO','AGUARDANDO_APROVACAO','APROVADO') AND licitacao_id IS NULL AND processo_id IS NULL
        ORDER BY ano DESC, numero DESC LIMIT 200`,
      [orgaoId],
    );
  }

  /** Setor do órgão com o nome informado (a demanda guarda o setor como texto). */
  private async setorPorNome(orgaoId: string, nome: string | null): Promise<{ id: string; nome: string } | null> {
    if (!nome) return null;
    const [s] = await this.ds.query(`SELECT id::text AS id, nome FROM setores WHERE orgao_id::text = $1 AND lower(trim(nome)) = lower(trim($2)) LIMIT 1`, [orgaoId, nome]);
    return s ?? null;
  }

  /**
   * Campos da PEÇA DFD do processo, a partir do DFD consolidado — nada de
   * redigitar: unidade requisitante (setor como id quando existir),
   * responsável, data pretendida, prioridade; seções necessidade,
   * quantidades, previsão no PCA e data.
   */
  async camposDaPeca(dfd: DfdLinha, demandas: DemandaCarregada[]) {
    const esc = (s: unknown) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
    const setores = [...new Set(demandas.map((d) => d.unidade_requisitante).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
    let unidade: { id: string | null; nome: string | null };
    if (setores.length === 1) {
      const idDemanda = demandas.find((d) => d.setor_id)?.setor_id ?? null;
      const s = idDemanda ? { id: idDemanda, nome: setores[0] } : await this.setorPorNome(dfd.orgao_id, setores[0]);
      unidade = s ? { id: s.id, nome: s.nome } : { id: null, nome: setores[0] };
    } else {
      const base = dfd.unidade_planejamento_nome ?? 'Unidade de planejamento';
      unidade = { id: dfd.unidade_planejamento_id, nome: `${base} (demandas de: ${setores.join('; ')})`.slice(0, 500) };
    }
    const itens = dfd.itens;
    const necessidade =
      `<p>${esc(dfd.objeto)}</p>` +
      (dfd.justificativa ? dfd.justificativa.split(/\r?\n/).filter((l) => l.trim()).map((l) => `<p>${esc(l)}</p>`).join('') : '') +
      `<p>${setores.length > 1 ? `Demanda consolidada pela unidade de planejamento (${rotuloDfd(dfd)}) a partir dos pedidos de: ${esc(setores.join('; '))} — art. 12, VII, da Lei nº 14.133/2021.` : `Unidade requisitante: ${esc(setores[0] ?? '')}. ${rotuloDfd(dfd)}.`}</p>`;
    const quantidade = itens.length
      ? `<ul>${itens
          .map((i) => `<li>${esc(i.descricao)} — ${Number(i.quantidade).toLocaleString('pt-BR')} ${esc(i.unidade_medida)}${i.origens.length > 1 ? ` (${esc(i.origens.map((o) => `${o.setor}: ${Number(o.quantidade).toLocaleString('pt-BR')}`).join('; '))})` : ''}</li>`)
          .join('')}</ul>`
      : '';
    let previsao = `<p>Exercício ${dfd.ano}.</p>`;
    if (dfd.item_pca_id) {
      const [i] = await this.ds.query(
        `SELECT i.numero_item, i.descricao_objeto, p.ano_exercicio FROM itens_pca i JOIN planos_contratacao_anual p ON p.id = i.pca_id WHERE i.id::text = $1`,
        [dfd.item_pca_id],
      );
      if (i) previsao = `<p>A contratação está prevista no Plano de Contratações Anual ${i.ano_exercicio}, item ${i.numero_item} — ${esc(i.descricao_objeto)} (art. 12, VII).</p>`;
    }
    const data = dfd.data_pretendida
      ? `<p>Data pretendida para a contratação: ${dfd.data_pretendida.split('-').reverse().join('/')}${dfd.prioridade ? ` (prioridade ${dfd.prioridade.toLowerCase()})` : ''}.</p>`
      : '';
    return {
      secoes: { demanda: necessidade, quantidade, previsao, data },
      _dfd: {
        unidade_requisitante_id: unidade.id,
        unidade_requisitante_nome: unidade.nome,
        responsavel_id: dfd.responsavel_id,
        responsavel_nome: dfd.responsavel_nome,
        fiscal_sugerido_id: null,
        fiscal_sugerido_nome: null,
        data_pretendida: dfd.data_pretendida,
        prioridade: dfd.prioridade,
        atualizado_por: 'DFD consolidado',
        atualizado_em: new Date().toISOString(),
      },
      _dfd_consolidado: { id: dfd.id, numero: dfd.numero, ano: dfd.ano, demandas: demandas.map((d) => ({ id: d.id, setor: d.unidade_requisitante })) },
    };
  }

  // ==========================================================================
  // TELA
  // ==========================================================================

  async listar(orgaoId: string, ano?: number) {
    const r: any[] = await this.ds.query(
      `SELECT f.id::text AS id, f.ano, f.numero, f.status, f.origem, f.objeto, f.valor_total_estimado, f.licitacao_id::text AS licitacao_id,
              l.numero_processo, f.unidade_planejamento_nome, f.responsavel_nome, f.created_at, f.updated_at,
              jsonb_array_length(f.itens) AS n_itens,
              (SELECT COUNT(*)::int FROM dfds_consolidados_demandas fd WHERE fd.dfd_id = f.id) AS n_demandas,
              (SELECT string_agg(DISTINCT fd.setor, ', ') FROM dfds_consolidados_demandas fd WHERE fd.dfd_id = f.id) AS setores
         FROM dfds_consolidados f LEFT JOIN licitacoes l ON l.id = f.licitacao_id
        WHERE f.orgao_id::text = $1 AND ($2::int IS NULL OR f.ano = $2)
        ORDER BY f.ano DESC, f.numero DESC`,
      [orgaoId, ano ?? null],
    );
    return r.map((x) => ({ ...x, valor_total_estimado: Number(x.valor_total_estimado) || 0 }));
  }

  /** O DFD com as demandas de origem, o alerta de parecidos e o que quem consulta pode fazer. */
  async obter(id: string, ator: Ator) {
    const dfd = await this.carregar(id);
    const ids = await this.idsDasDemandas(id);
    const demandas = await this.carregarDemandas(ids);
    const [proc] = dfd.licitacao_id ? await this.ds.query(`SELECT id::text AS id, numero_processo, fase::text AS fase FROM licitacoes WHERE id::text = $1`, [dfd.licitacao_id]) : [];
    const [procEletronico] = dfd.processo_id ? await this.ds.query(`SELECT id::text AS id, numero, objeto FROM processos WHERE id::text = $1 AND orgao_id::text = $2`, [dfd.processo_id, dfd.orgao_id]) : [];
    const alertas = dfd.status === 'CANCELADO' ? [] : await this.alertas(dfd.orgao_id, dfd.ano, dfd.itens, { dfdId: id, demandaIds: ids, licitacaoId: dfd.licitacao_id });
    const perm = await this.permissoes(ator, dfd.orgao_id);
    const [pcaItem] = dfd.item_pca_id
      ? await this.ds.query(`SELECT i.id::text AS id, i.numero_item, i.descricao_objeto, p.ano_exercicio AS ano FROM itens_pca i JOIN planos_contratacao_anual p ON p.id = i.pca_id WHERE i.id::text = $1`, [dfd.item_pca_id])
      : [];
    const [setores, usuarios, itensPca] = await Promise.all([
      this.ds.query(`SELECT id::text AS id, nome FROM setores WHERE orgao_id::text = $1 ORDER BY nome`, [dfd.orgao_id]),
      this.ds.query(`SELECT id::text AS id, nome, cargo FROM usuarios WHERE orgao_id::text = $1 AND ativo = true ORDER BY nome`, [dfd.orgao_id]),
      this.ds.query(
        `SELECT i.id::text AS id, i.numero_item, i.descricao_objeto, p.ano_exercicio AS ano FROM itens_pca i JOIN planos_contratacao_anual p ON p.id = i.pca_id
          WHERE p.orgao_id::text = $1 AND p.ano_exercicio BETWEEN $2 - 1 AND $2 + 1 ORDER BY p.ano_exercicio DESC, i.numero_item LIMIT 500`,
        [dfd.orgao_id, dfd.ano],
      ),
    ]);
    const editavel = dfd.status === 'RASCUNHO' && perm.pode_montar;
    return {
      ...dfd,
      rotulo: rotuloDfd(dfd),
      demandas: demandas.map((d) => ({
        id: d.id,
        unidade_requisitante: d.unidade_requisitante,
        descricao_sucinta_objeto: d.descricao_sucinta_objeto,
        status: d.status,
        data_aprovacao: d.data_aprovacao,
        aprovado_por: d.aprovado_por,
        n_itens: d.itens.length,
        valor: valorTotalDosItens(d.itens.map((i) => ({ valor_total_estimado: Number(i.valor_total_estimado) || Number(i.quantidade_estimada) * Number(i.valor_unitario_estimado) || 0 }))),
      })),
      processo: proc ?? null,
      processo_eletronico: procEletronico ?? null,
      item_pca: pcaItem ?? null,
      alertas,
      alerta: textoDoAlerta(alertas),
      permissoes: {
        ...perm,
        editar: editavel,
        enviar_aprovacao: dfd.status === 'RASCUNHO' && perm.pode_montar && perm.exige_aprovacao_dfd,
        aprovar: dfd.status === 'AGUARDANDO_APROVACAO' && perm.pode_aprovar_dfd,
        abrir_processo:
          perm.pode_montar && !dfd.licitacao_id && !dfd.processo_id && (perm.exige_aprovacao_dfd ? dfd.status === 'APROVADO' : ['RASCUNHO', 'AGUARDANDO_APROVACAO', 'APROVADO'].includes(dfd.status)),
        cancelar: perm.pode_montar && ['RASCUNHO', 'AGUARDANDO_APROVACAO', 'APROVADO'].includes(dfd.status),
      },
      opcoes: { setores, usuarios, itens_pca: itensPca },
    };
  }

  async pdf(id: string): Promise<{ buffer: Buffer; nome: string }> {
    const dfd = await this.carregar(id);
    const ids = await this.idsDasDemandas(id);
    const demandas = await this.carregarDemandas(ids);
    const [orgao] = await this.ds.query(`SELECT nome, cidade, uf FROM orgaos WHERE id::text = $1`, [dfd.orgao_id]);
    const [proc] = dfd.licitacao_id
      ? await this.ds.query(`SELECT numero_processo FROM licitacoes WHERE id::text = $1`, [dfd.licitacao_id])
      : dfd.processo_id
        ? await this.ds.query(`SELECT numero AS numero_processo FROM processos WHERE id::text = $1`, [dfd.processo_id])
        : [];
    let pca: string | null = null;
    if (dfd.item_pca_id) {
      const [i] = await this.ds.query(
        `SELECT i.numero_item, i.descricao_objeto, p.ano_exercicio FROM itens_pca i JOIN planos_contratacao_anual p ON p.id = i.pca_id WHERE i.id::text = $1`,
        [dfd.item_pca_id],
      );
      if (i) pca = `PCA ${i.ano_exercicio}, item ${i.numero_item} — ${i.descricao_objeto}`;
    }
    // Demandas de um DFD cancelado não ficam ligadas: o PDF lista as do histórico de itens
    const origemDemandas = demandas.length
      ? demandas.map((d) => ({ setor: d.unidade_requisitante, objeto: d.descricao_sucinta_objeto ?? null, aprovada_em: d.data_aprovacao, aprovado_por: d.aprovado_por }))
      : [...new Set(dfd.itens.flatMap((i) => i.origens.map((o) => o.setor)))].map((s) => ({ setor: s, objeto: null, aprovada_em: null, aprovado_por: null }));
    const buffer = await gerarPdfDfdConsolidado({
      orgao_nome: orgao?.nome ?? 'Órgão',
      cidade: orgao?.cidade ?? null,
      uf: orgao?.uf ?? null,
      numero: dfd.numero,
      ano: dfd.ano,
      status: dfd.status,
      objeto: dfd.objeto,
      justificativa: dfd.justificativa,
      unidade_planejamento: dfd.unidade_planejamento_nome,
      responsavel_nome: dfd.responsavel_nome,
      responsavel_cargo: dfd.responsavel_cargo,
      data_pretendida: dfd.data_pretendida,
      prioridade: dfd.prioridade,
      pca,
      itens: dfd.itens.map((i) => ({
        numero: i.numero,
        descricao: i.descricao,
        codigo: i.codigo_item_catalogo || i.codigo_classe || null,
        unidade: i.unidade_medida,
        quantidade: Number(i.quantidade),
        quantidade_somada: Number(i.quantidade_somada),
        valor_unitario: Number(i.valor_unitario_estimado),
        valor_total: Number(i.valor_total_estimado),
        origens: i.origens.map((o) => ({ setor: o.setor, quantidade: Number(o.quantidade) })),
        ajuste: i.ajustado ? `ajustado pelo planejamento (somado: ${Number(i.quantidade_somada).toLocaleString('pt-BR')})${i.justificativa_ajuste ? `: ${i.justificativa_ajuste}` : ''}` : null,
      })),
      valor_total: Number(dfd.valor_total_estimado),
      demandas: origemDemandas,
      aprovacao: dfd.aprovacao ? { por_nome: dfd.aprovacao.por_nome ?? null, em: dfd.aprovacao.em ?? null, observacao: dfd.aprovacao.observacao ?? null } : null,
      numero_processo: proc?.numero_processo ?? null,
      gerado_em: new Date(),
    });
    return { buffer, nome: `DFD-${dfd.numero}-${dfd.ano}.pdf` };
  }

  // ==========================================================================
  // CENTRAL DE APROVAÇÕES
  // ==========================================================================

  /**
   * Tudo o que ESTE usuário aprova, do planejamento: demandas enviadas (se ele
   * aprova demandas), DFDs aguardando a 2ª aprovação (se ele aprova DFD) e a
   * "aprovação da demanda" dos processos (tarefas "Aprovar a demanda" dele).
   */
  async pendentesDaCentral(ator: Ator, orgaoId: string) {
    const perm = await this.permissoes(ator, orgaoId);
    const demandas: any[] = perm.pode_aprovar_demanda
      ? await this.ds.query(
          `SELECT d.id::text AS id, d.ano_referencia, d.unidade_requisitante, d.responsavel_nome, d.status::text AS status, d.descricao_sucinta_objeto,
                  d.observacoes, d.data_envio, d.criado_por_nome,
                  COALESCE(json_agg(json_build_object('id', i.id, 'descricao_objeto', i.descricao_objeto, 'quantidade_estimada', i.quantidade_estimada,
                           'unidade_medida', i.unidade_medida, 'valor_total_estimado', i.valor_total_estimado, 'nome_classe', i.nome_classe)) FILTER (WHERE i.id IS NOT NULL), '[]') AS itens
             FROM demandas d LEFT JOIN itens_demanda i ON i.demanda_id::text = d.id::text
            WHERE d.orgao_id::text = $1 AND d.status::text IN ('ENVIADA','EM_ANALISE')
            GROUP BY d.id ORDER BY d.data_envio NULLS LAST, d.created_at`,
          [orgaoId],
        )
      : [];
    const dfds = perm.pode_aprovar_dfd
      ? (await this.listar(orgaoId)).filter((f: any) => f.status === 'AGUARDANDO_APROVACAO')
      : [];
    const pessoa = await this.planejamento.pessoa(ator, orgaoId);
    let processos: any[] = [];
    if (pessoa) {
      processos = await this.ds.query(
        `SELECT DISTINCT ON (t.licitacao_id) t.id::text AS tarefa_id, t.licitacao_id::text AS licitacao_id, t.titulo, t.descricao, t.created_at,
                l.numero_processo, l.objeto, l.modalidade::text AS modalidade
           FROM tarefas t JOIN licitacoes l ON l.id = t.licitacao_id
          WHERE t.orgao_id::text = $1 AND t.status::text = 'ABERTA' AND (t.chave = 'demanda:aprovar' OR t.chave LIKE 'demanda:aprovar:%')
            AND ($2::boolean OR t.responsavel_usuario_id::text = $3
                 OR (t.responsavel_papel IS NOT NULL AND t.responsavel_papel::text = ANY($4::text[]))
                 OR (t.responsavel_setor_id IS NOT NULL AND t.responsavel_setor_id::text = $5)
                 OR (t.responsavel_usuario_id IS NULL AND t.responsavel_papel IS NULL AND t.responsavel_setor_id IS NULL AND $6::boolean))
          ORDER BY t.licitacao_id, t.created_at`,
        [orgaoId, pessoa.orgao, pessoa.usuario_id ?? '', pessoa.papeis, pessoa.setor_id ?? '', pessoa.admin_orgao],
      );
    }
    return {
      permissoes: perm,
      demandas: demandas.map((d) => ({ ...d, itens: Array.isArray(d.itens) ? d.itens : [] })),
      dfds,
      processos,
      total: demandas.length + dfds.length + processos.length,
    };
  }

  // ==========================================================================
  // AVISOS (sino, e-mail e WhatsApp — padrão de OS/medição)
  // ==========================================================================

  async avisar(orgaoId: string, para: DestinatarioAviso[], titulo: string, mensagem: string, link: string, entidadeId: string, entidade = 'DFD_CONSOLIDADO'): Promise<void> {
    try {
      const dados = {
        orgao_id: orgaoId,
        tipo: TipoNotificacao.SISTEMA,
        titulo,
        mensagem,
        entidade_tipo: entidade,
        entidade_id: entidadeId,
        link,
        metadata: { whatsapp_url: `${APP_URL()}${link}` },
        enviar_email: true,
      };
      if (para.length) await this.notificacoes.criarParaMultiplos(para, dados);
      else await this.notificacoes.criar({ ...dados, usuario_id: orgaoId, enviar_email: false });
    } catch (e: any) {
      this.logger.warn(`Aviso não enviado (${titulo}): ${e?.message ?? e}`);
    }
  }

  private async avisarCriador(dfd: DfdLinha, titulo: string, mensagem: string) {
    const para: DestinatarioAviso[] = [];
    if (dfd.criado_por_id && ehUuid(dfd.criado_por_id)) {
      const [u] = await this.ds.query(`SELECT id::text AS id, email, telefone FROM usuarios WHERE id::text = $1 AND ativo = true`, [dfd.criado_por_id]);
      if (u) para.push({ id: u.id, email: u.email || undefined, telefone: u.telefone || undefined });
    }
    await this.avisar(dfd.orgao_id, para, titulo, mensagem, `/orgao/demandas/dfd/${dfd.id}`, dfd.id);
  }

  /** Demandas do processo: o vínculo antigo (`licitacoes.demanda_id`) e as do DFD consolidado. */
  async demandasDoProcesso(licitacaoId: string): Promise<string[]> {
    if (!ehUuid(licitacaoId)) return [];
    const r = await this.ds.query(
      `SELECT demanda_id::text AS id FROM licitacoes WHERE id::text = $1 AND demanda_id IS NOT NULL
       UNION
       SELECT fd.demanda_id::text FROM dfds_consolidados f JOIN dfds_consolidados_demandas fd ON fd.dfd_id = f.id WHERE f.licitacao_id::text = $1`,
      [licitacaoId],
    );
    return r.map((x: any) => x.id);
  }

  // ==========================================================================
  // MIGRAÇÃO (boot): processos antigos de 1 demanda ganham o vínculo na tabela nova
  // ==========================================================================

  /**
   * Processo criado de UMA demanda antes do DFD consolidado: grava um DFD de
   * 1 demanda (origem MIGRACAO, já EM_PROCESSO) e a ligação — o processo
   * continua o mesmo (`licitacoes.demanda_id` fica). Idempotente.
   */
  async migrarProcessosDeUmaDemanda(): Promise<number> {
    const procs: any[] = await this.ds.query(
      `SELECT l.id::text AS licitacao_id, l.orgao_id::text AS orgao_id, l.demanda_id::text AS demanda_id, l.objeto, l.created_at
         FROM licitacoes l JOIN demandas d ON d.id = l.demanda_id AND d.orgao_id::text = l.orgao_id::text
        WHERE NOT EXISTS (SELECT 1 FROM dfds_consolidados f WHERE f.licitacao_id = l.id)
          AND NOT EXISTS (SELECT 1 FROM dfds_consolidados_demandas fd WHERE fd.demanda_id = l.demanda_id)
        ORDER BY l.created_at`,
    );
    let n = 0;
    for (const p of procs) {
      try {
        await this.ds.transaction(async (m) => {
          const [d] = await this.carregarDemandas([p.demanda_id], m);
          if (!d) return;
          const itens = consolidarItens([d]);
          const s = sugestoesDoDfd([d], itens);
          const ano = Number(d.ano_referencia) || new Date(p.created_at).getFullYear();
          await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`dfd:${p.orgao_id}:${ano}`]);
          const [{ num }] = await m.query(`SELECT COALESCE(MAX(numero), 0) + 1 AS num FROM dfds_consolidados WHERE orgao_id::text = $1 AND ano = $2`, [p.orgao_id, ano]);
          const [r] = await m.query(
            `INSERT INTO dfds_consolidados
               (orgao_id, ano, numero, status, origem, objeto, justificativa, categoria, data_pretendida, prioridade, item_pca_id, itens, ajustes,
                valor_total_estimado, exige_aprovacao, historico, licitacao_id, criado_por_nome)
             VALUES ($1, $2, $3, 'EM_PROCESSO', 'MIGRACAO', $4, $5, $6, $7, $8, $9, $10::jsonb, '{}'::jsonb, $11, false, $12::jsonb, $13, 'Migração (processo de 1 demanda)')
             RETURNING id::text AS id`,
            [
              p.orgao_id,
              ano,
              Number(num),
              p.objeto || s.objeto,
              s.justificativa || null,
              s.categoria,
              s.data_pretendida,
              s.prioridade,
              s.item_pca_id,
              JSON.stringify(itens),
              valorTotalDosItens(itens),
              JSON.stringify([{ em: new Date().toISOString(), por_id: null, por_nome: 'Sistema', acao: 'MIGRACAO', texto: 'Vínculo do processo já existente com a demanda de origem (DFD de 1 demanda).' }]),
              p.licitacao_id,
            ],
          );
          await m.query(`INSERT INTO dfds_consolidados_demandas (dfd_id, demanda_id, orgao_id, setor) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, [
            r.id,
            d.id,
            p.orgao_id,
            d.unidade_requisitante,
          ]);
        });
        n++;
      } catch (e: any) {
        this.logger.warn(`DFD do processo ${p.licitacao_id} não migrado: ${e?.message ?? e}`);
      }
    }
    return n;
  }

  /** DFD ativo? (status que segura as demandas) */
  static ativo(status: string): boolean {
    return (STATUS_DFD_ATIVO as string[]).includes(status);
  }
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { calendarioDoOrgao } from '../common/prazos/calendario';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { extname } from 'path';
import { DataSource, EntityManager, In } from 'typeorm';

import {
  AtoRecorrido,
  EfeitosRecurso,
  RecursoAdministrativo,
  StatusRecurso,
} from './entities/recurso-administrativo.entity';
import { JanelaIntencaoRecurso } from './entities/janela-intencao-recurso.entity';
import { ContrarrazaoRecurso } from './entities/contrarrazao-recurso.entity';
import { SessaoDisputa, EtapaSessao } from './entities/sessao-disputa.entity';
import { EventoSessao, TipoEvento } from './entities/evento-sessao.entity';
import { FaseLicitacao } from '../licitacoes/entities/licitacao.entity';
import { ParametrosLicitacaoService } from '../parametros-licitacao/parametros-licitacao.service';
import { TransicoesService } from '../licitacoes/transicoes/transicoes.service';
import { AtoLicitacao, AtorTransicao } from '../licitacoes/transicoes/transicoes.tipos';
import { RankingService, UnidadeJulgamento } from '../julgamento/ranking.service';
import { AceitacaoService } from '../julgamento/aceitacao.service';
import {
  SituacaoLicitante,
  StatusAceitacao,
  atualDaUnidade,
  ehExcluida,
  ehPropostaAceita,
} from '../julgamento/regras-julgamento';
import { exigirLicitacaoAtiva } from './licitacao-ativa';
import {
  DIAS_UTEIS_CONTRARRAZOES_PADRAO,
  DIAS_UTEIS_RAZOES_PADRAO,
  PRESSUPOSTOS_RECURSAIS,
  STATUS_RECURSO_DECIDIDOS,
  STATUS_RECURSO_PENDENTES,
  TAMANHO_MINIMO_FUNDAMENTACAO,
  TAMANHO_MINIMO_MOTIVACAO_INTENCAO,
  atoDeTerceiro,
  atoProprio,
  atrasosDoRecurso,
  desfechoDaFaseRecursal,
  estadoJanela,
  evolucaoPorPrazo,
  minutosDaJanela,
  motivoMinutosInvalidos,
  motivoNaoApresentaContrarrazoes,
  motivoNaoApresentaRazoes,
  motivoNaoRegistraIntencao,
  planejarInvalidacoes,
  prazoAutoridade,
  prazoContrarrazoes,
  prazoRazoes,
  situacaoDoAlvoProvido,
  situacaoRestaurada,
  situacoesDoAlvo,
  situacoesDoAtoProprio,
} from './regras-recursos';
import { faseDaJanelaRecursal, resultadoDeclarado, situacoesDeResultado } from '../modalidades-especiais/perfil-modalidade';
import { unidadesSemResultadoDeclaradoSql } from '../modalidades-especiais/resultado-declarado.sql';

/** Arquivo das razões/contrarrazões (PDF/JPG/PNG, até 10 MB — mesmo padrão da proposta adequada). */
export interface ArquivoRecurso {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export const TAMANHO_MAXIMO_ARQUIVO_RECURSO = 10 * 1024 * 1024;
const MIMES_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
const EXTENSOES_PERMITIDAS = ['.pdf', '.jpg', '.jpeg', '.png'];

/** Quem lê o painel (o controller decide pelo token). */
export type VisaoRecursos =
  | { tipo: 'ORGAO' }
  | { tipo: 'FORNECEDOR'; fornecedorId: string }
  | { tipo: 'PUBLICO' };

/** Ator da decisão com o nome para o registro. */
export interface AtorRecurso extends AtorTransicao {
  nome?: string | null;
}

const dataHora = (d: Date | string) =>
  new Date(d).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const ROTULO_ATO: Record<string, string> = {
  [AtoRecorrido.INABILITACAO]: 'contra a própria inabilitação',
  [AtoRecorrido.RECUSA_PROPOSTA]: 'contra a recusa da própria proposta',
  [AtoRecorrido.DESCLASSIFICACAO]: 'contra a desclassificação da própria proposta',
  [AtoRecorrido.HABILITACAO_TERCEIRO]: 'contra a habilitação de outro licitante',
  [AtoRecorrido.ACEITACAO_TERCEIRO]: 'contra a aceitação da proposta de outro licitante',
  [AtoRecorrido.OUTRO]: 'contra outro ato do julgamento/habilitação',
};

/**
 * ============================================================================
 * RECURSOS COM EFEITO (plano E5 — Lei 14.133/2021 arts. 165, 168; IN SEGES
 * 73/2022 art. 40). Regras puras e base legal: `regras-recursos.ts`.
 * ============================================================================
 *
 *  1. JANELA: o agente abre, depois do resultado da habilitação, o prazo de
 *     intenção (≥ 10 min). O LICITANTE manifesta a intenção pela sala (token),
 *     com motivação e o ato recorrido; fora da janela → 409 (preclusão).
 *  2. ADMISSIBILIDADE: o agente admite (abre as razões — 3 dias úteis; a
 *     licitação vai a RECURSO) ou não admite, só por falta evidente de
 *     pressuposto (motivo registrado).
 *  3. RAZÕES só do recorrente; CONTRARRAZÕES só dos demais licitantes, até 3
 *     dias úteis do FIM do prazo das razões; com arquivo; fora do prazo → 409.
 *  4. DECISÃO: o agente reconsidera (PROVIDO) ou mantém com fundamentação e
 *     encaminha à AUTORIDADE SUPERIOR, que decide em 10 dias úteis. Prazos do
 *     agente/autoridade são sinalizados quando vencidos, nunca decididos
 *     sozinhos.
 *  5. EFEITO: o provimento altera a situação dos licitantes (recorrente
 *     restaurado / alvo excluído) e invalida os atos insuscetíveis de
 *     aproveitamento (art. 165 §3º), com o registro em `efeitos`. Decididos
 *     todos, a fase recursal termina pelo ato próprio da máquina de estados
 *     (DECIDIR_RECURSOS, RETORNAR_HABILITACAO ou RETORNAR_JULGAMENTO + nova
 *     convocação para a aceitação). Enquanto pendentes, adjudicação e
 *     homologação ficam bloqueadas (efeito suspensivo — art. 168).
 */
@Injectable()
export class RecursosService {
  private readonly logger = new Logger(RecursosService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly parametrosService: ParametrosLicitacaoService,
    private readonly transicoes: TransicoesService,
    private readonly ranking: RankingService,
    private readonly aceitacao: AceitacaoService,
  ) {}

  // ==========================================================================
  // APOIO
  // ==========================================================================

  private async sessao(sessaoId: string, m: EntityManager = this.dataSource.manager): Promise<SessaoDisputa> {
    const s = await m.findOne(SessaoDisputa, { where: { id: sessaoId } });
    if (!s) throw new NotFoundException('Sessão não encontrada');
    return s;
  }

  private async prazosDoOrgao(licitacaoId: string, m: EntityManager = this.dataSource.manager) {
    const [l] = await m.query(`SELECT orgao_id FROM licitacoes WHERE id = $1`, [licitacaoId]);
    const p: any = await this.parametrosService.resolver(l?.orgao_id).catch(() => null);
    return {
      // Calendário de feriados do órgão da licitação (art. 183, III — E7a)
      cal: calendarioDoOrgao(l?.orgao_id ?? null),
      minutosIntencao: minutosDaJanela(p?.prazo_intencao_recurso_minutos),
      diasRazoes: Number(p?.prazo_recursal_dias_uteis) > 0 ? Number(p.prazo_recursal_dias_uteis) : DIAS_UTEIS_RAZOES_PADRAO,
      diasContrarrazoes:
        Number(p?.prazo_contrarrazoes_dias_uteis) > 0 ? Number(p.prazo_contrarrazoes_dias_uteis) : DIAS_UTEIS_CONTRARRAZOES_PADRAO,
    };
  }

  private async evento(
    m: EntityManager,
    e: {
      sessaoId: string;
      tipo: TipoEvento;
      descricao: string;
      fornecedorId?: string | null;
      usuario?: string | null;
      sistema?: boolean;
      itemId?: string | null;
      dados?: Record<string, any>;
    },
  ): Promise<void> {
    await m.save(
      m.create(EventoSessao, {
        sessao_id: e.sessaoId,
        tipo: e.tipo,
        descricao: e.descricao,
        item_id: e.itemId ?? undefined,
        fornecedor_id: e.fornecedorId ?? undefined,
        fornecedor_identificador: e.fornecedorId ?? undefined,
        usuario_nome: e.usuario ?? 'SISTEMA',
        is_sistema: e.sistema ?? !e.usuario,
        dados_adicionais: { ...(e.dados ?? {}), origem: 'recursos' },
      }),
    );
  }

  private async nomes(m: EntityManager, ids: string[]): Promise<Map<string, string>> {
    const validos = [...new Set(ids.filter(Boolean))];
    if (!validos.length) return new Map();
    const rows: any[] = await m.query(`SELECT id::text AS id, razao_social FROM fornecedores WHERE id::text = ANY($1)`, [validos]);
    return new Map(rows.map((r) => [r.id, r.razao_social]));
  }

  private async nomeFornecedor(m: EntityManager, id: string): Promise<string> {
    return (await this.nomes(m, [id])).get(id) ?? id;
  }

  /** Nome de quem pratica o ato (usuário do órgão ou o próprio órgão). */
  async nomeDoAtor(ator: AtorTransicao, m: EntityManager = this.dataSource.manager): Promise<string | null> {
    if (!ator.id) return null;
    if (ator.tipo === 'USUARIO') {
      const [u] = await m.query(`SELECT nome FROM usuarios WHERE id::text = $1`, [ator.id]);
      return u?.nome ?? null;
    }
    if (ator.tipo === 'ORGAO') {
      const [o] = await m.query(`SELECT nome FROM orgaos WHERE id::text = $1`, [ator.id]);
      return o?.nome ?? null;
    }
    return null;
  }

  /** Licitante da licitação: proposta enviada (inclusive desclassificada — pode recorrer). */
  async ehLicitante(licitacaoId: string, fornecedorId: string, m: EntityManager = this.dataSource.manager): Promise<boolean> {
    const r = await m.query(
      `SELECT 1 FROM propostas WHERE licitacao_id::text = $1 AND fornecedor_id::text = $2 AND status::text NOT IN ('RASCUNHO','CANCELADA') LIMIT 1`,
      [licitacaoId, fornecedorId],
    );
    return r.length > 0;
  }

  private async licitantes(m: EntityManager, licitacaoId: string): Promise<string[]> {
    const r: any[] = await m.query(
      `SELECT DISTINCT fornecedor_id::text AS id FROM propostas WHERE licitacao_id::text = $1 AND status::text NOT IN ('RASCUNHO','CANCELADA')`,
      [licitacaoId],
    );
    return r.map((x) => x.id);
  }

  private rotuloUnidade(u: Pick<UnidadeJulgamento, 'tipo' | 'numero'> | null | undefined): string {
    if (!u) return 'Licitação';
    return `${u.tipo === 'LOTE' ? 'Lote' : 'Item'} ${u.numero}`;
  }

  private async recursoTravado(m: EntityManager, recursoId: string): Promise<RecursoAdministrativo> {
    const r = await m.findOne(RecursoAdministrativo, { where: { id: recursoId }, lock: { mode: 'pessimistic_write' } });
    if (!r) throw new NotFoundException('Recurso não encontrado');
    return r;
  }

  private async atualizarEtapa(m: EntityManager, sessaoId: string, etapa: EtapaSessao): Promise<void> {
    await m.query(`UPDATE sessoes_disputa SET etapa = $2 WHERE id = $1`, [sessaoId, etapa]);
  }

  private validarArquivo(arquivo: ArquivoRecurso | null | undefined): void {
    if (!arquivo || !arquivo.buffer?.length) return;
    const ext = extname(arquivo.originalname || '').toLowerCase();
    if (!MIMES_PERMITIDOS.includes(arquivo.mimetype) || !EXTENSOES_PERMITIDAS.includes(ext)) {
      throw new BadRequestException('Tipo de arquivo não permitido. Use PDF, JPG ou PNG.');
    }
    if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO_RECURSO) throw new BadRequestException('Arquivo acima de 10 MB');
  }

  private metaArquivo(arquivo: ArquivoRecurso, padrao: string) {
    const ext = extname(arquivo.originalname || '').toLowerCase();
    return {
      nome: (arquivo.originalname || `${padrao}${ext}`).replace(/[^\w.\- ()À-ú]/g, '_').slice(0, 200),
      mime: arquivo.mimetype,
      tamanho: arquivo.size,
      sha256: createHash('sha256').update(arquivo.buffer).digest('hex'),
      conteudo: arquivo.buffer,
    };
  }

  // ==========================================================================
  // PRAZOS DAS PARTES (lazy: toda leitura e todo ato)
  // ==========================================================================

  /**
   * Aplica o decurso dos prazos das partes na licitação: razões não
   * apresentadas → NAO_CONHECIDO; contrarrazões encerradas → EM_ANALISE (abre
   * os 3 dias úteis da reconsideração). Se nada mais ficar pendente, conclui a
   * fase recursal. Devolve quantos recursos mudaram.
   */
  async atualizarPorPrazo(licitacaoId: string, agora = new Date()): Promise<number> {
    const candidatos = await this.dataSource.manager.find(RecursoAdministrativo, {
      where: { licitacao_id: licitacaoId, status: In([StatusRecurso.AGUARDANDO_RAZOES, StatusRecurso.CONTRARRAZOES, StatusRecurso.RAZOES_APRESENTADAS]) },
    });
    let mudaram = 0;
    let sessaoId: string | null = null;
    const cal = candidatos.length ? (await this.prazosDoOrgao(licitacaoId)).cal : undefined;
    for (const c of candidatos) {
      if (!evolucaoPorPrazo(c, agora, cal)) continue;
      await this.dataSource.transaction(async (m) => {
        const r = await this.recursoTravado(m, c.id);
        const ev = evolucaoPorPrazo(r, agora, cal);
        if (!ev) return;
        r.status = ev.status;
        if (ev.status === StatusRecurso.NAO_CONHECIDO) {
          r.motivo_nao_conhecimento = ev.motivo ?? null;
          r.data_decisao = agora;
          r.instancia_decisao = 'AGENTE';
          r.decidido_por = 'Sistema (decurso do prazo)';
        }
        if (ev.prazo_reconsideracao) r.prazo_reconsideracao = ev.prazo_reconsideracao;
        await m.save(r);
        const nome = await this.nomeFornecedor(m, r.fornecedor_id);
        await this.evento(m, {
          sessaoId: r.sessao_id,
          tipo: TipoEvento.MENSAGEM_SISTEMA,
          descricao:
            ev.status === StatusRecurso.NAO_CONHECIDO
              ? `Recurso de ${nome} NÃO CONHECIDO: ${ev.motivo}`
              : `Recurso de ${nome}: encerrado o prazo de contrarrazões. O agente de contratação tem até ${dataHora(r.prazo_reconsideracao!)} para reconsiderar ou manter a decisão (art. 165 §2º).`,
          fornecedorId: r.fornecedor_id,
          dados: { recurso_id: r.id, ato: ev.status === StatusRecurso.NAO_CONHECIDO ? 'RECURSO_DESERTO' : 'PRAZO_CONTRARRAZOES_ENCERRADO' },
        });
        mudaram++;
        sessaoId = r.sessao_id;
      });
    }
    if (mudaram && sessaoId) {
      await this.concluirSePossivel(licitacaoId, sessaoId, { tipo: 'SISTEMA', id: 'recursos-prazo' }).catch((e) =>
        this.logger.warn(`Conclusão da fase recursal adiada (${licitacaoId}): ${e?.message ?? e}`),
      );
    }
    return mudaram;
  }

  // ==========================================================================
  // LEITURA (órgão dono / licitante / público)
  // ==========================================================================

  /**
   * Painel de recursos da sessão:
   *  - ÓRGÃO dono: tudo (inclusive intenções a admitir, prazos e atrasos);
   *  - LICITANTE: tudo que é do processo (intenções, razões, contrarrazões,
   *    decisões — publicidade entre os licitantes, art. 165 §5º) + os atos de
   *    que pode recorrer e o que pode fazer em cada recurso;
   *  - PÚBLICO (anônimo, outro órgão): só os recursos JÁ DECIDIDOS (como a ata).
   */
  async painel(sessaoId: string, visao: VisaoRecursos, agora = new Date()) {
    const sessao = await this.sessao(sessaoId);
    const licitacaoId = sessao.licitacao_id;
    if (visao.tipo !== 'PUBLICO') await this.atualizarPorPrazo(licitacaoId, agora).catch(() => 0);
    const m = this.dataSource.manager;
    const [lic] = await m.query(`SELECT fase::text AS fase, situacao::text AS situacao FROM licitacoes WHERE id = $1`, [licitacaoId]);
    const janelas = await m.find(JanelaIntencaoRecurso, { where: { sessao_id: sessaoId }, order: { aberta_em: 'ASC' } });
    const janelaAtual = [...janelas].reverse().find((j) => !j.superada_em) ?? null;
    let recursos = await m.find(RecursoAdministrativo, { where: { sessao_id: sessaoId }, order: { created_at: 'ASC' } });
    if (visao.tipo === 'PUBLICO') recursos = recursos.filter((r) => STATUS_RECURSO_DECIDIDOS.includes(r.status));
    const contrarrazoes = recursos.length
      ? await m.find(ContrarrazaoRecurso, { where: { recurso_id: In(recursos.map((r) => r.id)) }, order: { apresentada_em: 'ASC' } })
      : [];
    const unidades = await this.ranking.unidades(licitacaoId);
    const nomes = await this.nomes(m, [
      ...recursos.flatMap((r) => [r.fornecedor_id, r.fornecedor_alvo_id ?? '']),
      ...contrarrazoes.map((c) => c.fornecedor_id),
    ]);
    const prazos = await this.prazosDoOrgao(licitacaoId);

    const visaoRecurso = (r: RecursoAdministrativo) => {
      const u = r.item_id ? unidades.find((x) => x.id === r.item_id) : null;
      const cs = contrarrazoes.filter((c) => c.recurso_id === r.id);
      const atrasos = atrasosDoRecurso(r, agora);
      const base: Record<string, any> = {
        id: r.id,
        status: r.status,
        atoRecorrido: r.ato_recorrido ?? AtoRecorrido.OUTRO,
        atoRecorridoRotulo: ROTULO_ATO[r.ato_recorrido ?? AtoRecorrido.OUTRO],
        recorrente: { id: r.fornecedor_id, nome: nomes.get(r.fornecedor_id) ?? r.fornecedor_nome ?? r.fornecedor_id },
        alvo: r.fornecedor_alvo_id ? { id: r.fornecedor_alvo_id, nome: nomes.get(r.fornecedor_alvo_id) ?? r.fornecedor_alvo_id } : null,
        unidade: u ? { id: u.id, tipo: u.tipo, rotulo: this.rotuloUnidade(u) } : null,
        motivacao: r.motivacao_intencao,
        dataIntencao: r.data_intencao,
        intencaoAdmitida: r.intencao_aceita,
        intencaoDecididaEm: r.intencao_decidida_em,
        motivoNaoAdmissao: r.motivo_recusa_intencao,
        pressupostoAusente: r.pressuposto_ausente,
        motivoNaoConhecimento: r.motivo_nao_conhecimento,
        razoes: r.razoes,
        dataRazoes: r.data_razoes,
        prazoRazoes: r.prazo_razoes,
        razoesArquivo: r.razoes_arquivo_nome
          ? { nome: r.razoes_arquivo_nome, mime: r.razoes_arquivo_mime, tamanho: r.razoes_arquivo_tamanho, sha256: r.razoes_arquivo_sha256 }
          : null,
        prazoContrarrazoes: r.prazo_contrarrazoes,
        contrarrazoes: cs.map((c) => ({
          id: c.id,
          fornecedorId: c.fornecedor_id,
          nome: nomes.get(c.fornecedor_id) ?? c.fornecedor_nome ?? c.fornecedor_id,
          texto: c.texto,
          apresentadaEm: c.apresentada_em,
          arquivo: c.arquivo_nome ? { nome: c.arquivo_nome, mime: c.arquivo_mime, tamanho: c.arquivo_tamanho, sha256: c.arquivo_sha256 } : null,
        })),
        prazoReconsideracao: r.prazo_reconsideracao,
        reconsideracao: r.reconsideracao
          ? {
              resultado: r.reconsideracao,
              fundamentacao: r.reconsideracao_fundamentacao,
              em: r.reconsideracao_em,
              por: r.reconsideracao_por_nome,
            }
          : null,
        encaminhadoEm: r.encaminhado_em,
        prazoDecisaoAutoridade: r.prazo_decisao_autoridade,
        decisao: r.decisao,
        decididoPor: r.decidido_por,
        decididoPorCargo: r.decidido_por_cargo,
        instanciaDecisao: r.instancia_decisao,
        dataDecisao: r.data_decisao,
        efeitos: r.efeitos,
        reconsideracaoAtrasada: atrasos.reconsideracaoAtrasada,
        autoridadeAtrasada: atrasos.autoridadeAtrasada,
      };
      if (visao.tipo === 'FORNECEDOR') {
        base.souRecorrente = r.fornecedor_id === visao.fornecedorId;
        base.podeApresentarRazoes = !motivoNaoApresentaRazoes(r, visao.fornecedorId, agora);
        base.podeContrarrazoar =
          !motivoNaoApresentaContrarrazoes(r, visao.fornecedorId, agora) && !cs.some((c) => c.fornecedor_id === visao.fornecedorId);
        base.minhaContrarrazao = cs.find((c) => c.fornecedor_id === visao.fornecedorId)?.id ?? null;
      }
      if (visao.tipo === 'ORGAO') {
        base.podeAdmitir = r.status === StatusRecurso.INTENCAO;
        base.podeReconsiderar = r.status === StatusRecurso.EM_ANALISE;
        base.podeDecidirAutoridade = r.status === StatusRecurso.AGUARDANDO_AUTORIDADE;
      }
      return base;
    };

    const janelaVisao = (j: JanelaIntencaoRecurso) => ({
      id: j.id,
      abertaEm: j.aberta_em,
      fechaEm: j.fecha_em,
      minutos: j.minutos,
      estado: estadoJanela(j, agora),
      segundosRestantes: Math.max(0, Math.floor((new Date(j.fecha_em).getTime() - agora.getTime()) / 1000)),
      abertaPor: visao.tipo === 'ORGAO' ? j.aberta_por_nome : undefined,
      superadaEm: j.superada_em,
      superadaMotivo: j.superada_motivo,
    });

    const saida: Record<string, any> = {
      sessaoId,
      licitacaoId,
      faseLicitacao: lic?.fase ?? null,
      situacaoLicitacao: lic?.situacao ?? null,
      etapa: sessao.etapa,
      prazos,
      janela: janelaAtual ? janelaVisao(janelaAtual) : null,
      janelas: visao.tipo === 'PUBLICO' ? undefined : janelas.map(janelaVisao),
      pendentes: recursos.filter((r) => STATUS_RECURSO_PENDENTES.includes(r.status)).length,
      recursos: recursos.map(visaoRecurso),
    };
    if (visao.tipo === 'ORGAO') {
      const bloqueio = await this.motivoNaoAbreJanela(licitacaoId, sessaoId, agora).catch((e) => e?.message ?? 'Indisponível');
      saida.podeAbrirJanela = !bloqueio;
      saida.motivoNaoAbreJanela = bloqueio;
    }
    if (visao.tipo === 'FORNECEDOR') {
      saida.podeManifestarIntencao = !motivoNaoRegistraIntencao(janelaAtual, agora);
      saida.atosRecorriveis = await this.atosRecorriveis(licitacaoId, visao.fornecedorId);
    }
    return saida;
  }

  /**
   * Atos de que o licitante pode recorrer agora: os próprios (inabilitação,
   * recusa, desclassificação) e os de outros licitantes (habilitação,
   * aceitação), além de "outro".
   */
  async atosRecorriveis(licitacaoId: string, fornecedorId: string, m: EntityManager = this.dataSource.manager) {
    const rows: any[] = await m.query(
      `SELECT unidade_id::text AS unidade_id, fornecedor_id, situacao FROM licitantes_unidade WHERE licitacao_id = $1`,
      [licitacaoId],
    );
    const unidades = await this.ranking.unidades(licitacaoId, m);
    const rot = (id: string) => this.rotuloUnidade(unidades.find((u) => u.id === id));
    const nomes = await this.nomes(m, rows.map((r) => r.fornecedor_id));
    const atos: Array<{ ato: string; rotulo: string; unidadeId: string | null; fornecedorAlvoId: string | null }> = [];
    const meus = rows.filter((r) => r.fornecedor_id === fornecedorId);
    if (meus.some((r) => r.situacao === SituacaoLicitante.INABILITADO)) {
      atos.push({ ato: AtoRecorrido.INABILITACAO, rotulo: 'Minha inabilitação', unidadeId: null, fornecedorAlvoId: null });
    }
    for (const r of meus.filter((x) => x.situacao === SituacaoLicitante.RECUSADO)) {
      atos.push({ ato: AtoRecorrido.RECUSA_PROPOSTA, rotulo: `Recusa da minha proposta — ${rot(r.unidade_id)}`, unidadeId: r.unidade_id, fornecedorAlvoId: null });
    }
    for (const r of meus.filter((x) => x.situacao === SituacaoLicitante.DESCLASSIFICADO)) {
      atos.push({ ato: AtoRecorrido.DESCLASSIFICACAO, rotulo: `Desclassificação da minha proposta — ${rot(r.unidade_id)}`, unidadeId: r.unidade_id, fornecedorAlvoId: null });
    }
    const outros = rows.filter((r) => r.fornecedor_id !== fornecedorId);
    const habilitados = [...new Set(outros.filter((r) => situacoesDoAlvo(AtoRecorrido.HABILITACAO_TERCEIRO).includes(r.situacao)).map((r) => r.fornecedor_id))];
    for (const f of habilitados) {
      atos.push({ ato: AtoRecorrido.HABILITACAO_TERCEIRO, rotulo: `Habilitação de ${nomes.get(f) ?? f}`, unidadeId: null, fornecedorAlvoId: f });
    }
    for (const r of outros.filter((x) => situacoesDoAlvo(AtoRecorrido.ACEITACAO_TERCEIRO).includes(x.situacao))) {
      atos.push({
        ato: AtoRecorrido.ACEITACAO_TERCEIRO,
        rotulo: `Aceitação da proposta de ${nomes.get(r.fornecedor_id) ?? r.fornecedor_id} — ${rot(r.unidade_id)}`,
        unidadeId: r.unidade_id,
        fornecedorAlvoId: r.fornecedor_id,
      });
    }
    atos.push({ ato: AtoRecorrido.OUTRO, rotulo: 'Outro ato do julgamento/habilitação', unidadeId: null, fornecedorAlvoId: null });
    return atos;
  }

  async buscar(id: string): Promise<RecursoAdministrativo> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))) {
      throw new NotFoundException('Recurso não encontrado');
    }
    const r = await this.dataSource.manager.findOne(RecursoAdministrativo, { where: { id } });
    if (!r) throw new NotFoundException('Recurso não encontrado');
    return r;
  }

  // ==========================================================================
  // 1. JANELA DE INTENÇÃO (agente) E INTENÇÃO (licitante)
  // ==========================================================================

  /** Por que a janela não pode ser aberta agora (null = pode). */
  async motivoNaoAbreJanela(licitacaoId: string, sessaoId: string, agora = new Date()): Promise<string | null> {
    const m = this.dataSource.manager;
    const [lic] = await m.query(`SELECT fase::text AS fase, situacao::text AS situacao, modalidade::text AS modalidade FROM licitacoes WHERE id = $1`, [licitacaoId]);
    if (!lic) return 'Licitação não encontrada';
    // Leilão/concurso (E7c): sem habilitação — a fase recursal vem logo após o resultado declarado no JULGAMENTO
    const faseEsperada = faseDaJanelaRecursal(lic.modalidade);
    if (lic.fase !== faseEsperada) {
      return faseEsperada === FaseLicitacao.JULGAMENTO
        ? `A intenção de recurso é manifestada após o resultado declarado no julgamento (art. 165 §1º I; art. 31 §4º); a licitação está em ${lic.fase}.`
        : `A intenção de recurso é manifestada após o resultado da habilitação (fase única — art. 165 §1º II); a licitação está em ${lic.fase}.`;
    }
    const situacoesOk = situacoesDeResultado(lic.modalidade);
    const aberta = (await m.find(JanelaIntencaoRecurso, { where: { sessao_id: sessaoId } })).find((j) => estadoJanela(j, agora) === 'ABERTA');
    if (aberta) return `Já há janela de intenção aberta até ${dataHora(aberta.fecha_em)}.`;
    const pend = await m.count(RecursoAdministrativo, { where: { licitacao_id: licitacaoId, status: In([...STATUS_RECURSO_PENDENTES]) } });
    if (pend) return 'Há recursos/intenções pendentes de decisão nesta licitação.';
    const semResultado: string[] = [];
    for (const u of await this.ranking.unidades(licitacaoId)) {
      if (!u.encerrada || !RankingService.unidadeComResultadoPossivel(u)) continue;
      const ranking = await this.ranking.ranking(u);
      if (!ranking.length) continue;
      const atual = atualDaUnidade(ranking);
      if (!atual || !situacoesOk.includes(atual.situacao)) semResultado.push(this.rotuloUnidade(u));
    }
    if (semResultado.length) {
      return resultadoDeclarado(lic.modalidade)
        ? `Declare o resultado de todas as unidades antes de abrir o prazo recursal: ${semResultado.join(', ')}.`
        : `O resultado da habilitação ainda não está completo (licitante na vez não habilitado): ${semResultado.join(', ')}.`;
    }
    return null;
  }

  /**
   * Agente abre a janela de intenção de recurso (IN 73 art. 40: mínimo de 10
   * min; parâmetro do órgão). A sala vai à etapa INTENCAO_RECURSO.
   */
  async abrirJanela(sessaoId: string, opts: { minutos?: number | null }, ator: AtorRecurso) {
    const sessao = await this.sessao(sessaoId);
    const prazos = await this.prazosDoOrgao(sessao.licitacao_id);
    const invalido = motivoMinutosInvalidos(opts.minutos, prazos.minutosIntencao);
    if (invalido) throw new BadRequestException(invalido);
    const minutos = minutosDaJanela(prazos.minutosIntencao, opts.minutos);
    const agora = new Date();
    const janela = await this.dataSource.transaction(async (m) => {
      await exigirLicitacaoAtiva(m, sessao.licitacao_id, { bloquear: true });
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`recursos:${sessao.licitacao_id}`]);
      const bloqueio = await this.motivoNaoAbreJanela(sessao.licitacao_id, sessaoId, agora);
      if (bloqueio) throw new ConflictException(bloqueio);
      const j = await m.save(
        m.create(JanelaIntencaoRecurso, {
          sessao_id: sessaoId,
          licitacao_id: sessao.licitacao_id,
          aberta_em: agora,
          fecha_em: new Date(agora.getTime() + minutos * 60_000),
          minutos,
          aberta_por_tipo: ator.tipo,
          aberta_por_id: ator.id,
          aberta_por_nome: ator.nome ?? null,
          origem: 'SALA',
        }),
      );
      await this.atualizarEtapa(m, sessaoId, EtapaSessao.INTENCAO_RECURSO);
      await this.evento(m, {
        sessaoId,
        tipo: TipoEvento.PRAZO_RECURSAL_INICIADO,
        descricao:
          `Aberto o prazo de ${minutos} minutos, até ${dataHora(j.fecha_em)}, para os licitantes manifestarem, ` +
          `motivadamente, a intenção de recorrer do julgamento e da habilitação, sob pena de preclusão ` +
          `(Lei 14.133/2021, art. 165 §1º I; IN SEGES 73/2022, art. 40).`,
        usuario: ator.nome ?? 'Agente de contratação',
        sistema: false,
        dados: { janela_id: j.id, fecha_em: j.fecha_em, minutos, visibilidade: 'PUBLICA' },
      });
      return j;
    });
    return { id: janela.id, abertaEm: janela.aberta_em, fechaEm: janela.fecha_em, minutos: janela.minutos, estado: 'ABERTA' };
  }

  /** Licitante manifesta a intenção de recurso (próprio token), dentro da janela. */
  async registrarIntencao(
    sessaoId: string,
    fornecedorId: string,
    dados: { motivacao?: string; atoRecorrido?: string; fornecedorAlvoId?: string | null; unidadeId?: string | null },
  ) {
    const sessao = await this.sessao(sessaoId);
    const motivacao = (dados.motivacao ?? '').trim();
    if (motivacao.length < TAMANHO_MINIMO_MOTIVACAO_INTENCAO) {
      throw new BadRequestException(`Informe, em síntese, a motivação da intenção de recurso (mín. ${TAMANHO_MINIMO_MOTIVACAO_INTENCAO} caracteres — art. 165 §1º I).`);
    }
    if (motivacao.length > 2000) throw new BadRequestException('Motivação acima de 2.000 caracteres (as razões vêm depois, no prazo próprio).');
    const ato = dados.atoRecorrido || AtoRecorrido.OUTRO;
    if (!(Object.values(AtoRecorrido) as string[]).includes(ato)) throw new BadRequestException('Ato recorrido inválido');
    const agora = new Date();

    const r = await this.dataSource.transaction(async (m) => {
      await exigirLicitacaoAtiva(m, sessao.licitacao_id, { bloquear: true });
      if (!(await this.ehLicitante(sessao.licitacao_id, fornecedorId, m))) {
        throw new ForbiddenException('Apenas licitantes desta licitação manifestam intenção de recurso');
      }
      const janelas = await m.find(JanelaIntencaoRecurso, { where: { sessao_id: sessaoId }, order: { aberta_em: 'DESC' } });
      const janela = janelas.find((j) => !j.superada_em) ?? null;
      const preclusao = motivoNaoRegistraIntencao(janela, agora);
      if (preclusao) throw new ConflictException(preclusao);

      // O ato indicado precisa existir para o licitante (próprio ou de terceiro)
      let unidadeId: string | null = dados.unidadeId || null;
      const alvoId: string | null = atoDeTerceiro(ato) ? dados.fornecedorAlvoId || null : null;
      if (ato !== AtoRecorrido.OUTRO) {
        const recorriveis = await this.atosRecorriveis(sessao.licitacao_id, fornecedorId, m);
        const casa = recorriveis.find(
          (a) => a.ato === ato && (a.fornecedorAlvoId ?? null) === alvoId && (!unidadeId || !a.unidadeId || a.unidadeId === unidadeId),
        );
        if (!casa) {
          throw new BadRequestException(
            atoDeTerceiro(ato)
              ? 'O licitante indicado não tem esse ato (habilitação/aceitação) a recorrer.'
              : 'Você não tem esse ato (inabilitação/recusa/desclassificação) a recorrer.',
          );
        }
        if (!unidadeId && casa.unidadeId && ato !== AtoRecorrido.INABILITACAO && ato !== AtoRecorrido.HABILITACAO_TERCEIRO) unidadeId = casa.unidadeId;
      }
      let tipoUnidade: string | null = null;
      if (unidadeId) {
        const u = await this.ranking.unidade(unidadeId, m);
        if (!u || u.licitacaoId !== sessao.licitacao_id) throw new BadRequestException('Unidade não pertence a esta licitação');
        unidadeId = u.id;
        tipoUnidade = u.tipo;
      }
      const duplicada = await m.findOne(RecursoAdministrativo, {
        where: { janela_id: janela!.id, fornecedor_id: fornecedorId, ato_recorrido: ato, ...(alvoId ? { fornecedor_alvo_id: alvoId } : {}), ...(unidadeId ? { item_id: unidadeId } : {}) },
      });
      if (duplicada) throw new ConflictException('Intenção já manifestada para este ato nesta janela.');

      const nome = await this.nomeFornecedor(m, fornecedorId);
      const salvo = await m.save(
        m.create(RecursoAdministrativo, {
          sessao_id: sessaoId,
          licitacao_id: sessao.licitacao_id,
          item_id: unidadeId as any,
          tipo_unidade: tipoUnidade,
          fornecedor_id: fornecedorId,
          fornecedor_nome: nome,
          fornecedor_alvo_id: alvoId,
          ato_recorrido: ato,
          janela_id: janela!.id,
          motivacao_intencao: motivacao,
          data_intencao: agora,
          status: StatusRecurso.INTENCAO,
          origem: 'SALA',
        }),
      );
      await this.evento(m, {
        sessaoId,
        tipo: TipoEvento.INTENCAO_RECURSO_REGISTRADA,
        descricao: `${nome} manifestou intenção de recurso ${ROTULO_ATO[ato]}. Motivação: ${motivacao}`,
        fornecedorId,
        usuario: nome,
        sistema: false,
        itemId: tipoUnidade === 'ITEM' ? unidadeId : null,
        dados: { recurso_id: salvo.id, ato_recorrido: ato, fornecedor_alvo_id: alvoId, motivacao },
      });
      return salvo;
    });
    return { id: r.id, status: r.status, atoRecorrido: r.ato_recorrido, dataIntencao: r.data_intencao };
  }

  // ==========================================================================
  // 2. ADMISSIBILIDADE (agente)
  // ==========================================================================

  /** Agente admite a intenção: abre as razões (3 dias úteis) e a licitação vai a RECURSO. */
  async admitir(recursoId: string, ator: AtorRecurso) {
    const pre = await this.buscar(recursoId);
    const prazos = await this.prazosDoOrgao(pre.licitacao_id);
    const agora = new Date();
    const r = await this.dataSource.transaction(async (m) => {
      await exigirLicitacaoAtiva(m, pre.licitacao_id, { bloquear: true });
      const r = await this.recursoTravado(m, recursoId);
      if (r.status !== StatusRecurso.INTENCAO) throw new ConflictException('A intenção deste recurso já foi apreciada.');
      r.status = StatusRecurso.AGUARDANDO_RAZOES;
      r.intencao_aceita = true;
      r.intencao_decidida_em = agora;
      r.intencao_decidida_por_tipo = ator.tipo;
      r.intencao_decidida_por_id = ator.id;
      r.prazo_razoes = prazoRazoes(agora, prazos.diasRazoes, prazos.cal);
      await m.save(r);
      // Prazo recursal: licitação → RECURSO (idempotente para a 2ª intenção admitida)
      await this.transicoes.executar(r.licitacao_id, AtoLicitacao.ABRIR_PRAZO_RECURSAL, {
        ator,
        manager: m,
        ignorarSeJaAplicado: true,
        registro: { origem: 'recursos', sessao_id: r.sessao_id, recurso_id: r.id, recorrente: r.fornecedor_id },
      });
      await this.atualizarEtapa(m, r.sessao_id, EtapaSessao.PRAZO_RECURSAL);
      await this.evento(m, {
        sessaoId: r.sessao_id,
        tipo: TipoEvento.INTENCAO_RECURSO_ACEITA,
        descricao:
          `Intenção de recurso de ${r.fornecedor_nome ?? r.fornecedor_id} ADMITIDA. Razões até ${dataHora(r.prazo_razoes)} ` +
          `(${prazos.diasRazoes} dias úteis — art. 165 I); contrarrazões dos demais licitantes nos ${prazos.diasContrarrazoes} dias úteis seguintes (IN SEGES 73/2022, art. 40 §2º).`,
        fornecedorId: r.fornecedor_id,
        usuario: ator.nome ?? 'Agente de contratação',
        sistema: false,
        dados: { recurso_id: r.id, prazo_razoes: r.prazo_razoes },
      });
      return r;
    });
    return { id: r.id, status: r.status, prazoRazoes: r.prazo_razoes };
  }

  /** Não admite a intenção — só por falta EVIDENTE de pressuposto, com motivo. */
  async recusar(recursoId: string, dados: { pressuposto?: string; motivo?: string }, ator: AtorRecurso) {
    const motivo = (dados.motivo ?? '').trim();
    const pressuposto = String(dados.pressuposto ?? '').toUpperCase();
    if (!(PRESSUPOSTOS_RECURSAIS as readonly string[]).includes(pressuposto)) {
      throw new BadRequestException(`Indique o pressuposto recursal ausente: ${PRESSUPOSTOS_RECURSAIS.join(', ')}.`);
    }
    if (motivo.length < TAMANHO_MINIMO_FUNDAMENTACAO) {
      throw new BadRequestException(`Fundamente a não admissão (mín. ${TAMANHO_MINIMO_FUNDAMENTACAO} caracteres): só a falta evidente de pressuposto a justifica.`);
    }
    const pre = await this.buscar(recursoId);
    const r = await this.dataSource.transaction(async (m) => {
      await exigirLicitacaoAtiva(m, pre.licitacao_id, { bloquear: true });
      const r = await this.recursoTravado(m, recursoId);
      if (r.status !== StatusRecurso.INTENCAO) throw new ConflictException('A intenção deste recurso já foi apreciada.');
      r.status = StatusRecurso.NAO_CONHECIDO;
      r.intencao_aceita = false;
      r.motivo_recusa_intencao = motivo;
      r.pressuposto_ausente = pressuposto;
      r.intencao_decidida_em = new Date();
      r.intencao_decidida_por_tipo = ator.tipo;
      r.intencao_decidida_por_id = ator.id;
      r.data_decisao = r.intencao_decidida_em;
      r.instancia_decisao = 'AGENTE';
      r.decidido_por = ator.nome ?? null;
      r.decidido_por_tipo = ator.tipo;
      r.decidido_por_id = ator.id;
      await m.save(r);
      await this.evento(m, {
        sessaoId: r.sessao_id,
        tipo: TipoEvento.INTENCAO_RECURSO_RECUSADA,
        descricao: `Intenção de recurso de ${r.fornecedor_nome ?? r.fornecedor_id} NÃO ADMITIDA (ausência de ${pressuposto.toLowerCase()}). Motivo: ${motivo}`,
        fornecedorId: r.fornecedor_id,
        usuario: ator.nome ?? 'Agente de contratação',
        sistema: false,
        dados: { recurso_id: r.id, pressuposto, motivo },
      });
      return r;
    });
    await this.concluirSePossivel(r.licitacao_id, r.sessao_id, ator).catch((e) => this.logger.warn(e?.message ?? e));
    return { id: r.id, status: r.status };
  }

  // ==========================================================================
  // 3. RAZÕES E CONTRARRAZÕES (licitantes, pelo token)
  // ==========================================================================

  async apresentarRazoes(recursoId: string, fornecedorId: string, dados: { texto?: string; arquivo?: ArquivoRecurso | null }) {
    const texto = (dados.texto ?? '').trim();
    if (texto.length < TAMANHO_MINIMO_FUNDAMENTACAO) throw new BadRequestException(`As razões são obrigatórias (mín. ${TAMANHO_MINIMO_FUNDAMENTACAO} caracteres).`);
    this.validarArquivo(dados.arquivo);
    const pre = await this.buscar(recursoId);
    const prazos = await this.prazosDoOrgao(pre.licitacao_id);
    const agora = new Date();
    const r = await this.dataSource.transaction(async (m) => {
      await exigirLicitacaoAtiva(m, pre.licitacao_id, { bloquear: true });
      const r = await this.recursoTravado(m, recursoId);
      const erro = motivoNaoApresentaRazoes(r, fornecedorId, agora);
      if (erro) throw erro.status === 403 ? new ForbiddenException(erro.mensagem) : new ConflictException(erro.mensagem);
      r.razoes = texto;
      r.data_razoes = agora;
      r.status = StatusRecurso.CONTRARRAZOES;
      // Contrarrazões: 3 dias úteis do FIM do prazo das razões (IN 73 art. 40 §2º)
      r.prazo_contrarrazoes = prazoContrarrazoes(new Date(r.prazo_razoes), prazos.diasContrarrazoes, prazos.cal);
      if (dados.arquivo?.buffer?.length) {
        const a = this.metaArquivo(dados.arquivo, 'razoes');
        r.razoes_arquivo_nome = a.nome;
        r.razoes_arquivo_mime = a.mime;
        r.razoes_arquivo_tamanho = a.tamanho;
        r.razoes_arquivo_sha256 = a.sha256;
        r.razoes_arquivo_conteudo = a.conteudo;
      }
      await m.save(r);
      await this.evento(m, {
        sessaoId: r.sessao_id,
        tipo: TipoEvento.RECURSO_REGISTRADO,
        descricao:
          `Razões do recurso apresentadas por ${r.fornecedor_nome ?? r.fornecedor_id}` +
          (r.razoes_arquivo_nome ? ` (arquivo ${r.razoes_arquivo_nome}, SHA-256 ${r.razoes_arquivo_sha256!.slice(0, 12)}…)` : '') +
          `. Os demais licitantes podem apresentar contrarrazões até ${dataHora(r.prazo_contrarrazoes)} (IN SEGES 73/2022, art. 40 §2º).`,
        fornecedorId: r.fornecedor_id,
        usuario: r.fornecedor_nome ?? r.fornecedor_id,
        sistema: false,
        dados: { recurso_id: r.id, prazo_contrarrazoes: r.prazo_contrarrazoes },
      });
      return r;
    });
    return { id: r.id, status: r.status, dataRazoes: r.data_razoes, prazoContrarrazoes: r.prazo_contrarrazoes };
  }

  async apresentarContrarrazoes(recursoId: string, fornecedorId: string, dados: { texto?: string; arquivo?: ArquivoRecurso | null }) {
    const texto = (dados.texto ?? '').trim();
    if (texto.length < TAMANHO_MINIMO_FUNDAMENTACAO) throw new BadRequestException(`As contrarrazões são obrigatórias (mín. ${TAMANHO_MINIMO_FUNDAMENTACAO} caracteres).`);
    this.validarArquivo(dados.arquivo);
    const pre = await this.buscar(recursoId);
    const agora = new Date();
    const c = await this.dataSource.transaction(async (m) => {
      await exigirLicitacaoAtiva(m, pre.licitacao_id, { bloquear: true });
      if (!(await this.ehLicitante(pre.licitacao_id, fornecedorId, m))) {
        throw new ForbiddenException('Apenas licitantes desta licitação apresentam contrarrazões');
      }
      const r = await this.recursoTravado(m, recursoId);
      const erro = motivoNaoApresentaContrarrazoes(r, fornecedorId, agora);
      if (erro) throw erro.status === 403 ? new ForbiddenException(erro.mensagem) : new ConflictException(erro.mensagem);
      const ja = await m.findOne(ContrarrazaoRecurso, { where: { recurso_id: r.id, fornecedor_id: fornecedorId } });
      if (ja) throw new ConflictException('Você já apresentou contrarrazões a este recurso.');
      const nome = await this.nomeFornecedor(m, fornecedorId);
      const a = dados.arquivo?.buffer?.length ? this.metaArquivo(dados.arquivo, 'contrarrazoes') : null;
      const salvo = await m.save(
        m.create(ContrarrazaoRecurso, {
          recurso_id: r.id,
          licitacao_id: r.licitacao_id,
          fornecedor_id: fornecedorId,
          fornecedor_nome: nome,
          texto,
          arquivo_nome: a?.nome ?? null,
          arquivo_mime: a?.mime ?? null,
          arquivo_tamanho: a?.tamanho ?? null,
          arquivo_sha256: a?.sha256 ?? null,
          arquivo_conteudo: a?.conteudo ?? null,
          apresentada_em: agora,
          origem: 'SALA',
        }),
      );
      await this.evento(m, {
        sessaoId: r.sessao_id,
        tipo: TipoEvento.CONTRARRAZOES_REGISTRADAS,
        descricao:
          `Contrarrazões ao recurso de ${r.fornecedor_nome ?? r.fornecedor_id} apresentadas por ${nome}` +
          (a ? ` (arquivo ${a.nome}, SHA-256 ${a.sha256.slice(0, 12)}…).` : '.'),
        fornecedorId,
        usuario: nome,
        sistema: false,
        dados: { recurso_id: r.id, contrarrazao_id: salvo.id },
      });
      return salvo;
    });
    return { id: c.id, recursoId, apresentadaEm: c.apresentada_em };
  }

  /** Arquivo das razões (acesso decidido no controller: órgão dono ou licitante). */
  async arquivoRazoes(recursoId: string): Promise<{ nome: string; mime: string; conteudo: Buffer }> {
    const r = await this.dataSource.manager
      .createQueryBuilder(RecursoAdministrativo, 'r')
      .addSelect('r.razoes_arquivo_conteudo')
      .where('r.id = :id', { id: recursoId })
      .getOne();
    if (!r?.razoes_arquivo_conteudo) throw new NotFoundException('Arquivo das razões não encontrado');
    return { nome: r.razoes_arquivo_nome || 'razoes', mime: r.razoes_arquivo_mime || 'application/octet-stream', conteudo: r.razoes_arquivo_conteudo };
  }

  async arquivoContrarrazao(recursoId: string, contrarrazaoId: string): Promise<{ nome: string; mime: string; conteudo: Buffer }> {
    const c = await this.dataSource.manager
      .createQueryBuilder(ContrarrazaoRecurso, 'c')
      .addSelect('c.arquivo_conteudo')
      .where('c.id = :id AND c.recurso_id = :r', { id: contrarrazaoId, r: recursoId })
      .getOne();
    if (!c?.arquivo_conteudo) throw new NotFoundException('Arquivo das contrarrazões não encontrado');
    return { nome: c.arquivo_nome || 'contrarrazoes', mime: c.arquivo_mime || 'application/octet-stream', conteudo: c.arquivo_conteudo };
  }

  // ==========================================================================
  // 4. DECISÃO: reconsideração (agente) → autoridade superior
  // ==========================================================================

  /**
   * Juízo de reconsideração do agente (art. 165 §2º): RECONSIDERA (recurso
   * PROVIDO, com efeito) ou MANTÉM a decisão, com fundamentação, e encaminha
   * à autoridade superior (10 dias úteis).
   */
  async reconsiderar(recursoId: string, dados: { reconsiderar?: boolean; fundamentacao?: string }, ator: AtorRecurso) {
    const fundamentacao = (dados.fundamentacao ?? '').trim();
    if (typeof dados.reconsiderar !== 'boolean') throw new BadRequestException('Informe se reconsidera (true) ou mantém (false) a decisão.');
    if (fundamentacao.length < TAMANHO_MINIMO_FUNDAMENTACAO) {
      throw new BadRequestException(`A fundamentação é obrigatória (mín. ${TAMANHO_MINIMO_FUNDAMENTACAO} caracteres — art. 165 §2º).`);
    }
    const pre = await this.buscar(recursoId);
    await this.atualizarPorPrazo(pre.licitacao_id);
    const agora = new Date();
    const r = await this.dataSource.transaction(async (m) => {
      await exigirLicitacaoAtiva(m, pre.licitacao_id, { bloquear: true });
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`recursos:${pre.licitacao_id}`]);
      const r = await this.recursoTravado(m, recursoId);
      if (r.status === StatusRecurso.CONTRARRAZOES || r.status === StatusRecurso.AGUARDANDO_RAZOES) {
        throw new ConflictException(
          `Prazo das partes em curso (razões até ${r.prazo_razoes ? dataHora(r.prazo_razoes) : '—'}; contrarrazões até ${r.prazo_contrarrazoes ? dataHora(r.prazo_contrarrazoes) : '—'}): o agente decide depois do contraditório.`,
        );
      }
      if (r.status !== StatusRecurso.EM_ANALISE) throw new ConflictException('Este recurso não está aguardando a reconsideração do agente.');
      r.reconsideracao = dados.reconsiderar ? 'RECONSIDERADO' : 'MANTIDO';
      r.reconsideracao_fundamentacao = fundamentacao;
      r.reconsideracao_em = agora;
      r.reconsideracao_por_tipo = ator.tipo;
      r.reconsideracao_por_id = ator.id;
      r.reconsideracao_por_nome = ator.nome ?? null;
      if (dados.reconsiderar) {
        r.status = StatusRecurso.PROVIDO;
        r.decisao = fundamentacao;
        r.decidido_por = ator.nome ?? null;
        r.decidido_por_cargo = 'Agente de contratação (reconsideração — art. 165 §2º)';
        r.decidido_por_tipo = ator.tipo;
        r.decidido_por_id = ator.id;
        r.instancia_decisao = 'AGENTE';
        r.data_decisao = agora;
        r.efeitos = await this.aplicarEfeito(m, r, ator);
        await m.save(r);
        await this.evento(m, {
          sessaoId: r.sessao_id,
          tipo: TipoEvento.RECURSO_PROVIDO,
          descricao:
            `Recurso de ${r.fornecedor_nome ?? r.fornecedor_id} PROVIDO pelo agente de contratação em juízo de reconsideração (art. 165 §2º). ` +
            `Fundamentação: ${fundamentacao}. ${this.resumoEfeitos(r.efeitos)}`,
          fornecedorId: r.fornecedor_id,
          usuario: ator.nome ?? 'Agente de contratação',
          sistema: false,
          dados: { recurso_id: r.id, provido: true, instancia: 'AGENTE', efeitos: r.efeitos },
        });
      } else {
        r.status = StatusRecurso.AGUARDANDO_AUTORIDADE;
        r.encaminhado_em = agora;
        r.prazo_decisao_autoridade = prazoAutoridade(agora, (await this.prazosDoOrgao(r.licitacao_id, m)).cal);
        await m.save(r);
        await this.evento(m, {
          sessaoId: r.sessao_id,
          tipo: TipoEvento.MENSAGEM_SISTEMA,
          descricao:
            `Recurso de ${r.fornecedor_nome ?? r.fornecedor_id}: o agente de contratação MANTEVE a decisão (${fundamentacao}) e o encaminhou à ` +
            `autoridade superior, que decidirá até ${dataHora(r.prazo_decisao_autoridade)} (10 dias úteis — art. 165 §2º).`,
          fornecedorId: r.fornecedor_id,
          usuario: ator.nome ?? 'Agente de contratação',
          sistema: false,
          dados: { recurso_id: r.id, ato: 'RECONSIDERACAO_MANTIDA', prazo_decisao_autoridade: r.prazo_decisao_autoridade },
        });
      }
      return r;
    });
    if (r.status === StatusRecurso.PROVIDO) await this.concluirSePossivel(r.licitacao_id, r.sessao_id, ator);
    return this.resumo(r);
  }

  /**
   * Autoridade superior: conta do ÓRGÃO (ato próprio, com nome e cargo da
   * autoridade) ou usuário ADMIN do órgão — nunca o mesmo usuário que
   * praticou a reconsideração (segregação de funções, art. 7º §1º).
   */
  async exigirAutoridade(recurso: RecursoAdministrativo, ator: AtorTransicao & { role?: string | null; admin?: boolean }, m: EntityManager = this.dataSource.manager) {
    if (ator.admin || ator.tipo === 'ADMIN') throw new ForbiddenException('A decisão do recurso é da autoridade superior do órgão.');
    if (ator.tipo === 'USUARIO') {
      const [u] = await m.query(`SELECT role::text AS role FROM usuarios WHERE id::text = $1`, [ator.id]);
      if (u?.role !== 'ADMIN') {
        throw new ForbiddenException('Apenas a autoridade superior (conta do órgão ou usuário administrador do órgão) decide o recurso mantido pelo agente.');
      }
      if (recurso.reconsideracao_por_tipo === 'USUARIO' && recurso.reconsideracao_por_id === ator.id) {
        throw new ForbiddenException('Quem manteve a decisão (agente de contratação) não pode decidir o recurso como autoridade superior (art. 165 §2º).');
      }
    }
  }

  async decidirAutoridade(
    recursoId: string,
    dados: { provido?: boolean; fundamentacao?: string; nome?: string; cargo?: string },
    ator: AtorRecurso & { role?: string | null; admin?: boolean },
  ) {
    const fundamentacao = (dados.fundamentacao ?? '').trim();
    if (typeof dados.provido !== 'boolean') throw new BadRequestException('Informe se o recurso é provido (true) ou improvido (false).');
    if (fundamentacao.length < TAMANHO_MINIMO_FUNDAMENTACAO) {
      throw new BadRequestException(`A fundamentação da decisão é obrigatória (mín. ${TAMANHO_MINIMO_FUNDAMENTACAO} caracteres).`);
    }
    const nome = (dados.nome ?? '').trim() || (ator.tipo === 'USUARIO' ? ator.nome ?? '' : '');
    const cargo = (dados.cargo ?? '').trim();
    if (!nome || !cargo) throw new BadRequestException('Informe o nome e o cargo da autoridade superior que decide o recurso.');
    const pre = await this.buscar(recursoId);
    await this.exigirAutoridade(pre, ator);
    const agora = new Date();
    const r = await this.dataSource.transaction(async (m) => {
      await exigirLicitacaoAtiva(m, pre.licitacao_id, { bloquear: true });
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`recursos:${pre.licitacao_id}`]);
      const r = await this.recursoTravado(m, recursoId);
      if (r.status !== StatusRecurso.AGUARDANDO_AUTORIDADE) throw new ConflictException('Este recurso não está aguardando a decisão da autoridade superior.');
      r.status = dados.provido ? StatusRecurso.PROVIDO : StatusRecurso.IMPROVIDO;
      r.decisao = fundamentacao;
      r.decidido_por = nome;
      r.decidido_por_cargo = cargo;
      r.decidido_por_tipo = ator.tipo;
      r.decidido_por_id = ator.id;
      r.instancia_decisao = 'AUTORIDADE';
      r.data_decisao = agora;
      if (dados.provido) r.efeitos = await this.aplicarEfeito(m, r, ator);
      await m.save(r);
      await this.evento(m, {
        sessaoId: r.sessao_id,
        tipo: dados.provido ? TipoEvento.RECURSO_PROVIDO : TipoEvento.RECURSO_IMPROVIDO,
        descricao:
          `Recurso de ${r.fornecedor_nome ?? r.fornecedor_id} ${dados.provido ? 'PROVIDO' : 'IMPROVIDO'} pela autoridade superior ` +
          `(${nome}, ${cargo} — art. 165 §2º). Fundamentação: ${fundamentacao}.` +
          (dados.provido ? ` ${this.resumoEfeitos(r.efeitos)}` : ''),
        fornecedorId: r.fornecedor_id,
        usuario: nome,
        sistema: false,
        dados: { recurso_id: r.id, provido: dados.provido, instancia: 'AUTORIDADE', efeitos: r.efeitos ?? null },
      });
      return r;
    });
    await this.concluirSePossivel(r.licitacao_id, r.sessao_id, ator);
    return this.resumo(r);
  }

  private resumo(r: RecursoAdministrativo) {
    return {
      id: r.id,
      status: r.status,
      reconsideracao: r.reconsideracao,
      instanciaDecisao: r.instancia_decisao,
      prazoDecisaoAutoridade: r.prazo_decisao_autoridade,
      decisao: r.decisao,
      efeitos: r.efeitos,
    };
  }

  private resumoEfeitos(e: EfeitosRecurso | null | undefined): string {
    if (!e) return '';
    if (!e.automatico) return e.observacao ?? '';
    if (!e.alteracoes.length) return 'Sem alteração de situação a aplicar.';
    const partes = e.alteracoes.map((a) => `${a.rotulo}: ${a.fornecedor_id.slice(0, 8)}… ${a.de ?? '—'} → ${a.para}`);
    return `Efeitos (art. 165 §3º): ${partes.join('; ')}${e.aceitacoes_canceladas.length ? `; ${e.aceitacoes_canceladas.length} aceitação(ões) invalidada(s)` : ''}.`;
  }

  // ==========================================================================
  // 5. EFEITO DO PROVIMENTO (art. 165 §3º)
  // ==========================================================================

  /** Cancela as convocações/aceitações do licitante na unidade (atos invalidados). */
  private async invalidarAceitacoes(m: EntityManager, unidadeId: string, fornecedorId: string, motivo: string): Promise<string[]> {
    const rows: any[] = await m.query(
      `UPDATE aceitacoes_proposta SET status = $3, decidida_em = COALESCE(decidida_em, now()), decisao_motivo = $4, updated_at = now()
        WHERE unidade_id::text = $1 AND fornecedor_id::text = $2 AND status = ANY($5)
        RETURNING id::text AS id`,
      [unidadeId, fornecedorId, StatusAceitacao.CANCELADA, motivo, [StatusAceitacao.AGUARDANDO_ENVIO, StatusAceitacao.ENVIADA, StatusAceitacao.ACEITA]],
    );
    const lista = Array.isArray(rows?.[0]) ? rows[0] : rows;
    return (lista ?? []).map((r: any) => String(r.id));
  }

  /**
   * Aplica o efeito do provimento na mesma transação da decisão e devolve o
   * registro (o que foi restaurado, invalidado ou excluído, por unidade).
   */
  async aplicarEfeito(m: EntityManager, r: RecursoAdministrativo, ator: AtorTransicao): Promise<EfeitosRecurso> {
    const ato = r.ato_recorrido ?? AtoRecorrido.OUTRO;
    const efeitos: EfeitosRecurso = {
      automatico: true,
      aplicado_em: new Date().toISOString(),
      alteracoes: [],
      aceitacoes_canceladas: [],
      alterou_resultado: false,
    };
    if (ato === AtoRecorrido.OUTRO) {
      efeitos.automatico = false;
      efeitos.observacao =
        'Provimento sem efeito automático (ato recorrido não estruturado): o agente refaz pela sala os atos atingidos (art. 165 §3º).';
      return efeitos;
    }
    const motivoInvalidacao = `Ato invalidado pelo provimento do recurso ${r.id.slice(0, 8)} (art. 165 §3º, Lei 14.133/2021).`;
    const todas = await this.ranking.unidades(r.licitacao_id, m);
    const situacoes: any[] = await m.query(
      `SELECT unidade_id::text AS unidade_id, fornecedor_id, situacao FROM licitantes_unidade WHERE licitacao_id = $1`,
      [r.licitacao_id],
    );
    const alvoDoAto = atoProprio(ato) ? r.fornecedor_id : r.fornecedor_alvo_id;
    if (!alvoDoAto) throw new ConflictException('Recurso sem licitante alvo — não é possível aplicar o efeito.');
    const situacoesAlvo =
      ato === AtoRecorrido.HABILITACAO_TERCEIRO
        ? situacoes.filter((s) => s.fornecedor_id === alvoDoAto && !ehExcluida(s.situacao))
        : situacoes.filter(
            (s) =>
              s.fornecedor_id === alvoDoAto &&
              (atoProprio(ato) ? situacoesDoAtoProprio(ato) : situacoesDoAlvo(ato)).includes(s.situacao),
          );
    const unidadesIds = [...new Set(situacoesAlvo.map((s) => s.unidade_id))].filter((id) => !r.item_id || id === r.item_id);

    for (const unidadeId of unidadesIds) {
      const u = todas.find((x) => x.id === unidadeId);
      if (!u) continue;
      const rotulo = this.rotuloUnidade(u);
      const antes = atualDaUnidade(await this.ranking.ranking(u, m));
      const antesAceito = antes ? `${antes.fornecedorId}:${ehPropostaAceita(antes.situacao)}` : null;
      const de = situacoes.find((s) => s.unidade_id === unidadeId && s.fornecedor_id === alvoDoAto)?.situacao ?? null;

      if (atoProprio(ato)) {
        const [aceita] = await m.query(
          `SELECT 1 FROM aceitacoes_proposta WHERE unidade_id::text = $1 AND fornecedor_id::text = $2 AND status = $3 LIMIT 1`,
          [unidadeId, r.fornecedor_id, StatusAceitacao.ACEITA],
        );
        const nova = situacaoRestaurada(ato, !!aceita);
        await this.ranking.definirSituacao(m, u, r.fornecedor_id, nova, {
          motivo: `Recurso provido: ${ROTULO_ATO[ato].replace('contra ', '')} reformada (art. 165 §3º).`,
          ator,
        });
        efeitos.alteracoes.push({ fornecedor_id: r.fornecedor_id, unidade_id: unidadeId, rotulo, de, para: nova, tipo: 'RESTAURADO' });
        const novoRanking = await this.ranking.ranking(u, m);
        for (const inv of planejarInvalidacoes(novoRanking, r.fornecedor_id)) {
          await this.ranking.definirSituacao(m, u, inv.fornecedorId, SituacaoLicitante.CLASSIFICADO, { motivo: motivoInvalidacao, ator });
          efeitos.aceitacoes_canceladas.push(...(await this.invalidarAceitacoes(m, unidadeId, inv.fornecedorId, motivoInvalidacao)));
          efeitos.alteracoes.push({ fornecedor_id: inv.fornecedorId, unidade_id: unidadeId, rotulo, de: inv.de, para: SituacaoLicitante.CLASSIFICADO, tipo: 'INVALIDADO' });
        }
      } else {
        const nova = situacaoDoAlvoProvido(ato)!;
        await this.ranking.definirSituacao(m, u, alvoDoAto, nova, {
          motivo: `Recurso de ${r.fornecedor_nome ?? r.fornecedor_id} provido ${ROTULO_ATO[ato].replace('contra ', 'contra ')} (art. 165 §3º).`,
          ator,
        });
        efeitos.aceitacoes_canceladas.push(...(await this.invalidarAceitacoes(m, unidadeId, alvoDoAto, motivoInvalidacao)));
        efeitos.alteracoes.push({ fornecedor_id: alvoDoAto, unidade_id: unidadeId, rotulo, de, para: nova, tipo: 'EXCLUIDO' });
      }
      const depois = atualDaUnidade(await this.ranking.ranking(u, m));
      const depoisAceito = depois ? `${depois.fornecedorId}:${ehPropostaAceita(depois.situacao)}` : null;
      if (antesAceito !== depoisAceito) efeitos.alterou_resultado = true;
    }
    if (!unidadesIds.length) {
      efeitos.observacao = 'O ato recorrido não produz mais efeito em nenhuma unidade (situação já alterada por outro ato).';
    }
    return efeitos;
  }

  // ==========================================================================
  // 6. FIM DA FASE RECURSAL (máquina de estados)
  // ==========================================================================

  /**
   * Decididos todos os recursos (e sem janela aberta), a licitação sai de
   * RECURSO pelo ato próprio (`desfechoDaFaseRecursal`). Idempotente.
   */
  async concluirSePossivel(licitacaoId: string, sessaoId: string, ator: AtorRecurso): Promise<string | null> {
    const m = this.dataSource.manager;
    const [lic] = await m.query(`SELECT fase::text AS fase, situacao::text AS situacao, modalidade::text AS modalidade FROM licitacoes WHERE id = $1`, [licitacaoId]);
    if (!lic || lic.fase !== FaseLicitacao.RECURSO || lic.situacao !== 'ATIVA') return null;
    const declarado = resultadoDeclarado(lic.modalidade);
    const pendentes = await m.count(RecursoAdministrativo, { where: { licitacao_id: licitacaoId, status: In([...STATUS_RECURSO_PENDENTES]) } });
    if (pendentes) return null;
    const agora = new Date();
    const janelas = await m.find(JanelaIntencaoRecurso, { where: { licitacao_id: licitacaoId } });
    if (janelas.some((j) => estadoJanela(j, agora) === 'ABERTA')) return null;

    const providos = (await m.find(RecursoAdministrativo, { where: { licitacao_id: licitacaoId, status: StatusRecurso.PROVIDO } })).filter(
      (r) => r.efeitos?.alterou_resultado && !r.efeitos?.fase_concluida,
    );
    // Leilão/concurso (E7c): "sem aceite" = unidade sem resultado declarado (arrematante/vencedor ACEITO)
    const semAceite = declarado
      ? await unidadesSemResultadoDeclaradoSql(m, licitacaoId)
      : await this.transicoes.unidadesSemPropostaAceita(licitacaoId);
    let desfecho = desfechoDaFaseRecursal({ unidadesSemAceite: semAceite.length, resultadoAlterado: providos.length > 0 });
    // Sem habilitação, resultado refeito e completo segue direto (não há "habilitação" a que voltar)
    if (declarado && desfecho === 'RETORNAR_HABILITACAO') desfecho = 'DECIDIR_RECURSOS';
    const ROTULO_DECISAO: Record<string, string> = {
      [StatusRecurso.PROVIDO]: 'provido sem alteração do resultado',
      [StatusRecurso.IMPROVIDO]: 'improvido',
      [StatusRecurso.NAO_CONHECIDO]: 'não conhecido',
    };
    const daRodada = (await m.find(RecursoAdministrativo, { where: { licitacao_id: licitacaoId }, order: { created_at: 'ASC' } })).filter(
      (r) => !r.efeitos?.fase_concluida && r.instancia_decisao !== 'LEGADO',
    );
    const decididos = daRodada.map((r) => `${r.fornecedor_nome ?? r.fornecedor_id}: ${ROTULO_DECISAO[r.status] ?? r.status.toLowerCase()}`);
    const motivo =
      desfecho === 'DECIDIR_RECURSOS'
        ? `Recursos decididos sem alteração do resultado (art. 165 §2º) — ${decididos.join('; ') || 'sem recursos'}. Segue a adjudicação.`
        : `Recurso(s) provido(s) (art. 165 §3º): ${providos.map((p) => p.fornecedor_nome ?? p.fornecedor_id).join(', ')}. ` +
          (desfecho === 'RETORNAR_JULGAMENTO'
            ? `Julgamento refeito nas unidades sem proposta aceita: ${semAceite.join(', ')}.`
            : 'Novo resultado da habilitação; segue a adjudicação.');

    await this.dataSource.transaction(async (tm) => {
      await this.transicoes.executar(licitacaoId, AtoLicitacao[desfecho], {
        ator,
        manager: tm,
        motivo,
        registro: { origem: 'recursos', sessao_id: sessaoId, recursos_providos: providos.map((p) => p.id) },
      });
      for (const p of daRodada) {
        await tm.query(
          `UPDATE recursos_administrativos SET efeitos = COALESCE(efeitos, '{}'::jsonb) || $2::jsonb, updated_at = now() WHERE id = $1`,
          [p.id, JSON.stringify({ fase_concluida: true, ato_fase: desfecho })],
        );
      }
      if (desfecho === 'RETORNAR_JULGAMENTO') {
        // O resultado mudou: a janela anterior não vale para o novo resultado
        await tm.query(
          `UPDATE janelas_intencao_recurso SET superada_em = now(), superada_motivo = $2 WHERE licitacao_id = $1 AND superada_em IS NULL`,
          [licitacaoId, 'Resultado refeito por recurso provido — nova janela sobre o novo resultado.'],
        );
        await this.atualizarEtapa(tm, sessaoId, EtapaSessao.ACEITACAO_PROPOSTA);
      } else {
        await this.atualizarEtapa(tm, sessaoId, EtapaSessao.ADJUDICACAO);
      }
      await this.evento(tm, {
        sessaoId,
        tipo: TipoEvento.MENSAGEM_SISTEMA,
        descricao:
          desfecho === 'DECIDIR_RECURSOS'
            ? 'Todos os recursos foram decididos. Sessão segue para a adjudicação (art. 71).'
            : desfecho === 'RETORNAR_HABILITACAO'
              ? `Todos os recursos foram decididos. ${motivo} A licitação volta à habilitação com o novo resultado e segue para a adjudicação.`
              : `Todos os recursos foram decididos. ${motivo} A licitação volta ao julgamento: o licitante na vez é convocado para a aceitação da proposta.`,
        usuario: ator.nome ?? null,
        dados: { ato: desfecho, recursos_providos: providos.map((p) => p.id) },
      });
    });
    if (desfecho === 'RETORNAR_JULGAMENTO' && !declarado) {
      await this.aceitacao.convocarPendentesAposRecurso(sessaoId, ator, ator.nome ?? undefined);
    }
    return desfecho;
  }
}

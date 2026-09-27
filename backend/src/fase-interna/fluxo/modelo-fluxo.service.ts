import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ehUuid } from '../../auth/acesso/acesso-licitacao.service';
import { MODALIDADES_CONTRATACAO_DIRETA } from '../documentos-obrigatorios';
import type { AtoProtegido, Severidade } from '../conformidade/tipos';
import { quemCumpriu } from '../tarefas/tarefa-regras';
import type { EstadoFluxoParaEtapas, MarcaEtapa } from '../tarefas/etapas-fase-interna';
import { CODIGOS_DO_CATALOGO } from './catalogo-fluxo';
import { PAPEIS_FASE_INTERNA, ROTULO_PAPEL } from './codigos';
import { EtapaModeloFluxo, FluxoProcessoFaseInterna, ModeloFluxoFaseInterna, RequisitoLegalFluxo, TravaAtoFluxo } from './modelo-fluxo.entities';
import {
  AprovacaoDemandaModelo,
  EtapaDoModelo,
  ModeloFluxo,
  RequisitoLegal,
  ResultadoValidacao,
  SnapshotModelo,
  TIPOS_PROCESSO_FLUXO,
  TipoProcessoFluxo,
  TipoAprovador,
  UsuarioParaSegregacao,
  aplicarEdicao,
  modeloEfetivoDoProcesso,
  snapshotDoModelo,
  tipoDoProcesso,
  validarModelo,
} from './modelo-fluxo';
import { REQUISITOS_SEMENTE, etapasSemente, modeloSemente } from './semente-fluxo';
import { TravaAto, travasSemente } from './travas';

type Autor = { id: string | null; nome: string | null };

/** Status da demanda (módulo de demandas) que contam como aprovada. */
const DEMANDA_APROVADA = ['APROVADA', 'CONSOLIDADA', 'EM_CONTRATACAO', 'CONTRATADA'];

export interface ContextoFluxoProcesso {
  licitacao_id: string;
  orgao_id: string;
  tipo: TipoProcessoFluxo;
  fluxo: FluxoProcessoFaseInterna;
  /** Snapshot (caminho) + operacional vigente. */
  modelo: ModeloFluxo;
  estado: EstadoFluxoParaEtapas;
}

/** Quem conduz o processo (para a aprovação no modo simples). */
export interface CondutorDoProcesso {
  modo: string;
  agente_id: string | null;
}

/**
 * MODELO DE FLUXO EM DADOS (F1) — semente, leitura, edição (com validação
 * pela lei) e o estado do fluxo de cada processo. Só depende do banco: o
 * TarefasService, a conformidade e a instrução leem daqui (sem ciclo).
 */
@Injectable()
export class ModeloFluxoService {
  private readonly logger = new Logger(ModeloFluxoService.name);
  private semente: Promise<void> | null = null;
  private marcoLegado: Date | null = null;

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(ModeloFluxoFaseInterna) private readonly modeloRepo: Repository<ModeloFluxoFaseInterna>,
    @InjectRepository(EtapaModeloFluxo) private readonly etapaRepo: Repository<EtapaModeloFluxo>,
    @InjectRepository(RequisitoLegalFluxo) private readonly requisitoRepo: Repository<RequisitoLegalFluxo>,
    @InjectRepository(TravaAtoFluxo) private readonly travaRepo: Repository<TravaAtoFluxo>,
    @InjectRepository(FluxoProcessoFaseInterna) private readonly fluxoRepo: Repository<FluxoProcessoFaseInterna>,
  ) {}

  // ==========================================================================
  // SEMENTE (idempotente — boot e primeira leitura)
  // ==========================================================================

  garantirSemente(): Promise<void> {
    if (!this.semente) {
      this.semente = this.semear().catch((e) => {
        this.semente = null;
        throw e;
      });
    }
    return this.semente;
  }

  private async semear(): Promise<void> {
    for (const tipo of TIPOS_PROCESSO_FLUXO) {
      let [linha] = await this.ds.query(`SELECT id::text AS id FROM modelos_fluxo_fase_interna WHERE orgao_id IS NULL AND tipo_processo = $1`, [tipo]);
      if (!linha) {
        const m = modeloSemente(tipo);
        await this.modeloRepo
          .createQueryBuilder()
          .insert()
          .into(ModeloFluxoFaseInterna)
          .values({ orgao_id: null, tipo_processo: tipo, codigo: m.codigo, nome: m.nome, descricao: m.descricao, versao: 1, aprovacao_demanda: m.aprovacao_demanda as any, atualizado_por_nome: 'Sistema (semente)' })
          .orIgnore()
          .execute();
        [linha] = await this.ds.query(`SELECT id::text AS id FROM modelos_fluxo_fase_interna WHERE orgao_id IS NULL AND tipo_processo = $1`, [tipo]);
      }
      // Etapa nova no catálogo: entra no modelo do sistema como na semente
      const existentes: Array<{ codigo: string }> = await this.ds.query(`SELECT codigo FROM modelos_fluxo_etapas WHERE modelo_id::text = $1`, [linha.id]);
      const faltam = etapasSemente(tipo).filter((e) => !existentes.some((x) => x.codigo === e.codigo));
      if (faltam.length) {
        await this.etapaRepo.createQueryBuilder().insert().into(EtapaModeloFluxo).values(faltam.map((e) => this.linhaDaEtapa(linha.id, e))).orIgnore().execute();
      }
    }
    await this.requisitoRepo
      .createQueryBuilder()
      .insert()
      .into(RequisitoLegalFluxo)
      .values(REQUISITOS_SEMENTE.map((r) => ({ ...r, atualizado_por_nome: 'Sistema (semente)' })))
      .orIgnore()
      .execute();
    await this.travaRepo
      .createQueryBuilder()
      .insert()
      .into(TravaAtoFluxo)
      .values(travasSemente().map((t) => ({ ...t, atualizado_por_nome: 'Sistema (semente)' })))
      .orIgnore()
      .execute();
  }

  /**
   * Marco do legado: quando o modelo de fluxo em dados entrou (a semente do
   * sistema). Processo criado antes dele é LEGADO — conta com a demanda
   * aprovada (não pode travar).
   */
  private async marco(): Promise<Date> {
    if (this.marcoLegado) return this.marcoLegado;
    await this.garantirSemente();
    const [r] = await this.ds.query(`SELECT MIN(created_at) AS m FROM modelos_fluxo_fase_interna WHERE orgao_id IS NULL`);
    this.marcoLegado = r?.m ? new Date(r.m) : new Date();
    return this.marcoLegado;
  }

  private linhaDaEtapa(modeloId: string, e: EtapaDoModelo): Partial<EtapaModeloFluxo> {
    return {
      modelo_id: modeloId,
      codigo: e.codigo,
      grupo: e.grupo,
      grupo_titulo: e.grupo_titulo,
      titulo: e.titulo,
      ordem: e.ordem,
      tipos_peca: e.tipos_peca,
      tela: e.tela,
      conclusao: e.conclusao,
      fase_maquina: e.fase_maquina,
      portao: e.portao,
      fundamento: e.fundamento,
      responsavel_papel: e.responsavel.papel,
      responsavel_setor_id: e.responsavel.setor_id,
      responsavel_usuario_id: e.responsavel.usuario_id,
      prazo_dias_uteis: e.prazo_dias_uteis,
      obrigatoria: e.obrigatoria,
      ligada: e.ligada,
      ia_rascunho: e.ia_rascunho,
      aprovacao_interna: e.aprovacao_interna,
      dispensavel_por_ato: e.dispensavel_por_ato,
      depende_de: e.depende_de,
    };
  }

  // ==========================================================================
  // LEITURA
  // ==========================================================================

  private paraModelo(linha: ModeloFluxoFaseInterna, etapas: EtapaModeloFluxo[]): ModeloFluxo {
    const tipo = linha.tipo_processo as TipoProcessoFluxo;
    const semente = modeloSemente(tipo);
    const ap = (linha.aprovacao_demanda ?? {}) as Partial<AprovacaoDemandaModelo>;
    const lista: EtapaDoModelo[] = etapas.map((e) => ({
      codigo: e.codigo,
      grupo: e.grupo,
      grupo_titulo: e.grupo_titulo,
      titulo: e.titulo,
      ordem: e.ordem,
      tipos_peca: Array.isArray(e.tipos_peca) ? e.tipos_peca : [],
      tela: e.tela,
      conclusao: (e.conclusao as EtapaDoModelo['conclusao']) ?? 'PECAS',
      fase_maquina: e.fase_maquina,
      portao: e.portao,
      fundamento: e.fundamento,
      responsavel: { papel: e.responsavel_papel, setor_id: e.responsavel_setor_id, usuario_id: e.responsavel_usuario_id },
      prazo_dias_uteis: e.prazo_dias_uteis,
      obrigatoria: e.obrigatoria,
      ligada: e.ligada,
      ia_rascunho: e.ia_rascunho,
      aprovacao_interna: e.aprovacao_interna,
      dispensavel_por_ato: e.dispensavel_por_ato,
      depende_de: Array.isArray(e.depende_de) ? e.depende_de : [],
    }));
    // Etapa do catálogo que faltar no modelo gravado: entra como na semente (opcional desligada)
    for (const s of semente.etapas) if (!lista.some((x) => x.codigo === s.codigo)) lista.push({ ...s, ligada: s.obrigatoria ? s.ligada : false });
    lista.sort((a, b) => a.ordem - b.ordem || a.codigo.localeCompare(b.codigo));
    return {
      id: linha.id,
      orgao_id: linha.orgao_id,
      tipo_processo: tipo,
      codigo: linha.codigo,
      nome: linha.nome,
      descricao: linha.descricao,
      versao: linha.versao,
      aprovacao_demanda: {
        exigida: ap.exigida !== false,
        etapa: ap.etapa || semente.aprovacao_demanda.etapa,
        aprovador: {
          tipo: (ap.aprovador?.tipo as TipoAprovador) || 'PERMISSAO',
          valor: ap.aprovador?.valor ?? null,
        },
        aceita_peca_externa: ap.aceita_peca_externa !== false,
      },
      etapas: lista,
    };
  }

  private async carregar(where: { orgao_id: string | null; tipo: TipoProcessoFluxo }): Promise<ModeloFluxo | null> {
    await this.garantirSemente();
    const [linha] = await this.ds.query(
      `SELECT id::text AS id FROM modelos_fluxo_fase_interna WHERE ${where.orgao_id ? 'orgao_id::text = $2' : 'orgao_id IS NULL'} AND tipo_processo = $1`,
      where.orgao_id ? [where.tipo, where.orgao_id] : [where.tipo],
    );
    if (!linha) return null;
    const m = await this.modeloRepo.findOne({ where: { id: linha.id } });
    if (!m) return null;
    const etapas = await this.etapaRepo.find({ where: { modelo_id: m.id } });
    return this.paraModelo(m, etapas);
  }

  modeloDoSistema(tipo: TipoProcessoFluxo): Promise<ModeloFluxo> {
    return this.carregar({ orgao_id: null, tipo }).then((m) => m ?? modeloSemente(tipo));
  }

  modeloProprio(orgaoId: string, tipo: TipoProcessoFluxo): Promise<ModeloFluxo | null> {
    return this.carregar({ orgao_id: orgaoId, tipo });
  }

  /**
   * Modelo VIGENTE do órgão para o tipo: o próprio, senão o do sistema. Lido
   * muitas vezes por sincronização (instrução, tarefas, portões): cache curto
   * (3 s) por órgão e tipo, limpo a cada gravação nesta instância.
   */
  async modeloVigente(orgaoId: string | null, tipo: TipoProcessoFluxo): Promise<ModeloFluxo> {
    const chave = `${orgaoId ?? 'sistema'}|${tipo}`;
    const c = this.cacheVigente.get(chave);
    if (c && c.ate > Date.now()) return c.modelo;
    const modelo = (orgaoId ? await this.modeloProprio(orgaoId, tipo) : null) ?? (await this.modeloDoSistema(tipo));
    this.cacheVigente.set(chave, { modelo, ate: Date.now() + 3000 });
    return modelo;
  }

  private readonly cacheVigente = new Map<string, { modelo: ModeloFluxo; ate: number }>();
  private cacheTravas: { travas: TravaAto[]; ate: number } | null = null;

  private limparCache() {
    this.cacheVigente.clear();
    this.cacheTravas = null;
  }

  /** Processos do órgão, deste tipo, ainda na fase interna (a tela avisa que o caminho deles não muda). */
  async processosEmAndamento(orgaoId: string, tipo: TipoProcessoFluxo): Promise<number> {
    const [r] = await this.ds.query(
      `SELECT COUNT(*)::int AS n FROM fluxos_processo_fase_interna f JOIN licitacoes l ON l.id = f.licitacao_id
        WHERE f.orgao_id::text = $1 AND f.tipo_processo = $2
          AND l.fase::text IN ('PLANEJAMENTO','TERMO_REFERENCIA','PESQUISA_PRECOS','ANALISE_JURIDICA','APROVACAO_INTERNA')`,
      [orgaoId, tipo],
    );
    return r?.n ?? 0;
  }

  async requisitos(): Promise<RequisitoLegal[]> {
    await this.garantirSemente();
    const linhas = await this.requisitoRepo.find({ order: { codigo: 'ASC' } });
    return linhas.map((r) => ({
      codigo: r.codigo,
      alcance: r.alcance as RequisitoLegal['alcance'],
      tipo: r.tipo as RequisitoLegal['tipo'],
      etapa: r.etapa,
      outra_etapa: r.outra_etapa,
      permite_dispensa_por_ato: r.permite_dispensa_por_ato,
      fundamento: r.fundamento,
      mensagem: r.mensagem,
      ativo: r.ativo,
    }));
  }

  async travas(): Promise<TravaAto[]> {
    if (this.cacheTravas && this.cacheTravas.ate > Date.now()) return this.cacheTravas.travas;
    await this.garantirSemente();
    const linhas = await this.travaRepo.find({ order: { ato: 'ASC', ordem: 'ASC' } });
    const travas = linhas.map((t) => ({ ato: t.ato as AtoProtegido, regra: t.regra, severidade: t.severidade as Severidade, ativa: t.ativa, ordem: t.ordem }));
    this.cacheTravas = { travas, ate: Date.now() + 3000 };
    return travas;
  }

  // ==========================================================================
  // VALIDAÇÃO E GRAVAÇÃO
  // ==========================================================================

  async contextoDoOrgao(orgaoId: string | null): Promise<{ setores: Array<{ id: string; nome: string }>; usuarios: UsuarioParaSegregacao[] }> {
    if (!orgaoId) return { setores: [], usuarios: [] };
    const setores: Array<{ id: string; nome: string }> = await this.ds.query(`SELECT id::text AS id, nome FROM setores WHERE orgao_id::text = $1 ORDER BY nome`, [orgaoId]);
    const usuarios: any[] = await this.ds.query(
      `SELECT id::text AS id, nome, ativo, setor_id::text AS setor_id, papeis_fase_interna AS papeis FROM usuarios WHERE orgao_id::text = $1 ORDER BY nome`,
      [orgaoId],
    );
    return { setores, usuarios: usuarios.map((u) => ({ id: u.id, nome: u.nome, ativo: u.ativo !== false, setor_id: u.setor_id ?? null, papeis: Array.isArray(u.papeis) ? u.papeis : [] })) };
  }

  async validar(orgaoId: string | null, modelo: ModeloFluxo): Promise<ResultadoValidacao> {
    const ctx = await this.contextoDoOrgao(orgaoId);
    return validarModelo(modelo, await this.requisitos(), {
      catalogo: CODIGOS_DO_CATALOGO,
      papeis: PAPEIS_FASE_INTERNA,
      setores: orgaoId ? ctx.setores.map((s) => s.id) : undefined,
      usuarios: orgaoId ? ctx.usuarios : undefined,
    });
  }

  /** Aplica o corpo sobre o vigente e valida — sem gravar (pré-visualização da tela). */
  async simular(orgaoId: string | null, tipo: TipoProcessoFluxo, corpo: any): Promise<{ modelo: ModeloFluxo; validacao: ResultadoValidacao }> {
    const base = orgaoId ? await this.modeloVigente(orgaoId, tipo) : await this.modeloDoSistema(tipo);
    const { modelo, erros } = aplicarEdicao(base, corpo);
    const validacao = await this.validar(orgaoId, modelo);
    return { modelo, validacao: { ...validacao, ok: validacao.ok && !erros.length, erros: [...erros, ...validacao.erros] } };
  }

  /**
   * GRAVA o modelo (do órgão; `orgaoId` null = o do sistema, só o admin da
   * plataforma). Inválido pela lei → 400 com o artigo. Órgão sem modelo
   * próprio ganha a cópia do sistema com a edição.
   */
  async salvar(orgaoId: string | null, tipo: TipoProcessoFluxo, corpo: any, autor: Autor): Promise<{ modelo: ModeloFluxo; validacao: ResultadoValidacao }> {
    const { modelo, validacao } = await this.simular(orgaoId, tipo, corpo);
    if (!validacao.ok) {
      throw new BadRequestException({
        message: `O modelo não foi salvo: ${validacao.erros.map((e) => e.mensagem).join(' ')}`,
        erros: validacao.erros,
        avisos: validacao.avisos,
      });
    }
    const salvo = await this.persistir(orgaoId, tipo, modelo, autor);
    return { modelo: salvo, validacao };
  }

  /** "Restaurar modelo padrão": o modelo do órgão volta a ser a cópia do modelo do sistema. */
  async restaurarPadrao(orgaoId: string, tipo: TipoProcessoFluxo, autor: Autor): Promise<ModeloFluxo> {
    const sistema = await this.modeloDoSistema(tipo);
    return this.persistir(orgaoId, tipo, { ...sistema, id: null, orgao_id: orgaoId }, autor, sistema.id);
  }

  private async persistir(orgaoId: string | null, tipo: TipoProcessoFluxo, m: ModeloFluxo, autor: Autor, origemId?: string | null): Promise<ModeloFluxo> {
    this.limparCache();
    await this.ds.transaction(async (em: EntityManager) => {
      const [atual] = await em.query(
        `SELECT id::text AS id, versao FROM modelos_fluxo_fase_interna WHERE ${orgaoId ? 'orgao_id::text = $2' : 'orgao_id IS NULL'} AND tipo_processo = $1 FOR UPDATE`,
        orgaoId ? [tipo, orgaoId] : [tipo],
      );
      let id: string;
      if (atual) {
        id = atual.id;
        await em.update(ModeloFluxoFaseInterna, id, {
          nome: m.nome,
          descricao: m.descricao,
          versao: Number(atual.versao) + 1,
          aprovacao_demanda: m.aprovacao_demanda as any,
          ...(origemId !== undefined ? { origem_modelo_id: origemId } : {}),
          atualizado_por_id: autor.id,
          atualizado_por_nome: autor.nome,
        });
        await em.delete(EtapaModeloFluxo, { modelo_id: id });
      } else {
        const sistema = orgaoId ? await em.query(`SELECT id::text AS id FROM modelos_fluxo_fase_interna WHERE orgao_id IS NULL AND tipo_processo = $1`, [tipo]) : [];
        const r = await em
          .createQueryBuilder()
          .insert()
          .into(ModeloFluxoFaseInterna)
          .values({
            orgao_id: orgaoId,
            tipo_processo: tipo,
            codigo: orgaoId ? `${m.codigo}` : m.codigo,
            nome: m.nome,
            descricao: m.descricao,
            versao: 1,
            aprovacao_demanda: m.aprovacao_demanda as any,
            origem_modelo_id: origemId ?? sistema[0]?.id ?? null,
            atualizado_por_id: autor.id,
            atualizado_por_nome: autor.nome,
          })
          .returning(['id'])
          .execute();
        id = r.raw[0].id;
      }
      await em.createQueryBuilder().insert().into(EtapaModeloFluxo).values(m.etapas.map((e) => this.linhaDaEtapa(id, e))).execute();
    });
    return (await this.carregar({ orgao_id: orgaoId, tipo }))!;
  }

  /**
   * PUT antigo da configuração (Entrega 2): `responsaveis`, `prazos` e
   * `controle_interno_ativo` passam a ser gravados no modelo do órgão (todos
   * os tipos). Só o que veio no corpo muda; o modelo só é criado/gravado se
   * algo mudou (trocar só o modo não cria modelo).
   */
  async aplicarConfiguracaoLegada(
    orgaoId: string,
    corpo: { responsaveis?: Record<string, any>; prazos?: Record<string, any>; controle_interno_ativo?: unknown },
    valores: { responsaveis: Record<string, { papel: string | null; setor_id: string | null }>; prazos: Record<string, number | null>; controle_interno_ativo: boolean },
    autor: Autor,
  ): Promise<void> {
    for (const tipo of TIPOS_PROCESSO_FLUXO) {
      const atual = await this.modeloVigente(orgaoId, tipo);
      let mudou = false;
      const etapas = atual.etapas.map((e) => {
        const n = { ...e, responsavel: { ...e.responsavel } };
        if (corpo.responsaveis && e.codigo in corpo.responsaveis && valores.responsaveis[e.codigo]) {
          const r = valores.responsaveis[e.codigo];
          const usuario = corpo.responsaveis[e.codigo] && 'usuario_id' in corpo.responsaveis[e.codigo] ? corpo.responsaveis[e.codigo].usuario_id || null : n.responsavel.usuario_id;
          if (r.papel !== n.responsavel.papel || r.setor_id !== n.responsavel.setor_id || usuario !== n.responsavel.usuario_id) {
            n.responsavel = { papel: r.papel, setor_id: r.setor_id, usuario_id: usuario };
            mudou = true;
          }
        }
        if (corpo.prazos && e.codigo in corpo.prazos && valores.prazos[e.codigo] !== n.prazo_dias_uteis) {
          n.prazo_dias_uteis = valores.prazos[e.codigo] ?? null;
          mudou = true;
        }
        if (corpo.controle_interno_ativo !== undefined && e.codigo === 'CONTROLE_INTERNO' && !e.obrigatoria && n.ligada !== valores.controle_interno_ativo) {
          n.ligada = valores.controle_interno_ativo;
          mudou = true;
        }
        return n;
      });
      if (mudou) await this.persistir(orgaoId, tipo, { ...atual, orgao_id: orgaoId, etapas }, autor, atual.orgao_id ? undefined : atual.id);
    }
  }

  async atualizarRequisito(codigo: string, corpo: any, autor: Autor) {
    const r = await this.requisitoRepo.findOne({ where: { codigo } });
    if (!r) throw new NotFoundException('Requisito não encontrado');
    if (corpo?.ativo !== undefined) {
      if (typeof corpo.ativo !== 'boolean') throw new BadRequestException('ativo deve ser verdadeiro ou falso.');
      r.ativo = corpo.ativo;
    }
    if (corpo?.mensagem !== undefined) r.mensagem = String(corpo.mensagem).trim().slice(0, 2000) || r.mensagem;
    if (corpo?.fundamento !== undefined) r.fundamento = String(corpo.fundamento).trim().slice(0, 200) || r.fundamento;
    if (corpo?.permite_dispensa_por_ato !== undefined) r.permite_dispensa_por_ato = corpo.permite_dispensa_por_ato === true;
    r.atualizado_por_nome = autor.nome;
    await this.requisitoRepo.save(r);
    return this.requisitos();
  }

  async atualizarTrava(ato: string, regra: string, corpo: any, autor: Autor) {
    const t = await this.travaRepo.findOne({ where: { ato, regra } });
    if (!t) throw new NotFoundException('Trava não encontrada');
    if (corpo?.ativa !== undefined) {
      if (typeof corpo.ativa !== 'boolean') throw new BadRequestException('ativa deve ser verdadeiro ou falso.');
      t.ativa = corpo.ativa;
    }
    if (corpo?.severidade !== undefined) {
      if (corpo.severidade !== 'BLOQUEIO' && corpo.severidade !== 'ATENCAO') throw new BadRequestException('Severidade: BLOQUEIO ou ATENCAO.');
      t.severidade = corpo.severidade;
    }
    t.atualizado_por_nome = autor.nome;
    await this.travaRepo.save(t);
    this.limparCache();
    return this.travas();
  }

  // ==========================================================================
  // FLUXO DO PROCESSO (snapshot + estado)
  // ==========================================================================

  private async licitacao(licitacaoId: string) {
    if (!ehUuid(licitacaoId)) return null;
    const [l] = await this.ds.query(
      `SELECT id::text AS id, orgao_id::text AS orgao_id, modalidade::text AS modalidade, created_at, demanda_id::text AS demanda_id
         FROM licitacoes WHERE id::text = $1`,
      [licitacaoId],
    );
    return l ?? null;
  }

  tipoDaModalidade(modalidade: string | null | undefined): TipoProcessoFluxo {
    return tipoDoProcesso(modalidade, MODALIDADES_CONTRATACAO_DIRETA.includes(String(modalidade ?? '')));
  }

  /**
   * Linha do fluxo do processo (cria na primeira vez, com o SNAPSHOT do modelo
   * vigente do órgão). Processo anterior ao marco da F1 nasce LEGADO, com a
   * demanda aprovada (não trava). Mudou o tipo (modalidade trocada na fase
   * interna): novo snapshot, mantendo as marcas.
   */
  async fluxoDoProcesso(licitacaoId: string): Promise<{ fluxo: FluxoProcessoFaseInterna; tipo: TipoProcessoFluxo; orgao_id: string } | null> {
    const lic = await this.licitacao(licitacaoId);
    if (!lic?.orgao_id) return null;
    const tipo = this.tipoDaModalidade(lic.modalidade);
    let fluxo = await this.fluxoRepo.findOne({ where: { licitacao_id: licitacaoId } });
    if (!fluxo) {
      const vigente = await this.modeloVigente(lic.orgao_id, tipo);
      const legado = new Date(lic.created_at).getTime() < (await this.marco()).getTime();
      const agora = new Date();
      await this.fluxoRepo
        .createQueryBuilder()
        .insert()
        .into(FluxoProcessoFaseInterna)
        .values({
          licitacao_id: licitacaoId,
          orgao_id: lic.orgao_id,
          tipo_processo: tipo,
          modelo_id: vigente.id,
          modelo_versao: vigente.versao,
          modelo_nome: vigente.nome,
          snapshot: snapshotDoModelo(vigente) as any,
          snapshot_em: agora,
          legado,
          demanda_aprovada: legado,
          aprovacao_demanda: (legado
            ? { origem: 'LEGADO', por_id: null, por_nome: 'Sistema (processo anterior ao modelo de fluxo)', em: agora.toISOString(), observacao: 'Processo já existente quando o modelo de fluxo em dados entrou: a demanda conta como aprovada.' }
            : null) as any,
        })
        .orIgnore()
        .execute();
      fluxo = await this.fluxoRepo.findOne({ where: { licitacao_id: licitacaoId } });
      if (!fluxo) return null;
    } else if (fluxo.tipo_processo !== tipo) {
      const vigente = await this.modeloVigente(lic.orgao_id, tipo);
      await this.fluxoRepo.update(fluxo.id, {
        tipo_processo: tipo,
        modelo_id: vigente.id,
        modelo_versao: vigente.versao,
        modelo_nome: vigente.nome,
        snapshot: snapshotDoModelo(vigente) as any,
        snapshot_em: new Date(),
      });
      fluxo = (await this.fluxoRepo.findOne({ where: { id: fluxo.id } }))!;
    }
    return { fluxo, tipo, orgao_id: lic.orgao_id };
  }

  /** Modelo efetivo e estado do processo — o que `etapasDaFaseInterna` recebe. */
  async contextoDoProcesso(licitacaoId: string): Promise<ContextoFluxoProcesso | null> {
    const r = await this.fluxoDoProcesso(licitacaoId);
    if (!r) return null;
    const vigente = await this.modeloVigente(r.orgao_id, r.tipo);
    const modelo = modeloEfetivoDoProcesso(r.fluxo.snapshot as SnapshotModelo, vigente);
    return {
      licitacao_id: licitacaoId,
      orgao_id: r.orgao_id,
      tipo: r.tipo,
      fluxo: r.fluxo,
      modelo,
      estado: {
        demanda_aprovada: r.fluxo.demanda_aprovada || !modelo.aprovacao_demanda.exigida,
        reabertas: r.fluxo.reabertas ?? {},
        a_revisar: r.fluxo.a_revisar ?? {},
        registros: r.fluxo.registros ?? {},
      },
    };
  }

  /**
   * Controle interno ligado para o tipo do processo (a instrução só inclui a
   * manifestação com ele ligado) e os tipos de peça que exigem aprovação
   * interna. Operacional: sempre o modelo VIGENTE do órgão.
   */
  async operacionalDoProcesso(orgaoId: string, modalidade: string | null | undefined): Promise<{ controle_interno_ativo: boolean; tipos_com_aprovacao: string[] }> {
    const m = await this.modeloVigente(orgaoId, this.tipoDaModalidade(modalidade));
    return {
      controle_interno_ativo: !!m.etapas.find((e) => e.codigo === 'CONTROLE_INTERNO')?.ligada,
      tipos_com_aprovacao: m.etapas.filter((e) => e.ligada && e.aprovacao_interna).flatMap((e) => e.tipos_peca),
    };
  }

  async controleInternoAtivo(orgaoId: string, modalidade: string | null | undefined): Promise<boolean> {
    return (await this.operacionalDoProcesso(orgaoId, modalidade)).controle_interno_ativo;
  }

  // ==========================================================================
  // APROVAÇÃO DA DEMANDA
  // ==========================================================================

  /**
   * A pessoa (id do usuário, ou o id do órgão = login do órgão) aprova a
   * demanda pelo modelo? PERMISSAO = "pode aprovar demandas" (o login do
   * órgão sempre pode — mesma regra do módulo de demandas). No MODO SIMPLES
   * (decisão 1 do dono: uma pessoa conduz o processo inteiro) o condutor do
   * processo também aprova.
   */
  async ehAprovador(id: string | null, orgaoId: string, aprovador: AprovacaoDemandaModelo['aprovador'], condutor?: CondutorDoProcesso): Promise<boolean> {
    if (!id) return false;
    if (id === orgaoId) return true;
    if (condutor && condutor.modo !== 'POR_SETOR' && condutor.agente_id && condutor.agente_id === id) return true;
    if (!ehUuid(id)) return false;
    const [u] = await this.ds.query(
      `SELECT pode_aprovar_demandas, papeis_fase_interna AS papeis, setor_id::text AS setor_id FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2 AND ativo = true`,
      [id, orgaoId],
    );
    if (!u) return false;
    switch (aprovador.tipo) {
      case 'PAPEL':
        return Array.isArray(u.papeis) && !!aprovador.valor && u.papeis.includes(aprovador.valor);
      case 'SETOR':
        return !!aprovador.valor && u.setor_id === aprovador.valor;
      case 'USUARIO':
        return aprovador.valor === id;
      default:
        return !!u.pode_aprovar_demandas;
    }
  }

  rotuloAprovador(aprovador: AprovacaoDemandaModelo['aprovador'], nomes: { setor?: string | null; usuario?: string | null } = {}): string {
    switch (aprovador.tipo) {
      case 'PAPEL':
        return `Papel ${ROTULO_PAPEL[aprovador.valor as keyof typeof ROTULO_PAPEL] ?? aprovador.valor}`;
      case 'SETOR':
        return `Setor ${nomes.setor ?? aprovador.valor}`;
      case 'USUARIO':
        return nomes.usuario ?? 'Pessoa designada';
      default:
        return 'Quem tem a permissão "aprovar demandas" (e o login do órgão)';
    }
  }

  async registrarAprovacao(fluxoId: string, dados: { origem: string; por_id: string | null; por_nome: string | null; observacao?: string | null }): Promise<boolean> {
    const r = await this.ds.query(
      `UPDATE fluxos_processo_fase_interna SET demanda_aprovada = true, aprovacao_demanda = $2::jsonb, updated_at = now()
        WHERE id::text = $1 AND demanda_aprovada = false RETURNING id`,
      [fluxoId, JSON.stringify({ ...dados, observacao: dados.observacao ?? null, em: new Date().toISOString() })],
    );
    return Array.isArray(r?.[0]) ? r[0].length > 0 : Number(r?.[1]) > 0;
  }

  async desfazerAprovacao(fluxoId: string): Promise<void> {
    await this.ds.query(`UPDATE fluxos_processo_fase_interna SET demanda_aprovada = false, aprovacao_demanda = NULL, updated_at = now() WHERE id::text = $1`, [fluxoId]);
  }

  /**
   * APROVAÇÃO AUTOMÁTICA (sem ninguém precisar clicar) quando a aprovação já
   * existe por outro caminho:
   *  - o processo nasceu de uma demanda aprovada no módulo de demandas;
   *  - a DFD foi juntada feita fora (a aprovação consta da peça) e o modelo aceita;
   *  - a DFD pronta foi feita, aprovada (fluxo de aprovação de documentos) ou
   *    assinada por quem aprova.
   * Devolve a origem registrada (ou null).
   */
  async verificarAprovacaoAutomatica(
    ctx: ContextoFluxoProcesso,
    instrucao: Array<{ tipo: string; status: string }>,
    condutor: CondutorDoProcesso,
  ): Promise<string | null> {
    const ap = ctx.modelo.aprovacao_demanda;
    if (!ap.exigida || ctx.fluxo.demanda_aprovada || (ctx.fluxo.reabertas ?? {})[ap.etapa]) return null;
    const [dem] = await this.ds.query(
      `SELECT d.status::text AS status FROM licitacoes l JOIN demandas d ON d.id = l.demanda_id WHERE l.id::text = $1`,
      [ctx.licitacao_id],
    ).catch(() => []);
    if (dem && DEMANDA_APROVADA.includes(dem.status)) {
      return (await this.registrarAprovacao(ctx.fluxo.id, { origem: 'DEMANDA', por_id: null, por_nome: 'Módulo de demandas (demanda aprovada)' })) ? 'DEMANDA' : null;
    }
    const etapa = ctx.modelo.etapas.find((e) => e.codigo === ap.etapa);
    const tipos = etapa?.tipos_peca ?? [];
    const itens = instrucao.filter((i) => tipos.includes(i.tipo));
    if (!itens.length || !itens.every((i) => i.status === 'OK' || i.status === 'NAO_SE_APLICA')) return null;
    const [doc] = await this.ds.query(
      `SELECT status::text AS status, origem::text AS origem, assinaturas, aprovador_id, aprovador_nome, criado_por_id, criado_por_nome
         FROM documentos_fase_interna
        WHERE licitacao_id::text = $1 AND versao_atual = true AND tipo::text = ANY($2::text[])
        ORDER BY updated_at DESC LIMIT 1`,
      [ctx.licitacao_id, tipos],
    );
    if (!doc) return null;
    if (doc.origem && doc.origem !== 'INTERNO' && ap.aceita_peca_externa) {
      return (await this.registrarAprovacao(ctx.fluxo.id, { origem: 'PECA_EXTERNA', por_id: doc.criado_por_id ?? null, por_nome: doc.criado_por_nome ?? null, observacao: 'DFD juntada (feita fora): a aprovação consta da própria peça.' }))
        ? 'PECA_EXTERNA'
        : null;
    }
    // Quem fez, aprovou (fluxo de aprovação de documentos) ou assinou
    const candidatos: Array<{ id: string | null; nome: string | null }> = [quemCumpriu(doc)];
    if (Array.isArray(doc.assinaturas)) for (const a of doc.assinaturas) candidatos.push({ id: a?.assinante_id ?? null, nome: a?.assinante_nome ?? null });
    if (doc.criado_por_id) candidatos.push({ id: doc.criado_por_id, nome: doc.criado_por_nome ?? null });
    for (const c of candidatos) {
      if (await this.ehAprovador(c.id, ctx.orgao_id, ap.aprovador, condutor)) {
        const nome = c.nome ?? (await this.nomeDe(c.id));
        return (await this.registrarAprovacao(ctx.fluxo.id, { origem: 'APROVADOR', por_id: c.id, por_nome: nome })) ? 'APROVADOR' : null;
      }
    }
    return null;
  }

  async nomeDe(id: string | null): Promise<string | null> {
    if (!id || !ehUuid(id)) return null;
    const [u] = await this.ds.query(`SELECT nome FROM usuarios WHERE id::text = $1 UNION ALL SELECT nome FROM orgaos WHERE id::text = $1 LIMIT 1`, [id]);
    return u?.nome ?? null;
  }

  // ==========================================================================
  // MARCAS (reaberta / a revisar / registro)
  // ==========================================================================

  async gravarMarcas(fluxoId: string, marcas: { reabertas?: Record<string, MarcaEtapa>; a_revisar?: Record<string, MarcaEtapa>; registros?: Record<string, MarcaEtapa> }): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [fluxoId];
    for (const campo of ['reabertas', 'a_revisar', 'registros'] as const) {
      if (marcas[campo] === undefined) continue;
      params.push(JSON.stringify(marcas[campo]));
      sets.push(`${campo} = $${params.length}::jsonb`);
    }
    if (!sets.length) return;
    await this.ds.query(`UPDATE fluxos_processo_fase_interna SET ${sets.join(', ')}, updated_at = now() WHERE id::text = $1`, params);
  }

  /**
   * Etapa reaberta / a revisar cuja peça foi alterada DEPOIS da marca: a
   * revisão foi feita — a marca sai sozinha. Devolve os códigos limpos.
   */
  async limparMarcasPorPecaAlterada(ctx: ContextoFluxoProcesso): Promise<Array<{ codigo: string; marca: 'reaberta' | 'a_revisar' }>> {
    const reabertas = { ...(ctx.fluxo.reabertas ?? {}) };
    const aRevisar = { ...(ctx.fluxo.a_revisar ?? {}) };
    const limpos: Array<{ codigo: string; marca: 'reaberta' | 'a_revisar' }> = [];
    const alterada = async (codigo: string, em: string) => {
      const tipos = ctx.modelo.etapas.find((e) => e.codigo === codigo)?.tipos_peca ?? [];
      if (!tipos.length) return false;
      const [r] = await this.ds.query(
        `SELECT 1 FROM documentos_fase_interna WHERE licitacao_id::text = $1 AND versao_atual = true AND tipo::text = ANY($2::text[]) AND updated_at > $3 LIMIT 1`,
        [ctx.licitacao_id, tipos, em],
      );
      return !!r;
    };
    for (const [codigo, m] of Object.entries(reabertas)) {
      if (await alterada(codigo, (m as MarcaEtapa).em)) {
        delete reabertas[codigo];
        limpos.push({ codigo, marca: 'reaberta' });
      }
    }
    for (const [codigo, m] of Object.entries(aRevisar)) {
      if (await alterada(codigo, (m as MarcaEtapa).em)) {
        delete aRevisar[codigo];
        limpos.push({ codigo, marca: 'a_revisar' });
      }
    }
    if (limpos.length) {
      await this.gravarMarcas(ctx.fluxo.id, { reabertas, a_revisar: aRevisar });
      ctx.fluxo.reabertas = reabertas;
      ctx.fluxo.a_revisar = aRevisar;
      ctx.estado.reabertas = reabertas;
      ctx.estado.a_revisar = aRevisar;
    }
    return limpos;
  }

  // ==========================================================================
  // MIGRAÇÃO (boot)
  // ==========================================================================

  /**
   * Boot idempotente: semente; modelo próprio para cada órgão que já tinha
   * `configuracoes_fase_interna` (responsáveis, prazos e controle interno da
   * configuração — o comportamento não muda); fluxo LEGADO para os processos
   * que já existiam.
   */
  async migrar(): Promise<{ orgaos: number; processos: number }> {
    await this.garantirSemente();
    let orgaos = 0;
    const configs: any[] = await this.ds.query(
      `SELECT c.orgao_id::text AS orgao_id, c.responsaveis, c.prazos, c.controle_interno_ativo
         FROM configuracoes_fase_interna c
        WHERE NOT EXISTS (SELECT 1 FROM modelos_fluxo_fase_interna m WHERE m.orgao_id = c.orgao_id)`,
    );
    for (const c of configs) {
      try {
        const responsaveis: Record<string, { papel: string | null; setor_id: string | null }> = {};
        for (const [k, v] of Object.entries((c.responsaveis ?? {}) as Record<string, any>)) {
          if (v && typeof v === 'object') responsaveis[k] = { papel: PAPEIS_FASE_INTERNA.includes(v.papel) ? v.papel : null, setor_id: typeof v.setor_id === 'string' && v.setor_id ? v.setor_id : null };
        }
        const prazos: Record<string, number | null> = {};
        for (const [k, v] of Object.entries((c.prazos ?? {}) as Record<string, any>)) {
          const n = Math.floor(Number(v));
          prazos[k] = v === null || v === '' || !Number.isFinite(n) || n <= 0 ? null : Math.min(n, 365);
        }
        for (const tipo of TIPOS_PROCESSO_FLUXO) {
          const sistema = await this.modeloDoSistema(tipo);
          const etapas = sistema.etapas.map((e) => ({
            ...e,
            responsavel: responsaveis[e.codigo] ? { ...responsaveis[e.codigo], usuario_id: null } : { ...e.responsavel },
            prazo_dias_uteis: e.codigo in prazos ? prazos[e.codigo] : e.prazo_dias_uteis,
            ligada: e.codigo === 'CONTROLE_INTERNO' ? !!c.controle_interno_ativo : e.ligada,
          }));
          const [existe] = await this.ds.query(`SELECT 1 FROM modelos_fluxo_fase_interna WHERE orgao_id::text = $1 AND tipo_processo = $2`, [c.orgao_id, tipo]);
          if (!existe) await this.persistir(c.orgao_id, tipo, { ...sistema, id: null, orgao_id: c.orgao_id, etapas }, { id: 'sistema', nome: 'Migração (configuração da fase interna)' }, sistema.id);
        }
        orgaos++;
      } catch (e: any) {
        this.logger.warn(`Modelo de fluxo do órgão ${c.orgao_id} não migrado: ${e?.message ?? e}`);
      }
    }
    const processos: Array<{ id: string }> = await this.ds.query(
      `SELECT l.id::text AS id FROM licitacoes l
        WHERE l.orgao_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM fluxos_processo_fase_interna f WHERE f.licitacao_id = l.id)
        ORDER BY l.created_at`,
    );
    let n = 0;
    for (const p of processos) {
      try {
        if (await this.fluxoDoProcesso(p.id)) n++;
      } catch (e: any) {
        this.logger.warn(`Fluxo do processo ${p.id} não migrado: ${e?.message ?? e}`);
      }
    }
    return { orgaos, processos: n };
  }
}

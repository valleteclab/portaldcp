import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ContratacaoFutura, Demanda, ItemDemanda, StatusContratacaoFutura, StatusDemanda, STATUS_DEMANDA_EM_PROCESSO, demandaTravada } from './entities/demanda.entity';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { TipoNotificacao } from '../notificacoes/entities/notificacao.entity';
import { aplicarEstadoCompraPncp } from '../pncp/estado-compra-pncp';
import { ehUuid } from '../auth/acesso/acesso-licitacao.service';
import type { Ator } from '../auth/acesso/ator';
import { PlanejamentoFluxoService } from '../fase-interna/fluxo/planejamento-fluxo.service';
import { PendenciaDfdService } from '../fase-interna/fluxo/pendencia-dfd.service';
import { rotuloRegra } from '../fase-interna/fluxo/planejamento-fluxo';
import { DfdConsolidadoService } from './dfd/dfd-consolidado.service';
import { EscopoDemandas, condicaoSqlDoEscopo, demandaNoEscopo, veTodasAsDemandas } from './visibilidade-demandas';

@Injectable()
export class DemandasService {
  private readonly logger = new Logger(DemandasService.name);

  constructor(
    @InjectRepository(Demanda)
    private demandaRepository: Repository<Demanda>,
    @InjectRepository(ItemDemanda)
    private itemDemandaRepository: Repository<ItemDemanda>,
    @InjectRepository(ContratacaoFutura)
    private contratacaoFuturaRepository: Repository<ContratacaoFutura>,
    @InjectDataSource()
    private dataSource: DataSource,
    private notificacoesService: NotificacoesService,
    // Planejamento no modelo de fluxo: quem aprova a demanda (padrão: "pode aprovar demandas")
    private planejamento: PlanejamentoFluxoService,
    // DFD consolidado: a demanda juntada num DFD fica travada
    private dfds: DfdConsolidadoService,
    // Demanda aprovada → aviso e pendência "Montar o DFD" para quem monta o DFD (unidade de planejamento)
    private pendenciaDfd: PendenciaDfdService,
  ) {}

  // ==================== DONO (checagem de órgão no controller) ====================

  /** Órgão dono da demanda; null se não existe (ou id inválido). */
  async orgaoDaDemanda(id: string): Promise<string | null> {
    if (!ehUuid(id)) return null;
    const [r] = await this.dataSource.query(`SELECT orgao_id FROM demandas WHERE id = $1`, [id]);
    return r?.orgao_id ?? null;
  }

  /** Órgão dono do item da demanda (pela demanda); null se não existe. */
  async orgaoDoItemDemanda(itemId: string): Promise<string | null> {
    if (!ehUuid(itemId)) return null;
    const [r] = await this.dataSource.query(
      `SELECT d.orgao_id FROM itens_demanda i JOIN demandas d ON d.id = i.demanda_id WHERE i.id = $1`,
      [itemId],
    );
    return r?.orgao_id ?? null;
  }

  /** Demanda do item; null se não existe. */
  async demandaDoItem(itemId: string): Promise<string | null> {
    if (!ehUuid(itemId)) return null;
    const [r] = await this.dataSource.query(`SELECT demanda_id::text AS demanda_id FROM itens_demanda WHERE id = $1`, [itemId]);
    return r?.demanda_id ?? null;
  }

  /** Órgão dono do PCA; null se não existe. */
  async orgaoDoPca(pcaId: string): Promise<string | null> {
    if (!ehUuid(pcaId)) return null;
    const [r] = await this.dataSource.query(`SELECT orgao_id FROM planos_contratacao_anual WHERE id = $1`, [pcaId]);
    return r?.orgao_id ?? null;
  }

  /** Órgão dono do item do PCA (pelo PCA do item); null se não existe. */
  async orgaoDoItemPca(itemPcaId: string): Promise<string | null> {
    if (!ehUuid(itemPcaId)) return null;
    const [r] = await this.dataSource.query(
      `SELECT p.orgao_id FROM itens_pca ip JOIN planos_contratacao_anual p ON p.id = ip.pca_id WHERE ip.id = $1`,
      [itemPcaId],
    );
    return r?.orgao_id ?? null;
  }

  /**
   * Aprova/rejeita a demanda? Pela regra do modelo de fluxo (Configurações ›
   * Fluxo — padrão: "pode aprovar demandas"); o login do órgão e o admin da
   * plataforma sempre. Sempre pelo token.
   */
  async exigirAprovador(ator: Ator, orgaoId: string): Promise<void> {
    if (await this.planejamento.podeAprovarDemanda(ator, orgaoId)) return;
    const p = await this.planejamento.vigente(orgaoId);
    throw new ForbiddenException(`Você não tem permissão para aprovar demandas (quem aprova: ${rotuloRegra(p.aprovador_demanda, 'APROVAR')}).`);
  }

  /**
   * Quais demandas do órgão quem consulta vê (token + banco): requisitante →
   * as do seu setor e as que criou; aprovador, planejamento, administrador do
   * órgão, login do órgão e admin da plataforma → todas. Ver `visibilidade-demandas.ts`.
   */
  async escopo(ator: Ator | null | undefined, orgaoId: string): Promise<EscopoDemandas> {
    if (!ator) return { todas: false, usuarioId: '', setorId: null, setorNome: null };
    if (ator.admin || (ator.tipo === 'ORGAO' && ator.orgaoId === orgaoId)) return { todas: true };
    const pessoa = await this.planejamento.pessoa(ator, orgaoId);
    const [aprovarDemanda, montarDfd, aprovarDfd] = pessoa
      ? await Promise.all([
          this.planejamento.podeAprovarDemanda(ator, orgaoId),
          this.planejamento.podeMontarDfd(ator, orgaoId),
          this.planejamento.podeAprovarDfd(ator, orgaoId),
        ])
      : [false, false, false];
    if (veTodasAsDemandas(pessoa, { aprovarDemanda, montarDfd, aprovarDfd })) return { todas: true };
    let setorNome: string | null = null;
    if (pessoa?.setor_id) {
      const [s] = await this.dataSource.query(`SELECT nome FROM setores WHERE id::text = $1 AND orgao_id::text = $2`, [pessoa.setor_id, orgaoId]);
      setorNome = s?.nome ?? null;
    }
    return { todas: false, usuarioId: ator.usuarioId ?? ator.id, setorId: pessoa?.setor_id ?? null, setorNome };
  }

  /** Dados de quem está logado (usuário do órgão do token) para pré-preencher a "Nova demanda". */
  async usuarioLogado(ator: Ator | null | undefined, orgaoId: string): Promise<{
    id: string; nome: string | null; email: string | null; telefone: string | null; setor_id: string | null; setor_nome: string | null;
  } | null> {
    if (!ator || ator.tipo !== 'USUARIO' || !ator.usuarioId || !ehUuid(ator.usuarioId)) return null;
    const [u] = await this.dataSource.query(
      `SELECT u.id::text AS id, u.nome, u.email, u.telefone, u.setor_id::text AS setor_id, s.nome AS setor_nome
         FROM usuarios u LEFT JOIN setores s ON s.id = u.setor_id AND s.orgao_id::text = $2
        WHERE u.id::text = $1 AND u.orgao_id::text = $2`,
      [ator.usuarioId, orgaoId],
    );
    if (!u) return null;
    return { id: u.id, nome: u.nome ?? null, email: u.email ?? null, telefone: u.telefone ?? null, setor_id: u.setor_nome ? u.setor_id : null, setor_nome: u.setor_nome ?? null };
  }

  /** A demanda está no escopo de quem consulta? (id inexistente → false) */
  async demandaVisivel(ator: Ator | null | undefined, demandaId: string): Promise<boolean> {
    if (!ehUuid(demandaId)) return false;
    const [d] = await this.dataSource.query(
      `SELECT orgao_id::text AS orgao_id, setor_id::text AS setor_id, unidade_requisitante, criado_por_id FROM demandas WHERE id = $1`,
      [demandaId],
    );
    if (!d) return false;
    return demandaNoEscopo(await this.escopo(ator, d.orgao_id), d);
  }

  /** Nome (e id) de quem age, do token: usuário do órgão, login do órgão ou admin da plataforma. */
  private async quem(ator: Ator | null | undefined): Promise<{ id: string | null; nome: string | null }> {
    if (!ator) return { id: null, nome: null };
    const a = await this.dfds.autor(ator);
    return { id: a.id, nome: a.nome };
  }

  /** Permissão de aprovar/rejeitar demandas (login de usuário do órgão). */
  async usuarioPodeAprovarDemandas(usuarioId: string): Promise<boolean> {
    const [u] = await this.dataSource
      .query(`SELECT pode_aprovar_demandas FROM usuarios WHERE id = $1`, [usuarioId])
      .catch(() => [null]);
    return !!u?.pode_aprovar_demandas;
  }

  /** Notifica o setor requisitante nos marcos do ciclo da demanda (best-effort). */
  private async notificarRequisitante(
    demanda: Demanda,
    tipo: TipoNotificacao,
    titulo: string,
    mensagem: string,
  ): Promise<void> {
    try {
      const link = `/orgao/demandas/${demanda.id}`;
      const [u] =
        demanda.criado_por_id && ehUuid(demanda.criado_por_id)
          ? await this.dataSource.query(`SELECT id::text AS id, email, telefone FROM usuarios WHERE id::text = $1 AND ativo = true`, [demanda.criado_por_id])
          : [];
      await this.notificacoesService.criar({
        orgao_id: demanda.orgao_id,
        // quem pediu (usuário) recebe no sino, e-mail e WhatsApp; senão o sino do órgão
        usuario_id: u?.id ?? demanda.orgao_id,
        usuario_email: u?.email || demanda.responsavel_email || undefined,
        usuario_telefone: u?.telefone || undefined,
        tipo,
        titulo,
        mensagem,
        entidade_tipo: 'DEMANDA',
        entidade_id: demanda.id,
        link,
        metadata: { whatsapp_url: `${process.env.APP_URL || 'https://portaldcp.com.br'}${link}` },
        enviar_email: !!u,
      } as any);
    } catch (e: any) {
      this.logger.warn(`Notificação da demanda não enviada: ${e.message}`);
    }
  }

  // ==================== DEMANDAS ====================

  async findAll(params: {
    orgaoId: string;
    ano?: number;
    status?: StatusDemanda;
    unidadeRequisitante?: string;
    /** Escopo de quem consulta (requisitante → só o setor dele e as que criou). Omitido = todas. */
    escopo?: EscopoDemandas;
  }): Promise<Demanda[]> {
    const query = this.demandaRepository.createQueryBuilder('d')
      .leftJoinAndSelect('d.itens', 'itens')
      .where('d.orgao_id = :orgaoId', { orgaoId: params.orgaoId });

    const cond = params.escopo ? condicaoSqlDoEscopo(params.escopo, 'd') : null;
    if (cond) query.andWhere(cond.sql, cond.params);

    if (params.ano) {
      query.andWhere('d.ano_referencia = :ano', { ano: params.ano });
    }

    if (params.status) {
      query.andWhere('d.status = :status', { status: params.status });
    }

    if (params.unidadeRequisitante) {
      query.andWhere('d.unidade_requisitante = :unidade', { unidade: params.unidadeRequisitante });
    }

    query.orderBy('d.created_at', 'DESC');

    const lista = await query.getMany();
    return this.comDfd(lista);
  }

  /** Acrescenta `dfd` (DFD consolidado em que a demanda está) — a lista e a tela mostram "No DFD nº X". */
  private async comDfd<T extends Demanda | Demanda[]>(alvo: T): Promise<T> {
    const lista = Array.isArray(alvo) ? alvo : [alvo];
    const mapa = await this.dfds.dfdsDasDemandas(lista.map((d) => d.id)).catch(() => new Map());
    for (const d of lista) (d as any).dfd = mapa.get(d.id) ?? null;
    return alvo;
  }

  /** A demanda está num DFD consolidado? (travada) */
  private async noDfd(id: string): Promise<{ numero: number; ano: number } | null> {
    return this.dfds.dfdDaDemanda(id);
  }

  private async exigirDestravada(demanda: Demanda, acao: string): Promise<void> {
    const dfd = await this.noDfd(demanda.id);
    if (dfd) throw new BadRequestException(`A demanda está no DFD nº ${dfd.numero}/${dfd.ano} (consolidado pela unidade de planejamento) e não pode ser ${acao}.`);
    if (demandaTravada(demanda.status, false)) throw new BadRequestException(`Demanda já consolidada ou em contratação não pode ser ${acao}`);
  }

  async findOne(id: string): Promise<Demanda> {
    const demanda = await this.demandaRepository.findOne({
      where: { id },
      relations: ['itens']
    });

    if (!demanda) {
      throw new NotFoundException('Demanda não encontrada');
    }

    return this.comDfd(demanda);
  }

  async create(dados: {
    orgaoId: string;
    ano_referencia: number;
    unidade_requisitante: string;
    responsavel_nome?: string;
    responsavel_email?: string;
    responsavel_telefone?: string;
    observacoes?: string;
    descricao_sucinta_objeto?: string;
    data_desejada_contratacao?: Date | string;
    renovacao_contrato?: boolean;
    setor_id?: string | null;
  }, ator?: Ator | null): Promise<Demanda> {
    // Quem pede (do token) e o setor: o informado (do órgão), o de mesmo nome ou o do usuário
    const autor = await this.quem(ator);
    let setorId: string | null = null;
    if (dados.setor_id && ehUuid(dados.setor_id)) {
      const [s] = await this.dataSource.query(`SELECT id::text AS id FROM setores WHERE id::text = $1 AND orgao_id::text = $2`, [dados.setor_id, dados.orgaoId]);
      if (!s) throw new BadRequestException('Setor não encontrado no órgão.');
      setorId = s.id;
    } else if (dados.unidade_requisitante) {
      const [s] = await this.dataSource.query(`SELECT id::text AS id FROM setores WHERE orgao_id::text = $1 AND lower(trim(nome)) = lower(trim($2)) LIMIT 1`, [dados.orgaoId, dados.unidade_requisitante]);
      setorId = s?.id ?? null;
    }
    if (!setorId && ator?.tipo === 'USUARIO' && ator.usuarioId) {
      const [u] = await this.dataSource.query(`SELECT setor_id::text AS setor_id FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2`, [ator.usuarioId, dados.orgaoId]);
      setorId = u?.setor_id ?? null;
    }
    const demanda = this.demandaRepository.create({
      setor_id: setorId,
      criado_por_id: autor.id,
      criado_por_nome: autor.nome,
      orgao_id: dados.orgaoId,
      ano_referencia: dados.ano_referencia,
      unidade_requisitante: dados.unidade_requisitante,
      responsavel_nome: dados.responsavel_nome,
      responsavel_email: dados.responsavel_email,
      responsavel_telefone: dados.responsavel_telefone,
      observacoes: dados.observacoes,
      descricao_sucinta_objeto: dados.descricao_sucinta_objeto,
      // '' viraria data inválida no Postgres (500 sem explicação p/ o usuário)
      data_desejada_contratacao: (dados.data_desejada_contratacao || null) as any,
      renovacao_contrato: !!dados.renovacao_contrato,
      status: StatusDemanda.RASCUNHO,
    });

    const salva = await this.demandaRepository.save(demanda);
    // Retornar com itens inicializado como array vazio para evitar erros no frontend
    salva.itens = [];
    return salva;
  }

  async update(id: string, dados: Partial<Demanda>): Promise<Demanda> {
    const demanda = await this.findOne(id);

    // Não permite editar demandas já consolidadas / em contratação / contratadas / num DFD
    await this.exigirDestravada(demanda, 'editada');

    const campos = await this.camposEditaveis(demanda, (dados ?? {}) as Record<string, unknown>);
    const dataAnterior = demanda.data_desejada_contratacao as unknown as string | null;
    Object.assign(demanda, campos);
    delete (demanda as any).dfd;
    const itens = demanda.itens;
    delete (demanda as any).itens;
    const salva = await this.demandaRepository.save(demanda);
    // itens que herdaram a data da demanda acompanham a nova data
    if ('data_desejada_contratacao' in campos) {
      await this.dataSource.query(
        `UPDATE itens_demanda SET data_desejada_contratacao = $2
          WHERE demanda_id = $1 AND (data_desejada_contratacao IS NULL OR data_desejada_contratacao = $3::date)`,
        [id, campos.data_desejada_contratacao ?? null, dataAnterior ?? null],
      );
    }
    salva.itens = itens ?? [];
    return this.comDfd(salva);
  }

  /**
   * Campos do PEDIDO que o PUT troca (lista fechada — dono, status, vínculos e
   * ciclo nunca): descrição, justificativa, unidade/setor, tipo, "para quando",
   * responsável e ano do PCA. Data vazia → null; data inválida → 400; setor de
   * outro órgão → 400.
   */
  private async camposEditaveis(demanda: Demanda, dados: Record<string, unknown>): Promise<Partial<Demanda>> {
    const out: Record<string, unknown> = {};
    const texto = (v: unknown) => (v == null ? null : String(v));
    for (const c of ['descricao_sucinta_objeto', 'observacoes', 'responsavel_nome', 'responsavel_email', 'responsavel_telefone'] as const) {
      if (c in dados) out[c] = texto(dados[c]);
    }
    if ('renovacao_contrato' in dados) out.renovacao_contrato = dados.renovacao_contrato === true || dados.renovacao_contrato === 'true';
    if ('ano_referencia' in dados) {
      const ano = Number(dados.ano_referencia);
      if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) throw new BadRequestException('Ano de referência (PCA) inválido.');
      out.ano_referencia = ano;
    }
    if ('data_desejada_contratacao' in dados) {
      const v = String(dados.data_desejada_contratacao ?? '').trim().slice(0, 10);
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new BadRequestException('"Para quando" deve ser uma data (AAAA-MM-DD).');
      out.data_desejada_contratacao = v || null;
    }
    // Setor: pelo id (do órgão) ou pelo nome digitado (casando com um setor cadastrado)
    if ('setor_id' in dados && dados.setor_id) {
      const [s] = ehUuid(String(dados.setor_id))
        ? await this.dataSource.query(`SELECT id::text AS id, nome FROM setores WHERE id::text = $1 AND orgao_id::text = $2`, [String(dados.setor_id), demanda.orgao_id])
        : [];
      if (!s) throw new BadRequestException('Setor não encontrado no órgão.');
      out.setor_id = s.id;
      out.unidade_requisitante = texto(dados.unidade_requisitante)?.trim() || s.nome;
    } else if ('unidade_requisitante' in dados) {
      const nome = texto(dados.unidade_requisitante)?.trim() || '';
      if (!nome) throw new BadRequestException('Informe a unidade requisitante.');
      out.unidade_requisitante = nome;
      const [s] = await this.dataSource.query(`SELECT id::text AS id FROM setores WHERE orgao_id::text = $1 AND lower(trim(nome)) = lower(trim($2)) LIMIT 1`, [demanda.orgao_id, nome]);
      out.setor_id = s?.id ?? null;
    }
    return out as Partial<Demanda>;
  }

  async delete(id: string): Promise<void> {
    const demanda = await this.findOne(id);

    await this.exigirDestravada(demanda, 'excluída');

    delete (demanda as any).dfd;
    await this.demandaRepository.remove(demanda);
  }

  // ==================== FLUXO DE STATUS ====================

  async enviarParaAprovacao(id: string): Promise<Demanda> {
    const demanda = await this.findOne(id);

    if (demanda.status !== StatusDemanda.RASCUNHO) {
      throw new BadRequestException('Apenas demandas em rascunho podem ser enviadas');
    }

    if (!demanda.itens || demanda.itens.length === 0) {
      throw new BadRequestException('Demanda deve ter pelo menos um item');
    }

    if (!demanda.descricao_sucinta_objeto?.trim()) {
      throw new BadRequestException('Informe a descrição sucinta do objeto antes de enviar a DFD');
    }

    demanda.status = StatusDemanda.ENVIADA;
    demanda.data_envio = new Date();

    delete (demanda as any).dfd;
    const salva = await this.demandaRepository.save(demanda);
    // Aviso a quem aprova (Central de Aprovações) — sino, e-mail e WhatsApp
    try {
      const p = await this.planejamento.vigente(salva.orgao_id);
      const total = (salva.itens || []).reduce((t, i) => t + (Number(i.valor_total_estimado) || 0), 0);
      await this.dfds.avisar(
        salva.orgao_id,
        await this.planejamento.destinatarios(salva.orgao_id, p.aprovador_demanda, 'APROVAR'),
        `Demanda de ${salva.unidade_requisitante} aguarda aprovação`,
        `${salva.descricao_sucinta_objeto || 'Demanda'} — ${(salva.itens || []).length} item(ns), ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. Acesse a Central de Aprovações.`,
        '/orgao/aprovacoes?tab=demandas',
        salva.id,
        'DEMANDA',
      );
    } catch (e: any) {
      this.logger.warn(`Aviso de demanda enviada não saiu: ${e?.message ?? e}`);
    }
    return salva;
  }

  async iniciarAnalise(id: string): Promise<Demanda> {
    const demanda = await this.findOne(id);

    if (demanda.status !== StatusDemanda.ENVIADA) {
      throw new BadRequestException('Apenas demandas enviadas podem entrar em análise');
    }

    demanda.status = StatusDemanda.EM_ANALISE;
    return this.demandaRepository.save(demanda);
  }

  /** Aprova — quem aprovou vem do TOKEN (o `aprovadoPor` do corpo é ignorado). */
  async aprovar(id: string, ator: Ator): Promise<Demanda> {
    const demanda = await this.findOne(id);

    if (demanda.status !== StatusDemanda.EM_ANALISE && demanda.status !== StatusDemanda.ENVIADA) {
      throw new BadRequestException('Demanda não está em análise');
    }
    const autor = await this.quem(ator);
    const aprovadoPor = autor.nome || 'Aprovador';

    demanda.status = StatusDemanda.APROVADA;
    demanda.data_aprovacao = new Date();
    demanda.aprovado_por = aprovadoPor;
    demanda.aprovado_por_id = autor.id;
    demanda.motivo_rejeicao = undefined as any;

    delete (demanda as any).dfd;
    const salva = await this.demandaRepository.save(demanda);
    // Quem monta o DFD (Configurações › Fluxo) é avisado: a demanda está pronta para entrar num DFD.
    // Quem pediu e também monta o DFD recebe só esse aviso (um aviso por pessoa).
    const planejamento = await this.pendenciaDfd.avisarDemandaAprovada(salva, autor.id);
    if (planejamento.requisitanteIncluido) return salva;
    await this.notificarRequisitante(
      salva,
      TipoNotificacao.DEMANDA_APROVADA,
      'Demanda aprovada ✅',
      `A demanda "${salva.descricao_sucinta_objeto || salva.unidade_requisitante}" foi aprovada por ${aprovadoPor}. Acompanhe o andamento na página da demanda.`,
    );
    return salva;
  }

  async rejeitar(id: string, motivo: string): Promise<Demanda> {
    const demanda = await this.findOne(id);

    if (demanda.status !== StatusDemanda.EM_ANALISE && demanda.status !== StatusDemanda.ENVIADA) {
      throw new BadRequestException('Demanda não está em análise');
    }

    if (!String(motivo ?? '').trim()) throw new BadRequestException('Informe o motivo da rejeição.');
    demanda.status = StatusDemanda.REJEITADA;
    demanda.motivo_rejeicao = String(motivo).trim().slice(0, 4000);

    delete (demanda as any).dfd;
    const salva = await this.demandaRepository.save(demanda);
    await this.notificarRequisitante(
      salva,
      TipoNotificacao.DEMANDA_REJEITADA,
      'Demanda rejeitada',
      `A demanda "${salva.descricao_sucinta_objeto || salva.unidade_requisitante}" foi rejeitada. Motivo: ${salva.motivo_rejeicao} — ajuste e envie de novo (botão "Voltar para rascunho").`,
    );
    return salva;
  }

  async voltarParaRascunho(id: string): Promise<Demanda> {
    const demanda = await this.findOne(id);

    await this.exigirDestravada(demanda, 'voltar para rascunho');

    demanda.status = StatusDemanda.RASCUNHO;
    demanda.data_envio = undefined as any;
    demanda.data_aprovacao = undefined as any;
    demanda.aprovado_por = undefined as any;
    demanda.aprovado_por_id = null;
    // o motivo da rejeição fica visível até o reenvio (o setor corrige com ele à vista)

    delete (demanda as any).dfd;
    return this.demandaRepository.save(demanda);
  }

  // ==================== ACOMPANHAMENTO (transparência p/ o requisitante) ====================

  /**
   * Linha do tempo da demanda depois de aprovada: PCA → processo → contrato.
   * Os vínculos já existem no banco (itens_demanda.item_pca_id,
   * licitacoes.demanda_id, contratos.licitacao_id) — aqui só expomos a cadeia.
   */
  async acompanhamento(id: string): Promise<any> {
    const demanda = await this.findOne(id);

    // PCA: itens consolidados a partir desta demanda
    const itensPca = await this.dataSource.query(
      `SELECT ip.numero_item, ip.descricao_objeto, p.ano_exercicio, p.status AS pca_status
       FROM itens_demanda idem
       JOIN itens_pca ip ON ip.id = idem.item_pca_id
       LEFT JOIN planos_contratacao_anual p ON p.id = ip.pca_id
       WHERE idem.demanda_id = $1
       ORDER BY ip.numero_item ASC`,
      [id],
    ).catch(() => []);

    // DFD consolidado em que a demanda entrou (unidade de planejamento)
    const dfd = await this.noDfd(id).catch(() => null);

    // Processo originado desta demanda: o vínculo antigo ou o do DFD consolidado (N demandas → 1 processo)
    const [licitacao] = await this.dataSource.query(
      `SELECT id, numero_processo, modalidade, fase, valor_total_estimado,
              data_publicacao_edital, data_homologacao, valor_homologado,
              link_pncp
       FROM licitacoes
       WHERE demanda_id = $1
          OR id IN (SELECT f.licitacao_id FROM dfds_consolidados f JOIN dfds_consolidados_demandas fd ON fd.dfd_id = f.id WHERE fd.demanda_id = $1)
       ORDER BY created_at ASC LIMIT 1`,
      [id],
    ).catch(() => [null]);
    // Estado da compra no PNCP: fila (E9)
    if (licitacao) await aplicarEstadoCompraPncp(this.dataSource.manager, [licitacao]);

    // Contratos do processo
    const contratos = licitacao
      ? await this.dataSource.query(
          `SELECT c.id, c.numero_contrato, c.status, c.data_assinatura,
                  c.fornecedor_razao_social, c.valor_global,
                  da.status AS assinatura_status
           FROM contratos c
           LEFT JOIN documentos_assinatura da ON da.id = c.documento_assinatura_id
           WHERE c.licitacao_id = $1 ORDER BY c.numero_contrato ASC`,
          [licitacao.id],
        ).catch(() => [])
      : [];

    return {
      demanda: {
        id: demanda.id,
        status: demanda.status,
        data_envio: demanda.data_envio,
        data_aprovacao: demanda.data_aprovacao,
        aprovado_por: demanda.aprovado_por,
        motivo_rejeicao: demanda.motivo_rejeicao,
      },
      pca: {
        consolidada: itensPca.length > 0,
        itens: itensPca,
      },
      dfd: dfd ?? null,
      processo: licitacao || null,
      contratos,
    };
  }

  // ==================== ITENS DA DEMANDA ====================

  async adicionarItem(demandaId: string, dados: Partial<ItemDemanda>): Promise<ItemDemanda> {
    const demanda = await this.findOne(demandaId);

    if (demanda.status !== StatusDemanda.RASCUNHO) {
      throw new BadRequestException('Só é possível adicionar itens em demandas em rascunho');
    }

    // Calcular valor total
    const valorUnitario = dados.valor_unitario_estimado || 0;
    const quantidade = dados.quantidade_estimada || 1;
    const valorTotal = valorUnitario * quantidade;

    const item = this.itemDemandaRepository.create({
      ...dados,
      demanda_id: demandaId,
      data_desejada_contratacao: (dados.data_desejada_contratacao || demanda.data_desejada_contratacao) as any,
      renovacao_contrato: dados.renovacao_contrato ?? demanda.renovacao_contrato ?? false,
      valor_total_estimado: valorTotal,
    });

    return this.itemDemandaRepository.save(item);
  }

  async atualizarItem(itemId: string, dados: Partial<ItemDemanda>): Promise<ItemDemanda> {
    const item = await this.itemDemandaRepository.findOne({
      where: { id: itemId },
      relations: ['demanda']
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    if (item.demanda.status !== StatusDemanda.RASCUNHO) {
      throw new BadRequestException('Só é possível editar itens em demandas em rascunho');
    }

    // Recalcular valor total se necessário
    const valorUnitario = dados.valor_unitario_estimado ?? item.valor_unitario_estimado ?? 0;
    const quantidade = dados.quantidade_estimada ?? item.quantidade_estimada ?? 1;
    dados.valor_total_estimado = valorUnitario * quantidade;

    Object.assign(item, dados);
    return this.itemDemandaRepository.save(item);
  }

  async removerItem(itemId: string): Promise<void> {
    const item = await this.itemDemandaRepository.findOne({
      where: { id: itemId },
      relations: ['demanda']
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    if (item.demanda.status !== StatusDemanda.RASCUNHO) {
      throw new BadRequestException('Só é possível remover itens em demandas em rascunho');
    }

    await this.itemDemandaRepository.remove(item);
  }

  // ==================== CONSOLIDAÇÃO PARA PCA ====================

  async getDemandasParaConsolidar(orgaoId: string, ano: number): Promise<Demanda[]> {
    const aprovadas = await this.demandaRepository.find({
      where: {
        orgao_id: orgaoId,
        ano_referencia: ano,
        status: StatusDemanda.APROVADA
      },
      relations: ['itens'],
      order: { unidade_requisitante: 'ASC' }
    });

    const orfas = await this.demandaRepository
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.itens', 'itens')
      .leftJoin('planos_contratacao_anual', 'pca', 'pca.id::text = d.pca_id')
      .where('d.orgao_id = :orgaoId', { orgaoId })
      .andWhere('d.ano_referencia = :ano', { ano })
      .andWhere('d.status = :status', { status: StatusDemanda.CONSOLIDADA })
      .andWhere('d.pca_id IS NOT NULL')
      .andWhere('pca.id IS NULL')
      .orderBy('d.unidade_requisitante', 'ASC')
      .getMany();

    if (orfas.length > 0) {
      const ids = orfas.map((demanda) => demanda.id);
      await this.itemDemandaRepository
        .createQueryBuilder()
        .update()
        .set({ item_pca_id: null } as any)
        .where('demanda_id IN (:...ids)', { ids })
        .execute();

      await this.demandaRepository
        .createQueryBuilder()
        .update()
        .set({ status: StatusDemanda.APROVADA, pca_id: null } as any)
        .where('id IN (:...ids)', { ids })
        .execute();

      orfas.forEach((demanda) => {
        demanda.status = StatusDemanda.APROVADA;
        demanda.pca_id = null as any;
      });
    }

    return [...aprovadas, ...orfas].sort((a, b) =>
      a.unidade_requisitante.localeCompare(b.unidade_requisitante, 'pt-BR')
    );
  }

  async marcarComoConsolidada(demandaId: string, pcaId: string): Promise<Demanda> {
    const demanda = await this.findOne(demandaId);

    if (demanda.status !== StatusDemanda.APROVADA) {
      throw new BadRequestException('Apenas demandas aprovadas podem ser consolidadas');
    }

    demanda.status = StatusDemanda.CONSOLIDADA;
    demanda.pca_id = pcaId;

    return this.demandaRepository.save(demanda);
  }

  // ==================== CONTRATAÇÕES FUTURAS ====================

  async listarContratacoesFuturas(orgaoId: string, ano: number): Promise<ContratacaoFutura[]> {
    const contratacoes = await this.contratacaoFuturaRepository.find({
      where: { orgao_id: orgaoId, ano_referencia: ano },
      order: { created_at: 'DESC' },
    });
    await this.preencherDemandasContratacoes(contratacoes);
    return contratacoes;
  }

  private async preencherDemandasContratacoes(contratacoes: ContratacaoFutura[]): Promise<void> {
    if (contratacoes.length === 0) return;

    const demandas = await this.demandaRepository.find({
      // demanda só aparece na contratação do MESMO órgão
      where: contratacoes.map((contratacao) => ({ contratacao_futura_id: contratacao.id, orgao_id: contratacao.orgao_id })),
      relations: ['itens'],
    });

    for (const contratacao of contratacoes) {
      contratacao.demandas = demandas.filter((demanda) => demanda.contratacao_futura_id === contratacao.id);
    }
  }

  async criarContratacaoFutura(orgaoId: string, dados: {
    ano_referencia: number;
    titulo: string;
    categoria: 'MATERIAL' | 'SERVICO' | 'OBRA' | 'OUTROS';
    descricao?: string;
    data_inicio_processo?: string;
    data_conclusao_processo?: string;
    prazo_estimado_dias?: number;
    demandaIds?: string[];
    codigo_unidade?: string;
  }): Promise<ContratacaoFutura> {
    const demandaIds = dados.demandaIds || [];
    const demandas = demandaIds.length > 0
      ? await this.demandaRepository.find({
          where: demandaIds.map((id) => ({ id, orgao_id: orgaoId, ano_referencia: dados.ano_referencia })),
          relations: ['itens'],
        })
      : [];

    if (demandaIds.length > 0 && demandas.length !== demandaIds.length) {
      throw new BadRequestException('Uma ou mais DFDs selecionadas não foram encontradas para este órgão e ano');
    }

    const valorTotal = demandas.reduce((total, demanda) => (
      total + (demanda.itens || []).reduce((subtotal, item) => subtotal + (Number(item.valor_total_estimado) || 0), 0)
    ), 0);

    const totalContratacoes = await this.contratacaoFuturaRepository.count({
      where: { orgao_id: orgaoId, ano_referencia: dados.ano_referencia },
    });
    const codigoUnidade = (dados.codigo_unidade || '10').trim() || '10';
    const identificador = `${codigoUnidade}-${totalContratacoes + 1}/${dados.ano_referencia}`;

    const contratacao = this.contratacaoFuturaRepository.create({
      orgao_id: orgaoId,
      ano_referencia: dados.ano_referencia,
      identificador,
      titulo: dados.titulo,
      categoria: dados.categoria || 'OUTROS',
      descricao: dados.descricao,
      data_inicio_processo: dados.data_inicio_processo as any,
      data_conclusao_processo: dados.data_conclusao_processo as any,
      prazo_estimado_dias: dados.prazo_estimado_dias,
      valor_total_estimado: valorTotal,
      status: StatusContratacaoFutura.EM_ELABORACAO,
    });

    const salva = await this.contratacaoFuturaRepository.save(contratacao);

    if (demandas.length > 0) {
      await this.demandaRepository.update(
        demandaIds,
        { contratacao_futura_id: salva.id } as any,
      );
    }

    const completa = await this.contratacaoFuturaRepository.findOne({ where: { id: salva.id } });
    if (!completa) throw new NotFoundException('Contratação futura não encontrada após criação');
    await this.preencherDemandasContratacoes([completa]);
    return completa;
  }

  async vincularDemandasContratacaoFutura(orgaoId: string, contratacaoId: string, demandaIds: string[]): Promise<ContratacaoFutura> {
    const contratacao = ehUuid(contratacaoId)
      ? await this.contratacaoFuturaRepository.findOne({ where: { id: contratacaoId, orgao_id: orgaoId } })
      : null;

    if (!contratacao) {
      throw new NotFoundException('Contratação futura não encontrada');
    }

    const demandas = await this.demandaRepository.find({
      where: demandaIds.map((id) => ({ id, orgao_id: orgaoId, ano_referencia: contratacao.ano_referencia })),
      relations: ['itens'],
    });

    if (demandas.length !== demandaIds.length) {
      throw new BadRequestException('Uma ou mais DFDs selecionadas não foram encontradas para esta contratação');
    }

    await this.demandaRepository.update(demandaIds, { contratacao_futura_id: contratacao.id } as any);

    const todasDemandas = await this.demandaRepository.find({
      where: { contratacao_futura_id: contratacao.id, orgao_id: orgaoId },
      relations: ['itens'],
    });
    contratacao.valor_total_estimado = todasDemandas.reduce((total, demanda) => (
      total + (demanda.itens || []).reduce((subtotal, item) => subtotal + (Number(item.valor_total_estimado) || 0), 0)
    ), 0);
    await this.contratacaoFuturaRepository.save(contratacao);

    const atualizada = await this.contratacaoFuturaRepository.findOne({ where: { id: contratacao.id } });
    if (!atualizada) throw new NotFoundException('Contratação futura não encontrada após atualização');
    await this.preencherDemandasContratacoes([atualizada]);
    return atualizada;
  }

  async vincularItemAoPCA(itemDemandaId: string, itemPcaId: string): Promise<ItemDemanda> {
    const item = await this.itemDemandaRepository.findOne({ where: { id: itemDemandaId } });
    
    if (!item) {
      throw new NotFoundException('Item da demanda não encontrado');
    }

    item.item_pca_id = itemPcaId;
    return this.itemDemandaRepository.save(item);
  }

  // ==================== ESTATÍSTICAS ====================

  async getEstatisticas(orgaoId: string, ano: number, escopo?: EscopoDemandas): Promise<{
    total: number;
    porStatus: { status: string; total: number; valor: number }[];
    porUnidade: { unidade: string; total: number; valor: number }[];
    valorTotal: number;
  }> {
    // mesmo escopo da lista: o requisitante não vê valores do órgão inteiro
    const demandas = await this.findAll({ orgaoId, ano, escopo });

    const porStatus: Record<string, { total: number; valor: number }> = {};
    const porUnidade: Record<string, { total: number; valor: number }> = {};
    let valorTotal = 0;

    for (const demanda of demandas) {
      // Por status
      if (!porStatus[demanda.status]) {
        porStatus[demanda.status] = { total: 0, valor: 0 };
      }
      porStatus[demanda.status].total++;

      // Por unidade
      if (!porUnidade[demanda.unidade_requisitante]) {
        porUnidade[demanda.unidade_requisitante] = { total: 0, valor: 0 };
      }
      porUnidade[demanda.unidade_requisitante].total++;

      // Somar valores dos itens
      for (const item of demanda.itens || []) {
        const valor = Number(item.valor_total_estimado) || 0;
        porStatus[demanda.status].valor += valor;
        porUnidade[demanda.unidade_requisitante].valor += valor;
        valorTotal += valor;
      }
    }

    return {
      total: demandas.length,
      porStatus: Object.entries(porStatus).map(([status, dados]) => ({
        status,
        ...dados
      })),
      porUnidade: Object.entries(porUnidade).map(([unidade, dados]) => ({
        unidade,
        ...dados
      })),
      valorTotal
    };
  }

  // ==================== UNIDADES REQUISITANTES ====================

  async getUnidadesRequisitantes(orgaoId: string, escopo?: EscopoDemandas): Promise<string[]> {
    const query = this.demandaRepository
      .createQueryBuilder('d')
      .select('DISTINCT d.unidade_requisitante', 'unidade')
      .where('d.orgao_id = :orgaoId', { orgaoId })
      .andWhere('d.unidade_requisitante IS NOT NULL');
    const cond = escopo ? condicaoSqlDoEscopo(escopo, 'd') : null;
    if (cond) query.andWhere(cond.sql, cond.params);
    const result = await query.orderBy('d.unidade_requisitante', 'ASC').getRawMany();

    return result.map(r => r.unidade);
  }
}

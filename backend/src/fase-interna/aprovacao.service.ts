import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  FluxoAprovacaoDocumento,
  AprovacaoDocumento,
  StatusEtapaAprovacao,
  EtapaFluxoDef,
} from './entities/fluxo-aprovacao.entity';
import {
  DocumentoFaseInterna,
  StatusDocumento,
  TipoDocumentoFaseInterna,
} from './entities/documento-fase-interna.entity';
import { AcaoLogFaseInterna } from './entities/log-fase-interna.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { AuditLogService, ContextoUsuario } from './audit-log.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { TipoNotificacao } from '../notificacoes/entities/notificacao.entity';
import { MODALIDADES_CONTRATACAO_DIRETA } from './documentos-obrigatorios';
import {
  FluxoEntrada,
  conflitoDeFluxo,
  fluxoEhGenerico,
  fluxoParaTipo,
  responsavelDaEtapa,
  tituloDoTipo,
  tiposDoFluxo,
  validarFluxoAprovacao,
} from './aprovacao-pecas-regras';
import { passoDaPeca } from './tarefas/etapas-fase-interna';
import { destinoDaTarefa } from './tarefas/tarefa-regras';

const APP_URL = () => process.env.APP_URL || 'https://portaldcp.com.br';
/** Para onde o aviso leva o aprovador: a Central de Aprovações, aba Documentos. */
export const LINK_CENTRAL_DOCUMENTOS = '/orgao/aprovacoes?tab=documentos';

interface Destinatario {
  id: string;
  email?: string;
  telefone?: string;
}

/**
 * Fluxo de aprovação multi-etapa de documentos da fase interna (estilo SEI).
 *
 * Configuração por órgão em `fluxos_aprovacao_documento` (por tipo de peça —
 * um fluxo pode valer para vários tipos —, com fallback para o fluxo genérico
 * do órgão). Sem fluxo configurado, a submissão cria uma etapa única
 * ("Aprovação") sem responsável: decide quem conduz o processo.
 *
 * Decisões: SEMPRE pelo usuário do token (o corpo não informa quem decide) —
 * a checagem de "a etapa é sua" fica em `AprovacaoPecasService`.
 */
@Injectable()
export class AprovacaoService {
  private readonly logger = new Logger(AprovacaoService.name);

  constructor(
    @InjectRepository(FluxoAprovacaoDocumento)
    private readonly fluxoRepo: Repository<FluxoAprovacaoDocumento>,
    @InjectRepository(AprovacaoDocumento)
    private readonly etapaRepo: Repository<AprovacaoDocumento>,
    @InjectRepository(DocumentoFaseInterna)
    private readonly docRepo: Repository<DocumentoFaseInterna>,
    @InjectRepository(Licitacao)
    private readonly licitacaoRepo: Repository<Licitacao>,
    private readonly auditLog: AuditLogService,
    @Optional() private readonly notificacoes?: NotificacoesService,
  ) {}

  // ==========================================================================
  // CONFIGURAÇÃO DE FLUXOS (por órgão)
  // ==========================================================================

  async listarFluxos(orgaoId: string) {
    const fluxos = await this.fluxoRepo.find({
      where: { orgao_id: orgaoId },
      order: { tipo_documento: 'ASC', updated_at: 'DESC' },
    });
    return fluxos.map((f) => this.comResumo(f));
  }

  /** Fluxo com os tipos (e títulos) e a marca de genérico, para a tela. */
  comResumo(f: FluxoAprovacaoDocumento) {
    const tipos = tiposDoFluxo(f);
    return {
      ...f,
      tipos,
      tipos_titulos: tipos.map((t) => ({ tipo: t, titulo: tituloDoTipo(t) })),
      generico: fluxoEhGenerico(f),
    };
  }

  /** Setores e usuários ATIVOS do órgão (para validar e nomear as etapas). */
  private async contextoDoOrgao(orgaoId: string) {
    const setores: Array<{ id: string; nome: string }> = await this.fluxoRepo.manager.query(
      `SELECT id::text AS id, nome FROM setores WHERE orgao_id::text = $1`,
      [orgaoId],
    );
    const usuarios: Array<{ id: string; nome: string }> = await this.fluxoRepo.manager.query(
      `SELECT id::text AS id, COALESCE(nome, email) AS nome FROM usuarios WHERE orgao_id::text = $1`,
      [orgaoId],
    );
    return {
      setores: new Map(setores.map((s) => [s.id, s.nome])),
      usuarios: new Map(usuarios.map((u) => [u.id, u.nome])),
    };
  }

  private async validarENormalizar(orgaoId: string, corpo: FluxoEntrada, idAtual?: string) {
    const r = validarFluxoAprovacao(corpo, await this.contextoDoOrgao(orgaoId));
    if (!r.ok) throw new BadRequestException({ message: r.erros.join(' '), erros: r.erros });
    const outros = await this.fluxoRepo.find({ where: { orgao_id: orgaoId, ativo: true } });
    const conflito = conflitoDeFluxo(outros, { id: idAtual ?? null, tipos: tiposDoFluxo(r.valor) });
    if (conflito) {
      throw new ConflictException(
        conflito.tipos.length
          ? `O fluxo "${conflito.fluxo.nome}" já vale para ${conflito.tipos.map(tituloDoTipo).join(', ')} — edite-o ou remova-o antes.`
          : `O órgão já tem um fluxo genérico ("${conflito.fluxo.nome}") — edite-o ou remova-o antes.`,
      );
    }
    return r.valor;
  }

  async criarFluxo(orgaoId: string, corpo: FluxoEntrada, autor?: { id?: string | null; nome?: string | null }) {
    if (!orgaoId) throw new BadRequestException('Órgão não identificado');
    const valor = await this.validarENormalizar(orgaoId, corpo);
    const salvo = await this.fluxoRepo.save(
      this.fluxoRepo.create({
        ...valor,
        tipo_documento: valor.tipo_documento as TipoDocumentoFaseInterna | null,
        orgao_id: orgaoId,
        criado_por_id: autor?.id ?? undefined,
        criado_por_nome: autor?.nome ?? undefined,
      }),
    );
    return this.comResumo(salvo);
  }

  async atualizarFluxo(id: string, corpo: FluxoEntrada) {
    const fluxo = await this.fluxoRepo.findOne({ where: { id } });
    if (!fluxo) throw new NotFoundException('Fluxo de aprovação não encontrado');
    const mesclado: FluxoEntrada = {
      nome: corpo?.nome ?? fluxo.nome,
      tipo_documento: corpo?.tipo_documento !== undefined ? corpo.tipo_documento : fluxo.tipo_documento,
      tipos_documento:
        corpo?.tipos_documento !== undefined
          ? corpo.tipos_documento
          : corpo?.tipo_documento !== undefined
            ? null
            : fluxo.tipos_documento,
      modelo_origem: corpo?.modelo_origem !== undefined ? corpo.modelo_origem : fluxo.modelo_origem,
      etapas: corpo?.etapas ?? fluxo.etapas,
    };
    const valor = await this.validarENormalizar(fluxo.orgao_id, mesclado, fluxo.id);
    Object.assign(fluxo, valor, { tipo_documento: valor.tipo_documento as TipoDocumentoFaseInterna | null });
    return this.comResumo(await this.fluxoRepo.save(fluxo));
  }

  async removerFluxo(id: string) {
    const fluxo = await this.fluxoRepo.findOne({ where: { id } });
    if (!fluxo) throw new NotFoundException('Fluxo de aprovação não encontrado');
    fluxo.ativo = false;
    return this.fluxoRepo.save(fluxo);
  }

  /** Fluxos ativos do órgão (resolução por tipo feita em memória). */
  async fluxosAtivos(orgaoId: string): Promise<FluxoAprovacaoDocumento[]> {
    return this.fluxoRepo.find({ where: { orgao_id: orgaoId, ativo: true } });
  }

  /** Fluxo efetivo: próprio do tipo → genérico do órgão → null (etapa única). */
  async resolverFluxo(orgaoId: string, tipo: TipoDocumentoFaseInterna | string): Promise<FluxoAprovacaoDocumento | null> {
    return fluxoParaTipo(await this.fluxosAtivos(orgaoId), tipo);
  }

  // ==========================================================================
  // INSTÂNCIA: SUBMISSÃO E DECISÕES
  // ==========================================================================

  /**
   * Submete o documento para aprovação, instanciando as etapas do fluxo.
   * `opcoes.automatica`: enviada sozinha ao emitir/anexar (aprovação interna
   * da etapa); `opcoes.por`: quem fez a peça (recebe a devolução).
   */
  async submeter(
    documentoId: string,
    contexto?: ContextoUsuario,
    opcoes: { automatica?: boolean; por?: { id?: string | null; nome?: string | null } | null } = {},
  ): Promise<{ documento: DocumentoFaseInterna; etapas: AprovacaoDocumento[] }> {
    const documento = await this.docRepo.findOneBy({ id: documentoId });
    if (!documento) throw new NotFoundException('Documento não encontrado');
    const aceitos = [StatusDocumento.EM_ELABORACAO, StatusDocumento.PENDENTE, StatusDocumento.REPROVADO];
    // Anexada pela etapa (feita fora) também passa pela conferência interna
    if (opcoes.automatica) aceitos.push(StatusDocumento.IMPORTADO);
    if (!aceitos.includes(documento.status)) {
      throw new BadRequestException('Documento não está em elaboração');
    }

    const licitacao = await this.licitacaoRepo.findOne({
      where: { id: documento.licitacao_id },
    });
    if (!licitacao) throw new NotFoundException('Licitação não encontrada');

    // Cancela etapas de submissões anteriores (ex.: reprovado e reenviado)
    await this.etapaRepo
      .createQueryBuilder()
      .update()
      .set({ status: StatusEtapaAprovacao.CANCELADA })
      .where('documento_id = :documentoId', { documentoId })
      .andWhere('status IN (:...abertos)', {
        abertos: [StatusEtapaAprovacao.PENDENTE, StatusEtapaAprovacao.EM_ANALISE],
      })
      .execute();

    const fluxo = await this.resolverFluxo(licitacao.orgao_id, documento.tipo);
    const defs: EtapaFluxoDef[] =
      fluxo?.etapas?.length
        ? [...fluxo.etapas].sort((a, b) => a.ordem - b.ordem)
        : [{ ordem: 1, nome: 'Aprovação', exige_assinatura: false }];
    const [ult] = await this.etapaRepo.query(
      `SELECT COALESCE(MAX(rodada), 0)::int AS r FROM aprovacoes_documento WHERE documento_id = $1`,
      [documentoId],
    );
    const rodada = Number(ult?.r ?? 0) + 1;
    const por = opcoes.por ?? { id: contexto?.usuario_id ?? null, nome: contexto?.usuario_nome ?? null };

    const etapas: AprovacaoDocumento[] = [];
    for (let i = 0; i < defs.length; i++) {
      const def = defs[i];
      etapas.push(
        this.etapaRepo.create({
          documento_id: documento.id,
          licitacao_id: documento.licitacao_id,
          fluxo_id: fluxo?.id,
          ordem: i + 1,
          rodada,
          nome: def.nome,
          setor_id: def.setor_id,
          setor_nome: def.setor_nome,
          usuario_id: def.usuario_id,
          usuario_nome: def.usuario_nome,
          exige_assinatura: !!def.exige_assinatura,
          status: i === 0 ? StatusEtapaAprovacao.EM_ANALISE : StatusEtapaAprovacao.PENDENTE,
          submetido_por_id: por?.id ?? null,
          submetido_por_nome: por?.nome ?? null,
          automatica: !!opcoes.automatica,
        }),
      );
    }
    const salvas = await this.etapaRepo.save(etapas);

    documento.status = StatusDocumento.AGUARDANDO_APROVACAO;
    await this.docRepo.save(documento);

    await this.auditLog.log({
      licitacao_id: documento.licitacao_id,
      documento_id: documento.id,
      acao: AcaoLogFaseInterna.DOCUMENTO_SUBMETIDO,
      descricao: `Documento ${opcoes.automatica ? 'enviado automaticamente ' : 'submetido '}para aprovação interna (${salvas.length} etapa(s)${fluxo ? ` — fluxo "${fluxo.nome}"` : ' — aprovação única, sem fluxo cadastrado'})`,
      dados_depois: { rodada, automatica: !!opcoes.automatica, etapas: salvas.map((e) => ({ ordem: e.ordem, nome: e.nome })) },
      contexto,
    });

    await this.notificarResponsavel(licitacao, documento, salvas[0], salvas.length);
    return { documento, etapas: salvas };
  }

  /**
   * Aprova a etapa atual; se for a última, aprova o documento. Peça já
   * ASSINADA na decisão (etapa com assinatura) continua ASSINADA.
   */
  async aprovarEtapa(
    etapaId: string,
    usuario: { id?: string; nome?: string },
    justificativa?: string,
    contexto?: ContextoUsuario,
  ): Promise<{ etapa: AprovacaoDocumento; documentoAprovado: boolean }> {
    const etapa = await this.obterEtapaEmAnalise(etapaId);

    this.etapaRepo.merge(etapa, {
      status: StatusEtapaAprovacao.APROVADA,
      decidido_por_id: usuario.id,
      decidido_por_nome: usuario.nome,
      data_decisao: new Date(),
      justificativa,
    });
    await this.etapaRepo.save(etapa);

    const documento = await this.docRepo.findOneBy({ id: etapa.documento_id });
    if (!documento) throw new NotFoundException('Documento não encontrado');

    await this.auditLog.log({
      licitacao_id: etapa.licitacao_id,
      documento_id: etapa.documento_id,
      acao: AcaoLogFaseInterna.ETAPA_APROVACAO_APROVADA,
      descricao: `Etapa "${etapa.nome}" aprovada por ${usuario.nome || 'usuário'}`,
      dados_depois: { etapa_id: etapa.id, justificativa },
      contexto,
    });

    // Etapa que exige assinatura marca o documento como pendente de assinatura
    if (etapa.exige_assinatura && !documento.exige_assinatura) {
      documento.exige_assinatura = true;
    }

    const proxima = await this.etapaRepo.findOne({
      where: { documento_id: etapa.documento_id, rodada: etapa.rodada, status: StatusEtapaAprovacao.PENDENTE },
      order: { ordem: 'ASC' },
    });

    let documentoAprovado = false;
    if (proxima) {
      proxima.status = StatusEtapaAprovacao.EM_ANALISE;
      await this.etapaRepo.save(proxima);
      await this.docRepo.save(documento);
      const licitacao = await this.licitacaoRepo.findOne({ where: { id: etapa.licitacao_id } });
      const total = await this.etapaRepo.count({ where: { documento_id: etapa.documento_id, rodada: etapa.rodada } });
      if (licitacao) await this.notificarResponsavel(licitacao, documento, proxima, total);
    } else {
      // Última etapa: documento aprovado (a assinada continua ASSINADA)
      this.docRepo.merge(documento, {
        status: documento.status === StatusDocumento.ASSINADO ? StatusDocumento.ASSINADO : StatusDocumento.APROVADO,
        aprovador_id: usuario.id,
        aprovador_nome: usuario.nome,
        data_aprovacao: new Date(),
        observacao_aprovacao: justificativa,
      });
      await this.docRepo.save(documento);
      documentoAprovado = true;

      await this.auditLog.log({
        licitacao_id: etapa.licitacao_id,
        documento_id: etapa.documento_id,
        acao: AcaoLogFaseInterna.DOCUMENTO_APROVADO,
        descricao: `Documento aprovado (todas as etapas concluídas)`,
        contexto,
      });
    }

    return { etapa, documentoAprovado };
  }

  /**
   * Reprova a etapa atual: documento REPROVADO (volta para elaboração) e
   * etapas restantes canceladas; quem fez a peça é avisado com o motivo.
   */
  async reprovarEtapa(
    etapaId: string,
    usuario: { id?: string; nome?: string },
    justificativa: string,
    contexto?: ContextoUsuario,
  ): Promise<AprovacaoDocumento> {
    if (!justificativa?.trim()) {
      throw new BadRequestException('A justificativa da reprovação é obrigatória');
    }
    const etapa = await this.obterEtapaEmAnalise(etapaId);

    this.etapaRepo.merge(etapa, {
      status: StatusEtapaAprovacao.REPROVADA,
      decidido_por_id: usuario.id,
      decidido_por_nome: usuario.nome,
      data_decisao: new Date(),
      justificativa: justificativa.trim(),
    });
    await this.etapaRepo.save(etapa);

    await this.etapaRepo
      .createQueryBuilder()
      .update()
      .set({ status: StatusEtapaAprovacao.CANCELADA })
      .where('documento_id = :documentoId', { documentoId: etapa.documento_id })
      .andWhere('status = :pendente', { pendente: StatusEtapaAprovacao.PENDENTE })
      .execute();

    const documento = await this.docRepo.findOneBy({ id: etapa.documento_id });
    if (documento) {
      this.docRepo.merge(documento, {
        status: StatusDocumento.REPROVADO,
        aprovador_id: usuario.id,
        aprovador_nome: usuario.nome,
        observacao_aprovacao: justificativa.trim(),
      });
      await this.docRepo.save(documento);
    }

    await this.auditLog.log({
      licitacao_id: etapa.licitacao_id,
      documento_id: etapa.documento_id,
      acao: AcaoLogFaseInterna.ETAPA_APROVACAO_REPROVADA,
      descricao: `Etapa "${etapa.nome}" reprovada por ${usuario.nome || 'usuário'}: ${justificativa.trim()}`,
      dados_depois: { etapa_id: etapa.id, justificativa },
      contexto,
    });

    if (documento) await this.avisarDevolucao(documento, etapa, usuario.nome ?? null, justificativa.trim());
    return etapa;
  }

  /** Etapas de aprovação de um documento (trilha completa, rodada mais recente primeiro). */
  async listarEtapasDocumento(documentoId: string): Promise<AprovacaoDocumento[]> {
    return this.etapaRepo.find({
      where: { documento_id: documentoId },
      order: { rodada: 'DESC', ordem: 'ASC', created_at: 'DESC' },
    });
  }

  /**
   * Caixa por filtro EXPLÍCITO (login do órgão/ADMIN consultando um setor ou
   * uma pessoa do órgão): etapas EM_ANALISE atribuídas ao usuário e/ou setor.
   */
  async caixaAprovacoes(filtro: { usuarioId?: string; setorId?: string; orgaoId?: string }) {
    const qb = this.etapaRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.documento', 'documento')
      .where('e.status = :status', { status: StatusEtapaAprovacao.EM_ANALISE })
      .orderBy('e.created_at', 'ASC');
    // Isolamento (E1a): só etapas de processos do órgão do ator
    if (filtro.orgaoId) {
      qb.andWhere('e.licitacao_id IN (SELECT l.id::text FROM licitacoes l WHERE l.orgao_id = :orgaoId)', { orgaoId: filtro.orgaoId });
    }

    if (filtro.usuarioId && filtro.setorId) {
      qb.andWhere('(e.usuario_id = :usuarioId OR (e.usuario_id IS NULL AND e.setor_id = :setorId))', {
        usuarioId: filtro.usuarioId,
        setorId: filtro.setorId,
      });
    } else if (filtro.usuarioId) {
      qb.andWhere('e.usuario_id = :usuarioId', { usuarioId: filtro.usuarioId });
    } else if (filtro.setorId) {
      qb.andWhere('e.usuario_id IS NULL AND e.setor_id = :setorId', { setorId: filtro.setorId });
    } else {
      throw new BadRequestException('Informe usuarioId e/ou setorId');
    }
    return qb.getMany();
  }

  // ==========================================================================
  // AUXILIARES
  // ==========================================================================

  async obterEtapa(etapaId: string): Promise<AprovacaoDocumento> {
    const etapa = await this.etapaRepo.findOne({ where: { id: etapaId } });
    if (!etapa) throw new NotFoundException('Etapa de aprovação não encontrada');
    return etapa;
  }

  private async obterEtapaEmAnalise(etapaId: string): Promise<AprovacaoDocumento> {
    const etapa = await this.obterEtapa(etapaId);
    if (etapa.status !== StatusEtapaAprovacao.EM_ANALISE) {
      throw new BadRequestException('Esta etapa não está em análise');
    }
    return etapa;
  }

  /** É a última etapa da rodada? (a assinatura fecha a peça) */
  async ehUltimaDaRodada(etapa: AprovacaoDocumento): Promise<boolean> {
    const depois = await this.etapaRepo
      .createQueryBuilder('e')
      .where('e.documento_id = :d AND e.rodada = :r AND e.ordem > :o', { d: etapa.documento_id, r: etapa.rodada, o: etapa.ordem })
      .andWhere('e.status <> :c', { c: StatusEtapaAprovacao.CANCELADA })
      .getCount();
    return depois === 0;
  }

  /** Pessoas avisadas de uma etapa: a pessoa; senão o setor; senão quem conduz o processo. */
  private async destinatariosDaEtapa(licitacao: Licitacao, etapa: AprovacaoDocumento): Promise<Destinatario[]> {
    const q = (sql: string, p: unknown[]) => this.etapaRepo.manager.query(sql, p);
    let linhas: Array<{ id: string; email: string | null; telefone: string | null }> = [];
    if (etapa.usuario_id) {
      linhas = await q(`SELECT id::text AS id, email, telefone FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2 AND ativo = true`, [etapa.usuario_id, licitacao.orgao_id]);
      if (!linhas.length && etapa.usuario_id === licitacao.orgao_id) return [{ id: licitacao.orgao_id }];
    } else if (etapa.setor_id) {
      linhas = await q(`SELECT id::text AS id, email, telefone FROM usuarios WHERE setor_id::text = $1 AND orgao_id::text = $2 AND ativo = true`, [etapa.setor_id, licitacao.orgao_id]);
    } else if (licitacao.pregoeiro_id) {
      linhas = await q(`SELECT id::text AS id, email, telefone FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2 AND ativo = true`, [licitacao.pregoeiro_id, licitacao.orgao_id]);
    }
    if (!linhas.length) return [{ id: licitacao.orgao_id }]; // sem ninguém: o login do órgão (sino)
    return linhas.map((u) => ({ id: u.id, email: u.email || undefined, telefone: u.telefone || undefined }));
  }

  /** Aviso ao aprovador da etapa: sino + e-mail + WhatsApp (link para a Central). */
  private async notificarResponsavel(licitacao: Licitacao, documento: DocumentoFaseInterna, etapa: AprovacaoDocumento, total: number) {
    if (!this.notificacoes) return;
    try {
      const para = await this.destinatariosDaEtapa(licitacao, etapa);
      const peca = documento.titulo || tituloDoTipo(documento.tipo);
      await this.notificacoes.criarParaMultiplos(para, {
        orgao_id: licitacao.orgao_id,
        tipo: TipoNotificacao.DOCUMENTO_AGUARDANDO_APROVACAO,
        titulo: `Peça aguardando a sua aprovação: ${peca}`,
        mensagem: `Processo ${licitacao.numero_processo ?? ''} — etapa ${etapa.ordem} de ${Math.max(total, etapa.ordem)}: "${etapa.nome}" (${responsavelDaEtapa(etapa)}). Confira e aprove ou devolva com o motivo em Aprovações › Documentos.`,
        entidade_tipo: 'DOCUMENTO_FASE_INTERNA',
        entidade_id: documento.id,
        link: LINK_CENTRAL_DOCUMENTOS,
        metadata: { whatsapp_url: `${APP_URL()}${LINK_CENTRAL_DOCUMENTOS}`, etapa_id: etapa.id, licitacao_id: licitacao.id },
        enviar_email: true,
      });
    } catch (e: any) {
      this.logger.warn(`Falha ao notificar responsável pela etapa: ${e?.message ?? e}`);
    }
  }

  /** Reprovada: volta para quem fez a peça, com o motivo (sino + e-mail + WhatsApp). */
  private async avisarDevolucao(documento: DocumentoFaseInterna, etapa: AprovacaoDocumento, quem: string | null, motivo: string) {
    if (!this.notificacoes) return;
    try {
      const licitacao = await this.licitacaoRepo.findOne({ where: { id: documento.licitacao_id } });
      if (!licitacao) return;
      const autorId = (documento.dados_estruturados?._emitido?.por_id as string | undefined) || etapa.submetido_por_id || documento.criado_por_id || null;
      const [u] = autorId
        ? await this.etapaRepo.manager.query(`SELECT id::text AS id, email, telefone FROM usuarios WHERE id::text = $1 AND orgao_id::text = $2 AND ativo = true`, [autorId, licitacao.orgao_id])
        : [];
      const para: Destinatario[] = u ? [{ id: u.id, email: u.email || undefined, telefone: u.telefone || undefined }] : [{ id: licitacao.orgao_id }];
      const direta = MODALIDADES_CONTRATACAO_DIRETA.includes(String(licitacao.modalidade ?? ''));
      const link = destinoDaTarefa({ licitacao_id: licitacao.id, passo: passoDaPeca(documento.tipo, direta), tipo_peca: documento.tipo });
      const peca = documento.titulo || tituloDoTipo(documento.tipo);
      await this.notificacoes.criarParaMultiplos(para, {
        orgao_id: licitacao.orgao_id,
        tipo: TipoNotificacao.SISTEMA,
        titulo: `Peça devolvida para correção: ${peca}`,
        mensagem: `Processo ${licitacao.numero_processo ?? ''} — "${etapa.nome}" reprovada${quem ? ` por ${quem}` : ''}. Motivo: ${motivo}. Corrija e gere a peça de novo: ela volta sozinha para a aprovação.`,
        entidade_tipo: 'DOCUMENTO_FASE_INTERNA',
        entidade_id: documento.id,
        link,
        metadata: { whatsapp_url: `${APP_URL()}${link}` },
        enviar_email: true,
      });
    } catch (e: any) {
      this.logger.warn(`Falha ao avisar a devolução da peça: ${e?.message ?? e}`);
    }
  }
}

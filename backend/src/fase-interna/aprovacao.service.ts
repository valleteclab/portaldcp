import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

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

/**
 * Fluxo de aprovação multi-etapa de documentos da fase interna (estilo SEI).
 *
 * Configuração por órgão em `fluxos_aprovacao_documento` (por tipo de documento,
 * com fallback para o fluxo genérico do órgão). Sem fluxo configurado, a submissão
 * cria uma etapa única ("Aprovação") — comportamento equivalente ao legado.
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
    return this.fluxoRepo.find({
      where: { orgao_id: orgaoId },
      order: { tipo_documento: 'ASC', updated_at: 'DESC' },
    });
  }

  async criarFluxo(dados: Partial<FluxoAprovacaoDocumento>) {
    if (!dados.orgao_id || !dados.nome) {
      throw new BadRequestException('orgao_id e nome são obrigatórios');
    }
    this.validarEtapas(dados.etapas || []);
    return this.fluxoRepo.save(this.fluxoRepo.create(dados));
  }

  async atualizarFluxo(id: string, dados: Partial<FluxoAprovacaoDocumento>) {
    const fluxo = await this.fluxoRepo.findOne({ where: { id } });
    if (!fluxo) throw new NotFoundException('Fluxo de aprovação não encontrado');
    if (dados.etapas) this.validarEtapas(dados.etapas);
    delete (dados as any).id;
    delete (dados as any).orgao_id;
    Object.assign(fluxo, dados);
    return this.fluxoRepo.save(fluxo);
  }

  async removerFluxo(id: string) {
    const fluxo = await this.fluxoRepo.findOne({ where: { id } });
    if (!fluxo) throw new NotFoundException('Fluxo de aprovação não encontrado');
    fluxo.ativo = false;
    return this.fluxoRepo.save(fluxo);
  }

  /** Fluxo efetivo: específico do tipo → genérico do órgão → null (etapa única). */
  async resolverFluxo(
    orgaoId: string,
    tipo: TipoDocumentoFaseInterna,
  ): Promise<FluxoAprovacaoDocumento | null> {
    const especifico = await this.fluxoRepo.findOne({
      where: { orgao_id: orgaoId, tipo_documento: tipo, ativo: true },
      order: { updated_at: 'DESC' },
    });
    if (especifico) return especifico;
    return this.fluxoRepo.findOne({
      where: { orgao_id: orgaoId, tipo_documento: IsNull(), ativo: true },
      order: { updated_at: 'DESC' },
    });
  }

  // ==========================================================================
  // INSTÂNCIA: SUBMISSÃO E DECISÕES
  // ==========================================================================

  /**
   * Submete o documento para aprovação, instanciando as etapas do fluxo.
   * Substitui (e engloba) o submeterParaAprovacao legado.
   */
  async submeter(
    documentoId: string,
    contexto?: ContextoUsuario,
  ): Promise<{ documento: DocumentoFaseInterna; etapas: AprovacaoDocumento[] }> {
    const documento = await this.docRepo.findOneBy({ id: documentoId });
    if (!documento) throw new NotFoundException('Documento não encontrado');
    if (
      ![StatusDocumento.EM_ELABORACAO, StatusDocumento.PENDENTE, StatusDocumento.REPROVADO].includes(
        documento.status,
      )
    ) {
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

    const etapas: AprovacaoDocumento[] = [];
    for (let i = 0; i < defs.length; i++) {
      const def = defs[i];
      etapas.push(
        this.etapaRepo.create({
          documento_id: documento.id,
          licitacao_id: documento.licitacao_id,
          fluxo_id: fluxo?.id,
          ordem: i + 1,
          nome: def.nome,
          setor_id: def.setor_id,
          setor_nome: def.setor_nome,
          usuario_id: def.usuario_id,
          usuario_nome: def.usuario_nome,
          exige_assinatura: !!def.exige_assinatura,
          status: i === 0 ? StatusEtapaAprovacao.EM_ANALISE : StatusEtapaAprovacao.PENDENTE,
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
      descricao: `Documento submetido para aprovação (${salvas.length} etapa(s)${fluxo ? ` — fluxo "${fluxo.nome}"` : ''})`,
      dados_depois: { etapas: salvas.map((e) => ({ ordem: e.ordem, nome: e.nome })) },
      contexto,
    });

    await this.notificarResponsavel(licitacao, documento, salvas[0]);
    return { documento, etapas: salvas };
  }

  /** Aprova a etapa atual; se for a última, aprova o documento. */
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
      where: { documento_id: etapa.documento_id, status: StatusEtapaAprovacao.PENDENTE },
      order: { ordem: 'ASC' },
    });

    let documentoAprovado = false;
    if (proxima) {
      proxima.status = StatusEtapaAprovacao.EM_ANALISE;
      await this.etapaRepo.save(proxima);
      await this.docRepo.save(documento);
      const licitacao = await this.licitacaoRepo.findOne({ where: { id: etapa.licitacao_id } });
      if (licitacao) await this.notificarResponsavel(licitacao, documento, proxima);
    } else {
      // Última etapa: documento aprovado
      this.docRepo.merge(documento, {
        status: StatusDocumento.APROVADO,
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

  /** Reprova a etapa atual: documento REPROVADO e etapas restantes canceladas. */
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
      descricao: `Etapa "${etapa.nome}" reprovada por ${usuario.nome || 'usuário'}`,
      dados_depois: { etapa_id: etapa.id, justificativa },
      contexto,
    });

    return etapa;
  }

  /** Etapas de aprovação de um documento (trilha completa). */
  async listarEtapasDocumento(documentoId: string): Promise<AprovacaoDocumento[]> {
    return this.etapaRepo.find({
      where: { documento_id: documentoId },
      order: { created_at: 'DESC', ordem: 'ASC' },
    });
  }

  /** Caixa de aprovações: etapas EM_ANALISE atribuídas ao usuário e/ou setor. */
  async caixaAprovacoes(filtro: { usuarioId?: string; setorId?: string }) {
    const qb = this.etapaRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.documento', 'documento')
      .where('e.status = :status', { status: StatusEtapaAprovacao.EM_ANALISE })
      .orderBy('e.created_at', 'ASC');

    if (filtro.usuarioId && filtro.setorId) {
      qb.andWhere(
        '(e.usuario_id = :usuarioId OR e.setor_id = :setorId OR (e.usuario_id IS NULL AND e.setor_id IS NULL))',
        { usuarioId: filtro.usuarioId, setorId: filtro.setorId },
      );
    } else if (filtro.usuarioId) {
      qb.andWhere('(e.usuario_id = :usuarioId OR (e.usuario_id IS NULL AND e.setor_id IS NULL))', {
        usuarioId: filtro.usuarioId,
      });
    } else if (filtro.setorId) {
      qb.andWhere('e.setor_id = :setorId', { setorId: filtro.setorId });
    } else {
      throw new BadRequestException('Informe usuarioId e/ou setorId');
    }
    return qb.getMany();
  }

  // ==========================================================================
  // AUXILIARES
  // ==========================================================================

  private async obterEtapaEmAnalise(etapaId: string): Promise<AprovacaoDocumento> {
    const etapa = await this.etapaRepo.findOne({ where: { id: etapaId } });
    if (!etapa) throw new NotFoundException('Etapa de aprovação não encontrada');
    if (etapa.status !== StatusEtapaAprovacao.EM_ANALISE) {
      throw new BadRequestException('Esta etapa não está em análise');
    }
    return etapa;
  }

  private validarEtapas(etapas: EtapaFluxoDef[]) {
    if (!etapas.length) {
      throw new BadRequestException('O fluxo precisa de pelo menos uma etapa');
    }
    for (const e of etapas) {
      if (!e.nome?.trim()) {
        throw new BadRequestException('Toda etapa do fluxo precisa de nome');
      }
    }
  }

  private async notificarResponsavel(
    licitacao: Licitacao,
    documento: DocumentoFaseInterna,
    etapa: AprovacaoDocumento,
  ) {
    if (!this.notificacoes || !etapa.usuario_id) return;
    try {
      await this.notificacoes.criar({
        orgao_id: licitacao.orgao_id,
        usuario_id: etapa.usuario_id,
        tipo: TipoNotificacao.DOCUMENTO_AGUARDANDO_APROVACAO,
        titulo: `Documento aguardando sua análise: ${documento.titulo}`,
        mensagem: `Etapa "${etapa.nome}" do processo ${licitacao.numero_processo}`,
        entidade_tipo: 'DOCUMENTO_FASE_INTERNA',
        entidade_id: documento.id,
        link: `/orgao/fase-interna/processos/${licitacao.id}`,
      });
    } catch (e) {
      this.logger.warn(`Falha ao notificar responsável pela etapa: ${e.message}`);
    }
  }
}

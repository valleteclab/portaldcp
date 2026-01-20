import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Notificacao, TipoNotificacao, PrioridadeNotificacao } from './entities/notificacao.entity';

export interface CriarNotificacaoDto {
  orgao_id: string;
  usuario_id: string;
  usuario_email?: string;
  tipo: TipoNotificacao;
  titulo: string;
  mensagem: string;
  prioridade?: PrioridadeNotificacao;
  entidade_tipo?: string;
  entidade_id?: string;
  link?: string;
  metadata?: Record<string, any>;
  enviar_email?: boolean;
}

@Injectable()
export class NotificacoesService {
  private readonly logger = new Logger(NotificacoesService.name);

  constructor(
    @InjectRepository(Notificacao)
    private readonly notificacaoRepository: Repository<Notificacao>,
  ) {}

  /**
   * Cria uma nova notificação
   */
  async criar(dto: CriarNotificacaoDto): Promise<Notificacao> {
    const notificacao = this.notificacaoRepository.create({
      orgao_id: dto.orgao_id,
      usuario_id: dto.usuario_id,
      usuario_email: dto.usuario_email || null,
      tipo: dto.tipo,
      titulo: dto.titulo,
      mensagem: dto.mensagem,
      prioridade: dto.prioridade || PrioridadeNotificacao.NORMAL,
      entidade_tipo: dto.entidade_tipo || null,
      entidade_id: dto.entidade_id || null,
      link: dto.link || null,
      metadata: dto.metadata || null,
      lida: false,
      email_enviado: false,
    });

    const saved = await this.notificacaoRepository.save(notificacao);

    // Se deve enviar email, enfileira para envio
    if (dto.enviar_email && dto.usuario_email) {
      await this.enfileirarEmail(saved);
    }

    return saved;
  }

  /**
   * Cria notificação para múltiplos usuários
   */
  async criarParaMultiplos(
    usuarios: { id: string; email?: string }[],
    dados: Omit<CriarNotificacaoDto, 'usuario_id' | 'usuario_email'>,
  ): Promise<Notificacao[]> {
    const notificacoes: Notificacao[] = [];

    for (const usuario of usuarios) {
      const notificacao = await this.criar({
        ...dados,
        usuario_id: usuario.id,
        usuario_email: usuario.email,
      });
      notificacoes.push(notificacao);
    }

    return notificacoes;
  }

  /**
   * Lista notificações de um usuário
   */
  async listarPorUsuario(
    usuarioId: string,
    orgaoId: string,
    options?: {
      apenasNaoLidas?: boolean;
      limite?: number;
    },
  ): Promise<Notificacao[]> {
    const query = this.notificacaoRepository.createQueryBuilder('n')
      .where('n.usuario_id = :usuarioId', { usuarioId })
      .andWhere('n.orgao_id = :orgaoId', { orgaoId })
      .orderBy('n.created_at', 'DESC');

    if (options?.apenasNaoLidas) {
      query.andWhere('n.lida = false');
    }

    if (options?.limite) {
      query.take(options.limite);
    }

    return query.getMany();
  }

  /**
   * Conta notificações não lidas
   */
  async contarNaoLidas(usuarioId: string, orgaoId: string): Promise<number> {
    return this.notificacaoRepository.count({
      where: {
        usuario_id: usuarioId,
        orgao_id: orgaoId,
        lida: false,
      },
    });
  }

  /**
   * Marca notificação como lida
   */
  async marcarComoLida(id: string, usuarioId: string): Promise<Notificacao> {
    const notificacao = await this.notificacaoRepository.findOne({
      where: { id, usuario_id: usuarioId },
    });

    if (!notificacao) {
      throw new Error('Notificação não encontrada');
    }

    notificacao.lida = true;
    notificacao.data_leitura = new Date();

    return this.notificacaoRepository.save(notificacao);
  }

  /**
   * Marca todas as notificações como lidas
   */
  async marcarTodasComoLidas(usuarioId: string, orgaoId: string): Promise<void> {
    await this.notificacaoRepository.update(
      { usuario_id: usuarioId, orgao_id: orgaoId, lida: false },
      { lida: true, data_leitura: new Date() },
    );
  }

  /**
   * Enfileira notificação para envio de email
   * TODO: Integrar com serviço de email (SendGrid, SES, etc.)
   */
  private async enfileirarEmail(notificacao: Notificacao): Promise<void> {
    this.logger.log(`Email enfileirado para ${notificacao.usuario_email}: ${notificacao.titulo}`);
    
    // TODO: Implementar envio real de email
    // Por enquanto, apenas marca como enviado para não reenviar
    // await this.emailService.enviar({
    //   to: notificacao.usuario_email,
    //   subject: notificacao.titulo,
    //   body: notificacao.mensagem,
    // });

    // Marca como enviado (simulado por enquanto)
    notificacao.email_enviado = true;
    notificacao.data_envio_email = new Date();
    await this.notificacaoRepository.save(notificacao);
  }

  /**
   * Limpa notificações antigas (mais de 90 dias)
   */
  async limparAntigas(dias: number = 90): Promise<number> {
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - dias);

    const result = await this.notificacaoRepository.delete({
      created_at: LessThan(dataLimite),
      lida: true,
    });

    return result.affected || 0;
  }

  // ============================================================================
  // MÉTODOS ESPECÍFICOS PARA REQUISIÇÕES
  // ============================================================================

  /**
   * Notifica aprovadores sobre nova requisição
   */
  async notificarNovaRequisicao(
    orgaoId: string,
    requisicaoNumero: string,
    requisicaoId: string,
    solicitanteNome: string,
    valorTotal: number,
    aprovadores: { id: string; email?: string }[],
  ): Promise<void> {
    const valorFormatado = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valorTotal);

    await this.criarParaMultiplos(aprovadores, {
      orgao_id: orgaoId,
      tipo: TipoNotificacao.REQUISICAO_AGUARDANDO_APROVACAO,
      titulo: `Nova requisição aguardando aprovação`,
      mensagem: `A requisição ${requisicaoNumero} de ${solicitanteNome} no valor de ${valorFormatado} aguarda sua aprovação.`,
      prioridade: PrioridadeNotificacao.ALTA,
      entidade_tipo: 'requisicao',
      entidade_id: requisicaoId,
      link: `/orgao/almoxarifado/aprovacoes`,
      enviar_email: true,
      metadata: {
        requisicao_numero: requisicaoNumero,
        solicitante: solicitanteNome,
        valor: valorTotal,
      },
    });
  }

  /**
   * Notifica solicitante sobre resultado da requisição
   */
  async notificarResultadoRequisicao(
    orgaoId: string,
    requisicaoNumero: string,
    requisicaoId: string,
    solicitante: { id: string; email?: string },
    aprovada: boolean,
    aprovadorNome: string,
    observacao?: string,
  ): Promise<void> {
    const tipo = aprovada 
      ? TipoNotificacao.REQUISICAO_APROVADA 
      : TipoNotificacao.REQUISICAO_NEGADA;
    
    const titulo = aprovada
      ? `Requisição ${requisicaoNumero} aprovada`
      : `Requisição ${requisicaoNumero} negada`;
    
    let mensagem = aprovada
      ? `Sua requisição ${requisicaoNumero} foi aprovada por ${aprovadorNome}.`
      : `Sua requisição ${requisicaoNumero} foi negada por ${aprovadorNome}.`;
    
    if (observacao) {
      mensagem += ` Observação: ${observacao}`;
    }

    await this.criar({
      orgao_id: orgaoId,
      usuario_id: solicitante.id,
      usuario_email: solicitante.email,
      tipo,
      titulo,
      mensagem,
      prioridade: aprovada ? PrioridadeNotificacao.NORMAL : PrioridadeNotificacao.ALTA,
      entidade_tipo: 'requisicao',
      entidade_id: requisicaoId,
      link: `/orgao/almoxarifado/requisicoes`,
      enviar_email: true,
      metadata: {
        requisicao_numero: requisicaoNumero,
        aprovador: aprovadorNome,
        aprovada,
        observacao,
      },
    });
  }
}

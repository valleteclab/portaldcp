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
    this.logger.log(`Criando notificações para ${usuarios.length} usuários`);
    const notificacoes: Notificacao[] = [];

    for (const usuario of usuarios) {
      try {
        const notificacao = await this.criar({
          ...dados,
          usuario_id: usuario.id,
          usuario_email: usuario.email,
        });
        notificacoes.push(notificacao);
        this.logger.debug(`Notificação criada para usuário ${usuario.id}`);
      } catch (error) {
        this.logger.error(`Erro ao criar notificação para usuário ${usuario.id}: ${error.message}`, error.stack);
        // Continua criando notificações para os outros usuários
      }
    }

    this.logger.log(`Total de notificações criadas: ${notificacoes.length} de ${usuarios.length}`);
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
   * Lista notificações de um fornecedor (sem filtro por órgão)
   */
  async listarPorUsuarioSemOrgao(
    usuarioId: string,
    options?: {
      apenasNaoLidas?: boolean;
      limite?: number;
    },
  ): Promise<Notificacao[]> {
    const query = this.notificacaoRepository.createQueryBuilder('n')
      .where('n.usuario_id = :usuarioId', { usuarioId })
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
   * Conta notificações não lidas de um fornecedor (sem filtro por órgão)
   */
  async contarNaoLidasSemOrgao(usuarioId: string): Promise<number> {
    return this.notificacaoRepository.count({
      where: {
        usuario_id: usuarioId,
        lida: false,
      },
    });
  }

  /**
   * Marca todas as notificações de um fornecedor como lidas (sem filtro por órgão)
   */
  async marcarTodasComoLidasSemOrgao(usuarioId: string): Promise<void> {
    await this.notificacaoRepository.update(
      { usuario_id: usuarioId, lida: false },
      { lida: true, data_leitura: new Date() },
    );
  }

  // ============================================================================
  // MÉTODOS PARA LOGIN DIRETO COMO ÓRGÃO
  // Quando o órgão loga diretamente (não como usuário), ele vê TODAS as
  // notificações do órgão, sem filtrar por usuario_id específico.
  // ============================================================================

  /**
   * Lista todas as notificações de um órgão (sem filtro por usuario_id).
   * Usado quando o login é direto como órgão.
   */
  async listarPorOrgao(
    orgaoId: string,
    options?: {
      apenasNaoLidas?: boolean;
      limite?: number;
    },
  ): Promise<Notificacao[]> {
    const query = this.notificacaoRepository.createQueryBuilder('n')
      .where('n.orgao_id = :orgaoId', { orgaoId })
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
   * Conta todas as notificações não lidas de um órgão (sem filtro por usuario_id).
   */
  async contarNaoLidasPorOrgao(orgaoId: string): Promise<number> {
    return this.notificacaoRepository.count({
      where: {
        orgao_id: orgaoId,
        lida: false,
      },
    });
  }

  /**
   * Marca notificação como lida pelo órgão (valida que pertence ao órgão).
   */
  async marcarComoLidaPorOrgao(id: string, orgaoId: string): Promise<Notificacao> {
    const notificacao = await this.notificacaoRepository.findOne({
      where: { id, orgao_id: orgaoId },
    });

    if (!notificacao) {
      throw new Error('Notificação não encontrada');
    }

    notificacao.lida = true;
    notificacao.data_leitura = new Date();

    return this.notificacaoRepository.save(notificacao);
  }

  /**
   * Marca todas as notificações do órgão como lidas.
   */
  async marcarTodasComoLidasPorOrgao(orgaoId: string): Promise<void> {
    await this.notificacaoRepository.update(
      { orgao_id: orgaoId, lida: false },
      { lida: true, data_leitura: new Date() },
    );
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
    this.logger.log(`Notificando ${aprovadores.length} aprovadores sobre requisição ${requisicaoNumero}`);
    
    const valorFormatado = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valorTotal);

    try {
      const notificacoes = await this.criarParaMultiplos(aprovadores, {
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
      
      this.logger.log(`Notificações criadas com sucesso: ${notificacoes.length} notificações para requisição ${requisicaoNumero}`);
    } catch (error) {
      this.logger.error(`Erro ao criar notificações para requisição ${requisicaoNumero}: ${error.message}`, error.stack);
      throw error;
    }
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

  // ============================================================================
  // MÉTODOS ESPECÍFICOS PARA MEDIÇÕES
  // ============================================================================

  private formatarMoeda(valor: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
  }

  /**
   * Notifica o órgão que uma medição foi submetida pelo fornecedor
   */
  async notificarMedicaoSubmetida(
    orgaoId: string,
    medicaoNumero: number,
    medicaoId: string,
    contratoNumero: string,
    contratoId: string,
    fornecedorNome: string,
    valorMedido: number,
    destinatarios: { id: string; email?: string }[],
  ): Promise<void> {
    this.logger.log(`Notificando medição #${medicaoNumero} submetida - contrato ${contratoNumero}`);
    try {
      await this.criarParaMultiplos(destinatarios, {
        orgao_id: orgaoId,
        tipo: TipoNotificacao.MEDICAO_SUBMETIDA,
        titulo: `Medição #${medicaoNumero} submetida`,
        mensagem: `O fornecedor ${fornecedorNome} submeteu a Medição #${medicaoNumero} do contrato ${contratoNumero} no valor de ${this.formatarMoeda(valorMedido)}. Aguarda ateste do fiscal.`,
        prioridade: PrioridadeNotificacao.ALTA,
        entidade_tipo: 'medicao',
        entidade_id: medicaoId,
        link: `/orgao/medicoes`,
        metadata: { medicao_numero: medicaoNumero, contrato_numero: contratoNumero, fornecedor: fornecedorNome, valor: valorMedido },
      });
    } catch (error) {
      this.logger.error(`Erro ao notificar medição submetida: ${error.message}`, error.stack);
    }
  }

  /**
   * Notifica que a medição foi atestada pelo fiscal (vai para aprovação)
   */
  async notificarMedicaoAtestada(
    orgaoId: string,
    medicaoNumero: number,
    medicaoId: string,
    contratoNumero: string,
    contratoId: string,
    fiscalNome: string,
    valorMedido: number,
    destinatarios: { id: string; email?: string }[],
  ): Promise<void> {
    this.logger.log(`Notificando medição #${medicaoNumero} atestada - contrato ${contratoNumero}`);
    try {
      await this.criarParaMultiplos(destinatarios, {
        orgao_id: orgaoId,
        tipo: TipoNotificacao.MEDICAO_ATESTADA,
        titulo: `Medição #${medicaoNumero} atestada`,
        mensagem: `A Medição #${medicaoNumero} do contrato ${contratoNumero} (${this.formatarMoeda(valorMedido)}) foi atestada por ${fiscalNome} e aguarda aprovação do gestor.`,
        prioridade: PrioridadeNotificacao.ALTA,
        entidade_tipo: 'medicao',
        entidade_id: medicaoId,
        link: `/orgao/aprovacoes`,
        metadata: { medicao_numero: medicaoNumero, contrato_numero: contratoNumero, fiscal: fiscalNome, valor: valorMedido },
      });
    } catch (error) {
      this.logger.error(`Erro ao notificar medição atestada: ${error.message}`, error.stack);
    }
  }

  /**
   * Notifica que a medição foi parcialmente atestada
   */
  async notificarMedicaoParcialmenteAtestada(
    orgaoId: string,
    medicaoNumero: number,
    medicaoId: string,
    contratoNumero: string,
    contratoId: string,
    fiscalNome: string,
    fornecedorDestinatarios: { id: string; email?: string }[],
  ): Promise<void> {
    this.logger.log(`Notificando medição #${medicaoNumero} parcialmente atestada`);
    try {
      await this.criarParaMultiplos(fornecedorDestinatarios, {
        orgao_id: orgaoId,
        tipo: TipoNotificacao.MEDICAO_PARCIALMENTE_ATESTADA,
        titulo: `Medição #${medicaoNumero} parcialmente atestada`,
        mensagem: `A Medição #${medicaoNumero} do contrato ${contratoNumero} foi parcialmente atestada por ${fiscalNome}. Itens não atestados foram devolvidos para ajuste.`,
        prioridade: PrioridadeNotificacao.ALTA,
        entidade_tipo: 'medicao',
        entidade_id: medicaoId,
        link: `/fornecedor/contratos/${contratoId}`,
        metadata: { medicao_numero: medicaoNumero, contrato_numero: contratoNumero, fiscal: fiscalNome },
      });
    } catch (error) {
      this.logger.error(`Erro ao notificar medição parcialmente atestada: ${error.message}`, error.stack);
    }
  }

  /**
   * Notifica que a medição foi aprovada pelo gestor
   */
  async notificarMedicaoAprovada(
    orgaoId: string,
    medicaoNumero: number,
    medicaoId: string,
    contratoNumero: string,
    contratoId: string,
    aprovadorNome: string,
    valorMedido: number,
    destinatarios: { id: string; email?: string }[],
  ): Promise<void> {
    this.logger.log(`Notificando medição #${medicaoNumero} aprovada`);
    try {
      await this.criarParaMultiplos(destinatarios, {
        orgao_id: orgaoId,
        tipo: TipoNotificacao.MEDICAO_APROVADA,
        titulo: `Medição #${medicaoNumero} aprovada`,
        mensagem: `A Medição #${medicaoNumero} do contrato ${contratoNumero} (${this.formatarMoeda(valorMedido)}) foi aprovada por ${aprovadorNome}.`,
        prioridade: PrioridadeNotificacao.NORMAL,
        entidade_tipo: 'medicao',
        entidade_id: medicaoId,
        link: `/orgao/contratos/${contratoId}`,
        metadata: { medicao_numero: medicaoNumero, contrato_numero: contratoNumero, aprovador: aprovadorNome, valor: valorMedido },
      });
    } catch (error) {
      this.logger.error(`Erro ao notificar medição aprovada: ${error.message}`, error.stack);
    }
  }

  /**
   * Notifica que a medição foi rejeitada pelo gestor
   */
  async notificarMedicaoRejeitada(
    orgaoId: string,
    medicaoNumero: number,
    medicaoId: string,
    contratoNumero: string,
    contratoId: string,
    aprovadorNome: string,
    observacao: string,
    destinatarios: { id: string; email?: string }[],
  ): Promise<void> {
    this.logger.log(`Notificando medição #${medicaoNumero} rejeitada`);
    try {
      await this.criarParaMultiplos(destinatarios, {
        orgao_id: orgaoId,
        tipo: TipoNotificacao.MEDICAO_REJEITADA,
        titulo: `Medição #${medicaoNumero} rejeitada`,
        mensagem: `A Medição #${medicaoNumero} do contrato ${contratoNumero} foi rejeitada por ${aprovadorNome}. Motivo: ${observacao}`,
        prioridade: PrioridadeNotificacao.ALTA,
        entidade_tipo: 'medicao',
        entidade_id: medicaoId,
        link: `/orgao/contratos/${contratoId}`,
        metadata: { medicao_numero: medicaoNumero, contrato_numero: contratoNumero, aprovador: aprovadorNome, observacao },
      });
    } catch (error) {
      this.logger.error(`Erro ao notificar medição rejeitada: ${error.message}`, error.stack);
    }
  }

  /**
   * Notifica o fornecedor que a medição foi devolvida pelo órgão
   */
  async notificarMedicaoDevolvida(
    orgaoId: string,
    medicaoNumero: number,
    medicaoId: string,
    contratoNumero: string,
    contratoId: string,
    fiscalNome: string,
    motivo: string,
    fornecedorDestinatarios: { id: string; email?: string }[],
  ): Promise<void> {
    this.logger.log(`Notificando medição #${medicaoNumero} devolvida`);
    try {
      await this.criarParaMultiplos(fornecedorDestinatarios, {
        orgao_id: orgaoId,
        tipo: TipoNotificacao.MEDICAO_DEVOLVIDA,
        titulo: `Medição #${medicaoNumero} devolvida`,
        mensagem: `A Medição #${medicaoNumero} do contrato ${contratoNumero} foi devolvida por ${fiscalNome}. Motivo: ${motivo}`,
        prioridade: PrioridadeNotificacao.ALTA,
        entidade_tipo: 'medicao',
        entidade_id: medicaoId,
        link: `/fornecedor/contratos/${contratoId}`,
        metadata: { medicao_numero: medicaoNumero, contrato_numero: contratoNumero, fiscal: fiscalNome, motivo },
      });
    } catch (error) {
      this.logger.error(`Erro ao notificar medição devolvida: ${error.message}`, error.stack);
    }
  }

  // ============================================================================
  // MÉTODOS ESPECÍFICOS PARA CONTRATOS
  // ============================================================================

  /**
   * Notifica responsáveis pela liberação sobre novo contrato aguardando liberação
   */
  async notificarContratoAguardandoLiberacao(
    orgaoId: string,
    contratoNumero: string,
    contratoId: string,
    valorGlobal: number,
    origem: string,
    liberadores: { id: string; email?: string }[],
  ): Promise<void> {
    this.logger.log(`Notificando ${liberadores.length} liberadores sobre contrato ${contratoNumero} aguardando liberação`);

    const valorFormatado = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valorGlobal);

    try {
      const notificacoes = await this.criarParaMultiplos(liberadores, {
        orgao_id: orgaoId,
        tipo: TipoNotificacao.CONTRATO_AGUARDANDO_LIBERACAO,
        titulo: `Contrato aguardando liberação`,
        mensagem: `O contrato ${contratoNumero} (${origem}) no valor de ${valorFormatado} aguarda sua liberação.`,
        prioridade: PrioridadeNotificacao.ALTA,
        entidade_tipo: 'contrato',
        entidade_id: contratoId,
        link: `/orgao/contratos/${contratoId}`,
        enviar_email: true,
        metadata: {
          contrato_numero: contratoNumero,
          valor: valorGlobal,
          origem,
        },
      });

      this.logger.log(`Notificações criadas: ${notificacoes.length} para contrato ${contratoNumero}`);
    } catch (error) {
      this.logger.error(`Erro ao criar notificações para contrato ${contratoNumero}: ${error.message}`, error.stack);
      throw error;
    }
  }
}

import { Injectable, NotFoundException, BadRequestException, Logger, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Requisicao, StatusRequisicao, TipoRequisicao, PrioridadeRequisicao } from './entities/requisicao.entity';
import { ItemRequisicao, StatusItemRequisicao } from './entities/item-requisicao.entity';
import { ItemContrato } from './entities/item-contrato.entity';
import { ItemContratoService } from './item-contrato.service';
import { ConfiguracaoAprovacaoService } from './configuracao-aprovacao.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { OrdemFornecimentoService } from './ordem-fornecimento.service';
import { GerarOrdemDto } from './dto/ordem-fornecimento.dto';
import { 
  CriarRequisicaoDto, 
  AtualizarRequisicaoDto, 
  AutorizarRequisicaoDto,
  NegarRequisicaoDto 
} from './dto/criar-requisicao.dto';

@Injectable()
export class RequisicaoService {
  private readonly logger = new Logger(RequisicaoService.name);

  constructor(
    @InjectRepository(Requisicao)
    private readonly requisicaoRepository: Repository<Requisicao>,
    @InjectRepository(ItemRequisicao)
    private readonly itemRequisicaoRepository: Repository<ItemRequisicao>,
    @InjectRepository(ItemContrato)
    private readonly itemContratoRepository: Repository<ItemContrato>,
    private readonly itemContratoService: ItemContratoService,
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => ConfiguracaoAprovacaoService))
    private readonly configAprovacaoService: ConfiguracaoAprovacaoService,
    @Inject(forwardRef(() => NotificacoesService))
    private readonly notificacoesService: NotificacoesService,
    @Inject(forwardRef(() => OrdemFornecimentoService))
    private readonly ordemFornecimentoService: OrdemFornecimentoService,
  ) {}

  // ============================================================================
  // CRIAR REQUISIÇÃO
  // ============================================================================

  async criar(
    orgaoId: string, 
    dto: CriarRequisicaoDto,
    usuarioId: string,
    usuarioNome: string,
    usuarioEmail?: string,
  ): Promise<Requisicao> {
    // Gera número da requisição
    const ano = new Date().getFullYear();
    const ultimaRequisicao = await this.requisicaoRepository.findOne({
      where: { orgao_id: orgaoId, ano },
      order: { sequencial: 'DESC' },
    });

    const sequencial = ultimaRequisicao ? ultimaRequisicao.sequencial + 1 : 1;
    const numero = `REQ-${String(sequencial).padStart(4, '0')}/${ano}`;

    // Valida itens do contrato se houver contrato vinculado
    let valorTotalEstimado = 0;
    const itensParaCriar: Partial<ItemRequisicao>[] = [];

    for (const itemDto of dto.itens) {
      let valorUnitario = itemDto.valor_unitario || 0;
      let unidadeMedida = itemDto.unidade_medida;

      // Se tem item_contrato_id, busca informações do item do contrato
      if (itemDto.item_contrato_id) {
        const itemContrato = await this.itemContratoRepository.findOne({
          where: { id: itemDto.item_contrato_id },
        });

        if (!itemContrato) {
          throw new BadRequestException(
            `Item do contrato ${itemDto.item_contrato_id} não encontrado`
          );
        }

        // Verifica se pertence ao contrato da requisição
        if (dto.contrato_id && itemContrato.contrato_id !== dto.contrato_id) {
          throw new BadRequestException(
            `Item ${itemDto.item_contrato_id} não pertence ao contrato ${dto.contrato_id}`
          );
        }

        // Verifica saldo disponível (apenas aviso, não bloqueia ainda)
        if (!itemContrato.temSaldoSuficiente(itemDto.quantidade_solicitada)) {
          this.logger.warn(
            `Saldo insuficiente para item ${itemContrato.descricao}. ` +
            `Disponível: ${itemContrato.saldo_disponivel}, Solicitado: ${itemDto.quantidade_solicitada}`
          );
        }

        valorUnitario = Number(itemContrato.valor_unitario);
        unidadeMedida = itemContrato.unidade_medida;
      }

      const valorTotalItem = itemDto.quantidade_solicitada * valorUnitario;
      valorTotalEstimado += valorTotalItem;

      itensParaCriar.push({
        numero_item: itemDto.numero_item,
        item_contrato_id: itemDto.item_contrato_id,
        codigo_catalogo: itemDto.codigo_catalogo,
        descricao: itemDto.descricao,
        unidade_medida: unidadeMedida,
        quantidade_solicitada: itemDto.quantidade_solicitada,
        valor_unitario: valorUnitario,
        valor_total_estimado: valorTotalItem,
        observacoes: itemDto.observacoes,
        status: StatusItemRequisicao.PENDENTE,
      });
    }

    // Cria requisição
    const novaRequisicao = new Requisicao();
    novaRequisicao.orgao_id = orgaoId;
    novaRequisicao.contrato_id = dto.contrato_id || null;
    novaRequisicao.numero = numero;
    novaRequisicao.ano = ano;
    novaRequisicao.sequencial = sequencial;
    novaRequisicao.tipo = dto.tipo;
    novaRequisicao.setor_solicitante = dto.setor_solicitante;
    novaRequisicao.codigo_setor = dto.codigo_setor || null;
    novaRequisicao.local_entrega = dto.local_entrega || null;
    novaRequisicao.justificativa = dto.justificativa;
    novaRequisicao.prioridade = dto.prioridade || PrioridadeRequisicao.NORMAL;
    novaRequisicao.data_necessidade = dto.data_necessidade ? new Date(dto.data_necessidade) : null;
    novaRequisicao.usuario_solicitante_id = usuarioId;
    novaRequisicao.usuario_solicitante_nome = usuarioNome;
    novaRequisicao.usuario_solicitante_email = usuarioEmail || null;
    novaRequisicao.data_solicitacao = new Date();
    novaRequisicao.status = StatusRequisicao.RASCUNHO;
    novaRequisicao.valor_total_estimado = valorTotalEstimado;
    novaRequisicao.saldo_reservado = false;
    novaRequisicao.observacoes = dto.observacoes || null;

    const requisicaoSalva = await this.requisicaoRepository.save(novaRequisicao);

    // Cria itens da requisição
    const itensParaSalvar: ItemRequisicao[] = [];
    for (const item of itensParaCriar) {
      const novoItem = new ItemRequisicao();
      Object.assign(novoItem, item);
      novoItem.requisicao_id = requisicaoSalva.id;
      itensParaSalvar.push(novoItem);
    }

    await this.itemRequisicaoRepository.save(itensParaSalvar);

    this.logger.log(`Requisição ${numero} criada com ${itensParaSalvar.length} itens`);

    return this.findOne(requisicaoSalva.id);
  }

  // ============================================================================
  // ENVIAR PARA AUTORIZAÇÃO
  // ============================================================================

  async enviarParaAutorizacao(id: string, usuariosOrgao?: { id: string; perfil: string; email?: string }[]): Promise<Requisicao> {
    const requisicao = await this.findOne(id);

    if (requisicao.status !== StatusRequisicao.RASCUNHO) {
      throw new BadRequestException(
        `Requisição não pode ser enviada para autorização. Status atual: ${requisicao.status}`
      );
    }

    if (!requisicao.itens || requisicao.itens.length === 0) {
      throw new BadRequestException('Requisição deve ter pelo menos um item');
    }

    requisicao.status = StatusRequisicao.AGUARDANDO_AUTORIZACAO;
    const saved = await this.requisicaoRepository.save(requisicao);

    // Notifica aprovadores
    this.logger.log(`Enviando requisição ${requisicao.numero} para aprovação. Usuários do órgão: ${usuariosOrgao?.length || 0}`);
    
    if (usuariosOrgao && usuariosOrgao.length > 0) {
      try {
        const aprovadores = await this.configAprovacaoService.listarAprovadores(
          requisicao.orgao_id,
          Number(requisicao.valor_total_estimado),
          usuariosOrgao,
          requisicao.usuario_solicitante_id,
        );

        this.logger.log(`Aprovadores elegíveis encontrados: ${aprovadores.length}`);

        if (aprovadores.length > 0) {
          this.logger.log(`Criando notificações para ${aprovadores.length} aprovadores`);
          await this.notificacoesService.notificarNovaRequisicao(
            requisicao.orgao_id,
            requisicao.numero,
            requisicao.id,
            requisicao.usuario_solicitante_nome,
            Number(requisicao.valor_total_estimado),
            aprovadores,
          );
          this.logger.log(`Notificações criadas com sucesso para requisição ${requisicao.numero}`);
        } else {
          this.logger.warn(`Nenhum aprovador elegível encontrado para requisição ${requisicao.numero}`);
        }
      } catch (notifError) {
        // Não falha a operação se a notificação falhar, mas loga o erro completo
        this.logger.error(`Erro ao enviar notificação para aprovadores: ${notifError.message}`, notifError.stack);
      }
    } else {
      this.logger.warn(`Nenhum usuário do órgão fornecido para notificação da requisição ${requisicao.numero}`);
    }

    return saved;
  }

  // ============================================================================
  // AUTORIZAR REQUISIÇÃO (RESERVA SALDO)
  // ============================================================================

  /**
   * Autoriza uma requisição e reserva saldo do contrato
   * 
   * IMPORTANTE: Ao autorizar, o saldo é reservado no contrato.
   * Se a requisição for negada/cancelada depois, o saldo é liberado.
   */
  async autorizar(
    id: string,
    dto: AutorizarRequisicaoDto,
    autorizadorId: string,
    autorizadorNome: string,
    autorizadorPerfil?: string,
  ): Promise<Requisicao> {
    const requisicao = await this.findOne(id);

    if (requisicao.status !== StatusRequisicao.AGUARDANDO_AUTORIZACAO) {
      throw new BadRequestException(
        `Requisição não pode ser autorizada. Status atual: ${requisicao.status}`
      );
    }

    // Verifica permissão de aprovação
    const permissao = await this.configAprovacaoService.verificarPermissaoAprovacao(
      requisicao.orgao_id,
      autorizadorId,
      autorizadorPerfil || 'USUARIO',
      requisicao.usuario_solicitante_id,
      Number(requisicao.valor_total_estimado),
    );

    if (!permissao.pode_aprovar) {
      throw new ForbiddenException(permissao.motivo || 'Você não tem permissão para aprovar esta requisição');
    }

    // Verifica se exige justificativa
    if (permissao.configuracao?.exigir_justificativa_aprovacao && !dto.observacao?.trim()) {
      throw new BadRequestException('É obrigatório informar uma justificativa para aprovar esta requisição');
    }

    // Inicia transação para garantir consistência
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Processa ajustes de quantidade se houver
      if (dto.ajustes_quantidade) {
        for (const [itemId, quantidade] of Object.entries(dto.ajustes_quantidade)) {
          const item = requisicao.itens.find(i => i.id === itemId);
          if (item) {
            item.quantidade_autorizada = quantidade;
            item.motivo_ajuste = `Quantidade ajustada pelo autorizador de ${item.quantidade_solicitada} para ${quantidade}`;
            await queryRunner.manager.save(item);
          }
        }
      }

      // Reserva saldo no contrato para cada item
      for (const item of requisicao.itens) {
        if (item.item_contrato_id) {
          const quantidadeAReservar = item.quantidade_autorizada ?? item.quantidade_solicitada;
          
          // Busca item do contrato com lock
          const itemContrato = await queryRunner.manager.findOne(ItemContrato, {
            where: { id: item.item_contrato_id },
            lock: { mode: 'pessimistic_write' },
          });

          if (!itemContrato) {
            throw new BadRequestException(
              `Item do contrato ${item.item_contrato_id} não encontrado`
            );
          }

          // Verifica saldo disponível
          const saldoDisponivel = Number(itemContrato.quantidade_contratada) - 
                                  Number(itemContrato.quantidade_empenhada) - 
                                  Number(itemContrato.quantidade_entregue);

          if (saldoDisponivel < quantidadeAReservar) {
            throw new BadRequestException(
              `Saldo insuficiente para item "${item.descricao}". ` +
              `Disponível: ${saldoDisponivel}, Solicitado: ${quantidadeAReservar}`
            );
          }

          // Reserva saldo
          itemContrato.quantidade_empenhada = Number(itemContrato.quantidade_empenhada) + quantidadeAReservar;
          itemContrato.saldo_disponivel = Number(itemContrato.quantidade_contratada) - 
                                          Number(itemContrato.quantidade_empenhada) - 
                                          Number(itemContrato.quantidade_entregue);

          await queryRunner.manager.save(itemContrato);

          // Atualiza status do item
          item.status = StatusItemRequisicao.RESERVADO;
          if (!item.quantidade_autorizada) {
            item.quantidade_autorizada = item.quantidade_solicitada;
          }
          await queryRunner.manager.save(item);

          this.logger.log(
            `Saldo reservado: Item ${itemContrato.descricao}, ` +
            `Quantidade: ${quantidadeAReservar}, ` +
            `Novo saldo: ${itemContrato.saldo_disponivel}`
          );
        }
      }

      // Atualiza requisição
      requisicao.status = StatusRequisicao.AUTORIZADA;
      requisicao.usuario_autorizador_id = autorizadorId;
      requisicao.usuario_autorizador_nome = autorizadorNome;
      requisicao.data_autorizacao = new Date();
      requisicao.observacao_autorizador = dto.observacao || null;
      requisicao.saldo_reservado = true;

      await queryRunner.manager.save(requisicao);
      await queryRunner.commitTransaction();

      this.logger.log(`Requisição ${requisicao.numero} autorizada por ${autorizadorNome}`);

      // Notifica o solicitante sobre a aprovação
      try {
        await this.notificacoesService.notificarResultadoRequisicao(
          requisicao.orgao_id,
          requisicao.numero,
          requisicao.id,
          { 
            id: requisicao.usuario_solicitante_id, 
            email: requisicao.usuario_solicitante_email || undefined 
          },
          true, // aprovada
          autorizadorNome,
          dto.observacao,
        );
      } catch (notifError) {
        // Não falha a operação se a notificação falhar
        this.logger.warn(`Erro ao enviar notificação de aprovação: ${notifError.message}`);
      }

      return this.findOne(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Erro ao autorizar requisição ${id}: ${error.message}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ============================================================================
  // NEGAR REQUISIÇÃO (LIBERA SALDO SE HAVIA RESERVA)
  // ============================================================================

  /**
   * Nega uma requisição
   * Se já tinha saldo reservado (improvável, mas possível), libera
   */
  async negar(
    id: string,
    dto: NegarRequisicaoDto,
    autorizadorId: string,
    autorizadorNome: string,
    autorizadorPerfil?: string,
  ): Promise<Requisicao> {
    const requisicao = await this.findOne(id);

    if (requisicao.status !== StatusRequisicao.AGUARDANDO_AUTORIZACAO) {
      throw new BadRequestException(
        `Requisição não pode ser negada. Status atual: ${requisicao.status}`
      );
    }

    // Verifica permissão de aprovação/negação
    const permissao = await this.configAprovacaoService.verificarPermissaoAprovacao(
      requisicao.orgao_id,
      autorizadorId,
      autorizadorPerfil || 'USUARIO',
      requisicao.usuario_solicitante_id,
      Number(requisicao.valor_total_estimado),
    );

    if (!permissao.pode_aprovar) {
      throw new ForbiddenException(permissao.motivo || 'Você não tem permissão para negar esta requisição');
    }

    // Verifica se exige justificativa
    if (!dto.motivo?.trim()) {
      throw new BadRequestException('É obrigatório informar o motivo da negativa');
    }

    requisicao.status = StatusRequisicao.NEGADA;
    requisicao.usuario_autorizador_id = autorizadorId;
    requisicao.usuario_autorizador_nome = autorizadorNome;
    requisicao.data_autorizacao = new Date();
    requisicao.observacao_autorizador = dto.motivo;

    this.logger.log(`Requisição ${requisicao.numero} negada por ${autorizadorNome}: ${dto.motivo}`);

    const saved = await this.requisicaoRepository.save(requisicao);

    // Notifica o solicitante sobre a negativa
    try {
      await this.notificacoesService.notificarResultadoRequisicao(
        requisicao.orgao_id,
        requisicao.numero,
        requisicao.id,
        { 
          id: requisicao.usuario_solicitante_id, 
          email: requisicao.usuario_solicitante_email || undefined 
        },
        false, // negada
        autorizadorNome,
        dto.motivo,
      );
    } catch (notifError) {
      // Não falha a operação se a notificação falhar
      this.logger.warn(`Erro ao enviar notificação de negativa: ${notifError.message}`);
    }

    return saved;
  }

  // ============================================================================
  // CANCELAR REQUISIÇÃO (LIBERA SALDO)
  // ============================================================================

  /**
   * Cancela uma requisição e libera saldo reservado
   * 
   * IMPORTANTE: Se a requisição estava AUTORIZADA (saldo reservado),
   * o saldo é devolvido ao contrato.
   */
  async cancelar(id: string, motivo: string): Promise<Requisicao> {
    const requisicao = await this.findOne(id);

    // Só pode cancelar se não tiver ordem gerada ou já atendida
    const statusNaoCancelavel = [
      StatusRequisicao.ORDEM_GERADA,
      StatusRequisicao.ATENDIDA_PARCIAL,
      StatusRequisicao.ATENDIDA,
    ];

    if (statusNaoCancelavel.includes(requisicao.status)) {
      throw new BadRequestException(
        `Requisição não pode ser cancelada. Status atual: ${requisicao.status}`
      );
    }

    // Se tinha saldo reservado, libera
    if (requisicao.saldo_reservado) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        for (const item of requisicao.itens) {
          if (item.item_contrato_id && item.status === StatusItemRequisicao.RESERVADO) {
            const quantidadeALiberar = item.quantidade_autorizada ?? item.quantidade_solicitada;

            // Busca item do contrato com lock
            const itemContrato = await queryRunner.manager.findOne(ItemContrato, {
              where: { id: item.item_contrato_id },
              lock: { mode: 'pessimistic_write' },
            });

            if (itemContrato) {
              // Libera saldo
              itemContrato.quantidade_empenhada = Math.max(
                0,
                Number(itemContrato.quantidade_empenhada) - quantidadeALiberar
              );
              itemContrato.saldo_disponivel = Number(itemContrato.quantidade_contratada) - 
                                              Number(itemContrato.quantidade_empenhada) - 
                                              Number(itemContrato.quantidade_entregue);

              await queryRunner.manager.save(itemContrato);

              this.logger.log(
                `Saldo liberado (cancelamento): Item ${itemContrato.descricao}, ` +
                `Quantidade: ${quantidadeALiberar}, ` +
                `Novo saldo: ${itemContrato.saldo_disponivel}`
              );
            }

            // Atualiza status do item
            item.status = StatusItemRequisicao.CANCELADO;
            await queryRunner.manager.save(item);
          }
        }

        // Atualiza requisição
        requisicao.status = StatusRequisicao.CANCELADA;
        requisicao.saldo_reservado = false;
        requisicao.observacoes = `${requisicao.observacoes || ''}\n[Cancelada] ${motivo}`.trim();

        await queryRunner.manager.save(requisicao);
        await queryRunner.commitTransaction();

        this.logger.log(`Requisição ${requisicao.numero} cancelada. Saldo liberado.`);

        return this.findOne(id);
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }
    }

    // Se não tinha saldo reservado, apenas atualiza status
    requisicao.status = StatusRequisicao.CANCELADA;
    requisicao.observacoes = `${requisicao.observacoes || ''}\n[Cancelada] ${motivo}`.trim();

    return this.requisicaoRepository.save(requisicao);
  }

  // ============================================================================
  // CONSULTAS
  // ============================================================================

  async findAll(filtros: {
    orgaoId: string;
    status?: StatusRequisicao;
    contratoId?: string;
    setor?: string;
    dataInicio?: Date;
    dataFim?: Date;
  }): Promise<Requisicao[]> {
    const query = this.requisicaoRepository.createQueryBuilder('req')
      .leftJoinAndSelect('req.itens', 'itens')
      .leftJoinAndSelect('req.contrato', 'contrato')
      .where('req.orgao_id = :orgaoId', { orgaoId: filtros.orgaoId });

    if (filtros.status) {
      query.andWhere('req.status = :status', { status: filtros.status });
    }

    if (filtros.contratoId) {
      query.andWhere('req.contrato_id = :contratoId', { contratoId: filtros.contratoId });
    }

    if (filtros.setor) {
      query.andWhere('req.setor_solicitante ILIKE :setor', { setor: `%${filtros.setor}%` });
    }

    if (filtros.dataInicio) {
      query.andWhere('req.data_solicitacao >= :dataInicio', { dataInicio: filtros.dataInicio });
    }

    if (filtros.dataFim) {
      query.andWhere('req.data_solicitacao <= :dataFim', { dataFim: filtros.dataFim });
    }

    return query.orderBy('req.created_at', 'DESC').getMany();
  }

  async findOne(id: string): Promise<Requisicao> {
    const requisicao = await this.requisicaoRepository.findOne({
      where: { id },
      relations: ['itens', 'itens.item_contrato', 'contrato', 'contrato.fornecedor'],
    });

    if (!requisicao) {
      throw new NotFoundException('Requisição não encontrada');
    }

    return requisicao;
  }

  async findPendentesAutorizacao(orgaoId: string): Promise<Requisicao[]> {
    return this.requisicaoRepository.find({
      where: { 
        orgao_id: orgaoId, 
        status: StatusRequisicao.AGUARDANDO_AUTORIZACAO 
      },
      relations: ['itens', 'contrato'],
      order: { prioridade: 'DESC', created_at: 'ASC' },
    });
  }

  async atualizar(id: string, dto: AtualizarRequisicaoDto): Promise<Requisicao> {
    const requisicao = await this.findOne(id);

    // Só pode editar em rascunho
    if (requisicao.status !== StatusRequisicao.RASCUNHO) {
      throw new BadRequestException(
        'Requisição só pode ser editada enquanto está em rascunho'
      );
    }

    Object.assign(requisicao, dto);
    return this.requisicaoRepository.save(requisicao);
  }

  // ============================================================================
  // ESTATÍSTICAS
  // ============================================================================

  async getEstatisticas(orgaoId: string): Promise<{
    total: number;
    por_status: Record<string, number>;
    valor_total_autorizadas: number;
    pendentes_autorizacao: number;
  }> {
    const requisicoes = await this.requisicaoRepository.find({
      where: { orgao_id: orgaoId },
    });

    const por_status: Record<string, number> = {};
    let valor_total_autorizadas = 0;
    let pendentes_autorizacao = 0;

    for (const req of requisicoes) {
      por_status[req.status] = (por_status[req.status] || 0) + 1;

      if (req.status === StatusRequisicao.AUTORIZADA || 
          req.status === StatusRequisicao.ORDEM_GERADA ||
          req.status === StatusRequisicao.ATENDIDA_PARCIAL ||
          req.status === StatusRequisicao.ATENDIDA) {
        valor_total_autorizadas += Number(req.valor_total_estimado);
      }

      if (req.status === StatusRequisicao.AGUARDANDO_AUTORIZACAO) {
        pendentes_autorizacao++;
      }
    }

    return {
      total: requisicoes.length,
      por_status,
      valor_total_autorizadas,
      pendentes_autorizacao,
    };
  }
}

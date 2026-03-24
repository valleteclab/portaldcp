import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ItemContrato } from './entities/item-contrato.entity';
import { Contrato } from '../contratos/entities/contrato.entity';
import { CriarItemContratoDto, AtualizarItemContratoDto } from './dto/criar-item-contrato.dto';

@Injectable()
export class ItemContratoService {
  private readonly logger = new Logger(ItemContratoService.name);

  constructor(
    @InjectRepository(ItemContrato)
    private readonly itemContratoRepository: Repository<ItemContrato>,
    @InjectRepository(Contrato)
    private readonly contratoRepository: Repository<Contrato>,
    private readonly dataSource: DataSource,
  ) {}

  async validarPropriedadeContrato(contratoId: string, orgaoId: string): Promise<void> {
    const contrato = await this.contratoRepository.findOne({ where: { id: contratoId } });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    if (contrato.orgao_id !== orgaoId) {
      throw new ForbiddenException('Você não tem permissão para acessar este contrato');
    }
  }

  async validarPropriedadeItem(itemId: string, orgaoId: string): Promise<ItemContrato> {
    const item = await this.itemContratoRepository.findOne({
      where: { id: itemId },
      relations: ['contrato'],
    });
    if (!item) throw new NotFoundException('Item do contrato não encontrado');
    if (item.contrato?.orgao_id !== orgaoId) {
      throw new ForbiddenException('Você não tem permissão para acessar este item');
    }
    return item;
  }

  // ============================================================================
  // CRUD BÁSICO
  // ============================================================================

  async criar(dto: CriarItemContratoDto): Promise<ItemContrato> {
    // Calcula valores
    const valor_total = dto.valor_unitario * dto.quantidade_contratada;
    const saldo_disponivel = dto.quantidade_contratada;

    const item = this.itemContratoRepository.create({
      ...dto,
      valor_total,
      saldo_disponivel,
      quantidade_empenhada: 0,
      quantidade_entregue: 0,
    });

    return this.itemContratoRepository.save(item);
  }

  async criarEmLote(contratoId: string, itens: CriarItemContratoDto[]): Promise<ItemContrato[]> {
    const itensParaCriar = itens.map(dto => {
      const valor_total = dto.valor_unitario * dto.quantidade_contratada;
      return this.itemContratoRepository.create({
        ...dto,
        contrato_id: contratoId,
        valor_total,
        saldo_disponivel: dto.quantidade_contratada,
        quantidade_empenhada: 0,
        quantidade_entregue: 0,
      });
    });

    return this.itemContratoRepository.save(itensParaCriar);
  }

  async findByContrato(contratoId: string): Promise<ItemContrato[]> {
    return this.itemContratoRepository.find({
      where: { contrato_id: contratoId },
      order: { numero_item: 'ASC' },
    });
  }

  async findOne(id: string): Promise<ItemContrato> {
    const item = await this.itemContratoRepository.findOne({
      where: { id },
      relations: ['contrato'],
    });

    if (!item) {
      throw new NotFoundException('Item do contrato não encontrado');
    }

    return item;
  }

  async atualizar(id: string, dto: AtualizarItemContratoDto): Promise<ItemContrato> {
    const item = await this.findOne(id);

    const { quantidade_contratada, quantidade_ja_utilizada, ...camposBase } = dto;
    Object.assign(item, camposBase);

    if (quantidade_contratada !== undefined) {
      item.quantidade_contratada = quantidade_contratada;
    }

    if (quantidade_ja_utilizada !== undefined) {
      item.quantidade_entregue = quantidade_ja_utilizada;
    }

    // Recalcula valor_total e saldo_disponivel sempre que campos que os afetam mudaram
    item.valor_total = Number(item.valor_unitario) * Number(item.quantidade_contratada);
    item.saldo_disponivel = Number(item.quantidade_contratada)
      - Number(item.quantidade_empenhada)
      - Number(item.quantidade_entregue);

    return this.itemContratoRepository.save(item);
  }

  async remover(id: string): Promise<void> {
    const item = await this.findOne(id);
    
    // Não permite remover se já tem movimentação
    if (Number(item.quantidade_empenhada) > 0 || Number(item.quantidade_entregue) > 0) {
      throw new BadRequestException(
        'Não é possível remover item que já possui movimentação (empenhado ou entregue)'
      );
    }

    await this.itemContratoRepository.remove(item);
  }

  // ============================================================================
  // CONTROLE DE SALDOS
  // ============================================================================

  /**
   * Reserva saldo do item (usado quando requisição é autorizada)
   * 
   * @param itemId - ID do item do contrato
   * @param quantidade - Quantidade a reservar
   * @throws BadRequestException se não houver saldo suficiente
   */
  async reservarSaldo(itemId: string, quantidade: number): Promise<ItemContrato> {
    // Usa transação para garantir consistência
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Busca item com lock para evitar race condition
      const item = await queryRunner.manager.findOne(ItemContrato, {
        where: { id: itemId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!item) {
        throw new NotFoundException('Item do contrato não encontrado');
      }

      // Calcula saldo disponível atual
      const saldoAtual = Number(item.quantidade_contratada) - 
                         Number(item.quantidade_empenhada) - 
                         Number(item.quantidade_entregue);

      if (saldoAtual < quantidade) {
        throw new BadRequestException(
          `Saldo insuficiente. Disponível: ${saldoAtual}, Solicitado: ${quantidade}`
        );
      }

      // Reserva saldo
      item.quantidade_empenhada = Number(item.quantidade_empenhada) + quantidade;
      item.saldo_disponivel = Number(item.quantidade_contratada) - 
                              Number(item.quantidade_empenhada) - 
                              Number(item.quantidade_entregue);

      const itemAtualizado = await queryRunner.manager.save(item);
      await queryRunner.commitTransaction();

      this.logger.log(
        `Saldo reservado: Item ${itemId}, Quantidade: ${quantidade}, ` +
        `Novo saldo disponível: ${itemAtualizado.saldo_disponivel}`
      );

      return itemAtualizado;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Libera saldo reservado (usado quando requisição é negada/cancelada)
   * 
   * @param itemId - ID do item do contrato
   * @param quantidade - Quantidade a liberar
   */
  async liberarSaldo(itemId: string, quantidade: number): Promise<ItemContrato> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const item = await queryRunner.manager.findOne(ItemContrato, {
        where: { id: itemId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!item) {
        throw new NotFoundException('Item do contrato não encontrado');
      }

      // Valida se tem saldo empenhado suficiente para liberar
      if (Number(item.quantidade_empenhada) < quantidade) {
        this.logger.warn(
          `Tentativa de liberar mais saldo do que empenhado. ` +
          `Empenhado: ${item.quantidade_empenhada}, Tentando liberar: ${quantidade}`
        );
        // Libera apenas o que está empenhado
        quantidade = Number(item.quantidade_empenhada);
      }

      // Libera saldo
      item.quantidade_empenhada = Number(item.quantidade_empenhada) - quantidade;
      item.saldo_disponivel = Number(item.quantidade_contratada) - 
                              Number(item.quantidade_empenhada) - 
                              Number(item.quantidade_entregue);

      const itemAtualizado = await queryRunner.manager.save(item);
      await queryRunner.commitTransaction();

      this.logger.log(
        `Saldo liberado: Item ${itemId}, Quantidade: ${quantidade}, ` +
        `Novo saldo disponível: ${itemAtualizado.saldo_disponivel}`
      );

      return itemAtualizado;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Confirma entrega (usado quando recebimento definitivo é feito)
   * Move de empenhado para entregue
   * 
   * @param itemId - ID do item do contrato
   * @param quantidade - Quantidade entregue
   */
  async confirmarEntrega(itemId: string, quantidade: number): Promise<ItemContrato> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const item = await queryRunner.manager.findOne(ItemContrato, {
        where: { id: itemId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!item) {
        throw new NotFoundException('Item do contrato não encontrado');
      }

      // Move de empenhado para entregue
      const quantidadeADesempenhar = Math.min(quantidade, Number(item.quantidade_empenhada));
      
      item.quantidade_empenhada = Number(item.quantidade_empenhada) - quantidadeADesempenhar;
      item.quantidade_entregue = Number(item.quantidade_entregue) + quantidade;
      item.saldo_disponivel = Number(item.quantidade_contratada) - 
                              Number(item.quantidade_empenhada) - 
                              Number(item.quantidade_entregue);

      const itemAtualizado = await queryRunner.manager.save(item);
      await queryRunner.commitTransaction();

      this.logger.log(
        `Entrega confirmada: Item ${itemId}, Quantidade: ${quantidade}, ` +
        `Total entregue: ${itemAtualizado.quantidade_entregue}, ` +
        `Saldo disponível: ${itemAtualizado.saldo_disponivel}`
      );

      return itemAtualizado;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ============================================================================
  // CONSULTAS
  // ============================================================================

  /**
   * Busca itens com saldo disponível de um contrato
   */
  async findComSaldoDisponivel(contratoId: string): Promise<ItemContrato[]> {
    return this.itemContratoRepository
      .createQueryBuilder('item')
      .where('item.contrato_id = :contratoId', { contratoId })
      .andWhere('item.saldo_disponivel > 0')
      .orderBy('item.numero_item', 'ASC')
      .getMany();
  }

  /**
   * Busca resumo de saldos de um contrato
   */
  async getResumoSaldos(contratoId: string): Promise<{
    total_contratado: number;
    total_empenhado: number;
    total_entregue: number;
    total_disponivel: number;
    valor_total_contratado: number;
    valor_entregue: number;
    percentual_execucao: number;
  }> {
    const itens = await this.findByContrato(contratoId);

    const resumo = itens.reduce(
      (acc, item) => ({
        total_contratado: acc.total_contratado + Number(item.quantidade_contratada),
        total_empenhado: acc.total_empenhado + Number(item.quantidade_empenhada),
        total_entregue: acc.total_entregue + Number(item.quantidade_entregue),
        total_disponivel: acc.total_disponivel + Number(item.saldo_disponivel),
        valor_total_contratado: acc.valor_total_contratado + Number(item.valor_total),
        valor_entregue: acc.valor_entregue + 
          (Number(item.quantidade_entregue) * Number(item.valor_unitario)),
      }),
      {
        total_contratado: 0,
        total_empenhado: 0,
        total_entregue: 0,
        total_disponivel: 0,
        valor_total_contratado: 0,
        valor_entregue: 0,
      }
    );

    return {
      ...resumo,
      percentual_execucao: resumo.valor_total_contratado > 0
        ? (resumo.valor_entregue / resumo.valor_total_contratado) * 100
        : 0,
    };
  }
}

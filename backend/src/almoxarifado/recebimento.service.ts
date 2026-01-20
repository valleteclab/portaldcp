import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Recebimento, TipoRecebimento, StatusRecebimento } from './entities/recebimento.entity';
import { OrdemFornecimento, StatusOrdemFornecimento } from './entities/ordem-fornecimento.entity';
import { ItemContrato } from './entities/item-contrato.entity';
import { OrdemFornecimentoService } from './ordem-fornecimento.service';
import { CriarRecebimentoDto, AceitarRecebimentoDto } from './dto/ordem-fornecimento.dto';

@Injectable()
export class RecebimentoService {
  private readonly logger = new Logger(RecebimentoService.name);

  constructor(
    @InjectRepository(Recebimento)
    private readonly recebimentoRepository: Repository<Recebimento>,
    @InjectRepository(OrdemFornecimento)
    private readonly ordemRepository: Repository<OrdemFornecimento>,
    @InjectRepository(ItemContrato)
    private readonly itemContratoRepository: Repository<ItemContrato>,
    private readonly ordemService: OrdemFornecimentoService,
    private readonly dataSource: DataSource,
  ) {}

  // ============================================================================
  // CRIAR RECEBIMENTO
  // ============================================================================

  /**
   * Registra um recebimento de materiais/serviços
   */
  async criar(
    orgaoId: string,
    dto: CriarRecebimentoDto,
    usuarioId: string,
    usuarioNome: string,
  ): Promise<Recebimento> {
    // Busca ordem de fornecimento
    const ordem = await this.ordemRepository.findOne({
      where: { id: dto.ordem_fornecimento_id },
      relations: ['fornecedor'],
    });

    if (!ordem) {
      throw new NotFoundException('Ordem de fornecimento não encontrada');
    }

    if (ordem.orgao_id !== orgaoId) {
      throw new BadRequestException('Ordem de fornecimento não pertence a este órgão');
    }

    // Valida status da ordem
    const statusValidos = [
      StatusOrdemFornecimento.ENVIADA,
      StatusOrdemFornecimento.EM_ATENDIMENTO,
      StatusOrdemFornecimento.ATENDIDA_PARCIAL,
    ];
    
    if (!statusValidos.includes(ordem.status)) {
      throw new BadRequestException(
        `Ordem não pode receber materiais. Status atual: ${ordem.status}`
      );
    }

    // Gera número do recebimento
    const ano = new Date().getFullYear();
    const ultimoRecebimento = await this.recebimentoRepository.findOne({
      where: { orgao_id: orgaoId, ano },
      order: { sequencial: 'DESC' },
    });

    const sequencial = ultimoRecebimento ? ultimoRecebimento.sequencial + 1 : 1;
    const numero = `REC-${String(sequencial).padStart(4, '0')}/${ano}`;

    // Prepara itens do recebimento
    const itensRecebimento = dto.itens.map(itemDto => {
      const itemOrdem = ordem.itens.find(i => i.item_contrato_id === itemDto.item_contrato_id);
      if (!itemOrdem) {
        throw new BadRequestException(
          `Item ${itemDto.item_contrato_id} não encontrado na ordem`
        );
      }

      // Calcula quantidade pendente
      const quantidadePendente = itemOrdem.quantidade - itemOrdem.quantidade_entregue;
      if (itemDto.quantidade_recebida > quantidadePendente) {
        this.logger.warn(
          `Quantidade recebida (${itemDto.quantidade_recebida}) excede pendente (${quantidadePendente}) ` +
          `para item ${itemOrdem.descricao}`
        );
      }

      return {
        item_contrato_id: itemDto.item_contrato_id,
        numero_item: itemOrdem.numero_item,
        descricao: itemOrdem.descricao,
        unidade_medida: itemOrdem.unidade_medida,
        quantidade_esperada: quantidadePendente,
        quantidade_recebida: itemDto.quantidade_recebida,
        quantidade_aceita: 0, // Será preenchido no aceite
        valor_unitario: itemOrdem.valor_unitario,
        valor_total: itemDto.quantidade_recebida * itemOrdem.valor_unitario,
        observacao: itemDto.observacao,
      };
    });

    // Calcula valor total
    const valorTotal = itensRecebimento.reduce((sum, item) => sum + item.valor_total, 0);

    // Cria recebimento
    const recebimento = new Recebimento();
    recebimento.orgao_id = orgaoId;
    recebimento.ordem_fornecimento_id = dto.ordem_fornecimento_id;
    recebimento.numero = numero;
    recebimento.ano = ano;
    recebimento.sequencial = sequencial;
    recebimento.tipo = dto.tipo;
    recebimento.status = StatusRecebimento.PENDENTE;
    recebimento.numero_nota_fiscal = dto.numero_nota_fiscal || null;
    recebimento.serie_nota_fiscal = dto.serie_nota_fiscal || null;
    recebimento.data_nota_fiscal = dto.data_nota_fiscal ? new Date(dto.data_nota_fiscal) : null;
    recebimento.chave_nfe = dto.chave_nfe || null;
    recebimento.valor_nota_fiscal = dto.valor_nota_fiscal || null;
    recebimento.data_recebimento = new Date();
    recebimento.local_recebimento = dto.local_recebimento || null;
    recebimento.itens = itensRecebimento;
    recebimento.valor_total_recebido = valorTotal;
    recebimento.valor_aceito = 0;
    recebimento.usuario_recebedor_id = usuarioId;
    recebimento.usuario_recebedor_nome = usuarioNome;
    recebimento.observacoes = dto.observacoes || null;
    recebimento.baixa_realizada = false;

    const recebimentoSalvo = await this.recebimentoRepository.save(recebimento);

    // Atualiza status da ordem para EM_ATENDIMENTO
    if (ordem.status === StatusOrdemFornecimento.ENVIADA) {
      ordem.status = StatusOrdemFornecimento.EM_ATENDIMENTO;
      await this.ordemRepository.save(ordem);
    }

    this.logger.log(
      `Recebimento ${numero} criado para ordem ${ordem.numero}. ` +
      `Tipo: ${dto.tipo}, Valor: R$ ${valorTotal.toFixed(2)}`
    );

    return this.findOne(recebimentoSalvo.id);
  }

  // ============================================================================
  // CONFERIR RECEBIMENTO
  // ============================================================================

  async conferir(
    id: string,
    usuarioId: string,
    usuarioNome: string,
  ): Promise<Recebimento> {
    const recebimento = await this.findOne(id);

    if (recebimento.status !== StatusRecebimento.PENDENTE) {
      throw new BadRequestException(
        `Recebimento não pode ser conferido. Status atual: ${recebimento.status}`
      );
    }

    recebimento.status = StatusRecebimento.CONFERIDO;
    recebimento.data_conferencia = new Date();
    recebimento.usuario_conferente_id = usuarioId;
    recebimento.usuario_conferente_nome = usuarioNome;

    this.logger.log(`Recebimento ${recebimento.numero} conferido por ${usuarioNome}`);

    return this.recebimentoRepository.save(recebimento);
  }

  // ============================================================================
  // ACEITAR RECEBIMENTO (BAIXA NO CONTRATO)
  // ============================================================================

  /**
   * Aceita o recebimento e realiza a baixa definitiva no contrato.
   * 
   * IMPORTANTE: Este é o ponto onde o saldo EMPENHADO é convertido em ENTREGUE.
   */
  async aceitar(
    id: string,
    dto: AceitarRecebimentoDto,
    usuarioId: string,
    usuarioNome: string,
  ): Promise<Recebimento> {
    const recebimento = await this.findOne(id);

    if (recebimento.status !== StatusRecebimento.CONFERIDO && 
        recebimento.status !== StatusRecebimento.PENDENTE) {
      throw new BadRequestException(
        `Recebimento não pode ser aceito. Status atual: ${recebimento.status}`
      );
    }

    // Busca ordem de fornecimento
    const ordem = await this.ordemRepository.findOne({
      where: { id: recebimento.ordem_fornecimento_id },
    });

    if (!ordem) {
      throw new BadRequestException('Ordem de fornecimento não encontrada');
    }

    // Inicia transação
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Processa aceite de cada item
      let valorAceito = 0;
      let todosAceitos = true;

      for (const itemRec of recebimento.itens) {
        // Se há ajustes específicos, usa eles
        const ajuste = dto.itens_aceitos?.find(
          a => a.item_contrato_id === itemRec.item_contrato_id
        );

        const quantidadeAceita = ajuste?.quantidade_aceita ?? itemRec.quantidade_recebida;
        
        if (quantidadeAceita < itemRec.quantidade_recebida) {
          todosAceitos = false;
          if (ajuste?.observacao) {
            itemRec.observacao = ajuste.observacao;
          }
        }

        itemRec.quantidade_aceita = quantidadeAceita;
        const valorItem = quantidadeAceita * itemRec.valor_unitario;
        valorAceito += valorItem;

        // ====================================================================
        // BAIXA NO CONTRATO - Converte empenhado em entregue
        // ====================================================================
        if (itemRec.item_contrato_id && quantidadeAceita > 0) {
          const itemContrato = await queryRunner.manager.findOne(ItemContrato, {
            where: { id: itemRec.item_contrato_id },
            lock: { mode: 'pessimistic_write' },
          });

          if (itemContrato) {
            // Move de empenhado para entregue
            const quantidadeADesempenhar = Math.min(
              quantidadeAceita, 
              Number(itemContrato.quantidade_empenhada)
            );
            
            itemContrato.quantidade_empenhada = 
              Number(itemContrato.quantidade_empenhada) - quantidadeADesempenhar;
            itemContrato.quantidade_entregue = 
              Number(itemContrato.quantidade_entregue) + quantidadeAceita;
            itemContrato.saldo_disponivel = 
              Number(itemContrato.quantidade_contratada) - 
              Number(itemContrato.quantidade_empenhada) - 
              Number(itemContrato.quantidade_entregue);

            await queryRunner.manager.save(itemContrato);

            this.logger.log(
              `Baixa no contrato: Item ${itemContrato.descricao}, ` +
              `Quantidade: ${quantidadeAceita}, ` +
              `Empenhado restante: ${itemContrato.quantidade_empenhada}, ` +
              `Total entregue: ${itemContrato.quantidade_entregue}`
            );
          }
        }

        // Atualiza ordem de fornecimento
        await this.ordemService.atualizarAtendimento(
          recebimento.ordem_fornecimento_id,
          itemRec.item_contrato_id,
          quantidadeAceita,
          valorItem,
        );
      }

      // Atualiza recebimento
      recebimento.status = todosAceitos ? StatusRecebimento.ACEITO : StatusRecebimento.ACEITO_PARCIAL;
      recebimento.data_aceite = new Date();
      recebimento.valor_aceito = valorAceito;
      recebimento.baixa_realizada = true;
      recebimento.data_baixa = new Date();
      recebimento.observacoes = dto.observacoes 
        ? `${recebimento.observacoes || ''}\n[ACEITE] ${dto.observacoes}`.trim()
        : recebimento.observacoes;

      await queryRunner.manager.save(recebimento);
      await queryRunner.commitTransaction();

      this.logger.log(
        `Recebimento ${recebimento.numero} aceito. ` +
        `Status: ${recebimento.status}, Valor aceito: R$ ${valorAceito.toFixed(2)}`
      );

      return this.findOne(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Erro ao aceitar recebimento ${id}: ${error.message}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ============================================================================
  // REJEITAR RECEBIMENTO
  // ============================================================================

  async rejeitar(id: string, motivo: string): Promise<Recebimento> {
    const recebimento = await this.findOne(id);

    if (recebimento.baixa_realizada) {
      throw new BadRequestException(
        'Recebimento já teve baixa realizada e não pode ser rejeitado'
      );
    }

    recebimento.status = StatusRecebimento.REJEITADO;
    recebimento.motivo_rejeicao = motivo;

    // Registra ocorrência
    recebimento.ocorrencias = recebimento.ocorrencias || [];
    recebimento.ocorrencias.push({
      data: new Date(),
      tipo: 'REJEICAO',
      descricao: motivo,
      usuario: 'Sistema',
    });

    this.logger.log(`Recebimento ${recebimento.numero} rejeitado: ${motivo}`);

    return this.recebimentoRepository.save(recebimento);
  }

  // ============================================================================
  // CONSULTAS
  // ============================================================================

  async findAll(filtros: {
    orgaoId: string;
    status?: StatusRecebimento;
    ordemId?: string;
    dataInicio?: Date;
    dataFim?: Date;
  }): Promise<Recebimento[]> {
    const query = this.recebimentoRepository.createQueryBuilder('rec')
      .leftJoinAndSelect('rec.ordem_fornecimento', 'ordem')
      .leftJoinAndSelect('ordem.fornecedor', 'fornecedor')
      .where('rec.orgao_id = :orgaoId', { orgaoId: filtros.orgaoId });

    if (filtros.status) {
      query.andWhere('rec.status = :status', { status: filtros.status });
    }

    if (filtros.ordemId) {
      query.andWhere('rec.ordem_fornecimento_id = :ordemId', { ordemId: filtros.ordemId });
    }

    if (filtros.dataInicio) {
      query.andWhere('rec.data_recebimento >= :dataInicio', { dataInicio: filtros.dataInicio });
    }

    if (filtros.dataFim) {
      query.andWhere('rec.data_recebimento <= :dataFim', { dataFim: filtros.dataFim });
    }

    return query.orderBy('rec.created_at', 'DESC').getMany();
  }

  async findOne(id: string): Promise<Recebimento> {
    const recebimento = await this.recebimentoRepository.findOne({
      where: { id },
      relations: ['ordem_fornecimento', 'ordem_fornecimento.fornecedor'],
    });

    if (!recebimento) {
      throw new NotFoundException('Recebimento não encontrado');
    }

    return recebimento;
  }

  async findPendentesConferencia(orgaoId: string): Promise<Recebimento[]> {
    return this.recebimentoRepository.find({
      where: { 
        orgao_id: orgaoId, 
        status: StatusRecebimento.PENDENTE,
      },
      relations: ['ordem_fornecimento'],
      order: { created_at: 'ASC' },
    });
  }

  async findPendentesAceite(orgaoId: string): Promise<Recebimento[]> {
    return this.recebimentoRepository.find({
      where: { 
        orgao_id: orgaoId, 
        status: StatusRecebimento.CONFERIDO,
      },
      relations: ['ordem_fornecimento'],
      order: { created_at: 'ASC' },
    });
  }
}

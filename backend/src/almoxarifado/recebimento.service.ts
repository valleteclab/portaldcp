import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Recebimento, TipoRecebimento, StatusRecebimento } from './entities/recebimento.entity';
import { OrdemFornecimento, StatusOrdemFornecimento } from './entities/ordem-fornecimento.entity';
import { ItemContrato } from './entities/item-contrato.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { OrdemFornecimentoService } from './ordem-fornecimento.service';
import { NotaFiscalFornecedor, StatusNotaFiscalFornecedor } from './entities/nota-fiscal-fornecedor.entity';
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
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
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

    // Verifica se há quantidade pendente para receber
    const temQuantidadePendente = ordem.itens.some(
      item => item.quantidade - item.quantidade_entregue > 0
    );

    if (!temQuantidadePendente) {
      throw new BadRequestException(
        'Não é possível criar recebimento. A ordem já está totalmente atendida.'
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
        tipo_item: itemOrdem.tipo_item ?? 'CONSUMO',
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
  // CALCULAR STATUS (ACEITE SEPARADO)
  // ============================================================================

  /**
   * Calcula o status do recebimento considerando aceites separados almoxarifado/patrimônio.
   * Compatibilidade: recebimentos antigos (aceite único) com baixa_realizada e aceite_* null → ACEITO.
   */
  private calcularStatus(recebimento: Recebimento): StatusRecebimento {
    // Compatibilidade com recebimentos antigos (aceite único)
    if (
      recebimento.baixa_realizada &&
      !recebimento.aceite_almoxarifado_data &&
      !recebimento.aceite_patrimonio_data
    ) {
      return StatusRecebimento.ACEITO;
    }

    const temConsumo = recebimento.itens?.some((i) => (i as any).tipo_item === 'CONSUMO');
    const temPermanente = recebimento.itens?.some((i) => (i as any).tipo_item === 'PERMANENTE');
    const almoxAceito = !temConsumo || !!recebimento.aceite_almoxarifado_data;
    const patrimAceito = !temPermanente || !!recebimento.aceite_patrimonio_data;

    if (almoxAceito && patrimAceito) return StatusRecebimento.ACEITO;
    if (!almoxAceito && !patrimAceito) return StatusRecebimento.CONFERIDO;
    if (!almoxAceito) return StatusRecebimento.PENDENTE_ALMOXARIFADO;
    return StatusRecebimento.PENDENTE_PATRIMONIO;
  }

  // ============================================================================
  // ACEITAR ALMOXARIFADO (itens CONSUMO)
  // ============================================================================

  /**
   * Aceita itens CONSUMO e realiza baixa no contrato.
   * Qualquer usuário com acesso ao almoxarifado pode executar.
   */
  async aceitarAlmoxarifado(
    id: string,
    usuarioId: string,
    usuarioNome: string,
  ): Promise<Recebimento> {
    const recebimento = await this.findOne(id);

    const statusAceitaveis = [
      StatusRecebimento.CONFERIDO,
      StatusRecebimento.PENDENTE,
      StatusRecebimento.PENDENTE_ALMOXARIFADO,
    ];
    if (!statusAceitaveis.includes(recebimento.status)) {
      throw new BadRequestException(
        `Recebimento não pode ser aceito pelo almoxarifado. Status atual: ${recebimento.status}`,
      );
    }

    const itensConsumo = recebimento.itens?.filter(
      (i) => (i as any).tipo_item === 'CONSUMO',
    ) ?? [];
    if (itensConsumo.length === 0) {
      throw new BadRequestException(
        'Este recebimento não possui itens de consumo (almoxarifado).',
      );
    }

    if (recebimento.aceite_almoxarifado_data) {
      throw new BadRequestException(
        'Itens de almoxarifado já foram aceitos neste recebimento.',
      );
    }

    const ordem = await this.ordemRepository.findOne({
      where: { id: recebimento.ordem_fornecimento_id },
    });
    if (!ordem) {
      throw new BadRequestException('Ordem de fornecimento não encontrada');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let valorAceitoAlmox = 0;
      for (const itemRec of itensConsumo) {
        const quantidadeAceita = itemRec.quantidade_recebida;
        itemRec.quantidade_aceita = quantidadeAceita;
        const valorItem = quantidadeAceita * itemRec.valor_unitario;
        valorAceitoAlmox += valorItem;

        if (itemRec.item_contrato_id && quantidadeAceita > 0) {
          const itemContrato = await queryRunner.manager.findOne(ItemContrato, {
            where: { id: itemRec.item_contrato_id },
            lock: { mode: 'pessimistic_write' },
          });
          if (itemContrato) {
            const quantidadeADesempenhar = Math.min(
              quantidadeAceita,
              Number(itemContrato.quantidade_empenhada),
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
          }
        }

        await this.ordemService.atualizarAtendimento(
          recebimento.ordem_fornecimento_id,
          itemRec.item_contrato_id,
          quantidadeAceita,
          valorItem,
        );
      }

      recebimento.aceite_almoxarifado_data = new Date();
      recebimento.aceite_almoxarifado_usuario_id = usuarioId;
      recebimento.aceite_almoxarifado_usuario_nome = usuarioNome;
      recebimento.valor_aceito = Number(recebimento.valor_aceito) + valorAceitoAlmox;
      recebimento.status = this.calcularStatus(recebimento);
      recebimento.baixa_realizada =
        recebimento.status === StatusRecebimento.ACEITO;
      if (recebimento.baixa_realizada) {
        recebimento.data_aceite = new Date();
        recebimento.data_baixa = new Date();
      }

      recebimento.ocorrencias = recebimento.ocorrencias || [];
      recebimento.ocorrencias.push({
        data: new Date(),
        tipo: 'ACEITE_ALMOXARIFADO',
        descricao: `Aceite almoxarifado por ${usuarioNome}. ${itensConsumo.length} item(ns) de consumo aceitos. Valor: R$ ${valorAceitoAlmox.toFixed(2)}`,
        usuario: usuarioNome,
      });

      await queryRunner.manager.save(recebimento);
      await queryRunner.commitTransaction();

      this.logger.log(
        `Recebimento ${recebimento.numero}: aceite almoxarifado por ${usuarioNome}. ` +
          `Valor: R$ ${valorAceitoAlmox.toFixed(2)}`,
      );
      return this.findOne(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Erro ao aceitar almoxarifado ${id}: ${error.message}`,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ============================================================================
  // ACEITAR PATRIMÔNIO (itens PERMANENTE)
  // ============================================================================

  /**
   * Aceita itens PERMANENTE e realiza baixa no contrato.
   * Requer permissão pode_receber_patrimonio.
   */
  async aceitarPatrimonio(
    id: string,
    usuarioId: string,
    usuarioNome: string,
  ): Promise<Recebimento> {
    const recebimento = await this.findOne(id);

    const usuario = await this.usuarioRepository.findOne({
      where: { id: usuarioId },
    });
    if (!usuario?.pode_receber_patrimonio) {
      throw new ForbiddenException(
        'Você não tem permissão para aceitar recebimentos de itens permanentes (patrimônio). ' +
          'Solicite ao administrador a permissão "Receber patrimônio".',
      );
    }

    const statusAceitaveis = [
      StatusRecebimento.CONFERIDO,
      StatusRecebimento.PENDENTE,
      StatusRecebimento.PENDENTE_PATRIMONIO,
    ];
    if (!statusAceitaveis.includes(recebimento.status)) {
      throw new BadRequestException(
        `Recebimento não pode ser aceito pelo patrimônio. Status atual: ${recebimento.status}`,
      );
    }

    const itensPermanente = recebimento.itens?.filter(
      (i) => (i as any).tipo_item === 'PERMANENTE',
    ) ?? [];
    if (itensPermanente.length === 0) {
      throw new BadRequestException(
        'Este recebimento não possui itens permanentes (patrimônio).',
      );
    }

    if (recebimento.aceite_patrimonio_data) {
      throw new BadRequestException(
        'Itens de patrimônio já foram aceitos neste recebimento.',
      );
    }

    const ordem = await this.ordemRepository.findOne({
      where: { id: recebimento.ordem_fornecimento_id },
    });
    if (!ordem) {
      throw new BadRequestException('Ordem de fornecimento não encontrada');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let valorAceitoPatrim = 0;
      for (const itemRec of itensPermanente) {
        const quantidadeAceita = itemRec.quantidade_recebida;
        itemRec.quantidade_aceita = quantidadeAceita;
        const valorItem = quantidadeAceita * itemRec.valor_unitario;
        valorAceitoPatrim += valorItem;

        if (itemRec.item_contrato_id && quantidadeAceita > 0) {
          const itemContrato = await queryRunner.manager.findOne(ItemContrato, {
            where: { id: itemRec.item_contrato_id },
            lock: { mode: 'pessimistic_write' },
          });
          if (itemContrato) {
            const quantidadeADesempenhar = Math.min(
              quantidadeAceita,
              Number(itemContrato.quantidade_empenhada),
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
          }
        }

        await this.ordemService.atualizarAtendimento(
          recebimento.ordem_fornecimento_id,
          itemRec.item_contrato_id,
          quantidadeAceita,
          valorItem,
        );
      }

      recebimento.aceite_patrimonio_data = new Date();
      recebimento.aceite_patrimonio_usuario_id = usuarioId;
      recebimento.aceite_patrimonio_usuario_nome = usuarioNome;
      recebimento.valor_aceito = Number(recebimento.valor_aceito) + valorAceitoPatrim;
      recebimento.status = this.calcularStatus(recebimento);
      recebimento.baixa_realizada =
        recebimento.status === StatusRecebimento.ACEITO;
      if (recebimento.baixa_realizada) {
        recebimento.data_aceite = new Date();
        recebimento.data_baixa = new Date();
      }

      recebimento.ocorrencias = recebimento.ocorrencias || [];
      recebimento.ocorrencias.push({
        data: new Date(),
        tipo: 'ACEITE_PATRIMONIO',
        descricao: `Aceite patrimonio por ${usuarioNome}. ${itensPermanente.length} item(ns) permanentes aceitos. Valor: R$ ${valorAceitoPatrim.toFixed(2)}`,
        usuario: usuarioNome,
      });

      await queryRunner.manager.save(recebimento);
      await queryRunner.commitTransaction();

      this.logger.log(
        `Recebimento ${recebimento.numero}: aceite patrimônio por ${usuarioNome}. ` +
          `Valor: R$ ${valorAceitoPatrim.toFixed(2)}`,
      );
      return this.findOne(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Erro ao aceitar patrimônio ${id}: ${error.message}`,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ============================================================================
  // ACEITAR RECEBIMENTO (BAIXA NO CONTRATO) — legado
  // ============================================================================

  /**
   * Aceita o recebimento e realiza a baixa definitiva no contrato.
   * Para recebimentos mistos (CONSUMO + PERMANENTE), use aceitarAlmoxarifado e aceitarPatrimonio.
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

    // Verifica permissão para recebimentos com itens permanentes (patrimônio)
    const temItemPermanente = recebimento.itens?.some(
      (item) => (item as any).tipo_item === 'PERMANENTE'
    );
    if (temItemPermanente) {
      const usuario = await this.usuarioRepository.findOne({
        where: { id: usuarioId },
      });
      if (!usuario?.pode_receber_patrimonio) {
        throw new ForbiddenException(
          'Você não tem permissão para aceitar recebimentos de itens permanentes (patrimônio). ' +
          'Solicite ao administrador a permissão "Receber patrimônio".'
        );
      }
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
  // ESTORNAR RECEBIMENTO (REVERTER BAIXA)
  // ============================================================================

  /**
   * Estorna um recebimento já aceito, revertendo a baixa no contrato.
   * 
   * IMPORTANTE: Esta operação reverte a conversão de EMPENHADO para ENTREGUE,
   * devolvendo o saldo para DISPONÍVEL no contrato.
   * 
   * Requer permissão especial (pode_cancelar_estornar = true).
   */
  async estornar(
    id: string,
    motivo: string,
    usuarioId: string,
    usuarioNome: string,
  ): Promise<Recebimento> {
    const recebimento = await this.findOne(id);

    if (!recebimento.baixa_realizada) {
      throw new BadRequestException(
        'Recebimento não teve baixa realizada ainda. Não é necessário estornar.'
      );
    }

    if (recebimento.status !== StatusRecebimento.ACEITO) {
      throw new BadRequestException(
        `Recebimento não pode ser estornado. Status atual: ${recebimento.status}`
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
      // Reverte baixa de cada item
      for (const itemRec of recebimento.itens) {
        if (itemRec.item_contrato_id && itemRec.quantidade_aceita > 0) {
          const itemContrato = await queryRunner.manager.findOne(ItemContrato, {
            where: { id: itemRec.item_contrato_id },
            lock: { mode: 'pessimistic_write' },
          });

          if (itemContrato) {
            // Reverte: move de entregue de volta para disponível
            const quantidadeAEstornar = Math.min(
              itemRec.quantidade_aceita,
              Number(itemContrato.quantidade_entregue)
            );

            itemContrato.quantidade_entregue = 
              Math.max(0, Number(itemContrato.quantidade_entregue) - quantidadeAEstornar);
            itemContrato.saldo_disponivel = 
              Number(itemContrato.quantidade_contratada) - 
              Number(itemContrato.quantidade_empenhada) - 
              Number(itemContrato.quantidade_entregue);

            await queryRunner.manager.save(itemContrato);

            this.logger.log(
              `Estorno no contrato: Item ${itemContrato.descricao}, ` +
              `Quantidade estornada: ${quantidadeAEstornar}, ` +
              `Novo saldo disponível: ${itemContrato.saldo_disponivel}`
            );
          }
        }

        // Reverte quantidade aceita no item do recebimento
        itemRec.quantidade_aceita = 0;
      }

      // Atualiza recebimento
      recebimento.status = StatusRecebimento.ESTORNADO;
      recebimento.baixa_realizada = false;
      recebimento.data_baixa = null;
      recebimento.aceite_almoxarifado_data = null;
      recebimento.aceite_almoxarifado_usuario_id = null;
      recebimento.aceite_almoxarifado_usuario_nome = null;
      recebimento.aceite_patrimonio_data = null;
      recebimento.aceite_patrimonio_usuario_id = null;
      recebimento.aceite_patrimonio_usuario_nome = null;
      recebimento.data_estorno = new Date();
      recebimento.usuario_estorno_id = usuarioId;
      recebimento.usuario_estorno_nome = usuarioNome;
      recebimento.motivo_estorno = motivo;
      recebimento.ocorrencias = recebimento.ocorrencias || [];
      recebimento.ocorrencias.push({
        data: new Date(),
        tipo: 'ESTORNO',
        descricao: `Estornado por ${usuarioNome}: ${motivo}`,
        usuario: usuarioNome,
      });

      await queryRunner.manager.save(recebimento);

      // Atualiza ordem de fornecimento (reverte quantidade entregue)
      await this.ordemService.reverterAtendimento(ordem.id, recebimento.itens);

      await queryRunner.commitTransaction();

      this.logger.log(
        `Recebimento ${recebimento.numero} estornado por ${usuarioNome}. ` +
        `Motivo: ${motivo}`
      );

      return this.findOne(id);
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

  async criarComNF(
    ordemId: string,
    nf: NotaFiscalFornecedor,
    mapeamento: any[],
    usuarioId: string,
    usuarioNome: string,
  ): Promise<Recebimento> {
    try {
      const ordem = await this.ordemRepository.findOne({
        where: { id: ordemId },
        relations: ['contrato'],
      });
      if (!ordem) throw new NotFoundException('Ordem não encontrada');

      const ano = new Date().getFullYear();
      const ultimo = await this.recebimentoRepository
        .createQueryBuilder('r')
        .where('r.orgao_id = :orgaoId', { orgaoId: ordem.orgao_id })
        .andWhere('r.ano = :ano', { ano })
        .orderBy('r.sequencial', 'DESC')
        .getOne();
      const sequencial = (ultimo?.sequencial || 0) + 1;
      const numero = `REC-${String(sequencial).padStart(4, '0')}/${ano}`;

      const itensRecebimento = mapeamento.map(m => {
        const itemOf = (ordem.itens || []).find(
          (i: any) => i.item_contrato_id === m.item_contrato_id,
        );
        return {
          item_contrato_id: m.item_contrato_id,
          numero_item: m.produto_nf_index,
          descricao: itemOf?.descricao || m.descricao_of || m.xProd_nf,
          unidade_medida: itemOf?.unidade_medida || '',
          tipo_item: itemOf?.tipo_item || 'CONSUMO',
          quantidade_esperada: itemOf?.quantidade || 0,
          quantidade_recebida: itemOf?.quantidade || 0,
          quantidade_aceita: 0,
          valor_unitario: itemOf?.valor_unitario || 0,
          valor_total: (itemOf?.valor_unitario || 0) * (itemOf?.quantidade || 0),
        };
      });

      const valorTotal = itensRecebimento.reduce((sum, i) => sum + i.valor_total, 0);

      let dataNf: Date | null = null;
      if (nf.data_emissao) {
        const d = new Date(nf.data_emissao);
        if (!isNaN(d.getTime())) dataNf = d;
      }

      const recebimento = this.recebimentoRepository.create({
        orgao_id: ordem.orgao_id,
        ordem_fornecimento_id: ordemId,
        numero,
        ano,
        sequencial,
        tipo: TipoRecebimento.PROVISORIO,
        status: StatusRecebimento.PENDENTE,
        data_recebimento: new Date(),
        numero_nota_fiscal: nf.numero || null,
        serie_nota_fiscal: nf.serie || null,
        data_nota_fiscal: dataNf,
        chave_nfe: nf.chave_acesso || null,
        valor_nota_fiscal: nf.valor_total || 0,
        nota_fiscal_fornecedor_id: nf.id,
        mapeamento_ia: mapeamento.map(m => ({
          produto_nf_index: m.produto_nf_index,
          xProd_nf: m.xProd_nf,
          item_contrato_id: m.item_contrato_id,
          descricao_of: m.descricao_of,
          confianca: m.confianca || 0,
          confirmado_usuario: true,
          confirmado_por: usuarioId,
          confirmado_em: new Date().toISOString(),
        })),
        itens: itensRecebimento,
        valor_total_recebido: valorTotal,
        valor_aceito: 0,
        usuario_recebedor_id: usuarioId,
        usuario_recebedor_nome: usuarioNome,
        baixa_realizada: false,
      });

      const salvo = await this.recebimentoRepository.save(recebimento);

      if (ordem.status === StatusOrdemFornecimento.ENVIADA) {
        ordem.status = StatusOrdemFornecimento.EM_ATENDIMENTO;
        await this.ordemRepository.save(ordem);
      }

      this.logger.log(`Recebimento ${numero} criado com NF ${nf.numero} para OF ${ordem.numero}`);

      return this.findOne(salvo.id);
    } catch (error) {
      this.logger.error(`Erro ao criar recebimento com NF: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findByOrdem(ordemId: string): Promise<Recebimento[]> {
    return this.recebimentoRepository.find({
      where: { ordem_fornecimento_id: ordemId },
      order: { created_at: 'DESC' },
    });
  }

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
    return this.recebimentoRepository
      .createQueryBuilder('rec')
      .leftJoinAndSelect('rec.ordem_fornecimento', 'ordem')
      .where('rec.orgao_id = :orgaoId', { orgaoId })
      .andWhere('rec.status IN (:...statuses)', {
        statuses: [
          StatusRecebimento.CONFERIDO,
          StatusRecebimento.PENDENTE_ALMOXARIFADO,
          StatusRecebimento.PENDENTE_PATRIMONIO,
        ],
      })
      .orderBy('rec.created_at', 'ASC')
      .getMany();
  }

  // ============================================================================
  // EXCLUIR RECEBIMENTO
  // ============================================================================

  /**
   * Exclui um recebimento permanentemente
   * 
   * IMPORTANTE: Só permite excluir recebimentos que:
   * - Estejam em PENDENTE ou REJEITADO (não aceitos)
   * - Não tenham baixa realizada no contrato
   */
  async excluir(id: string): Promise<void> {
    const recebimento = await this.findOne(id);

    // Só permite excluir PENDENTE ou REJEITADO
    const statusPermitidos = [
      StatusRecebimento.PENDENTE,
      StatusRecebimento.REJEITADO,
    ];

    if (!statusPermitidos.includes(recebimento.status)) {
      throw new BadRequestException(
        `Recebimento não pode ser excluído. Status atual: ${recebimento.status}. ` +
        `Apenas recebimentos em PENDENTE ou REJEITADO podem ser excluídos. ` +
        `Recebimentos aceitos devem ser estornados, não excluídos.`
      );
    }

    // Não permite excluir se tiver baixa realizada
    if (recebimento.baixa_realizada) {
      throw new BadRequestException(
        'Recebimento não pode ser excluído pois já teve baixa realizada no contrato. ' +
        'Use a função de estorno para reverter.'
      );
    }

    // Atualiza status da ordem se necessário
    if (recebimento.ordem_fornecimento_id) {
      const ordem = await this.ordemRepository.findOne({
        where: { id: recebimento.ordem_fornecimento_id },
      });

      if (ordem) {
        // Se era EM_ATENDIMENTO ou ATENDIDA_PARCIAL e não há mais recebimentos, volta para ENVIADA
        const outrosRecebimentos = await this.recebimentoRepository.find({
          where: { ordem_fornecimento_id: ordem.id },
        });

        const recebimentosAtivos = outrosRecebimentos.filter(
          r => r.id !== id && 
          r.status !== StatusRecebimento.REJEITADO &&
          r.status !== StatusRecebimento.ESTORNADO
        );

        if (recebimentosAtivos.length === 0 && 
            (ordem.status === StatusOrdemFornecimento.EM_ATENDIMENTO || 
             ordem.status === StatusOrdemFornecimento.ATENDIDA_PARCIAL)) {
          ordem.status = StatusOrdemFornecimento.ENVIADA;
          await this.ordemRepository.save(ordem);
        }
      }
    }

    // Exclui o recebimento
    await this.recebimentoRepository.remove(recebimento);

    this.logger.log(`Recebimento ${recebimento.numero} excluído permanentemente`);
  }

  async atualizarQuantidades(
    id: string,
    itensUpdate: { item_contrato_id: string; quantidade_recebida: number }[],
    usuarioId: string,
    usuarioNome: string,
  ): Promise<Recebimento> {
    const recebimento = await this.findOne(id);

    if (recebimento.aceite_almoxarifado_data || recebimento.aceite_patrimonio_data) {
      throw new BadRequestException(
        'Não é possível alterar quantidades após aceite parcial ou total.',
      );
    }

    const statusPermitidos = [StatusRecebimento.PENDENTE, StatusRecebimento.CONFERIDO];
    if (!statusPermitidos.includes(recebimento.status)) {
      throw new BadRequestException(
        `Recebimento com status ${recebimento.status} não permite alteração de quantidades.`,
      );
    }

    let valorTotal = 0;
    for (const upd of itensUpdate) {
      const item = recebimento.itens.find(i => i.item_contrato_id === upd.item_contrato_id);
      if (item) {
        if (upd.quantidade_recebida < 0) {
          throw new BadRequestException(`Quantidade não pode ser negativa para ${item.descricao}`);
        }
        if (upd.quantidade_recebida > item.quantidade_esperada) {
          throw new BadRequestException(
            `Quantidade recebida (${upd.quantidade_recebida}) não pode ser maior que a esperada (${item.quantidade_esperada}) para ${item.descricao}`,
          );
        }
        item.quantidade_recebida = upd.quantidade_recebida;
        item.valor_total = item.valor_unitario * upd.quantidade_recebida;
      }
      valorTotal += item?.valor_total || 0;
    }

    recebimento.valor_total_recebido = recebimento.itens.reduce((s, i) => s + (i.valor_total || 0), 0);

    recebimento.ocorrencias = recebimento.ocorrencias || [];
    recebimento.ocorrencias.push({
      data: new Date(),
      tipo: 'ALTERACAO_QUANTIDADE',
      descricao: `Quantidades atualizadas por ${usuarioNome} (recebimento parcial)`,
      usuario: usuarioNome,
    });

    this.logger.log(`Recebimento ${recebimento.numero}: quantidades atualizadas por ${usuarioNome}`);

    return this.recebimentoRepository.save(recebimento);
  }

  async cancelar(
    id: string,
    motivo: string,
    usuarioId: string,
    usuarioNome: string,
  ): Promise<Recebimento> {
    const recebimento = await this.findOne(id);

    if (recebimento.baixa_realizada) {
      throw new BadRequestException(
        'Recebimento já teve baixa realizada. Use estorno para reverter.',
      );
    }

    recebimento.status = StatusRecebimento.REJEITADO;
    recebimento.motivo_rejeicao = motivo;
    recebimento.ocorrencias = recebimento.ocorrencias || [];
    recebimento.ocorrencias.push({
      data: new Date(),
      tipo: 'CANCELAMENTO',
      descricao: `Cancelado por ${usuarioNome}: ${motivo}`,
      usuario: usuarioNome,
    });

    this.logger.log(`Recebimento ${recebimento.numero} cancelado por ${usuarioNome}: ${motivo}`);

    const saved = await this.recebimentoRepository.save(recebimento);

    const ordem = await this.ordemRepository.findOne({
      where: { id: recebimento.ordem_fornecimento_id },
    });
    if (ordem) {
      ordem.status = StatusOrdemFornecimento.ENVIADA;
      await this.ordemRepository.save(ordem);
    }

    return saved;
  }

  async recusarItem(
    id: string,
    itemContratoId: string,
    motivo: string,
    usuarioId: string,
    usuarioNome: string,
  ): Promise<Recebimento> {
    const recebimento = await this.findOne(id);

    if (recebimento.baixa_realizada) {
      throw new BadRequestException(
        'Recebimento já teve baixa realizada. Use estorno para reverter.',
      );
    }

    const item = recebimento.itens.find(i => i.item_contrato_id === itemContratoId);
    if (!item) {
      throw new BadRequestException('Item não encontrado no recebimento.');
    }

    recebimento.status = StatusRecebimento.REJEITADO;
    recebimento.motivo_rejeicao = `Item recusado: ${item.descricao} - ${motivo}`;
    recebimento.ocorrencias = recebimento.ocorrencias || [];
    recebimento.ocorrencias.push({
      data: new Date(),
      tipo: 'RECUSA_ITEM',
      descricao: `Item "${item.descricao}" recusado por ${usuarioNome}: ${motivo}. Recebimento total cancelado.`,
      usuario: usuarioNome,
    });

    this.logger.log(
      `Recebimento ${recebimento.numero}: item ${item.descricao} recusado por ${usuarioNome}. Recebimento cancelado.`,
    );

    const saved = await this.recebimentoRepository.save(recebimento);

    const ordem = await this.ordemRepository.findOne({
      where: { id: recebimento.ordem_fornecimento_id },
    });
    if (ordem) {
      ordem.status = StatusOrdemFornecimento.ENVIADA;
      await this.ordemRepository.save(ordem);
    }

    return saved;
  }
}

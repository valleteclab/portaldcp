import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { OrdemFornecimento, StatusOrdemFornecimento, TipoOrdem } from './entities/ordem-fornecimento.entity';
import { Requisicao, StatusRequisicao, TipoRequisicao } from './entities/requisicao.entity';
import { Contrato } from '../contratos/entities/contrato.entity';
import { GerarOrdemDto } from './dto/ordem-fornecimento.dto';
import { PdfOrdemService } from './pdf-ordem.service';

@Injectable()
export class OrdemFornecimentoService {
  private readonly logger = new Logger(OrdemFornecimentoService.name);

  constructor(
    @InjectRepository(OrdemFornecimento)
    private readonly ordemRepository: Repository<OrdemFornecimento>,
    @InjectRepository(Requisicao)
    private readonly requisicaoRepository: Repository<Requisicao>,
    @InjectRepository(Contrato)
    private readonly contratoRepository: Repository<Contrato>,
    private readonly dataSource: DataSource,
    private readonly pdfOrdemService: PdfOrdemService,
  ) {}

  // ============================================================================
  // GERAR ORDEM A PARTIR DE REQUISIÇÃO
  // ============================================================================

  /**
   * Gera uma Ordem de Fornecimento/Serviço a partir de uma requisição autorizada
   */
  async gerarOrdem(
    dto: GerarOrdemDto,
    usuarioId: string,
    usuarioNome: string,
  ): Promise<OrdemFornecimento> {
    // Busca requisição
    const requisicao = await this.requisicaoRepository.findOne({
      where: { id: dto.requisicao_id },
      relations: ['itens', 'itens.item_contrato', 'contrato', 'contrato.fornecedor'],
    });

    if (!requisicao) {
      throw new NotFoundException('Requisição não encontrada');
    }

    // Permite gerar ordem para requisições AUTORIZADAS ou ORDEM_GERADA (para permitir regerar manualmente)
    if (requisicao.status !== StatusRequisicao.AUTORIZADA && requisicao.status !== StatusRequisicao.ORDEM_GERADA) {
      throw new BadRequestException(
        `Requisição não pode gerar ordem. Status atual: ${requisicao.status}. ` +
        'Apenas requisições AUTORIZADAS ou com ORDEM_GERADA podem gerar ordens.'
      );
    }

    if (!requisicao.contrato_id) {
      throw new BadRequestException(
        'Requisição não possui contrato vinculado. Não é possível gerar ordem.'
      );
    }

    // Busca contrato com fornecedor
    const contrato = requisicao.contrato;
    if (!contrato || !contrato.fornecedor_id) {
      throw new BadRequestException('Contrato não possui fornecedor vinculado');
    }

    // Gera número da ordem
    const ano = new Date().getFullYear();
    const prefixo = requisicao.tipo === TipoRequisicao.SERVICO ? 'OS' : 'OF';
    
    const ultimaOrdem = await this.ordemRepository.findOne({
      where: { orgao_id: requisicao.orgao_id, ano },
      order: { sequencial: 'DESC' },
    });

    const sequencial = ultimaOrdem ? ultimaOrdem.sequencial + 1 : 1;
    const numero = `${prefixo}-${String(sequencial).padStart(4, '0')}/${ano}`;

    // Prepara itens da ordem
    const itensOrdem = requisicao.itens.map(item => ({
      item_contrato_id: item.item_contrato_id || '',
      numero_item: item.numero_item,
      descricao: item.descricao,
      unidade_medida: item.unidade_medida || '',
      quantidade: Number(item.quantidade_autorizada || item.quantidade_solicitada),
      quantidade_entregue: 0,
      valor_unitario: Number(item.valor_unitario || 0),
      valor_total: Number(item.valor_total_estimado || 0),
    }));

    // Calcula valor total
    const valorTotal = itensOrdem.reduce((sum, item) => sum + item.valor_total, 0);

    // Cria ordem
    const ordem = new OrdemFornecimento();
    ordem.orgao_id = requisicao.orgao_id;
    ordem.contrato_id = requisicao.contrato_id;
    ordem.fornecedor_id = contrato.fornecedor_id;
    ordem.requisicao_id = requisicao.id;
    ordem.numero = numero;
    ordem.ano = ano;
    ordem.sequencial = sequencial;
    ordem.tipo = requisicao.tipo === TipoRequisicao.SERVICO ? TipoOrdem.SERVICO : TipoOrdem.FORNECIMENTO;
    ordem.status = StatusOrdemFornecimento.EMITIDA;
    ordem.descricao = requisicao.justificativa;
    ordem.local_entrega = dto.local_entrega || requisicao.local_entrega;
    ordem.data_emissao = new Date();
    ordem.data_entrega_prevista = dto.data_entrega_prevista ? new Date(dto.data_entrega_prevista) : null;
    ordem.prazo_entrega_dias = dto.prazo_entrega_dias || null;
    ordem.valor_total = valorTotal;
    ordem.valor_entregue = 0;
    ordem.itens = itensOrdem;
    ordem.usuario_emitente_id = usuarioId;
    ordem.usuario_emitente_nome = usuarioNome;
    ordem.observacoes = dto.observacoes || null;

    // Salva ordem e atualiza requisição
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const ordemSalva = await queryRunner.manager.save(ordem);

      // Atualiza status da requisição (só atualiza se ainda não tinha ordem)
      if (requisicao.status === StatusRequisicao.AUTORIZADA) {
        requisicao.status = StatusRequisicao.ORDEM_GERADA;
      }
      // Permite atualizar ordem_fornecimento_id mesmo se já existe (para regerar)
      requisicao.ordem_fornecimento_id = ordemSalva.id;
      await queryRunner.manager.save(requisicao);

      await queryRunner.commitTransaction();

      this.logger.log(
        `Ordem ${numero} gerada a partir da requisição ${requisicao.numero}. ` +
        `Valor: R$ ${valorTotal.toFixed(2)}`
      );

      // Gera PDF automaticamente
      try {
        const caminhoPdf = await this.pdfOrdemService.gerarPdf(ordemSalva.id);
        
        // Atualiza ordem com caminho do PDF
        ordemSalva.caminho_pdf = caminhoPdf;
        await this.ordemRepository.save(ordemSalva);
        
        this.logger.log(`PDF da ordem ${numero} gerado: ${caminhoPdf}`);
      } catch (pdfError) {
        // Não falha se PDF não puder ser gerado
        this.logger.warn(`Erro ao gerar PDF da ordem: ${pdfError.message}`);
      }

      return this.findOne(ordemSalva.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ============================================================================
  // ENVIAR ORDEM AO FORNECEDOR
  // ============================================================================

  async enviarOrdem(
    id: string, 
    emailFornecedor?: string,
    observacoes?: string,
  ): Promise<OrdemFornecimento> {
    const ordem = await this.findOne(id);

    if (ordem.status !== StatusOrdemFornecimento.EMITIDA) {
      throw new BadRequestException(
        `Ordem não pode ser enviada. Status atual: ${ordem.status}`
      );
    }

    ordem.status = StatusOrdemFornecimento.ENVIADA;
    ordem.data_envio = new Date();
    ordem.email_fornecedor = emailFornecedor || ordem.fornecedor?.email || null;
    ordem.observacoes_envio = observacoes || null;

    // TODO: Implementar envio real de email

    this.logger.log(`Ordem ${ordem.numero} enviada ao fornecedor`);

    return this.ordemRepository.save(ordem);
  }

  // ============================================================================
  // CANCELAR ORDEM
  // ============================================================================

  async cancelarOrdem(id: string, motivo: string): Promise<OrdemFornecimento> {
    const ordem = await this.findOne(id);

    // Só pode cancelar se não tiver nenhum recebimento
    if (ordem.status === StatusOrdemFornecimento.ATENDIDA || 
        ordem.status === StatusOrdemFornecimento.ATENDIDA_PARCIAL) {
      throw new BadRequestException(
        'Ordem com recebimentos não pode ser cancelada'
      );
    }

    ordem.status = StatusOrdemFornecimento.CANCELADA;
    ordem.observacoes = `${ordem.observacoes || ''}\n[CANCELADA] ${motivo}`.trim();

    // TODO: Se precisar, liberar saldo do contrato aqui

    this.logger.log(`Ordem ${ordem.numero} cancelada: ${motivo}`);

    return this.ordemRepository.save(ordem);
  }

  // ============================================================================
  // ATUALIZAR STATUS DE ATENDIMENTO
  // ============================================================================

  /**
   * Atualiza a quantidade entregue de um item da ordem
   * Chamado pelo serviço de recebimento
   */
  async atualizarAtendimento(
    ordemId: string,
    itemContratoId: string,
    quantidadeEntregue: number,
    valorEntregue: number,
  ): Promise<OrdemFornecimento> {
    const ordem = await this.findOne(ordemId);

    // Atualiza item
    const itemIndex = ordem.itens.findIndex(i => i.item_contrato_id === itemContratoId);
    if (itemIndex === -1) {
      throw new BadRequestException('Item não encontrado na ordem');
    }

    ordem.itens[itemIndex].quantidade_entregue += quantidadeEntregue;
    ordem.valor_entregue = Number(ordem.valor_entregue) + valorEntregue;

    // Verifica se está totalmente atendida
    const totalmenteAtendida = ordem.itens.every(
      item => item.quantidade_entregue >= item.quantidade
    );

    if (totalmenteAtendida) {
      ordem.status = StatusOrdemFornecimento.ATENDIDA;
      ordem.data_entrega_realizada = new Date();
    } else {
      ordem.status = StatusOrdemFornecimento.ATENDIDA_PARCIAL;
    }

    return this.ordemRepository.save(ordem);
  }

  // ============================================================================
  // CONSULTAS
  // ============================================================================

  async findAll(filtros: {
    orgaoId: string;
    status?: StatusOrdemFornecimento;
    contratoId?: string;
    fornecedorId?: string;
    dataInicio?: Date;
    dataFim?: Date;
  }): Promise<OrdemFornecimento[]> {
    const query = this.ordemRepository.createQueryBuilder('ordem')
      .leftJoinAndSelect('ordem.contrato', 'contrato')
      .leftJoinAndSelect('ordem.fornecedor', 'fornecedor')
      .leftJoinAndSelect('ordem.requisicao', 'requisicao')
      .where('ordem.orgao_id = :orgaoId', { orgaoId: filtros.orgaoId });

    if (filtros.status) {
      query.andWhere('ordem.status = :status', { status: filtros.status });
    }

    if (filtros.contratoId) {
      query.andWhere('ordem.contrato_id = :contratoId', { contratoId: filtros.contratoId });
    }

    if (filtros.fornecedorId) {
      query.andWhere('ordem.fornecedor_id = :fornecedorId', { fornecedorId: filtros.fornecedorId });
    }

    if (filtros.dataInicio) {
      query.andWhere('ordem.data_emissao >= :dataInicio', { dataInicio: filtros.dataInicio });
    }

    if (filtros.dataFim) {
      query.andWhere('ordem.data_emissao <= :dataFim', { dataFim: filtros.dataFim });
    }

    return query.orderBy('ordem.created_at', 'DESC').getMany();
  }

  async findOne(id: string): Promise<OrdemFornecimento> {
    const ordem = await this.ordemRepository.findOne({
      where: { id },
      relations: ['contrato', 'fornecedor', 'requisicao'],
    });

    if (!ordem) {
      throw new NotFoundException('Ordem de fornecimento não encontrada');
    }

    return ordem;
  }

  async findPendentesEnvio(orgaoId: string): Promise<OrdemFornecimento[]> {
    return this.ordemRepository.find({
      where: { 
        orgao_id: orgaoId, 
        status: StatusOrdemFornecimento.EMITIDA 
      },
      relations: ['contrato', 'fornecedor'],
      order: { created_at: 'ASC' },
    });
  }

  async findEmAndamento(orgaoId: string): Promise<OrdemFornecimento[]> {
    return this.ordemRepository.createQueryBuilder('ordem')
      .leftJoinAndSelect('ordem.contrato', 'contrato')
      .leftJoinAndSelect('ordem.fornecedor', 'fornecedor')
      .where('ordem.orgao_id = :orgaoId', { orgaoId })
      .andWhere('ordem.status IN (:...status)', { 
        status: [
          StatusOrdemFornecimento.ENVIADA,
          StatusOrdemFornecimento.EM_ATENDIMENTO,
          StatusOrdemFornecimento.ATENDIDA_PARCIAL,
        ]
      })
      .orderBy('ordem.data_entrega_prevista', 'ASC')
      .getMany();
  }

  // ============================================================================
  // ESTATÍSTICAS
  // ============================================================================

  async getEstatisticas(orgaoId: string): Promise<{
    total: number;
    por_status: Record<string, number>;
    pendentes_envio: number;
    em_andamento: number;
    valor_total_emitido: number;
    valor_total_entregue: number;
  }> {
    const ordens = await this.ordemRepository.find({
      where: { orgao_id: orgaoId },
    });

    const por_status: Record<string, number> = {};
    let valor_total_emitido = 0;
    let valor_total_entregue = 0;
    let pendentes_envio = 0;
    let em_andamento = 0;

    for (const ordem of ordens) {
      por_status[ordem.status] = (por_status[ordem.status] || 0) + 1;
      valor_total_emitido += Number(ordem.valor_total);
      valor_total_entregue += Number(ordem.valor_entregue);

      if (ordem.status === StatusOrdemFornecimento.EMITIDA) {
        pendentes_envio++;
      }

      if ([
        StatusOrdemFornecimento.ENVIADA,
        StatusOrdemFornecimento.EM_ATENDIMENTO,
        StatusOrdemFornecimento.ATENDIDA_PARCIAL,
      ].includes(ordem.status)) {
        em_andamento++;
      }
    }

    return {
      total: ordens.length,
      por_status,
      pendentes_envio,
      em_andamento,
      valor_total_emitido,
      valor_total_entregue,
    };
  }
}

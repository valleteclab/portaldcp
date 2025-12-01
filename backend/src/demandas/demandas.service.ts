import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Demanda, ItemDemanda, StatusDemanda } from './entities/demanda.entity';

@Injectable()
export class DemandasService {
  constructor(
    @InjectRepository(Demanda)
    private demandaRepository: Repository<Demanda>,
    @InjectRepository(ItemDemanda)
    private itemDemandaRepository: Repository<ItemDemanda>,
  ) {}

  // ==================== DEMANDAS ====================

  async findAll(params: {
    orgaoId: string;
    ano?: number;
    status?: StatusDemanda;
    unidadeRequisitante?: string;
  }): Promise<Demanda[]> {
    const query = this.demandaRepository.createQueryBuilder('d')
      .leftJoinAndSelect('d.itens', 'itens')
      .where('d.orgao_id = :orgaoId', { orgaoId: params.orgaoId });

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

    return query.getMany();
  }

  async findOne(id: string): Promise<Demanda> {
    const demanda = await this.demandaRepository.findOne({
      where: { id },
      relations: ['itens']
    });

    if (!demanda) {
      throw new NotFoundException('Demanda não encontrada');
    }

    return demanda;
  }

  async create(dados: {
    orgaoId: string;
    ano_referencia: number;
    unidade_requisitante: string;
    responsavel_nome?: string;
    responsavel_email?: string;
    responsavel_telefone?: string;
    observacoes?: string;
  }): Promise<Demanda> {
    const demanda = this.demandaRepository.create({
      orgao_id: dados.orgaoId,
      ano_referencia: dados.ano_referencia,
      unidade_requisitante: dados.unidade_requisitante,
      responsavel_nome: dados.responsavel_nome,
      responsavel_email: dados.responsavel_email,
      responsavel_telefone: dados.responsavel_telefone,
      observacoes: dados.observacoes,
      status: StatusDemanda.RASCUNHO,
    });

    return this.demandaRepository.save(demanda);
  }

  async update(id: string, dados: Partial<Demanda>): Promise<Demanda> {
    const demanda = await this.findOne(id);

    // Não permite editar demandas já consolidadas
    if (demanda.status === StatusDemanda.CONSOLIDADA) {
      throw new BadRequestException('Demanda já consolidada não pode ser editada');
    }

    Object.assign(demanda, dados);
    return this.demandaRepository.save(demanda);
  }

  async delete(id: string): Promise<void> {
    const demanda = await this.findOne(id);

    if (demanda.status === StatusDemanda.CONSOLIDADA) {
      throw new BadRequestException('Demanda já consolidada não pode ser excluída');
    }

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

    demanda.status = StatusDemanda.ENVIADA;
    demanda.data_envio = new Date();

    return this.demandaRepository.save(demanda);
  }

  async iniciarAnalise(id: string): Promise<Demanda> {
    const demanda = await this.findOne(id);

    if (demanda.status !== StatusDemanda.ENVIADA) {
      throw new BadRequestException('Apenas demandas enviadas podem entrar em análise');
    }

    demanda.status = StatusDemanda.EM_ANALISE;
    return this.demandaRepository.save(demanda);
  }

  async aprovar(id: string, aprovadoPor: string): Promise<Demanda> {
    const demanda = await this.findOne(id);

    if (demanda.status !== StatusDemanda.EM_ANALISE && demanda.status !== StatusDemanda.ENVIADA) {
      throw new BadRequestException('Demanda não está em análise');
    }

    demanda.status = StatusDemanda.APROVADA;
    demanda.data_aprovacao = new Date();
    demanda.aprovado_por = aprovadoPor;
    demanda.motivo_rejeicao = undefined as any;

    return this.demandaRepository.save(demanda);
  }

  async rejeitar(id: string, motivo: string): Promise<Demanda> {
    const demanda = await this.findOne(id);

    if (demanda.status !== StatusDemanda.EM_ANALISE && demanda.status !== StatusDemanda.ENVIADA) {
      throw new BadRequestException('Demanda não está em análise');
    }

    demanda.status = StatusDemanda.REJEITADA;
    demanda.motivo_rejeicao = motivo;

    return this.demandaRepository.save(demanda);
  }

  async voltarParaRascunho(id: string): Promise<Demanda> {
    const demanda = await this.findOne(id);

    if (demanda.status === StatusDemanda.CONSOLIDADA) {
      throw new BadRequestException('Demanda consolidada não pode voltar para rascunho');
    }

    demanda.status = StatusDemanda.RASCUNHO;
    demanda.data_envio = undefined as any;
    demanda.data_aprovacao = undefined as any;
    demanda.aprovado_por = undefined as any;
    demanda.motivo_rejeicao = undefined as any;

    return this.demandaRepository.save(demanda);
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
    return this.demandaRepository.find({
      where: {
        orgao_id: orgaoId,
        ano_referencia: ano,
        status: StatusDemanda.APROVADA
      },
      relations: ['itens'],
      order: { unidade_requisitante: 'ASC' }
    });
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

  async vincularItemAoPCA(itemDemandaId: string, itemPcaId: string): Promise<ItemDemanda> {
    const item = await this.itemDemandaRepository.findOne({ where: { id: itemDemandaId } });
    
    if (!item) {
      throw new NotFoundException('Item da demanda não encontrado');
    }

    item.item_pca_id = itemPcaId;
    return this.itemDemandaRepository.save(item);
  }

  // ==================== ESTATÍSTICAS ====================

  async getEstatisticas(orgaoId: string, ano: number): Promise<{
    total: number;
    porStatus: { status: string; total: number; valor: number }[];
    porUnidade: { unidade: string; total: number; valor: number }[];
    valorTotal: number;
  }> {
    const demandas = await this.findAll({ orgaoId, ano });

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

  async getUnidadesRequisitantes(orgaoId: string): Promise<string[]> {
    const result = await this.demandaRepository
      .createQueryBuilder('d')
      .select('DISTINCT d.unidade_requisitante', 'unidade')
      .where('d.orgao_id = :orgaoId', { orgaoId })
      .andWhere('d.unidade_requisitante IS NOT NULL')
      .orderBy('d.unidade_requisitante', 'ASC')
      .getRawMany();

    return result.map(r => r.unidade);
  }
}

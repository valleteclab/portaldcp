import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemLicitacao, StatusItem } from './entities/item-licitacao.entity';
import { CreateItemDto, UpdateItemDto, AdjudicarItemDto } from './dto/create-item.dto';

@Injectable()
export class ItensService {
  constructor(
    @InjectRepository(ItemLicitacao)
    private readonly itemRepository: Repository<ItemLicitacao>,
  ) {}

  async create(createDto: CreateItemDto): Promise<ItemLicitacao> {
    // Calcula valor total estimado
    const valorTotal = createDto.quantidade * createDto.valor_unitario_estimado;

    const item = this.itemRepository.create({
      ...createDto,
      valor_total_estimado: valorTotal,
    });

    return await this.itemRepository.save(item);
  }

  async createBatch(licitacaoId: string, itens: CreateItemDto[]): Promise<ItemLicitacao[]> {
    const criados: ItemLicitacao[] = [];

    for (const itemDto of itens) {
      const item = await this.create({
        ...itemDto,
        licitacao_id: licitacaoId,
      });
      criados.push(item);
    }

    return criados;
  }

  async findByLicitacao(licitacaoId: string): Promise<ItemLicitacao[]> {
    return await this.itemRepository.find({
      where: { licitacao_id: licitacaoId },
      order: { numero_lote: 'ASC', numero_item: 'ASC' }
    });
  }

  async findOne(id: string): Promise<ItemLicitacao> {
    const item = await this.itemRepository.findOne({
      where: { id },
      relations: ['licitacao']
    });
    if (!item) {
      throw new NotFoundException(`Item com ID ${id} não encontrado`);
    }
    return item;
  }

  async update(id: string, updateDto: UpdateItemDto): Promise<ItemLicitacao> {
    const item = await this.findOne(id);

    if (item.status !== StatusItem.ATIVO) {
      throw new BadRequestException('Não é possível alterar item que não está ativo');
    }

    Object.assign(item, updateDto);

    // Recalcula valor total se quantidade ou valor unitário mudou
    if (updateDto.quantidade || updateDto.valor_unitario_estimado) {
      item.valor_total_estimado = item.quantidade * item.valor_unitario_estimado;
    }

    return await this.itemRepository.save(item);
  }

  async cancelar(id: string, motivo: string): Promise<ItemLicitacao> {
    const item = await this.findOne(id);
    item.status = StatusItem.CANCELADO;
    item.observacoes = `Cancelado: ${motivo}`;
    return await this.itemRepository.save(item);
  }

  async marcarDeserto(id: string): Promise<ItemLicitacao> {
    const item = await this.findOne(id);
    item.status = StatusItem.DESERTO;
    return await this.itemRepository.save(item);
  }

  async marcarFracassado(id: string, motivo: string): Promise<ItemLicitacao> {
    const item = await this.findOne(id);
    item.status = StatusItem.FRACASSADO;
    item.observacoes = `Fracassado: ${motivo}`;
    return await this.itemRepository.save(item);
  }

  async adjudicar(id: string, dados: AdjudicarItemDto): Promise<ItemLicitacao> {
    const item = await this.findOne(id);

    item.status = StatusItem.ADJUDICADO;
    item.fornecedor_vencedor_id = dados.fornecedor_id;
    item.fornecedor_vencedor_nome = dados.fornecedor_nome;
    item.valor_unitario_homologado = dados.valor_unitario_homologado;
    item.valor_total_homologado = item.quantidade * dados.valor_unitario_homologado;

    return await this.itemRepository.save(item);
  }

  async homologar(id: string): Promise<ItemLicitacao> {
    const item = await this.findOne(id);

    if (item.status !== StatusItem.ADJUDICADO) {
      throw new BadRequestException('Item precisa estar adjudicado para ser homologado');
    }

    item.status = StatusItem.HOMOLOGADO;
    return await this.itemRepository.save(item);
  }

  // Estatísticas
  async getResumoLicitacao(licitacaoId: string) {
    const itens = await this.findByLicitacao(licitacaoId);

    const totalItens = itens.length;
    const valorEstimado = itens.reduce((sum, i) => sum + Number(i.valor_total_estimado), 0);
    const valorHomologado = itens
      .filter(i => i.valor_total_homologado)
      .reduce((sum, i) => sum + Number(i.valor_total_homologado), 0);

    const porStatus = {
      ativos: itens.filter(i => i.status === StatusItem.ATIVO).length,
      adjudicados: itens.filter(i => i.status === StatusItem.ADJUDICADO).length,
      homologados: itens.filter(i => i.status === StatusItem.HOMOLOGADO).length,
      cancelados: itens.filter(i => i.status === StatusItem.CANCELADO).length,
      desertos: itens.filter(i => i.status === StatusItem.DESERTO).length,
      fracassados: itens.filter(i => i.status === StatusItem.FRACASSADO).length,
    };

    const economia = valorEstimado - valorHomologado;
    const percentualEconomia = valorEstimado > 0 ? (economia / valorEstimado) * 100 : 0;

    return {
      totalItens,
      valorEstimado,
      valorHomologado,
      economia,
      percentualEconomia: percentualEconomia.toFixed(2),
      porStatus,
    };
  }
}

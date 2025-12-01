import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { AtaRegistroPreco, ItemAta, StatusAta } from './entities/ata-registro-preco.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';

@Injectable()
export class AtasService {
  constructor(
    @InjectRepository(AtaRegistroPreco)
    private ataRepository: Repository<AtaRegistroPreco>,
    @InjectRepository(ItemAta)
    private itemAtaRepository: Repository<ItemAta>,
    @InjectRepository(Licitacao)
    private licitacaoRepository: Repository<Licitacao>,
  ) {}

  // ============ ATAS ============

  async criar(dados: Partial<AtaRegistroPreco>): Promise<AtaRegistroPreco> {
    // Gerar número da ata
    const ano = new Date().getFullYear();
    const ultimaAta = await this.ataRepository.findOne({
      where: { orgao_id: dados.orgao_id, ano },
      order: { sequencial: 'DESC' }
    });

    const sequencial = ultimaAta ? ultimaAta.sequencial + 1 : 1;
    const numeroAta = `${String(sequencial).padStart(3, '0')}/${ano}`;

    const ata = this.ataRepository.create({
      ...dados,
      ano,
      sequencial,
      numero_ata: numeroAta,
      valor_saldo: dados.valor_total
    });

    return this.ataRepository.save(ata);
  }

  async criarAPartirDaLicitacao(licitacaoId: string, dados: Partial<AtaRegistroPreco>): Promise<AtaRegistroPreco> {
    const licitacao = await this.licitacaoRepository.findOne({
      where: { id: licitacaoId },
      relations: ['orgao', 'itens']
    });

    if (!licitacao) {
      throw new NotFoundException('Licitação não encontrada');
    }

    if (!licitacao.srp) {
      throw new BadRequestException('Licitação não é do tipo Sistema de Registro de Preços');
    }

    return this.criar({
      ...dados,
      licitacao_id: licitacaoId,
      orgao_id: licitacao.orgao_id,
      objeto: dados.objeto || licitacao.objeto
    });
  }

  async findAll(filtros?: {
    orgaoId?: string;
    fornecedorId?: string;
    status?: StatusAta;
    ano?: number;
    vigentes?: boolean;
  }): Promise<AtaRegistroPreco[]> {
    const query = this.ataRepository.createQueryBuilder('ata')
      .leftJoinAndSelect('ata.orgao', 'orgao')
      .leftJoinAndSelect('ata.fornecedor', 'fornecedor')
      .leftJoinAndSelect('ata.licitacao', 'licitacao');

    if (filtros?.orgaoId) {
      query.andWhere('ata.orgao_id = :orgaoId', { orgaoId: filtros.orgaoId });
    }

    if (filtros?.fornecedorId) {
      query.andWhere('ata.fornecedor_id = :fornecedorId', { fornecedorId: filtros.fornecedorId });
    }

    if (filtros?.status) {
      query.andWhere('ata.status = :status', { status: filtros.status });
    }

    if (filtros?.ano) {
      query.andWhere('ata.ano = :ano', { ano: filtros.ano });
    }

    if (filtros?.vigentes) {
      const hoje = new Date();
      query.andWhere('ata.status = :statusVigente', { statusVigente: StatusAta.VIGENTE })
        .andWhere('ata.data_vigencia_fim >= :hoje', { hoje });
    }

    return query.orderBy('ata.created_at', 'DESC').getMany();
  }

  async findOne(id: string): Promise<AtaRegistroPreco> {
    const ata = await this.ataRepository.findOne({
      where: { id },
      relations: ['orgao', 'fornecedor', 'licitacao', 'itens']
    });

    if (!ata) {
      throw new NotFoundException('Ata não encontrada');
    }

    return ata;
  }

  async atualizar(id: string, dados: Partial<AtaRegistroPreco>): Promise<AtaRegistroPreco> {
    const ata = await this.findOne(id);
    Object.assign(ata, dados);
    return this.ataRepository.save(ata);
  }

  async alterarStatus(id: string, status: StatusAta): Promise<AtaRegistroPreco> {
    const ata = await this.findOne(id);
    ata.status = status;
    return this.ataRepository.save(ata);
  }

  // ============ ITENS DA ATA ============

  async adicionarItem(ataId: string, dados: Partial<ItemAta>): Promise<ItemAta> {
    const ata = await this.findOne(ataId);

    // Gerar número do item
    const ultimoItem = await this.itemAtaRepository.findOne({
      where: { ata_id: ataId },
      order: { numero_item: 'DESC' }
    });

    const numeroItem = ultimoItem ? ultimoItem.numero_item + 1 : 1;

    const item = this.itemAtaRepository.create({
      ...dados,
      ata_id: ataId,
      numero_item: numeroItem,
      quantidade_saldo: dados.quantidade_registrada,
      valor_total: Number(dados.quantidade_registrada) * Number(dados.valor_unitario)
    });

    const itemSalvo = await this.itemAtaRepository.save(item);

    // Atualizar valor total da ata
    await this.recalcularValorAta(ataId);

    return itemSalvo;
  }

  async findItens(ataId: string): Promise<ItemAta[]> {
    return this.itemAtaRepository.find({
      where: { ata_id: ataId },
      order: { numero_item: 'ASC' }
    });
  }

  async atualizarItem(itemId: string, dados: Partial<ItemAta>): Promise<ItemAta> {
    const item = await this.itemAtaRepository.findOne({ where: { id: itemId } });
    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    Object.assign(item, dados);
    
    if (dados.quantidade_registrada || dados.valor_unitario) {
      item.valor_total = Number(item.quantidade_registrada) * Number(item.valor_unitario);
    }

    const itemSalvo = await this.itemAtaRepository.save(item);
    await this.recalcularValorAta(item.ata_id);

    return itemSalvo;
  }

  async utilizarItem(itemId: string, quantidade: number): Promise<ItemAta> {
    const item = await this.itemAtaRepository.findOne({ 
      where: { id: itemId },
      relations: ['ata']
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    if (quantidade > Number(item.quantidade_saldo)) {
      throw new BadRequestException('Quantidade solicitada maior que o saldo disponível');
    }

    item.quantidade_utilizada = Number(item.quantidade_utilizada) + quantidade;
    item.quantidade_saldo = Number(item.quantidade_registrada) - Number(item.quantidade_utilizada);

    const itemSalvo = await this.itemAtaRepository.save(item);
    await this.recalcularSaldoAta(item.ata_id);

    return itemSalvo;
  }

  private async recalcularValorAta(ataId: string): Promise<void> {
    const itens = await this.itemAtaRepository.find({ where: { ata_id: ataId, ativo: true } });
    const valorTotal = itens.reduce((sum, item) => sum + Number(item.valor_total), 0);

    await this.ataRepository.update(ataId, { valor_total: valorTotal, valor_saldo: valorTotal });
  }

  private async recalcularSaldoAta(ataId: string): Promise<void> {
    const itens = await this.itemAtaRepository.find({ where: { ata_id: ataId, ativo: true } });
    
    const valorUtilizado = itens.reduce((sum, item) => 
      sum + (Number(item.quantidade_utilizada) * Number(item.valor_unitario)), 0);
    
    const valorSaldo = itens.reduce((sum, item) => 
      sum + (Number(item.quantidade_saldo) * Number(item.valor_unitario)), 0);

    await this.ataRepository.update(ataId, { 
      valor_utilizado: valorUtilizado, 
      valor_saldo: valorSaldo 
    });

    // Verificar se ata está esgotada
    if (valorSaldo <= 0) {
      await this.ataRepository.update(ataId, { status: StatusAta.ESGOTADA });
    }
  }

  // ============ CONSULTAS PÚBLICAS ============

  async findPublicas(filtros?: {
    orgaoId?: string;
    fornecedorCnpj?: string;
    ano?: number;
    vigentes?: boolean;
  }): Promise<AtaRegistroPreco[]> {
    const query = this.ataRepository.createQueryBuilder('ata')
      .leftJoinAndSelect('ata.orgao', 'orgao')
      .leftJoinAndSelect('ata.itens', 'itens')
      .select([
        'ata.id',
        'ata.numero_ata',
        'ata.ano',
        'ata.status',
        'ata.objeto',
        'ata.valor_total',
        'ata.valor_saldo',
        'ata.data_assinatura',
        'ata.data_vigencia_inicio',
        'ata.data_vigencia_fim',
        'ata.fornecedor_cnpj',
        'ata.fornecedor_razao_social',
        'ata.permite_adesao',
        'orgao.id',
        'orgao.nome',
        'orgao.cnpj',
        'itens.id',
        'itens.numero_item',
        'itens.descricao',
        'itens.unidade_medida',
        'itens.quantidade_registrada',
        'itens.quantidade_saldo',
        'itens.valor_unitario'
      ]);

    if (filtros?.orgaoId) {
      query.andWhere('ata.orgao_id = :orgaoId', { orgaoId: filtros.orgaoId });
    }

    if (filtros?.fornecedorCnpj) {
      query.andWhere('ata.fornecedor_cnpj = :cnpj', { cnpj: filtros.fornecedorCnpj });
    }

    if (filtros?.ano) {
      query.andWhere('ata.ano = :ano', { ano: filtros.ano });
    }

    if (filtros?.vigentes) {
      const hoje = new Date();
      query.andWhere('ata.status = :status', { status: StatusAta.VIGENTE })
        .andWhere('ata.data_vigencia_fim >= :hoje', { hoje });
    }

    return query.orderBy('ata.data_assinatura', 'DESC').getMany();
  }

  async findPublicaById(id: string): Promise<AtaRegistroPreco> {
    const ata = await this.ataRepository.findOne({
      where: { id },
      relations: ['orgao', 'licitacao', 'itens']
    });

    if (!ata) {
      throw new NotFoundException('Ata não encontrada');
    }

    return ata;
  }

  // ============ ESTATÍSTICAS ============

  async contarPorStatus(orgaoId: string): Promise<Record<string, number>> {
    const atas = await this.ataRepository.find({ where: { orgao_id: orgaoId } });
    
    const contagem: Record<string, number> = {};
    atas.forEach(a => {
      contagem[a.status] = (contagem[a.status] || 0) + 1;
    });

    return contagem;
  }

  async atasAVencer(orgaoId: string, dias: number = 30): Promise<AtaRegistroPreco[]> {
    const hoje = new Date();
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() + dias);

    return this.ataRepository.find({
      where: {
        orgao_id: orgaoId,
        status: StatusAta.VIGENTE,
        data_vigencia_fim: Between(hoje, dataLimite)
      },
      relations: ['fornecedor'],
      order: { data_vigencia_fim: 'ASC' }
    });
  }
}

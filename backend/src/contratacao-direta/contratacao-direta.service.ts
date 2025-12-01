import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContratacaoDireta, ItemContratacaoDireta, TipoContratacaoDireta, StatusContratacaoDireta, HipoteseDispensa } from './entities/contratacao-direta.entity';

@Injectable()
export class ContratacaoDiretaService {
  constructor(
    @InjectRepository(ContratacaoDireta)
    private contratacaoRepository: Repository<ContratacaoDireta>,
    @InjectRepository(ItemContratacaoDireta)
    private itemRepository: Repository<ItemContratacaoDireta>,
  ) {}

  // ============ CRUD ============

  async criar(dados: Partial<ContratacaoDireta>): Promise<ContratacaoDireta> {
    const ano = new Date().getFullYear();
    const count = await this.contratacaoRepository.count({
      where: { orgao_id: dados.orgao_id, ano, tipo: dados.tipo }
    });

    const prefixo = dados.tipo === TipoContratacaoDireta.DISPENSA ? 'DL' : 'IN';
    
    const contratacao = this.contratacaoRepository.create({
      ...dados,
      ano,
      sequencial: count + 1,
      numero_processo: `${prefixo}-${String(count + 1).padStart(4, '0')}/${ano}`,
      status: StatusContratacaoDireta.RASCUNHO,
      data_abertura: new Date()
    });

    // Definir fundamentação legal
    if (dados.tipo === TipoContratacaoDireta.DISPENSA) {
      contratacao.fundamentacao_legal = `Art. 75, inciso ${dados.hipotese_dispensa} da Lei 14.133/2021`;
    } else {
      contratacao.fundamentacao_legal = `Art. 74, inciso ${dados.hipotese_inexigibilidade} da Lei 14.133/2021`;
    }

    return this.contratacaoRepository.save(contratacao);
  }

  async findAll(filtros?: {
    orgaoId?: string;
    tipo?: TipoContratacaoDireta;
    status?: StatusContratacaoDireta;
    ano?: number;
  }): Promise<ContratacaoDireta[]> {
    const query = this.contratacaoRepository.createQueryBuilder('c')
      .leftJoinAndSelect('c.orgao', 'orgao');

    if (filtros?.orgaoId) {
      query.andWhere('c.orgao_id = :orgaoId', { orgaoId: filtros.orgaoId });
    }

    if (filtros?.tipo) {
      query.andWhere('c.tipo = :tipo', { tipo: filtros.tipo });
    }

    if (filtros?.status) {
      query.andWhere('c.status = :status', { status: filtros.status });
    }

    if (filtros?.ano) {
      query.andWhere('c.ano = :ano', { ano: filtros.ano });
    }

    return query.orderBy('c.created_at', 'DESC').getMany();
  }

  async findPublicos(filtros?: {
    tipo?: TipoContratacaoDireta;
    uf?: string;
    dispensaEletronica?: boolean;
  }): Promise<ContratacaoDireta[]> {
    const statusPublicos = [
      StatusContratacaoDireta.PUBLICADO,
      StatusContratacaoDireta.EM_COTACAO,
      StatusContratacaoDireta.ADJUDICADO,
      StatusContratacaoDireta.HOMOLOGADO,
      StatusContratacaoDireta.CONTRATADO
    ];

    const query = this.contratacaoRepository.createQueryBuilder('c')
      .leftJoinAndSelect('c.orgao', 'orgao')
      .where('c.status IN (:...status)', { status: statusPublicos });

    if (filtros?.tipo) {
      query.andWhere('c.tipo = :tipo', { tipo: filtros.tipo });
    }

    if (filtros?.uf) {
      query.andWhere('orgao.uf = :uf', { uf: filtros.uf });
    }

    if (filtros?.dispensaEletronica !== undefined) {
      query.andWhere('c.dispensa_eletronica = :de', { de: filtros.dispensaEletronica });
    }

    return query.orderBy('c.data_publicacao', 'DESC').getMany();
  }

  async findOne(id: string): Promise<ContratacaoDireta> {
    const contratacao = await this.contratacaoRepository.findOne({
      where: { id },
      relations: ['orgao']
    });

    if (!contratacao) {
      throw new NotFoundException('Contratação direta não encontrada');
    }

    return contratacao;
  }

  async atualizar(id: string, dados: Partial<ContratacaoDireta>): Promise<ContratacaoDireta> {
    const contratacao = await this.findOne(id);

    const statusProtegidos = [
      StatusContratacaoDireta.HOMOLOGADO,
      StatusContratacaoDireta.CONTRATADO
    ];

    if (statusProtegidos.includes(contratacao.status)) {
      throw new BadRequestException('Não é possível alterar uma contratação já homologada');
    }

    Object.assign(contratacao, dados);
    return this.contratacaoRepository.save(contratacao);
  }

  // ============ FLUXO ============

  async enviarParaAprovacao(id: string): Promise<ContratacaoDireta> {
    const contratacao = await this.findOne(id);
    contratacao.status = StatusContratacaoDireta.AGUARDANDO_APROVACAO;
    return this.contratacaoRepository.save(contratacao);
  }

  async aprovar(id: string, autoridade: string): Promise<ContratacaoDireta> {
    const contratacao = await this.findOne(id);
    contratacao.status = StatusContratacaoDireta.APROVADO;
    contratacao.autoridade_competente = autoridade;
    return this.contratacaoRepository.save(contratacao);
  }

  async publicar(id: string): Promise<ContratacaoDireta> {
    const contratacao = await this.findOne(id);

    if (contratacao.status !== StatusContratacaoDireta.APROVADO) {
      throw new BadRequestException('Contratação precisa estar aprovada para ser publicada');
    }

    contratacao.status = StatusContratacaoDireta.PUBLICADO;
    contratacao.data_publicacao = new Date();

    // Se for dispensa eletrônica, definir prazo mínimo de 3 horas
    if (contratacao.dispensa_eletronica) {
      contratacao.status = StatusContratacaoDireta.EM_COTACAO;
      if (!contratacao.prazo_propostas_horas) {
        contratacao.prazo_propostas_horas = 3;
      }
      const prazo = new Date();
      prazo.setHours(prazo.getHours() + contratacao.prazo_propostas_horas);
      contratacao.data_limite_propostas = prazo;
    }

    return this.contratacaoRepository.save(contratacao);
  }

  async adjudicar(id: string, dados: {
    fornecedor_id: string;
    fornecedor_cnpj: string;
    fornecedor_razao_social: string;
    valor_contratado: number;
  }): Promise<ContratacaoDireta> {
    const contratacao = await this.findOne(id);

    contratacao.status = StatusContratacaoDireta.ADJUDICADO;
    contratacao.fornecedor_id = dados.fornecedor_id;
    contratacao.fornecedor_cnpj = dados.fornecedor_cnpj;
    contratacao.fornecedor_razao_social = dados.fornecedor_razao_social;
    contratacao.valor_contratado = dados.valor_contratado;
    contratacao.data_adjudicacao = new Date();

    return this.contratacaoRepository.save(contratacao);
  }

  async homologar(id: string): Promise<ContratacaoDireta> {
    const contratacao = await this.findOne(id);
    contratacao.status = StatusContratacaoDireta.HOMOLOGADO;
    contratacao.data_homologacao = new Date();
    return this.contratacaoRepository.save(contratacao);
  }

  async cancelar(id: string, motivo: string): Promise<ContratacaoDireta> {
    const contratacao = await this.findOne(id);
    contratacao.status = StatusContratacaoDireta.CANCELADO;
    contratacao.observacoes = `Cancelado: ${motivo}`;
    return this.contratacaoRepository.save(contratacao);
  }

  // ============ ITENS ============

  async adicionarItem(contratacaoId: string, dados: Partial<ItemContratacaoDireta>): Promise<ItemContratacaoDireta> {
    const ultimoItem = await this.itemRepository.findOne({
      where: { contratacao_direta_id: contratacaoId },
      order: { numero_item: 'DESC' }
    });

    const item = this.itemRepository.create({
      ...dados,
      contratacao_direta_id: contratacaoId,
      numero_item: ultimoItem ? ultimoItem.numero_item + 1 : 1
    });

    const itemSalvo = await this.itemRepository.save(item);

    // Recalcular valor estimado
    await this.recalcularValor(contratacaoId);

    return itemSalvo;
  }

  async findItens(contratacaoId: string): Promise<ItemContratacaoDireta[]> {
    return this.itemRepository.find({
      where: { contratacao_direta_id: contratacaoId },
      order: { numero_item: 'ASC' }
    });
  }

  async removerItem(itemId: string): Promise<void> {
    const item = await this.itemRepository.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Item não encontrado');

    const contratacaoId = item.contratacao_direta_id;
    await this.itemRepository.remove(item);
    await this.recalcularValor(contratacaoId);
  }

  private async recalcularValor(contratacaoId: string): Promise<void> {
    const itens = await this.findItens(contratacaoId);
    const valorTotal = itens.reduce((sum, item) => {
      return sum + (Number(item.quantidade) * Number(item.valor_unitario_estimado));
    }, 0);

    await this.contratacaoRepository.update(contratacaoId, {
      valor_estimado: valorTotal
    });
  }

  // ============ ESTATÍSTICAS ============

  async getEstatisticas(orgaoId: string, ano?: number): Promise<{
    dispensas: number;
    inexigibilidades: number;
    valorTotalDispensas: number;
    valorTotalInexigibilidades: number;
    porStatus: Record<string, number>;
  }> {
    const anoFiltro = ano || new Date().getFullYear();

    const contratacoes = await this.contratacaoRepository.find({
      where: { orgao_id: orgaoId, ano: anoFiltro }
    });

    const dispensas = contratacoes.filter(c => c.tipo === TipoContratacaoDireta.DISPENSA);
    const inexigibilidades = contratacoes.filter(c => c.tipo === TipoContratacaoDireta.INEXIGIBILIDADE);

    const porStatus: Record<string, number> = {};
    contratacoes.forEach(c => {
      porStatus[c.status] = (porStatus[c.status] || 0) + 1;
    });

    return {
      dispensas: dispensas.length,
      inexigibilidades: inexigibilidades.length,
      valorTotalDispensas: dispensas.reduce((sum, c) => sum + Number(c.valor_estimado), 0),
      valorTotalInexigibilidades: inexigibilidades.reduce((sum, c) => sum + Number(c.valor_estimado), 0),
      porStatus
    };
  }
}

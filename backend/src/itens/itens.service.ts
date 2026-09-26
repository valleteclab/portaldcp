import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemLicitacao, StatusItem, UnidadeMedida } from './entities/item-licitacao.entity';
import { CreateItemDto, UpdateItemDto, ImportarItensPcaDto } from './dto/create-item.dto';
import { ItemPCA } from '../pca/entities/pca.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { TransicoesService } from '../licitacoes/transicoes/transicoes.service';
import { ehFaseInterna } from '../licitacoes/transicoes/fases';
import { AtorTransicao, atorSistema } from '../licitacoes/transicoes/transicoes.tipos';

/**
 * Campos que o PUT do item nunca altera: vínculo com a licitação (mover item
 * para processo de outro órgão), estado e resultado da disputa. Não há
 * ValidationPipe global com whitelist, então o corpo é filtrado aqui.
 */
const CAMPOS_PROTEGIDOS_ITEM = [
  'id',
  'licitacao_id',
  'licitacao',
  'status',
  'status_disputa',
  'melhor_lance_valor',
  'melhor_lance_fornecedor_id',
  'fornecedor_vencedor_id',
  'fornecedor_vencedor_nome',
  'marca_vencedora',
  'valor_unitario_homologado',
  'valor_total_homologado',
  'created_at',
  'updated_at',
];

/** Dados da licitação que decidem a visão pública dos itens. */
export type LicitacaoVisaoItem = Pick<Licitacao, 'id' | 'orgao_id' | 'fase' | 'data_publicacao_edital' | 'sigilo_orcamento'>;

@Injectable()
export class ItensService {
  private readonly logger = new Logger(ItensService.name);

  constructor(
    @InjectRepository(ItemLicitacao)
    private readonly itemRepository: Repository<ItemLicitacao>,
    @InjectRepository(ItemPCA)
    private readonly itemPcaRepository: Repository<ItemPCA>,
    private readonly transicoes: TransicoesService,
  ) {}

  /**
   * Itens só mudam enquanto a licitação está na fase interna. Depois de
   * publicado, o objeto integra o edital: itens não se retificam — mudar o
   * objeto exige revogar e republicar (decisão E7; art. 55, §1º).
   */
  private async exigirItensEditaveis(licitacaoId: string | null | undefined): Promise<void> {
    if (!licitacaoId) return;
    const lic = await this.itemRepository.manager.findOne(Licitacao, {
      where: { id: licitacaoId },
      select: ['id', 'fase'],
    });
    if (lic && !ehFaseInterna(lic.fase)) {
      throw new ConflictException(
        'Itens não podem ser alterados depois da publicação: o objeto integra o edital. Para mudar o objeto, cancele a publicação (sem propostas) ou revogue e republique.',
      );
    }
  }

  async create(createDto: CreateItemDto): Promise<ItemLicitacao> {
    await this.exigirItensEditaveis(createDto.licitacao_id);
    // Log para debug dos campos do catálogo
    this.logger.log(`[create] Campos do catálogo recebidos:`, {
      codigo_catalogo: createDto.codigo_catalogo,
      codigo_catmat: createDto.codigo_catmat,
      codigo_catser: createDto.codigo_catser,
      classe_catalogo: createDto.classe_catalogo,
      descricao: createDto.descricao_resumida
    });

    // Calcula valor total estimado
    const valorTotal = createDto.quantidade * createDto.valor_unitario_estimado;

    const item = this.itemRepository.create({
      ...createDto,
      valor_total_estimado: valorTotal,
    });

    const saved = await this.itemRepository.save(item);
    
    // Log para verificar se salvou
    this.logger.log(`[create] Item salvo com IDs:`, {
      id: saved.id,
      codigo_catmat: saved.codigo_catmat,
      codigo_catser: saved.codigo_catser,
      codigo_catalogo: saved.codigo_catalogo
    });

    return saved;
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
    await this.exigirItensEditaveis(item.licitacao_id);

    if (item.status !== StatusItem.ATIVO) {
      throw new BadRequestException('Não é possível alterar item que não está ativo');
    }

    const dados: Record<string, any> = { ...(updateDto as any) };
    for (const k of CAMPOS_PROTEGIDOS_ITEM) delete dados[k];
    Object.assign(item, dados);

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

  async marcarDeserto(id: string, ator: AtorTransicao = atorSistema('itens')): Promise<ItemLicitacao> {
    const item = await this.findOne(id);
    item.status = StatusItem.DESERTO;
    const salvo = await this.itemRepository.save(item);
    // E1: todos os itens desertos → licitação DESERTA (roll-up)
    await this.transicoes.aplicarRollup(salvo.licitacao_id, ator);
    return salvo;
  }

  async marcarFracassado(id: string, motivo: string, ator: AtorTransicao = atorSistema('itens')): Promise<ItemLicitacao> {
    const item = await this.findOne(id);
    item.status = StatusItem.FRACASSADO;
    item.observacoes = `Fracassado: ${motivo}`;
    const salvo = await this.itemRepository.save(item);
    // E1: nenhum item com vencedor e algum fracassado → licitação FRACASSADA (roll-up)
    await this.transicoes.aplicarRollup(salvo.licitacao_id, ator);
    return salvo;
  }

  async delete(id: string): Promise<void> {
    const item = await this.findOne(id);
    await this.exigirItensEditaveis(item.licitacao_id);
    
    // Só permite excluir itens ativos
    if (item.status !== StatusItem.ATIVO) {
      throw new BadRequestException('Só é possível excluir itens com status ATIVO');
    }
    
    await this.itemRepository.remove(item);
  }

  /** Licitação (campos de visão) — null se não existe. */
  async licitacaoParaVisao(licitacaoId: string): Promise<LicitacaoVisaoItem | null> {
    if (!ehUuid(licitacaoId)) return null;
    return await this.itemRepository.manager.getRepository(Licitacao).findOne({
      where: { id: licitacaoId },
      select: ['id', 'orgao_id', 'fase', 'data_publicacao_edital', 'sigilo_orcamento'],
    });
  }

  /** Órgão dono do PCA de um item do PCA (null se não existe). */
  async orgaoDoItemPca(itemPcaId: string): Promise<string | null> {
    if (!ehUuid(itemPcaId)) return null;
    const r = await this.itemPcaRepository.manager.query(
      `SELECT p.orgao_id FROM itens_pca i JOIN planos_contratacao_anual p ON p.id = i.pca_id WHERE i.id = $1`,
      [itemPcaId],
    );
    return r[0]?.orgao_id ?? null;
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

  // ============ INTEGRAÇÃO COM PCA ============

  // Buscar itens do PCA disponíveis para importação
  // Apenas PCAs enviados ao PNCP (enviado_pncp = true)
  async buscarItensPcaDisponiveis(
    orgaoId: string, 
    ano?: number,
    categoria?: string,
    busca?: string
  ): Promise<ItemPCA[]> {
    const query = this.itemPcaRepository
      .createQueryBuilder('item')
      .innerJoin('item.pca', 'pca')
      .addSelect(['pca.id', 'pca.ano_exercicio', 'pca.numero_pca', 'pca.enviado_pncp'])
      .where('pca.orgao_id = :orgaoId', { orgaoId })
      .andWhere('pca.enviado_pncp = true') // APENAS PCAs enviados ao PNCP
      .andWhere('item.esgotado = false')
      .andWhere('item.status IN (:...status)', { 
        status: ['PLANEJADO', 'EM_PREPARACAO'] 
      });

    if (ano) {
      query.andWhere('pca.ano_exercicio = :ano', { ano });
    }

    // Filtro por categoria (MATERIAL ou SERVICO)
    if (categoria) {
      query.andWhere('item.categoria = :categoria', { categoria });
    }

    // Busca por texto na descrição ou classificação
    if (busca) {
      query.andWhere(
        '(item.descricao_objeto ILIKE :busca OR item.nome_classe ILIKE :busca)',
        { busca: `%${busca}%` }
      );
    }

    return query
      .orderBy('pca.ano_exercicio', 'DESC')
      .addOrderBy('item.numero_item', 'ASC')
      .getMany();
  }

  // Verificar saldo disponível de um item do PCA
  async verificarSaldoPca(itemPcaId: string): Promise<{
    itemPca: ItemPCA;
    valorEstimado: number;
    valorUtilizado: number;
    saldoDisponivel: number;
  }> {
    const itemPca = await this.itemPcaRepository.findOne({
      where: { id: itemPcaId },
      relations: ['pca']
    });

    if (!itemPca) {
      throw new NotFoundException('Item do PCA não encontrado');
    }

    const valorEstimado = Number(itemPca.valor_estimado);
    const valorUtilizado = Number(itemPca.valor_utilizado || 0);
    const saldoDisponivel = valorEstimado - valorUtilizado;

    return {
      itemPca,
      valorEstimado,
      valorUtilizado,
      saldoDisponivel
    };
  }

  // Importar múltiplos itens vinculados a um item do PCA
  async importarDoPca(dto: ImportarItensPcaDto): Promise<{
    itensImportados: ItemLicitacao[];
    valorTotalImportado: number;
    saldoRestante: number;
  }> {
    // Verificar saldo do PCA
    const { itemPca, saldoDisponivel } = await this.verificarSaldoPca(dto.item_pca_id);

    // Calcular valor total dos itens a importar
    const valorTotalItens = dto.itens.reduce((sum, item) => {
      return sum + (item.quantidade * item.valor_unitario_estimado);
    }, 0);

    if (valorTotalItens > saldoDisponivel) {
      throw new BadRequestException(
        `Valor total dos itens (R$ ${valorTotalItens.toFixed(2)}) excede o saldo disponível do PCA (R$ ${saldoDisponivel.toFixed(2)})`
      );
    }

    // Buscar último número de item da licitação
    const ultimoItem = await this.itemRepository.findOne({
      where: { licitacao_id: dto.licitacao_id },
      order: { numero_item: 'DESC' }
    });
    let proximoNumero = ultimoItem ? ultimoItem.numero_item + 1 : 1;

    // Criar os itens
    const itensImportados: ItemLicitacao[] = [];
    for (const itemDto of dto.itens) {
      const valorTotal = itemDto.quantidade * itemDto.valor_unitario_estimado;

      const item = this.itemRepository.create({
        licitacao_id: dto.licitacao_id,
        item_pca_id: dto.item_pca_id,
        sem_pca: false,
        numero_item: proximoNumero++,
        descricao_resumida: itemDto.descricao_resumida,
        descricao_detalhada: itemDto.descricao_detalhada,
        quantidade: itemDto.quantidade,
        unidade_medida: itemDto.unidade_medida || UnidadeMedida.UNIDADE,
        valor_unitario_estimado: itemDto.valor_unitario_estimado,
        valor_total_estimado: valorTotal,
        codigo_catalogo: itemDto.codigo_catalogo,
        tipo_participacao: itemDto.tipo_participacao,
      });

      const itemSalvo = await this.itemRepository.save(item);
      itensImportados.push(itemSalvo);
    }

    // Atualizar valor utilizado no PCA
    await this.itemPcaRepository.increment(
      { id: dto.item_pca_id },
      'valor_utilizado',
      valorTotalItens
    );

    // Verificar se esgotou o saldo
    const novoSaldo = saldoDisponivel - valorTotalItens;
    if (novoSaldo <= 0) {
      await this.itemPcaRepository.update(dto.item_pca_id, { esgotado: true });
    }

    this.logger.log(`Importados ${itensImportados.length} itens do PCA ${itemPca.id} para licitação ${dto.licitacao_id}`);

    return {
      itensImportados,
      valorTotalImportado: valorTotalItens,
      saldoRestante: novoSaldo
    };
  }

  // Criar item sem vinculação ao PCA (com justificativa obrigatória)
  async createSemPca(dto: CreateItemDto): Promise<ItemLicitacao> {
    await this.exigirItensEditaveis(dto.licitacao_id);
    if (!dto.justificativa_sem_pca || dto.justificativa_sem_pca.length < 50) {
      throw new BadRequestException(
        'Justificativa obrigatória para itens sem PCA (mínimo 50 caracteres)'
      );
    }

    const valorTotal = dto.quantidade * dto.valor_unitario_estimado;

    const item = this.itemRepository.create({
      ...dto,
      sem_pca: true,
      valor_total_estimado: valorTotal,
    });

    this.logger.log(`Item criado sem PCA na licitação ${dto.licitacao_id}: ${dto.descricao_resumida}`);

    return await this.itemRepository.save(item);
  }

  // Estatísticas de vinculação com PCA
  async getEstatisticasPca(licitacaoId: string) {
    const itens = await this.findByLicitacao(licitacaoId);

    const comPca = itens.filter(i => i.item_pca_id);
    const semPca = itens.filter(i => i.sem_pca);
    const semDefinicao = itens.filter(i => !i.item_pca_id && !i.sem_pca);

    const valorComPca = comPca.reduce((sum, i) => sum + Number(i.valor_total_estimado), 0);
    const valorSemPca = semPca.reduce((sum, i) => sum + Number(i.valor_total_estimado), 0);

    return {
      totalItens: itens.length,
      itensComPca: comPca.length,
      itensSemPca: semPca.length,
      itensSemDefinicao: semDefinicao.length,
      valorComPca,
      valorSemPca,
      percentualComPca: itens.length > 0 ? ((comPca.length / itens.length) * 100).toFixed(1) : '0',
      alertas: semDefinicao.length > 0 
        ? [`${semDefinicao.length} item(s) sem vinculação ao PCA ou justificativa`]
        : []
    };
  }
}

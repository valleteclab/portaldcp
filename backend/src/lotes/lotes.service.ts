/**
 * ============================================================================
 * SERVIÇO: LOTES DE LICITAÇÃO
 * ============================================================================
 * 
 * Fundamentação Legal - Lei 14.133/2021:
 * 
 * Art. 40, §3º - "O parcelamento será adotado quando técnica e economicamente 
 * viável, e deverá ser justificado quando não for adotado."
 * 
 * Art. 12, VII - Vinculação obrigatória ao PCA ou justificativa
 * 
 * Art. 12, §1º - "A não observância do disposto no inciso VII do caput deste 
 * artigo deverá ser justificada pelo ordenador de despesa"
 * 
 * Lei Complementar 123/2006, Art. 48:
 * - Lotes exclusivos para ME/EPP até R$ 80.000,00
 * - Cota reservada de até 25% para ME/EPP
 * 
 * ============================================================================
 */

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { LoteLicitacao } from './entities/lote-licitacao.entity';
import { Licitacao, ModoVinculacaoPCA } from '../licitacoes/entities/licitacao.entity';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import { ItemPCA } from '../pca/entities/pca.entity';
import { CreateLoteDto, UpdateLoteDto, VincularPcaLoteDto } from './dto/lote.dto';

@Injectable()
export class LotesService {
  constructor(
    @InjectRepository(LoteLicitacao)
    private readonly loteRepository: Repository<LoteLicitacao>,
    @InjectRepository(Licitacao)
    private readonly licitacaoRepository: Repository<Licitacao>,
    @InjectRepository(ItemLicitacao)
    private readonly itemRepository: Repository<ItemLicitacao>,
    @InjectRepository(ItemPCA)
    private readonly itemPcaRepository: Repository<ItemPCA>,
    private readonly dataSource: DataSource,
  ) {}

  // ============================================================================
  // CRUD BÁSICO
  // ============================================================================

  /**
   * Criar novo lote
   * 
   * Lei 14.133/2021, Art. 40, §3º:
   * "O parcelamento será adotado quando técnica e economicamente viável"
   */
  async create(dto: CreateLoteDto): Promise<LoteLicitacao> {
    // Verificar se a licitação existe
    const licitacao = await this.licitacaoRepository.findOne({
      where: { id: dto.licitacao_id }
    });

    if (!licitacao) {
      throw new NotFoundException('Licitação não encontrada');
    }

    // Validar vinculação com PCA
    await this.validarVinculacaoPca(dto);

    // Verificar se já existe lote com mesmo número
    const loteExistente = await this.loteRepository.findOne({
      where: { 
        licitacao_id: dto.licitacao_id, 
        numero: dto.numero 
      }
    });

    if (loteExistente) {
      throw new BadRequestException(`Já existe um lote com número ${dto.numero} nesta licitação`);
    }

    // Criar o lote
    const lote = this.loteRepository.create({
      ...dto,
      status: 'RASCUNHO',
      valor_total_estimado: 0,
      quantidade_itens: 0,
    });

    const loteSalvo = await this.loteRepository.save(lote);

    // Atualizar flag usa_lotes na licitação
    if (!licitacao.usa_lotes) {
      await this.licitacaoRepository.update(dto.licitacao_id, { usa_lotes: true });
    }

    return loteSalvo;
  }

  /**
   * Buscar todos os lotes de uma licitação
   */
  async findByLicitacao(licitacaoId: string): Promise<LoteLicitacao[]> {
    return this.loteRepository.find({
      where: { licitacao_id: licitacaoId },
      relations: ['item_pca', 'item_pca.pca', 'itens'],
      order: { numero: 'ASC' }
    });
  }

  /**
   * Buscar lote por ID
   */
  async findOne(id: string): Promise<LoteLicitacao> {
    const lote = await this.loteRepository.findOne({
      where: { id },
      relations: ['item_pca', 'item_pca.pca', 'itens', 'licitacao']
    });

    if (!lote) {
      throw new NotFoundException('Lote não encontrado');
    }

    return lote;
  }

  /**
   * Atualizar lote
   */
  async update(id: string, dto: UpdateLoteDto): Promise<LoteLicitacao> {
    const lote = await this.findOne(id);

    // Se está alterando vinculação PCA, validar
    if (dto.item_pca_id !== undefined || dto.sem_pca !== undefined) {
      await this.validarVinculacaoPca({
        ...lote,
        ...dto,
        licitacao_id: lote.licitacao_id
      } as CreateLoteDto);
    }

    // Verificar número duplicado se estiver alterando
    if (dto.numero && dto.numero !== lote.numero) {
      const loteExistente = await this.loteRepository.findOne({
        where: { 
          licitacao_id: lote.licitacao_id, 
          numero: dto.numero 
        }
      });

      if (loteExistente) {
        throw new BadRequestException(`Já existe um lote com número ${dto.numero} nesta licitação`);
      }
    }

    Object.assign(lote, dto);
    return this.loteRepository.save(lote);
  }

  /**
   * Excluir lote
   */
  async remove(id: string): Promise<void> {
    const lote = await this.findOne(id);

    // Verificar se há itens no lote
    if (lote.itens && lote.itens.length > 0) {
      throw new BadRequestException(
        `Não é possível excluir o lote ${lote.numero}. ` +
        `Existem ${lote.itens.length} item(ns) vinculado(s). ` +
        `Remova os itens primeiro ou mova-os para outro lote.`
      );
    }

    await this.loteRepository.remove(lote);

    // Verificar se ainda existem lotes na licitação
    const lotesRestantes = await this.loteRepository.count({
      where: { licitacao_id: lote.licitacao_id }
    });

    if (lotesRestantes === 0) {
      await this.licitacaoRepository.update(lote.licitacao_id, { usa_lotes: false });
    }
  }

  // ============================================================================
  // GERENCIAMENTO DE ITENS NO LOTE
  // ============================================================================

  /**
   * Adicionar item ao lote
   * 
   * Quando o modo de vinculação é POR_LOTE, o item herda o PCA do lote
   */
  async addItemToLote(loteId: string, itemId: string): Promise<ItemLicitacao> {
    const lote = await this.findOne(loteId);
    const item = await this.itemRepository.findOne({
      where: { id: itemId },
      relations: ['licitacao']
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    // Verificar se o item pertence à mesma licitação
    if (item.licitacao_id !== lote.licitacao_id) {
      throw new BadRequestException('O item não pertence à mesma licitação do lote');
    }

    // Verificar modo de vinculação da licitação
    const licitacao = await this.licitacaoRepository.findOne({
      where: { id: lote.licitacao_id }
    });

    // Atualizar item
    item.lote_id = loteId;
    item.lote = lote;

    // Se modo é POR_LOTE, herdar PCA do lote
    if (licitacao && licitacao.modo_vinculacao_pca === ModoVinculacaoPCA.POR_LOTE) {
      if (lote.item_pca_id) {
        item.item_pca_id = lote.item_pca_id;
        item.sem_pca = false;
        item.justificativa_sem_pca = undefined as any;
      } else if (lote.sem_pca) {
        item.sem_pca = true;
        item.justificativa_sem_pca = lote.justificativa_sem_pca;
        item.item_pca_id = undefined as any;
      }
    }

    const itemAtualizado = await this.itemRepository.save(item);

    // Recalcular totais do lote
    await this.recalcularTotaisLote(loteId);

    return itemAtualizado;
  }

  /**
   * Remover item do lote
   */
  async removeItemFromLote(loteId: string, itemId: string): Promise<ItemLicitacao> {
    const item = await this.itemRepository.findOne({
      where: { id: itemId, lote_id: loteId }
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado no lote especificado');
    }

    item.lote_id = undefined as any;
    item.lote = undefined as any;

    const itemAtualizado = await this.itemRepository.save(item);

    // Recalcular totais do lote
    await this.recalcularTotaisLote(loteId);

    return itemAtualizado;
  }

  /**
   * Mover item entre lotes
   */
  async moveItemBetweenLotes(
    itemId: string, 
    loteOrigemId: string, 
    loteDestinoId: string
  ): Promise<ItemLicitacao> {
    // Remover do lote de origem
    await this.removeItemFromLote(loteOrigemId, itemId);
    
    // Adicionar ao lote de destino
    return this.addItemToLote(loteDestinoId, itemId);
  }

  // ============================================================================
  // VINCULAÇÃO COM PCA
  // ============================================================================

  /**
   * Vincular PCA ao lote
   * 
   * Lei 14.133/2021, Art. 12, VII:
   * "As contratações públicas deverão submeter-se a práticas contínuas e 
   * permanentes de gestão de riscos e de controle preventivo, inclusive 
   * mediante adoção de recursos de tecnologia da informação, e, além de 
   * estar subordinadas ao controle social, sujeitar-se-ão às seguintes 
   * linhas de defesa: VII - o plano de contratações anual"
   */
  async vincularPca(loteId: string, dto: VincularPcaLoteDto): Promise<LoteLicitacao> {
    const lote = await this.findOne(loteId);

    // Verificar se o item PCA existe
    const itemPca = await this.itemPcaRepository.findOne({
      where: { id: dto.item_pca_id },
      relations: ['pca']
    });

    if (!itemPca) {
      throw new NotFoundException('Item do PCA não encontrado');
    }

    // Verificar se o PCA foi enviado ao PNCP
    if (!itemPca.pca?.enviado_pncp) {
      throw new BadRequestException(
        'O PCA selecionado não foi enviado ao PNCP. ' +
        'Apenas PCAs enviados ao PNCP podem ser vinculados às licitações.'
      );
    }

    // Verificar saldo disponível
    const saldoDisponivel = Number(itemPca.valor_estimado) - Number(itemPca.valor_utilizado || 0);
    if (saldoDisponivel <= 0) {
      throw new BadRequestException(
        `O item do PCA "${itemPca.descricao_objeto}" não possui saldo disponível. ` +
        `Valor estimado: R$ ${itemPca.valor_estimado}, Valor utilizado: R$ ${itemPca.valor_utilizado || 0}`
      );
    }

    // Atualizar lote
    lote.item_pca_id = dto.item_pca_id;
    lote.item_pca = itemPca;
    lote.sem_pca = false;
    lote.justificativa_sem_pca = undefined as any;

    const loteAtualizado = await this.loteRepository.save(lote);

    // Propagar para itens se solicitado
    if (dto.propagar_para_itens !== false) {
      await this.propagarPcaParaItens(loteId, dto.item_pca_id);
    }

    return loteAtualizado;
  }

  /**
   * Desvincular PCA do lote (marcar como sem PCA)
   * 
   * Lei 14.133/2021, Art. 12, §1º:
   * "A não observância do disposto no inciso VII do caput deste artigo 
   * deverá ser justificada pelo ordenador de despesa"
   */
  async desvincularPca(loteId: string, justificativa: string): Promise<LoteLicitacao> {
    if (!justificativa || justificativa.length < 50) {
      throw new BadRequestException(
        'Lei 14.133/2021, Art. 12, §1º: ' +
        'A não observância do PCA deve ser justificada. ' +
        'A justificativa deve ter no mínimo 50 caracteres.'
      );
    }

    const lote = await this.findOne(loteId);

    lote.item_pca_id = undefined as any;
    lote.item_pca = undefined as any;
    lote.sem_pca = true;
    lote.justificativa_sem_pca = justificativa;

    const loteAtualizado = await this.loteRepository.save(lote);

    // Propagar para itens
    await this.propagarSemPcaParaItens(loteId, justificativa);

    return loteAtualizado;
  }

  /**
   * Propagar vinculação PCA para todos os itens do lote
   */
  private async propagarPcaParaItens(loteId: string, itemPcaId: string): Promise<void> {
    await this.itemRepository.update(
      { lote_id: loteId },
      { 
        item_pca_id: itemPcaId,
        sem_pca: false,
        justificativa_sem_pca: undefined as any
      }
    );
  }

  /**
   * Propagar "sem PCA" para todos os itens do lote
   */
  private async propagarSemPcaParaItens(loteId: string, justificativa: string): Promise<void> {
    await this.itemRepository.update(
      { lote_id: loteId },
      { 
        item_pca_id: undefined as any,
        sem_pca: true,
        justificativa_sem_pca: justificativa
      }
    );
  }

  // ============================================================================
  // VALIDAÇÕES
  // ============================================================================

  /**
   * Validar vinculação com PCA
   * 
   * Lei 14.133/2021, Art. 12, §1º:
   * "A não observância do disposto no inciso VII do caput deste artigo 
   * deverá ser justificada pelo ordenador de despesa"
   */
  private async validarVinculacaoPca(dto: CreateLoteDto): Promise<void> {
    // Se tem item_pca_id, verificar se existe e tem saldo
    if (dto.item_pca_id) {
      const itemPca = await this.itemPcaRepository.findOne({
        where: { id: dto.item_pca_id },
        relations: ['pca']
      });

      if (!itemPca) {
        throw new NotFoundException('Item do PCA não encontrado');
      }

      if (!itemPca.pca?.enviado_pncp) {
        throw new BadRequestException(
          'O PCA selecionado não foi enviado ao PNCP. ' +
          'Apenas PCAs enviados ao PNCP podem ser vinculados.'
        );
      }
    }

    // Se sem_pca = true, justificativa é obrigatória
    if (dto.sem_pca && (!dto.justificativa_sem_pca || dto.justificativa_sem_pca.length < 50)) {
      throw new BadRequestException(
        'Lei 14.133/2021, Art. 12, §1º: ' +
        'A não observância do PCA deve ser justificada pelo ordenador de despesa. ' +
        'A justificativa deve ter no mínimo 50 caracteres.'
      );
    }
  }

  // ============================================================================
  // CÁLCULOS E TOTALIZADORES
  // ============================================================================

  /**
   * Recalcular totais do lote
   */
  async recalcularTotaisLote(loteId: string): Promise<LoteLicitacao> {
    const lote = await this.loteRepository.findOne({
      where: { id: loteId },
      relations: ['itens']
    });

    if (!lote) {
      throw new NotFoundException('Lote não encontrado');
    }

    // Calcular totais
    let valorTotalEstimado = 0;
    let valorTotalHomologado = 0;
    let temHomologado = false;

    for (const item of lote.itens || []) {
      valorTotalEstimado += Number(item.valor_total_estimado) || 0;
      if (item.valor_total_homologado) {
        valorTotalHomologado += Number(item.valor_total_homologado);
        temHomologado = true;
      }
    }

    lote.valor_total_estimado = valorTotalEstimado;
    lote.valor_total_homologado = temHomologado ? valorTotalHomologado : undefined as any;
    lote.quantidade_itens = lote.itens?.length || 0;

    return this.loteRepository.save(lote);
  }

  /**
   * Obter estatísticas do lote
   */
  async getEstatisticas(loteId: string): Promise<any> {
    const lote = await this.findOne(loteId);

    // Agrupar itens por status
    const itensPorStatus = await this.itemRepository
      .createQueryBuilder('item')
      .select('item.status', 'status')
      .addSelect('COUNT(*)', 'quantidade')
      .addSelect('SUM(item.valor_total_estimado)', 'valor_total')
      .where('item.lote_id = :loteId', { loteId })
      .groupBy('item.status')
      .getRawMany();

    // Calcular saldo PCA disponível
    let saldoPcaDisponivel = null;
    if (lote.item_pca) {
      saldoPcaDisponivel = Number(lote.item_pca.valor_estimado) - Number(lote.item_pca.valor_utilizado || 0);
    }

    return {
      lote_id: lote.id,
      numero: lote.numero,
      descricao: lote.descricao,
      quantidade_itens: lote.quantidade_itens,
      valor_total_estimado: lote.valor_total_estimado,
      valor_total_homologado: lote.valor_total_homologado,
      vinculado_pca: !!lote.item_pca_id,
      item_pca_descricao: lote.item_pca?.descricao_objeto,
      saldo_pca_disponivel: saldoPcaDisponivel,
      itens_por_status: itensPorStatus,
    };
  }

  // ============================================================================
  // OPERAÇÕES EM LOTE
  // ============================================================================

  /**
   * Criar múltiplos lotes de uma vez
   */
  async createMany(licitacaoId: string, lotes: CreateLoteDto[]): Promise<LoteLicitacao[]> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const lotesCriados: LoteLicitacao[] = [];

      for (const loteDto of lotes) {
        const lote = await this.create({
          ...loteDto,
          licitacao_id: licitacaoId
        });
        lotesCriados.push(lote);
      }

      await queryRunner.commitTransaction();
      return lotesCriados;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Reorganizar números dos lotes
   */
  async reorganizarNumeros(licitacaoId: string): Promise<LoteLicitacao[]> {
    const lotes = await this.loteRepository.find({
      where: { licitacao_id: licitacaoId },
      order: { numero: 'ASC' }
    });

    for (let i = 0; i < lotes.length; i++) {
      lotes[i].numero = i + 1;
    }

    return this.loteRepository.save(lotes);
  }
}

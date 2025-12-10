/**
 * ============================================================================
 * CONTROLLER: LOTES DE LICITAÇÃO
 * ============================================================================
 * 
 * Endpoints para gerenciamento de lotes em licitações.
 * 
 * Fundamentação Legal - Lei 14.133/2021:
 * 
 * Art. 40, §3º - "O parcelamento será adotado quando técnica e economicamente 
 * viável, e deverá ser justificado quando não for adotado."
 * 
 * Art. 12, VII - Vinculação obrigatória ao PCA ou justificativa
 * 
 * ============================================================================
 * 
 * ENDPOINTS:
 * 
 * POST   /api/lotes                     - Criar novo lote
 * GET    /api/lotes/licitacao/:id       - Listar lotes de uma licitação
 * GET    /api/lotes/:id                 - Buscar lote por ID
 * PUT    /api/lotes/:id                 - Atualizar lote
 * DELETE /api/lotes/:id                 - Excluir lote
 * 
 * POST   /api/lotes/:id/itens/:itemId   - Adicionar item ao lote
 * DELETE /api/lotes/:id/itens/:itemId   - Remover item do lote
 * POST   /api/lotes/:id/mover-item      - Mover item entre lotes
 * 
 * POST   /api/lotes/:id/vincular-pca    - Vincular PCA ao lote
 * POST   /api/lotes/:id/desvincular-pca - Desvincular PCA (com justificativa)
 * 
 * GET    /api/lotes/:id/estatisticas    - Estatísticas do lote
 * POST   /api/lotes/:id/recalcular      - Recalcular totais do lote
 * 
 * ============================================================================
 */

import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  HttpCode, 
  HttpStatus 
} from '@nestjs/common';
import { LotesService } from './lotes.service';
import { 
  CreateLoteDto, 
  UpdateLoteDto, 
  VincularPcaLoteDto,
  MoveItemBetweenLotesDto 
} from './dto/lote.dto';

@Controller('api/lotes')
export class LotesController {
  constructor(private readonly lotesService: LotesService) {}

  // ============================================================================
  // CRUD BÁSICO
  // ============================================================================

  /**
   * Criar novo lote
   * 
   * Lei 14.133/2021, Art. 40, §3º:
   * "O parcelamento será adotado quando técnica e economicamente viável"
   * 
   * @example POST /api/lotes
   * {
   *   "numero": 1,
   *   "descricao": "Equipamentos de Informática",
   *   "licitacao_id": "uuid",
   *   "item_pca_id": "uuid" // opcional
   * }
   */
  @Post()
  async create(@Body() dto: CreateLoteDto) {
    return this.lotesService.create(dto);
  }

  /**
   * Listar todos os lotes de uma licitação
   * 
   * @example GET /api/lotes/licitacao/uuid
   */
  @Get('licitacao/:licitacaoId')
  async findByLicitacao(@Param('licitacaoId') licitacaoId: string) {
    return this.lotesService.findByLicitacao(licitacaoId);
  }

  /**
   * Buscar lote por ID
   * 
   * @example GET /api/lotes/uuid
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.lotesService.findOne(id);
  }

  /**
   * Atualizar lote
   * 
   * @example PUT /api/lotes/uuid
   * {
   *   "descricao": "Nova descrição",
   *   "item_pca_id": "uuid"
   * }
   */
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateLoteDto) {
    return this.lotesService.update(id, dto);
  }

  /**
   * Excluir lote
   * 
   * Nota: Não é possível excluir lotes com itens vinculados.
   * Remova os itens primeiro ou mova-os para outro lote.
   * 
   * @example DELETE /api/lotes/uuid
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.lotesService.remove(id);
  }

  // ============================================================================
  // GERENCIAMENTO DE ITENS
  // ============================================================================

  /**
   * Adicionar item ao lote
   * 
   * Quando o modo de vinculação da licitação é POR_LOTE,
   * o item herda automaticamente o PCA do lote.
   * 
   * @example POST /api/lotes/uuid/itens/uuid
   */
  @Post(':loteId/itens/:itemId')
  async addItemToLote(
    @Param('loteId') loteId: string,
    @Param('itemId') itemId: string
  ) {
    return this.lotesService.addItemToLote(loteId, itemId);
  }

  /**
   * Remover item do lote
   * 
   * @example DELETE /api/lotes/uuid/itens/uuid
   */
  @Delete(':loteId/itens/:itemId')
  async removeItemFromLote(
    @Param('loteId') loteId: string,
    @Param('itemId') itemId: string
  ) {
    return this.lotesService.removeItemFromLote(loteId, itemId);
  }

  /**
   * Mover item entre lotes
   * 
   * @example POST /api/lotes/uuid/mover-item
   * {
   *   "item_id": "uuid",
   *   "lote_destino_id": "uuid"
   * }
   */
  @Post(':loteOrigemId/mover-item')
  async moveItemBetweenLotes(
    @Param('loteOrigemId') loteOrigemId: string,
    @Body() dto: MoveItemBetweenLotesDto
  ) {
    return this.lotesService.moveItemBetweenLotes(
      dto.item_id,
      loteOrigemId,
      dto.lote_destino_id
    );
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
   * 
   * @example POST /api/lotes/uuid/vincular-pca
   * {
   *   "item_pca_id": "uuid",
   *   "propagar_para_itens": true
   * }
   */
  @Post(':id/vincular-pca')
  async vincularPca(
    @Param('id') id: string,
    @Body() dto: VincularPcaLoteDto
  ) {
    return this.lotesService.vincularPca(id, dto);
  }

  /**
   * Desvincular PCA do lote (marcar como sem PCA)
   * 
   * Lei 14.133/2021, Art. 12, §1º:
   * "A não observância do disposto no inciso VII do caput deste artigo 
   * deverá ser justificada pelo ordenador de despesa"
   * 
   * REQUER justificativa com no mínimo 50 caracteres.
   * 
   * @example POST /api/lotes/uuid/desvincular-pca
   * {
   *   "justificativa": "Contratação emergencial não prevista no planejamento anual..."
   * }
   */
  @Post(':id/desvincular-pca')
  async desvincularPca(
    @Param('id') id: string,
    @Body('justificativa') justificativa: string
  ) {
    return this.lotesService.desvincularPca(id, justificativa);
  }

  // ============================================================================
  // ESTATÍSTICAS E CÁLCULOS
  // ============================================================================

  /**
   * Obter estatísticas do lote
   * 
   * Retorna:
   * - Quantidade de itens
   * - Valor total estimado/homologado
   * - Status da vinculação PCA
   * - Saldo PCA disponível
   * - Itens agrupados por status
   * 
   * @example GET /api/lotes/uuid/estatisticas
   */
  @Get(':id/estatisticas')
  async getEstatisticas(@Param('id') id: string) {
    return this.lotesService.getEstatisticas(id);
  }

  /**
   * Recalcular totais do lote
   * 
   * Útil após alterações manuais nos itens.
   * 
   * @example POST /api/lotes/uuid/recalcular
   */
  @Post(':id/recalcular')
  async recalcularTotais(@Param('id') id: string) {
    return this.lotesService.recalcularTotaisLote(id);
  }

  /**
   * Reorganizar números dos lotes de uma licitação
   * 
   * @example POST /api/lotes/licitacao/uuid/reorganizar
   */
  @Post('licitacao/:licitacaoId/reorganizar')
  async reorganizarNumeros(@Param('licitacaoId') licitacaoId: string) {
    return this.lotesService.reorganizarNumeros(licitacaoId);
  }
}

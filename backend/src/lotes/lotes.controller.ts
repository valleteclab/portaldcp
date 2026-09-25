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
 * ENDPOINTS (prefixo global `api` — até a E2 o controller repetia `api/` e as
 * rotas saíam em /api/api/lotes):
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
 * ACESSO (padrão E1a):
 *  - escrita: só o órgão DONO da licitação (@SomenteOrgao + dono; admin passa);
 *  - leitura: pública com login opcional — órgão dono vê tudo; os demais só
 *    lotes de licitação já divulgada, sem a identidade do melhor lance e, com
 *    orçamento SIGILOSO (art. 24), sem os valores estimados.
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
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { LotesService } from './lotes.service';
import {
  CreateLoteDto,
  UpdateLoteDto,
  VincularPcaLoteDto,
  MoveItemBetweenLotesDto
} from './dto/lote.dto';
import { AcessoLicitacaoService } from '../auth/acesso/acesso-licitacao.service';
import { AtorAtual, AutenticacaoOpcional, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import { ehOrgao } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';
import { licitacaoEhPublica, orcamentoSigiloso } from '../licitacoes/licitacao-visao.util';
import { itensParaPublico } from '../itens/item-visao.util';

/** Lote na visão pública (sem identidade do melhor lance; sigilo do orçamento). */
function loteParaPublico(lote: any, lic: { sigilo_orcamento?: string | null }) {
  if (!lote || typeof lote !== 'object') return lote;
  const { licitacao: _lic, itens, ...resto } = lote;
  return {
    ...resto,
    melhor_lance_fornecedor_id: null,
    ...(orcamentoSigiloso(lic) ? { valor_total_estimado: null } : {}),
    ...(Array.isArray(itens) ? { itens: itensParaPublico(itens, lic) } : {}),
  };
}

@Controller('lotes')
export class LotesController {
  constructor(
    private readonly lotesService: LotesService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  /** Visão da leitura: 'ORGAO' (dono/admin) ou 'PUBLICO' (licitação divulgada; senão 404). */
  private async visao(ator: Ator | null, licitacaoId: string) {
    const lic = await this.lotesService.licitacaoParaVisao(licitacaoId);
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    if (ator?.admin || (ehOrgao(ator) && ator.orgaoId === lic.orgao_id)) return { visao: 'ORGAO' as const, lic };
    if (!licitacaoEhPublica(lic)) throw new NotFoundException('Licitação não encontrada');
    return { visao: 'PUBLICO' as const, lic };
  }

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
   * { "numero": 1, "descricao": "Equipamentos de Informática", "licitacao_id": "uuid",
   *   "tipo_beneficio_mpe": "NENHUM" }
   */
  @SomenteOrgao()
  @Post()
  async create(@Body() dto: CreateLoteDto, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, dto?.licitacao_id, 'escrita');
    return this.lotesService.create(dto);
  }

  /** Listar todos os lotes de uma licitação (com os itens). */
  @AutenticacaoOpcional()
  @Get('licitacao/:licitacaoId')
  async findByLicitacao(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator | null) {
    const { visao, lic } = await this.visao(ator, licitacaoId);
    const lotes = await this.lotesService.findByLicitacao(licitacaoId);
    return visao === 'ORGAO' ? lotes : lotes.map((l) => loteParaPublico(l, lic));
  }

  /** Buscar lote por ID. */
  @AutenticacaoOpcional()
  @Get(':id')
  async findOne(@Param('id') id: string, @AtorAtual() ator: Ator | null) {
    const dono = await this.acesso.donoDoLote(id);
    if (!dono) throw new NotFoundException('Lote não encontrado');
    const { visao, lic } = await this.visao(ator, dono.licitacaoId);
    const lote = await this.lotesService.findOne(id);
    if (visao === 'PUBLICO') return loteParaPublico(lote, lic);
    const { licitacao: _l, ...resto } = lote as any;
    return resto;
  }

  /** Atualizar lote. */
  @SomenteOrgao()
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateLoteDto, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDoLote(ator, id, 'escrita');
    return this.lotesService.update(id, dto);
  }

  /**
   * Excluir lote. Não é possível excluir lotes com itens vinculados —
   * remova os itens primeiro ou mova-os para outro lote.
   */
  @SomenteOrgao()
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDoLote(ator, id, 'escrita');
    await this.lotesService.remove(id);
  }

  // ============================================================================
  // GERENCIAMENTO DE ITENS (um item pertence a no máximo um lote)
  // ============================================================================

  @SomenteOrgao()
  @Post(':loteId/itens/:itemId')
  async addItemToLote(@Param('loteId') loteId: string, @Param('itemId') itemId: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDoLote(ator, loteId, 'escrita');
    return this.lotesService.addItemToLote(loteId, itemId);
  }

  @SomenteOrgao()
  @Delete(':loteId/itens/:itemId')
  async removeItemFromLote(@Param('loteId') loteId: string, @Param('itemId') itemId: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDoLote(ator, loteId, 'escrita');
    return this.lotesService.removeItemFromLote(loteId, itemId);
  }

  /** Mover item entre lotes. @example POST /api/lotes/uuid/mover-item { "item_id", "lote_destino_id" } */
  @SomenteOrgao()
  @Post(':loteOrigemId/mover-item')
  async moveItemBetweenLotes(
    @Param('loteOrigemId') loteOrigemId: string,
    @Body() dto: MoveItemBetweenLotesDto,
    @AtorAtual() ator: Ator,
  ) {
    const origem = await this.acesso.assertOrgaoDoLote(ator, loteOrigemId, 'escrita');
    const destino = await this.acesso.assertOrgaoDoLote(ator, dto?.lote_destino_id, 'escrita');
    if (origem.licitacaoId !== destino.licitacaoId) throw new NotFoundException('Lote de destino não encontrado nesta licitação');
    return this.lotesService.moveItemBetweenLotes(dto.item_id, loteOrigemId, dto.lote_destino_id);
  }

  // ============================================================================
  // VINCULAÇÃO COM PCA
  // ============================================================================

  /** Vincular PCA ao lote (Lei 14.133/2021, Art. 12, VII). */
  @SomenteOrgao()
  @Post(':id/vincular-pca')
  async vincularPca(@Param('id') id: string, @Body() dto: VincularPcaLoteDto, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDoLote(ator, id, 'escrita');
    return this.lotesService.vincularPca(id, dto);
  }

  /** Desvincular PCA do lote — justificativa ≥ 50 caracteres (Art. 12, §1º). */
  @SomenteOrgao()
  @Post(':id/desvincular-pca')
  async desvincularPca(@Param('id') id: string, @Body('justificativa') justificativa: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDoLote(ator, id, 'escrita');
    return this.lotesService.desvincularPca(id, justificativa);
  }

  // ============================================================================
  // ESTATÍSTICAS E CÁLCULOS
  // ============================================================================

  @SomenteOrgao()
  @Get(':id/estatisticas')
  async getEstatisticas(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDoLote(ator, id, 'leitura');
    return this.lotesService.getEstatisticas(id);
  }

  @SomenteOrgao()
  @Post(':id/recalcular')
  async recalcularTotais(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDoLote(ator, id, 'escrita');
    return this.lotesService.recalcularTotaisLote(id);
  }

  /** Reorganizar números dos lotes de uma licitação. */
  @SomenteOrgao()
  @Post('licitacao/:licitacaoId/reorganizar')
  async reorganizarNumeros(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId, 'escrita');
    return this.lotesService.reorganizarNumeros(licitacaoId);
  }
}

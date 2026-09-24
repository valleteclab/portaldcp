import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Body,
  Query,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AtasService } from './atas.service';
import { AtaRegistroPreco, ItemAta, StatusAta } from './entities/ata-registro-preco.entity';
import { Public } from '../auth/public.decorator';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { AcessoLicitacaoService, ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { AtorAtual, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import { ehFornecedor, ehOrgao } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';

/**
 * AUTORIZAÇÃO (E1a):
 *  - listas: órgão vê só as do próprio órgão (?orgaoId= só vale para o admin);
 *    fornecedor só as dele (id do token);
 *  - ata por id, itens e atos (criar, alterar, status, itens, utilizar):
 *    somente o órgão DONO da ata (leitura de outro órgão → 404; ato → 403);
 *  - endpoints públicos (publicas/*): só campos públicos (seleção no service).
 */
@Controller('atas')
@RequireModule(ModuloSistema.ATAS)
export class AtasController {
  constructor(
    private readonly atasService: AtasService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  /** Órgão das listas: o do token; admin da plataforma filtra por ?orgaoId=. */
  private orgaoDaLista(ator: Ator, orgaoIdParam?: string): string {
    if (ator?.admin && orgaoIdParam) return orgaoIdParam;
    if (ehOrgao(ator)) return ator.orgaoId;
    throw new ForbiddenException('Não foi possível identificar o órgão do usuário');
  }

  /** Item da ata → órgão dono da ata. */
  private async assertOrgaoDoItemAta(ator: Ator, itemId: string) {
    const ataId = await this.atasService.ataIdDoItem(itemId);
    if (!ataId) throw new NotFoundException('Item não encontrado');
    await this.acesso.assertOrgaoDaAta(ator, ataId);
  }

  // ============ CRUD ATAS ============

  @Post()
  @SomenteOrgao()
  async criar(@Body() dados: Partial<AtaRegistroPreco>, @AtorAtual() ator: Ator) {
    // Órgão só cria ata no próprio nome (admin da plataforma escolhe o órgão)
    if (!ator.admin) {
      if (dados.orgao_id && dados.orgao_id !== ator.orgaoId) {
        throw new ForbiddenException('Acesso negado: não é possível criar ata para outro órgão');
      }
      dados.orgao_id = ator.orgaoId!;
    }
    if (dados.licitacao_id) {
      const donoLicitacao = await this.acesso.orgaoDaLicitacao(dados.licitacao_id);
      if (!donoLicitacao) throw new NotFoundException('Licitação não encontrada');
      if (donoLicitacao !== dados.orgao_id) {
        throw new ForbiddenException('A licitação informada não pertence ao órgão da ata');
      }
    }
    return this.atasService.criar(dados);
  }

  @Post('licitacao/:licitacaoId')
  @SomenteOrgao()
  async criarAPartirDaLicitacao(
    @Param('licitacaoId') licitacaoId: string,
    @Body() dados: Partial<AtaRegistroPreco>,
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId);
    return this.atasService.criarAPartirDaLicitacao(licitacaoId, dados);
  }

  @Get()
  async findAll(
    @AtorAtual() ator: Ator,
    @Query('orgaoId') orgaoIdParam?: string,
    @Query('fornecedorId') fornecedorIdParam?: string,
    @Query('status') status?: StatusAta,
    @Query('ano') ano?: string,
    @Query('vigentes') vigentes?: string
  ) {
    // Fornecedor: lista apenas suas atas (id do token)
    if (ehFornecedor(ator)) {
      return this.atasService.findAll({
        fornecedorId: ator.fornecedorId,
        status,
        ano: ano ? parseInt(ano) : undefined,
        vigentes: vigentes === 'true'
      });
    }
    const orgaoId = this.orgaoDaLista(ator, orgaoIdParam);
    return this.atasService.findAll({
      orgaoId,
      fornecedorId: fornecedorIdParam,
      status,
      ano: ano ? parseInt(ano) : undefined,
      vigentes: vigentes === 'true'
    });
  }

  @Get('estatisticas/status')
  @SomenteOrgao()
  async estatisticasPorStatus(
    @AtorAtual() ator: Ator,
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    return this.atasService.contarPorStatus(this.orgaoDaLista(ator, orgaoIdParam));
  }

  @Get('estatisticas/a-vencer')
  @SomenteOrgao()
  async atasAVencer(
    @AtorAtual() ator: Ator,
    @Query('orgaoId') orgaoIdParam?: string,
    @Query('dias') dias?: string
  ) {
    return this.atasService.atasAVencer(this.orgaoDaLista(ator, orgaoIdParam), dias ? parseInt(dias) : 30);
  }

  // ============ ENDPOINTS PÚBLICOS ============
  // (antes de ':id' para "publicas" não ser tratado como id)

  @Public()
  @Get('publicas/lista')
  async listarPublicas(
    @Query('orgaoId') orgaoId?: string,
    @Query('fornecedorCnpj') fornecedorCnpj?: string,
    @Query('ano') ano?: string,
    @Query('vigentes') vigentes?: string
  ) {
    return this.atasService.findPublicas({
      orgaoId,
      fornecedorCnpj,
      ano: ano ? parseInt(ano) : undefined,
      vigentes: vigentes === 'true'
    });
  }

  @Public()
  @Get('publicas/:id')
  async findPublicaById(@Param('id') id: string) {
    if (!ehUuid(id)) throw new NotFoundException('Ata não encontrada');
    return this.atasService.findPublicaById(id);
  }

  // ============ ATA POR ID (órgão dono) ============

  @Get(':id')
  @SomenteOrgao()
  async findOne(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaAta(ator, id, 'leitura');
    return this.atasService.findOne(id);
  }

  @Put(':id')
  @SomenteOrgao()
  async atualizar(@Param('id') id: string, @Body() dados: Partial<AtaRegistroPreco>, @AtorAtual() ator: Ator) {
    const { orgaoId } = await this.acesso.assertOrgaoDaAta(ator, id);
    // A ata não muda de órgão por edição, nem aponta para licitação de outro órgão
    const { orgao_id: _orgao, orgao: _o, licitacao: _l, ...resto } = (dados || {}) as any;
    if (resto.licitacao_id && (await this.acesso.orgaoDaLicitacao(resto.licitacao_id)) !== orgaoId) {
      throw new ForbiddenException('A licitação informada não pertence ao órgão da ata');
    }
    return this.atasService.atualizar(id, resto);
  }

  @Patch(':id/status')
  @SomenteOrgao()
  async alterarStatus(
    @Param('id') id: string,
    @Body('status') status: StatusAta,
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaAta(ator, id);
    return this.atasService.alterarStatus(id, status);
  }

  // ============ ITENS DA ATA ============

  @Post(':ataId/itens')
  @SomenteOrgao()
  async adicionarItem(
    @Param('ataId') ataId: string,
    @Body() dados: Partial<ItemAta>,
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaAta(ator, ataId);
    return this.atasService.adicionarItem(ataId, dados);
  }

  @Get(':ataId/itens')
  @SomenteOrgao()
  async findItens(@Param('ataId') ataId: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaAta(ator, ataId, 'leitura');
    return this.atasService.findItens(ataId);
  }

  @Put('itens/:itemId')
  @SomenteOrgao()
  async atualizarItem(
    @Param('itemId') itemId: string,
    @Body() dados: Partial<ItemAta>,
    @AtorAtual() ator: Ator,
  ) {
    await this.assertOrgaoDoItemAta(ator, itemId);
    // O item não muda de ata por edição
    const { ata_id: _ataId, ata: _ata, ...resto } = (dados || {}) as any;
    return this.atasService.atualizarItem(itemId, resto);
  }

  @Post('itens/:itemId/utilizar')
  @SomenteOrgao()
  async utilizarItem(
    @Param('itemId') itemId: string,
    @Body('quantidade') quantidade: number,
    @AtorAtual() ator: Ator,
  ) {
    await this.assertOrgaoDoItemAta(ator, itemId);
    return this.atasService.utilizarItem(itemId, quantidade);
  }
}

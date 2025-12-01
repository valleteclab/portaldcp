import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Body,
  Query
} from '@nestjs/common';
import { AtasService } from './atas.service';
import { AtaRegistroPreco, ItemAta, StatusAta } from './entities/ata-registro-preco.entity';

@Controller('atas')
export class AtasController {
  constructor(private readonly atasService: AtasService) {}

  // ============ CRUD ATAS ============

  @Post()
  async criar(@Body() dados: Partial<AtaRegistroPreco>) {
    return this.atasService.criar(dados);
  }

  @Post('licitacao/:licitacaoId')
  async criarAPartirDaLicitacao(
    @Param('licitacaoId') licitacaoId: string,
    @Body() dados: Partial<AtaRegistroPreco>
  ) {
    return this.atasService.criarAPartirDaLicitacao(licitacaoId, dados);
  }

  @Get()
  async findAll(
    @Query('orgaoId') orgaoId?: string,
    @Query('fornecedorId') fornecedorId?: string,
    @Query('status') status?: StatusAta,
    @Query('ano') ano?: string,
    @Query('vigentes') vigentes?: string
  ) {
    return this.atasService.findAll({
      orgaoId,
      fornecedorId,
      status,
      ano: ano ? parseInt(ano) : undefined,
      vigentes: vigentes === 'true'
    });
  }

  @Get('estatisticas/status')
  async estatisticasPorStatus(@Query('orgaoId') orgaoId: string) {
    return this.atasService.contarPorStatus(orgaoId);
  }

  @Get('estatisticas/a-vencer')
  async atasAVencer(
    @Query('orgaoId') orgaoId: string,
    @Query('dias') dias?: string
  ) {
    return this.atasService.atasAVencer(orgaoId, dias ? parseInt(dias) : 30);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.atasService.findOne(id);
  }

  @Put(':id')
  async atualizar(@Param('id') id: string, @Body() dados: Partial<AtaRegistroPreco>) {
    return this.atasService.atualizar(id, dados);
  }

  @Patch(':id/status')
  async alterarStatus(
    @Param('id') id: string,
    @Body('status') status: StatusAta
  ) {
    return this.atasService.alterarStatus(id, status);
  }

  // ============ ITENS DA ATA ============

  @Post(':ataId/itens')
  async adicionarItem(
    @Param('ataId') ataId: string,
    @Body() dados: Partial<ItemAta>
  ) {
    return this.atasService.adicionarItem(ataId, dados);
  }

  @Get(':ataId/itens')
  async findItens(@Param('ataId') ataId: string) {
    return this.atasService.findItens(ataId);
  }

  @Put('itens/:itemId')
  async atualizarItem(
    @Param('itemId') itemId: string,
    @Body() dados: Partial<ItemAta>
  ) {
    return this.atasService.atualizarItem(itemId, dados);
  }

  @Post('itens/:itemId/utilizar')
  async utilizarItem(
    @Param('itemId') itemId: string,
    @Body('quantidade') quantidade: number
  ) {
    return this.atasService.utilizarItem(itemId, quantidade);
  }

  // ============ ENDPOINTS PÚBLICOS ============

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

  @Get('publicas/:id')
  async findPublicaById(@Param('id') id: string) {
    return this.atasService.findPublicaById(id);
  }
}

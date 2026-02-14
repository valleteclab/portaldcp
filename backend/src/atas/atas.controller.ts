import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Body,
  Query,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { AtasService } from './atas.service';
import { AtaRegistroPreco, ItemAta, StatusAta } from './entities/ata-registro-preco.entity';
import { Public } from '../auth/public.decorator';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { JwtPayload, UserType } from '../auth/auth.service';

@Controller('atas')
@RequireModule(ModuloSistema.ATAS)
export class AtasController {
  constructor(private readonly atasService: AtasService) {}

  private getOrgaoId(user: JwtPayload, orgaoIdParam?: string): string {
    if (user.type === UserType.ORGAO) return user.sub;
    if (user.type === UserType.ADMIN && orgaoIdParam) return orgaoIdParam;
    const orgaoId = user.orgaoId || (user as any).orgao_id;
    if (orgaoId) return orgaoId;
    throw new ForbiddenException('Não foi possível identificar o órgão do usuário');
  }

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
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
    @Query('fornecedorId') fornecedorId?: string,
    @Query('status') status?: StatusAta,
    @Query('ano') ano?: string,
    @Query('vigentes') vigentes?: string
  ) {
    const orgaoId = this.getOrgaoId(request.user, orgaoIdParam);
    return this.atasService.findAll({
      orgaoId,
      fornecedorId,
      status,
      ano: ano ? parseInt(ano) : undefined,
      vigentes: vigentes === 'true'
    });
  }

  @Get('estatisticas/status')
  async estatisticasPorStatus(
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user, orgaoIdParam);
    return this.atasService.contarPorStatus(orgaoId);
  }

  @Get('estatisticas/a-vencer')
  async atasAVencer(
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
    @Query('dias') dias?: string
  ) {
    const orgaoId = this.getOrgaoId(request.user, orgaoIdParam);
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
    return this.atasService.findPublicaById(id);
  }
}

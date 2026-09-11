import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { CurrentUser } from '../auth/current-user.decorator';
import { PatrimonioInventarioService } from './patrimonio-inventario.service';
import { CriarInventarioDto, AtualizarSetorInventarioDto } from './dto/criar-inventario.dto';

/** Campanhas de inventário (lado do órgão / comissão). */
@Controller('orgaos/:orgaoId/patrimonio/inventarios')
@RequireModule(ModuloSistema.PATRIMONIO)
export class PatrimonioInventarioController {
  constructor(private readonly service: PatrimonioInventarioService) {}

  @Get()
  listar(@Param('orgaoId') orgaoId: string) {
    return this.service.listar(orgaoId);
  }

  @Post()
  criar(@Param('orgaoId') orgaoId: string, @Body() dto: CriarInventarioDto, @CurrentUser() user: any) {
    return this.service.criar(orgaoId, dto, user?.nome || 'Sistema');
  }

  @Get(':id')
  obter(@Param('orgaoId') orgaoId: string, @Param('id') id: string) {
    return this.service.obter(orgaoId, id);
  }

  @Get(':id/divergencias')
  divergencias(@Param('orgaoId') orgaoId: string, @Param('id') id: string) {
    return this.service.divergencias(orgaoId, id);
  }

  @Post(':id/fechar')
  fechar(
    @Param('orgaoId') orgaoId: string,
    @Param('id') id: string,
    @Query('forcar') forcar: string,
    @CurrentUser() user: any,
  ) {
    return this.service.fechar(orgaoId, id, user?.nome || 'Sistema', forcar === 'true' || forcar === '1');
  }

  @Put(':id/setores/:setorId')
  atualizarSetor(
    @Param('orgaoId') orgaoId: string,
    @Param('id') id: string,
    @Param('setorId') setorId: string,
    @Body() dto: AtualizarSetorInventarioDto,
  ) {
    return this.service.atualizarSetor(orgaoId, id, setorId, dto);
  }

  @Post(':id/setores/:setorId/enviar-link')
  enviarLink(@Param('orgaoId') orgaoId: string, @Param('id') id: string, @Param('setorId') setorId: string) {
    return this.service.enviarLink(orgaoId, id, setorId);
  }

  @Post(':id/setores/:setorId/reabrir')
  reabrirSetor(@Param('orgaoId') orgaoId: string, @Param('id') id: string, @Param('setorId') setorId: string) {
    return this.service.reabrirSetor(orgaoId, id, setorId);
  }
}

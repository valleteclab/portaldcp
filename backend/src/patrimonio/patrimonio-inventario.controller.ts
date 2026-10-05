import { Controller, Get, Post, Put, Patch, Body, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
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

  /** Relatório Final da Comissão (PDF). */
  @Get(':id/relatorio')
  async relatorio(
    @Param('orgaoId') orgaoId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, nomeArquivo } = await this.service.gerarRelatorioFinal(orgaoId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nomeArquivo}"`);
    res.send(buffer);
  }

  /** Dados da comissão que o relatório final exige (portaria, membros, autoridade). */
  @Patch(':id/comissao')
  atualizarComissao(@Param('orgaoId') orgaoId: string, @Param('id') id: string, @Body() body: any) {
    return this.service.atualizarComissao(orgaoId, id, body);
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

  /** Um WhatsApp por responsável, com todos os setores abertos dele. */
  @Post(':id/enviar-links')
  enviarLinks(@Param('orgaoId') orgaoId: string, @Param('id') id: string) {
    return this.service.enviarLinks(orgaoId, id);
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

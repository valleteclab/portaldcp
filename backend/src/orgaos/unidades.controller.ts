import { Controller, Get, Post, Put, Delete, Param, Body, Query } from '@nestjs/common';
import { UnidadesService } from './unidades.service';
import { UnidadeOrgao } from './entities/unidade-orgao.entity';

@Controller('unidades')
export class UnidadesController {
  constructor(private readonly unidadesService: UnidadesService) {}

  // Listar unidades de um órgão
  @Get('orgao/:orgaoId')
  async listarPorOrgao(@Param('orgaoId') orgaoId: string): Promise<UnidadeOrgao[]> {
    return this.unidadesService.listarPorOrgao(orgaoId);
  }

  // Buscar unidade por ID
  @Get(':id')
  async buscarPorId(@Param('id') id: string): Promise<UnidadeOrgao> {
    return this.unidadesService.buscarPorId(id);
  }

  // Criar unidade
  @Post()
  async criar(@Body() data: Partial<UnidadeOrgao>): Promise<UnidadeOrgao> {
    return this.unidadesService.criar(data);
  }

  // Atualizar unidade
  @Put(':id')
  async atualizar(
    @Param('id') id: string,
    @Body() data: Partial<UnidadeOrgao>
  ): Promise<UnidadeOrgao> {
    return this.unidadesService.atualizar(id, data);
  }

  // Excluir unidade
  @Delete(':id')
  async excluir(@Param('id') id: string): Promise<{ message: string }> {
    await this.unidadesService.excluir(id);
    return { message: 'Unidade excluída com sucesso' };
  }

  // Definir unidade como principal
  @Put(':id/principal')
  async definirPrincipal(@Param('id') id: string): Promise<UnidadeOrgao> {
    return this.unidadesService.definirPrincipal(id);
  }

  // Obter ou criar unidade padrão
  @Post('orgao/:orgaoId/padrao')
  async obterOuCriarPadrao(@Param('orgaoId') orgaoId: string): Promise<UnidadeOrgao> {
    return this.unidadesService.obterOuCriarUnidadePadrao(orgaoId);
  }
}

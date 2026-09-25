import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { UnidadesService } from './unidades.service';
import { UnidadeOrgao } from './entities/unidade-orgao.entity';
import { AcessoLicitacaoService, Ator, AtorAtual, SomenteOrgao } from '../auth/acesso';

/**
 * Unidades do órgão: só o próprio órgão (ou o admin da plataforma). O órgão
 * vem do token; `orgao_id` do corpo de outro órgão é recusado. Leitura de
 * unidade de outro órgão → 404; escrita → 403.
 */
@Controller('unidades')
@SomenteOrgao()
export class UnidadesController {
  constructor(
    private readonly unidadesService: UnidadesService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  private async unidadeDoAtor(ator: Ator | null, id: string, modo: 'leitura' | 'escrita'): Promise<UnidadeOrgao> {
    const unidade = await this.unidadesService.buscarPorId(id);
    this.acesso.assertProprioOrgao(ator, unidade.orgao_id, modo);
    return unidade;
  }

  // Listar unidades de um órgão
  @Get('orgao/:orgaoId')
  async listarPorOrgao(@Param('orgaoId') orgaoId: string, @AtorAtual() ator: Ator | null): Promise<UnidadeOrgao[]> {
    this.acesso.assertProprioOrgao(ator, orgaoId, 'leitura');
    return this.unidadesService.listarPorOrgao(orgaoId);
  }

  // Buscar unidade por ID
  @Get(':id')
  async buscarPorId(@Param('id') id: string, @AtorAtual() ator: Ator | null): Promise<UnidadeOrgao> {
    return this.unidadeDoAtor(ator, id, 'leitura');
  }

  // Criar unidade
  @Post()
  async criar(@Body() data: Partial<UnidadeOrgao>, @AtorAtual() ator: Ator | null): Promise<UnidadeOrgao> {
    const orgaoId = ator?.admin ? data.orgao_id : ator?.orgaoId;
    if (!ator?.admin && data.orgao_id && data.orgao_id !== orgaoId) {
      this.acesso.assertProprioOrgao(ator, data.orgao_id, 'escrita');
    }
    return this.unidadesService.criar({ ...data, orgao_id: orgaoId ?? undefined });
  }

  // Atualizar unidade
  @Put(':id')
  async atualizar(
    @Param('id') id: string,
    @Body() data: Partial<UnidadeOrgao>,
    @AtorAtual() ator: Ator | null,
  ): Promise<UnidadeOrgao> {
    await this.unidadeDoAtor(ator, id, 'escrita');
    const { orgao_id: _ignorado, ...resto } = data;
    return this.unidadesService.atualizar(id, resto);
  }

  // Excluir unidade
  @Delete(':id')
  async excluir(@Param('id') id: string, @AtorAtual() ator: Ator | null): Promise<{ message: string }> {
    await this.unidadeDoAtor(ator, id, 'escrita');
    await this.unidadesService.excluir(id);
    return { message: 'Unidade excluída com sucesso' };
  }

  // Definir unidade como principal
  @Put(':id/principal')
  async definirPrincipal(@Param('id') id: string, @AtorAtual() ator: Ator | null): Promise<UnidadeOrgao> {
    await this.unidadeDoAtor(ator, id, 'escrita');
    return this.unidadesService.definirPrincipal(id);
  }

  // Obter ou criar unidade padrão
  @Post('orgao/:orgaoId/padrao')
  async obterOuCriarPadrao(@Param('orgaoId') orgaoId: string, @AtorAtual() ator: Ator | null): Promise<UnidadeOrgao> {
    this.acesso.assertProprioOrgao(ator, orgaoId, 'escrita');
    return this.unidadesService.obterOuCriarUnidadePadrao(orgaoId);
  }
}

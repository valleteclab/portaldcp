import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RequireModule } from '../auth/require-module.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { PatrimonioSigaService } from './patrimonio-siga.service';

const flag = (v: string | undefined, padrao: boolean) => (v === undefined || v === '' ? padrao : !['false', '0', 'nao', 'não'].includes(v.toLowerCase()));

/**
 * Exportação do patrimônio para o SIGA do TCM-BA (arquivo "Patrimonio" para
 * o SIGA Captura) e inventário anual para o e-TCM.
 */
@Controller('orgaos/:orgaoId/patrimonio/siga')
@RequireModule(ModuloSistema.PATRIMONIO)
export class PatrimonioSigaController {
  constructor(private readonly service: PatrimonioSigaService) {}

  @Get('resumo')
  resumo(@Param('orgaoId') orgaoId: string) {
    return this.service.resumo(orgaoId);
  }

  @Get('pendencias')
  pendencias(@Param('orgaoId') orgaoId: string, @Query('tipo') tipo?: string, @Query('page') page?: string) {
    return this.service.pendencias(orgaoId, tipo || undefined, Number(page) || 1);
  }

  // ─── Tipo SIGA ────────────────────────────────────────────────────

  @Get('classificacao/sugestoes')
  sugestoes(
    @Param('orgaoId') orgaoId: string,
    @Query('page') page?: string,
    @Query('com_sugestao') comSugestao?: string,
  ) {
    return this.service.sugestoesClassificacao(orgaoId, Number(page) || 1, comSugestao === undefined || comSugestao === '' ? undefined : flag(comSugestao, true));
  }

  @Post('classificacao/aplicar')
  aplicar(@Param('orgaoId') orgaoId: string, @Body() body: { itens: { bem_id: string; siga_tipo_bem: number | null }[] }) {
    return this.service.aplicarClassificacao(orgaoId, body?.itens);
  }

  @Put('classificacao/categorias/:categoriaId')
  classificarCategoria(
    @Param('orgaoId') orgaoId: string,
    @Param('categoriaId') categoriaId: string,
    @Body() body: { siga_tipo_bem: number | null },
  ) {
    const tipo = body?.siga_tipo_bem === null || body?.siga_tipo_bem === undefined || (body.siga_tipo_bem as any) === '' ? null : Number(body.siga_tipo_bem);
    return this.service.classificarCategoria(orgaoId, categoriaId, tipo);
  }

  // ─── Responsável ──────────────────────────────────────────────────

  @Post('responsaveis/aplicar-por-setor')
  aplicarResponsavel(
    @Param('orgaoId') orgaoId: string,
    @Body() body: { setor_id: string; nome: string; cpf: string; somente_sem_responsavel?: boolean },
  ) {
    return this.service.aplicarResponsavelPorSetor(orgaoId, body);
  }

  // ─── Arquivo ──────────────────────────────────────────────────────

  @Get('arquivo/ids')
  idsArquivo(@Param('orgaoId') orgaoId: string, @Query('somente_nao_enviados') somenteNaoEnviados?: string) {
    return this.service.idsDoArquivo(orgaoId, flag(somenteNaoEnviados, true));
  }

  @Get('arquivo')
  async arquivo(
    @Param('orgaoId') orgaoId: string,
    @Res() res: Response,
    @Query('somente_nao_enviados') somenteNaoEnviados?: string,
    @Query('parte') parte?: string,
  ) {
    const numeroParte = parte ? Number(parte) : undefined;
    if (numeroParte !== undefined && (!Number.isInteger(numeroParte) || numeroParte < 1)) throw new BadRequestException('Parte inválida.');
    const arq = await this.service.gerarArquivo(orgaoId, flag(somenteNaoEnviados, true), numeroParte);
    res.set({
      'Content-Type': arq.tipo,
      'Content-Disposition': `attachment; filename="${arq.nome}"`,
      'Content-Length': String(arq.buffer.length),
      'X-Siga-Partes': String(arq.partes),
      'X-Siga-Registros': String(arq.registros),
      'Access-Control-Expose-Headers': 'Content-Disposition, X-Siga-Partes, X-Siga-Registros',
    });
    res.send(arq.buffer);
  }

  @Post('marcar-enviados')
  marcarEnviados(@Param('orgaoId') orgaoId: string, @Body() body: { bem_ids: string[] }, @CurrentUser() user: any) {
    return this.service.marcarEnviados(orgaoId, body?.bem_ids, user?.nome || 'Sistema');
  }

  // ─── Baixas ───────────────────────────────────────────────────────

  @Get('baixas-a-lancar')
  baixas(@Param('orgaoId') orgaoId: string) {
    return this.service.baixasALancar(orgaoId);
  }

  @Post('baixas-a-lancar/marcar')
  marcarBaixas(@Param('orgaoId') orgaoId: string, @Body() body: { bem_ids: string[] }, @CurrentUser() user: any) {
    return this.service.marcarBaixasLancadas(orgaoId, body?.bem_ids, user?.nome || 'Sistema');
  }

  // ─── Inventário anual (e-TCM) ─────────────────────────────────────

  @Get('inventario-anual')
  async inventarioAnual(@Param('orgaoId') orgaoId: string, @Query('ano') ano: string, @Res() res: Response) {
    const exercicio = Number(ano) || new Date().getFullYear() - 1;
    const pdf = await this.service.inventarioAnualPdf(orgaoId, exercicio);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="inventario-anual-${exercicio}.pdf"`,
      'Content-Length': String(pdf.length),
    });
    res.send(pdf);
  }
}

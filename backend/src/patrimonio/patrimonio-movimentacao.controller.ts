import { Controller, Get, Post, Body, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { CurrentUser } from '../auth/current-user.decorator';
import { PatrimonioMovimentacaoService } from './patrimonio-movimentacao.service';
import { SolicitarTransferenciaDto, BaixarBemDto, EmprestarBemDto } from './dto/movimentacao.dto';
import { TipoMovimentacao, StatusMovimentacao } from './entities/enums';

/** Transferências, baixas e empréstimos (lado do órgão). */
@Controller('orgaos/:orgaoId/patrimonio/movimentacoes')
@RequireModule(ModuloSistema.PATRIMONIO)
export class PatrimonioMovimentacaoController {
  constructor(private readonly service: PatrimonioMovimentacaoService) {}

  @Get()
  listar(
    @Param('orgaoId') orgaoId: string,
    @Query('tipo') tipo?: TipoMovimentacao,
    @Query('status') status?: StatusMovimentacao,
    @Query('bem_id') bem_id?: string,
    @Query('setor_id') setor_id?: string,
  ) {
    return this.service.listar(orgaoId, { tipo, status, bem_id, setor_id });
  }

  @Get('emprestimos-vencidos')
  emprestimosVencidos(@Param('orgaoId') orgaoId: string) {
    return this.service.emprestimosVencidos(orgaoId);
  }

  @Post('transferencia')
  transferir(@Param('orgaoId') orgaoId: string, @Body() dto: SolicitarTransferenciaDto, @CurrentUser() user: any) {
    return this.service.solicitarTransferencia(orgaoId, dto, user?.nome || 'Sistema');
  }

  @Post('lote/:loteId/reenviar-link')
  reenviar(@Param('orgaoId') orgaoId: string, @Param('loteId') loteId: string) {
    return this.service.reenviarLink(orgaoId, loteId);
  }

  @Post(':id/cancelar')
  cancelar(@Param('orgaoId') orgaoId: string, @Param('id') id: string, @CurrentUser() user: any) {
    return this.service.cancelar(orgaoId, id, user?.nome || 'Sistema');
  }

  @Post('baixa')
  baixar(@Param('orgaoId') orgaoId: string, @Body() dto: BaixarBemDto, @CurrentUser() user: any) {
    return this.service.baixar(orgaoId, dto, user?.nome || 'Sistema');
  }

  @Post('emprestimo')
  emprestar(@Param('orgaoId') orgaoId: string, @Body() dto: EmprestarBemDto, @CurrentUser() user: any) {
    return this.service.emprestar(orgaoId, dto, user?.nome || 'Sistema');
  }

  @Post(':id/devolver')
  devolver(@Param('orgaoId') orgaoId: string, @Param('id') id: string, @CurrentUser() user: any) {
    return this.service.devolver(orgaoId, id, user?.nome || 'Sistema');
  }

  @Get('lote/:loteId/termo')
  async termoTransferencia(@Param('orgaoId') orgaoId: string, @Param('loteId') loteId: string, @Res() res: Response) {
    const pdf = await this.service.termoTransferenciaPdf(orgaoId, loteId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename=termo-transferencia-${loteId.slice(0, 8)}.pdf` });
    res.send(pdf);
  }

  @Get(':id/termo-baixa')
  async termoBaixa(@Param('orgaoId') orgaoId: string, @Param('id') id: string, @Res() res: Response) {
    const pdf = await this.service.termoBaixaPdf(orgaoId, id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename=termo-baixa-${id.slice(0, 8)}.pdf` });
    res.send(pdf);
  }

  @Get('setores/:setorId/termo-responsabilidade')
  async termoResponsabilidade(
    @Param('orgaoId') orgaoId: string,
    @Param('setorId') setorId: string,
    @Query('responsavel') responsavel: string,
    @Res() res: Response,
  ) {
    const pdf = await this.service.termoResponsabilidadePdf(orgaoId, setorId, responsavel);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename=termo-responsabilidade.pdf` });
    res.send(pdf);
  }
}

import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, Req,
  ParseUUIDPipe, Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { JwtPayload, UserType } from '../auth/auth.service';
import { FrotaService } from './frota.service';

@Controller('frota')
@RequireModule(ModuloSistema.FROTA)
export class FrotaController {
  constructor(private readonly frotaService: FrotaService) {}

  private getOrgaoId(user: JwtPayload): string {
    if (user.type === UserType.ORGAO) return user.sub;
    const orgaoId = user.orgaoId || (user as any).orgao_id;
    if (orgaoId) return orgaoId;
    throw new Error('Órgão não identificado');
  }

  private getUserName(user: JwtPayload): string {
    return (user as any).nome || (user as any).name || 'Sistema';
  }

  // ========== RESUMO GERAL ==========

  @Get('resumo')
  async obterResumo(@Req() req: { user: JwtPayload }, @Query('mes') mes?: string) {
    return this.frotaService.obterResumo(this.getOrgaoId(req.user), mes);
  }

  // ========== VEÍCULOS ==========

  @Get('veiculos')
  async listarVeiculos(@Req() req: { user: JwtPayload }, @Query('search') search?: string) {
    return this.frotaService.listarVeiculos(this.getOrgaoId(req.user), search);
  }

  @Post('veiculos')
  async criarVeiculo(@Req() req: { user: JwtPayload }, @Body() body: any) {
    return this.frotaService.criarVeiculo(this.getOrgaoId(req.user), body);
  }

  @Put('veiculos/:id')
  async atualizarVeiculo(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: JwtPayload },
    @Body() body: any,
  ) {
    return this.frotaService.atualizarVeiculo(id, this.getOrgaoId(req.user), body);
  }

  @Delete('veiculos/:id')
  async excluirVeiculo(@Param('id', ParseUUIDPipe) id: string, @Req() req: { user: JwtPayload }) {
    await this.frotaService.excluirVeiculo(id, this.getOrgaoId(req.user));
    return { message: 'Veículo excluído' };
  }

  // ========== ABASTECIMENTOS (legado) ==========

  @Get('abastecimentos')
  async listarAbastecimentos(
    @Req() req: { user: JwtPayload },
    @Query('veiculo_id') veiculoId?: string,
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
  ) {
    return this.frotaService.listarAbastecimentos(this.getOrgaoId(req.user), veiculoId, dataInicio, dataFim);
  }

  @Post('abastecimentos')
  async criarAbastecimento(@Req() req: { user: JwtPayload }, @Body() body: any) {
    return this.frotaService.criarAbastecimento(this.getOrgaoId(req.user), body);
  }

  @Put('abastecimentos/:id')
  async atualizarAbastecimento(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: JwtPayload },
    @Body() body: any,
  ) {
    return this.frotaService.atualizarAbastecimento(id, this.getOrgaoId(req.user), body);
  }

  @Delete('abastecimentos/:id')
  async excluirAbastecimento(@Param('id', ParseUUIDPipe) id: string, @Req() req: { user: JwtPayload }) {
    await this.frotaService.excluirAbastecimento(id, this.getOrgaoId(req.user));
    return { message: 'Abastecimento excluído' };
  }

  // ========== MANUTENÇÕES ==========

  @Get('manutencoes')
  async listarManutencoes(
    @Req() req: { user: JwtPayload },
    @Query('veiculo_id') veiculoId?: string,
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
  ) {
    return this.frotaService.listarManutencoes(this.getOrgaoId(req.user), veiculoId, dataInicio, dataFim);
  }

  @Post('manutencoes')
  async criarManutencao(@Req() req: { user: JwtPayload }, @Body() body: any) {
    return this.frotaService.criarManutencao(this.getOrgaoId(req.user), body);
  }

  @Put('manutencoes/:id')
  async atualizarManutencao(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: JwtPayload },
    @Body() body: any,
  ) {
    return this.frotaService.atualizarManutencao(id, this.getOrgaoId(req.user), body);
  }

  @Delete('manutencoes/:id')
  async excluirManutencao(@Param('id', ParseUUIDPipe) id: string, @Req() req: { user: JwtPayload }) {
    await this.frotaService.excluirManutencao(id, this.getOrgaoId(req.user));
    return { message: 'Manutenção excluída' };
  }

  // ========== CONTRATOS DE ABASTECIMENTO ==========

  @Get('contratos')
  async listarContratos(@Req() req: { user: JwtPayload }) {
    return this.frotaService.listarContratos(this.getOrgaoId(req.user));
  }

  @Get('contratos/ativo')
  async obterContratoAtivo(@Req() req: { user: JwtPayload }) {
    return this.frotaService.obterContratoAtivo(this.getOrgaoId(req.user));
  }

  @Post('contratos')
  async criarContrato(@Req() req: { user: JwtPayload }, @Body() body: any) {
    return this.frotaService.criarContrato(this.getOrgaoId(req.user), body);
  }

  @Put('contratos/:id')
  async atualizarContrato(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: JwtPayload },
    @Body() body: any,
  ) {
    return this.frotaService.atualizarContrato(id, this.getOrgaoId(req.user), body);
  }

  @Delete('contratos/:id')
  async excluirContrato(@Param('id', ParseUUIDPipe) id: string, @Req() req: { user: JwtPayload }) {
    await this.frotaService.excluirContrato(id, this.getOrgaoId(req.user));
    return { message: 'Contrato excluído' };
  }

  // ========== REQUISIÇÕES ==========

  @Get('requisicoes')
  async listarRequisicoes(
    @Req() req: { user: JwtPayload },
    @Query('mes') mes?: string,
    @Query('status') status?: string,
  ) {
    return this.frotaService.listarRequisicoes(this.getOrgaoId(req.user), mes, status);
  }

  @Post('requisicoes')
  async criarRequisicao(@Req() req: { user: JwtPayload }, @Body() body: any) {
    return this.frotaService.criarRequisicao(this.getOrgaoId(req.user), body);
  }

  @Put('requisicoes/:id')
  async atualizarRequisicao(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: JwtPayload },
    @Body() body: any,
  ) {
    return this.frotaService.atualizarRequisicao(id, this.getOrgaoId(req.user), body);
  }

  @Put('requisicoes/:id/autorizar')
  async autorizarRequisicao(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: JwtPayload },
  ) {
    const nome = this.getUserName(req.user);
    return this.frotaService.autorizarRequisicao(id, this.getOrgaoId(req.user), nome);
  }

  @Put('requisicoes/:id/negar')
  async negarRequisicao(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: JwtPayload },
    @Body('motivo') motivo: string,
  ) {
    return this.frotaService.negarRequisicao(id, this.getOrgaoId(req.user), motivo || '');
  }

  @Put('requisicoes/:id/cancelar')
  async cancelarRequisicao(@Param('id', ParseUUIDPipe) id: string, @Req() req: { user: JwtPayload }) {
    return this.frotaService.cancelarRequisicao(id, this.getOrgaoId(req.user));
  }

  @Get('requisicoes/verificar/:codigo')
  async verificarCodigo(@Param('codigo') codigo: string, @Req() req: { user: JwtPayload }) {
    return this.frotaService.verificarCodigo(codigo, this.getOrgaoId(req.user));
  }

  @Put('requisicoes/:id/confirmar-abastecimento')
  async confirmarAbastecimento(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: JwtPayload },
    @Body() body: any,
  ) {
    return this.frotaService.confirmarAbastecimento(id, this.getOrgaoId(req.user), body);
  }

  // ========== DASHBOARD DO POSTO ==========

  @Get('dashboard-posto')
  async obterDashboardPosto(@Req() req: { user: JwtPayload }, @Query('mes') mes?: string) {
    return this.frotaService.obterDashboardPosto(this.getOrgaoId(req.user), mes);
  }

  // ========== RELATÓRIO SIGA (CSV) ==========

  @Get('relatorio/siga')
  async gerarRelatorioSiga(
    @Req() req: { user: JwtPayload },
    @Query('mes') mes: string,
    @Res() res: Response,
  ) {
    const orgaoId = this.getOrgaoId(req.user);
    const mesAtual = mes || new Date().toISOString().slice(0, 7);
    const dados = await this.frotaService.gerarDadosRelatorioSiga(orgaoId, mesAtual);

    // Gera CSV no formato SIGA
    const [ano, m] = mesAtual.split('-');
    const nomeMes = new Date(`${mesAtual}-15`).toLocaleString('pt-BR', { month: 'long' }).toUpperCase();

    const linhas: string[] = [];
    linhas.push(`CONSUMO DE COMBUSTIVEL - FROTA SIGA`);
    linhas.push(`CONSUMO MES ${nomeMes} - ${ano}`);
    linhas.push('');
    linhas.push('Modelo/Marca;Placa;Chassi;Renavam;Tipo;Litros;Valor cupom;Valor total dos produtos;Acrescimo Contratual;Total Acrescimo;Total a pagar');

    for (const l of dados.linhas) {
      const valorTotal = (l.litros * l.valor_cupom).toFixed(4).replace('.', ',');
      linhas.push([
        l.modelo, l.placa, l.chassi, l.renavam,
        l.tipo,
        l.litros.toFixed(3).replace('.', ','),
        l.valor_cupom.toFixed(4).replace('.', ','),
        valorTotal,
        'R$ -', 'R$ -',
        valorTotal,
      ].join(';'));
    }

    linhas.push('');
    linhas.push(`Subtotal;;;;;;${dados.subtotal_litros.toFixed(3).replace('.', ',')};;R$ ${dados.subtotal_valor.toFixed(3).replace('.', ',')};;;R$ ${dados.subtotal_valor.toFixed(3).replace('.', ',')}`);
    linhas.push('');
    linhas.push(`TOTAL GERAL;;;;;;;;;;;;;R$ ${dados.total_geral.toFixed(2).replace('.', ',')}`);

    const csv = '\uFEFF' + linhas.join('\n'); // BOM para Excel reconhecer UTF-8
    const filename = `SIGA_COMBUSTIVEL_${nomeMes}_${ano}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}

import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, Req,
  ParseUUIDPipe, Res, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Response } from 'express';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { JwtPayload, UserType } from '../auth/auth.service';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { FrotaService } from './frota.service';
import { FrotaAuthService } from './frota-auth.service';

@Controller('frota')
@RequireModule(ModuloSistema.FROTA)
export class FrotaController {
  constructor(
    private readonly frotaService: FrotaService,
    private readonly frotaAuthService: FrotaAuthService,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
  ) {}

  private getOrgaoId(user: JwtPayload): string {
    if (user.type === UserType.ORGAO) return user.sub;
    const orgaoId = user.orgaoId || (user as any).orgao_id;
    if (orgaoId) return orgaoId;
    throw new Error('Órgão não identificado');
  }

  /** Nome de quem age (autorizou, liberou cota…). O JWT não carrega nome — busca o usuário. */
  private async getUserName(user: JwtPayload): Promise<string> {
    const doToken = (user as any).nome || (user as any).name;
    if (doToken) return doToken;
    if (user.type === UserType.USUARIO || user.sub) {
      const u = await this.usuarioRepository.findOne({ where: { id: user.sub }, select: ['id', 'nome', 'email'] });
      if (u?.nome || u?.email) return u.nome || u.email;
    }
    return user.type === UserType.ORGAO ? 'Gestor do órgão' : 'Sistema';
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

  @Post('contratos/importar/:contratoId')
  async importarContrato(
    @Param('contratoId', ParseUUIDPipe) contratoId: string,
    @Req() req: { user: JwtPayload },
    @Body() body: { preco_litro: number; limite_litros_mensal?: number },
  ) {
    return this.frotaService.importarDeContrato(
      this.getOrgaoId(req.user),
      contratoId,
      { preco_litro: body.preco_litro, limite_litros_mensal: body.limite_litros_mensal },
    );
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

  @Get('requisicoes/posso-excluir')
  async possoExcluirRequisicao(@Req() req: { user: JwtPayload }) {
    if (req.user.type === UserType.ORGAO) return { pode: true };
    const usuario = await this.usuarioRepository.findOne({ where: { id: req.user.sub } });
    return { pode: !!usuario?.pode_excluir_requisicao_combustivel };
  }

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
    const nome = await this.getUserName(req.user);
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

  @Delete('requisicoes/:id')
  async excluirRequisicao(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: JwtPayload },
  ) {
    if (req.user.type === UserType.USUARIO) {
      const usuario = await this.usuarioRepository.findOne({ where: { id: req.user.sub } });
      if (!usuario?.pode_excluir_requisicao_combustivel) {
        throw new ForbiddenException('Você não tem permissão para excluir requisições de combustível');
      }
    }
    await this.frotaService.excluirRequisicao(id, this.getOrgaoId(req.user));
    return { message: 'Requisição excluída' };
  }

  @Get('requisicoes/verificar/:codigo')
  async verificarCodigo(@Param('codigo') codigo: string, @Req() req: { user: JwtPayload }) {
    return this.frotaService.verificarCodigo(codigo, this.getOrgaoId(req.user), true);
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

  // ========== CREDENCIAIS (POSTO / VEREADOR) ==========

  @Get('credenciais')
  async listarCredenciais(@Req() req: { user: JwtPayload }) {
    return this.frotaAuthService.listarCredenciais(this.getOrgaoId(req.user));
  }

  @Post('credenciais')
  async criarCredencial(@Req() req: { user: JwtPayload }, @Body() body: any) {
    return this.frotaAuthService.criarCredencial(this.getOrgaoId(req.user), body);
  }

  @Put('credenciais/:id')
  async atualizarCredencial(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: JwtPayload },
    @Body() body: any,
  ) {
    return this.frotaAuthService.atualizarCredencial(id, this.getOrgaoId(req.user), body);
  }

  @Delete('credenciais/:id')
  async excluirCredencial(@Param('id', ParseUUIDPipe) id: string, @Req() req: { user: JwtPayload }) {
    await this.frotaAuthService.excluirCredencial(id, this.getOrgaoId(req.user));
    return { message: 'Credencial excluída' };
  }

  /** Gestor libera litros extras para um vereador no mês corrente (auditado + aviso no WhatsApp) */
  @Put('credenciais/:id/cota-extra')
  async liberarCotaExtra(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: JwtPayload },
    @Body() body: { litros: number; motivo?: string },
  ) {
    return this.frotaAuthService.liberarCotaExtra(
      id, this.getOrgaoId(req.user), Number(body?.litros), body?.motivo || '', await this.getUserName(req.user),
    );
  }

  @Get('credenciais/logs')
  async listarLogs(
    @Req() req: { user: JwtPayload },
    @Query('credencial_id') credencialId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.frotaAuthService.listarLogs(this.getOrgaoId(req.user), credencialId, limit ? parseInt(limit) : 200);
  }
}

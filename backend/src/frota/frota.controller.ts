import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
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

  // ========== RESUMO ==========

  @Get('resumo')
  async obterResumo(
    @Req() request: { user: JwtPayload },
    @Query('mes') mes?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.frotaService.obterResumo(orgaoId, mes);
  }

  // ========== VEÍCULOS ==========

  @Get('veiculos')
  async listarVeiculos(
    @Req() request: { user: JwtPayload },
    @Query('search') search?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.frotaService.listarVeiculos(orgaoId, search);
  }

  @Post('veiculos')
  async criarVeiculo(
    @Req() request: { user: JwtPayload },
    @Body() body: any,
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.frotaService.criarVeiculo(orgaoId, body);
  }

  @Put('veiculos/:id')
  async atualizarVeiculo(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @Body() body: any,
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.frotaService.atualizarVeiculo(id, orgaoId, body);
  }

  @Delete('veiculos/:id')
  async excluirVeiculo(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    await this.frotaService.excluirVeiculo(id, orgaoId);
    return { message: 'Veículo excluído com sucesso' };
  }

  // ========== ABASTECIMENTOS ==========

  @Get('abastecimentos')
  async listarAbastecimentos(
    @Req() request: { user: JwtPayload },
    @Query('veiculo_id') veiculoId?: string,
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.frotaService.listarAbastecimentos(orgaoId, veiculoId, dataInicio, dataFim);
  }

  @Post('abastecimentos')
  async criarAbastecimento(
    @Req() request: { user: JwtPayload },
    @Body() body: any,
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.frotaService.criarAbastecimento(orgaoId, body);
  }

  @Put('abastecimentos/:id')
  async atualizarAbastecimento(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @Body() body: any,
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.frotaService.atualizarAbastecimento(id, orgaoId, body);
  }

  @Delete('abastecimentos/:id')
  async excluirAbastecimento(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    await this.frotaService.excluirAbastecimento(id, orgaoId);
    return { message: 'Abastecimento excluído com sucesso' };
  }

  // ========== MANUTENÇÕES ==========

  @Get('manutencoes')
  async listarManutencoes(
    @Req() request: { user: JwtPayload },
    @Query('veiculo_id') veiculoId?: string,
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.frotaService.listarManutencoes(orgaoId, veiculoId, dataInicio, dataFim);
  }

  @Post('manutencoes')
  async criarManutencao(
    @Req() request: { user: JwtPayload },
    @Body() body: any,
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.frotaService.criarManutencao(orgaoId, body);
  }

  @Put('manutencoes/:id')
  async atualizarManutencao(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
    @Body() body: any,
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    return this.frotaService.atualizarManutencao(id, orgaoId, body);
  }

  @Delete('manutencoes/:id')
  async excluirManutencao(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const orgaoId = this.getOrgaoId(request.user);
    await this.frotaService.excluirManutencao(id, orgaoId);
    return { message: 'Manutenção excluída com sucesso' };
  }
}

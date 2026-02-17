import { Controller, Get, Query, Req } from '@nestjs/common';
import { RelatoriosService } from './relatorios.service';
import { JwtPayload, UserType } from '../auth/auth.service';

@Controller('relatorios')
export class RelatoriosController {
  constructor(private readonly relatoriosService: RelatoriosService) {}

  private getOrgaoId(request: { user: JwtPayload }): string {
    const user = request.user;
    if (user.type === UserType.ADMIN) return '';
    if (user.type === UserType.ORGAO) return user.sub;
    return user.orgaoId || (user as any).orgao_id || '';
  }

  @Get('licitacoes/eficiencia')
  async eficienciaLicitacoes(
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
    @Query('ano') ano?: string,
  ) {
    const orgaoId = request.user.type === UserType.ADMIN ? (orgaoIdParam || '') : this.getOrgaoId(request);
    if (!orgaoId) {
      return { error: 'orgaoId é obrigatório' };
    }
    const anoNum = ano ? parseInt(ano, 10) : undefined;
    return this.relatoriosService.getEficienciaLicitacoes(orgaoId, isNaN(anoNum as number) ? undefined : anoNum);
  }

  @Get('contratos/financeiro')
  async financeiroContratos(
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
    @Query('ano') ano?: string,
  ) {
    const orgaoId = request.user.type === UserType.ADMIN ? (orgaoIdParam || '') : this.getOrgaoId(request);
    if (!orgaoId) {
      return { error: 'orgaoId é obrigatório' };
    }
    const anoNum = ano ? parseInt(ano, 10) : undefined;
    return this.relatoriosService.getFinanceiroContratos(orgaoId, isNaN(anoNum as number) ? undefined : anoNum);
  }

  @Get('almoxarifado/consumo')
  async consumoAlmoxarifado(
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
    @Query('ano') ano?: string,
  ) {
    const orgaoId = request.user.type === UserType.ADMIN ? (orgaoIdParam || '') : this.getOrgaoId(request);
    if (!orgaoId) {
      return { error: 'orgaoId é obrigatório' };
    }
    const anoNum = ano ? parseInt(ano, 10) : undefined;
    return this.relatoriosService.getConsumoAlmoxarifado(orgaoId, isNaN(anoNum as number) ? undefined : anoNum);
  }
}

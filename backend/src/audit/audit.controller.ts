import { Controller, ForbiddenException, Get, Query, Req } from '@nestjs/common';
import { atorDaRequisicao, ehOrgao } from '../auth/acesso/ator';
import { AuditService } from './audit.service';

/**
 * Consulta da trilha de auditoria persistida.
 */
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('logs')
  listar(
    @Query('orgaoId') orgaoId?: string,
    @Query('action') action?: string,
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
    @Query('userId') userId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Req() req?: any,
  ) {
    // Admin vê tudo; órgão só a própria trilha (o filtro vem do token); fornecedor não vê.
    const ator = atorDaRequisicao(req);
    if (!ator?.admin) {
      if (!ehOrgao(ator)) throw new ForbiddenException('Trilha de auditoria restrita ao órgão e à administração');
      orgaoId = ator.orgaoId;
    }
    return this.auditService.listar({
      orgaoId,
      action,
      resourceType,
      resourceId,
      userId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}

import { Controller, Get, Query } from '@nestjs/common';
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
  ) {
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

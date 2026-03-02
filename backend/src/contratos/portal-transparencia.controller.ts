import { Controller, Post, Get, Query, UseGuards, Request } from '@nestjs/common';
import { PortalTransparenciaService, PortalTransparenciaResponse } from './portal-transparencia.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('contratos/portal-transparencia')
@UseGuards(JwtAuthGuard)
export class PortalTransparenciaController {
  constructor(private readonly portalTransparenciaService: PortalTransparenciaService) {}

  @Get('buscar')
  async buscarContratos(
    @Query('numero') numero?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('apenas_vigentes') apenasVigentes?: string,
  ): Promise<PortalTransparenciaResponse> {
    return this.portalTransparenciaService.buscarContratos({
      numero,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      apenas_vigentes: apenasVigentes === 'true',
    });
  }

  @Post('importar')
  async importarContratos(
    @Request() req: any,
    @Query('numero') numero?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('apenas_vigentes') apenasVigentes?: string,
  ) {
    const orgaoId = req.user.orgao_id;
    
    return this.portalTransparenciaService.importarContratos(orgaoId, {
      numero,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      apenas_vigentes: apenasVigentes === 'true',
    });
  }
}

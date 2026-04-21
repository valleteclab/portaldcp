import { Controller, Post, Get, Query, UseGuards, Request, Body, BadRequestException, Logger, Param, NotFoundException } from '@nestjs/common';
import { PortalTransparenciaService, PortalTransparenciaResponse } from './portal-transparencia.service';
import type { PortalTransparenciaContrato } from './portal-transparencia.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('contratos/portal-transparencia')
@UseGuards(JwtAuthGuard)
export class PortalTransparenciaController {
  private readonly logger = new Logger(PortalTransparenciaController.name);

  constructor(private readonly portalTransparenciaService: PortalTransparenciaService) {}

  @Get('buscar')
  async buscarContratos(
    @Request() req: any,
    @Query('numero') numero?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('apenas_vigentes') apenasVigentes?: string,
  ) {
    const orgaoId = req.user?.orgao_id || req.user?.orgaoId || req.user?.sub;
    const resultado = await this.portalTransparenciaService.buscarContratos({
      numero,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      apenas_vigentes: apenasVigentes === 'true',
    });

    if (orgaoId && resultado.data?.length > 0) {
      resultado.data = await this.portalTransparenciaService.marcarContratosJaCadastrados(
        resultado.data,
        orgaoId,
      );
    }

    return resultado;
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

  @Post('importar-individual')
  async importarContratoIndividual(
    @Request() req: any,
    @Body() contratoApi: any,
  ) {
    // Log completo do req.user para debug
    this.logger.log('[Controller] req.user completo:', JSON.stringify(req.user));
    
    // Extrair orgaoId de várias possíveis propriedades
    const orgaoId = req.user?.orgao_id || req.user?.orgaoId || req.user?.sub;
    
    this.logger.log(`[Controller] orgaoId extraído: ${orgaoId}`);
    
    if (!orgaoId) {
      this.logger.error('[Controller] orgaoId não encontrado no req.user');
      throw new BadRequestException('Órgão não identificado. Verifique se o usuário está logado corretamente.');
    }
    
    return this.portalTransparenciaService.importarContratoIndividualPublico(orgaoId, contratoApi as PortalTransparenciaContrato);
  }

  @Post('importar-individual-completo')
  async iniciarImportacaoContratoIndividualCompleto(
    @Request() req: any,
    @Body() contratoApi: any,
  ) {
    const orgaoId = req.user?.orgao_id || req.user?.orgaoId || req.user?.sub;

    if (!orgaoId) {
      throw new BadRequestException('Órgão não identificado. Verifique se o usuário está logado corretamente.');
    }

    return this.portalTransparenciaService.iniciarImportacaoContratoCompletoJob(
      orgaoId,
      contratoApi as PortalTransparenciaContrato,
    );
  }

  @Get('aditivos/:portalContratoId')
  async buscarAditivos(
    @Param('portalContratoId') portalContratoId: string,
  ) {
    return this.portalTransparenciaService.buscarAditivosPortal(portalContratoId);
  }

  @Get('buscar-aditivos-por-contrato/:contratoId')
  async buscarAditivosPorContrato(
    @Param('contratoId') contratoId: string,
  ) {
    return this.portalTransparenciaService.buscarAditivosPorContratoId(contratoId);
  }

  @Post('importar-aditivos')
  async importarAditivos(
    @Body() body: { contrato_id: string; aditivos: Array<{ nome: string; tipo: string; valor: string; vigencia: string; fiscal: string; pdf_url: string }> },
  ) {
    if (!body.contrato_id || !body.aditivos?.length) {
      throw new BadRequestException('contrato_id e aditivos são obrigatórios');
    }
    return this.portalTransparenciaService.importarAditivos(body.contrato_id, body.aditivos);
  }

  @Get('importar-individual-status/:jobId')
  async obterStatusImportacaoContratoIndividualCompleto(
    @Param('jobId') jobId: string,
  ) {
    const status = this.portalTransparenciaService.obterStatusImportacaoContratoCompleto(jobId);

    if (!status) {
      throw new NotFoundException('Importação não encontrada');
    }

    return status;
  }
}

import { Controller, Get, Param, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { JwtPayload } from '../auth/auth.service';
import { ConferenciaExecucaoService } from './conferencia-execucao.service';

/**
 * Painel de conferência entre a contabilidade e o sistema.
 * Restrito ao suporte (administrador da plataforma): mostra contratos de
 * qualquer órgão e consulta o portal da transparência.
 */
@Controller('admin/conferencia-execucao')
@UseGuards(AdminGuard)
export class ConferenciaExecucaoController {
  constructor(private readonly conferencia: ConferenciaExecucaoService) {}

  @Get()
  async listar(
    @Query('orgaoId') orgaoId: string,
    @Query('ano') ano: string,
    @Req() _request: { user: JwtPayload },
  ) {
    if (!orgaoId) throw new BadRequestException('Informe o órgão');
    const exercicio = Number(ano) || new Date().getFullYear();
    return this.conferencia.listar(orgaoId, exercicio);
  }

  @Get(':contratoId')
  async detalhar(@Param('contratoId') contratoId: string, @Query('ano') ano: string) {
    const exercicio = Number(ano) || new Date().getFullYear();
    return this.conferencia.detalhar(contratoId, exercicio);
  }
}

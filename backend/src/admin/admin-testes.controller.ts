import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AdminTestesService } from './admin-testes.service';
import { AdminGuard } from '../auth/admin.guard';

/**
 * Painel Admin — Executar e monitorar o teste E2E do pregão eletrônico
 * via browser, sem precisar de acesso ao terminal.
 *
 * Rota base: /api/admin/testes/...
 * Exige token de administrador da plataforma: estes endpoints executam cenário
 * de teste e criam dados, então não podem ficar abertos na internet.
 */
@Controller('admin/testes')
@UseGuards(AdminGuard)
export class AdminTestesController {
  constructor(private readonly testesService: AdminTestesService) {}

  /**
   * Inicia a execução do cenário de teste E2E.
   * Retorna imediatamente; o progresso é acompanhado via GET /resultado.
   */
  @Post('executar')
  async executar() {
    return this.testesService.executar();
  }

  /**
   * Retorna o estado atual do run (polling a cada 2s pelo frontend).
   */
  @Get('resultado')
  getResultado() {
    return this.testesService.getResultado();
  }

  /**
   * Solicita o cancelamento do run em andamento.
   */
  @Post('cancelar')
  cancelar() {
    this.testesService.cancelar();
    return { ok: true };
  }
}

import { Controller, Get, Post } from '@nestjs/common';
import { AdminTestesService } from './admin-testes.service';
import { Public } from '../auth/public.decorator';

/**
 * Painel Admin — Executar e monitorar o teste E2E do pregão eletrônico
 * via browser, sem precisar de acesso ao terminal.
 *
 * Rota base: /api/admin/testes/...
 * Todos os endpoints são @Public() seguindo o mesmo padrão do AdminMonitoramentoController.
 */
@Controller('admin/testes')
export class AdminTestesController {
  constructor(private readonly testesService: AdminTestesService) {}

  /**
   * Inicia a execução do cenário de teste E2E.
   * Retorna imediatamente; o progresso é acompanhado via GET /resultado.
   */
  @Public()
  @Post('executar')
  async executar() {
    return this.testesService.executar();
  }

  /**
   * Retorna o estado atual do run (polling a cada 2s pelo frontend).
   */
  @Public()
  @Get('resultado')
  getResultado() {
    return this.testesService.getResultado();
  }

  /**
   * Solicita o cancelamento do run em andamento.
   */
  @Public()
  @Post('cancelar')
  cancelar() {
    this.testesService.cancelar();
    return { ok: true };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TramitacaoService } from './tramitacao.service';

/**
 * AVISO DE PRAZO DA TRAMITAÇÃO: todo dia, 07:30 (Brasília), avisa o destino
 * do processo quando falta 1 dia útil e quando o prazo venceu. Idempotente
 * (cada evento é carimbado na tramitação — não avisa duas vezes).
 * Desliga com FASE_INTERNA_TRAMITACAO_AVISOS=false.
 */
@Injectable()
export class TramitacaoPrazosScheduler {
  private readonly logger = new Logger(TramitacaoPrazosScheduler.name);

  constructor(private readonly tramitacao: TramitacaoService) {}

  @Cron('30 7 * * *', { name: 'tramitacao-prazos', timeZone: 'America/Sao_Paulo' })
  async avisar(): Promise<void> {
    if (process.env.FASE_INTERNA_TRAMITACAO_AVISOS === 'false') return;
    try {
      const r = await this.tramitacao.avisarPrazos();
      if (r.vespera || r.vencido) this.logger.log(`Avisos de prazo da tramitação: ${r.vespera} véspera(s), ${r.vencido} vencido(s)`);
    } catch (e: any) {
      this.logger.error(`Avisos de prazo da tramitação não executados: ${e?.message ?? e}`);
    }
  }
}

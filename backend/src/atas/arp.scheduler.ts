import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ArpService } from './arp.service';

/**
 * VIGÊNCIA DA ARP (art. 84): todo dia, 00:20 (Brasília), as atas VIGENTE /
 * ESGOTADA com o fim da vigência no passado viram VENCIDA (nenhuma
 * contratação/adesão depois disso — o serviço também confere a data em cada
 * ato) e as convocações do cadastro de reserva com prazo vencido, EXPIRADO.
 */
@Injectable()
export class ArpScheduler {
  private readonly logger = new Logger(ArpScheduler.name);

  constructor(private readonly arp: ArpService) {}

  @Cron('20 0 * * *', { name: 'arp-vigencia', timeZone: 'America/Sao_Paulo' })
  async expirar(): Promise<void> {
    try {
      await this.arp.expirarAtasVencidas();
    } catch (e: any) {
      this.logger.error(`Expiração das atas não executada: ${e?.message ?? e}`);
    }
  }
}

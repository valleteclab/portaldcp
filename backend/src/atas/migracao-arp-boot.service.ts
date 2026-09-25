import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { migrarSaldoAtas } from './saldo-ata.sql';

/**
 * Executa no BOOT a migração do saldo das atas (E6 — parte ARP): produção roda
 * com `synchronize` ligado e SEM `migrationsRun` (mesmo padrão da E1–E6). O
 * synchronize já criou `ata_consumos` e as colunas novas; a rotina é
 * idempotente (histórico do `utilizarItem` → consumo MIGRACAO; saldo zerado
 * pelo bug do `recalcularValorAta` recalculado). Nenhuma ata é gerada para
 * licitações SRP homologadas antes (use "Gerar ata" — POST
 * /api/resultado/licitacao/:id/instrumentos). Falha é logada e NÃO derruba o
 * boot. Desligar: ARP_MIGRAR_NO_BOOT=false.
 */
@Injectable()
export class MigracaoArpBootService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigracaoArpBootService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.ARP_MIGRAR_NO_BOOT === 'false') return;
    try {
      const r = await this.dataSource.transaction((m) => migrarSaldoAtas(m));
      if (r.consumosMigrados || r.atasRecalculadas) {
        this.logger.log(`Migração do saldo das atas (E6/ARP): ${r.consumosMigrados} consumo(s) migrado(s), ${r.atasRecalculadas} ata(s) recalculada(s)`);
      }
    } catch (e: any) {
      this.logger.error(`Migração do saldo das atas (E6/ARP) não executada: ${e?.message ?? e}`);
    }
  }
}

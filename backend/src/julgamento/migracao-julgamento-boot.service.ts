import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { executarMigracaoDeBoot } from '../common/migracao-boot';
import { houveMudancaJulgamento, migrarJulgamento, resumoMigracaoJulgamento } from './migracao-julgamento';

/**
 * Executa no BOOT a migração de dados do julgamento (E3) — produção roda com
 * `synchronize` ligado e SEM `migrationsRun` (mesmo padrão da E1/E2). O
 * synchronize já criou `licitantes_unidade`/`aceitacoes_proposta` e o valor
 * novo do enum da etapa antes deste hook; a rotina é idempotente (só toca
 * licitações ainda não tratadas pela E3). Falha é logada e NÃO derruba o boot.
 * Desligar: JULGAMENTO_MIGRAR_NO_BOOT=false.
 */
@Injectable()
export class MigracaoJulgamentoBootService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigracaoJulgamentoBootService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  onApplicationBootstrap(): Promise<void> {
    // Fila única: as migrações de boot rodam uma de cada vez (ver common/migracao-boot.ts)
    return executarMigracaoDeBoot(this.dataSource, () => this.executarMigracao());
  }

  private async executarMigracao(): Promise<void> {
    if (process.env.JULGAMENTO_MIGRAR_NO_BOOT === 'false') return;
    try {
      const r = await this.dataSource.transaction((m) => migrarJulgamento(m));
      if (houveMudancaJulgamento(r)) this.logger.log(`Migração do julgamento (E3): ${resumoMigracaoJulgamento(r)}`);
    } catch (e: any) {
      this.logger.error(`Migração do julgamento (E3) não executada: ${e?.message ?? e}`);
    }
  }
}

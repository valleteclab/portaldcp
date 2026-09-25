import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { executarMigracaoDeBoot } from '../common/migracao-boot';
import { houveMudancaDispensa, migrarDispensaParaMotor, resumoMigracaoDispensa } from './migracao-dispensa';

/**
 * Executa no BOOT a migração da dispensa para o motor único (E2 item 7):
 * `dispensa_lances` → `lances` e `dispensa_mensagens` → chat da sala. Mesmo
 * padrão da E1/E2 (produção com synchronize, sem migrationsRun). Idempotente
 * (linhas novas com o id da legada). Falha é logada e NÃO derruba o boot.
 * Desligar: DISPENSA_MIGRAR_NO_BOOT=false.
 */
@Injectable()
export class MigracaoDispensaBootService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigracaoDispensaBootService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  onApplicationBootstrap(): Promise<void> {
    // Fila única: as migrações de boot rodam uma de cada vez (ver common/migracao-boot.ts)
    return executarMigracaoDeBoot(this.dataSource, () => this.executarMigracao());
  }

  private async executarMigracao(): Promise<void> {
    if (process.env.DISPENSA_MIGRAR_NO_BOOT === 'false') return;
    try {
      const r = await this.dataSource.transaction((m) => migrarDispensaParaMotor(m));
      if (houveMudancaDispensa(r)) this.logger.log(`Migração da dispensa para o motor único (E2): ${resumoMigracaoDispensa(r)}`);
      if (r.lancesOrfaos > 0 || r.mensagensOrfas > 0) {
        this.logger.warn(
          `Dispensa → motor (E2): ${r.lancesOrfaos} lance(s) e ${r.mensagensOrfas} mensagem(ns) legados sem item/licitação/sala — não migrados (tabelas legadas preservadas)`,
        );
      }
    } catch (e: any) {
      this.logger.error(`Migração da dispensa para o motor único (E2) não executada: ${e?.message ?? e}`);
    }
  }
}

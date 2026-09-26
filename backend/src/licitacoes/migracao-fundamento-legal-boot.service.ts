import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { executarMigracaoDeBoot } from '../common/migracao-boot';
import { migrarFundamentoLegal } from './migracao-fundamento-legal';

/**
 * Fase interna — Entrega 1: preenche o FUNDAMENTO LEGAL (fonte única) dos
 * processos existentes no BOOT (produção com `synchronize`, sem migrationsRun).
 * Idempotente (só linhas com o campo NULL); falha é logada e NÃO derruba o boot.
 * Desligar: FUNDAMENTO_LEGAL_MIGRAR_NO_BOOT=false.
 */
@Injectable()
export class MigracaoFundamentoLegalBootService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigracaoFundamentoLegalBootService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  onApplicationBootstrap(): Promise<void> {
    // Fila única: as migrações de boot rodam uma de cada vez (ver common/migracao-boot.ts)
    return executarMigracaoDeBoot(this.dataSource, () => this.executarMigracao());
  }

  async executarMigracao(): Promise<void> {
    if (process.env.FUNDAMENTO_LEGAL_MIGRAR_NO_BOOT === 'false') return;
    try {
      const r = await this.dataSource.transaction((m) => migrarFundamentoLegal(m));
      if (r.preenchidas) {
        this.logger.log(`Fundamento legal preenchido em ${r.preenchidas} processo(s) (${r.doTexto} lido(s) das peças/contratos; demais pelo padrão da modalidade)`);
      }
    } catch (e: unknown) {
      this.logger.error(`Migração do fundamento legal não executada: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

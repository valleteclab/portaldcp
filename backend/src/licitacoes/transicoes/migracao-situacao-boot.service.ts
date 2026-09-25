import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { migrarSituacaoLegada } from './migracao-situacao';

/**
 * Executa no BOOT a migração de dados da situação (E1) — produção roda com
 * `synchronize` ligado e SEM `migrationsRun`, então a migration TypeORM
 * (src/migrations/20260924000001-SituacaoLicitacao.ts) não roda sozinha lá.
 *
 * Seguro e barato: o synchronize já criou `situacao`/`fase_anterior`/
 * `licitacao_transicoes` antes deste hook; a rotina só toca linhas com fase
 * legada (SUSPENSO, REVOGADO...) — depois da 1ª execução não sobra nenhuma e
 * o custo é um SELECT vazio. Falha é logada e NÃO derruba o boot.
 * Desligar: LICITACAO_MIGRAR_SITUACAO_NO_BOOT=false.
 */
@Injectable()
export class MigracaoSituacaoBootService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigracaoSituacaoBootService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.LICITACAO_MIGRAR_SITUACAO_NO_BOOT === 'false') return;
    try {
      const r = await this.dataSource.transaction((m) => migrarSituacaoLegada(m));
      if (r.migradas > 0) {
        this.logger.log(
          `Migração da situação (E1): ${r.migradas} licitação(ões) migrada(s) — ` +
            r.detalhes.map((d) => `${d.id}: ${d.de} → ${d.situacao}/${d.fase} (${d.regra})`).join('; '),
        );
      }
    } catch (e: any) {
      this.logger.error(`Migração da situação (E1) não executada: ${e?.message ?? e}`);
    }
  }
}

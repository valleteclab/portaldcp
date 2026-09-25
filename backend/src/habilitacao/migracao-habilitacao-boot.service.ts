import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { HabilitacaoService } from './habilitacao.service';
import { houveMudancaHabilitacao, migrarHabilitacao, resumoMigracaoHabilitacao } from './migracao-habilitacao';

/**
 * Migração de dados da habilitação (E4) no BOOT — produção roda com
 * `synchronize` e sem `migrationsRun` (padrão E1–E3). Idempotente; falha é
 * logada e NÃO derruba o boot. Desligar: HABILITACAO_MIGRAR_NO_BOOT=false.
 */
@Injectable()
export class MigracaoHabilitacaoBootService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigracaoHabilitacaoBootService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly habilitacao: HabilitacaoService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.HABILITACAO_MIGRAR_NO_BOOT === 'false') return;
    try {
      const r = await this.dataSource.transaction((m) => migrarHabilitacao(m, (mm, p) => this.habilitacao.criarConvocacaoMigrada(mm, p)));
      if (houveMudancaHabilitacao(r)) this.logger.log(`Migração da habilitação (E4): ${resumoMigracaoHabilitacao(r)}`);
    } catch (e: any) {
      this.logger.error(`Migração da habilitação (E4) não executada: ${e?.message ?? e}`);
    }
  }
}

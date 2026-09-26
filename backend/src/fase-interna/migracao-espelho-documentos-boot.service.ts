import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { executarMigracaoDeBoot } from '../common/migracao-boot';
import { espelharDocumentosLicitacaoExistentes } from './espelho-documentos-licitacao';

/**
 * Fase interna — Entrega 1: anexos de fase interna feitos pela aba Documentos
 * (`documentos_licitacao`) passam a contar como a peça (espelho em
 * `documentos_fase_interna` — ver espelho-documentos-licitacao.ts). Idempotente;
 * falha é logada e NÃO derruba o boot.
 * Desligar: FASE_INTERNA_ESPELHO_DOCUMENTOS_NO_BOOT=false.
 */
@Injectable()
export class MigracaoEspelhoDocumentosBootService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigracaoEspelhoDocumentosBootService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  onApplicationBootstrap(): Promise<void> {
    // Fila única: as migrações de boot rodam uma de cada vez (ver common/migracao-boot.ts)
    return executarMigracaoDeBoot(this.dataSource, () => this.executarMigracao());
  }

  async executarMigracao(): Promise<void> {
    if (process.env.FASE_INTERNA_ESPELHO_DOCUMENTOS_NO_BOOT === 'false') return;
    try {
      const r = await this.dataSource.transaction((m) => espelharDocumentosLicitacaoExistentes(m));
      if (r.espelhados) this.logger.log(`Fase interna: ${r.espelhados} anexo(s) da aba Documentos passaram a contar como peça`);
    } catch (e: unknown) {
      this.logger.error(`Espelho dos anexos da fase interna não executado: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

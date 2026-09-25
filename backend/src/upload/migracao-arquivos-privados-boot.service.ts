import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { diretorioPrivado } from '../common/arquivos/arquivos';
import { houveMudancaArquivos, migrarArquivosPrivados, resumoMigracaoArquivos } from './migracao-arquivos-privados';

/**
 * Executa no BOOT a migração dos arquivos do registro cadastral para o
 * diretório privado — produção roda com `synchronize` ligado e SEM
 * `migrationsRun` (o synchronize já criou `arquivos_upload`). Idempotente;
 * falha é logada e NÃO derruba o boot.
 * Desligar: ARQUIVOS_MIGRAR_NO_BOOT=false.
 */
@Injectable()
export class MigracaoArquivosPrivadosBootService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigracaoArquivosPrivadosBootService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.ARQUIVOS_MIGRAR_NO_BOOT === 'false') return;
    if (!process.env.UPLOAD_PRIVATE_DIR && !process.env.UPLOAD_DIR && process.env.NODE_ENV === 'production') {
      this.logger.warn(`UPLOAD_PRIVATE_DIR/UPLOAD_DIR não definidos em produção — privado em ${diretorioPrivado()} (confirme que é volume persistente).`);
    }
    try {
      const r = await migrarArquivosPrivados(this.dataSource);
      if (houveMudancaArquivos(r)) this.logger.log(`Arquivos privados: ${resumoMigracaoArquivos(r)}`);
    } catch (e: any) {
      this.logger.error(`Migração dos arquivos privados não executada: ${e?.message ?? e}`);
    }
  }
}

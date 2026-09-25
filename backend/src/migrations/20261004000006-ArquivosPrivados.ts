import { MigrationInterface, QueryRunner } from 'typeorm';
import { migrarArquivosPrivados } from '../upload/migracao-arquivos-privados';

/**
 * ARQUIVOS PRIVADOS — `arquivos_upload` (dono de cada arquivo do upload
 * genérico) + migração dos documentos do registro cadastral do fornecedor
 * para o diretório privado (UPLOAD_PRIVATE_DIR). IDEMPOTENTE.
 *
 * Produção com synchronize ligado: o synchronize cria a tabela e o boot
 * (MigracaoArquivosPrivadosBootService) move os arquivos — esta migration
 * existe para quando o synchronize for desligado.
 */
export class ArquivosPrivados20261004000006 implements MigrationInterface {
  name = 'ArquivosPrivados20261004000006';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS arquivos_upload (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        caminho varchar(512) NOT NULL,
        tipo varchar(64) NOT NULL,
        privado boolean NOT NULL DEFAULT true,
        nome_original varchar(255),
        enviado_por_tipo varchar(20),
        enviado_por_id varchar(64),
        orgao_id uuid,
        fornecedor_id uuid,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_arquivos_upload_caminho" ON arquivos_upload (caminho)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_arquivos_upload_orgao" ON arquivos_upload (orgao_id)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_arquivos_upload_fornecedor" ON arquivos_upload (fornecedor_id)`);
    await migrarArquivosPrivados(q);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Os arquivos movidos continuam legíveis (o resolvedor lê o privado); só a tabela sai.
    await q.query(`DROP TABLE IF EXISTS arquivos_upload`);
  }
}

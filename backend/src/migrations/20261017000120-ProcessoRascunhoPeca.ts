import { MigrationInterface, QueryRunner } from 'typeorm';

/** "Salvar rascunho" do ofício: o texto em elaboração fica no processo até ser assinado. */
export class ProcessoRascunhoPeca1761300012000 implements MigrationInterface {
  name = 'ProcessoRascunhoPeca1761300012000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "processos" ADD COLUMN IF NOT EXISTS "rascunho_peca" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "processos" DROP COLUMN IF EXISTS "rascunho_peca"`);
  }
}

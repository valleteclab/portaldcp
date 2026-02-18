import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsuarioTelefoneNotificacao1768400003000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notificacoes" ADD COLUMN IF NOT EXISTS "usuario_telefone" varchar`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notificacoes" DROP COLUMN IF EXISTS "usuario_telefone"`);
  }
}

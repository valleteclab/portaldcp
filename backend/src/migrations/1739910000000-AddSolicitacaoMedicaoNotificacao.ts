import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSolicitacaoMedicaoNotificacao1739910000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const val = 'SOLICITACAO_MEDICAO';
    const exists = await queryRunner.query(
      `SELECT 1 FROM pg_enum WHERE enumlabel = $1 AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notificacoes_tipo_enum')`,
      [val],
    );
    if (!exists || exists.length === 0) {
      await queryRunner.query(
        `ALTER TYPE "notificacoes_tipo_enum" ADD VALUE IF NOT EXISTS '${val}'`,
      );
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL não permite remover valor de enum de forma simples
  }
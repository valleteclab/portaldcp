import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMedicaoNotificacaoTypes1739836800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Adicionar novos valores ao enum de tipo de notificação
    const newValues = [
      'MEDICAO_SUBMETIDA',
      'MEDICAO_ATESTADA',
      'MEDICAO_PARCIALMENTE_ATESTADA',
      'MEDICAO_APROVADA',
      'MEDICAO_REJEITADA',
      'MEDICAO_DEVOLVIDA',
    ];

    for (const val of newValues) {
      // Verifica se o valor já existe antes de adicionar (idempotente)
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Não é possível remover valores de um enum no PostgreSQL de forma simples
    // A reversão exigiria recriação do tipo enum, o que é destrutivo.
  }
}

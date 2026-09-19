import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConciliacaoPagamentos20260919000001
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS conciliacoes_pagamento (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      contrato_id uuid NOT NULL,
      orgao_id uuid NOT NULL,
      medicao_id uuid NOT NULL,
      pagamento_chave varchar(64) NOT NULL,
      pagamento jsonb NOT NULL,
      valor numeric(15,2) NOT NULL,
      justificativa text NOT NULL,
      usuario_id varchar NOT NULL,
      usuario_nome varchar NOT NULL,
      criado_em timestamp NOT NULL DEFAULT now(),
      cancelado_em timestamp NULL,
      cancelado_por varchar NULL,
      motivo_cancelamento text NULL
    )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_conciliacao_pagamento_contrato" ON conciliacoes_pagamento (contrato_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_conciliacao_pagamento_origem" ON conciliacoes_pagamento (orgao_id, pagamento_chave)`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS conciliacoes_pagamento');
  }
}

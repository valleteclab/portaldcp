import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Patrimônio: campos opcionais do cadastro legado do bem — tipo de aquisição,
 * licitação/contrato de origem, pagamento, nº da despesa na contabilidade,
 * parâmetros de depreciação por bem (conta, vida útil, residual), corresponsável,
 * garantia e seguro. Todos nulos por padrão; nada muda para bens já cadastrados.
 */
export class PatrimonioCamposLegado20260915000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bens_patrimoniais"
        ADD COLUMN IF NOT EXISTS "tipo_aquisicao" varchar(20),
        ADD COLUMN IF NOT EXISTS "licitacao_id" uuid,
        ADD COLUMN IF NOT EXISTS "contrato_id" uuid,
        ADD COLUMN IF NOT EXISTS "processo_pagamento" varchar,
        ADD COLUMN IF NOT EXISTS "data_pagamento" date,
        ADD COLUMN IF NOT EXISTS "referencia_contabil" varchar,
        ADD COLUMN IF NOT EXISTS "conta_contabil" varchar,
        ADD COLUMN IF NOT EXISTS "vida_util_anos" integer,
        ADD COLUMN IF NOT EXISTS "valor_residual_pct" numeric(5,2),
        ADD COLUMN IF NOT EXISTS "corresponsavel_nome" varchar,
        ADD COLUMN IF NOT EXISTS "garantia_ate" date,
        ADD COLUMN IF NOT EXISTS "seguro_seguradora" varchar,
        ADD COLUMN IF NOT EXISTS "seguro_apolice" varchar,
        ADD COLUMN IF NOT EXISTS "seguro_vigencia_inicio" date,
        ADD COLUMN IF NOT EXISTS "seguro_vigencia_fim" date,
        ADD COLUMN IF NOT EXISTS "seguro_valor" numeric(15,2)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bens_patrimoniais"
        DROP COLUMN IF EXISTS "tipo_aquisicao",
        DROP COLUMN IF EXISTS "licitacao_id",
        DROP COLUMN IF EXISTS "contrato_id",
        DROP COLUMN IF EXISTS "processo_pagamento",
        DROP COLUMN IF EXISTS "data_pagamento",
        DROP COLUMN IF EXISTS "referencia_contabil",
        DROP COLUMN IF EXISTS "conta_contabil",
        DROP COLUMN IF EXISTS "vida_util_anos",
        DROP COLUMN IF EXISTS "valor_residual_pct",
        DROP COLUMN IF EXISTS "corresponsavel_nome",
        DROP COLUMN IF EXISTS "garantia_ate",
        DROP COLUMN IF EXISTS "seguro_seguradora",
        DROP COLUMN IF EXISTS "seguro_apolice",
        DROP COLUMN IF EXISTS "seguro_vigencia_inicio",
        DROP COLUMN IF EXISTS "seguro_vigencia_fim",
        DROP COLUMN IF EXISTS "seguro_valor"
    `);
  }
}

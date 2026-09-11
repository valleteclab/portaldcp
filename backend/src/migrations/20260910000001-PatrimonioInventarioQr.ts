import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Patrimônio: base para conferência automatizada (QR code agora, RFID depois).
 * - bens: setor do cadastro, EPC, dados de aquisição, foto, última conferência;
 * - campanhas de inventário, setores da campanha (link por token) e leituras.
 */
export class PatrimonioInventarioQr20260910000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bens_patrimoniais"
        ADD COLUMN IF NOT EXISTS "epc" varchar(64),
        ADD COLUMN IF NOT EXISTS "setor_id" uuid,
        ADD COLUMN IF NOT EXISTS "marca" varchar,
        ADD COLUMN IF NOT EXISTS "modelo" varchar,
        ADD COLUMN IF NOT EXISTS "numero_serie" varchar,
        ADD COLUMN IF NOT EXISTS "valor_aquisicao" numeric(15,2),
        ADD COLUMN IF NOT EXISTS "data_aquisicao" date,
        ADD COLUMN IF NOT EXISTS "nota_fiscal_numero" varchar,
        ADD COLUMN IF NOT EXISTS "fornecedor_nome" varchar,
        ADD COLUMN IF NOT EXISTS "foto_url" varchar,
        ADD COLUMN IF NOT EXISTS "ultima_conferencia_em" timestamp
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_bens_patrimoniais_setor') THEN
          ALTER TABLE "bens_patrimoniais"
            ADD CONSTRAINT "FK_bens_patrimoniais_setor" FOREIGN KEY ("setor_id") REFERENCES "setores"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_bens_orgao_plaqueta" ON "bens_patrimoniais" ("orgao_id", "plaqueta")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_bens_orgao_epc" ON "bens_patrimoniais" ("orgao_id", "epc")`);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'patrimonio_inventarios_status_enum') THEN
          CREATE TYPE "patrimonio_inventarios_status_enum" AS ENUM ('ABERTO', 'FECHADO');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'patrimonio_inventario_setores_status_enum') THEN
          CREATE TYPE "patrimonio_inventario_setores_status_enum" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'FECHADO');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'patrimonio_inventario_leituras_origem_enum') THEN
          CREATE TYPE "patrimonio_inventario_leituras_origem_enum" AS ENUM ('QR', 'RFID', 'MANUAL');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'patrimonio_inventario_leituras_situacao_enum') THEN
          CREATE TYPE "patrimonio_inventario_leituras_situacao_enum" AS ENUM ('ENCONTRADO', 'OUTRO_SETOR', 'DESCONHECIDO', 'SEM_PLAQUETA', 'BAIXADO_PRESENTE');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "patrimonio_inventarios" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "orgao_id" uuid NOT NULL,
        "nome" varchar NOT NULL,
        "ano" integer NOT NULL,
        "status" "patrimonio_inventarios_status_enum" NOT NULL DEFAULT 'ABERTO',
        "comissao" text,
        "observacoes" text,
        "aberto_por" varchar,
        "fechado_por" varchar,
        "fechado_em" timestamp,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_patrimonio_inventarios" PRIMARY KEY ("id"),
        CONSTRAINT "FK_patrimonio_inventarios_orgao" FOREIGN KEY ("orgao_id") REFERENCES "orgaos"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pat_inventarios_orgao" ON "patrimonio_inventarios" ("orgao_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "patrimonio_inventario_setores" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "inventario_id" uuid NOT NULL,
        "orgao_id" uuid NOT NULL,
        "setor_id" uuid,
        "setor_nome" varchar NOT NULL,
        "responsavel_nome" varchar,
        "responsavel_telefone" varchar,
        "token_acesso" varchar(64) NOT NULL,
        "status" "patrimonio_inventario_setores_status_enum" NOT NULL DEFAULT 'PENDENTE',
        "link_enviado_em" timestamp,
        "iniciado_em" timestamp,
        "fechado_em" timestamp,
        "fechado_por" varchar,
        "observacoes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_patrimonio_inventario_setores" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pat_inv_setores_inventario" FOREIGN KEY ("inventario_id") REFERENCES "patrimonio_inventarios"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_pat_inv_setores_setor" FOREIGN KEY ("setor_id") REFERENCES "setores"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_pat_inv_setores_token" ON "patrimonio_inventario_setores" ("token_acesso")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pat_inv_setores_inventario" ON "patrimonio_inventario_setores" ("inventario_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "patrimonio_inventario_leituras" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "inventario_id" uuid NOT NULL,
        "inventario_setor_id" uuid NOT NULL,
        "orgao_id" uuid NOT NULL,
        "bem_id" uuid,
        "codigo_lido" varchar NOT NULL,
        "origem" "patrimonio_inventario_leituras_origem_enum" NOT NULL DEFAULT 'QR',
        "situacao" "patrimonio_inventario_leituras_situacao_enum" NOT NULL,
        "setor_cadastro_nome" varchar,
        "estado_conservacao" "estado_conservacao_enum",
        "observacao" text,
        "foto_url" varchar,
        "lido_por" varchar,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_patrimonio_inventario_leituras" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pat_inv_leituras_setor" FOREIGN KEY ("inventario_setor_id") REFERENCES "patrimonio_inventario_setores"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_pat_inv_leituras_bem" FOREIGN KEY ("bem_id") REFERENCES "bens_patrimoniais"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pat_inv_leituras_setor" ON "patrimonio_inventario_leituras" ("inventario_setor_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pat_inv_leituras_bem" ON "patrimonio_inventario_leituras" ("inventario_id", "bem_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "patrimonio_inventario_leituras"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "patrimonio_inventario_setores"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "patrimonio_inventarios"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "patrimonio_inventario_leituras_situacao_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "patrimonio_inventario_leituras_origem_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "patrimonio_inventario_setores_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "patrimonio_inventarios_status_enum"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bens_orgao_epc"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bens_orgao_plaqueta"`);
    await queryRunner.query(`ALTER TABLE "bens_patrimoniais" DROP CONSTRAINT IF EXISTS "FK_bens_patrimoniais_setor"`);
    await queryRunner.query(`
      ALTER TABLE "bens_patrimoniais"
        DROP COLUMN IF EXISTS "ultima_conferencia_em",
        DROP COLUMN IF EXISTS "foto_url",
        DROP COLUMN IF EXISTS "fornecedor_nome",
        DROP COLUMN IF EXISTS "nota_fiscal_numero",
        DROP COLUMN IF EXISTS "data_aquisicao",
        DROP COLUMN IF EXISTS "valor_aquisicao",
        DROP COLUMN IF EXISTS "numero_serie",
        DROP COLUMN IF EXISTS "modelo",
        DROP COLUMN IF EXISTS "marca",
        DROP COLUMN IF EXISTS "setor_id",
        DROP COLUMN IF EXISTS "epc"
    `);
  }
}

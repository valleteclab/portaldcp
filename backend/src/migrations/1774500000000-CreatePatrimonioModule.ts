import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePatrimonioModule1774500000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enums
    await queryRunner.query(`
      CREATE TYPE "tipo_bem_enum" AS ENUM ('BEM_PROPRIO', 'BEM_LOCADO', 'BEM_SERVIDOR', 'BEM_COMODATO')
    `);
    await queryRunner.query(`
      CREATE TYPE "estado_conservacao_enum" AS ENUM ('BOM', 'REGULAR', 'RUIM', 'INSERVIVEL')
    `);
    await queryRunner.query(`
      CREATE TYPE "status_bem_enum" AS ENUM ('ATIVO', 'EM_MANUTENCAO', 'BAIXADO', 'DEVOLVIDO')
    `);
    await queryRunner.query(`
      CREATE TYPE "status_manutencao_enum" AS ENUM ('AGUARDANDO_DIAGNOSTICO', 'AGUARDANDO_CONSERTO', 'EM_CONSERTO', 'CONCLUIDO')
    `);

    // Categorias de Bem
    await queryRunner.query(`
      CREATE TABLE "categorias_bem" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "orgao_id" uuid,
        "nome" varchar NOT NULL,
        "sistema" boolean NOT NULL DEFAULT false,
        "ativo" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_categorias_bem" PRIMARY KEY ("id"),
        CONSTRAINT "FK_categorias_bem_orgao" FOREIGN KEY ("orgao_id") REFERENCES "orgaos"("id") ON DELETE SET NULL
      )
    `);

    // Categorias padrão do sistema
    await queryRunner.query(`
      INSERT INTO "categorias_bem" ("nome", "sistema") VALUES
        ('Informática', true),
        ('Móveis', true),
        ('Elétrico', true),
        ('Mat. Elétrico', true),
        ('Veículos', true),
        ('Eletrônico', true)
    `);

    // Bens Patrimoniais
    await queryRunner.query(`
      CREATE TABLE "bens_patrimoniais" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "orgao_id" uuid NOT NULL,
        "plaqueta" varchar,
        "descricao" varchar NOT NULL,
        "categoria_id" uuid,
        "tipo" "tipo_bem_enum" NOT NULL,
        "quantidade" integer NOT NULL DEFAULT 1,
        "estado_conservacao" "estado_conservacao_enum",
        "localizacao_codigo" varchar,
        "localizacao_nome" varchar,
        "responsavel_nome" varchar,
        "responsavel_cargo" varchar,
        "status" "status_bem_enum" NOT NULL DEFAULT 'ATIVO',
        "observacoes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bens_patrimoniais" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bens_patrimoniais_orgao" FOREIGN KEY ("orgao_id") REFERENCES "orgaos"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_bens_patrimoniais_categoria" FOREIGN KEY ("categoria_id") REFERENCES "categorias_bem"("id") ON DELETE SET NULL
      )
    `);

    // Manutenções
    await queryRunner.query(`
      CREATE TABLE "manutencoes_bem" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "bem_id" uuid NOT NULL,
        "orgao_id" uuid NOT NULL,
        "setor" varchar NOT NULL,
        "motivo" varchar NOT NULL,
        "status" "status_manutencao_enum" NOT NULL DEFAULT 'AGUARDANDO_DIAGNOSTICO',
        "data_entrada" date NOT NULL,
        "data_saida" date,
        "data_retorno" date,
        "observacoes" text,
        "registrado_por" varchar,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_manutencoes_bem" PRIMARY KEY ("id"),
        CONSTRAINT "FK_manutencoes_bem_bem" FOREIGN KEY ("bem_id") REFERENCES "bens_patrimoniais"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_manutencoes_bem_orgao" FOREIGN KEY ("orgao_id") REFERENCES "orgaos"("id") ON DELETE CASCADE
      )
    `);

    // Locações
    await queryRunner.query(`
      CREATE TABLE "locacoes_bem" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "bem_id" uuid NOT NULL,
        "orgao_id" uuid NOT NULL,
        "locador" varchar NOT NULL,
        "numero_contrato" varchar,
        "data_inicio" date NOT NULL,
        "data_fim" date,
        "data_entrada" date,
        "data_devolucao" date,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_locacoes_bem" PRIMARY KEY ("id"),
        CONSTRAINT "FK_locacoes_bem_bem" FOREIGN KEY ("bem_id") REFERENCES "bens_patrimoniais"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_locacoes_bem_orgao" FOREIGN KEY ("orgao_id") REFERENCES "orgaos"("id") ON DELETE CASCADE
      )
    `);

    // Servidores
    await queryRunner.query(`
      CREATE TABLE "servidores_bem" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "bem_id" uuid NOT NULL,
        "orgao_id" uuid NOT NULL,
        "proprietario_nome" varchar NOT NULL,
        "proprietario_cargo" varchar,
        "data_entrada" date NOT NULL,
        "data_saida" date,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_servidores_bem" PRIMARY KEY ("id"),
        CONSTRAINT "FK_servidores_bem_bem" FOREIGN KEY ("bem_id") REFERENCES "bens_patrimoniais"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_servidores_bem_orgao" FOREIGN KEY ("orgao_id") REFERENCES "orgaos"("id") ON DELETE CASCADE
      )
    `);

    // Comodatos
    await queryRunner.query(`
      CREATE TABLE "comodatos_bem" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "bem_id" uuid NOT NULL,
        "orgao_id" uuid NOT NULL,
        "comodante" varchar NOT NULL,
        "numero_termo" varchar,
        "data_inicio" date NOT NULL,
        "data_fim" date,
        "data_entrada" date,
        "data_devolucao" date,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_comodatos_bem" PRIMARY KEY ("id"),
        CONSTRAINT "FK_comodatos_bem_bem" FOREIGN KEY ("bem_id") REFERENCES "bens_patrimoniais"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_comodatos_bem_orgao" FOREIGN KEY ("orgao_id") REFERENCES "orgaos"("id") ON DELETE CASCADE
      )
    `);

    // Histórico
    await queryRunner.query(`
      CREATE TABLE "historicos_bem" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "bem_id" uuid NOT NULL,
        "orgao_id" uuid NOT NULL,
        "acao" varchar NOT NULL,
        "descricao" text NOT NULL,
        "usuario_nome" varchar NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_historicos_bem" PRIMARY KEY ("id"),
        CONSTRAINT "FK_historicos_bem_bem" FOREIGN KEY ("bem_id") REFERENCES "bens_patrimoniais"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_historicos_bem_orgao" FOREIGN KEY ("orgao_id") REFERENCES "orgaos"("id") ON DELETE CASCADE
      )
    `);

    // Permissão no usuário
    await queryRunner.query(`
      ALTER TABLE "usuarios"
      ADD COLUMN IF NOT EXISTS "pode_gerenciar_patrimonio" boolean NOT NULL DEFAULT false
    `);

    // Índices
    await queryRunner.query(`CREATE INDEX "IDX_bens_patrimoniais_orgao" ON "bens_patrimoniais" ("orgao_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_bens_patrimoniais_tipo" ON "bens_patrimoniais" ("tipo")`);
    await queryRunner.query(`CREATE INDEX "IDX_bens_patrimoniais_status" ON "bens_patrimoniais" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_manutencoes_bem_status" ON "manutencoes_bem" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_historicos_bem_bem" ON "historicos_bem" ("bem_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "historicos_bem"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "comodatos_bem"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "servidores_bem"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "locacoes_bem"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "manutencoes_bem"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bens_patrimoniais"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "categorias_bem"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "status_manutencao_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "status_bem_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "estado_conservacao_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tipo_bem_enum"`);
    await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "pode_gerenciar_patrimonio"`);
  }
}

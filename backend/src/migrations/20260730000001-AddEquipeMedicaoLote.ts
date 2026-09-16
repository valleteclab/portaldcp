import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEquipeMedicaoLote20260730000001
  implements MigrationInterface
{
  name = 'AddEquipeMedicaoLote20260730000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "medicoes_equipe" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "medicao_id" uuid NOT NULL,
        "empresa_nome" varchar(255) NOT NULL,
        "empresa_cnpj" varchar(20),
        "fechamento_fatura" varchar(255) NOT NULL,
        "competencia" varchar(30) NOT NULL,
        "periodo_inicio" date NOT NULL,
        "periodo_fim" date NOT NULL,
        "data_emissao" date,
        "responsavel_legal" varchar(255),
        "percentual_iss" decimal(7,4) NOT NULL DEFAULT 2.5,
        "percentual_ir" decimal(7,4) NOT NULL DEFAULT 4.8,
        "retencao_inss" decimal(15,2) NOT NULL DEFAULT 0,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_medicoes_equipe" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_medicoes_equipe_medicao" UNIQUE ("medicao_id"),
        CONSTRAINT "FK_medicoes_equipe_medicao" FOREIGN KEY ("medicao_id")
          REFERENCES "medicoes"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "medicoes_equipe_funcionarios" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "equipe_id" uuid NOT NULL,
        "item_cronograma_id" uuid NOT NULL,
        "posto_numero" integer,
        "nome" varchar(255) NOT NULL,
        "cargo_funcao" varchar(255) NOT NULL,
        "inicio_prestacao_servicos" date,
        "lotacao" varchar(255) NOT NULL DEFAULT 'RADIO E TV CAMARA',
        "situacao" varchar(30) NOT NULL DEFAULT 'ATIVO',
        "carga_horaria_semanal" decimal(8,2) NOT NULL DEFAULT 30,
        "dias_trabalhados" decimal(8,2) NOT NULL,
        "salario_base" decimal(15,2) NOT NULL DEFAULT 0,
        "salario_proporcional" decimal(15,2) NOT NULL DEFAULT 0,
        "acumulo_funcao" decimal(15,2) NOT NULL DEFAULT 0,
        "salario_total" decimal(15,2) NOT NULL DEFAULT 0,
        "encargos" decimal(15,2) NOT NULL DEFAULT 0,
        "indenizacao" decimal(15,2) NOT NULL DEFAULT 0,
        "ausencias_legais" decimal(15,2) NOT NULL DEFAULT 0,
        "aso_farda" decimal(15,2) NOT NULL DEFAULT 0,
        "vale_transporte" decimal(15,2) NOT NULL DEFAULT 0,
        "vale_alimentacao" decimal(15,2) NOT NULL DEFAULT 0,
        "taxa_administracao_lucro" decimal(15,2) NOT NULL DEFAULT 0,
        "tributos" decimal(15,2) NOT NULL DEFAULT 0,
        "valor_total" decimal(15,2) NOT NULL,
        "observacoes" text,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_medicoes_equipe_funcionarios" PRIMARY KEY ("id"),
        CONSTRAINT "FK_medicoes_equipe_funcionarios_equipe" FOREIGN KEY ("equipe_id")
          REFERENCES "medicoes_equipe"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_medicoes_equipe_funcionarios_item" FOREIGN KEY ("item_cronograma_id")
          REFERENCES "itens_cronograma"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_medicoes_equipe_funcionarios_item"
      ON "medicoes_equipe_funcionarios" ("item_cronograma_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "medicoes_equipe_funcionarios"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "medicoes_equipe"`);
  }
}

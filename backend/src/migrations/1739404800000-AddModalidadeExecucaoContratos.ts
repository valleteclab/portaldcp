import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddModalidadeExecucaoContratos1739404800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Criar enum de modalidade de execução
    await queryRunner.query(`
      CREATE TYPE "modalidade_execucao_enum" AS ENUM (
        'ITEM_QUANTIDADE',
        'MEDICAO',
        'CONTINUADO',
        'LICENCA',
        'ORDEM_SERVICO'
      )
    `);

    // 2. Adicionar coluna ao contrato (default ITEM_QUANTIDADE para contratos existentes)
    await queryRunner.query(`
      ALTER TABLE "contratos" 
      ADD COLUMN "modalidade_execucao" "modalidade_execucao_enum" NOT NULL DEFAULT 'ITEM_QUANTIDADE'
    `);

    // =========================================================================
    // TABELAS PARA MEDIÇÃO (Obras/Engenharia)
    // =========================================================================

    // 3. Etapas do Cronograma Físico-Financeiro
    await queryRunner.query(`
      CREATE TYPE "status_etapa_cronograma_enum" AS ENUM (
        'PENDENTE', 'EM_EXECUCAO', 'MEDIDA_PARCIAL', 'CONCLUIDA'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "etapas_cronograma" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "contrato_id" uuid NOT NULL,
        "numero_etapa" integer NOT NULL,
        "descricao" varchar NOT NULL,
        "descricao_detalhada" text,
        "percentual_fisico" decimal(5,2) NOT NULL,
        "valor_previsto" decimal(15,2) NOT NULL,
        "data_inicio_prevista" date NOT NULL,
        "data_fim_prevista" date NOT NULL,
        "data_inicio_real" date,
        "data_fim_real" date,
        "percentual_executado" decimal(5,2) NOT NULL DEFAULT 0,
        "valor_executado" decimal(15,2) NOT NULL DEFAULT 0,
        "status" "status_etapa_cronograma_enum" NOT NULL DEFAULT 'PENDENTE',
        "observacoes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_etapas_cronograma" PRIMARY KEY ("id"),
        CONSTRAINT "FK_etapas_cronograma_contrato" FOREIGN KEY ("contrato_id") 
          REFERENCES "contratos"("id") ON DELETE CASCADE
      )
    `);

    // 4. Medições (Boletim de Medição)
    await queryRunner.query(`
      CREATE TYPE "status_medicao_enum" AS ENUM (
        'RASCUNHO', 'AGUARDANDO_APROVACAO', 'APROVADA', 'REJEITADA'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "medicoes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "contrato_id" uuid NOT NULL,
        "numero_medicao" integer NOT NULL,
        "periodo_inicio" date NOT NULL,
        "periodo_fim" date NOT NULL,
        "valor_medido" decimal(15,2) NOT NULL,
        "valor_acumulado_anterior" decimal(15,2) NOT NULL DEFAULT 0,
        "valor_acumulado_atual" decimal(15,2) NOT NULL,
        "percentual_fisico_medido" decimal(5,2) NOT NULL,
        "percentual_fisico_acumulado" decimal(5,2) NOT NULL DEFAULT 0,
        "fiscal_id" varchar,
        "fiscal_nome" varchar,
        "data_medicao" date,
        "aprovador_id" varchar,
        "aprovador_nome" varchar,
        "data_aprovacao" date,
        "observacao_aprovador" text,
        "status" "status_medicao_enum" NOT NULL DEFAULT 'RASCUNHO',
        "observacoes" text,
        "fotos" text,
        "documentos" text,
        "usuario_cadastro_id" varchar,
        "usuario_cadastro_nome" varchar,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_medicoes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_medicoes_contrato" FOREIGN KEY ("contrato_id") 
          REFERENCES "contratos"("id") ON DELETE CASCADE
      )
    `);

    // 5. Itens de Medição (vincula medição às etapas)
    await queryRunner.query(`
      CREATE TABLE "itens_medicao" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "medicao_id" uuid NOT NULL,
        "etapa_id" uuid NOT NULL,
        "percentual_executado_anterior" decimal(5,2) NOT NULL,
        "percentual_executado_atual" decimal(5,2) NOT NULL,
        "percentual_executado_acumulado" decimal(5,2) NOT NULL,
        "valor_medido" decimal(15,2) NOT NULL,
        "observacoes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_itens_medicao" PRIMARY KEY ("id"),
        CONSTRAINT "FK_itens_medicao_medicao" FOREIGN KEY ("medicao_id") 
          REFERENCES "medicoes"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_itens_medicao_etapa" FOREIGN KEY ("etapa_id") 
          REFERENCES "etapas_cronograma"("id") ON DELETE CASCADE
      )
    `);

    // =========================================================================
    // TABELA PARA SERVIÇOS CONTINUADOS
    // =========================================================================

    // 6. Atestações Mensais
    await queryRunner.query(`
      CREATE TYPE "status_atestacao_enum" AS ENUM (
        'PENDENTE', 'ATESTADA', 'ATESTADA_COM_GLOSA', 'REJEITADA'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "atestacoes_mensais" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "contrato_id" uuid NOT NULL,
        "mes_referencia" varchar(7) NOT NULL,
        "ano" integer NOT NULL,
        "mes" integer NOT NULL,
        "valor_mensal_contratado" decimal(15,2) NOT NULL,
        "valor_atestado" decimal(15,2),
        "valor_glosa" decimal(15,2) NOT NULL DEFAULT 0,
        "valor_liquido" decimal(15,2),
        "nota_imr" decimal(5,2),
        "criterios_imr" jsonb,
        "fiscal_id" varchar,
        "fiscal_nome" varchar,
        "data_atestacao" date,
        "status" "status_atestacao_enum" NOT NULL DEFAULT 'PENDENTE',
        "observacoes" text,
        "justificativa_glosa" text,
        "documentos" text,
        "usuario_cadastro_id" varchar,
        "usuario_cadastro_nome" varchar,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_atestacoes_mensais" PRIMARY KEY ("id"),
        CONSTRAINT "FK_atestacoes_mensais_contrato" FOREIGN KEY ("contrato_id") 
          REFERENCES "contratos"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_atestacao_contrato_mes" UNIQUE ("contrato_id", "mes_referencia")
      )
    `);

    // =========================================================================
    // TABELA PARA LICENÇAS (Software/SaaS)
    // =========================================================================

    // 7. Controle de Licenças
    await queryRunner.query(`
      CREATE TYPE "tipo_licenca_enum" AS ENUM (
        'USUARIO', 'DISPOSITIVO', 'SITE', 'VOLUME', 'ASSINATURA'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "status_licenca_enum" AS ENUM (
        'ATIVA', 'SUSPENSA', 'EXPIRADA', 'CANCELADA'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "periodicidade_renovacao_enum" AS ENUM (
        'MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'UNICO'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "licencas_controle" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "contrato_id" uuid NOT NULL,
        "descricao" varchar NOT NULL,
        "descricao_detalhada" text,
        "tipo_licenca" "tipo_licenca_enum" NOT NULL DEFAULT 'USUARIO',
        "quantidade_contratada" integer NOT NULL,
        "quantidade_ativa" integer NOT NULL DEFAULT 0,
        "valor_unitario" decimal(15,2) NOT NULL,
        "valor_total_contratado" decimal(15,2) NOT NULL,
        "periodicidade_renovacao" "periodicidade_renovacao_enum" NOT NULL DEFAULT 'ANUAL',
        "data_ativacao" date NOT NULL,
        "data_expiracao" date NOT NULL,
        "data_proxima_renovacao" date,
        "chave_licenca" text,
        "fornecedor_contato" varchar,
        "url_painel_admin" varchar,
        "status" "status_licenca_enum" NOT NULL DEFAULT 'ATIVA',
        "observacoes" text,
        "usuario_cadastro_id" varchar,
        "usuario_cadastro_nome" varchar,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_licencas_controle" PRIMARY KEY ("id"),
        CONSTRAINT "FK_licencas_controle_contrato" FOREIGN KEY ("contrato_id") 
          REFERENCES "contratos"("id") ON DELETE CASCADE
      )
    `);

    // =========================================================================
    // TABELAS PARA ORDEM DE SERVIÇO (Demanda)
    // =========================================================================

    // 8. Ordens de Serviço
    await queryRunner.query(`
      CREATE TYPE "metrica_os_enum" AS ENUM (
        'UST', 'HORA', 'PONTO_FUNCAO', 'DEMANDA_FIXA', 'UNIDADE'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "status_ordem_servico_enum" AS ENUM (
        'ABERTA', 'EM_EXECUCAO', 'ENTREGUE', 'EM_ACEITE', 'ACEITA', 'REJEITADA', 'CANCELADA'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "ordens_servico_contrato" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "contrato_id" uuid NOT NULL,
        "numero_os" varchar NOT NULL,
        "sequencial" integer NOT NULL,
        "descricao" varchar NOT NULL,
        "escopo_detalhado" text,
        "metrica" "metrica_os_enum" NOT NULL DEFAULT 'UST',
        "quantidade_metrica" decimal(15,2) NOT NULL,
        "valor_unitario_metrica" decimal(15,4) NOT NULL,
        "valor_total" decimal(15,2) NOT NULL,
        "data_abertura" date NOT NULL,
        "data_prazo" date NOT NULL,
        "data_entrega" date,
        "data_aceite" date,
        "responsavel_tecnico" varchar,
        "fiscal_id" varchar,
        "fiscal_nome" varchar,
        "nota_qualidade" decimal(5,2),
        "criterios_aceite" text,
        "parecer_aceite" text,
        "sla_dias" integer,
        "sla_excedido" boolean NOT NULL DEFAULT false,
        "status" "status_ordem_servico_enum" NOT NULL DEFAULT 'ABERTA',
        "observacoes" text,
        "documentos" text,
        "usuario_cadastro_id" varchar,
        "usuario_cadastro_nome" varchar,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ordens_servico_contrato" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ordens_servico_contrato_contrato" FOREIGN KEY ("contrato_id") 
          REFERENCES "contratos"("id") ON DELETE CASCADE
      )
    `);

    // 9. Banco de Métricas
    await queryRunner.query(`
      CREATE TABLE "banco_metricas" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "contrato_id" uuid NOT NULL,
        "metrica" "metrica_os_enum" NOT NULL,
        "descricao" varchar,
        "quantidade_total" decimal(15,2) NOT NULL,
        "quantidade_consumida" decimal(15,2) NOT NULL DEFAULT 0,
        "quantidade_reservada" decimal(15,2) NOT NULL DEFAULT 0,
        "saldo" decimal(15,2) NOT NULL,
        "valor_unitario" decimal(15,4) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_banco_metricas" PRIMARY KEY ("id"),
        CONSTRAINT "FK_banco_metricas_contrato" FOREIGN KEY ("contrato_id") 
          REFERENCES "contratos"("id") ON DELETE CASCADE
      )
    `);

    // =========================================================================
    // ÍNDICES
    // =========================================================================

    await queryRunner.query(`CREATE INDEX "IDX_etapas_cronograma_contrato" ON "etapas_cronograma" ("contrato_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_medicoes_contrato" ON "medicoes" ("contrato_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_itens_medicao_medicao" ON "itens_medicao" ("medicao_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_atestacoes_mensais_contrato" ON "atestacoes_mensais" ("contrato_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_licencas_controle_contrato" ON "licencas_controle" ("contrato_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_ordens_servico_contrato_contrato" ON "ordens_servico_contrato" ("contrato_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_banco_metricas_contrato" ON "banco_metricas" ("contrato_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_contratos_modalidade" ON "contratos" ("modalidade_execucao")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop índices
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_contratos_modalidade"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_banco_metricas_contrato"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ordens_servico_contrato_contrato"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_licencas_controle_contrato"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_atestacoes_mensais_contrato"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_itens_medicao_medicao"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_medicoes_contrato"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_etapas_cronograma_contrato"`);

    // Drop tabelas
    await queryRunner.query(`DROP TABLE IF EXISTS "banco_metricas"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ordens_servico_contrato"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "licencas_controle"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "atestacoes_mensais"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "itens_medicao"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "medicoes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "etapas_cronograma"`);

    // Drop coluna
    await queryRunner.query(`ALTER TABLE "contratos" DROP COLUMN IF EXISTS "modalidade_execucao"`);

    // Drop enums
    await queryRunner.query(`DROP TYPE IF EXISTS "status_ordem_servico_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "metrica_os_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "periodicidade_renovacao_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "status_licenca_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tipo_licenca_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "status_atestacao_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "status_medicao_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "status_etapa_cronograma_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "modalidade_execucao_enum"`);
  }
}

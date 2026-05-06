import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona campos para Fase Interna estruturada conforme Lei 14.133/2021:
 * - dados_estruturados (jsonb) — conteúdo tipado por documento (ETP, TR, PP, MR, etc.)
 * - arquivo_pdf_path / arquivo_docx_path — documentos gerados
 * - assinaturas (jsonb) + flags de assinatura digital
 * - publicado_pncp + flags de publicação no PNCP
 * - tabela logs_fase_interna para auditoria completa (Art. 169)
 */
export class AddFaseInternaEstruturada20260506000001 implements MigrationInterface {
  name = 'AddFaseInternaEstruturada20260506000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // === Campos novos em documentos_fase_interna ===
    await queryRunner.query(`
      ALTER TABLE documentos_fase_interna
        ADD COLUMN IF NOT EXISTS dados_estruturados jsonb,
        ADD COLUMN IF NOT EXISTS arquivo_pdf_path varchar,
        ADD COLUMN IF NOT EXISTS arquivo_docx_path varchar,
        ADD COLUMN IF NOT EXISTS data_geracao_arquivo timestamp,
        ADD COLUMN IF NOT EXISTS assinaturas jsonb,
        ADD COLUMN IF NOT EXISTS exige_assinatura boolean DEFAULT false,
        ADD COLUMN IF NOT EXISTS totalmente_assinado boolean DEFAULT false,
        ADD COLUMN IF NOT EXISTS publicado_pncp boolean DEFAULT false,
        ADD COLUMN IF NOT EXISTS pncp_id_externo varchar,
        ADD COLUMN IF NOT EXISTS data_publicacao_pncp timestamp;
    `);

    // === Tabela de logs (audit trail) ===
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE logs_fase_interna_acao_enum AS ENUM (
          'DOCUMENTO_CRIADO','DOCUMENTO_EDITADO','DOCUMENTO_SUBMETIDO',
          'DOCUMENTO_APROVADO','DOCUMENTO_REPROVADO','DOCUMENTO_VERSIONADO',
          'DOCUMENTO_IMPORTADO','PDF_GERADO','DOCX_GERADO',
          'ASSINATURA_ADICIONADA','ASSINATURA_CONCLUIDA','PUBLICADO_PNCP',
          'FASE_AVANCADA','IA_INVOCADA'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS logs_fase_interna (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        licitacao_id uuid NOT NULL,
        documento_id uuid,
        acao logs_fase_interna_acao_enum NOT NULL,
        descricao text,
        dados_antes jsonb,
        dados_depois jsonb,
        usuario_id varchar,
        usuario_nome varchar,
        usuario_email varchar,
        ip_origem varchar,
        user_agent varchar,
        created_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT fk_logs_licitacao FOREIGN KEY (licitacao_id) REFERENCES licitacoes(id) ON DELETE CASCADE,
        CONSTRAINT fk_logs_documento FOREIGN KEY (documento_id) REFERENCES documentos_fase_interna(id) ON DELETE SET NULL
      );
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_logs_fi_licitacao_data ON logs_fase_interna (licitacao_id, created_at);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_logs_fi_documento_data ON logs_fase_interna (documento_id, created_at);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_logs_fi_documento_data;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_logs_fi_licitacao_data;`);
    await queryRunner.query(`DROP TABLE IF EXISTS logs_fase_interna;`);
    await queryRunner.query(`DROP TYPE IF EXISTS logs_fase_interna_acao_enum;`);
    await queryRunner.query(`
      ALTER TABLE documentos_fase_interna
        DROP COLUMN IF EXISTS dados_estruturados,
        DROP COLUMN IF EXISTS arquivo_pdf_path,
        DROP COLUMN IF EXISTS arquivo_docx_path,
        DROP COLUMN IF EXISTS data_geracao_arquivo,
        DROP COLUMN IF EXISTS assinaturas,
        DROP COLUMN IF EXISTS exige_assinatura,
        DROP COLUMN IF EXISTS totalmente_assinado,
        DROP COLUMN IF EXISTS publicado_pncp,
        DROP COLUMN IF EXISTS pncp_id_externo,
        DROP COLUMN IF EXISTS data_publicacao_pncp;
    `);
  }
}

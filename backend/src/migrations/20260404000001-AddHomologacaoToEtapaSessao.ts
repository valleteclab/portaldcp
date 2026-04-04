import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHomologacaoToEtapaSessao20260404000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Lei 14.133/2021, Art. 71 - homologacao obrigatoria apos adjudicacao
    // PostgreSQL permite adicionar valores a enum existente com IF NOT EXISTS
    await queryRunner.query(
      `ALTER TYPE sessoes_disputa_etapa_enum ADD VALUE IF NOT EXISTS 'HOMOLOGACAO' AFTER 'ADJUDICACAO'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL nao permite remover valores de enum sem recriar o tipo.
    // Para rollback: recriar o enum sem HOMOLOGACAO e atualizar a coluna.
    // Documentado como irreversivel em producao - requer intervencao manual.
  }
}

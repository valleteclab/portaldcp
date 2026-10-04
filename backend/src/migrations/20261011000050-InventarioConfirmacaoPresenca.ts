import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Conferência de inventário: confirmação de presença das leituras de bem que
 * pertence a outro setor (ou já baixado).
 *
 * A antena UHF atravessa parede, então OUTRO_SETOR hoje mistura "o bem foi
 * parar nesta sala" com "o leitor pegou a sala vizinha". Quem está na sala
 * responde no fechamento, e a resposta fica gravada aqui.
 *
 * As leituras que já existem ficam com presenca_confirmada = NULL (pendente).
 * Para não travar o fechamento de setor já conferido antes desta mudança, as
 * leituras anteriores a esta migração entram como confirmadas.
 */
export class InventarioConfirmacaoPresenca1761100005000 implements MigrationInterface {
  name = 'InventarioConfirmacaoPresenca1761100005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "patrimonio_inventario_leituras"
        ADD COLUMN IF NOT EXISTS "presenca_confirmada" boolean,
        ADD COLUMN IF NOT EXISTS "presenca_confirmada_por" character varying,
        ADD COLUMN IF NOT EXISTS "presenca_confirmada_em" TIMESTAMP
    `);
    // Conferências anteriores não passaram pela pergunta: dá como confirmado
    // para não travar o fechamento de quem já estava no meio do inventário.
    await queryRunner.query(`
      UPDATE "patrimonio_inventario_leituras"
         SET "presenca_confirmada" = true,
             "presenca_confirmada_por" = 'Confirmado automaticamente (leitura anterior à confirmação de presença)',
             "presenca_confirmada_em" = now()
       WHERE "situacao" IN ('OUTRO_SETOR', 'BAIXADO_PRESENTE')
         AND "presenca_confirmada" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "patrimonio_inventario_leituras"
        DROP COLUMN IF EXISTS "presenca_confirmada_em",
        DROP COLUMN IF EXISTS "presenca_confirmada_por",
        DROP COLUMN IF EXISTS "presenca_confirmada"
    `);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A confirmação de presença passa a valer também para a leitura DESCONHECIDO
 * (código que não casou com bem nenhum). Ali a pergunta é outra — "é um bem
 * desta sala que não está cadastrado, ou é tag de fora?" — mas, como nos
 * demais casos, só quem está na sala sabe responder.
 *
 * As leituras DESCONHECIDO que já existem entram como confirmadas, senão
 * travariam o fechamento de setor que já estava em conferência.
 */
export class InventarioConfirmacaoDesconhecido1761200006000 implements MigrationInterface {
  name = 'InventarioConfirmacaoDesconhecido1761200006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "patrimonio_inventario_leituras"
         SET "presenca_confirmada" = true,
             "presenca_confirmada_por" = 'Confirmado automaticamente (leitura anterior à confirmação de presença)',
             "presenca_confirmada_em" = now()
       WHERE "situacao" = 'DESCONHECIDO'
         AND "presenca_confirmada" IS NULL
    `);
  }

  public async down(): Promise<void> {
    // Nada a desfazer: a coluna continua existindo e o valor é informativo.
  }
}

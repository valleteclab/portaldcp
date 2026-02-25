import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWhatsappChat1772100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "whatsapp_conversas" (
        "id"                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        "orgao_id"             varchar(36)  NOT NULL,
        "phone"                varchar(30)  NOT NULL,
        "nome_contato"         varchar(150),
        "ultima_mensagem"      text,
        "ultima_mensagem_em"   timestamptz,
        "mensagens_nao_lidas"  int          NOT NULL DEFAULT 0,
        "status"               varchar(20)  NOT NULL DEFAULT 'ABERTA',
        "created_at"           timestamptz  NOT NULL DEFAULT now(),
        "updated_at"           timestamptz  NOT NULL DEFAULT now(),
        UNIQUE ("orgao_id", "phone")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "whatsapp_mensagens" (
        "id"               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        "conversa_id"      uuid        NOT NULL REFERENCES "whatsapp_conversas"("id") ON DELETE CASCADE,
        "direcao"          varchar(10) NOT NULL,
        "conteudo"         text        NOT NULL,
        "status"           varchar(20) NOT NULL DEFAULT 'PENDENTE',
        "zapi_message_id"  varchar(150),
        "created_at"       timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_wa_conversas_orgao" ON "whatsapp_conversas"("orgao_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_wa_mensagens_conversa" ON "whatsapp_mensagens"("conversa_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "whatsapp_mensagens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "whatsapp_conversas"`);
  }
}

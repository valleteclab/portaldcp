import { MigrationInterface, QueryRunner } from 'typeorm';
import { migrarSaldoAtas } from '../atas/saldo-ata.sql';

/**
 * E6 — ATA DE REGISTRO DE PREÇOS (Lei 14.133/2021 arts. 82–86):
 *  - status da ata: AGUARDANDO_ASSINATURA e VENCIDA; `data_assinatura` nula
 *    até a última assinatura; origem, ata de origem (reserva), documento de
 *    assinatura, prazo do cadastro de reserva, prorrogação e cancelamento;
 *  - itens: item da licitação e contadores das adesões;
 *  - tabelas `ata_consumos`, `adesoes_ata`, `adesoes_ata_itens`,
 *    `ata_cadastro_reserva`; `contratos.ata_registro_preco_id`;
 *  - dados (`migrarSaldoAtas`): utilização antiga → consumo MIGRACAO e saldo
 *    recalculado. Nenhuma ata gerada para licitações antigas.
 *
 * IDEMPOTENTE. Sem transação (ALTER TYPE ... ADD VALUE). Produção com
 * synchronize ligado: o synchronize cria o schema e o boot
 * (MigracaoArpBootService) migra os dados — esta migration existe para quando
 * o synchronize for desligado (E9).
 */
export class AtaRegistroPrecos20261006000008 implements MigrationInterface {
  name = 'AtaRegistroPrecos20261006000008';
  transaction = false as const;

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE atas_registro_preco_status_enum ADD VALUE IF NOT EXISTS 'AGUARDANDO_ASSINATURA'`);
    await q.query(`ALTER TYPE atas_registro_preco_status_enum ADD VALUE IF NOT EXISTS 'VENCIDA'`);
    await q.query(`ALTER TABLE atas_registro_preco ALTER COLUMN data_assinatura DROP NOT NULL`);
    const colunasAta = [
      `origem varchar(20) NOT NULL DEFAULT 'MANUAL'`,
      `ata_origem_id uuid`,
      `documento_assinatura_id uuid`,
      `prazo_cadastro_reserva timestamp`,
      `prorrogada boolean NOT NULL DEFAULT false`,
      `prorrogacao_meses int`,
      `prorrogacao_motivo text`,
      `prorrogada_em timestamp`,
      `data_vigencia_fim_original date`,
      `cancelamento_hipotese varchar(40)`,
      `cancelamento_motivo text`,
      `cancelada_em timestamp`,
    ];
    for (const c of colunasAta) await q.query(`ALTER TABLE atas_registro_preco ADD COLUMN IF NOT EXISTS ${c}`);
    await q.query(`ALTER TABLE itens_ata ADD COLUMN IF NOT EXISTS item_licitacao_id uuid`);
    await q.query(`ALTER TABLE itens_ata ADD COLUMN IF NOT EXISTS quantidade_adesao_autorizada numeric(15,4) NOT NULL DEFAULT 0`);
    await q.query(`ALTER TABLE itens_ata ADD COLUMN IF NOT EXISTS quantidade_adesao_utilizada numeric(15,4) NOT NULL DEFAULT 0`);
    await q.query(`ALTER TABLE contratos ADD COLUMN IF NOT EXISTS ata_registro_preco_id uuid`);

    await q.query(`CREATE TABLE IF NOT EXISTS ata_consumos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ata_id uuid NOT NULL, item_ata_id uuid NOT NULL,
      quantidade numeric(15,4) NOT NULL, valor_unitario numeric(15,4) NOT NULL, valor_total numeric(15,2) NOT NULL,
      origem varchar(20) NOT NULL, adesao_id uuid, orgao_consumidor_id varchar NOT NULL, contrato_id uuid,
      data date NOT NULL, ator_tipo varchar(20), ator_id varchar, observacao text,
      created_at timestamp NOT NULL DEFAULT now())`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_ata_consumos_ata" ON ata_consumos (ata_id)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_ata_consumos_item" ON ata_consumos (item_ata_id)`);

    await q.query(`CREATE TABLE IF NOT EXISTS adesoes_ata (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ata_id uuid NOT NULL, orgao_gerenciador_id varchar NOT NULL, orgao_aderente_id varchar NOT NULL,
      justificativa_vantagem text NOT NULL, status varchar(30) NOT NULL DEFAULT 'SOLICITADA',
      motivo_recusa text, recusada_por varchar(20), anuencia_em timestamp, aceite_fornecedor_em timestamp,
      autorizada_em timestamp, prazo_contratacao date, recusada_em timestamp, ator_tipo varchar(20), ator_id varchar,
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now())`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_adesoes_ata_ata" ON adesoes_ata (ata_id)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_adesoes_ata_aderente" ON adesoes_ata (orgao_aderente_id)`);

    await q.query(`CREATE TABLE IF NOT EXISTS adesoes_ata_itens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      adesao_id uuid NOT NULL, item_ata_id uuid NOT NULL,
      quantidade numeric(15,4) NOT NULL, quantidade_utilizada numeric(15,4) NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now())`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_adesoes_ata_itens" ON adesoes_ata_itens (adesao_id, item_ata_id)`);

    await q.query(`CREATE TABLE IF NOT EXISTS ata_cadastro_reserva (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ata_id uuid NOT NULL, item_ata_id uuid NOT NULL, fornecedor_id varchar NOT NULL, posicao int NOT NULL,
      valor_ofertado numeric(15,4), status varchar(20) NOT NULL DEFAULT 'PENDENTE', prazo_resposta timestamp,
      respondido_em timestamp, ata_convocada_id uuid,
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now())`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ata_cadastro_reserva" ON ata_cadastro_reserva (item_ata_id, fornecedor_id)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_ata_cadastro_reserva_ata" ON ata_cadastro_reserva (ata_id)`);

    await migrarSaldoAtas(q);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Valores de enum e dados migrados permanecem; tabelas novas e colunas saem.
    await q.query(`DROP TABLE IF EXISTS ata_cadastro_reserva`);
    await q.query(`DROP TABLE IF EXISTS adesoes_ata_itens`);
    await q.query(`DROP TABLE IF EXISTS adesoes_ata`);
    await q.query(`DROP TABLE IF EXISTS ata_consumos`);
    await q.query(`ALTER TABLE contratos DROP COLUMN IF EXISTS ata_registro_preco_id`);
  }
}

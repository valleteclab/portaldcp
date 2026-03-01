#!/usr/bin/env npx ts-node
/**
 * Script de reparo: recalcula quantidade_entregue em itens_contrato
 *
 * Executa o mesmo SQL da migration 1772200000000.
 * Use quando a migration não rodar ou para reparo manual:
 *
 *   cd backend && npx ts-node scripts/reparo-quantidade-entregue.ts
 *
 * Requer DATABASE_URL ou variáveis DB_* no .env
 */
import { DataSource } from 'typeorm';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Carrega .env do backend
dotenv.config({ path: path.join(__dirname, '../.env') });

const SQL_REPARO = `
  WITH recebido_por_item AS (
    SELECT
      (elem->>'item_contrato_id')::uuid AS item_contrato_id,
      SUM((elem->>'quantidade_aceita')::numeric) AS soma
    FROM recebimentos r,
    jsonb_array_elements(COALESCE(r.itens, '[]'::jsonb)) AS elem
    WHERE r.status IN ('ACEITO', 'ACEITO_PARCIAL')
      AND r.baixa_realizada = true
      AND (elem->>'item_contrato_id') IS NOT NULL
      AND (elem->>'item_contrato_id') != ''
    GROUP BY (elem->>'item_contrato_id')::uuid
  ),
  itens_a_corrigir AS (
    SELECT
      ic.id,
      ic.descricao,
      ic.quantidade_entregue AS atual,
      COALESCE(rpi.soma, 0) AS esperado
    FROM itens_contrato ic
    LEFT JOIN recebido_por_item rpi ON rpi.item_contrato_id = ic.id
    WHERE ic.quantidade_entregue != COALESCE(rpi.soma, 0)
  )
  UPDATE itens_contrato ic
  SET
    quantidade_entregue = iac.esperado,
    saldo_disponivel = ic.quantidade_contratada - ic.quantidade_empenhada - iac.esperado
  FROM itens_a_corrigir iac
  WHERE ic.id = iac.id
`;

async function main() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    host: process.env.DATABASE_URL ? undefined : process.env.DB_HOST,
    port: process.env.DATABASE_URL ? undefined : parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DATABASE_URL ? undefined : process.env.DB_USERNAME,
    password: process.env.DATABASE_URL ? undefined : process.env.DB_PASSWORD,
    database: process.env.DATABASE_URL ? undefined : process.env.DB_DATABASE,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  });

  await dataSource.initialize();

  try {
    const countRows = await dataSource.query(`
      WITH recebido_por_item AS (
        SELECT (elem->>'item_contrato_id')::uuid AS item_contrato_id,
               SUM((elem->>'quantidade_aceita')::numeric) AS soma
        FROM recebimentos r, jsonb_array_elements(COALESCE(r.itens, '[]'::jsonb)) AS elem
        WHERE r.status IN ('ACEITO', 'ACEITO_PARCIAL') AND r.baixa_realizada = true
          AND (elem->>'item_contrato_id') IS NOT NULL AND (elem->>'item_contrato_id') != ''
        GROUP BY (elem->>'item_contrato_id')::uuid
      )
      SELECT COUNT(*)::int AS n FROM itens_contrato ic
      LEFT JOIN recebido_por_item rpi ON rpi.item_contrato_id = ic.id
      WHERE ic.quantidade_entregue != COALESCE(rpi.soma, 0)
    `);
    const n = Number((countRows[0] as any)?.n ?? 0);

    await dataSource.query(SQL_REPARO);

    console.log(n === 0
      ? 'Nenhum item inconsistente. quantidade_entregue já está correta.'
      : `Corrigidos ${n} item(ns) com quantidade_entregue inconsistente.`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error('Erro:', err?.message || err);
  if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
    console.error('Configure DATABASE_URL ou DB_HOST/DB_USERNAME/DB_PASSWORD/DB_DATABASE');
  }
  process.exit(1);
});

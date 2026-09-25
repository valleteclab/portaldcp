import { totaisDaAta } from './regras-arp';

/**
 * ============================================================================
 * SALDO DA ATA — recálculo a partir dos CONSUMOS (fonte da verdade) — E6
 * ============================================================================
 * Sem injeção de dependência (usado pelo cadastro antigo, pela ARP e pela
 * migração). Nunca "zera" o consumo: o `recalcularValorAta` antigo gravava
 * `valor_saldo = valor_total` a cada edição de item (B10) — agora o saldo é
 * sempre registrado − consumido, item a item:
 *  - quantidade_utilizada / quantidade_saldo: consumos do gerenciador e
 *    participantes (`ata_consumos.adesao_id IS NULL`);
 *  - quantidade_adesao_utilizada: consumos das adesões;
 *  - quantidade_adesao_autorizada: soma das adesões AUTORIZADAS;
 *  - adesoes_ata_itens.quantidade_utilizada: consumo de cada adesão;
 *  - ata: valor_total / valor_utilizado / valor_saldo; VIGENTE ⇄ ESGOTADA.
 */
export interface ExecutorSqlAta {
  query(sql: string, params?: any[]): Promise<any>;
}

export async function recalcularSaldoAta(db: ExecutorSqlAta, ataId: string): Promise<{ valorTotal: number; valorUtilizado: number; valorSaldo: number }> {
  await db.query(
    `UPDATE itens_ata i SET
        quantidade_utilizada = COALESCE(c.ger, 0),
        quantidade_saldo = GREATEST(0, i.quantidade_registrada - COALESCE(c.ger, 0)),
        quantidade_adesao_utilizada = COALESCE(c.ades, 0),
        quantidade_adesao_autorizada = COALESCE(a.aut, 0),
        valor_total = ROUND(i.quantidade_registrada * i.valor_unitario, 2),
        updated_at = now()
       FROM itens_ata i2
       LEFT JOIN (
         SELECT item_ata_id,
                SUM(quantidade) FILTER (WHERE adesao_id IS NULL) AS ger,
                SUM(quantidade) FILTER (WHERE adesao_id IS NOT NULL) AS ades
           FROM ata_consumos WHERE ata_id = $1 GROUP BY item_ata_id
       ) c ON c.item_ata_id = i2.id
       LEFT JOIN (
         SELECT ai.item_ata_id, SUM(ai.quantidade) AS aut
           FROM adesoes_ata_itens ai JOIN adesoes_ata ad ON ad.id = ai.adesao_id
          WHERE ad.ata_id = $1 AND ad.status = 'AUTORIZADA'
          GROUP BY ai.item_ata_id
       ) a ON a.item_ata_id = i2.id
      WHERE i.id = i2.id AND i.ata_id = $1`,
    [ataId],
  );
  await db.query(
    `UPDATE adesoes_ata_itens ai SET quantidade_utilizada = COALESCE((
        SELECT SUM(c.quantidade) FROM ata_consumos c WHERE c.adesao_id = ai.adesao_id AND c.item_ata_id = ai.item_ata_id
      ), 0)
      WHERE ai.adesao_id IN (SELECT id FROM adesoes_ata WHERE ata_id = $1)`,
    [ataId],
  );
  const itens: any[] = await db.query(
    `SELECT quantidade_registrada, quantidade_utilizada, valor_unitario, ativo FROM itens_ata WHERE ata_id = $1`,
    [ataId],
  );
  const t = totaisDaAta(
    itens.map((i) => ({
      quantidade_registrada: Number(i.quantidade_registrada),
      quantidade_utilizada: Number(i.quantidade_utilizada),
      valor_unitario: Number(i.valor_unitario),
      ativo: i.ativo,
    })),
  );
  const temItens = itens.some((i) => i.ativo !== false);
  await db.query(
    `UPDATE atas_registro_preco SET valor_total = $2::numeric, valor_utilizado = $3::numeric, valor_saldo = $4::numeric,
        status = CASE
          WHEN status::text = 'VIGENTE' AND $5::boolean AND $4::numeric <= 0 THEN 'ESGOTADA'
          WHEN status::text = 'ESGOTADA' AND $4::numeric > 0 THEN 'VIGENTE'
          ELSE status::text END::atas_registro_preco_status_enum,
        updated_at = now()
      WHERE id = $1`,
    [ataId, t.valorTotal, t.valorUtilizado, t.valorSaldo, temItens],
  );
  return t;
}

/**
 * MIGRAÇÃO (idempotente): itens com `quantidade_utilizada` > 0 registrada pela
 * rota antiga e SEM nenhum consumo → um consumo MIGRACAO com essa quantidade
 * (retrato do histórico do `utilizarItem`); depois recalcula todas as atas com
 * item — o saldo zerado pelo bug do `recalcularValorAta` volta a ser
 * registrado − utilizado. Nenhuma ata é gerada para licitações antigas.
 */
export async function migrarSaldoAtas(db: ExecutorSqlAta): Promise<{ consumosMigrados: number; atasRecalculadas: number }> {
  const inseridos: any[] = await db.query(
    `INSERT INTO ata_consumos (id, ata_id, item_ata_id, quantidade, valor_unitario, valor_total, origem, adesao_id,
                               orgao_consumidor_id, contrato_id, data, ator_tipo, ator_id, observacao, created_at)
     SELECT gen_random_uuid(), i.ata_id, i.id, i.quantidade_utilizada, i.valor_unitario,
            ROUND(i.quantidade_utilizada * i.valor_unitario, 2), 'MIGRACAO', NULL, a.orgao_id, NULL,
            COALESCE(i.updated_at, now())::date, 'SISTEMA', 'migracao-e6-arp',
            'Migração E6: utilização registrada antes do controle por consumo', now()
       FROM itens_ata i JOIN atas_registro_preco a ON a.id = i.ata_id
      WHERE i.quantidade_utilizada > 0
        AND NOT EXISTS (SELECT 1 FROM ata_consumos c WHERE c.item_ata_id = i.id)
     RETURNING ata_id`,
  );
  const lista = Array.isArray(inseridos) && Array.isArray(inseridos[0]) ? inseridos[0] : inseridos;
  // Recalcula as atas cujo saldo não bate com registrado − utilizado (inclui as zeradas pelo bug)
  const atas: any[] = await db.query(
    `SELECT DISTINCT a.id FROM atas_registro_preco a
       JOIN itens_ata i ON i.ata_id = a.id
      WHERE i.quantidade_saldo <> GREATEST(0, i.quantidade_registrada - i.quantidade_utilizada)
         OR ABS(a.valor_saldo - (a.valor_total - a.valor_utilizado)) > 0.01
         OR a.id = ANY($1::uuid[])`,
    [(lista || []).map((r: any) => r.ata_id)],
  );
  for (const a of atas) await recalcularSaldoAta(db, a.id);
  return { consumosMigrados: (lista || []).length, atasRecalculadas: atas.length };
}

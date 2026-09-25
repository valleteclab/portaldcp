import type { ExecutorSql } from '../../disputa/migracao-lances';

/**
 * ============================================================================
 * MIGRAÇÃO DE DADOS ME/EPP (plano E3 item 3) — idempotente
 * ============================================================================
 *
 * Fonte da verdade do art. 48 = campos NOVOS (`tipo_beneficio_mpe` na
 * licitação e no lote; `tipo_participacao` no item). O legado
 * (`exclusivo_mpe`, `cota_reservada`) passa a ser SOMENTE LEITURA:
 *  1. licitações/lotes com o tipo novo vazio (NENHUM) e o legado marcado
 *     recebem o tipo equivalente (EXCLUSIVO / COTA_RESERVADA);
 *  2. o legado da licitação é realinhado ao tipo novo (leitores antigos —
 *     PNCP — continuam coerentes);
 *  3. propostas sem o retrato do porte (`enquadramento_mpe` nulo) recebem o
 *     porte ATUAL do cadastro e o enquadramento (porte ME/EPP/MEI +
 *     declaração) — a melhor aproximação disponível para o passado.
 */
export interface RelatorioMigracaoMeEpp {
  licitacoesTipo: number;
  licitacoesLegado: number;
  lotesTipo: number;
  propostasRetrato: number;
}

const contagem = (r: any): number => {
  if (Array.isArray(r) && typeof r[1] === 'number') return r[1];
  if (r && typeof r.rowCount === 'number') return r.rowCount;
  return 0;
};

export const houveMudancaMeEpp = (r: RelatorioMigracaoMeEpp) => r.licitacoesTipo + r.licitacoesLegado + r.lotesTipo + r.propostasRetrato > 0;

export const resumoMigracaoMeEpp = (r: RelatorioMigracaoMeEpp) =>
  `${r.licitacoesTipo} licitação(ões) com tipo ME/EPP vindo do legado, ${r.licitacoesLegado} com legado realinhado, ` +
  `${r.lotesTipo} lote(s), ${r.propostasRetrato} proposta(s) com retrato do porte`;

export async function migrarMeEpp(db: ExecutorSql): Promise<RelatorioMigracaoMeEpp> {
  const rel: RelatorioMigracaoMeEpp = { licitacoesTipo: 0, licitacoesLegado: 0, lotesTipo: 0, propostasRetrato: 0 };

  rel.licitacoesTipo += contagem(
    await db.query(
      `UPDATE licitacoes SET tipo_beneficio_mpe = 'EXCLUSIVO'
        WHERE COALESCE(tipo_beneficio_mpe, 'NENHUM') = 'NENHUM' AND exclusivo_mpe = true`,
    ),
  );
  rel.licitacoesTipo += contagem(
    await db.query(
      `UPDATE licitacoes SET tipo_beneficio_mpe = 'COTA_RESERVADA'
        WHERE COALESCE(tipo_beneficio_mpe, 'NENHUM') = 'NENHUM' AND cota_reservada = true`,
    ),
  );
  rel.licitacoesLegado += contagem(
    await db.query(
      `UPDATE licitacoes
          SET exclusivo_mpe = (tipo_beneficio_mpe = 'EXCLUSIVO'),
              cota_reservada = (tipo_beneficio_mpe = 'COTA_RESERVADA')
        WHERE exclusivo_mpe IS DISTINCT FROM (tipo_beneficio_mpe = 'EXCLUSIVO')
           OR cota_reservada IS DISTINCT FROM (tipo_beneficio_mpe = 'COTA_RESERVADA')`,
    ),
  );
  rel.lotesTipo += contagem(
    await db.query(
      `UPDATE lotes_licitacao SET tipo_beneficio_mpe = 'EXCLUSIVO'
        WHERE COALESCE(tipo_beneficio_mpe, 'NENHUM') = 'NENHUM' AND exclusivo_mpe = true`,
    ),
  );
  rel.propostasRetrato += contagem(
    await db.query(
      `UPDATE propostas p
          SET porte_fornecedor = f.porte::text,
              enquadramento_mpe = (COALESCE(f.porte::text, '') IN ('ME','EPP','MEI') AND p.declaracao_mpe = true)
         FROM fornecedores f
        WHERE f.id::text = p.fornecedor_id::text AND p.enquadramento_mpe IS NULL`,
    ),
  );
  return rel;
}

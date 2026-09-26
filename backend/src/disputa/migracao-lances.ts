/**
 * ============================================================================
 * MIGRAÇÃO DE DADOS — modelo de lance da E2 (fornecedor_id, unitário/total,
 * origem, base) + unicidade da anonimização
 * ============================================================================
 *
 * Roda no boot (MigracaoLancesBootService — produção com synchronize, sem
 * migrationsRun) e na migration 20260925000001-ModeloLanceE2. IDEMPOTENTE:
 * cada passo só toca linhas ainda não migradas (`lances.base_lance IS NULL`
 * é a marca de "linha anterior à E2" — o motor sempre grava a base).
 *
 * Passos (na ordem):
 *  1. Lances de LOTE do caminho legado `sessao.registrarLanceLote` (gravavam
 *     o UNITÁRIO rateado, sem fornecedor_id): licitação com lotes, item com
 *     lote, fornecedor_id nulo e não-proposta → base UNITARIO,
 *     valor_unitario = valor, valor_total = valor × quantidade.
 *  2. Demais lances com item (pregão por item — disputa e sessao gravavam o
 *     TOTAL do item): base TOTAL_ITEM, valor_total = valor,
 *     valor_unitario = valor ÷ quantidade (4 casas).
 *  3. Lances sem item (módulo `lances` legado, por licitação): só marcados
 *     (base TOTAL_ITEM, unitário/total nulos) — nada no sistema os lê.
 *  4. origem: ip_origem = 'SISTEMA' → PROPOSTA (conversão de proposta); resto
 *     LANCE (o padrão da coluna).
 *  5. fornecedor_id nulo ← fornecedor_identificador quando ele é (a) o id de um
 *     fornecedor, (b) o CPF/CNPJ (só dígitos) de um único fornecedor, ou (c)
 *     um código anônimo ("Fornecedor B") de UMA sessão da mesma licitação.
 *     O que sobra é relatado como órfão (não é apagado nem inventado).
 *  6. Propostas convertidas em duplicata (mesmo item+fornecedor, ativas — os
 *     dois caminhos antigos de conversão): fica a mais antiga; as outras são
 *     canceladas logicamente (cancelado_por = MIGRACAO).
 *  7. Índice único parcial UQ_lances_proposta_ativa.
 *  8. mapeamento_anonimo: códigos repetidos na mesma sessão (corrida antiga)
 *     são renumerados (o 1º a receber mantém) e cria-se o índice único
 *     UQ_mapeamento_anonimo_sessao_indice.
 *  9. Intervalo de tempo entre lances (não é exigência legal): parâmetro do
 *     SISTEMA 3 → 0; licitações que ainda não abriram a disputa com o valor
 *     padrão antigo (3) passam a herdar (NULL).
 */

export interface ExecutorSql {
  query(sql: string, params?: any[]): Promise<any>;
}

export interface RelatorioMigracaoLances {
  loteUnitario: number;
  totalItem: number;
  semItem: number;
  origemProposta: number;
  fornecedorPorId: number;
  fornecedorPorDocumento: number;
  fornecedorPorCodigoAnonimo: number;
  orfaosSemFornecedor: number;
  propostasDuplicadasCanceladas: number;
  codigosAnonimosRenumerados: number;
  parametroSistemaIntervalo: number;
  licitacoesIntervaloHerdado: number;
}

/** Linhas afetadas por um UPDATE (pg devolve [linhas, contagem] no TypeORM). */
function afetadas(r: any): number {
  if (Array.isArray(r) && typeof r[1] === 'number') return r[1];
  if (r && typeof r.affected === 'number') return r.affected;
  if (r && typeof r.rowCount === 'number') return r.rowCount;
  return 0;
}

export async function migrarModeloLances(db: ExecutorSql): Promise<RelatorioMigracaoLances> {
  const rel: RelatorioMigracaoLances = {
    loteUnitario: 0,
    totalItem: 0,
    semItem: 0,
    origemProposta: 0,
    fornecedorPorId: 0,
    fornecedorPorDocumento: 0,
    fornecedorPorCodigoAnonimo: 0,
    orfaosSemFornecedor: 0,
    propostasDuplicadasCanceladas: 0,
    codigosAnonimosRenumerados: 0,
    parametroSistemaIntervalo: 0,
    licitacoesIntervaloHerdado: 0,
  };

  // 4 (antes dos demais — só depende de ip_origem)
  rel.origemProposta = afetadas(
    await db.query(
      `UPDATE lances SET origem = 'PROPOSTA'
        WHERE base_lance IS NULL AND ip_origem = 'SISTEMA' AND origem <> 'PROPOSTA'`,
    ),
  );

  // 1. lote legado (antes do backfill de fornecedor — usa fornecedor_id nulo como marca)
  rel.loteUnitario = afetadas(
    await db.query(
      `UPDATE lances l
          SET base_lance = 'UNITARIO',
              valor_unitario = l.valor,
              valor_total = ROUND(l.valor * COALESCE(NULLIF(i.quantidade, 0), 1), 2)
         FROM itens_licitacao i, licitacoes lic
        WHERE l.item_id::text = i.id::text AND lic.id::text = l.licitacao_id::text
          AND l.base_lance IS NULL AND l.fornecedor_id IS NULL
          AND lic.usa_lotes = true AND i.lote_id IS NOT NULL
          AND COALESCE(l.ip_origem, '') <> 'SISTEMA'`,
    ),
  );

  // 2. pregão por item: valor = total do item
  rel.totalItem = afetadas(
    await db.query(
      `UPDATE lances l
          SET base_lance = 'TOTAL_ITEM',
              valor_total = l.valor,
              valor_unitario = ROUND(l.valor / COALESCE(NULLIF(i.quantidade, 0), 1), 4)
         FROM itens_licitacao i
        WHERE l.item_id::text = i.id::text AND l.base_lance IS NULL`,
    ),
  );

  // 3. sem item (módulo legado)
  rel.semItem = afetadas(
    await db.query(`UPDATE lances SET base_lance = 'TOTAL_ITEM' WHERE base_lance IS NULL AND item_id IS NULL`),
  );

  // 5. fornecedor_id
  rel.fornecedorPorId = afetadas(
    await db.query(
      `UPDATE lances l SET fornecedor_id = f.id::text
         FROM fornecedores f
        WHERE l.fornecedor_id IS NULL AND l.fornecedor_identificador = f.id::text`,
    ),
  );
  rel.fornecedorPorDocumento = afetadas(
    await db.query(
      `UPDATE lances l SET fornecedor_id = d.id
         FROM (
           SELECT regexp_replace(cpf_cnpj, '\\D', '', 'g') AS doc, MIN(id::text) AS id, COUNT(*) AS n
             FROM fornecedores WHERE cpf_cnpj IS NOT NULL GROUP BY 1
         ) d
        WHERE l.fornecedor_id IS NULL AND d.n = 1 AND d.doc <> ''
          AND regexp_replace(COALESCE(l.fornecedor_identificador, ''), '\\D', '', 'g') = d.doc`,
    ),
  );
  rel.fornecedorPorCodigoAnonimo = afetadas(
    await db.query(
      `UPDATE lances l SET fornecedor_id = c.fornecedor_id
         FROM (
           SELECT s.licitacao_id::text AS licitacao_id, m.codigo_anonimo,
                  MIN(m.fornecedor_id) AS fornecedor_id, COUNT(DISTINCT m.fornecedor_id) AS n
             FROM mapeamento_anonimo m JOIN sessoes_disputa s ON s.id::text = m.sessao_id::text
            GROUP BY 1, 2
         ) c
        WHERE l.fornecedor_id IS NULL AND c.n = 1
          AND c.licitacao_id = l.licitacao_id::text AND c.codigo_anonimo = l.fornecedor_identificador`,
    ),
  );
  const [orfaos] = await db.query(`SELECT COUNT(*)::int AS n FROM lances WHERE fornecedor_id IS NULL`);
  rel.orfaosSemFornecedor = Number(orfaos?.n ?? 0);

  // 6. propostas convertidas em duplicata
  rel.propostasDuplicadasCanceladas = afetadas(
    await db.query(
      `UPDATE lances l
          SET cancelado = true, cancelado_em = now(), cancelado_por = 'MIGRACAO',
              cancelado_motivo = 'Proposta convertida em duplicata (dois caminhos antigos de conversão) — migração E2'
         FROM (
           SELECT id, ROW_NUMBER() OVER (PARTITION BY item_id, fornecedor_id ORDER BY created_at, id) AS rn
             FROM lances
            WHERE origem = 'PROPOSTA' AND cancelado = false AND item_id IS NOT NULL AND fornecedor_id IS NOT NULL
         ) d
        WHERE l.id = d.id AND d.rn > 1`,
    ),
  );

  // 7. unicidade da proposta ativa
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_lances_proposta_ativa"
        ON lances (item_id, fornecedor_id) WHERE origem = 'PROPOSTA' AND cancelado = false`,
  );

  // 8. códigos anônimos repetidos na mesma sessão
  const repetidos: Array<{ id: string; sessao_id: string }> = await db.query(
    `SELECT id, sessao_id FROM (
       SELECT id, sessao_id,
              ROW_NUMBER() OVER (PARTITION BY sessao_id, indice ORDER BY created_at, id) AS rn_indice,
              ROW_NUMBER() OVER (PARTITION BY sessao_id, codigo_anonimo ORDER BY created_at, id) AS rn_codigo
         FROM mapeamento_anonimo
     ) x WHERE rn_indice > 1 OR rn_codigo > 1
     ORDER BY sessao_id`,
  );
  for (const r of repetidos) {
    const [{ proximo }] = await db.query(
      `SELECT COALESCE(MAX(indice), 0) + 1 AS proximo FROM mapeamento_anonimo WHERE sessao_id = $1`,
      [r.sessao_id],
    );
    await db.query(`UPDATE mapeamento_anonimo SET indice = $2, codigo_anonimo = $3 WHERE id = $1`, [
      r.id,
      Number(proximo),
      codigoAnonimoDoIndice(Number(proximo)),
    ]);
    rel.codigosAnonimosRenumerados++;
  }
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_mapeamento_anonimo_sessao_indice" ON mapeamento_anonimo (sessao_id, indice)`,
  );

  // 9. intervalo de tempo entre lances: padrão 0 (não é exigência legal)
  rel.parametroSistemaIntervalo = afetadas(
    await db.query(
      `UPDATE parametros_licitacao SET intervalo_minimo_lances_minutos = 0
        WHERE orgao_id IS NULL AND intervalo_minimo_lances_minutos = 3`,
    ),
  );
  rel.licitacoesIntervaloHerdado = afetadas(
    await db.query(
      `UPDATE licitacoes SET intervalo_minimo_lances = NULL
        WHERE intervalo_minimo_lances = 3
          AND fase::text IN ('PLANEJAMENTO','TERMO_REFERENCIA','PESQUISA_PRECOS','ANALISE_JURIDICA',
                             'APROVACAO_INTERNA','AGUARDANDO_DIVULGACAO','PUBLICADO','IMPUGNACAO','ACOLHIMENTO_PROPOSTAS')`,
    ),
  );

  return rel;
}

/** 1 → "Fornecedor A", 27 → "Fornecedor AA" (mesma regra do AnonimizacaoService). */
export function codigoAnonimoDoIndice(indice: number): string {
  const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let codigo = '';
  let num = indice;
  while (num > 0) {
    num--;
    codigo = LETRAS[num % 26] + codigo;
    num = Math.floor(num / 26);
  }
  return `Fornecedor ${codigo}`;
}

export function resumoMigracaoLances(r: RelatorioMigracaoLances): string {
  return (
    `lote→unitário ${r.loteUnitario}; item→total ${r.totalItem}; sem item ${r.semItem}; origem PROPOSTA ${r.origemProposta}; ` +
    `fornecedor_id por id ${r.fornecedorPorId}, por CPF/CNPJ ${r.fornecedorPorDocumento}, por código anônimo ${r.fornecedorPorCodigoAnonimo}; ` +
    `órfãos sem fornecedor ${r.orfaosSemFornecedor}; propostas duplicadas canceladas ${r.propostasDuplicadasCanceladas}; ` +
    `códigos anônimos renumerados ${r.codigosAnonimosRenumerados}; parâmetro do sistema (intervalo 3→0) ${r.parametroSistemaIntervalo}; ` +
    `licitações com intervalo herdado ${r.licitacoesIntervaloHerdado}`
  );
}

export function houveMudanca(r: RelatorioMigracaoLances): boolean {
  return Object.entries(r).some(([k, v]) => k !== 'orfaosSemFornecedor' && Number(v) > 0);
}

/**
 * ============================================================================
 * AUDITORIA DE SALDOS — contratos de MEDIÇÃO
 * ============================================================================
 *
 * Varre os contratos de medição e aponta inconsistências de saldo/migração
 * (a família de erros do caso 081/2021 REGIS):
 *
 *  1. MIGRACAO_INCONSISTENTE  — migração (meses) + medições aprovadas ≠ quantidade_medida
 *  2. QUANTIDADE_EXCEDIDA     — quantidade medida > contratada
 *  3. ACUMULADO_EXCEDE_GLOBAL — migração + aprovadas > valor global
 *  4. SNAPSHOT_NAO_MONOTONICO — meses_executados dos boletins não progride ~1/mês
 *
 * Uso (na raiz do backend):
 *   npx ts-node scripts/auditoria-saldos.ts               # todos os órgãos
 *   npx ts-node scripts/auditoria-saldos.ts <orgao_id>    # um órgão
 *
 * Somente LEITURA — não altera nada.
 * ============================================================================
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Client } = require('pg');

const r2 = (v: number) => Math.round(v * 100) / 100;

async function main() {
  const orgaoFiltro = process.argv[2] || null;

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'portaldcp',
    password: process.env.DB_PASSWORD || 'portaldcp',
    database: process.env.DB_DATABASE || 'portaldcp',
  });
  await client.connect();

  const contratos = (
    await client.query(
      `SELECT c.id, c.numero_contrato, c.fornecedor_razao_social, c.status,
              c.valor_global, o.nome AS orgao_nome
       FROM contratos c JOIN orgaos o ON o.id = c.orgao_id
       WHERE c.modalidade_execucao = 'MEDICAO'
         AND ($1::uuid IS NULL OR c.orgao_id = $1::uuid)
       ORDER BY o.nome, c.numero_contrato`,
      [orgaoFiltro],
    )
  ).rows;

  console.log(`\nAuditoria de saldos — ${contratos.length} contrato(s) de medição\n${'='.repeat(70)}`);
  let comProblema = 0;

  for (const c of contratos) {
    const problemas: string[] = [];

    const itens = (
      await client.query(
        `SELECT numero_item, unidade_medida, quantidade, quantidade_meses,
                valor_unitario, quantidade_medida, valor_migracao_reais
         FROM itens_cronograma WHERE contrato_id = $1`,
        [c.id],
      )
    ).rows;

    const medicoes = (
      await client.query(
        `SELECT numero_medicao, valor_medido,
                (execucao_fiscal::jsonb->>'meses_executados')::numeric AS meses_exec
         FROM medicoes
         WHERE contrato_id = $1 AND status = 'APROVADA'
         ORDER BY numero_medicao`,
        [c.id],
      )
    ).rows;

    const totalAprovado = medicoes.reduce((s: number, m: any) => s + Number(m.valor_medido || 0), 0);
    let migracaoTotal = 0;

    for (const it of itens) {
      const vu = Number(it.valor_unitario || 0);
      const migracao = Number(it.valor_migracao_reais || 0);
      migracaoTotal += migracao;

      if (it.unidade_medida === 'MENSAL' && migracao > 0 && vu > 0) {
        const mesesMigracao = migracao / vu;
        const esperado = mesesMigracao + medicoes.length;
        const atual = Number(it.quantidade_medida || 0);
        if (Math.abs(esperado - atual) > 0.05) {
          problemas.push(
            `MIGRACAO_INCONSISTENTE item ${it.numero_item}: migração ${mesesMigracao.toFixed(2)}m (R$ ${migracao.toFixed(2)}) ` +
              `+ ${medicoes.length} aprovadas = ${esperado.toFixed(2)} ≠ quantidade_medida ${atual.toFixed(2)} (possível dupla contagem)`,
          );
        }
      }

      const qtdTotal = Number(it.quantidade || 0) * (Number(it.quantidade_meses) || 1);
      if (Number(it.quantidade_medida || 0) > qtdTotal + 0.01) {
        problemas.push(
          `QUANTIDADE_EXCEDIDA item ${it.numero_item}: medida ${Number(it.quantidade_medida).toFixed(2)} > contratada ${qtdTotal.toFixed(2)}`,
        );
      }
    }

    const acumulado = r2(migracaoTotal + totalAprovado);
    if (acumulado > Number(c.valor_global || 0) + 0.05) {
      problemas.push(
        `ACUMULADO_EXCEDE_GLOBAL: migração ${migracaoTotal.toFixed(2)} + aprovadas ${totalAprovado.toFixed(2)} = ${acumulado.toFixed(2)} > global ${Number(c.valor_global).toFixed(2)}`,
      );
    }

    const seq = medicoes.map((m: any) => Number(m.meses_exec)).filter((v: number) => Number.isFinite(v));
    for (let i = 1; i < seq.length; i++) {
      if (seq[i] < seq[i - 1] || seq[i] - seq[i - 1] > 2) {
        problemas.push(`SNAPSHOT_NAO_MONOTONICO: sequência de meses executados [${seq.join(', ')}]`);
        break;
      }
    }

    if (problemas.length > 0) {
      comProblema++;
      console.log(`\n⚠ ${c.numero_contrato} — ${c.fornecedor_razao_social} (${c.status}) · ${c.orgao_nome}`);
      for (const p of problemas) console.log(`   - ${p}`);
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`Resultado: ${comProblema} contrato(s) com inconsistência de ${contratos.length} auditado(s).`);
  if (comProblema === 0) console.log('✅ Nenhuma inconsistência encontrada.');
  await client.end();
}

main().catch((e) => {
  console.error('Erro na auditoria:', e.message);
  process.exit(1);
});

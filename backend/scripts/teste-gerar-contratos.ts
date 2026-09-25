/**
 * Teste manual: homologa (ResultadoService.homologar — E6, valor calculado
 * dos itens) uma licitação já em fase ADJUDICACAO com itens ADJUDICADOS,
 * como a conta do órgão, validando a geração de múltiplos contratos.
 *
 * Uso:
 *   ts-node --transpile-only scripts/teste-gerar-contratos.ts <licitacao_id>
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ResultadoService } from '../src/resultado/resultado.service';
import { DataSource } from 'typeorm';
import { ContratosService } from '../src/contratos/contratos.service';

async function main() {
  const licitacaoId = process.argv[2];
  if (!licitacaoId) {
    console.error('Uso: ts-node teste-gerar-contratos.ts <licitacao_id>');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const resultadoService = app.get(ResultadoService);
  const contratosService = app.get(ContratosService);

  console.log(`\n>>> Homologando licitação ${licitacaoId}...`);
  const [lic] = await app.get(DataSource).query(`SELECT orgao_id FROM licitacoes WHERE id = $1`, [licitacaoId]);
  const r = await resultadoService.homologar(licitacaoId, {
    tipo: 'ORGAO', id: lic.orgao_id, orgaoId: lic.orgao_id, fornecedorId: null, usuarioId: null, admin: false, role: null,
  } as any);
  console.log(`    fase=${r.fase} valor_homologado=${r.valorHomologado}`);

  console.log(`\n>>> Buscando contratos gerados...`);
  const contratos = await contratosService.gerarContratoAutomatico(licitacaoId);
  console.log(`    ${contratos.length} contrato(s):`);
  for (const c of contratos) {
    console.log(`      - ${c.numero_contrato} | ${c.fornecedor_razao_social}`);
    console.log(`        valor=R$ ${Number(c.valor_global).toFixed(2)} | prazo=${c.prazo_execucao_dias}d | status=${c.status}`);
  }

  await app.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('\nERRO:', err);
  process.exit(1);
});

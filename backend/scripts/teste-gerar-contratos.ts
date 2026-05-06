/**
 * Teste manual: chama LicitacoesService.homologar() para uma licitação
 * já em fase ADJUDICACAO com itens ADJUDICADOS, validando a nova
 * lógica de geração de múltiplos contratos.
 *
 * Uso:
 *   ts-node --transpile-only scripts/teste-gerar-contratos.ts <licitacao_id>
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { LicitacoesService } from '../src/licitacoes/licitacoes.service';
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

  const licitacoesService = app.get(LicitacoesService);
  const contratosService = app.get(ContratosService);

  console.log(`\n>>> Homologando licitação ${licitacaoId}...`);
  const licitacao = await licitacoesService.homologar(licitacaoId, 7950.0);
  console.log(`    fase=${licitacao.fase} valor_homologado=${licitacao.valor_homologado}`);

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

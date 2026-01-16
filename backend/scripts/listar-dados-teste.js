/**
 * Script para listar dados necessários para teste de concorrência
 * 
 * Uso: node scripts/listar-dados-teste.js
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  // Ler DATABASE_URL do .env
  const envPath = path.join(__dirname, '..', '.env');
  let databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl && fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    // Tentar formato DATABASE_URL=...
    let match = envContent.match(/DATABASE_URL=(.+)/);
    if (match) {
      databaseUrl = match[1].trim();
    } else {
      // Montar a partir de variáveis individuais
      const host = envContent.match(/DB_HOST=(.+)/)?.[1]?.trim() || 'localhost';
      const port = envContent.match(/DB_PORT=(.+)/)?.[1]?.trim() || '5432';
      const user = envContent.match(/DB_USERNAME=(.+)/)?.[1]?.trim() || 'postgres';
      const pass = envContent.match(/DB_PASSWORD=(.+)/)?.[1]?.trim() || '';
      const db = envContent.match(/DB_DATABASE=(.+)/)?.[1]?.trim() || 'licitafacil';
      
      databaseUrl = `postgresql://${user}:${pass}@${host}:${port}/${db}`;
    }
  }

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL não encontrada');
    process.exit(1);
  }

  console.log('🔌 Conectando ao banco de dados...\n');
  
  const client = new Client({ connectionString: databaseUrl });
  
  try {
    await client.connect();
    
    // Listar fornecedores
    console.log('='.repeat(60));
    console.log('FORNECEDORES CADASTRADOS');
    console.log('='.repeat(60));
    
    const fornecedores = await client.query(`
      SELECT * FROM fornecedores ORDER BY razao_social
    `);
    
    fornecedores.rows.forEach((f, i) => {
      console.log(`\n${i + 1}. ${f.razao_social}`);
      console.log(`   ID: ${f.id}`);
    });

    // Listar tabelas relacionadas a sessão
    console.log('\n' + '='.repeat(60));
    console.log('TABELAS DO BANCO');
    console.log('='.repeat(60));
    
    const tabelas = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('\nTabelas encontradas:');
    tabelas.rows.forEach(t => console.log(`  - ${t.table_name}`));

    // Buscar licitações em disputa
    console.log('\n' + '='.repeat(60));
    console.log('LICITAÇÕES EM DISPUTA');
    console.log('='.repeat(60));
    
    const licitacoes = await client.query(`
      SELECT id, numero_processo, objeto, fase, modo_disputa
      FROM licitacoes
      WHERE fase IN ('EM_DISPUTA', 'ANALISE_PROPOSTAS')
      ORDER BY created_at DESC
      LIMIT 5
    `);
    
    licitacoes.rows.forEach((l, i) => {
      console.log(`\n${i + 1}. Processo: ${l.numero_processo}`);
      console.log(`   Licitação ID: ${l.id}`);
      console.log(`   Fase: ${l.fase}`);
      console.log(`   Modo: ${l.modo_disputa}`);
    });

    // Listar propostas por licitação
    if (licitacoes.rows.length > 0) {
      const licitacaoId = licitacoes.rows[0].id;
      
      console.log('\n' + '='.repeat(60));
      console.log(`PROPOSTAS NA LICITAÇÃO: ${licitacaoId}`);
      console.log('='.repeat(60));
      
      const propostas = await client.query(`
        SELECT p.id, p.status, p.valor_total_proposta::numeric as valor, f.id as fornecedor_id, f.razao_social
        FROM propostas p
        JOIN fornecedores f ON f.id = p.fornecedor_id
        WHERE p.licitacao_id = $1
        ORDER BY p.valor_total_proposta
      `, [licitacaoId]);
      
      propostas.rows.forEach((p, i) => {
        console.log(`\n${i + 1}. ${p.razao_social}`);
        console.log(`   Fornecedor ID: ${p.fornecedor_id}`);
        console.log(`   Status: ${p.status}`);
        console.log(`   Valor: R$ ${p.valor || 'N/A'}`);
      });

      // Listar itens da licitação
      console.log('\n' + '='.repeat(60));
      console.log(`ITENS DA LICITAÇÃO: ${licitacaoId}`);
      console.log('='.repeat(60));
      
      const itens = await client.query(`
        SELECT * FROM itens_licitacao WHERE licitacao_id = $1 ORDER BY numero_item
      `, [licitacaoId]);
      
      itens.rows.forEach((item, i) => {
        console.log(`\n${i + 1}. Item ${item.numero_item}`);
        console.log(`   ID: ${item.id}`);
        console.log(`   Status Disputa: ${item.status_disputa || 'N/A'}`);
      });

      // Gerar comando de teste
      console.log('\n' + '='.repeat(60));
      console.log('DADOS PARA TESTE DE CONCORRÊNCIA');
      console.log('='.repeat(60));
      console.log(`\nFornecedor 1: ${fornecedores.rows[0]?.id}`);
      console.log(`Fornecedor 2: ${fornecedores.rows[1]?.id}`);
      console.log(`Licitação: ${licitacaoId}`);
    }

  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

main();

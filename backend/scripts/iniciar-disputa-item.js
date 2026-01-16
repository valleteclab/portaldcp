/**
 * Script para iniciar disputa de um item
 * 
 * Uso: node scripts/iniciar-disputa-item.js [ITEM_ID]
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const ITEM_ID = process.argv[2] || '363044c5-3d86-49f6-8c75-48f77e13f787';
const TEMPO_DISPUTA = 180; // 3 minutos

async function main() {
  // Ler DATABASE_URL do .env
  const envPath = path.join(__dirname, '..', '.env');
  let databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl && fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    let match = envContent.match(/DATABASE_URL=(.+)/);
    if (match) {
      databaseUrl = match[1].trim();
    } else {
      const host = envContent.match(/DB_HOST=(.+)/)?.[1]?.trim() || 'localhost';
      const port = envContent.match(/DB_PORT=(.+)/)?.[1]?.trim() || '5432';
      const user = envContent.match(/DB_USERNAME=(.+)/)?.[1]?.trim() || 'postgres';
      const pass = envContent.match(/DB_PASSWORD=(.+)/)?.[1]?.trim() || '';
      const db = envContent.match(/DB_DATABASE=(.+)/)?.[1]?.trim() || 'licitafacil';
      
      databaseUrl = `postgresql://${user}:${pass}@${host}:${port}/${db}`;
    }
  }

  const client = new Client({ connectionString: databaseUrl });
  
  try {
    await client.connect();
    console.log('🔌 Conectado ao banco de dados\n');

    // Verificar item atual
    const itemResult = await client.query(`
      SELECT il.*, l.numero_processo 
      FROM itens_licitacao il
      JOIN licitacoes l ON l.id = il.licitacao_id
      WHERE il.id = $1
    `, [ITEM_ID]);

    if (itemResult.rows.length === 0) {
      console.error('❌ Item não encontrado:', ITEM_ID);
      process.exit(1);
    }

    const item = itemResult.rows[0];
    console.log(`📋 Item encontrado:`);
    console.log(`   Processo: ${item.numero_processo}`);
    console.log(`   Item: ${item.numero_item}`);
    console.log(`   Status atual: ${item.status_disputa}`);

    if (item.status_disputa === 'EM_DISPUTA') {
      console.log('\n✅ Item já está em disputa!');
      process.exit(0);
    }

    // Atualizar status para EM_DISPUTA
    await client.query(`
      UPDATE itens_licitacao 
      SET status_disputa = 'EM_DISPUTA'
      WHERE id = $1
    `, [ITEM_ID]);

    console.log(`\n✅ Item iniciado em disputa!`);

    console.log('\n🚀 Agora execute o teste de concorrência:');
    console.log('   node scripts/teste-concorrencia.js');

  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await client.end();
  }
}

main();

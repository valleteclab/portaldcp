const { Client } = require('pg');

async function checkFornecedor() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'licitafacil',
    password: 'LicitaFacil2025!',
    database: 'licitafacil'
  });

  try {
    await client.connect();
    
    // Busca fornecedor
    const result = await client.query(
      `SELECT id, email, razao_social, cpf_cnpj, status, nivel_atual, 
              nivel_i_completo, nivel_ii_completo, created_at 
       FROM fornecedores 
       WHERE email = $1`,
      ['loamesilva@gmail.com']
    );
    
    console.log('=== FORNECEDOR ===');
    console.log(JSON.stringify(result.rows, null, 2));
    
    if (result.rows.length > 0) {
      const fornecedorId = result.rows[0].id;
      
      // Busca documentos
      const docs = await client.query(
        `SELECT id, tipo, nome_arquivo, caminho_arquivo, status, nivel, created_at 
         FROM fornecedor_documentos 
         WHERE fornecedor_id = $1`,
        [fornecedorId]
      );
      
      console.log('\n=== DOCUMENTOS ===');
      console.log(JSON.stringify(docs.rows, null, 2));
    }
    
  } catch (err) {
    console.error('Erro:', err.message);
  } finally {
    await client.end();
  }
}

checkFornecedor();

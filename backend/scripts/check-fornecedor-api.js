// Script para verificar fornecedor via API do backend
const http = require('http');

// Primeiro faz login para obter token
const loginData = JSON.stringify({
  email: 'loamesilva@gmail.com',
  senha: '123456' // Tente a senha padrão
});

const loginOptions = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/fornecedores/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(loginData)
  }
};

console.log('Tentando login com loamesilva@gmail.com...');

const req = http.request(loginOptions, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    try {
      const json = JSON.parse(data);
      console.log('Resposta:', JSON.stringify(json, null, 2));
      
      if (json.fornecedor) {
        console.log('\n=== DADOS DO FORNECEDOR ===');
        console.log('ID:', json.fornecedor.id);
        console.log('Email:', json.fornecedor.email);
        console.log('Razão Social:', json.fornecedor.razao_social);
        console.log('CNPJ:', json.fornecedor.cpf_cnpj);
        console.log('Status:', json.fornecedor.status);
        console.log('Nível I completo:', json.fornecedor.nivel_i_completo);
        console.log('Nível II completo:', json.fornecedor.nivel_ii_completo);
      }
    } catch (e) {
      console.log('Resposta raw:', data);
    }
  });
});

req.on('error', (e) => {
  console.error('Erro:', e.message);
});

req.write(loginData);
req.end();

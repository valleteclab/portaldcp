#!/usr/bin/env node
/**
 * Gera o bloco de configuração para adicionar ao mcp.json do Cursor / Claude Desktop.
 * Uso: node generate-config.js [API_KEY]
 */
const path = require('path');

const indexPath = path.resolve(__dirname, 'dist', 'index.js');
const apiKey = process.argv[2] || 'COLE_SUA_API_KEY_AQUI';

const config = {
  mcpServers: {
    portaldcp: {
      command: 'node',
      args: [indexPath],
      env: {
        PORTALDCP_URL: 'https://portaldcp.com.br',
        PORTALDCP_API_KEY: apiKey,
      },
    },
  },
};

console.log('\n=== Configuração para mcp.json (Cursor / Claude Desktop) ===\n');
console.log(JSON.stringify(config, null, 2));
console.log('\n=== Cole o bloco "portaldcp" dentro de "mcpServers" no seu mcp.json ===\n');
console.log(`Caminho do servidor: ${indexPath}`);
console.log('Troque PORTALDCP_API_KEY pela chave gerada no portal do fornecedor.\n');

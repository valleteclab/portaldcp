/**
 * Script de Teste de Concorrência de Lances
 * 
 * Simula múltiplos fornecedores dando lances simultaneamente
 * para testar a integridade do sistema de disputa.
 * 
 * Uso: node scripts/teste-concorrencia.js [SESSAO_ID]
 * 
 * Fornecedores reais do banco:
 * - LOAME AZEVEDO DA SILVA: 281d27f1-3fc3-439f-a6b8-d580ab766b5a
 * - VALLETECLAB EMPREENDIMENTOS LTDA: 2cd716d6-4cd1-420c-b2fc-05603158351a
 * 
 * Licitação em disputa: 12/2025 (12d17589-20a0-4af6-9169-7d105b3f001c)
 */

const { io } = require('socket.io-client');

const BACKEND_URL = 'http://localhost:3000';
const SESSAO_ID = process.argv[2] || '';
const LICITACAO_ID = '12d17589-20a0-4af6-9169-7d105b3f001c';

// Fornecedores reais do banco de dados com suas propostas iniciais
let fornecedores = [
  { 
    id: '281d27f1-3fc3-439f-a6b8-d580ab766b5a', 
    nome: 'LOAME AZEVEDO DA SILVA',
    propostaInicial: 1450.00, // R$ 1.450,00
    socket: null,
    lancesEnviados: 0,
    lancesConfirmados: 0,
    erros: []
  },
  { 
    id: '2cd716d6-4cd1-420c-b2fc-05603158351a', 
    nome: 'VALLETECLAB EMPREENDIMENTOS LTDA',
    propostaInicial: 4.50, // R$ 4,50
    socket: null,
    lancesEnviados: 0,
    lancesConfirmados: 0,
    erros: []
  },
];

let itemEmDisputa = null;
let melhorLanceAtual = 1000000;
let sessaoIdAtual = SESSAO_ID;

function conectarFornecedor(fornecedor) {
  return new Promise((resolve, reject) => {
    const socket = io(`${BACKEND_URL}/disputa-v2`, {
      transports: ['websocket', 'polling'],
    });

    fornecedor.socket = socket;

    socket.on('connect', () => {
      console.log(`[${fornecedor.nome}] Conectado ao servidor`);
      
      socket.emit('entrar_sala', {
        sessaoId: sessaoIdAtual,
        tipo: 'FORNECEDOR',
        usuarioId: fornecedor.id,
        usuarioNome: fornecedor.nome,
      });
    });

    socket.on('dados_iniciais', (data) => {
      console.log(`[${fornecedor.nome}] Entrou na sala - ${data.itens?.emDisputa?.length || 0} itens em disputa`);
      
      // Itens em disputa estão em data.itens.emDisputa
      const itensEmDisputa = data.itens?.emDisputa || [];
      if (itensEmDisputa.length > 0) {
        const itemDisputa = itensEmDisputa[0];
        itemEmDisputa = itemDisputa.id;
        if (itemDisputa.melhorLance) {
          melhorLanceAtual = itemDisputa.melhorLance.valor;
        }
        console.log(`[${fornecedor.nome}] Item em disputa: ${itemDisputa.numero} - Melhor lance: R$ ${melhorLanceAtual}`);
      }
      
      resolve();
    });

    socket.on('lance_confirmado', (data) => {
      fornecedor.lancesConfirmados++;
      console.log(`[${fornecedor.nome}] ✅ Lance confirmado: R$ ${data.lance?.valor?.toFixed(2)}`);
    });

    socket.on('novo_lance', (data) => {
      if (data.lance) {
        melhorLanceAtual = data.lance.valor;
      }
    });

    socket.on('erro', (data) => {
      fornecedor.erros.push(data.mensagem);
      console.log(`[${fornecedor.nome}] ❌ Erro: ${data.mensagem}`);
    });

    socket.on('connect_error', (error) => {
      console.error(`[${fornecedor.nome}] Erro de conexão:`, error.message);
      reject(error);
    });

    setTimeout(() => {
      if (!socket.connected) {
        reject(new Error('Timeout de conexão'));
      }
    }, 5000);
  });
}

function enviarLance(fornecedor, valor) {
  if (!fornecedor.socket || !itemEmDisputa) return;

  fornecedor.socket.emit('enviar_lance', {
    sessaoId: sessaoIdAtual,
    itemId: itemEmDisputa,
    valor,
  });

  fornecedor.lancesEnviados++;
  console.log(`[${fornecedor.nome}] 📤 Lance enviado: R$ ${valor.toFixed(2)}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function desconectarTodos() {
  fornecedores.forEach(f => {
    if (f.socket) {
      f.socket.disconnect();
    }
  });
}

async function testarConcorrencia() {
  console.log('='.repeat(60));
  console.log('TESTE DE CONCORRÊNCIA DE LANCES');
  console.log('='.repeat(60));
  
  // Se não foi passado sessaoId, buscar via API
  if (!sessaoIdAtual) {
    console.log('\n🔍 Buscando sessão da licitação via API...');
    try {
      const http = require('http');
      const sessaoData = await new Promise((resolve, reject) => {
        http.get(`${BACKEND_URL}/api/sessao/licitacao/${LICITACAO_ID}`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error('Erro ao parsear resposta'));
            }
          });
        }).on('error', reject);
      });
      sessaoIdAtual = sessaoData.id;
      console.log(`✅ Sessão encontrada: ${sessaoIdAtual}`);
    } catch (error) {
      console.error('❌ Erro ao buscar sessão:', error.message);
      console.log('\n⚠️  Certifique-se de que o backend está rodando e a licitação está em disputa.');
      process.exit(1);
    }
  }

  console.log(`\nSessão: ${sessaoIdAtual}`);
  console.log(`Licitação: ${LICITACAO_ID}`);
  console.log(`Fornecedores: ${fornecedores.length}`);
  fornecedores.forEach(f => console.log(`  - ${f.nome}`));
  console.log('='.repeat(60));

  console.log('\n📡 Conectando fornecedores...\n');
  
  try {
    await Promise.all(fornecedores.map(f => conectarFornecedor(f)));
  } catch (error) {
    console.error('Erro ao conectar fornecedores:', error.message);
    process.exit(1);
  }

  if (!itemEmDisputa) {
    console.error('\n❌ Nenhum item em disputa encontrado!');
    console.log('Certifique-se de que há um item com status EM_DISPUTA na sessão.');
    desconectarTodos();
    process.exit(1);
  }

  await sleep(1000);

  console.log('\n🚀 Iniciando lances simultâneos...\n');

  // Cada fornecedor dá lance baseado em sua proposta inicial
  // LOAME: proposta R$ 1450, vai dar lances decrescentes a partir disso
  // VALLETECLAB: proposta R$ 4.50, vai dar lances decrescentes a partir disso

  // Rodada 1: Lances quase simultâneos (cada um com seu valor)
  const promessas = fornecedores.map((f, idx) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        // Lance = proposta inicial - 10% - (idx * 5%)
        const valorLance = f.propostaInicial * (0.9 - idx * 0.05);
        enviarLance(f, parseFloat(valorLance.toFixed(2)));
        resolve();
      }, idx * 50);
    });
  });

  await Promise.all(promessas);
  await sleep(2000);

  // Rodada 2: Lances mais agressivos
  console.log('\n🔥 Rodada 2: Lances mais AGRESSIVOS...\n');
  
  fornecedores.forEach((f, idx) => {
    // Lance = proposta inicial - 20%
    const valorLance = f.propostaInicial * 0.8;
    enviarLance(f, parseFloat(valorLance.toFixed(2)));
  });

  await sleep(2000);

  // Rodada 3: Teste de lance com MESMO VALOR (deve ser rejeitado)
  console.log('\n⚡ Rodada 3: Teste de lance com MESMO VALOR (deve ser rejeitado)...\n');
  
  // Ambos tentam dar o mesmo valor - o segundo deve ser rejeitado
  const valorIgual = 3.00;
  fornecedores.forEach(f => {
    enviarLance(f, valorIgual);
  });
  
  await sleep(2000);

  // Rodada 4: Lances em rajada alternados
  console.log('\n🔄 Rodada 4: Lances em RAJADA alternados...\n');
  
  for (let i = 0; i < 4; i++) {
    const fornecedor = fornecedores[i % fornecedores.length];
    // Lance = proposta inicial - (40% + i*5%)
    const desconto = 0.6 - (i * 0.05);
    const valorLance = fornecedor.propostaInicial * desconto;
    enviarLance(fornecedor, parseFloat(valorLance.toFixed(2)));
    await sleep(200);
  }

  await sleep(3000);

  // Relatório
  console.log('\n' + '='.repeat(60));
  console.log('RELATÓRIO FINAL');
  console.log('='.repeat(60));
  
  let totalEnviados = 0;
  let totalConfirmados = 0;
  let totalErros = 0;

  fornecedores.forEach(f => {
    console.log(`\n${f.nome}:`);
    console.log(`  Lances enviados: ${f.lancesEnviados}`);
    console.log(`  Lances confirmados: ${f.lancesConfirmados}`);
    console.log(`  Erros: ${f.erros.length}`);
    if (f.erros.length > 0) {
      f.erros.forEach(e => console.log(`    - ${e}`));
    }
    
    totalEnviados += f.lancesEnviados;
    totalConfirmados += f.lancesConfirmados;
    totalErros += f.erros.length;
  });

  console.log('\n' + '-'.repeat(60));
  console.log(`TOTAL: ${totalEnviados} enviados, ${totalConfirmados} confirmados, ${totalErros} erros`);
  if (totalEnviados > 0) {
    console.log(`Taxa de sucesso: ${((totalConfirmados / totalEnviados) * 100).toFixed(1)}%`);
  }
  console.log('='.repeat(60));

  desconectarTodos();
  process.exit(0);
}

testarConcorrencia().catch(console.error);

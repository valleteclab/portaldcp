/**
 * Script de Teste de Concorrência de Lances
 * 
 * Simula múltiplos fornecedores dando lances simultaneamente
 * para testar a integridade do sistema de disputa.
 * 
 * Uso: npx ts-node scripts/teste-concorrencia.ts
 */

import { io, Socket } from 'socket.io-client';

const BACKEND_URL = 'http://localhost:3000';
const SESSAO_ID = process.argv[2] || '10166379-ffef-4129-9976-59a213bccb94'; // Passar como argumento ou usar default
const ITEM_ID = process.argv[3] || ''; // Passar como argumento

interface Fornecedor {
  id: string;
  nome: string;
  socket?: Socket;
  lancesEnviados: number;
  lancesConfirmados: number;
  erros: string[];
}

const fornecedores: Fornecedor[] = [
  { id: 'fornecedor-teste-1', nome: 'FORNECEDOR TESTE ALPHA', lancesEnviados: 0, lancesConfirmados: 0, erros: [] },
  { id: 'fornecedor-teste-2', nome: 'FORNECEDOR TESTE BETA', lancesEnviados: 0, lancesConfirmados: 0, erros: [] },
  { id: 'fornecedor-teste-3', nome: 'FORNECEDOR TESTE GAMMA', lancesEnviados: 0, lancesConfirmados: 0, erros: [] },
];

let itemEmDisputa: string | null = null;
let melhorLanceAtual = 1000000; // Valor inicial alto

async function conectarFornecedor(fornecedor: Fornecedor): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = io(BACKEND_URL, {
      path: '/disputa',
      transports: ['websocket'],
    });

    fornecedor.socket = socket;

    socket.on('connect', () => {
      console.log(`[${fornecedor.nome}] Conectado ao servidor`);
      
      // Entrar na sala
      socket.emit('entrar_sala', {
        sessaoId: SESSAO_ID,
        tipoCliente: 'FORNECEDOR',
        fornecedorId: fornecedor.id,
        fornecedorNome: fornecedor.nome,
      });
    });

    socket.on('sala_conectada', (data) => {
      console.log(`[${fornecedor.nome}] Entrou na sala - ${data.itens?.length || 0} itens`);
      
      // Encontrar item em disputa
      const itemDisputa = data.itens?.find((i: any) => i.status === 'EM_DISPUTA');
      if (itemDisputa) {
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

function enviarLance(fornecedor: Fornecedor, valor: number): void {
  if (!fornecedor.socket || !itemEmDisputa) return;

  fornecedor.socket.emit('enviar_lance', {
    sessaoId: SESSAO_ID,
    itemId: itemEmDisputa,
    valor,
  });

  fornecedor.lancesEnviados++;
  console.log(`[${fornecedor.nome}] 📤 Lance enviado: R$ ${valor.toFixed(2)}`);
}

async function testarConcorrencia(): Promise<void> {
  console.log('='.repeat(60));
  console.log('TESTE DE CONCORRÊNCIA DE LANCES');
  console.log('='.repeat(60));
  console.log(`Sessão: ${SESSAO_ID}`);
  console.log(`Fornecedores: ${fornecedores.length}`);
  console.log('='.repeat(60));

  // Conectar todos os fornecedores
  console.log('\n📡 Conectando fornecedores...\n');
  
  try {
    await Promise.all(fornecedores.map(f => conectarFornecedor(f)));
  } catch (error) {
    console.error('Erro ao conectar fornecedores:', error);
    process.exit(1);
  }

  if (!itemEmDisputa) {
    console.error('\n❌ Nenhum item em disputa encontrado!');
    console.log('Certifique-se de que há um item com status EM_DISPUTA na sessão.');
    desconectarTodos();
    process.exit(1);
  }

  // Aguardar um pouco para estabilizar
  await sleep(1000);

  console.log('\n🚀 Iniciando lances simultâneos...\n');

  // Rodada 1: Lances simultâneos
  const valorBase = melhorLanceAtual - 10;
  
  // Enviar lances quase simultaneamente (com pequeno delay para simular rede)
  const promessas = fornecedores.map((f, idx) => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        enviarLance(f, valorBase - (idx * 5)); // Cada um tenta um valor diferente
        resolve();
      }, idx * 50); // 50ms de delay entre cada
    });
  });

  await Promise.all(promessas);

  // Aguardar processamento
  await sleep(2000);

  // Rodada 2: Lances realmente simultâneos (mesmo momento)
  console.log('\n🔥 Rodada 2: Lances SIMULTÂNEOS (mesmo valor)...\n');
  
  const valorSimultaneo = melhorLanceAtual - 20;
  
  // Todos enviam ao mesmo tempo
  fornecedores.forEach(f => {
    enviarLance(f, valorSimultaneo);
  });

  // Aguardar processamento
  await sleep(2000);

  // Rodada 3: Lances em rajada
  console.log('\n⚡ Rodada 3: Lances em RAJADA...\n');
  
  for (let i = 0; i < 5; i++) {
    const valorRajada = melhorLanceAtual - (i + 1) * 2;
    const fornecedorAleatorio = fornecedores[Math.floor(Math.random() * fornecedores.length)];
    enviarLance(fornecedorAleatorio, valorRajada);
    await sleep(100);
  }

  // Aguardar processamento final
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
  console.log(`Taxa de sucesso: ${((totalConfirmados / totalEnviados) * 100).toFixed(1)}%`);
  console.log('='.repeat(60));

  // Desconectar
  desconectarTodos();
}

function desconectarTodos(): void {
  fornecedores.forEach(f => {
    if (f.socket) {
      f.socket.disconnect();
    }
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Executar
testarConcorrencia().catch(console.error);

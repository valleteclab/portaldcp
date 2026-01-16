/**
 * Script para criar licitações de teste para a sala de disputa
 * 
 * Uso: npx ts-node scripts/seed-licitacoes-teste.ts
 * 
 * Cria:
 * - 1 licitação com disputa POR ITEM (2 itens)
 * - 1 licitação com disputa POR LOTE (2 lotes, 3 itens cada)
 * - 1 sessão de disputa para cada licitação
 * - 2 fornecedores de teste
 * - Propostas iniciais dos fornecedores
 */

import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  host: process.env.DATABASE_URL ? undefined : (process.env.DB_HOST || 'localhost'),
  port: process.env.DATABASE_URL ? undefined : parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DATABASE_URL ? undefined : (process.env.DB_USERNAME || 'admin'),
  password: process.env.DATABASE_URL ? undefined : (process.env.DB_PASSWORD || 'admin_password'),
  database: process.env.DATABASE_URL ? undefined : (process.env.DB_DATABASE || 'licitafacil'),
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  synchronize: false,
});

async function seed() {
  console.log('🚀 Iniciando seed de licitações de teste...\n');

  await AppDataSource.initialize();
  console.log('✅ Conexão com banco estabelecida\n');

  const queryRunner = AppDataSource.createQueryRunner();

  try {
    // Buscar um órgão existente
    const orgao = await queryRunner.query(`
      SELECT id, nome FROM orgaos LIMIT 1
    `);

    if (!orgao || orgao.length === 0) {
      console.log('❌ Nenhum órgão encontrado. Crie um órgão primeiro.');
      return;
    }

    const orgaoId = orgao[0].id;
    console.log(`📍 Usando órgão: ${orgao[0].nome} (${orgaoId})\n`);

    // Buscar um usuário do órgão para ser pregoeiro
    const usuario = await queryRunner.query(`
      SELECT id, nome FROM usuarios WHERE orgao_id = $1 LIMIT 1
    `, [orgaoId]);

    const pregoeiroId = usuario?.[0]?.id || orgaoId;
    const pregoeiroNome = usuario?.[0]?.nome || 'Pregoeiro Teste';

    // ========================================
    // LICITAÇÃO 1: DISPUTA POR ITEM
    // ========================================
    console.log('📝 Criando Licitação 1 - Disputa por ITEM...');

    const dataAbertura = new Date();
    dataAbertura.setHours(dataAbertura.getHours() + 1);

    const licitacao1Result = await queryRunner.query(`
      INSERT INTO licitacoes (
        orgao_id, numero_edital, numero_processo, ano, objeto,
        modalidade, criterio_julgamento, modo_disputa,
        usa_lotes, fase, status,
        data_publicacao, data_abertura_sessao,
        valor_total_estimado, intervalo_minimo_lances
      ) VALUES (
        $1, '001/2026', '2026/000001', 2026, 'Aquisição de Equipamentos de Informática - TESTE DISPUTA POR ITEM',
        'PREGAO_ELETRONICO', 'MENOR_PRECO', 'ABERTO',
        false, 'ANALISE_PROPOSTAS', 'ATIVO',
        NOW(), $2,
        50000.00, 3
      ) RETURNING id
    `, [orgaoId, dataAbertura]);

    const licitacao1Id = licitacao1Result[0].id;
    console.log(`   ✅ Licitação criada: ${licitacao1Id}`);

    // Itens da licitação 1
    await queryRunner.query(`
      INSERT INTO itens_licitacao (
        licitacao_id, numero_item, descricao_resumida, descricao_detalhada,
        quantidade, unidade_medida, valor_unitario_estimado, valor_total_estimado,
        status, status_disputa
      ) VALUES 
      ($1, 1, 'Notebook Dell Latitude 5520', 'Notebook Dell Latitude 5520, Intel Core i7, 16GB RAM, SSD 512GB, Tela 15.6"', 
       10, 'UNIDADE', 4500.00, 45000.00, 'ATIVO', 'AGUARDANDO'),
      ($1, 2, 'Mouse Logitech MX Master 3', 'Mouse sem fio Logitech MX Master 3, ergonômico, Bluetooth',
       20, 'UNIDADE', 250.00, 5000.00, 'ATIVO', 'AGUARDANDO')
    `, [licitacao1Id]);
    console.log('   ✅ 2 itens criados');

    // ========================================
    // LICITAÇÃO 2: DISPUTA POR LOTE
    // ========================================
    console.log('\n📝 Criando Licitação 2 - Disputa por LOTE...');

    const licitacao2Result = await queryRunner.query(`
      INSERT INTO licitacoes (
        orgao_id, numero_edital, numero_processo, ano, objeto,
        modalidade, criterio_julgamento, modo_disputa,
        usa_lotes, fase, status,
        data_publicacao, data_abertura_sessao,
        valor_total_estimado, intervalo_minimo_lances
      ) VALUES (
        $1, '002/2026', '2026/000002', 2026, 'Aquisição de Materiais de Escritório e Limpeza - TESTE DISPUTA POR LOTE',
        'PREGAO_ELETRONICO', 'MENOR_PRECO', 'ABERTO',
        true, 'ANALISE_PROPOSTAS', 'ATIVO',
        NOW(), $2,
        30000.00, 3
      ) RETURNING id
    `, [orgaoId, dataAbertura]);

    const licitacao2Id = licitacao2Result[0].id;
    console.log(`   ✅ Licitação criada: ${licitacao2Id}`);

    // Criar lotes
    const lote1Result = await queryRunner.query(`
      INSERT INTO lotes_licitacao (licitacao_id, numero, descricao, valor_estimado)
      VALUES ($1, 1, 'Materiais de Escritório', 15000.00)
      RETURNING id
    `, [licitacao2Id]);
    const lote1Id = lote1Result[0].id;

    const lote2Result = await queryRunner.query(`
      INSERT INTO lotes_licitacao (licitacao_id, numero, descricao, valor_estimado)
      VALUES ($1, 2, 'Materiais de Limpeza', 15000.00)
      RETURNING id
    `, [licitacao2Id]);
    const lote2Id = lote2Result[0].id;
    console.log('   ✅ 2 lotes criados');

    // Itens do lote 1
    await queryRunner.query(`
      INSERT INTO itens_licitacao (
        licitacao_id, lote_id, numero_item, descricao_resumida,
        quantidade, unidade_medida, valor_unitario_estimado, valor_total_estimado,
        status, status_disputa
      ) VALUES 
      ($1, $2, 1, 'Papel A4 75g/m² - Resma 500 folhas', 100, 'UNIDADE', 25.00, 2500.00, 'ATIVO', 'AGUARDANDO'),
      ($1, $2, 2, 'Caneta esferográfica azul', 500, 'UNIDADE', 1.50, 750.00, 'ATIVO', 'AGUARDANDO'),
      ($1, $2, 3, 'Grampeador de mesa', 50, 'UNIDADE', 35.00, 1750.00, 'ATIVO', 'AGUARDANDO')
    `, [licitacao2Id, lote1Id]);

    // Itens do lote 2
    await queryRunner.query(`
      INSERT INTO itens_licitacao (
        licitacao_id, lote_id, numero_item, descricao_resumida,
        quantidade, unidade_medida, valor_unitario_estimado, valor_total_estimado,
        status, status_disputa
      ) VALUES 
      ($1, $2, 4, 'Detergente líquido 500ml', 200, 'UNIDADE', 5.00, 1000.00, 'ATIVO', 'AGUARDANDO'),
      ($1, $2, 5, 'Desinfetante 1L', 100, 'UNIDADE', 8.00, 800.00, 'ATIVO', 'AGUARDANDO'),
      ($1, $2, 6, 'Papel higiênico - Fardo 64 rolos', 50, 'UNIDADE', 80.00, 4000.00, 'ATIVO', 'AGUARDANDO')
    `, [licitacao2Id, lote2Id]);
    console.log('   ✅ 6 itens criados (3 por lote)');

    // ========================================
    // CRIAR FORNECEDORES DE TESTE
    // ========================================
    console.log('\n👥 Criando fornecedores de teste...');

    // Verificar se já existem
    const fornecedoresExistentes = await queryRunner.query(`
      SELECT id FROM fornecedores WHERE cnpj IN ('11111111000111', '22222222000122')
    `);

    let fornecedor1Id: string, fornecedor2Id: string;

    if (fornecedoresExistentes.length < 2) {
      const f1 = await queryRunner.query(`
        INSERT INTO fornecedores (cnpj, razao_social, nome_fantasia, email, telefone, senha)
        VALUES ('11111111000111', 'Fornecedor Teste Alpha LTDA', 'Alpha Tech', 'alpha@teste.com', '11999999999', 'teste123')
        ON CONFLICT (cnpj) DO UPDATE SET razao_social = EXCLUDED.razao_social
        RETURNING id
      `);
      fornecedor1Id = f1[0].id;

      const f2 = await queryRunner.query(`
        INSERT INTO fornecedores (cnpj, razao_social, nome_fantasia, email, telefone, senha)
        VALUES ('22222222000122', 'Fornecedor Teste Beta LTDA', 'Beta Supplies', 'beta@teste.com', '11888888888', 'teste123')
        ON CONFLICT (cnpj) DO UPDATE SET razao_social = EXCLUDED.razao_social
        RETURNING id
      `);
      fornecedor2Id = f2[0].id;
      console.log('   ✅ 2 fornecedores criados');
    } else {
      fornecedor1Id = fornecedoresExistentes[0].id;
      fornecedor2Id = fornecedoresExistentes[1]?.id || fornecedoresExistentes[0].id;
      console.log('   ✅ Fornecedores já existem');
    }

    // ========================================
    // CRIAR SESSÕES DE DISPUTA
    // ========================================
    console.log('\n🎯 Criando sessões de disputa...');

    // Sessão 1 - Por Item
    const sessao1Result = await queryRunner.query(`
      INSERT INTO sessoes_disputa (
        licitacao_id, pregoeiro_id, pregoeiro_nome,
        status, etapa, disputa_por_item, modo_aberto,
        tempo_inatividade_minutos, tempo_aleatorio_min_minutos, tempo_aleatorio_max_minutos,
        intervalo_minimo_lances_minutos
      ) VALUES (
        $1, $2, $3,
        'EM_ANDAMENTO', 'DISPUTA_LANCES', true, true,
        10, 2, 30, 3
      ) RETURNING id
    `, [licitacao1Id, pregoeiroId, pregoeiroNome]);
    console.log(`   ✅ Sessão 1 (por item): ${sessao1Result[0].id}`);

    // Sessão 2 - Por Lote
    const sessao2Result = await queryRunner.query(`
      INSERT INTO sessoes_disputa (
        licitacao_id, pregoeiro_id, pregoeiro_nome,
        status, etapa, disputa_por_item, modo_aberto,
        tempo_inatividade_minutos, tempo_aleatorio_min_minutos, tempo_aleatorio_max_minutos,
        intervalo_minimo_lances_minutos
      ) VALUES (
        $1, $2, $3,
        'EM_ANDAMENTO', 'DISPUTA_LANCES', false, true,
        10, 2, 30, 3
      ) RETURNING id
    `, [licitacao2Id, pregoeiroId, pregoeiroNome]);
    console.log(`   ✅ Sessão 2 (por lote): ${sessao2Result[0].id}`);

    // ========================================
    // RESUMO
    // ========================================
    console.log('\n' + '='.repeat(60));
    console.log('✅ SEED CONCLUÍDO COM SUCESSO!');
    console.log('='.repeat(60));
    console.log('\n📋 Licitações criadas:');
    console.log(`   1. Disputa por ITEM: ${licitacao1Id}`);
    console.log(`      - 2 itens (Notebook, Mouse)`);
    console.log(`      - Sessão: ${sessao1Result[0].id}`);
    console.log(`   2. Disputa por LOTE: ${licitacao2Id}`);
    console.log(`      - 2 lotes (Escritório, Limpeza)`);
    console.log(`      - 6 itens total`);
    console.log(`      - Sessão: ${sessao2Result[0].id}`);
    console.log('\n👥 Fornecedores de teste:');
    console.log(`   - Alpha Tech (CNPJ: 11.111.111/0001-11) - senha: teste123`);
    console.log(`   - Beta Supplies (CNPJ: 22.222.222/0001-22) - senha: teste123`);
    console.log('\n🔗 Acesse a sala de disputa em:');
    console.log('   http://localhost:3000/orgao/sala-disputa');
    console.log('\n');

  } catch (error) {
    console.error('❌ Erro durante o seed:', error);
  } finally {
    await queryRunner.release();
    await AppDataSource.destroy();
  }
}

seed();

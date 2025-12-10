// IMPORTANTE: Carregar dotenv ANTES de qualquer outro import
// para garantir que as variáveis de ambiente estejam disponíveis
import * as dotenv from 'dotenv';
import * as path from 'path';

// Tenta múltiplos caminhos para garantir que funcione em qualquer cenário
const envPath = path.resolve(__dirname, '../.env');
const projectRootEnv = path.resolve(process.cwd(), '.env');
const backendEnv = path.resolve(process.cwd(), 'backend/.env');

dotenv.config({ path: envPath });
if (!process.env.PNCP_LOGIN) {
  dotenv.config({ path: projectRootEnv });
}
if (!process.env.PNCP_LOGIN) {
  dotenv.config({ path: backendEnv });
}
if (!process.env.PNCP_LOGIN) {
  dotenv.config(); // Último recurso
}

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';
import { DataSource } from 'typeorm';

async function bootstrap() {
  // Log de variáveis PNCP no startup (para debug no Railway)
  console.log('=== PNCP ENV CHECK ===');
  console.log('PNCP_API_URL:', process.env.PNCP_API_URL ? 'DEFINIDO' : 'NÃO DEFINIDO');
  console.log('PNCP_LOGIN:', process.env.PNCP_LOGIN ? 'DEFINIDO' : 'NÃO DEFINIDO');
  console.log('PNCP_SENHA:', process.env.PNCP_SENHA ? 'DEFINIDO' : 'NÃO DEFINIDO');
  console.log('PNCP_CNPJ_ORGAO:', process.env.PNCP_CNPJ_ORGAO ? 'DEFINIDO' : 'NÃO DEFINIDO');
  console.log('RAILWAY_ENVIRONMENT:', process.env.RAILWAY_ENVIRONMENT || 'NÃO DEFINIDO');
  console.log('NODE_ENV:', process.env.NODE_ENV || 'NÃO DEFINIDO');
  console.log('Total ENV vars:', Object.keys(process.env).length);
  console.log('======================');

  const app = await NestFactory.create(AppModule);
  
  // Migração: Alterar colunas de timestamp para 'timestamp without time zone'
  // Isso garante que as datas sejam armazenadas em horário de Brasília sem conversão UTC
  console.log('🔄 Iniciando migração de colunas de data...');
  try {
    const dataSource = app.get(DataSource);
    await dataSource.query(`
      ALTER TABLE licitacao 
      ALTER COLUMN data_publicacao_edital TYPE timestamp without time zone,
      ALTER COLUMN data_limite_impugnacao TYPE timestamp without time zone,
      ALTER COLUMN data_inicio_acolhimento TYPE timestamp without time zone,
      ALTER COLUMN data_fim_acolhimento TYPE timestamp without time zone,
      ALTER COLUMN data_abertura_sessao TYPE timestamp without time zone
    `);
    console.log('✅ Migração de colunas de data concluída com sucesso!');
  } catch (error: any) {
    // Ignora erro se já estiver no tipo correto
    console.log('ℹ️ Migração de colunas de data:', error?.message || 'já aplicada');
  }
  
  // Aumenta limite de payload para 50MB
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  
  app.enableCors(); // Habilita requisições do Frontend
  app.setGlobalPrefix('api'); // Padroniza rotas como /api/licitacoes
  
  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Backend rodando na porta ${port}`);
}
bootstrap();

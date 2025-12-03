import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';

async function bootstrap() {
  // Log de variáveis PNCP no startup (para debug no Railway)
  console.log('=== PNCP ENV CHECK ===');
  console.log('PNCP_API_URL:', process.env.PNCP_API_URL ? 'DEFINIDO' : 'NÃO DEFINIDO');
  console.log('PNCP_LOGIN:', process.env.PNCP_LOGIN ? 'DEFINIDO' : 'NÃO DEFINIDO');
  console.log('PNCP_SENHA:', process.env.PNCP_SENHA ? 'DEFINIDO' : 'NÃO DEFINIDO');
  console.log('PNCP_CNPJ_ORGAO:', process.env.PNCP_CNPJ_ORGAO ? 'DEFINIDO' : 'NÃO DEFINIDO');
  console.log('======================');

  const app = await NestFactory.create(AppModule);
  
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

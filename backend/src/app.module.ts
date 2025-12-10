import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthController } from './health.controller';
import { AuthModule } from './auth/auth.module';
import { OrgaosModule } from './orgaos/orgaos.module';
import { FornecedoresModule } from './fornecedores/fornecedores.module';
import { LicitacoesModule } from './licitacoes/licitacoes.module';
import { ItensModule } from './itens/itens.module';
import { PropostasModule } from './propostas/propostas.module';
import { LancesModule } from './lances/lances.module';
import { SessaoModule } from './sessao/sessao.module';
import { FaseInternaModule } from './fase-interna/fase-interna.module';
import { AuditModule } from './audit/audit.module';
import { UploadModule } from './upload/upload.module';
import { IaModule } from './ia/ia.module';
import { ImpugnacoesModule } from './impugnacoes/impugnacoes.module';
import { PncpModule } from './pncp/pncp.module';
import { DocumentosModule } from './documentos/documentos.module';
import { ContratosModule } from './contratos/contratos.module';
import { AtasModule } from './atas/atas.module';
import { PcaModule } from './pca/pca.module';
import { CredenciamentoModule } from './credenciamento/credenciamento.module';
import { ContratacaoDiretaModule } from './contratacao-direta/contratacao-direta.module';
import { CatalogoModule } from './catalogo/catalogo.module';
import { DemandasModule } from './demandas/demandas.module';
import { SeedModule } from './seed/seed.module';
import { SystemConfigModule } from './system-config/system-config.module';
import { LotesModule } from './lotes/lotes.module';
import { EsclarecimentosModule } from './esclarecimentos/esclarecimentos.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Não especificar envFilePath - o dotenv já foi carregado no main.ts
      // Isso evita problemas de caminho quando executado de dist/
      ignoreEnvFile: true, // Já carregamos manualmente no main.ts
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      host: process.env.DATABASE_URL ? undefined : (process.env.DB_HOST || 'localhost'),
      port: process.env.DATABASE_URL ? undefined : parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DATABASE_URL ? undefined : (process.env.DB_USERNAME || 'admin'),
      password: process.env.DATABASE_URL ? undefined : (process.env.DB_PASSWORD || 'admin_password'),
      database: process.env.DATABASE_URL ? undefined : (process.env.DB_DATABASE || 'licitafacil'),
      autoLoadEntities: true,
      synchronize: true,
      ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
    }),
    AuthModule,
    OrgaosModule,
    FornecedoresModule,
    LicitacoesModule,
    ItensModule,
    PropostasModule,
    LancesModule,
    SessaoModule,
    FaseInternaModule,
    AuditModule,
    UploadModule,
    IaModule,
    ImpugnacoesModule,
    PncpModule,
    DocumentosModule,
    ContratosModule,
    AtasModule,
    PcaModule,
    CredenciamentoModule,
    ContratacaoDiretaModule,
    CatalogoModule,
    DemandasModule,
    SeedModule,
    SystemConfigModule,
    LotesModule,
    EsclarecimentosModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}

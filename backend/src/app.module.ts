import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { HealthController } from './health.controller';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { ModuloGuard } from './auth/modulo.guard';
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
import { CatalogoModule } from './catalogo/catalogo.module';
import { DemandasModule } from './demandas/demandas.module';
import { SeedModule } from './seed/seed.module';
import { SystemConfigModule } from './system-config/system-config.module';
import { LotesModule } from './lotes/lotes.module';
import { EsclarecimentosModule } from './esclarecimentos/esclarecimentos.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { DisputaModule } from './disputa-v2/disputa.module';
import { DisputaV3Module } from './disputa-v3/disputa-v3.module';
import { AdminModule } from './admin/admin.module';
import { AlmoxarifadoModule } from './almoxarifado/almoxarifado.module';
import { NotificacoesModule } from './notificacoes/notificacoes.module';
import { RelatoriosModule } from './relatorios/relatorios.module';
import { EmailModule } from './email/email.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AssinaturasModule } from './assinaturas/assinaturas.module';
import { PortalAssinaturasModule } from './portal-assinaturas/portal-assinaturas.module';
import { AssinadorModule } from './assinador/assinador.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { AgenteContratosModule } from './agente-contratos/agente-contratos.module';
import { AgenteTarefasModule } from './agente-tarefas/agente-tarefas.module';
import { FrotaModule } from './frota/frota.module';
import { AnpModule } from './anp/anp.module';
import { WhatsappAgentModule } from './whatsapp-agent/whatsapp-agent.module';
import { PatrimonioModule } from './patrimonio/patrimonio.module';
import { MedicaoIaModule } from './medicao-ia/medicao-ia.module';
import { NfseSpedyModule } from './nfse-spedy/nfse-spedy.module';
import { ExtModule } from './ext/ext.module';
import { McpModule } from './mcp/mcp.module';
import { ParametrosLicitacaoModule } from './parametros-licitacao/parametros-licitacao.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Não especificar envFilePath - o dotenv já foi carregado no main.ts
      // Isso evita problemas de caminho quando executado de dist/
      ignoreEnvFile: true, // Já carregamos manualmente no main.ts
    }),
    ScheduleModule.forRoot(),
    // Rate limiting global: 100 requisições por minuto por IP
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minuto em ms
        limit: 100, // 100 requisições por minuto
      },
    ]),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      host: process.env.DATABASE_URL
        ? undefined
        : process.env.DB_HOST || 'localhost',
      port: process.env.DATABASE_URL
        ? undefined
        : parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DATABASE_URL
        ? undefined
        : process.env.DB_USERNAME || 'admin',
      password: process.env.DATABASE_URL
        ? undefined
        : process.env.DB_PASSWORD || 'admin_password',
      database: process.env.DATABASE_URL
        ? undefined
        : process.env.DB_DATABASE || 'licitafacil',
      autoLoadEntities: true,
      // synchronize controlado por env. Default true (mantém deploys atuais);
      // defina DB_SYNCHRONIZE=false após gerar migrations para congelar o schema
      // em produção (evita alteração automática de tabelas durante uma disputa).
      synchronize: process.env.DB_SYNCHRONIZE !== 'false',
      // Migrations empacotadas no build (dist/migrations/*.js) ou fonte (dev).
      migrations: [__dirname + '/migrations/*.{js,ts}'],
      // Rodar migrations no boot só quando DB_MIGRATIONS_RUN=true
      // (usado quando synchronize estiver desligado em produção).
      migrationsRun: process.env.DB_MIGRATIONS_RUN === 'true',
      ssl:
        process.env.DB_SSL === 'false'
          ? false
          : process.env.DATABASE_URL
            ? { rejectUnauthorized: false }
            : false,
      extra: {
        options: '-c timezone=UTC',
      },
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
    CatalogoModule,
    DemandasModule,
    SeedModule,
    SystemConfigModule,
    LotesModule,
    EsclarecimentosModule,
    UsuariosModule,
    DisputaModule,
    DisputaV3Module,
    AdminModule,
    AlmoxarifadoModule,
    NotificacoesModule,
    RelatoriosModule,
    EmailModule,
    WebhooksModule,
    AssinaturasModule,
    PortalAssinaturasModule,
    AssinadorModule,
    WhatsAppModule,
    AgenteContratosModule,
    AgenteTarefasModule,
    FrotaModule,
    AnpModule,
    WhatsappAgentModule,
    PatrimonioModule,
    MedicaoIaModule,
    NfseSpedyModule,
    ExtModule,
    McpModule,
    ParametrosLicitacaoModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ModuloGuard,
    },
  ],
})
export class AppModule {}

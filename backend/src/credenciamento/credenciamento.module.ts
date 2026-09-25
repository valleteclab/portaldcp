import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransicoesModule } from '../licitacoes/transicoes/transicoes.module';
import { HabilitacaoModule } from '../habilitacao/habilitacao.module';
import { ContratosModule } from '../contratos/contratos.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { CredenciamentoController } from './credenciamento.controller';
import { CredenciamentoService } from './credenciamento.service';
import { MigracaoCredenciamentoBootService } from './migracao-credenciamento-boot.service';
import {
  ConfiguracaoCredenciamento,
  ContratacaoCredenciamento,
  InscricaoCredenciamento,
} from './entities/credenciamento.entity';

/**
 * CREDENCIAMENTO COMO PROCESSO (plano E7b): licitação com modalidade
 * CREDENCIAMENTO (máquina de estados, edital, PNCP pela fila) + inscrições
 * (documentos pela habilitação da E4) + contratações distribuídas pela regra
 * do edital, com contrato por inexigibilidade (art. 74 IV).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ConfiguracaoCredenciamento, InscricaoCredenciamento, ContratacaoCredenciamento]),
    TransicoesModule,
    HabilitacaoModule,
    ContratosModule,
    NotificacoesModule,
  ],
  controllers: [CredenciamentoController],
  providers: [CredenciamentoService, MigracaoCredenciamentoBootService],
  exports: [CredenciamentoService],
})
export class CredenciamentoModule {}

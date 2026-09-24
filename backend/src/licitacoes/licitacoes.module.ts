import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Licitacao } from './entities/licitacao.entity';
import { LicitacoesService } from './licitacoes.service';
import { LicitacoesController } from './licitacoes.controller';
import { LicitacoesSchedulerService } from './licitacoes-scheduler.service';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import { LoteLicitacao } from '../lotes/entities/lote-licitacao.entity';
import { Demanda } from '../demandas/entities/demanda.entity';
import { DispensaLance } from './entities/dispensa-lance.entity';
import { DispensaMensagem } from './entities/dispensa-mensagem.entity';
import { DispensaGateway } from './dispensa.gateway';
import { ContratosModule } from '../contratos/contratos.module';
import { PncpModule } from '../pncp/pncp.module';
import { FaseInternaModule } from '../fase-interna/fase-interna.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { ProcessoPdfService } from './processo-pdf.service';
import { IntegracaoPlataformaLicitacao } from './entities/integracao-plataforma.entity';
import { BllIntegracaoService } from './bll-integracao.service';
import { BllIntegracaoController } from './bll-integracao.controller';
import { FornecedoresModule } from '../fornecedores/fornecedores.module';
import { TransicoesModule } from './transicoes/transicoes.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Licitacao, ItemLicitacao, LoteLicitacao, Demanda, DispensaLance, DispensaMensagem, IntegracaoPlataformaLicitacao]),
    forwardRef(() => ContratosModule),
    PncpModule,
    FaseInternaModule,
    NotificacoesModule,
    FornecedoresModule,
    TransicoesModule,
  ],
  controllers: [LicitacoesController, BllIntegracaoController],
  providers: [LicitacoesService, LicitacoesSchedulerService, DispensaGateway, ProcessoPdfService, BllIntegracaoService],
  exports: [TypeOrmModule, LicitacoesService, LicitacoesSchedulerService, TransicoesModule],
})
export class LicitacoesModule {}

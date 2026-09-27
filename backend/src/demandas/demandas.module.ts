import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContratacaoFutura, Demanda, ItemDemanda } from './entities/demanda.entity';
import { DemandasService } from './demandas.service';
import { DemandasController } from './demandas.controller';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { FaseInternaModule } from '../fase-interna/fase-interna.module';
import { LicitacoesModule } from '../licitacoes/licitacoes.module';
import { DfdModule } from './dfd/dfd.module';
import { DfdConsolidadoController } from './dfd/dfd-consolidado.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Demanda, ItemDemanda, ContratacaoFutura]),
    NotificacoesModule,
    // Planejamento no modelo de fluxo (quem aprova a demanda / monta o DFD)
    FaseInternaModule,
    // DFD consolidado: domínio + abrir o processo (LicitacoesService)
    DfdModule,
    LicitacoesModule,
  ],
  controllers: [DemandasController, DfdConsolidadoController],
  providers: [DemandasService],
  exports: [DemandasService],
})
export class DemandasModule {}

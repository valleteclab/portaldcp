import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Licitacao } from './entities/licitacao.entity';
import { LicitacoesService } from './licitacoes.service';
import { LicitacoesController } from './licitacoes.controller';
import { LicitacoesSchedulerService } from './licitacoes-scheduler.service';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import { LoteLicitacao } from '../lotes/entities/lote-licitacao.entity';
import { ContratosModule } from '../contratos/contratos.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Licitacao, ItemLicitacao, LoteLicitacao]),
    forwardRef(() => ContratosModule)
  ],
  controllers: [LicitacoesController],
  providers: [LicitacoesService, LicitacoesSchedulerService],
  exports: [TypeOrmModule, LicitacoesService, LicitacoesSchedulerService],
})
export class LicitacoesModule {}

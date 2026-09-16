import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContratacaoFutura, Demanda, ItemDemanda } from './entities/demanda.entity';
import { DemandasService } from './demandas.service';
import { DemandasController } from './demandas.controller';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Demanda, ItemDemanda, ContratacaoFutura]),
    NotificacoesModule,
  ],
  controllers: [DemandasController],
  providers: [DemandasService],
  exports: [DemandasService],
})
export class DemandasModule {}

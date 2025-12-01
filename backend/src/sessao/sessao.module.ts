import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { SessaoDisputa } from './entities/sessao-disputa.entity';
import { EventoSessao } from './entities/evento-sessao.entity';
import { SessaoService } from './sessao.service';
import { SessaoController } from './sessao.controller';
import { SessaoGateway } from './sessao.gateway';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import { Lance } from '../lances/entities/lance.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SessaoDisputa,
      EventoSessao,
      Licitacao,
      ItemLicitacao,
      Lance,
    ]),
    ScheduleModule.forRoot(),
  ],
  controllers: [SessaoController],
  providers: [SessaoService, SessaoGateway],
  exports: [SessaoService],
})
export class SessaoModule {}

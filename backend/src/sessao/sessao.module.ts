import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { SessaoDisputa } from './entities/sessao-disputa.entity';
import { EventoSessao } from './entities/evento-sessao.entity';
import { RecursoAdministrativo } from './entities/recurso-administrativo.entity';
import { SessaoService } from './sessao.service';
import { RecursosService } from './recursos.service';
import { SessaoController } from './sessao.controller';
import { SessaoGateway } from './sessao.gateway';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import { Lance } from '../lances/entities/lance.entity';
import { Proposta } from '../propostas/entities/proposta.entity';
import { PropostaItem } from '../propostas/entities/proposta-item.entity';
import { ParametrosLicitacaoModule } from '../parametros-licitacao/parametros-licitacao.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SessaoDisputa,
      EventoSessao,
      RecursoAdministrativo,
      Licitacao,
      ItemLicitacao,
      Lance,
      Proposta,
      PropostaItem,
    ]),
    ScheduleModule.forRoot(),
    ParametrosLicitacaoModule,
  ],
  controllers: [SessaoController],
  providers: [SessaoService, RecursosService, SessaoGateway],
  exports: [SessaoService, RecursosService],
})
export class SessaoModule {}

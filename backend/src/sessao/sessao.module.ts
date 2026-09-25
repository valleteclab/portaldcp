import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessaoDisputa } from './entities/sessao-disputa.entity';
import { EventoSessao } from './entities/evento-sessao.entity';
import { RecursoAdministrativo } from './entities/recurso-administrativo.entity';
import { SessaoService } from './sessao.service';
import { RecursosService } from './recursos.service';
import { SessaoController } from './sessao.controller';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import { Lance } from '../disputa-v2/entities/lance.entity';
import { Proposta } from '../propostas/entities/proposta.entity';
import { PropostaItem } from '../propostas/entities/proposta-item.entity';
import { ParametrosLicitacaoModule } from '../parametros-licitacao/parametros-licitacao.module';
import { SigiloDisputaService } from '../disputa-v2/sigilo-disputa.service';
import { TransicoesModule } from '../licitacoes/transicoes/transicoes.module';
import { DisputaModule } from '../disputa-v2/disputa.module';
import { JulgamentoModule } from '../julgamento/julgamento.module';

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
    ParametrosLicitacaoModule,
    TransicoesModule,
    DisputaModule,
    JulgamentoModule,
  ],
  controllers: [SessaoController],
  // Tempo real: gateway único /disputa-v2 (o gateway /sessao foi removido na E2 item 8)
  providers: [SessaoService, RecursosService, SigiloDisputaService],
  exports: [SessaoService, RecursosService],
})
export class SessaoModule {}

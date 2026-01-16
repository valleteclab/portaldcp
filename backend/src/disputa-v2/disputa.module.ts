import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisputaService } from './disputa.service';
import { DisputaGateway } from './disputa.gateway';
import { DisputaController } from './disputa.controller';
import { DisputaTimerService } from './disputa-timer.service';
import { AnonimizacaoService } from './anonimizacao.service';

// Reutilizando entidades existentes
import { SessaoDisputa } from '../sessao/entities/sessao-disputa.entity';
import { EventoSessao } from '../sessao/entities/evento-sessao.entity';
import { MapeamentoAnonimo } from '../sessao/entities/mapeamento-anonimo.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import { Lance } from '../lances/entities/lance.entity';
import { Proposta } from '../propostas/entities/proposta.entity';
import { PropostaItem } from '../propostas/entities/proposta-item.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SessaoDisputa,
      EventoSessao,
      MapeamentoAnonimo,
      Licitacao,
      ItemLicitacao,
      Lance,
      Proposta,
      PropostaItem,
    ]),
  ],
  controllers: [DisputaController],
  providers: [DisputaService, DisputaGateway, DisputaTimerService, AnonimizacaoService],
  exports: [DisputaService, DisputaGateway, AnonimizacaoService],
})
export class DisputaModule {}

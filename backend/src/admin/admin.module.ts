import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminMonitoramentoController } from './admin-monitoramento.controller';
import { SessaoDisputa } from '../sessao/entities/sessao-disputa.entity';
import { EventoSessao } from '../sessao/entities/evento-sessao.entity';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import { Lance } from '../lances/entities/lance.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { DisputaModule } from '../disputa-v2/disputa.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SessaoDisputa,
      EventoSessao,
      ItemLicitacao,
      Lance,
      Licitacao,
    ]),
    forwardRef(() => DisputaModule),
  ],
  controllers: [AdminMonitoramentoController],
})
export class AdminModule {}

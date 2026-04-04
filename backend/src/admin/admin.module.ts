import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminMonitoramentoController } from './admin-monitoramento.controller';
import { AdminTestesController } from './admin-testes.controller';
import { AdminTestesService } from './admin-testes.service';
import { SessaoDisputa } from '../sessao/entities/sessao-disputa.entity';
import { EventoSessao } from '../sessao/entities/evento-sessao.entity';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import { Lance } from '../lances/entities/lance.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { DisputaModule } from '../disputa-v2/disputa.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SessaoDisputa,
      EventoSessao,
      ItemLicitacao,
      Lance,
      Licitacao,
      Orgao,
    ]),
    forwardRef(() => DisputaModule),
    AuthModule, // fornece JwtService para AdminTestesService
  ],
  controllers: [AdminMonitoramentoController, AdminTestesController],
  providers: [AdminTestesService],
})
export class AdminModule {}

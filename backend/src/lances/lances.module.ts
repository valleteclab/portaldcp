import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lance } from './entities/lance.entity';
import { MensagemChat } from './entities/mensagem-chat.entity';
import { LancesGateway } from './lances.gateway';
import { LancesService } from './lances.service';
import { LicitacoesModule } from '../licitacoes/licitacoes.module';
import { SessaoDisputa } from '../sessao/entities/sessao-disputa.entity';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import { SigiloDisputaService } from '../disputa-v2/sigilo-disputa.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Lance, MensagemChat, SessaoDisputa, ItemLicitacao]),
    LicitacoesModule,
  ],
  providers: [LancesGateway, LancesService, SigiloDisputaService],
  exports: [LancesService],
})
export class LancesModule {}

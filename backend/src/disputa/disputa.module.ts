import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisputaService } from './disputa.service';
import { DisputaGateway } from './disputa.gateway';
import { DisputaController } from './disputa.controller';
import { DisputaTimerService } from './disputa-timer.service';
import { AnonimizacaoService } from './anonimizacao.service';
import { SigiloDisputaService } from './sigilo-disputa.service';
import { ParametrosDisputaService } from './parametros-disputa.service';
import { AtaSessaoSnapshot } from './entities/ata-sessao-snapshot.entity';
import { MigracaoLancesBootService } from './migracao-lances-boot.service';
import { DisputaLoteService } from './disputa-lote.service';
import { LoteLicitacao } from '../lotes/entities/lote-licitacao.entity';
import { JanelaDispensaService } from './janela-dispensa.service';
import { MigracaoDispensaBootService } from './migracao-dispensa-boot.service';
import { ModoDisputaService } from './modo-disputa.service';
import { DesconexaoPregoeiroService } from './desconexao-pregoeiro.service';
import { ModosDisputaController } from './modos-disputa.controller';
import { EstadoModoItem } from './entities/estado-modo-item.entity';
import { SalaDisputaController } from './presenter/sala-disputa.controller';
import { SalaDisputaService } from './presenter/sala-disputa.service';

// Reutilizando entidades existentes
import { SessaoDisputa } from '../sessao/entities/sessao-disputa.entity';
import { EventoSessao } from '../sessao/entities/evento-sessao.entity';
import { MapeamentoAnonimo } from '../sessao/entities/mapeamento-anonimo.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import { Lance } from './entities/lance.entity';
import { Proposta } from '../propostas/entities/proposta.entity';
import { PropostaItem } from '../propostas/entities/proposta-item.entity';
import { TransicoesModule } from '../licitacoes/transicoes/transicoes.module';

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
      LoteLicitacao,
      AtaSessaoSnapshot,
      EstadoModoItem,
    ]),
    TransicoesModule,
  ],
  controllers: [DisputaController, ModosDisputaController, SalaDisputaController],
  providers: [
    DisputaService,
    DisputaLoteService,
    DisputaGateway,
    DisputaTimerService,
    AnonimizacaoService,
    SigiloDisputaService,
    ParametrosDisputaService,
    MigracaoLancesBootService,
    JanelaDispensaService,
    MigracaoDispensaBootService,
    ModoDisputaService,
    DesconexaoPregoeiroService,
    SalaDisputaService,
  ],
  exports: [SalaDisputaService, DisputaLoteService, ModoDisputaService, DesconexaoPregoeiroService, DisputaService, DisputaGateway, JanelaDispensaService, AnonimizacaoService, SigiloDisputaService, ParametrosDisputaService],
})
export class DisputaModule {}

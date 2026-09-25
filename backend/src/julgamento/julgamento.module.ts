import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisputaModule } from '../disputa-v2/disputa.module';
import { TransicoesModule } from '../licitacoes/transicoes/transicoes.module';
import { ParametrosLicitacaoModule } from '../parametros-licitacao/parametros-licitacao.module';
import { SessaoDisputa } from '../sessao/entities/sessao-disputa.entity';
import { EventoSessao } from '../sessao/entities/evento-sessao.entity';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import { LicitanteUnidade } from './entities/licitante-unidade.entity';
import { AceitacaoProposta } from './entities/aceitacao-proposta.entity';
import { RankingService } from './ranking.service';
import { AceitacaoService } from './aceitacao.service';
import { JulgamentoController } from './julgamento.controller';
import { MigracaoJulgamentoBootService } from './migracao-julgamento-boot.service';

/**
 * JULGAMENTO (plano E3): ranking único por unidade, situação do licitante na
 * unidade e aceitação da proposta. Depende do motor (disputa-v2) — nunca o
 * contrário (o motor usa só as funções SQL de `licitantes-unidade.sql.ts`).
 * Próximas partes da E3 (ME/EPP, negociação, julgamento técnico) entram aqui.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([LicitanteUnidade, AceitacaoProposta, SessaoDisputa, EventoSessao, ItemLicitacao]),
    DisputaModule,
    TransicoesModule,
    ParametrosLicitacaoModule,
  ],
  controllers: [JulgamentoController],
  providers: [RankingService, AceitacaoService, MigracaoJulgamentoBootService],
  exports: [RankingService, AceitacaoService],
})
export class JulgamentoModule {}

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
import { NegociacaoUnidade } from './entities/negociacao-unidade.entity';
import { NegociacaoService } from './negociacao.service';
import { NegociacaoController } from './negociacao.controller';
import { MigracaoJulgamentoBootService } from './migracao-julgamento-boot.service';
import { DesempateMpe } from './me-epp/entities/desempate-mpe.entity';
import { ConvocacaoDesempateMpe } from './me-epp/entities/convocacao-desempate-mpe.entity';
import { MeEppService } from './me-epp/me-epp.service';
import { MeEppController } from './me-epp/me-epp.controller';
import { MigracaoMeEppBootService } from './me-epp/migracao-me-epp-boot.service';
import { Desempate, DesempateOferta } from './entities/desempate.entity';
import {
  ComissaoJulgamento,
  DocumentoTecnico,
  JulgamentoTecnico,
  NotaTecnica,
  PropostaRetornoEconomico,
  QuesitoTecnico,
} from './entities/julgamento-tecnico.entity';
import { DesempateService } from './desempate.service';
import { DesempateController } from './desempate.controller';
import { JulgamentoTecnicoService } from './julgamento-tecnico.service';
import { JulgamentoTecnicoController } from './julgamento-tecnico.controller';

/** Desempate do art. 60 + julgamento técnico (arts. 35–37) e maior retorno (art. 39). */
const ENTIDADES_DESEMPATE_E_TECNICA = [
  Desempate,
  DesempateOferta,
  JulgamentoTecnico,
  QuesitoTecnico,
  ComissaoJulgamento,
  NotaTecnica,
  DocumentoTecnico,
  PropostaRetornoEconomico,
];

/**
 * JULGAMENTO (plano E3): ranking único por unidade, situação do licitante na
 * unidade e aceitação da proposta. Depende do motor (disputa-v2) — nunca o
 * contrário (o motor usa só as funções SQL de `licitantes-unidade.sql.ts`).
 * Próximas partes da E3 (ME/EPP, negociação, julgamento técnico) entram aqui.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([LicitanteUnidade, AceitacaoProposta, NegociacaoUnidade, SessaoDisputa, EventoSessao, ItemLicitacao, DesempateMpe, ConvocacaoDesempateMpe]),
    TypeOrmModule.forFeature(ENTIDADES_DESEMPATE_E_TECNICA),
    DisputaModule,
    TransicoesModule,
    ParametrosLicitacaoModule,
  ],
  controllers: [JulgamentoController, NegociacaoController, MeEppController, DesempateController, JulgamentoTecnicoController],
  providers: [RankingService, AceitacaoService, NegociacaoService, MigracaoJulgamentoBootService, MeEppService, MigracaoMeEppBootService, DesempateService, JulgamentoTecnicoService],
  exports: [RankingService, AceitacaoService, NegociacaoService, MeEppService, DesempateService, JulgamentoTecnicoService],
})
export class JulgamentoModule {}

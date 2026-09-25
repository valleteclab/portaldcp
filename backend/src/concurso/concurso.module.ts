import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransicoesModule } from '../licitacoes/transicoes/transicoes.module';
import { JulgamentoModule } from '../julgamento/julgamento.module';
import { ResultadoModule } from '../resultado/resultado.module';
import { EventoSessao } from '../sessao/entities/evento-sessao.entity';
import { SessaoDisputa } from '../sessao/entities/sessao-disputa.entity';
import { Proposta } from '../propostas/entities/proposta.entity';
import { PropostaItem } from '../propostas/entities/proposta-item.entity';
import { ConcursoPremiacao, ConcursoRegulamento, ConcursoTrabalho } from './concurso.entities';
import { ConcursoService } from './concurso.service';
import { ConcursoController } from './concurso.controller';

/**
 * CONCURSO (plano E7c — Lei 14.133/2021 art. 30): regulamento, inscrição com
 * trabalho sob código (sigilo de autoria), banca (julgamento técnico da E3),
 * qualificação do vencedor, premiação e cessão de direitos (art. 93).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ConcursoRegulamento, ConcursoTrabalho, ConcursoPremiacao, EventoSessao, SessaoDisputa, Proposta, PropostaItem]),
    TransicoesModule,
    JulgamentoModule,
    ResultadoModule,
  ],
  controllers: [ConcursoController],
  providers: [ConcursoService],
  exports: [ConcursoService],
})
export class ConcursoModule {}

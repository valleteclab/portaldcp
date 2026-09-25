import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransicoesModule } from '../licitacoes/transicoes/transicoes.module';
import { JulgamentoModule } from '../julgamento/julgamento.module';
import { ResultadoModule } from '../resultado/resultado.module';
import { EventoSessao } from '../sessao/entities/evento-sessao.entity';
import { Arrematacao, LeilaoBem, LeilaoConfiguracao } from './leilao.entities';
import { LeilaoService } from './leilao.service';
import { LeilaoController } from './leilao.controller';

/**
 * LEILÃO (plano E7c — Lei 14.133/2021 art. 31): edital (bens, avaliação,
 * preço mínimo, leiloeiro, pagamento), declaração dos arrematantes, pagamento
 * e termo de arrematação. A disputa é a do motor único (direção MAIOR) e o
 * resultado passa pelo ResultadoService (gancho registrado no boot).
 */
@Module({
  imports: [TypeOrmModule.forFeature([LeilaoConfiguracao, LeilaoBem, Arrematacao, EventoSessao]), TransicoesModule, JulgamentoModule, ResultadoModule],
  controllers: [LeilaoController],
  providers: [LeilaoService],
  exports: [LeilaoService],
})
export class LeilaoModule {}

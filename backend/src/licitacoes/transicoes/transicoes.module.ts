import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Licitacao } from '../entities/licitacao.entity';
import { LicitacaoTransicao } from './licitacao-transicao.entity';
import { MigracaoSituacaoBootService } from './migracao-situacao-boot.service';
import { TransicoesEventos } from './transicoes-eventos';
import { TransicoesService } from './transicoes.service';

/**
 * Máquina de estados da licitação. Módulo SEM dependências de outros módulos
 * de negócio (só TypeORM) — sessao, pncp, fase-interna, itens e scheduler
 * podem importá-lo sem ciclo.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Licitacao, LicitacaoTransicao])],
  providers: [TransicoesService, TransicoesEventos, MigracaoSituacaoBootService],
  exports: [TransicoesService, TransicoesEventos],
})
export class TransicoesModule {}

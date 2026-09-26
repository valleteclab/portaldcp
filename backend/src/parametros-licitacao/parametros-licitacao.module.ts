import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParametroLicitacao } from './entities/parametro-licitacao.entity';
import { LimiteLegal } from './entities/limite-legal.entity';
import { ParametrosLicitacaoService } from './parametros-licitacao.service';
import { ParametrosLicitacaoController } from './parametros-licitacao.controller';
import { ConsumoLimiteService } from './consumo-limite.service';

@Module({
  imports: [TypeOrmModule.forFeature([ParametroLicitacao, LimiteLegal])],
  controllers: [ParametrosLicitacaoController],
  providers: [ParametrosLicitacaoService, ConsumoLimiteService],
  exports: [ParametrosLicitacaoService, ConsumoLimiteService],
})
export class ParametrosLicitacaoModule {}

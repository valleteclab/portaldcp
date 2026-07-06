import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParametroLicitacao } from './entities/parametro-licitacao.entity';
import { LimiteLegal } from './entities/limite-legal.entity';
import { ParametrosLicitacaoService } from './parametros-licitacao.service';
import { ParametrosLicitacaoController } from './parametros-licitacao.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ParametroLicitacao, LimiteLegal])],
  controllers: [ParametrosLicitacaoController],
  providers: [ParametrosLicitacaoService],
  exports: [ParametrosLicitacaoService],
})
export class ParametrosLicitacaoModule {}

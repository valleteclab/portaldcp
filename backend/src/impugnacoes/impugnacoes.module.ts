import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImpugnacoesController } from './impugnacoes.controller';
import { ImpugnacoesService } from './impugnacoes.service';
import { Impugnacao } from './impugnacao.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Impugnacao, Licitacao])],
  controllers: [ImpugnacoesController],
  providers: [ImpugnacoesService],
  exports: [ImpugnacoesService],
})
export class ImpugnacoesModule {}

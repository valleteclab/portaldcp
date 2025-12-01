import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Licitacao } from './entities/licitacao.entity';
import { LicitacoesService } from './licitacoes.service';
import { LicitacoesController } from './licitacoes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Licitacao])],
  controllers: [LicitacoesController],
  providers: [LicitacoesService],
  exports: [TypeOrmModule, LicitacoesService],
})
export class LicitacoesModule {}

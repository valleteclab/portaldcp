import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentoFaseInterna } from './entities/documento-fase-interna.entity';
import { FaseInternaService } from './fase-interna.service';
import { FaseInternaController } from './fase-interna.controller';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentoFaseInterna, Licitacao]),
  ],
  controllers: [FaseInternaController],
  providers: [FaseInternaService],
  exports: [FaseInternaService],
})
export class FaseInternaModule {}

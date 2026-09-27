import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NumeracaoProcessoOrgao, SequenciaNumeroProcesso } from './numero-processo.entities';
import { NumeroProcessoService } from './numero-processo.service';
import { NumeroProcessoController } from './numero-processo.controller';

/** Gerador único do nº do processo administrativo (sequencial por órgão/ano, máscara do órgão). */
@Module({
  imports: [TypeOrmModule.forFeature([NumeracaoProcessoOrgao, SequenciaNumeroProcesso])],
  controllers: [NumeroProcessoController],
  providers: [NumeroProcessoService],
  exports: [NumeroProcessoService],
})
export class NumeroProcessoModule {}

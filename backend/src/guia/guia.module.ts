import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FaseInternaModule } from '../fase-interna/fase-interna.module';
import { ProcessoModule } from '../processo/processo.module';
import { GuiaAndamento } from './guia-andamento.entity';
import { GuiaController } from './guia.controller';
import { GuiaService } from './guia.service';

/** Guia de primeiros passos: só lê os módulos de demandas, fluxo e processo. */
@Module({
  imports: [TypeOrmModule.forFeature([GuiaAndamento]), FaseInternaModule, ProcessoModule],
  controllers: [GuiaController],
  providers: [GuiaService],
})
export class GuiaModule {}

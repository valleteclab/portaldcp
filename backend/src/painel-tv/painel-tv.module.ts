import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FaseInternaModule } from '../fase-interna/fase-interna.module';
import { ConfiguracaoPainelTv, PainelTvLink } from './painel-tv-link.entity';
import { PainelTvController, PainelTvGestaoController } from './painel-tv.controller';
import { PainelTvService } from './painel-tv.service';

/** Painel para TV do setor de licitação (links com token, só leitura). */
@Module({
  imports: [FaseInternaModule, TypeOrmModule.forFeature([PainelTvLink, ConfiguracaoPainelTv])],
  controllers: [PainelTvController, PainelTvGestaoController],
  providers: [PainelTvService],
})
export class PainelTvModule {}

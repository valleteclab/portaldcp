import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Proposta } from './entities/proposta.entity';
import { PropostaItem } from './entities/proposta-item.entity';
import { PropostasService } from './propostas.service';
import { PropostasController } from './propostas.controller';
import { ItensModule } from '../itens/itens.module';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Proposta, PropostaItem, Licitacao]),
    ItensModule,
  ],
  controllers: [PropostasController],
  providers: [PropostasService],
  exports: [PropostasService, TypeOrmModule],
})
export class PropostasModule {}

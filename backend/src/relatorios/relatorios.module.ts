import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RelatoriosController } from './relatorios.controller';
import { RelatoriosService } from './relatorios.service';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { Contrato } from '../contratos/entities/contrato.entity';
import { Requisicao } from '../almoxarifado/entities/requisicao.entity';
import { ItemContrato } from '../almoxarifado/entities/item-contrato.entity';
import { Medicao } from '../contratos/entities/medicao.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Licitacao, Contrato, Requisicao, ItemContrato, Medicao]),
  ],
  controllers: [RelatoriosController],
  providers: [RelatoriosService],
  exports: [RelatoriosService],
})
export class RelatoriosModule {}

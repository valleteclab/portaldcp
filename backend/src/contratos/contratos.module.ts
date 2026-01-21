import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContratosController } from './contratos.controller';
import { ContratosService } from './contratos.service';
import { Contrato } from './entities/contrato.entity';
import { TermoAditivo } from './entities/termo-aditivo.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { ItemContrato } from '../almoxarifado/entities/item-contrato.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contrato, TermoAditivo, Licitacao, ItemLicitacao, Fornecedor, ItemContrato])
  ],
  controllers: [ContratosController],
  providers: [ContratosService],
  exports: [ContratosService]
})
export class ContratosModule {}

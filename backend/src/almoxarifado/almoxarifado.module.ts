import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlmoxarifadoController } from './almoxarifado.controller';
import { RequisicaoService } from './requisicao.service';
import { ItemContratoService } from './item-contrato.service';
import { OrdemFornecimentoService } from './ordem-fornecimento.service';
import { RecebimentoService } from './recebimento.service';
import { ItemContrato } from './entities/item-contrato.entity';
import { Requisicao } from './entities/requisicao.entity';
import { ItemRequisicao } from './entities/item-requisicao.entity';
import { OrdemFornecimento } from './entities/ordem-fornecimento.entity';
import { Recebimento } from './entities/recebimento.entity';
import { Contrato } from '../contratos/entities/contrato.entity';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ItemContrato,
      Requisicao,
      ItemRequisicao,
      OrdemFornecimento,
      Recebimento,
      Contrato,
      Orgao,
      Fornecedor,
    ]),
  ],
  controllers: [AlmoxarifadoController],
  providers: [
    RequisicaoService, 
    ItemContratoService,
    OrdemFornecimentoService,
    RecebimentoService,
  ],
  exports: [
    RequisicaoService, 
    ItemContratoService,
    OrdemFornecimentoService,
    RecebimentoService,
  ],
})
export class AlmoxarifadoModule {}

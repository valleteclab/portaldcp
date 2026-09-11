import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatrimonioController } from './patrimonio.controller';
import { PatrimonioInventarioController } from './patrimonio-inventario.controller';
import { PatrimonioPublicController } from './patrimonio-public.controller';
import { PatrimonioService } from './patrimonio.service';
import { PatrimonioEtiquetasService } from './patrimonio-etiquetas.service';
import { PatrimonioRelatoriosService } from './patrimonio-relatorios.service';
import { PatrimonioInventarioService } from './patrimonio-inventario.service';
import { PatrimonioMovimentacaoService } from './patrimonio-movimentacao.service';
import { PatrimonioMovimentacaoController } from './patrimonio-movimentacao.controller';
import { MovimentacaoBem } from './entities/movimentacao-bem.entity';
import { BemPatrimonial } from './entities/bem-patrimonial.entity';
import { CategoriaBem } from './entities/categoria-bem.entity';
import { ManutencaoBem } from './entities/manutencao-bem.entity';
import { LocacaoBem } from './entities/locacao-bem.entity';
import { ServidorBem } from './entities/servidor-bem.entity';
import { ComodatoBem } from './entities/comodato-bem.entity';
import { HistoricoBem } from './entities/historico-bem.entity';
import { Inventario, InventarioSetor, InventarioLeitura } from './entities/inventario.entity';
import { Setor } from '../orgaos/entities/setor.entity';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BemPatrimonial,
      CategoriaBem,
      ManutencaoBem,
      LocacaoBem,
      ServidorBem,
      ComodatoBem,
      HistoricoBem,
      Inventario,
      InventarioSetor,
      InventarioLeitura,
      MovimentacaoBem,
      Setor,
      Orgao,
    ]),
    WhatsAppModule,
  ],
  controllers: [PatrimonioController, PatrimonioInventarioController, PatrimonioMovimentacaoController, PatrimonioPublicController],
  providers: [
    PatrimonioService,
    PatrimonioEtiquetasService,
    PatrimonioRelatoriosService,
    PatrimonioInventarioService,
    PatrimonioMovimentacaoService,
  ],
  exports: [PatrimonioService],
})
export class PatrimonioModule {}

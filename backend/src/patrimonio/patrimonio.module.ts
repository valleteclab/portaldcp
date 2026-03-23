import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatrimonioController } from './patrimonio.controller';
import { PatrimonioService } from './patrimonio.service';
import { PatrimonioEtiquetasService } from './patrimonio-etiquetas.service';
import { PatrimonioRelatoriosService } from './patrimonio-relatorios.service';
import { BemPatrimonial } from './entities/bem-patrimonial.entity';
import { CategoriaBem } from './entities/categoria-bem.entity';
import { ManutencaoBem } from './entities/manutencao-bem.entity';
import { LocacaoBem } from './entities/locacao-bem.entity';
import { ServidorBem } from './entities/servidor-bem.entity';
import { ComodatoBem } from './entities/comodato-bem.entity';
import { HistoricoBem } from './entities/historico-bem.entity';

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
    ]),
  ],
  controllers: [PatrimonioController],
  providers: [
    PatrimonioService,
    PatrimonioEtiquetasService,
    PatrimonioRelatoriosService,
  ],
  exports: [PatrimonioService],
})
export class PatrimonioModule {}

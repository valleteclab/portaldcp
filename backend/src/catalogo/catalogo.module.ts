import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ClasseCatalogo, ItemCatalogo, UnidadeMedida, CatalogoSyncLog } from './entities/catalogo.entity';
import { ClassificacaoCatalogoProprio, ItemCatalogoProprio } from './entities/catalogo-proprio.entity';
import { CatalogoService } from './catalogo.service';
import { CatalogoController } from './catalogo.controller';
import { ComprasGovService } from './comprasgov.service';
import { CatalogoProprioService } from './catalogo-proprio.service';
import { CatalogoProprioController } from './catalogo-proprio.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClasseCatalogo,
      ItemCatalogo,
      UnidadeMedida,
      CatalogoSyncLog,
      // Catálogo Próprio
      ClassificacaoCatalogoProprio,
      ItemCatalogoProprio,
    ]),
    ScheduleModule.forRoot(),
  ],
  controllers: [CatalogoController, CatalogoProprioController],
  providers: [CatalogoService, ComprasGovService, CatalogoProprioService],
  exports: [CatalogoService, ComprasGovService, CatalogoProprioService],
})
export class CatalogoModule {}

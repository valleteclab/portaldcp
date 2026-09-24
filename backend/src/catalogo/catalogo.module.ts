import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClasseCatalogo, ItemCatalogo, UnidadeMedida, CatalogoSyncLog } from './entities/catalogo.entity';
import { ClassificacaoCatalogoProprio, ItemCatalogoProprio } from './entities/catalogo-proprio.entity';
import { CatalogoService } from './catalogo.service';
import { CatalogoController } from './catalogo.controller';
import { ComprasGovService } from './comprasgov.service';
import { CatalogoProprioService } from './catalogo-proprio.service';
import { CatalogoProprioController } from './catalogo-proprio.controller';
import { CatalogoImportService } from './catalogo-import.service';

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
  ],
  controllers: [CatalogoController, CatalogoProprioController],
  providers: [CatalogoService, ComprasGovService, CatalogoProprioService, CatalogoImportService],
  exports: [CatalogoService, ComprasGovService, CatalogoProprioService, CatalogoImportService],
})
export class CatalogoModule {}

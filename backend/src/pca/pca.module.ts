import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PcaController } from './pca.controller';
import { PcaService } from './pca.service';
import { PlanoContratacaoAnual, ItemPCA } from './entities/pca.entity';
import { ItemCatalogoProprio } from '../catalogo/entities/catalogo-proprio.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlanoContratacaoAnual, ItemPCA, ItemCatalogoProprio])
  ],
  controllers: [PcaController],
  providers: [PcaService],
  exports: [PcaService]
})
export class PcaModule {}

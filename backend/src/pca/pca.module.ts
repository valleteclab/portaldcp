import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PcaController } from './pca.controller';
import { PcaService } from './pca.service';
import { PlanoContratacaoAnual, ItemPCA } from './entities/pca.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlanoContratacaoAnual, ItemPCA])
  ],
  controllers: [PcaController],
  providers: [PcaService],
  exports: [PcaService]
})
export class PcaModule {}

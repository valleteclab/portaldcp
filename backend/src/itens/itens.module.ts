import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemLicitacao } from './entities/item-licitacao.entity';
import { ItemPCA } from '../pca/entities/pca.entity';
import { ItensService } from './itens.service';
import { ItensController } from './itens.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ItemLicitacao, ItemPCA])],
  controllers: [ItensController],
  providers: [ItensService],
  exports: [ItensService, TypeOrmModule],
})
export class ItensModule {}

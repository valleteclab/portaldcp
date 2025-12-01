import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AtasController } from './atas.controller';
import { AtasService } from './atas.service';
import { AtaRegistroPreco, ItemAta } from './entities/ata-registro-preco.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AtaRegistroPreco, ItemAta, Licitacao])
  ],
  controllers: [AtasController],
  providers: [AtasService],
  exports: [AtasService]
})
export class AtasModule {}

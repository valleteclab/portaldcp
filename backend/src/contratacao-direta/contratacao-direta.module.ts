import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContratacaoDiretaController } from './contratacao-direta.controller';
import { ContratacaoDiretaService } from './contratacao-direta.service';
import { ContratacaoDireta, ItemContratacaoDireta } from './entities/contratacao-direta.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ContratacaoDireta, ItemContratacaoDireta])
  ],
  controllers: [ContratacaoDiretaController],
  providers: [ContratacaoDiretaService],
  exports: [ContratacaoDiretaService]
})
export class ContratacaoDiretaModule {}

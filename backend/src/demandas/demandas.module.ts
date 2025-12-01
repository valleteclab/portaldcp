import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Demanda, ItemDemanda } from './entities/demanda.entity';
import { DemandasService } from './demandas.service';
import { DemandasController } from './demandas.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Demanda, ItemDemanda]),
  ],
  controllers: [DemandasController],
  providers: [DemandasService],
  exports: [DemandasService],
})
export class DemandasModule {}

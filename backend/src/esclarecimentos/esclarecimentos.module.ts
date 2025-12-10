import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Esclarecimento } from './esclarecimento.entity';
import { EsclarecimentosService } from './esclarecimentos.service';
import { EsclarecimentosController } from './esclarecimentos.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Esclarecimento])],
  controllers: [EsclarecimentosController],
  providers: [EsclarecimentosService],
  exports: [EsclarecimentosService],
})
export class EsclarecimentosModule {}

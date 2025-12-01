import { Module } from '@nestjs/common';
import { IaController } from './ia.controller';
import { IaService } from './ia.service';

@Module({
  controllers: [IaController],
  providers: [IaService],
  exports: [IaService],
})
export class IaModule {}

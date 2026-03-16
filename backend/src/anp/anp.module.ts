import { Module } from '@nestjs/common';
import { AnpController } from './anp.controller';
import { AnpService } from './anp.service';

@Module({
  controllers: [AnpController],
  providers: [AnpService],
  exports: [AnpService],
})
export class AnpModule {}

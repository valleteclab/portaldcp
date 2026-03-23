import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisputaModule } from '../disputa-v2/disputa.module';
import { SessaoDisputa } from '../sessao/entities/sessao-disputa.entity';
import { DisputaV3Controller } from './disputa-v3.controller';
import { DisputaV3Service } from './disputa-v3.service';

@Module({
  imports: [TypeOrmModule.forFeature([SessaoDisputa]), DisputaModule],
  controllers: [DisputaV3Controller],
  providers: [DisputaV3Service],
  exports: [DisputaV3Service],
})
export class DisputaV3Module {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { SigaConfigController } from './siga-config.controller';

/** Integração por arquivo com o SIGA do TCM-BA (configuração compartilhada). */
@Module({
  imports: [TypeOrmModule.forFeature([Orgao])],
  controllers: [SigaConfigController],
})
export class SigaModule {}

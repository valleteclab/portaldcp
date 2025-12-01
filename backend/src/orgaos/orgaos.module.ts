import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Orgao } from './entities/orgao.entity';
import { OrgaosService } from './orgaos.service';
import { OrgaosController } from './orgaos.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Orgao])],
  controllers: [OrgaosController],
  providers: [OrgaosService],
  exports: [OrgaosService, TypeOrmModule],
})
export class OrgaosModule {}

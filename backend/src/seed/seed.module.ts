import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeedController } from './seed.controller';
import { SeedService } from './seed.service';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Orgao, Fornecedor])],
  controllers: [SeedController],
  providers: [SeedService],
})
export class SeedModule {}

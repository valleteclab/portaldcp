import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PncpController } from './pncp.controller';
import { PncpService } from './pncp.service';
import { PncpSync } from './entities/pncp-sync.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { PlanoContratacaoAnual } from '../pca/entities/pca.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([PncpSync, Licitacao, PlanoContratacaoAnual])
  ],
  controllers: [PncpController],
  providers: [PncpService],
  exports: [PncpService]
})
export class PncpModule {}

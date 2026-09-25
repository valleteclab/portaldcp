import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PncpController } from './pncp.controller';
import { PncpService } from './pncp.service';
import { PncpSync } from './entities/pncp-sync.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { PlanoContratacaoAnual } from '../pca/entities/pca.entity';
import { SystemConfigModule } from '../system-config/system-config.module';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { TransicoesModule } from '../licitacoes/transicoes/transicoes.module';
import { PncpEnviosService } from './fila/pncp-envios.service';
import { PncpFilaService } from './fila/pncp-fila.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([PncpSync, Licitacao, PlanoContratacaoAnual, Orgao]),
    SystemConfigModule,
    TransicoesModule,
  ],
  controllers: [PncpController],
  providers: [PncpService, PncpEnviosService, PncpFilaService],
  exports: [PncpService, PncpFilaService]
})
export class PncpModule {}

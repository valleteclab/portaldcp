import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FrotaController } from './frota.controller';
import { FrotaPublicController } from './frota-public.controller';
import { FrotaService } from './frota.service';
import { FrotaAuthService } from './frota-auth.service';
import { Veiculo } from './entities/veiculo.entity';
import { Abastecimento } from './entities/abastecimento.entity';
import { Manutencao } from './entities/manutencao.entity';
import { FrotaContrato } from './entities/frota-contrato.entity';
import { FrotaRequisicao } from './entities/frota-requisicao.entity';
import { FrotaCredencial } from './entities/frota-credencial.entity';
import { FrotaAcessoLog } from './entities/frota-acesso-log.entity';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { AuthModule } from '../auth/auth.module';
import { ContratosModule } from '../contratos/contratos.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Veiculo, Abastecimento, Manutencao,
      FrotaContrato, FrotaRequisicao,
      FrotaCredencial, FrotaAcessoLog,
      Orgao,
    ]),
    AuthModule,      // fornece JwtService
    ContratosModule, // fornece acesso a contratos existentes
  ],
  controllers: [FrotaController, FrotaPublicController],
  providers: [FrotaService, FrotaAuthService],
  exports: [FrotaService, FrotaAuthService],
})
export class FrotaModule {}

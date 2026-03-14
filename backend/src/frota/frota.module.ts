import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FrotaController } from './frota.controller';
import { FrotaService } from './frota.service';
import { Veiculo } from './entities/veiculo.entity';
import { Abastecimento } from './entities/abastecimento.entity';
import { Manutencao } from './entities/manutencao.entity';
import { FrotaContrato } from './entities/frota-contrato.entity';
import { FrotaRequisicao } from './entities/frota-requisicao.entity';
import { ContratosModule } from '../contratos/contratos.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Veiculo, Abastecimento, Manutencao, FrotaContrato, FrotaRequisicao]),
    ContratosModule,
  ],
  controllers: [FrotaController],
  providers: [FrotaService],
  exports: [FrotaService],
})
export class FrotaModule {}

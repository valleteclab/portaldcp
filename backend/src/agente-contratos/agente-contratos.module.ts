import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { AgenteContratosService } from './agente-contratos.service';
import { AgenteContratosScheduler } from './agente-contratos.scheduler';
import { AgenteContratosController } from './agente-contratos.controller';
import { AgenteLog } from './entities/agente-log.entity';
import { ContratosModule } from '../contratos/contratos.module';
import { FornecedoresModule } from '../fornecedores/fornecedores.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { IaModule } from '../ia/ia.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgenteLog]),
    HttpModule,
    // Importa módulos que exportam os serviços necessários
    ContratosModule,
    FornecedoresModule,
    NotificacoesModule,
    IaModule,
  ],
  controllers: [AgenteContratosController],
  providers: [
    AgenteContratosService,
    AgenteContratosScheduler,
  ],
  exports: [AgenteContratosService],
})
export class AgenteContratosModule {}

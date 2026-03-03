import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { AgenteContratosService } from './agente-contratos.service';
import { AgenteContratosScheduler } from './agente-contratos.scheduler';
import { AgenteContratosController } from './agente-contratos.controller';
import { AgenteLog } from './entities/agente-log.entity';
import { PortalTransparenciaService } from '../contratos/portal-transparencia.service';
import { ContratosService } from '../contratos/contratos.service';
import { FornecedoresService } from '../fornecedores/fornecedores.service';
import { MedicaoService } from '../contratos/medicao.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { IaService } from '../ia/ia.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgenteLog]),
    HttpModule,
  ],
  controllers: [AgenteContratosController],
  providers: [
    AgenteContratosService,
    AgenteContratosScheduler,
    // Serviços necessários (importados de outros módulos)
    PortalTransparenciaService,
    ContratosService,
    FornecedoresService,
    MedicaoService,
    NotificacoesService,
    IaService,
  ],
  exports: [AgenteContratosService],
})
export class AgenteContratosModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowAcao, WorkflowCampo, WorkflowFase, WorkflowFormulario, WorkflowHistorico, WorkflowInstancia, WorkflowModelo, WorkflowReacao, WorkflowTarefa } from './workflow.entities';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { RegistroNos } from './nos/executor-no';
import { ExecutorDemandaDfd } from './nos/no-demanda-dfd.service';

@Module({ imports: [TypeOrmModule.forFeature([WorkflowModelo, WorkflowFase, WorkflowAcao, WorkflowFormulario, WorkflowCampo, WorkflowReacao, WorkflowInstancia, WorkflowTarefa, WorkflowHistorico])], controllers: [WorkflowController], providers: [WorkflowService, RegistroNos, ExecutorDemandaDfd], exports: [WorkflowService, RegistroNos] })
export class WorkflowModule {}

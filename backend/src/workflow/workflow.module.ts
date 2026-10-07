import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowAcao, WorkflowCampo, WorkflowFase, WorkflowFormulario, WorkflowHistorico, WorkflowInstancia, WorkflowModelo, WorkflowReacao, WorkflowTarefa } from './workflow.entities';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { RegistroNos } from './nos/executor-no';

@Module({ imports: [TypeOrmModule.forFeature([WorkflowModelo, WorkflowFase, WorkflowAcao, WorkflowFormulario, WorkflowCampo, WorkflowReacao, WorkflowInstancia, WorkflowTarefa, WorkflowHistorico])], controllers: [WorkflowController], providers: [WorkflowService, RegistroNos], exports: [WorkflowService, RegistroNos] })
export class WorkflowModule {}

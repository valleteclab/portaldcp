import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowAcao, WorkflowCampo, WorkflowFase, WorkflowFormulario, WorkflowModelo, WorkflowReacao } from './workflow.entities';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';

@Module({ imports: [TypeOrmModule.forFeature([WorkflowModelo, WorkflowFase, WorkflowAcao, WorkflowFormulario, WorkflowCampo, WorkflowReacao])], controllers: [WorkflowController], providers: [WorkflowService], exports: [WorkflowService] })
export class WorkflowModule {}

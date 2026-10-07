import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowAcao, WorkflowCampo, WorkflowFase, WorkflowFormulario, WorkflowHistorico, WorkflowInstancia, WorkflowModelo, WorkflowReacao, WorkflowTarefa } from './workflow.entities';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { RegistroNos } from './nos/executor-no';
import { EmailModule } from '../email/email.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { WorkflowTeamsCanal } from './avisos/teams-canal.entity';
import { TeamsService } from './avisos/teams.service';
import { AvisosService } from './avisos/avisos.service';
import { VesperaPrazoScheduler } from './avisos/vespera-prazo.scheduler';
import { NotificarExecutor } from './nos/notificar.executor';
import { DesenhoFluxoService } from './desenho/desenho-fluxo.service';
import { ChecklistEtapaService } from './checklist/checklist-etapa.service';
import { PonteFaseInternaService } from './ponte/ponte-fase-interna.service';
import { IaModule } from '../ia/ia.module';
import { ExecutorDemandaDfd } from './nos/no-demanda-dfd.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkflowModelo, WorkflowFase, WorkflowAcao, WorkflowFormulario, WorkflowCampo, WorkflowReacao, WorkflowInstancia, WorkflowTarefa, WorkflowHistorico, WorkflowTeamsCanal]),
    EmailModule,
    WhatsAppModule,
    IaModule,
  ],
  controllers: [WorkflowController],
  providers: [WorkflowService, RegistroNos, TeamsService, AvisosService, VesperaPrazoScheduler, NotificarExecutor, ExecutorDemandaDfd, DesenhoFluxoService, ChecklistEtapaService, PonteFaseInternaService],
  exports: [WorkflowService, RegistroNos, TeamsService],
})
export class WorkflowModule {}

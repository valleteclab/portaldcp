import { Module } from '@nestjs/common';
import { AgenteTarefasController } from './agente-tarefas.controller';
import { AgenteTarefasService } from './agente-tarefas.service';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { AlmoxarifadoModule } from '../almoxarifado/almoxarifado.module';
import { ContratosModule } from '../contratos/contratos.module';
import { RelatoriosModule } from '../relatorios/relatorios.module';
import { SystemConfigModule } from '../system-config/system-config.module';

@Module({
  imports: [
    UsuariosModule,
    AlmoxarifadoModule,
    ContratosModule,
    RelatoriosModule,
    SystemConfigModule,
  ],
  controllers: [AgenteTarefasController],
  providers: [AgenteTarefasService],
})
export class AgenteTarefasModule {}

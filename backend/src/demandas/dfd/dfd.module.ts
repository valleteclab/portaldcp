import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FaseInternaModule } from '../../fase-interna/fase-interna.module';
import { NotificacoesModule } from '../../notificacoes/notificacoes.module';
import { DfdConsolidado, DfdConsolidadoDemanda } from './dfd-consolidado.entity';
import { DfdConsolidadoService } from './dfd-consolidado.service';
import { MigracaoDfdBootService } from './migracao-dfd-boot.service';

/**
 * DFD CONSOLIDADO — domínio (entidades, consolidação, aprovação, PDF, vínculo
 * com o processo). Sem dependência do LicitacoesService: o LicitacoesModule
 * importa este módulo para abrir o processo a partir do DFD; o controller
 * fica no DemandasModule (que importa os dois).
 */
@Module({
  imports: [TypeOrmModule.forFeature([DfdConsolidado, DfdConsolidadoDemanda]), FaseInternaModule, NotificacoesModule],
  providers: [DfdConsolidadoService, MigracaoDfdBootService],
  exports: [DfdConsolidadoService],
})
export class DfdModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NumeroProcessoModule } from '../numero-processo/numero-processo.module';
import { Processo, TipoProcessoRegistro } from './entities/processo.entity';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { ProcessoMovimentacao, ProcessoPeca } from './entities/processo-tramitacao.entity';
import { ProcessoTramitacaoService } from './processo-tramitacao.service';
import { MigracaoProcessoBootService } from './migracao-processo-boot.service';
import { ProcessoConteudoService } from './processo-conteudo.service';
import { ProcessoTiposService } from './processo-tipos.service';
import { ProcessoService } from './processo.service';
import { ProcessosController } from './processos.controller';

/**
 * PROCESSO ELETRÔNICO (fundação — decisão do dono de 28/09/2026).
 *
 * Não importa o FaseInternaModule nem o LicitacoesModule (eles importam este):
 * as capacidades da fase interna (autos, tramitação, fluxo, tarefas) são
 * alcançadas pelos adaptadores via ModuleRef. Assim o módulo do processo é
 * a base, e a licitação é o primeiro tipo que se apoia nele.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Processo, TipoProcessoRegistro, ProcessoMovimentacao, ProcessoPeca]), NumeroProcessoModule, NotificacoesModule],
  controllers: [ProcessosController],
  providers: [ProcessoService, ProcessoTiposService, ProcessoConteudoService, ProcessoTramitacaoService, MigracaoProcessoBootService],
  exports: [ProcessoService, ProcessoTiposService, ProcessoConteudoService, ProcessoTramitacaoService, MigracaoProcessoBootService],
})
export class ProcessoModule {}

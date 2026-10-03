import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NumeroProcessoModule } from '../numero-processo/numero-processo.module';
import { Processo, TipoProcessoRegistro } from './entities/processo.entity';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { IaModule } from '../ia/ia.module';
import { ProcessoMovimentacao, ProcessoPeca } from './entities/processo-tramitacao.entity';
import { ModeloDocumento } from '../fase-interna/entities/modelo-documento.entity';
import { ProcessoTramitacaoService } from './processo-tramitacao.service';
import { MigracaoProcessoBootService } from './migracao-processo-boot.service';
import { ProcessoConteudoService } from './processo-conteudo.service';
import { ProcessoTiposService } from './processo-tipos.service';
import { ProcessoService } from './processo.service';
import { ProcessosController } from './processos.controller';
import { PecasLicitacaoService } from './pecas-licitacao.service';
import { PainelGestorService } from './painel-gestor.service';

/**
 * PROCESSO ELETRÔNICO (fundação — decisão do dono de 28/09/2026).
 *
 * Não importa o FaseInternaModule nem o LicitacoesModule (eles importam este):
 * as capacidades da fase interna (autos, tramitação, fluxo, tarefas) são
 * alcançadas pelos adaptadores via ModuleRef. Assim o módulo do processo é
 * a base, e a licitação é o primeiro tipo que se apoia nele.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Processo, TipoProcessoRegistro, ProcessoMovimentacao, ProcessoPeca, ModeloDocumento]), NumeroProcessoModule, NotificacoesModule, IaModule],
  controllers: [ProcessosController],
  providers: [ProcessoService, ProcessoTiposService, ProcessoConteudoService, ProcessoTramitacaoService, PecasLicitacaoService, PainelGestorService, MigracaoProcessoBootService],
  exports: [ProcessoService, ProcessoTiposService, ProcessoConteudoService, ProcessoTramitacaoService, PainelGestorService, MigracaoProcessoBootService],
})
export class ProcessoModule {}

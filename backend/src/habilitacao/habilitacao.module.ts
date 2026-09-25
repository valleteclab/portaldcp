import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JulgamentoModule } from '../julgamento/julgamento.module';
import { TransicoesModule } from '../licitacoes/transicoes/transicoes.module';
import { ParametrosLicitacaoModule } from '../parametros-licitacao/parametros-licitacao.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { EventoSessao } from '../sessao/entities/evento-sessao.entity';
import {
  DiligenciaHabilitacao,
  DocumentoHabilitacao,
  ExigenciaHabilitacao,
  HabilitacaoLicitante,
} from './entities/habilitacao.entity';
import { HabilitacaoService } from './habilitacao.service';
import { HabilitacaoController } from './habilitacao.controller';
import { VencimentoDocumentosService } from './vencimento-documentos.service';
import { MigracaoHabilitacaoBootService } from './migracao-habilitacao-boot.service';

/**
 * HABILITAÇÃO (plano E4 — Lei 14.133/2021 arts. 62–70; IN SEGES 73/2022
 * art. 39): exigências do edital, convocação com pré-checagem do registro
 * cadastral, envio de documentos (no banco), diligência, análise por documento,
 * habilitar/inabilitar e inversão de fases. Depende do julgamento (ranking,
 * aceitação) — nunca o contrário (a máquina de estados usa só as funções SQL
 * de `habilitacao.sql.ts`).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ExigenciaHabilitacao, HabilitacaoLicitante, DocumentoHabilitacao, DiligenciaHabilitacao, EventoSessao]),
    JulgamentoModule,
    TransicoesModule,
    ParametrosLicitacaoModule,
    NotificacoesModule,
  ],
  controllers: [HabilitacaoController],
  providers: [HabilitacaoService, VencimentoDocumentosService, MigracaoHabilitacaoBootService],
  exports: [HabilitacaoService],
})
export class HabilitacaoModule {}

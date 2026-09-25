import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentoLicitacao } from '../documentos/entities/documento-licitacao.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { TransicoesModule } from '../licitacoes/transicoes/transicoes.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { EditalService } from './edital.service';
import { ExtincaoService } from './extincao.service';
import { PublicacaoController } from './publicacao.controller';
import { PublicacaoEventos } from './publicacao-eventos';
import { ExtincaoLicitacao, ManifestacaoExtincao, RetificacaoEdital } from './publicacao.entities';
import { RetificacaoService } from './retificacao.service';

/**
 * Publicação do edital, prazos, retificação e revogação/anulação em dois
 * tempos (plano E7a). Depende só da máquina de estados, das notificações e do
 * calendário (FeriadosModule, global) — o PNCP (E7b) importa este módulo para
 * `EditalService.editalVigente` e `PublicacaoEventos`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([RetificacaoEdital, ExtincaoLicitacao, ManifestacaoExtincao, DocumentoLicitacao, Licitacao]),
    TransicoesModule,
    NotificacoesModule,
  ],
  controllers: [PublicacaoController],
  providers: [EditalService, RetificacaoService, ExtincaoService, PublicacaoEventos],
  exports: [EditalService, PublicacaoEventos, RetificacaoService, ExtincaoService],
})
export class PublicacaoModule {}

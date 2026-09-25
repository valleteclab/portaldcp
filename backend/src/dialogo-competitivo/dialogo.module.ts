import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransicoesModule } from '../licitacoes/transicoes/transicoes.module';
import {
  DialogoComissaoMembro,
  DialogoCompetitivo,
  DialogoDocumento,
  DialogoParticipante,
  DialogoReuniao,
} from './dialogo.entities';
import { DialogoService } from './dialogo.service';
import { DialogoController } from './dialogo.controller';

/**
 * DIÁLOGO COMPETITIVO (plano E7c — Lei 14.133/2021 art. 32): edital de
 * necessidades, manifestação de interesse, pré-seleção, reuniões com ata e
 * gravação (sigilo entre licitantes), conclusão motivada e edital da fase
 * competitiva (≥ 60 dias úteis). A fase competitiva usa o rito da
 * concorrência (motor, julgamento, habilitação, recursos, resultado).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([DialogoCompetitivo, DialogoComissaoMembro, DialogoParticipante, DialogoReuniao, DialogoDocumento]),
    TransicoesModule,
  ],
  controllers: [DialogoController],
  providers: [DialogoService],
  exports: [DialogoService],
})
export class DialogoCompetitivoModule {}

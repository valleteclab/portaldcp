import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { EventoSessao } from '../sessao/entities/evento-sessao.entity';
import { DiligenciaAnexo, DiligenciaLicitante } from './entities/diligencia.entity';
import { DiligenciasController } from './diligencias.controller';
import { DiligenciasService } from './diligencias.service';

/** Diligência geral ao licitante (art. 64): pedido livre com prazo, resposta com texto e anexos. */
@Module({
  imports: [TypeOrmModule.forFeature([DiligenciaLicitante, DiligenciaAnexo, EventoSessao]), NotificacoesModule],
  controllers: [DiligenciasController],
  providers: [DiligenciasService],
  exports: [DiligenciasService],
})
export class DiligenciasModule {}

import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Feriado, FeriadoAdotado } from './feriado.entity';
import { FeriadosController } from './feriados.controller';
import { FeriadosService } from './feriados.service';

/**
 * Calendário de feriados (plano E7a). Global e sem dependências de negócio:
 * carrega a tabela para a memória e registra a fonte do núcleo puro
 * `common/prazos/calendario.ts`, usado por todo cálculo de dias úteis.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Feriado, FeriadoAdotado])],
  controllers: [FeriadosController],
  providers: [FeriadosService],
  exports: [FeriadosService],
})
export class FeriadosModule {}

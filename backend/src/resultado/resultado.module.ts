import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { EventoSessao } from '../sessao/entities/evento-sessao.entity';
import { TransicoesModule } from '../licitacoes/transicoes/transicoes.module';
import { JulgamentoModule } from '../julgamento/julgamento.module';
import { ContratosModule } from '../contratos/contratos.module';
import { PncpModule } from '../pncp/pncp.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { ResultadoService } from './resultado.service';
import { ResultadoController } from './resultado.controller';
import { MigracaoResultadoBootService } from './migracao-resultado-boot.service';
import { GERADOR_ATA_REGISTRO_PRECO, GeradorAtaNaoImplementado } from './gerador-ata';

/**
 * RESULTADO (plano E6): adjudicação, homologação e geração do instrumento
 * (contrato; ARP no SRP pelo gancho `GERADOR_ATA_REGISTRO_PRECO`).
 * Depende do julgamento (ranking único), da máquina de estados, de contratos
 * e do PNCP — nenhum deles depende deste módulo (sem ciclo). O cadastro da
 * licitação (licitacoes) importa este módulo para o julgamento da dispensa e
 * o resultado externo.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Licitacao, EventoSessao]),
    TransicoesModule,
    JulgamentoModule,
    ContratosModule,
    PncpModule,
    NotificacoesModule,
  ],
  controllers: [ResultadoController],
  providers: [
    ResultadoService,
    MigracaoResultadoBootService,
    // Parte ARP (E6 item 2/3): trocar por useExisting/useClass do serviço de atas
    { provide: GERADOR_ATA_REGISTRO_PRECO, useClass: GeradorAtaNaoImplementado },
  ],
  exports: [ResultadoService, GERADOR_ATA_REGISTRO_PRECO],
})
export class ResultadoModule {}

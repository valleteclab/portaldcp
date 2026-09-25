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
import { GERADOR_ATA_REGISTRO_PRECO } from './gerador-ata';
import { AtasModule } from '../atas/atas.module';
import { ArpService } from '../atas/arp.service';
import { PortalAssinaturasModule } from '../portal-assinaturas/portal-assinaturas.module';
import { AutoridadeOrgao, FormalizacaoResultado } from './formalizacao/formalizacao.entities';
import { FormalizacaoService } from './formalizacao/formalizacao.service';

/**
 * RESULTADO (plano E6): adjudicação, homologação e geração do instrumento
 * (contrato; ARP no SRP pelo gancho `GERADOR_ATA_REGISTRO_PRECO`) e a
 * FORMALIZAÇÃO do ato (operador × autoridade; registro direto, assinatura
 * eletrônica da autoridade ou termo externo — `formalizacao/`).
 * Depende do julgamento (ranking único), da máquina de estados, de contratos
 * e do PNCP — nenhum deles depende deste módulo (sem ciclo). O cadastro da
 * licitação (licitacoes) importa este módulo para o julgamento da dispensa e
 * o resultado externo.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Licitacao, EventoSessao, AutoridadeOrgao, FormalizacaoResultado]),
    TransicoesModule,
    JulgamentoModule,
    ContratosModule,
    PncpModule,
    NotificacoesModule,
    AtasModule,
    PortalAssinaturasModule,
  ],
  controllers: [ResultadoController],
  providers: [
    ResultadoService,
    FormalizacaoService,
    MigracaoResultadoBootService,
    // Parte ARP (E6): a homologação do SRP gera as atas pelo ArpService
    { provide: GERADOR_ATA_REGISTRO_PRECO, useExisting: ArpService },
  ],
  exports: [ResultadoService, FormalizacaoService, GERADOR_ATA_REGISTRO_PRECO],
})
export class ResultadoModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AtasController } from './atas.controller';
import { AtasService } from './atas.service';
import { AtaRegistroPreco, ItemAta } from './entities/ata-registro-preco.entity';
import { AdesaoAta, AdesaoAtaItem, AtaCadastroReserva, AtaConsumo } from './entities/arp.entities';
import { ArpService } from './arp.service';
import { ArpController } from './arp.controller';
import { ArpScheduler } from './arp.scheduler';
import { MigracaoArpBootService } from './migracao-arp-boot.service';
import { ContratosModule } from '../contratos/contratos.module';
import { PortalAssinaturasModule } from '../portal-assinaturas/portal-assinaturas.module';
import { PncpModule } from '../pncp/pncp.module';

/**
 * ATAS DE REGISTRO DE PREÇOS (Lei 14.133/2021 arts. 82–86). O `ArpService`
 * é o gerador da ARP plugado no `ResultadoModule` (GERADOR_ATA_REGISTRO_PRECO)
 * — este módulo não importa o de resultado (sem ciclo). O ArpController vem
 * antes do AtasController (rotas com 2+ segmentos antes de `:id`).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AtaRegistroPreco, ItemAta, AtaConsumo, AdesaoAta, AdesaoAtaItem, AtaCadastroReserva]),
    ContratosModule,
    PortalAssinaturasModule,
    PncpModule,
  ],
  controllers: [ArpController, AtasController],
  providers: [AtasService, ArpService, ArpScheduler, MigracaoArpBootService],
  exports: [AtasService, ArpService],
})
export class AtasModule {}

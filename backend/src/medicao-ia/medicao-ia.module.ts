import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { IaModule } from '../ia/ia.module';
import { ContratosModule } from '../contratos/contratos.module';
import { XmlNfeParserService } from '../almoxarifado/xml-nfe-parser.service';
import { Contrato } from '../contratos/entities/contrato.entity';
import { Medicao } from '../contratos/entities/medicao.entity';
import { MedicaoIaController } from './medicao-ia.controller';
import { MedicaoIaService } from './medicao-ia.service';

/**
 * Módulo piloto: Agente de IA para auto-preenchimento de boletim de medição
 * a partir de Nota Fiscal (XML NF-e ou PDF DANFE).
 *
 * Não altera nenhum módulo existente. Apenas reutiliza serviços via import.
 */
@Module({
  imports: [
    MulterModule.register({ limits: { fileSize: 10 * 1024 * 1024 } }),
    TypeOrmModule.forFeature([Contrato, Medicao]),
    IaModule,
    ContratosModule,
  ],
  controllers: [MedicaoIaController],
  providers: [MedicaoIaService, XmlNfeParserService],
})
export class MedicaoIaModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentoFaseInterna } from './entities/documento-fase-interna.entity';
import { LogFaseInterna } from './entities/log-fase-interna.entity';
import { FaseInternaService } from './fase-interna.service';
import { FaseInternaController } from './fase-interna.controller';
import { AuditLogService } from './audit-log.service';
import { DocumentoEstruturadoService } from './documento-estruturado.service';
import { DocumentoEstruturadoController } from './documento-estruturado.controller';
import { GeradorDocumentoService } from './gerador-documento.service';
import { PncpPublicacaoService } from './pncp-publicacao.service';
import { AnaliseContratosService } from './analise-contratos.service';
import { PesquisaPrecosAgenteService } from './pesquisa-precos-agente.service';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { Contrato } from '../contratos/entities/contrato.entity';
import { IaModule } from '../ia/ia.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentoFaseInterna, LogFaseInterna, Licitacao, Contrato]),
    IaModule,
  ],
  controllers: [FaseInternaController, DocumentoEstruturadoController],
  providers: [
    FaseInternaService,
    AuditLogService,
    DocumentoEstruturadoService,
    GeradorDocumentoService,
    PncpPublicacaoService,
    AnaliseContratosService,
    PesquisaPrecosAgenteService,
  ],
  exports: [FaseInternaService, AuditLogService, GeradorDocumentoService, PesquisaPrecosAgenteService],
})
export class FaseInternaModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemConfigModule } from '../system-config/system-config.module';
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
import { GeradorPpService } from './gerador-pp.service';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { Contrato } from '../contratos/entities/contrato.entity';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import { PesquisaPrecoExecucao } from './entities/pesquisa-preco-execucao.entity';
import { PesquisaPrecoCandidato } from './entities/pesquisa-preco-candidato.entity';
import { PesquisaPrecosAgentService } from './pesquisa-precos-agent.service';
import { PesquisaPrecosComplianceService } from './pesquisa-precos-compliance.service';
import {
  BrowserFallbackProvider,
  ContratosVigentesProvider,
  FontePrecosProvider,
  FornecedorDiretoProvider,
  NfeProvider,
  PainelComprasGovProvider,
  PncpPriceProvider,
  WebEspecializadaProvider,
} from './pesquisa-precos-providers.service';

@Module({
  imports: [
    SystemConfigModule,
    TypeOrmModule.forFeature([
      DocumentoFaseInterna,
      LogFaseInterna,
      Licitacao,
      Contrato,
      ItemLicitacao,
      PesquisaPrecoExecucao,
      PesquisaPrecoCandidato,
    ]),
  ],
  controllers: [FaseInternaController, DocumentoEstruturadoController],
  providers: [
    FaseInternaService,
    AuditLogService,
    DocumentoEstruturadoService,
    GeradorDocumentoService,
    PncpPublicacaoService,
    AnaliseContratosService,
    GeradorPpService,
    PesquisaPrecosAgentService,
    PesquisaPrecosComplianceService,
    PncpPriceProvider,
    PainelComprasGovProvider,
    FontePrecosProvider,
    ContratosVigentesProvider,
    WebEspecializadaProvider,
    FornecedorDiretoProvider,
    NfeProvider,
    BrowserFallbackProvider,
  ],
  exports: [FaseInternaService, AuditLogService, GeradorDocumentoService, PesquisaPrecosAgentService, GeradorPpService],
})
export class FaseInternaModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemConfigModule } from '../system-config/system-config.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { IaModule } from '../ia/ia.module';
import { PreparacaoAutomaticaService } from './preparacao-automatica.service';
import { DocumentoFaseInterna } from './entities/documento-fase-interna.entity';
import { LogFaseInterna } from './entities/log-fase-interna.entity';
import { ModeloDocumento } from './entities/modelo-documento.entity';
import { TramitacaoProcesso } from './entities/tramitacao-processo.entity';
import {
  FluxoAprovacaoDocumento,
  AprovacaoDocumento,
} from './entities/fluxo-aprovacao.entity';
import { ModeloDocumentoService } from './modelo-documento.service';
import { TramitacaoService } from './tramitacao.service';
import { AprovacaoService } from './aprovacao.service';
import { ProcessoEletronicoController } from './processo-eletronico.controller';
import { Setor } from '../orgaos/entities/setor.entity';
import { Orgao } from '../orgaos/entities/orgao.entity';
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
import { Demanda } from '../demandas/entities/demanda.entity';
import { DerivacaoService } from './derivacao.service';
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
    NotificacoesModule,
    IaModule,
    TypeOrmModule.forFeature([
      DocumentoFaseInterna,
      LogFaseInterna,
      ModeloDocumento,
      TramitacaoProcesso,
      FluxoAprovacaoDocumento,
      AprovacaoDocumento,
      Setor,
      Orgao,
      Licitacao,
      Contrato,
      ItemLicitacao,
      Demanda,
      PesquisaPrecoExecucao,
      PesquisaPrecoCandidato,
    ]),
  ],
  controllers: [
    FaseInternaController,
    DocumentoEstruturadoController,
    ProcessoEletronicoController,
  ],
  providers: [
    FaseInternaService,
    PreparacaoAutomaticaService,
    ModeloDocumentoService,
    TramitacaoService,
    AprovacaoService,
    DerivacaoService,
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
  exports: [
    FaseInternaService,
    PreparacaoAutomaticaService,
    DerivacaoService,
    AuditLogService,
    GeradorDocumentoService,
    PesquisaPrecosAgentService,
    GeradorPpService,
    ModeloDocumentoService,
    TramitacaoService,
    AprovacaoService,
  ],
})
export class FaseInternaModule {}

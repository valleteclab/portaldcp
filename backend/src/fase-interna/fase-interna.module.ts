import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemConfigModule } from '../system-config/system-config.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { IaModule } from '../ia/ia.module';
import { PreparacaoAutomaticaService } from './preparacao-automatica.service';
import { DocumentoFaseInterna } from './entities/documento-fase-interna.entity';
import { DocumentoOrgao } from './entities/documento-orgao.entity';
import { PecasFaseInternaService } from './pecas-fase-interna.service';
import { JuntadaPecasService } from './juntada-pecas.service';
import { MigracaoEspelhoDocumentosBootService } from './migracao-espelho-documentos-boot.service';
import { MigracaoPecaEmitidaBootService } from './migracao-peca-emitida-boot.service';
import { CopilotoInterrompidoBootService } from './copiloto-interrompido-boot.service';
import { Tarefa } from './tarefas/tarefa.entity';
import { ConfiguracaoFaseInterna } from './tarefas/configuracao-fase-interna.entity';
import { TarefasService } from './tarefas/tarefas.service';
import { TarefasSubscriber } from './tarefas/tarefas.subscriber';
import { MigracaoTarefasBootService } from './tarefas/migracao-tarefas-boot.service';
import { ConfiguracaoFaseInternaController, EtapasFaseInternaController, TarefasController } from './tarefas/tarefas.controller';
import { DotacaoOrcamentaria, LeiOrcamentaria, ReservaOrcamentaria, ReservaOrcamentariaLinha } from './orcamento/orcamento.entities';
import { OrcamentoService } from './orcamento/orcamento.service';
import { DocumentosTelaService } from './telas/documentos-tela.service';
import { PesquisaTelaService } from './telas/pesquisa-tela.service';
import { OrcamentoController, TelasFaseInternaController } from './telas/telas-fase-interna.controller';
import { AnaliseJuridica, Diligencia } from './telas/parecer.entities';
import { MinutasTelaService } from './telas/minutas-tela.service';
import { MinutasSubscriber } from './telas/minutas.subscriber';
import { AutorizacaoTelaService } from './telas/autorizacao-tela.service';
import { ParecerTelaService } from './telas/parecer-tela.service';
import { ControleInternoTelaService } from './telas/controle-interno-tela.service';
import { TelasAnaliseDecisaoController } from './telas/telas-3b.controller';
import { PublicacaoTelaService } from './telas/publicacao-tela.service';
import { AchadoConformidade, RevisaoConformidade } from './conformidade/achado.entity';
import { ConformidadeService } from './conformidade/conformidade.service';
import { ConformidadeController } from './conformidade/conformidade.controller';
import { EtapaModeloFluxo, FluxoProcessoFaseInterna, ModeloFluxoFaseInterna, PlanejamentoFluxoOrgao, RequisitoLegalFluxo, TravaAtoFluxo } from './fluxo/modelo-fluxo.entities';
import { PlanejamentoFluxoService } from './fluxo/planejamento-fluxo.service';
import { ModeloFluxoService } from './fluxo/modelo-fluxo.service';
import { FluxoProcessoService } from './fluxo/fluxo-processo.service';
import { FluxoProcessoController, ModeloFluxoController } from './fluxo/modelo-fluxo.controller';
import { MigracaoModeloFluxoBootService } from './fluxo/migracao-modelo-fluxo-boot.service';
import { IntegracaoFluxoService } from './fluxo/integracao-fluxo.service';
import { IntegracaoFluxoController } from './fluxo/integracao-fluxo.controller';
import { DespachoEtapaService } from './despacho-etapa.service';
import { DespachoFaseInterna } from './entities/despacho-fase-interna.entity';
import { RascunhoIaFaseInterna } from './ia-rascunho/rascunho-ia.entity';
import { RascunhoIaService } from './ia-rascunho/rascunho-ia.service';
import { RevisaoIaService } from './ia-rascunho/revisao-ia.service';
import { RascunhoIaController } from './ia-rascunho/rascunho-ia.controller';
import { PortalAssinaturasModule } from '../portal-assinaturas/portal-assinaturas.module';
import { ParametrosLicitacaoModule } from '../parametros-licitacao/parametros-licitacao.module';
import { NumeroProcessoModule } from '../numero-processo/numero-processo.module';
import { LogFaseInterna } from './entities/log-fase-interna.entity';
import { ModeloDocumento } from './entities/modelo-documento.entity';
import { TramitacaoProcesso } from './entities/tramitacao-processo.entity';
import {
  FluxoAprovacaoDocumento,
  AprovacaoDocumento,
  ModeloFluxoAprovacao,
} from './entities/fluxo-aprovacao.entity';
import { ModeloDocumentoService } from './modelo-documento.service';
import { TramitacaoService } from './tramitacao.service';
import { TramitacaoPrazosScheduler } from './tramitacao-prazos.scheduler';
import { AprovacaoService } from './aprovacao.service';
import { AprovacaoPecasService } from './aprovacao-pecas.service';
import { AssinaturasInternasService } from './assinaturas-internas.service';
import { AssinaturasInternasController } from './assinaturas-internas.controller';
import { ProcessoEletronicoController } from './processo-eletronico.controller';
import { Setor } from '../orgaos/entities/setor.entity';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { FaseInternaService } from './fase-interna.service';
import { FaseInternaController } from './fase-interna.controller';
import { AuditLogService } from './audit-log.service';
import { DocumentoEstruturadoService } from './documento-estruturado.service';
import { DocumentoEstruturadoController } from './documento-estruturado.controller';
import { GeradorDocumentoService } from './gerador-documento.service';
import { AnaliseContratosService } from './analise-contratos.service';
import { GeradorPpService } from './gerador-pp.service';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { TransicoesModule } from '../licitacoes/transicoes/transicoes.module';
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
    TransicoesModule,
    PortalAssinaturasModule,
    ParametrosLicitacaoModule,
    NumeroProcessoModule,
    TypeOrmModule.forFeature([
      DocumentoFaseInterna,
      DocumentoOrgao,
      LogFaseInterna,
      ModeloDocumento,
      TramitacaoProcesso,
      FluxoAprovacaoDocumento,
      AprovacaoDocumento,
      ModeloFluxoAprovacao,
      Setor,
      Orgao,
      Licitacao,
      Contrato,
      ItemLicitacao,
      Demanda,
      PesquisaPrecoExecucao,
      PesquisaPrecoCandidato,
      Tarefa,
      ConfiguracaoFaseInterna,
      DotacaoOrcamentaria,
      LeiOrcamentaria,
      ReservaOrcamentaria,
      ReservaOrcamentariaLinha,
      AnaliseJuridica,
      Diligencia,
      AchadoConformidade,
      RevisaoConformidade,
      // F1 — modelo de fluxo em dados
      ModeloFluxoFaseInterna,
      EtapaModeloFluxo,
      RequisitoLegalFluxo,
      TravaAtoFluxo,
      FluxoProcessoFaseInterna,
      PlanejamentoFluxoOrgao,
      // F3 — despacho das etapas de registro (folha dos autos)
      DespachoFaseInterna,
      // F4a — rascunho da IA por etapa (não é peça)
      RascunhoIaFaseInterna,
    ]),
  ],
  controllers: [
    FaseInternaController,
    DocumentoEstruturadoController,
    ProcessoEletronicoController,
    TarefasController,
    ConfiguracaoFaseInternaController,
    EtapasFaseInternaController,
    TelasFaseInternaController,
    OrcamentoController,
    TelasAnaliseDecisaoController,
    ConformidadeController,
    ModeloFluxoController,
    FluxoProcessoController,
    IntegracaoFluxoController,
    RascunhoIaController,
    AssinaturasInternasController,
  ],
  providers: [
    ModeloFluxoService,
    PlanejamentoFluxoService,
    FluxoProcessoService,
    IntegracaoFluxoService,
    DespachoEtapaService,
    RevisaoIaService,
    RascunhoIaService,
    MigracaoModeloFluxoBootService,
    FaseInternaService,
    PecasFaseInternaService,
    JuntadaPecasService,
    MigracaoEspelhoDocumentosBootService,
    MigracaoPecaEmitidaBootService,
    CopilotoInterrompidoBootService,
    TarefasService,
    TarefasSubscriber,
    MigracaoTarefasBootService,
    OrcamentoService,
    DocumentosTelaService,
    PesquisaTelaService,
    MinutasTelaService,
    MinutasSubscriber,
    AutorizacaoTelaService,
    ParecerTelaService,
    ControleInternoTelaService,
    ConformidadeService,
    PublicacaoTelaService,
    PreparacaoAutomaticaService,
    ModeloDocumentoService,
    TramitacaoService,
    TramitacaoPrazosScheduler,
    AprovacaoService,
    AprovacaoPecasService,
    AssinaturasInternasService,
    DerivacaoService,
    AuditLogService,
    DocumentoEstruturadoService,
    GeradorDocumentoService,
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
    PecasFaseInternaService,
    // Entrada "fase interna feita fora" (LicitacoesModule — cria o processo)
    JuntadaPecasService,
    PublicacaoTelaService,
    MinutasTelaService,
    PreparacaoAutomaticaService,
    DerivacaoService,
    AuditLogService,
    GeradorDocumentoService,
    PesquisaPrecosAgentService,
    GeradorPpService,
    ModeloDocumentoService,
    TramitacaoService,
    AprovacaoService,
    AprovacaoPecasService,
    TarefasService,
    OrcamentoService,
    ConformidadeService,
    ModeloFluxoService,
    PlanejamentoFluxoService,
    IntegracaoFluxoService,
  ],
})
export class FaseInternaModule {}

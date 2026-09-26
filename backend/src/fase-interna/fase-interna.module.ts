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
import { PortalAssinaturasModule } from '../portal-assinaturas/portal-assinaturas.module';
import { ParametrosLicitacaoModule } from '../parametros-licitacao/parametros-licitacao.module';
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
    TypeOrmModule.forFeature([
      DocumentoFaseInterna,
      DocumentoOrgao,
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
  ],
  providers: [
    FaseInternaService,
    PecasFaseInternaService,
    JuntadaPecasService,
    MigracaoEspelhoDocumentosBootService,
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
    AprovacaoService,
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
    TarefasService,
    OrcamentoService,
    ConformidadeService,
  ],
})
export class FaseInternaModule {}

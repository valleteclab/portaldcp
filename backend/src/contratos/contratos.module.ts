import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ContratosController } from './contratos.controller';
import { ContratosService } from './contratos.service';
import { PortalTransparenciaController } from './portal-transparencia.controller';
import { PortalTransparenciaService } from './portal-transparencia.service';
import { FornecedoresModule } from '../fornecedores/fornecedores.module';
import { Contrato } from './entities/contrato.entity';
import { TermoAditivo } from './entities/termo-aditivo.entity';
import { HistoricoContrato } from './entities/historico-contrato.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { ItemContrato } from '../almoxarifado/entities/item-contrato.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { EtapaCronograma } from './entities/etapa-cronograma.entity';
import { EtapaCronogramaItem } from './entities/etapa-cronograma-item.entity';
import { ItemCronograma } from './entities/item-cronograma.entity';
import { ItemMedicaoItem } from './entities/item-medicao-item.entity';
import { Medicao } from './entities/medicao.entity';
import { ItemMedicao } from './entities/item-medicao.entity';
import { AtestacaoMensal } from './entities/atestacao-mensal.entity';
import { LicencaControle } from './entities/licenca-controle.entity';
import { OrdemServicoContrato } from './entities/ordem-servico-contrato.entity';
import { OrdemServicoContratoItem } from './entities/ordem-servico-contrato-item.entity';
import { BancoMetricas } from './entities/banco-metricas.entity';
import { Requisicao } from '../almoxarifado/entities/requisicao.entity';
import { RequisicaoItemOS } from '../almoxarifado/entities/requisicao-item-os.entity';
import { OrdemFornecimento } from '../almoxarifado/entities/ordem-fornecimento.entity';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { MedicaoService } from './medicao.service';
import { AtestacaoService } from './atestacao.service';
import { LicencaControleService } from './licenca-controle.service';
import { OrdemServicoContratoService } from './ordem-servico-contrato.service';
import { ModalidadesContratoController } from './modalidades-contrato.controller';
import { FornecedorMedicaoController } from './fornecedor-medicao.controller';
import { AnexoMedicao } from './entities/anexo-medicao.entity';
import { DocumentoContrato } from './entities/documento-contrato.entity';
import { MensagemSolicitacaoMedicao } from './entities/mensagem-solicitacao-medicao.entity';
import { DiscriminacaoDespesaMedicao } from './entities/discriminacao-despesa-medicao.entity';
import { UploadModule } from '../upload/upload.module';
import { MulterModule } from '@nestjs/platform-express';
import { AssinaturasModule } from '../assinaturas/assinaturas.module';
import { AssinaturaDigital } from '../assinaturas/entities/assinatura-digital.entity';
import { LinkAssinaturaFiscal } from './entities/link-assinatura-fiscal.entity';
import { AssinaturaFiscalPublicaController } from './assinatura-fiscal-publica.controller';
import { IaModule } from '../ia/ia.module';
import { ImportarContratoIaController } from './importar-contrato-ia.controller';
import { ImportarContratoIaService } from './importar-contrato-ia.service';
import { ImportarMedicaoIaController } from './importar-medicao-ia.controller';
import { ImportarMedicaoIaService } from './importar-medicao-ia.service';
import { FrotaContrato } from '../frota/entities/frota-contrato.entity';
import { SystemConfigModule } from '../system-config/system-config.module';
import { FatorTransparenciaService } from './fator-transparencia.service';
import { MedicaoChatSession } from './entities/medicao-chat-session.entity';
import { MedicaoChatController } from './medicao-chat.controller';
import { MedicaoChatService } from './medicao-chat.service';
import { MedicaoChatAgentService } from './medicao-chat-agent.service';
import { AtualizacaoSistema } from './entities/atualizacao-sistema.entity';
import { AtualizacaoLida } from './entities/atualizacao-lida.entity';
import { AtualizacoesService } from './atualizacoes.service';
import { AtualizacoesController } from './atualizacoes.controller';
import { XmlNfeParserService } from '../almoxarifado/xml-nfe-parser.service';
import { Proposta } from '../propostas/entities/proposta.entity';
import { PropostaItem } from '../propostas/entities/proposta-item.entity';
import { TabelaReferenciaPreco } from './entities/tabela-referencia-preco.entity';
import { ItemTabelaReferencia } from './entities/item-tabela-referencia.entity';
import { TabelaReferenciaService } from './tabela-referencia.service';
import { TabelaReferenciaController } from './tabela-referencia.controller';
import { ConciliacaoFatorService } from './conciliacao-fator.service';
import { ConciliacaoFatorScheduler } from './conciliacao-fator.scheduler';
import { PreOsPublicidade } from './entities/pre-os-publicidade.entity';
import { PreOsPublicidadeService } from './pre-os-publicidade.service';
import { PreOsFornecedorController, PreOsOrgaoController } from './pre-os-publicidade.controller';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { Notificacao } from '../notificacoes/entities/notificacao.entity';

@Module({
  imports: [
    MulterModule.register({
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
    TypeOrmModule.forFeature([
      Contrato, TermoAditivo, DocumentoContrato, HistoricoContrato, Licitacao, ItemLicitacao, Fornecedor, ItemContrato, Usuario,
      EtapaCronograma, EtapaCronogramaItem, ItemCronograma, Medicao, ItemMedicao, ItemMedicaoItem, AnexoMedicao, MensagemSolicitacaoMedicao, DiscriminacaoDespesaMedicao, AtestacaoMensal, LicencaControle, OrdemServicoContrato, OrdemServicoContratoItem, BancoMetricas, Requisicao, OrdemFornecimento, Orgao, AssinaturaDigital, LinkAssinaturaFiscal, FrotaContrato,
      MedicaoChatSession, AtualizacaoSistema, AtualizacaoLida,
      Proposta, PropostaItem,
      TabelaReferenciaPreco, ItemTabelaReferencia, Notificacao, PreOsPublicidade, RequisicaoItemOS,
    ]),
    NotificacoesModule,
    UploadModule,
    IaModule,
    AssinaturasModule,
    HttpModule,
    FornecedoresModule,
    SystemConfigModule,
    WhatsAppModule,
  ],
  controllers: [ModalidadesContratoController, FornecedorMedicaoController, MedicaoChatController, TabelaReferenciaController, PreOsFornecedorController, PreOsOrgaoController, ContratosController, ImportarContratoIaController, ImportarMedicaoIaController, PortalTransparenciaController, AssinaturaFiscalPublicaController, AtualizacoesController],
  providers: [ContratosService, MedicaoService, MedicaoChatService, MedicaoChatAgentService, AtestacaoService, LicencaControleService, OrdemServicoContratoService, TabelaReferenciaService, ConciliacaoFatorService, ConciliacaoFatorScheduler, PreOsPublicidadeService, ImportarContratoIaService, ImportarMedicaoIaService, PortalTransparenciaService, FatorTransparenciaService, XmlNfeParserService, AtualizacoesService],
  exports: [ContratosService, MedicaoService, AtestacaoService, LicencaControleService, OrdemServicoContratoService, PortalTransparenciaService, FatorTransparenciaService]
})
export class ContratosModule {}

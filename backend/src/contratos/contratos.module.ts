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
import { ItemCronograma } from './entities/item-cronograma.entity';
import { ItemMedicaoItem } from './entities/item-medicao-item.entity';
import { Medicao } from './entities/medicao.entity';
import { ItemMedicao } from './entities/item-medicao.entity';
import { AtestacaoMensal } from './entities/atestacao-mensal.entity';
import { LicencaControle } from './entities/licenca-controle.entity';
import { OrdemServicoContrato } from './entities/ordem-servico-contrato.entity';
import { BancoMetricas } from './entities/banco-metricas.entity';
import { Requisicao } from '../almoxarifado/entities/requisicao.entity';
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

@Module({
  imports: [
    MulterModule.register({
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
    TypeOrmModule.forFeature([
      Contrato, TermoAditivo, DocumentoContrato, HistoricoContrato, Licitacao, ItemLicitacao, Fornecedor, ItemContrato, Usuario,
      EtapaCronograma, ItemCronograma, Medicao, ItemMedicao, ItemMedicaoItem, AnexoMedicao, MensagemSolicitacaoMedicao, DiscriminacaoDespesaMedicao, AtestacaoMensal, LicencaControle, OrdemServicoContrato, BancoMetricas, Requisicao, Orgao, AssinaturaDigital, LinkAssinaturaFiscal, FrotaContrato,
    ]),
    NotificacoesModule,
    UploadModule,
    IaModule,
    AssinaturasModule,
    HttpModule,
    FornecedoresModule,
    SystemConfigModule,
  ],
  controllers: [ModalidadesContratoController, FornecedorMedicaoController, ContratosController, ImportarContratoIaController, ImportarMedicaoIaController, PortalTransparenciaController, AssinaturaFiscalPublicaController],
  providers: [ContratosService, MedicaoService, AtestacaoService, LicencaControleService, OrdemServicoContratoService, ImportarContratoIaService, ImportarMedicaoIaService, PortalTransparenciaService, FatorTransparenciaService],
  exports: [ContratosService, MedicaoService, AtestacaoService, LicencaControleService, OrdemServicoContratoService, PortalTransparenciaService, FatorTransparenciaService]
})
export class ContratosModule {}

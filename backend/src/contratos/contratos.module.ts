import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContratosController } from './contratos.controller';
import { ContratosService } from './contratos.service';
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

@Module({
  imports: [
    MulterModule.register({
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
    TypeOrmModule.forFeature([
      Contrato, TermoAditivo, DocumentoContrato, HistoricoContrato, Licitacao, ItemLicitacao, Fornecedor, ItemContrato, Usuario,
      EtapaCronograma, Medicao, ItemMedicao, AnexoMedicao, MensagemSolicitacaoMedicao, DiscriminacaoDespesaMedicao, AtestacaoMensal, LicencaControle, OrdemServicoContrato, BancoMetricas, Requisicao, Orgao,
    ]),
    NotificacoesModule,
    UploadModule,
  ],
  controllers: [ModalidadesContratoController, FornecedorMedicaoController, ContratosController],
  providers: [ContratosService, MedicaoService, AtestacaoService, LicencaControleService, OrdemServicoContratoService],
  exports: [ContratosService, MedicaoService, AtestacaoService, LicencaControleService, OrdemServicoContratoService]
})
export class ContratosModule {}

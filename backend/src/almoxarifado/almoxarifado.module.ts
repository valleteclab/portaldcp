import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlmoxarifadoController } from './almoxarifado.controller';
import { FornecedorOrdensController } from './fornecedor-ordens.controller';
import { RequisicaoService } from './requisicao.service';
import { ItemContratoService } from './item-contrato.service';
import { OrdemFornecimentoService } from './ordem-fornecimento.service';
import { RecebimentoService } from './recebimento.service';
import { ConfiguracaoAprovacaoService } from './configuracao-aprovacao.service';
import { PdfOrdemService } from './pdf-ordem.service';
import { MigracaoContratosService } from './migracao-contratos.service';
import { NotaFiscalFornecedorService } from './nota-fiscal-fornecedor.service';
import { MatchingIaService } from './matching-ia.service';
import { XmlNfeParserService } from './xml-nfe-parser.service';
import { ItemContrato } from './entities/item-contrato.entity';
import { Requisicao } from './entities/requisicao.entity';
import { ItemRequisicao } from './entities/item-requisicao.entity';
import { OrdemFornecimento } from './entities/ordem-fornecimento.entity';
import { Recebimento } from './entities/recebimento.entity';
import { ConfiguracaoAprovacao } from './entities/configuracao-aprovacao.entity';
import { HistoricoOrdemFornecimento } from './entities/historico-ordem.entity';
import { HistoricoRequisicao } from './entities/historico-requisicao.entity';
import { RequisicaoItemOS } from './entities/requisicao-item-os.entity';
import { RequisicaoEtapaOS } from './entities/requisicao-etapa-os.entity';
import { NotaFiscalFornecedor } from './entities/nota-fiscal-fornecedor.entity';
import { Contrato } from '../contratos/entities/contrato.entity';
import { ItemCronograma } from '../contratos/entities/item-cronograma.entity';
import { EtapaCronograma } from '../contratos/entities/etapa-cronograma.entity';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { ContratosModule } from '../contratos/contratos.module';
import { EmailModule } from '../email/email.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { AssinaturasModule } from '../assinaturas/assinaturas.module';
import { IaModule } from '../ia/ia.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ItemContrato,
      Requisicao,
      ItemRequisicao,
      OrdemFornecimento,
      Recebimento,
      ConfiguracaoAprovacao,
      HistoricoOrdemFornecimento,
      HistoricoRequisicao,
      RequisicaoItemOS,
      RequisicaoEtapaOS,
      NotaFiscalFornecedor,
      ItemCronograma,
      EtapaCronograma,
      Contrato,
      Orgao,
      Fornecedor,
      Usuario,
    ]),
    NotificacoesModule,
    forwardRef(() => ContratosModule),
    EmailModule,
    WhatsAppModule,
    AssinaturasModule,
    IaModule,
  ],
  controllers: [AlmoxarifadoController, FornecedorOrdensController],
  providers: [
    RequisicaoService, 
    ItemContratoService,
    OrdemFornecimentoService,
    RecebimentoService,
    ConfiguracaoAprovacaoService,
    PdfOrdemService,
    MigracaoContratosService,
    NotaFiscalFornecedorService,
    MatchingIaService,
    XmlNfeParserService,
  ],
  exports: [
    RequisicaoService, 
    ItemContratoService,
    OrdemFornecimentoService,
    RecebimentoService,
    ConfiguracaoAprovacaoService,
  ],
})
export class AlmoxarifadoModule {}

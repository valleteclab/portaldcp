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
import { ItemContrato } from './entities/item-contrato.entity';
import { Requisicao } from './entities/requisicao.entity';
import { ItemRequisicao } from './entities/item-requisicao.entity';
import { OrdemFornecimento } from './entities/ordem-fornecimento.entity';
import { Recebimento } from './entities/recebimento.entity';
import { ConfiguracaoAprovacao } from './entities/configuracao-aprovacao.entity';
import { HistoricoOrdemFornecimento } from './entities/historico-ordem.entity';
import { Contrato } from '../contratos/entities/contrato.entity';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { ContratosModule } from '../contratos/contratos.module';
import { EmailModule } from '../email/email.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

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
      Contrato,
      Orgao,
      Fornecedor,
      Usuario,
    ]),
    NotificacoesModule,
    forwardRef(() => ContratosModule),
    EmailModule,
    WhatsAppModule,
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

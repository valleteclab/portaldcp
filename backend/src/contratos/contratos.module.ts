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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Contrato, TermoAditivo, HistoricoContrato, Licitacao, ItemLicitacao, Fornecedor, ItemContrato, Usuario,
      EtapaCronograma, Medicao, ItemMedicao, AtestacaoMensal, LicencaControle, OrdemServicoContrato, BancoMetricas,
    ]),
    NotificacoesModule,
  ],
  controllers: [ContratosController],
  providers: [ContratosService],
  exports: [ContratosService]
})
export class ContratosModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotaFiscalFornecedor } from '../almoxarifado/entities/nota-fiscal-fornecedor.entity';
import { Recebimento } from '../almoxarifado/entities/recebimento.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { AlmoxarifadoModule } from '../almoxarifado/almoxarifado.module';
import { PortalAssinaturasModule } from '../portal-assinaturas/portal-assinaturas.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { SignatarioDocumento } from '../assinaturas/entities/signatario-documento.entity';
import { AssinarNotaController } from './assinar-nota.controller';
import { NotasFornecimentoController } from './notas-fornecimento.controller';
import { NotasFornecimentoService } from './notas-fornecimento.service';

/** Notas de fornecimento tratadas na tela das Medições (destino MEDICOES/AMBOS do órgão). */
@Module({
  imports: [
    TypeOrmModule.forFeature([NotaFiscalFornecedor, Recebimento, Usuario, Orgao, SignatarioDocumento]),
    AlmoxarifadoModule,
    PortalAssinaturasModule,
    NotificacoesModule,
  ],
  controllers: [NotasFornecimentoController, AssinarNotaController],
  providers: [NotasFornecimentoService],
})
export class NotasFornecimentoModule {}

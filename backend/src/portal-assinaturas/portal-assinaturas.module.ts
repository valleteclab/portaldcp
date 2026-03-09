import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PortalAssinaturasService } from './portal-assinaturas.service';
import { PortalAssinaturasController } from './portal-assinaturas.controller';
import { PublicAssinaturasController } from './public-assinaturas.controller';
import { DocumentoAssinatura } from '../assinaturas/entities/documento-assinatura.entity';
import { SignatarioDocumento } from '../assinaturas/entities/signatario-documento.entity';
import { Medicao } from '../contratos/entities/medicao.entity';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { AssinaturasModule } from '../assinaturas/assinaturas.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentoAssinatura, SignatarioDocumento, Medicao]),
    NotificacoesModule,
    AssinaturasModule,
  ],
  controllers: [PortalAssinaturasController, PublicAssinaturasController],

  providers: [PortalAssinaturasService],
  exports: [PortalAssinaturasService],
})
export class PortalAssinaturasModule {}
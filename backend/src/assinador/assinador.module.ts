import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssinadorController } from './assinador.controller';
import { AssinadorService } from './assinador.service';
import { DocumentoAssinatura } from '../assinaturas/entities/documento-assinatura.entity';
import { SignatarioDocumento } from '../assinaturas/entities/signatario-documento.entity';
import { PortalAssinaturasModule } from '../portal-assinaturas/portal-assinaturas.module';
import { AssinaturasModule } from '../assinaturas/assinaturas.module';
import { UsuariosModule } from '../usuarios/usuarios.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentoAssinatura, SignatarioDocumento]),
    PortalAssinaturasModule,
    AssinaturasModule,
    UsuariosModule,
  ],
  controllers: [AssinadorController],
  providers: [AssinadorService],
  exports: [AssinadorService],
})
export class AssinadorModule {}

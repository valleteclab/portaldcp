import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssinaturaDigital } from './entities/assinatura-digital.entity';
import { AssinaturasService } from './assinaturas.service';
import { AssinaturasController } from './assinaturas.controller';
import { GeradorPdfService } from './gerador-pdf.service';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AssinaturaDigital]),
    WhatsAppModule,
    AuthModule,
    EmailModule,
  ],
  controllers: [AssinaturasController],
  providers: [AssinaturasService, GeradorPdfService],
  exports: [AssinaturasService, GeradorPdfService],
})
export class AssinaturasModule {}

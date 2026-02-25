import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhooksController } from './webhooks.controller';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { Orgao } from '../orgaos/entities/orgao.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Orgao]),
    WhatsAppModule,
  ],
  controllers: [WebhooksController],
})
export class WebhooksModule {}

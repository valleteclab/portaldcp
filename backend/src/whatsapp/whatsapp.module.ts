import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { SystemConfigModule } from '../system-config/system-config.module';
import { WhatsAppService } from './whatsapp.service';
import { ZApiProvider } from './providers/zapi.provider';
import { MetaChatwootProvider } from './providers/meta-chatwoot.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([Orgao]),
    SystemConfigModule,
  ],
  providers: [WhatsAppService, ZApiProvider, MetaChatwootProvider],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}

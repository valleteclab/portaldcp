import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { SystemConfigModule } from '../system-config/system-config.module';
import { WhatsAppService } from './whatsapp.service';
import { ZApiProvider } from './providers/zapi.provider';
import { MetaChatwootProvider } from './providers/meta-chatwoot.provider';
import { WhatsappChatService } from './whatsapp-chat.service';
import { WhatsappChatController } from './whatsapp-chat.controller';
import { WhatsappConversa } from './entities/whatsapp-conversa.entity';
import { WhatsappMensagem } from './entities/whatsapp-mensagem.entity';
import { WhatsappAgentModule } from '../whatsapp-agent/whatsapp-agent.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Orgao, WhatsappConversa, WhatsappMensagem]),
    SystemConfigModule,
    forwardRef(() => WhatsappAgentModule),
  ],
  controllers: [WhatsappChatController],
  providers: [WhatsAppService, ZApiProvider, MetaChatwootProvider, WhatsappChatService],
  exports: [WhatsAppService, WhatsappChatService],
})
export class WhatsAppModule {}

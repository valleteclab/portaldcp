import { Controller, Post, Body, Get, Query, Logger } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { WhatsappChatService } from '../whatsapp/whatsapp-chat.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Orgao } from '../orgaos/entities/orgao.entity';

interface ZApiWebhookPayload {
  instanceId?: string;
  from?: string;
  messageId?: string;
  type?: string;
  phone?: string;
  senderName?: string;
  message?: {
    type?: string;
    text?: string;
    conversation?: string;
  };
  status?: string;
  isStatusReply?: boolean;
  metadata?: {
    notificationType?: string;
  };
}

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly whatsappChatService: WhatsappChatService,
    @InjectRepository(Orgao)
    private readonly orgaoRepository: Repository<Orgao>,
  ) {}

  @Public()
  @Post('zapi')
  async receiveZapiWebhook(@Body() payload: ZApiWebhookPayload) {
    this.logger.log(`Webhook Z-API: ${JSON.stringify(payload)}`);

    const instanceId = payload.instanceId;
    const messageId  = payload.messageId;
    const status     = payload.status;
    const notificationType = payload.metadata?.notificationType;

    // ── Atualizar status de mensagem enviada ──────────────────────────────────
    if (messageId && (notificationType || status)) {
      if (notificationType === '0' || status === 'success') {
        await this.whatsappChatService.atualizarStatusMensagem(messageId, 'ENTREGUE');
      } else if (notificationType === '1' || status === 'read') {
        await this.whatsappChatService.atualizarStatusMensagem(messageId, 'LIDA');
      } else if (notificationType === '2' || status === 'failed') {
        await this.whatsappChatService.atualizarStatusMensagem(messageId, 'FALHA');
      }
    }

    // ── Mensagem recebida de contato ─────────────────────────────────────────
    const texto = payload.message?.text || payload.message?.conversation;
    const fromPhone = payload.from || payload.phone;

    if (texto && fromPhone && !payload.isStatusReply) {
      const orgao = instanceId
        ? await this.orgaoRepository.findOne({ where: { whatsapp_instance_id: instanceId } })
        : null;

      if (orgao) {
        const phone = fromPhone.replace(/\D/g, '');
        await this.whatsappChatService.receberMensagemWebhook(
          orgao.id,
          phone,
          texto,
          messageId,
          payload.senderName,
        );
      } else {
        this.logger.warn(`Webhook Z-API: nenhum órgão encontrado para instanceId=${instanceId}`);
      }
    }

    return { status: 'ok' };
  }

  @Public()
  @Get('zapi-url')
  async getWebhookUrl(@Query('instanceId') instanceId?: string) {
    const baseUrl = process.env.APP_URL || 'https://portaldcp-production.up.railway.app';
    return {
      url: `${baseUrl}/api/webhooks/zapi`,
      instrucoes: 'Copie esta URL e cole no campo Webhook URL nas configurações da sua instância Z-API',
    };
  }
}

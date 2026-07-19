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
  chatName?: string;
  senderName?: string;
  fromMe?: boolean;
  isGroup?: boolean;
  isStatusReply?: boolean;
  text?: {
    message?: string;
  };
  message?: {
    type?: string;
    text?: string;
    conversation?: string;
  };
  image?: { imageUrl?: string; caption?: string };
  audio?: { audioUrl?: string };
  document?: { documentUrl?: string; fileName?: string };
  status?: string;
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
    // Z-API envia texto em text.message OU message.text OU message.conversation
    const texto = payload.text?.message
      || payload.message?.text
      || payload.message?.conversation
      || payload.image?.caption;
    const fromPhone = payload.phone || payload.from;

    // Mídia recebida (foto ou documento) — usada pelo bot de medição (NF)
    const midia = payload.image?.imageUrl
      ? { url: payload.image.imageUrl, tipo: 'imagem' as const }
      : payload.document?.documentUrl
        ? {
            url: payload.document.documentUrl,
            fileName: payload.document.fileName,
            tipo: 'documento' as const,
          }
        : undefined;

    this.logger.log(`Webhook Z-API parsed: fromPhone=${fromPhone}, texto=${texto ? texto.substring(0, 50) : 'null'}, midia=${midia?.tipo || 'nao'}, fromMe=${payload.fromMe}, isGroup=${payload.isGroup}, isStatusReply=${payload.isStatusReply}`);

    if ((texto || midia) && fromPhone && !payload.isStatusReply && !payload.fromMe && !payload.isGroup) {
      const orgao = instanceId
        ? await this.orgaoRepository.findOne({ where: { whatsapp_instance_id: instanceId } })
        : null;

      if (orgao) {
        const phone = fromPhone.replace(/@.*$/, '').replace(/\D/g, '');
        await this.whatsappChatService.receberMensagemWebhook(
          orgao.id,
          phone,
          texto || (midia?.tipo === 'imagem' ? '📷 [imagem]' : '📎 [documento]'),
          messageId,
          payload.senderName || payload.chatName,
          midia,
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

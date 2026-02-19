import { Controller, Post, Body, Get, Query, Logger } from '@nestjs/common';
import { Public } from '../auth/public.decorator';

interface ZApiWebhookPayload {
  instanceId?: string;
  from?: string;
  messageId?: string;
  type?: string;
  message?: {
    type?: string;
    text?: string;
  };
  status?: string;
  metadata?: {
    notificationType?: string;
  };
}

@Controller('api/webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  @Public()
  @Post('zapi')
  async receiveZapiWebhook(@Body() payload: ZApiWebhookPayload) {
    this.logger.log(`Webhook Z-API recebido: ${JSON.stringify(payload)}`);

    const instanceId = payload.instanceId;
    const messageId = payload.messageId;
    const from = payload.from;
    const status = payload.status;
    const notificationType = payload.metadata?.notificationType;

    if (notificationType === '0' || status === 'success') {
      this.logger.log(`Mensagem entregue para ${from}, messageId: ${messageId}`);
    } else if (notificationType === '1' || status === 'read') {
      this.logger.log(`Mensagem lida por ${from}, messageId: ${messageId}`);
    } else if (notificationType === '2' || status === 'failed') {
      this.logger.warn(`Falha ao enviar mensagem para ${from}, messageId: ${messageId}`);
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

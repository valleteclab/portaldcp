import { ForbiddenException, Logger } from '@nestjs/common';
import { segredosIguais } from './senha.util';

const logger = new Logger('WebhookToken');
let avisado = false;

/**
 * Webhooks do WhatsApp (Z-API) são rotas públicas: sem um segredo, qualquer
 * pessoa forja uma mensagem "vinda" do telefone de um fornecedor ou de um
 * gestor. Com `WEBHOOK_ZAPI_TOKEN` definido, a chamada só vale se trouxer o
 * mesmo valor em `?token=` (na URL cadastrada no provedor) ou num dos
 * cabeçalhos aceitos. Sem a variável, segue aberto (compatibilidade) e avisa
 * uma vez no log.
 */
export function exigirTokenDoWebhook(req: { query?: any; headers?: any }): void {
  const esperado = (process.env.WEBHOOK_ZAPI_TOKEN || '').trim();
  if (!esperado) {
    if (!avisado) {
      avisado = true;
      logger.warn('WEBHOOK_ZAPI_TOKEN não configurado — webhooks do WhatsApp aceitos sem verificação de origem.');
    }
    return;
  }
  const h = req?.headers || {};
  const recebido = req?.query?.token ?? h['x-webhook-token'] ?? h['client-token'] ?? h['z-api-token'];
  if (!recebido || !segredosIguais(String(recebido), esperado)) {
    throw new ForbiddenException('Webhook não autorizado');
  }
}

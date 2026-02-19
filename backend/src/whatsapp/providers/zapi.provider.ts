import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { IWhatsAppProvider, WhatsAppConfig } from '../whatsapp.interfaces';

const ZAPI_BASE = 'https://api.z-api.io';

@Injectable()
export class ZApiProvider implements IWhatsAppProvider {
  private readonly logger = new Logger(ZApiProvider.name);

  private normalizarTelefone(phone: string): string {
    const numeros = phone.replace(/\D/g, '');
    if (numeros.length >= 12) return numeros;
    if (numeros.length >= 10) return '55' + numeros;
    return numeros;
  }

  async enviar(params: {
    to: string;
    mensagem: string;
    orgaoId?: string;
    config: WhatsAppConfig;
  }): Promise<boolean> {
    const { to, mensagem, config } = params;
    const phone = this.normalizarTelefone(to);
    if (phone.length < 12) {
      this.logger.warn(`Telefone inválido para WhatsApp: ${to}`);
      return false;
    }

    try {
      const url = `${ZAPI_BASE}/instances/${config.instanceId}/token/${config.token}/send-text`;
      this.logger.log(`Chamando Z-API: POST ${url} | phone=${phone} | clientToken=${config.clientToken ? 'presente' : 'ausente'}`);
      const response = await axios.post(
        url,
        { phone, message: mensagem },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(config.clientToken ? { 'Client-Token': config.clientToken } : {}),
          },
          timeout: 15000,
        },
      );
      if (response.data?.messageId || response.data?.zaapId) {
        this.logger.log(`WhatsApp enviado para ${phone}: ${response.data.messageId || response.data.zaapId}`);
        return true;
      }
      return false;
    } catch (error: any) {
      this.logger.error(`Erro ao enviar WhatsApp para ${phone}: status=${error.response?.status} body=${JSON.stringify(error.response?.data)} msg=${error.message}`);
      return false;
    }
  }

  async testarConexao(params: {
    config: WhatsAppConfig;
    numeroTeste?: string;
  }): Promise<{ sucesso: boolean; mensagem: string }> {
    const { config, numeroTeste } = params;
    if (!config.instanceId || !config.token) {
      return { sucesso: false, mensagem: 'Configuração Z-API incompleta (instance_id e token são obrigatórios)' };
    }
    const phone = numeroTeste ? this.normalizarTelefone(numeroTeste) : null;
    if (!phone || phone.length < 12) {
      return { sucesso: false, mensagem: 'Informe um número de teste válido (ex: 5511999999999)' };
    }

    const enviado = await this.enviar({
      to: phone,
      mensagem: '[Teste] Configuração de WhatsApp - Portal DCP. Se você recebeu, a integração está correta.',
      config,
    });
    return enviado
      ? { sucesso: true, mensagem: `Mensagem de teste enviada para ${phone}` }
      : { sucesso: false, mensagem: 'Falha ao enviar mensagem de teste. Verifique as credenciais Z-API.' };
  }
}

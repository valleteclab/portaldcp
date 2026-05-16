import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { IWhatsAppProvider, WhatsAppButtonAction, WhatsAppConfig } from '../whatsapp.interfaces';

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
      const clientToken = config.clientToken?.replace(/[\r\n\t]/g, '').trim();
      this.logger.log(`Chamando Z-API: POST ${url} | phone=${phone} | clientToken=${clientToken ? 'presente' : 'ausente'}`);
      const response = await axios.post(
        url,
        { phone, message: mensagem },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(clientToken ? { 'Client-Token': clientToken } : {}),
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

  async enviarComBotao(params: {
    to: string;
    mensagem: string;
    botoes: WhatsAppButtonAction[];
    orgaoId?: string;
    config: WhatsAppConfig;
  }): Promise<boolean> {
    const { to, mensagem, botoes, config } = params;
    const phone = this.normalizarTelefone(to);
    if (phone.length < 12) {
      this.logger.warn(`Telefone inválido para WhatsApp: ${to}`);
      return false;
    }

    try {
      const url = `${ZAPI_BASE}/instances/${config.instanceId}/token/${config.token}/send-button-actions`;
      const clientToken = config.clientToken?.replace(/[\r\n\t]/g, '').trim();
      this.logger.log(`Chamando Z-API (botão): POST ${url} | phone=${phone}`);
      const buttonActions = botoes.map(b => ({
        id: b.id,
        type: b.type,
        label: b.label,
        ...(b.url ? { url: b.url } : {}),
        ...(b.phoneNumber ? { phoneNumber: b.phoneNumber } : {}),
      }));
      const response = await axios.post(
        url,
        { phone, message: mensagem, buttonActions },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(clientToken ? { 'Client-Token': clientToken } : {}),
          },
          timeout: 15000,
        },
      );
      if (response.data?.messageId || response.data?.zaapId) {
        this.logger.log(`WhatsApp com botão enviado para ${phone}: ${response.data.messageId || response.data.zaapId}`);
        return true;
      }
      return false;
    } catch (error: any) {
      this.logger.warn(`Falha ao enviar botão para ${phone} (status=${error.response?.status}), tentando texto simples...`);
      return this.enviar(params);
    }
  }

  async enviarDocumento(params: {
    to: string;
    documentoBase64: string;
    nomeArquivo: string;
    legenda?: string;
    extensao?: string;
    mimeType?: string;
    orgaoId?: string;
    config: WhatsAppConfig;
  }): Promise<boolean> {
    const { to, documentoBase64, nomeArquivo, legenda, config } = params;
    const phone = this.normalizarTelefone(to);
    if (phone.length < 12) {
      this.logger.warn(`Telefone invÃ¡lido para WhatsApp: ${to}`);
      return false;
    }

    const extensao = (params.extensao || nomeArquivo.split('.').pop() || 'pdf').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'pdf';
    const mimeType = params.mimeType || (extensao === 'pdf' ? 'application/pdf' : 'application/octet-stream');
    const document = documentoBase64.startsWith('data:')
      ? documentoBase64
      : `data:${mimeType};base64,${documentoBase64}`;

    try {
      const url = `${ZAPI_BASE}/instances/${config.instanceId}/token/${config.token}/send-document/${extensao}`;
      const clientToken = config.clientToken?.replace(/[\r\n\t]/g, '').trim();
      this.logger.log(`Chamando Z-API (documento): POST ${url} | phone=${phone} | fileName=${nomeArquivo}`);
      const response = await axios.post(
        url,
        {
          phone,
          document,
          fileName: nomeArquivo,
          ...(legenda ? { caption: legenda } : {}),
        },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(clientToken ? { 'Client-Token': clientToken } : {}),
          },
          timeout: 30000,
        },
      );
      if (response.data?.messageId || response.data?.zaapId || response.data?.id) {
        this.logger.log(`Documento WhatsApp enviado para ${phone}: ${response.data.messageId || response.data.zaapId || response.data.id}`);
        return true;
      }
      return false;
    } catch (error: any) {
      this.logger.error(`Erro ao enviar documento WhatsApp para ${phone}: status=${error.response?.status} body=${JSON.stringify(error.response?.data)} msg=${error.message}`);
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

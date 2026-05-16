import { Injectable } from '@nestjs/common';
import { IWhatsAppProvider } from '../whatsapp.interfaces';

@Injectable()
export class MetaChatwootProvider implements IWhatsAppProvider {
  async enviar(): Promise<boolean> {
    throw new Error('Provedor Meta + Chatwoot ainda não implementado. Use Z-API por enquanto.');
  }

  async enviarComBotao(): Promise<boolean> {
    throw new Error('Provedor Meta + Chatwoot ainda não implementado. Use Z-API por enquanto.');
  }

  async enviarDocumento(): Promise<boolean> {
    throw new Error('Provedor Meta + Chatwoot ainda nao implementado. Use Z-API por enquanto.');
  }

  async testarConexao(): Promise<{ sucesso: boolean; mensagem: string }> {
    return {
      sucesso: false,
      mensagem: 'Provedor Meta + Chatwoot ainda não implementado. Use Z-API por enquanto.',
    };
  }
}

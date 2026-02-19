export interface WhatsAppButtonAction {
  id: string;
  type: 'URL' | 'CALL' | 'REPLY';
  label: string;
  url?: string;
  phoneNumber?: string;
}

export interface IWhatsAppProvider {
  enviar(params: {
    to: string;
    mensagem: string;
    orgaoId?: string;
    config: WhatsAppConfig;
  }): Promise<boolean>;
  enviarComBotao?(params: {
    to: string;
    mensagem: string;
    botoes: WhatsAppButtonAction[];
    orgaoId?: string;
    config: WhatsAppConfig;
  }): Promise<boolean>;
  testarConexao?(params: {
    config: WhatsAppConfig;
    numeroTeste?: string;
  }): Promise<{ sucesso: boolean; mensagem: string }>;
}

export interface WhatsAppConfig {
  instanceId: string;
  token: string;
  clientToken?: string;
}

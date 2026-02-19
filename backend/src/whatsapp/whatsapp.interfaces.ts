export interface IWhatsAppProvider {
  enviar(params: {
    to: string;
    mensagem: string;
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

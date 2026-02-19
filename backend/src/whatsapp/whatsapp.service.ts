import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { createDecipheriv } from 'crypto';
import { ZApiProvider } from './providers/zapi.provider';
import { MetaChatwootProvider } from './providers/meta-chatwoot.provider';
import { IWhatsAppProvider, WhatsAppButtonAction, WhatsAppConfig } from './whatsapp.interfaces';
import { SystemConfigService } from '../system-config/system-config.service';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    @InjectRepository(Orgao)
    private readonly orgaoRepository: Repository<Orgao>,
    private readonly zApiProvider: ZApiProvider,
    private readonly metaChatwootProvider: MetaChatwootProvider,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  private getEncryptionKey(): string {
    return process.env.PNCP_ENCRYPTION_KEY || 'licitafacil-pncp-encryption-key-32';
  }

  private decryptText(encryptedText: string): string {
    if (!encryptedText || !encryptedText.includes(':')) return encryptedText;
    try {
      const key = Buffer.from(this.getEncryptionKey().padEnd(32, '0').substring(0, 32));
      const textParts = encryptedText.split(':');
      const iv = Buffer.from(textParts.shift()!, 'hex');
      const encrypted = textParts.join(':');
      const decipher = createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      return encryptedText;
    }
  }

  private getProvider(providerName: string) {
    if (providerName === 'META') return this.metaChatwootProvider;
    return this.zApiProvider;
  }

  async getConfig(orgaoId: string): Promise<WhatsAppConfig | null> {
    const orgao = await this.orgaoRepository.findOne({
      where: { id: orgaoId },
      select: ['id', 'whatsapp_provider', 'whatsapp_instance_id', 'whatsapp_token', 'whatsapp_client_token'],
    });

    if (orgao?.whatsapp_instance_id && orgao?.whatsapp_token && orgao?.whatsapp_client_token) {
      return {
        instanceId: orgao.whatsapp_instance_id,
        token: this.decryptText(orgao.whatsapp_token),
        clientToken: this.decryptText(orgao.whatsapp_client_token),
      };
    }

    const instanceId = await this.systemConfigService.getValue('WHATSAPP_ZAPI_INSTANCE_ID');
    const tokenEnc = await this.systemConfigService.getValue('WHATSAPP_ZAPI_TOKEN');
    const clientTokenEnc = await this.systemConfigService.getValue('WHATSAPP_ZAPI_CLIENT_TOKEN');
    if (instanceId && tokenEnc && clientTokenEnc) {
      return {
        instanceId,
        token: this.decryptText(tokenEnc),
        clientToken: this.decryptText(clientTokenEnc),
      };
    }

    if (process.env.WHATSAPP_ZAPI_INSTANCE_ID && process.env.WHATSAPP_ZAPI_TOKEN && process.env.WHATSAPP_ZAPI_CLIENT_TOKEN) {
      return {
        instanceId: process.env.WHATSAPP_ZAPI_INSTANCE_ID,
        token: process.env.WHATSAPP_ZAPI_TOKEN,
        clientToken: process.env.WHATSAPP_ZAPI_CLIENT_TOKEN,
      };
    }

    return null;
  }

  async isConfigurado(orgaoId: string): Promise<boolean> {
    return (await this.getConfig(orgaoId)) !== null;
  }

  async enviar(orgaoId: string, params: { to: string; mensagem: string }): Promise<boolean> {
    const config = await this.getConfig(orgaoId);
    if (!config) {
      this.logger.warn(`WhatsApp nao configurado para orgao ${orgaoId}, mensagem nao enviada`);
      return false;
    }

    const orgao = await this.orgaoRepository.findOne({
      where: { id: orgaoId },
      select: ['whatsapp_provider'],
    });
    const providerName = orgao?.whatsapp_provider || 'ZAPI';
    const provider = this.getProvider(providerName);

    try {
      return await provider.enviar({
        to: params.to,
        mensagem: params.mensagem,
        orgaoId,
        config,
      });
    } catch (error: any) {
      this.logger.error(`Erro ao enviar WhatsApp (orgao ${orgaoId}): ${error.message}`);
      return false;
    }
  }

  async enviarComBotao(orgaoId: string, params: { to: string; mensagem: string; botoes: WhatsAppButtonAction[] }): Promise<boolean> {
    const config = await this.getConfig(orgaoId);
    if (!config) {
      this.logger.warn(`WhatsApp nao configurado para orgao ${orgaoId}, mensagem nao enviada`);
      return false;
    }

    const orgao = await this.orgaoRepository.findOne({
      where: { id: orgaoId },
      select: ['whatsapp_provider'],
    });
    const providerName = orgao?.whatsapp_provider || 'ZAPI';
    const provider = this.getProvider(providerName);

    try {
      const p = provider as IWhatsAppProvider;
      if (p.enviarComBotao) {
        return await p.enviarComBotao({ ...params, orgaoId, config });
      }
      return await p.enviar({ to: params.to, mensagem: params.mensagem, orgaoId, config });
    } catch (error: any) {
      this.logger.error(`Erro ao enviar WhatsApp com botão (orgao ${orgaoId}): ${error.message}`);
      return false;
    }
  }

  async testarConexao(orgaoId: string, numeroTeste: string): Promise<{ sucesso: boolean; mensagem: string }> {
    const config = await this.getConfig(orgaoId);
    if (!config) {
      return { sucesso: false, mensagem: 'WhatsApp nao configurado para este orgao. Configure ou use config global.' };
    }

    const orgao = await this.orgaoRepository.findOne({
      where: { id: orgaoId },
      select: ['whatsapp_provider'],
    });
    const providerName = orgao?.whatsapp_provider || 'ZAPI';
    const provider = this.getProvider(providerName);

    if (provider.testarConexao) {
      return provider.testarConexao({ config, numeroTeste });
    }
    return { sucesso: false, mensagem: 'Provedor nao suporta teste de conexao' };
  }
}

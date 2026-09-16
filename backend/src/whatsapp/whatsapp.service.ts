import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { decryptTextOrRaw } from '../common/crypto.util';
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

  private decryptText(encryptedText: string): string {
    return decryptTextOrRaw(encryptedText);
  }

  private getProvider(providerName: string) {
    if (providerName === 'META') return this.metaChatwootProvider;
    return this.zApiProvider;
  }

  private sanitizeClientToken(value?: string | null): string | undefined {
    const raw = value?.replace(/[\r\n\t]/g, '').trim();
    if (!raw) return undefined;
    if (raw.startsWith('http://') || raw.startsWith('https://')) return undefined;
    return raw;
  }

  async getConfig(orgaoId: string): Promise<WhatsAppConfig | null> {
    const orgao = await this.orgaoRepository.findOne({
      where: { id: orgaoId },
      select: ['id', 'whatsapp_provider', 'whatsapp_instance_id', 'whatsapp_token', 'whatsapp_client_token'],
    });

    if (orgao?.whatsapp_instance_id && orgao?.whatsapp_token) {
      const clientToken = this.sanitizeClientToken(
        orgao.whatsapp_client_token ? this.decryptText(orgao.whatsapp_client_token) : undefined,
      );
      return {
        instanceId: orgao.whatsapp_instance_id,
        token: this.decryptText(orgao.whatsapp_token),
        clientToken,
      };
    }

    const instanceId = await this.systemConfigService.getValue('WHATSAPP_ZAPI_INSTANCE_ID');
    const tokenEnc = await this.systemConfigService.getValue('WHATSAPP_ZAPI_TOKEN');
    const clientTokenEnc = await this.systemConfigService.getValue('WHATSAPP_ZAPI_CLIENT_TOKEN');
    if (instanceId && tokenEnc) {
      return {
        instanceId,
        token: this.decryptText(tokenEnc),
        clientToken: this.sanitizeClientToken(clientTokenEnc ? this.decryptText(clientTokenEnc) : undefined),
      };
    }

    if (process.env.WHATSAPP_ZAPI_INSTANCE_ID && process.env.WHATSAPP_ZAPI_TOKEN) {
      return {
        instanceId: process.env.WHATSAPP_ZAPI_INSTANCE_ID,
        token: process.env.WHATSAPP_ZAPI_TOKEN,
        clientToken: this.sanitizeClientToken(process.env.WHATSAPP_ZAPI_CLIENT_TOKEN),
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

  async enviarDocumento(orgaoId: string, params: {
    to: string;
    documentoBase64: string;
    nomeArquivo: string;
    legenda?: string;
    extensao?: string;
    mimeType?: string;
  }): Promise<boolean> {
    const config = await this.getConfig(orgaoId);
    if (!config) {
      this.logger.warn(`WhatsApp nao configurado para orgao ${orgaoId}, documento nao enviado`);
      return false;
    }

    const orgao = await this.orgaoRepository.findOne({
      where: { id: orgaoId },
      select: ['whatsapp_provider'],
    });
    const providerName = orgao?.whatsapp_provider || 'ZAPI';
    const provider = this.getProvider(providerName) as IWhatsAppProvider;

    try {
      if (!provider.enviarDocumento) {
        this.logger.warn(`Provedor WhatsApp ${providerName} nao suporta envio de documento`);
        return false;
      }
      return await provider.enviarDocumento({ ...params, orgaoId, config });
    } catch (error: any) {
      this.logger.error(`Erro ao enviar documento WhatsApp (orgao ${orgaoId}): ${error.message}`);
      return false;
    }
  }

  async enviarSistema(phone: string, mensagem: string): Promise<boolean> {
    let config: WhatsAppConfig | null = null;

    // 1. Tentar system_config do banco (clientToken opcional)
    const instanceId = await this.systemConfigService.getValue('WHATSAPP_ZAPI_INSTANCE_ID');
    const tokenEnc = await this.systemConfigService.getValue('WHATSAPP_ZAPI_TOKEN');
    if (instanceId && tokenEnc) {
      const clientTokenEnc = await this.systemConfigService.getValue('WHATSAPP_ZAPI_CLIENT_TOKEN');
      config = {
        instanceId,
        token: this.decryptText(tokenEnc),
        clientToken: this.sanitizeClientToken(clientTokenEnc ? this.decryptText(clientTokenEnc) : undefined),
      };
    }

    // 2. Tentar env vars (clientToken opcional)
    if (!config && process.env.WHATSAPP_ZAPI_INSTANCE_ID && process.env.WHATSAPP_ZAPI_TOKEN) {
      config = {
        instanceId: process.env.WHATSAPP_ZAPI_INSTANCE_ID,
        token: process.env.WHATSAPP_ZAPI_TOKEN,
        clientToken: this.sanitizeClientToken(process.env.WHATSAPP_ZAPI_CLIENT_TOKEN),
      };
    }

    // 3. Fallback: usar credenciais de qualquer órgão configurado
    if (!config) {
      const orgao = await this.orgaoRepository.findOne({
        where: {},
        select: ['id', 'whatsapp_provider', 'whatsapp_instance_id', 'whatsapp_token', 'whatsapp_client_token'],
        order: { id: 'ASC' },
      });
      if (orgao?.whatsapp_instance_id && orgao?.whatsapp_token) {
        const clientToken = this.sanitizeClientToken(
          orgao.whatsapp_client_token ? this.decryptText(orgao.whatsapp_client_token) : undefined,
        );
        config = {
          instanceId: orgao.whatsapp_instance_id,
          token: this.decryptText(orgao.whatsapp_token),
          clientToken,
        };
        this.logger.debug(`enviarSistema: usando credenciais do órgão ${orgao.id} como fallback`);
      }
    }

    if (!config) {
      this.logger.warn('WhatsApp sistema não configurado, mensagem não enviada');
      return false;
    }

    try {
      return await this.zApiProvider.enviar({ to: phone, mensagem, orgaoId: 'sistema', config });
    } catch (error: any) {
      this.logger.error(`Erro ao enviar WhatsApp sistema: ${error.message}`);
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

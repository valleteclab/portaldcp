import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfig } from './entities/system-config.entity';
import { encryptText, decryptTextOrNull } from '../common/crypto.util';

@Injectable()
export class SystemConfigService {
  constructor(
    @InjectRepository(SystemConfig)
    private readonly configRepository: Repository<SystemConfig>,
  ) {
    console.log('[SystemConfigService] Service initialized successfully!');
  }

  // ============ CRIPTOGRAFIA ============
  
  private encryptText(text: string): string {
    return encryptText(text);
  }

  /** Null quando o valor não abre com nenhuma das chaves conhecidas. */
  private decryptText(encryptedText: string): string | null {
    const valor = decryptTextOrNull(encryptedText);
    if (valor === null) {
      console.warn(
        '[SystemConfigService] Valor cifrado ilegível — regrave a credencial pela tela do admin.',
      );
    }
    return valor;
  }

  async getValue(key: string): Promise<string | null> {
    const config = await this.configRepository.findOne({
      where: { key, active: true }
    });
    return config ? config.value : null;
  }

  async setValue(key: string, value: string, description?: string): Promise<SystemConfig> {
    let config = await this.configRepository.findOne({
      where: { key }
    });

    if (config) {
      config.value = value;
      config.description = description || config.description;
      config.active = true;
    } else {
      config = this.configRepository.create({
        key,
        value,
        description,
        active: true
      });
    }

    return await this.configRepository.save(config);
  }

  // ============ CREDENCIAIS PNCP DA PLATAFORMA ============

  async getPncpCredentials(): Promise<{
    apiUrl: string | null;
    login: string | null;
    senha: string | null;
    cnpjOrgao: string | null;
  }> {
    const apiUrl = await this.getValue('PNCP_API_URL');
    const login = await this.getValue('PNCP_LOGIN');
    const senhaEncrypted = await this.getValue('PNCP_SENHA');
    const cnpjOrgao = await this.getValue('PNCP_CNPJ_ORGAO');

    return {
      apiUrl,
      login,
      senha: senhaEncrypted ? this.decryptText(senhaEncrypted) : null,
      cnpjOrgao
    };
  }

  async setPncpCredentials(credentials: {
    apiUrl?: string;
    login?: string;
    senha?: string;
    cnpjOrgao?: string;
  }): Promise<void> {
    if (credentials.apiUrl !== undefined) {
      await this.setValue('PNCP_API_URL', credentials.apiUrl, 'URL da API do PNCP');
    }
    if (credentials.login !== undefined) {
      await this.setValue('PNCP_LOGIN', credentials.login, 'Login da plataforma no PNCP');
    }
    if (credentials.senha !== undefined) {
      const senhaEncrypted = this.encryptText(credentials.senha);
      await this.setValue('PNCP_SENHA', senhaEncrypted, 'Senha da plataforma no PNCP (criptografada)');
    }
    if (credentials.cnpjOrgao !== undefined) {
      await this.setValue('PNCP_CNPJ_ORGAO', credentials.cnpjOrgao, 'CNPJ do órgão principal da plataforma');
    }
  }

  async testPncpConnection(): Promise<{
    sucesso: boolean;
    mensagem: string;
  }> {
    const credentials = await this.getPncpCredentials();
    
    if (!credentials.apiUrl || !credentials.login || !credentials.senha) {
      return {
        sucesso: false,
        mensagem: 'Credenciais PNCP não configuradas para a plataforma'
      };
    }

    try {
      const axios = require('axios');
      const response = await axios.post(
        `${credentials.apiUrl}/usuarios/login`,
        {
          login: credentials.login,
          senha: credentials.senha
        },
        {
          timeout: 30000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.token || response.headers.authorization) {
        return {
          sucesso: true,
          mensagem: 'Conexão com PNCP testada com sucesso!'
        };
      } else {
        return {
          sucesso: false,
          mensagem: 'Resposta inesperada do PNCP'
        };
      }
    } catch (error: any) {
      console.error('Erro ao testar conexão PNCP:', error.response?.data || error.message);
      return {
        sucesso: false,
        mensagem: `Erro na conexão: ${error.response?.data?.message || error.message || 'Erro desconhecido'}`
      };
    }
  }

  async getAllConfigs(): Promise<SystemConfig[]> {
    return await this.configRepository.find({
      where: { active: true },
      order: { key: 'ASC' }
    });
  }

  // ============ CONFIGURAÇÃO DE IA ============

  async getIaConfig(): Promise<{
    modelo: string;
    apiKey: string | null;
    configurado: boolean;
  }> {
    const modelo = await this.getValue('IA_MODELO') || 'anthropic/claude-3.5-sonnet';
    const apiKeyEncrypted = await this.getValue('IA_API_KEY');
    return {
      modelo,
      apiKey: apiKeyEncrypted ? this.decryptText(apiKeyEncrypted) : null,
      configurado: !!apiKeyEncrypted,
    };
  }

  async setIaConfig(config: { modelo?: string; api_key?: string }): Promise<void> {
    if (config.modelo !== undefined) {
      await this.setValue('IA_MODELO', config.modelo, 'Modelo de IA (ex: anthropic/claude-3.5-sonnet, openai/gpt-4o)');
    }
    if (config.api_key !== undefined && config.api_key !== '') {
      const encrypted = this.encryptText(config.api_key);
      await this.setValue('IA_API_KEY', encrypted, 'API Key OpenRouter (criptografada)');
    }
  }

  // ============ WHATSAPP GLOBAL (FALLBACK) ============

  async getWhatsAppGlobalConfig(): Promise<{
    instanceId: string | null;
    configurado: boolean;
  }> {
    const instanceId = await this.getValue('WHATSAPP_ZAPI_INSTANCE_ID');
    const token = await this.getValue('WHATSAPP_ZAPI_TOKEN');
    const clientToken = await this.getValue('WHATSAPP_ZAPI_CLIENT_TOKEN');
    return {
      instanceId: instanceId || null,
      configurado: !!(instanceId && token && clientToken),
    };
  }

  async setWhatsAppGlobalConfig(config: {
    instance_id?: string;
    token?: string;
    client_token?: string;
  }): Promise<void> {
    if (config.instance_id !== undefined) {
      await this.setValue('WHATSAPP_ZAPI_INSTANCE_ID', config.instance_id, 'Z-API Instance ID (fallback global)');
    }
    if (config.token !== undefined && config.token !== '') {
      const encrypted = this.encryptText(config.token);
      await this.setValue('WHATSAPP_ZAPI_TOKEN', encrypted, 'Z-API Token (criptografado)');
    }
    if (config.client_token !== undefined && config.client_token !== '') {
      const encrypted = this.encryptText(config.client_token);
      await this.setValue('WHATSAPP_ZAPI_CLIENT_TOKEN', encrypted, 'Z-API Client Token (criptografado)');
    }
  }

  // ============ AGENTE WHATSAPP ============

  async getWhatsAppAgentConfig(): Promise<{ ativo: boolean }> {
    const valor = await this.getValue('WHATSAPP_AGENT_ATIVO');
    return { ativo: valor === 'true' };
  }

  async setWhatsAppAgentAtivo(ativo: boolean): Promise<void> {
    await this.setValue('WHATSAPP_AGENT_ATIVO', String(ativo), 'Agente de IA WhatsApp ativo');
  }

  /** Telefones (só dígitos) autorizados a enviar comandos de administrador ao agente. */
  async getWhatsAppAgentAdmins(): Promise<string[]> {
    const valor = await this.getValue('WHATSAPP_AGENT_ADMINS');
    return (valor || '')
      .split(',')
      .map((s) => s.replace(/\D/g, ''))
      .filter(Boolean);
  }

  async setWhatsAppAgentAdmins(telefones: string[]): Promise<void> {
    const limpos = (telefones || [])
      .map((s) => String(s).replace(/\D/g, ''))
      .filter(Boolean);
    await this.setValue(
      'WHATSAPP_AGENT_ADMINS',
      limpos.join(','),
      'Telefones admin do agente WhatsApp (comandos)',
    );
  }
}

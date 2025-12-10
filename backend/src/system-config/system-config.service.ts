import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfig } from './entities/system-config.entity';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class SystemConfigService {
  constructor(
    @InjectRepository(SystemConfig)
    private readonly configRepository: Repository<SystemConfig>,
  ) {
    console.log('[SystemConfigService] Service initialized successfully!');
  }

  // ============ CRIPTOGRAFIA ============
  
  private getEncryptionKey(): string {
    return process.env.PNCP_ENCRYPTION_KEY || 'licitafacil-pncp-encryption-key-32';
  }

  private encryptText(text: string): string {
    const key = Buffer.from(this.getEncryptionKey().padEnd(32, '0').substring(0, 32));
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decryptText(encryptedText: string): string {
    const key = Buffer.from(this.getEncryptionKey().padEnd(32, '0').substring(0, 32));
    const textParts = encryptedText.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encrypted = textParts.join(':');
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
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
}

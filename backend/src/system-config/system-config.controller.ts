import { Controller, Get, Put, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { SystemConfigService } from './system-config.service';
import { SystemConfig } from './entities/system-config.entity';

@Controller('system-config')
export class SystemConfigController {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  // ============ CREDENCIAIS PNCP DA PLATAFORMA ============

  @Get('pncp-credentials')
  async getPncpCredentials() {
    try {
      const credentials = await this.systemConfigService.getPncpCredentials();
      return {
        ...credentials,
        senha: undefined, // Não retornar a senha por segurança
        configured: !!(credentials.apiUrl && credentials.login && credentials.senha && credentials.cnpjOrgao)
      };
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put('pncp-credentials')
  async setPncpCredentials(@Body() body: {
    apiUrl?: string;
    login?: string;
    senha?: string;
    cnpjOrgao?: string;
  }) {
    try {
      await this.systemConfigService.setPncpCredentials(body);
      return { success: true, message: 'Credenciais PNCP atualizadas com sucesso!' };
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('test-pncp-connection')
  async testPncpConnection() {
    try {
      return await this.systemConfigService.testPncpConnection();
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ============ CONFIGURAÇÕES GERAIS ============

  @Get()
  async getAllConfigs(): Promise<SystemConfig[]> {
    try {
      return await this.systemConfigService.getAllConfigs();
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':key')
  async getConfig(@Body() body: { key: string }) {
    try {
      const value = await this.systemConfigService.getValue(body.key);
      if (value === null) {
        throw new HttpException('Configuração não encontrada', HttpStatus.NOT_FOUND);
      }
      return { key: body.key, value };
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put(':key')
  async setConfig(@Body() body: { key: string; value: string; description?: string }) {
    try {
      const config = await this.systemConfigService.setValue(body.key, body.value, body.description);
      return { success: true, config };
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}

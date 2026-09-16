import { Controller, Get, Put, Post, Body, Param, Req, ForbiddenException, HttpException, HttpStatus, UseGuards } from '@nestjs/common';
import { SystemConfigService } from './system-config.service';
import { SystemConfig } from './entities/system-config.entity';
import { AdminGuard, PermiteOrgao } from '../auth/admin.guard';
import { JwtPayload, UserType } from '../auth/auth.service';

/**
 * Chaves que um órgão pode ler/gravar pelas rotas genéricas `:key`. Tudo que
 * não estiver aqui é exclusivo do admin — em especial os segredos
 * (PNCP_SENHA, IA_API_KEY, WHATSAPP_ZAPI_*).
 */
const CHAVES_LIBERADAS_ORGAO = ['FATOR_TRANSPARENCIA_ID'];

/** Chaves cujo valor nunca é devolvido pela API, nem para o admin. */
const ehChaveSecreta = (key: string) =>
  /SENHA|PASSWORD|TOKEN|SECRET|_KEY$|API_KEY/i.test(key);

// Guard no controller inteiro: rota nova nasce restrita ao admin. Para abrir
// uma rota ao órgão é preciso marcar @PermiteOrgao() explicitamente.
@Controller('system-config')
@UseGuards(AdminGuard)
export class SystemConfigController {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  // ============ CREDENCIAIS PNCP DA PLATAFORMA ============

  @Get('pncp-credentials')
  async getPncpCredentials() {
    try {
      const credentials = await this.systemConfigService.getPncpCredentials();
      return {
        ...credentials,
        senha: undefined,
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

  // ============ WHATSAPP GLOBAL (FALLBACK) ============

  @Get('whatsapp-global')
  async getWhatsAppGlobalConfig() {
    try {
      return await this.systemConfigService.getWhatsAppGlobalConfig();
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put('whatsapp-global')
  async setWhatsAppGlobalConfig(@Body() body: {
    instance_id?: string;
    token?: string;
    client_token?: string;
  }) {
    try {
      await this.systemConfigService.setWhatsAppGlobalConfig(body);
      return { success: true, message: 'Config WhatsApp global atualizada com sucesso!' };
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ============ CONFIGURAÇÃO DE IA ============

  @Get('ia')
  async getIaConfig() {
    try {
      const config = await this.systemConfigService.getIaConfig();
      return { modelo: config.modelo, configurado: config.configurado };
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put('ia')
  async setIaConfig(@Body() body: { modelo?: string; api_key?: string }) {
    try {
      await this.systemConfigService.setIaConfig(body);
      return { success: true, message: 'Configuração de IA atualizada com sucesso!' };
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ============ AGENTE WHATSAPP ============

  @Get('whatsapp-agent')
  async getWhatsAppAgentConfig() {
    try {
      return await this.systemConfigService.getWhatsAppAgentConfig();
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put('whatsapp-agent')
  async setWhatsAppAgentAtivo(@Body() body: { ativo: boolean }) {
    try {
      await this.systemConfigService.setWhatsAppAgentAtivo(body.ativo);
      return { success: true, message: `Agente WhatsApp ${body.ativo ? 'ativado' : 'desativado'} com sucesso!` };
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ============ CONFIGURAÇÕES GERAIS ============

  @Get()
  async getAllConfigs(): Promise<SystemConfig[]> {
    try {
      const configs = await this.systemConfigService.getAllConfigs();
      // Esta rota devolvia a tabela inteira, com a senha do PNCP, a API key da
      // IA e os tokens do WhatsApp em texto (cifrado, mas devolvido). Nenhuma
      // tela precisa do valor de um segredo — só de saber que está preenchido.
      return configs.map((config) =>
        ehChaveSecreta(config.key)
          ? ({ ...config, value: config.value ? '••••••••' : '' } as SystemConfig)
          : config,
      );
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':key')
  @PermiteOrgao()
  async getConfig(
    @Param('key') key: string,
    @Req() request: any,
    @Body() body?: { key?: string },
  ) {
    // O `key` vinha do body num GET (sempre vazio), então esta rota nunca
    // devolvia nada. Passa a ler o parâmetro de rota, que é o que o frontend manda.
    const chave = this.validarChaveGenerica(key || body?.key, request?.user);
    try {
      const value = await this.systemConfigService.getValue(chave);
      if (value === null) {
        throw new HttpException('Configuração não encontrada', HttpStatus.NOT_FOUND);
      }
      return { key: chave, value };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put(':key')
  @PermiteOrgao()
  async setConfig(
    @Param('key') key: string,
    @Req() request: any,
    @Body() body: { key?: string; value: string; description?: string },
  ) {
    const chave = this.validarChaveGenerica(key || body.key, request?.user);
    try {
      const config = await this.systemConfigService.setValue(chave, body.value, body.description);
      return { success: true, config };
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * As rotas `:key` são as únicas abertas ao órgão (@PermiteOrgao), então elas
   * mesmas precisam limitar QUAL chave ele alcança — senão a liberação valeria
   * para os segredos também. Segredo não passa nem para o admin: cada um tem
   * sua rota própria, que cifra o valor antes de gravar.
   */
  private validarChaveGenerica(chave: string | undefined, user?: JwtPayload): string {
    if (!chave) {
      throw new HttpException('Chave não informada', HttpStatus.BAD_REQUEST);
    }
    if (ehChaveSecreta(chave)) {
      throw new ForbiddenException(
        'Use a rota específica desta credencial para lê-la ou gravá-la',
      );
    }
    if (user?.type !== UserType.ADMIN && !CHAVES_LIBERADAS_ORGAO.includes(chave)) {
      throw new ForbiddenException(
        'Configuração restrita ao administrador da plataforma',
      );
    }
    return chave;
  }
}

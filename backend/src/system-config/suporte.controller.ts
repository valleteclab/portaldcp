import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { SystemConfigService } from './system-config.service';

/** Número do WhatsApp do suporte usado quando a configuração não existe. */
export const SUPORTE_WHATSAPP_PADRAO = '5577981251987';
/** Chave em system_config. Valor vazio desliga o botão de suporte. */
export const CHAVE_SUPORTE_WHATSAPP = 'SUPORTE_WHATSAPP';

/**
 * Contato do suporte da plataforma para o botão do portal do fornecedor.
 * Público: o botão aparece também para quem ainda não conseguiu entrar.
 * O admin troca o número em system-config/SUPORTE_WHATSAPP, sem deploy.
 */
@Controller('suporte')
export class SuporteController {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  @Public()
  @Get('contato')
  async contato(): Promise<{ whatsapp: string | null }> {
    const valor = await this.systemConfigService.getValue(CHAVE_SUPORTE_WHATSAPP);
    if (valor === null) return { whatsapp: SUPORTE_WHATSAPP_PADRAO };
    const digitos = valor.replace(/\D/g, '');
    if (!digitos) return { whatsapp: null };
    // Sem DDI, assume Brasil (77981251987 → 5577981251987)
    return { whatsapp: digitos.length <= 11 ? `55${digitos}` : digitos };
  }
}

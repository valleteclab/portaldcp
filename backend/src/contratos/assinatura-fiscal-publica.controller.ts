import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { MedicaoService } from './medicao.service';

@Controller('assinar')
export class AssinaturaFiscalPublicaController {
  constructor(private readonly medicaoService: MedicaoService) {}

  /** Dados da medição para a página pública de assinatura */
  @Public()
  @Get(':token')
  async obterDados(@Param('token') token: string) {
    return this.medicaoService.obterDadosLinkPublico(token);
  }

  /** Envia OTP via WhatsApp para o fiscal */
  @Public()
  @Post(':token/solicitar-otp')
  async solicitarOtp(@Param('token') token: string) {
    return this.medicaoService.solicitarOtpLinkPublico(token);
  }

  /** Valida OTP, registra assinatura e retorna dados_pdf para regeneração */
  @Public()
  @Post(':token/assinar')
  async assinar(
    @Param('token') token: string,
    @Body() body: { codigo: string },
  ) {
    return this.medicaoService.assinarViaLinkPublico(token, body.codigo);
  }

  /** Recusa a assinatura com motivo opcional */
  @Public()
  @Post(':token/recusar')
  async recusar(
    @Param('token') token: string,
    @Body() body: { motivo?: string },
  ) {
    return this.medicaoService.recusarViaLinkPublico(token, body.motivo);
  }
}

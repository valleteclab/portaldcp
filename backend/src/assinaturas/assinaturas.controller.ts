import { Controller, Post, Body, Get, Param, UseGuards } from '@nestjs/common';
import { AssinaturasService } from './assinaturas.service';
import { SolicitarOtpDto, ValidarOtpDto } from './dto/assinatura.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { Public } from '../auth/public.decorator';

@Controller('assinaturas')
export class AssinaturasController {
  constructor(private readonly assinaturasService: AssinaturasService) {}

  @UseGuards(JwtAuthGuard)
  @Post('otp/solicitar')
  async solicitarOtp(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SolicitarOtpDto,
  ) {
    const orgaoId = user.orgaoId || user.sub; // Fornecedor usa seu próprio ID como particionador do cache de OTP neste contexto ou do orgão
    await this.assinaturasService.solicitarOtp(orgaoId, dto.telefone, dto.usuario_nome);
    return { mensagem: 'Código enviado com sucesso via WhatsApp' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('otp/validar')
  async validarOtp(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ValidarOtpDto,
  ) {
    const orgaoId = user.orgaoId || user.sub;
    await this.assinaturasService.validarOtp(orgaoId, dto.telefone, dto.codigo);
    return { mensagem: 'Código validado com sucesso' };
  }

  @Public()
  @Get('publica/validar/:codigo')
  async validarDocumentoPublico(@Param('codigo') codigo: string) {
    return await this.assinaturasService.validarDocumentoPublico(codigo);
  }
}

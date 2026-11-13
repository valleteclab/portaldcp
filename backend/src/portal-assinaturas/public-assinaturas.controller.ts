import { Controller, Get, Post, Body, Param, Request } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { PortalAssinaturasService } from './portal-assinaturas.service';
import { SolicitarCodigoAssinaturaDto, ValidarAssinaturaDto } from './dto/assinar-documento.dto';
import { Public } from '../auth/public.decorator';
import { Throttle } from '@nestjs/throttler';

@Controller('public/assinaturas')
@Public()
export class PublicAssinaturasController {
  constructor(private readonly assinaturasService: PortalAssinaturasService) {}

  @Get('documento/:token')
  async obterDocumentoPorToken(@Param('token') token: string) {
    return this.assinaturasService.obterDocumentoPorToken(token);
  }

  // Rotas públicas de código: limite próprio por IP, bem abaixo do global
  @Throttle({ default: { limit: 6, ttl: 60000 } })
  @Post('solicitar-codigo')
  async solicitarCodigo(@Body() dto: SolicitarCodigoAssinaturaDto) {
    return this.assinaturasService.solicitarCodigoAssinatura(dto.token_acesso, dto.cpf_cnpj);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('assinar')
  async assinarDocumento(@Body() dto: ValidarAssinaturaDto, @Request() req: ExpressRequest) {
    const ip = req.ip || req.socket?.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    return this.assinaturasService.assinarDocumento(
      dto.token_acesso,
      dto.cpf_cnpj,
      dto.codigo_otp,
      ip,
      userAgent,
    );
  }
}
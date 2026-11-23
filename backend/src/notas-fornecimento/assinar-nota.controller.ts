/**
 * Assinatura do termo de atesto da nota de fornecimento por LINK PESSOAL — a
 * mesma experiência da assinatura do boletim de medição: a pessoa recebe o
 * link no WhatsApp, confere os documentos, pede o código e assina (ou recusa).
 * Rotas públicas: a credencial é o token do link (64 caracteres aleatórios).
 */
import { Body, Controller, Get, Param, Post, Request, Res } from '@nestjs/common';
import type { Request as ExpressRequest, Response } from 'express';
import { createReadStream } from 'fs';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { NotasFornecimentoService } from './notas-fornecimento.service';

@Controller('assinar-nota')
@Public()
export class AssinarNotaController {
  constructor(private readonly service: NotasFornecimentoService) {}

  @Get(':token')
  dados(@Param('token') token: string) {
    return this.service.publicoDados(token);
  }

  /** tipo: termo | nota */
  @Get(':token/arquivo/:tipo')
  async arquivo(@Param('token') token: string, @Param('tipo') tipo: string, @Res() res: Response) {
    const a = await this.service.publicoArquivo(token, tipo);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${a.nome}"`, 'Cache-Control': 'private, no-store' });
    createReadStream(a.caminho).pipe(res);
  }

  // Código: limite próprio por IP, bem abaixo do global (igual ao das demais assinaturas públicas)
  @Throttle({ default: { limit: 6, ttl: 60000 } })
  @Post(':token/solicitar-codigo')
  solicitarCodigo(@Param('token') token: string) {
    return this.service.publicoSolicitarCodigo(token);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post(':token/assinar')
  assinar(@Param('token') token: string, @Body() body: { codigo: string }, @Request() req: ExpressRequest) {
    return this.service.publicoAssinar(token, body?.codigo, req.ip || req.socket?.remoteAddress || '', String(req.headers['user-agent'] || ''));
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post(':token/recusar')
  recusar(@Param('token') token: string, @Body() body: { motivo: string }) {
    return this.service.publicoRecusar(token, body?.motivo);
  }
}

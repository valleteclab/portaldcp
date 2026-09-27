import { Controller, Get, Headers, Ip, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import { AtorAtual } from '../auth/acesso/acesso.decorators';
import type { Ator } from '../auth/acesso/ator';
import { AssinaturasInternasService } from './assinaturas-internas.service';
import { DonoFaseInternaGuard } from './dono-fase-interna.guard';

/**
 * CENTRAL DE APROVAÇÕES › ASSINATURAS (homologação multiusuário, E1).
 * DonoFaseInternaGuard: anônimo 401, fornecedor 403; o órgão e o usuário vêm
 * SEMPRE do JWT (sem parâmetro de órgão). Documento de outro órgão → 404;
 * quem não é signatário → 403.
 */
@Controller('assinaturas-internas')
@UseGuards(DonoFaseInternaGuard)
export class AssinaturasInternasController {
  constructor(private readonly assinaturas: AssinaturasInternasService) {}

  /** O que o usuário logado precisa assinar: `{ itens: [...], aviso }`. */
  @Get('pendentes')
  pendentes(@AtorAtual() ator: Ator) {
    return this.assinaturas.pendentes(ator);
  }

  /** PDF do documento a assinar (documento do órgão do usuário). */
  @Get(':documentoAssinaturaId/arquivo')
  async arquivo(@Param('documentoAssinaturaId') id: string, @AtorAtual() ator: Ator, @Res() res: Response) {
    const arq = await this.assinaturas.arquivo(id, ator);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${arq.nome}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(fs.readFileSync(arq.caminho));
  }

  /** Assinar com o próprio login (sem código: o signatário é o usuário logado). */
  @Post(':documentoAssinaturaId/assinar')
  assinar(@Param('documentoAssinaturaId') id: string, @AtorAtual() ator: Ator, @Ip() ip: string, @Headers('user-agent') userAgent: string) {
    return this.assinaturas.assinar(id, ator, { ip, userAgent });
  }
}

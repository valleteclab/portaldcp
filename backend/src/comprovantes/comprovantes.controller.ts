import { Controller, Get, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AcessoLicitacaoService } from '../auth/acesso/acesso-licitacao.service';
import { AtorAtual, SomenteFornecedor } from '../auth/acesso/acesso.decorators';
import type { Ator } from '../auth/acesso/ator';
import { ComprovantesService } from './comprovantes.service';

/** Comprovantes do próprio fornecedor (ver comprovantes.regras.ts). */
@Controller('comprovantes')
export class ComprovantesController {
  constructor(
    private readonly comprovantes: ComprovantesService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  @SomenteFornecedor()
  @Get('licitacao/:licitacaoId')
  listar(@Param('licitacaoId', ParseUUIDPipe) licitacaoId: string, @AtorAtual() ator: Ator) {
    return this.comprovantes.listar(licitacaoId, this.acesso.fornecedorDoToken(ator));
  }

  @SomenteFornecedor()
  @Get(':id/pdf')
  async pdf(@Param('id', ParseUUIDPipe) id: string, @AtorAtual() ator: Ator, @Res() res: Response) {
    const { nome, conteudo } = await this.comprovantes.pdf(id, this.acesso.fornecedorDoToken(ator));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.send(conteudo);
  }
}

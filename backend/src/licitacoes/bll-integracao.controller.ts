import { Controller, Get, Post, Body, Param, Query, Res, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { BllIntegracaoService } from './bll-integracao.service';
import type { ExportarBllDto } from './bll-integracao.service';
import { AcessoLicitacaoService } from '../auth/acesso/acesso-licitacao.service';
import { AtorAtual, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import type { Ator } from '../auth/acesso/ator';

/**
 * Troca de arquivos com a BLL Compras (e portais com o mesmo leiaute).
 * Só o órgão dono da licitação (leitura de outro órgão → 404; ato → 403).
 */
@Controller('licitacoes/:id/bll')
@SomenteOrgao()
export class BllIntegracaoController {
  constructor(
    private readonly service: BllIntegracaoService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  @Get('previa-exportacao')
  async previa(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id, 'leitura');
    return this.service.previaExportacao(id);
  }

  /** Gera e baixa o .IMP; grava os campos de entrega/garantia informados. */
  @Post('exportar')
  async exportar(@Param('id') id: string, @Body() dto: ExportarBllDto, @CurrentUser() user: any, @AtorAtual() ator: Ator, @Res() res: Response) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id, 'escrita');
    const { buffer, nome, avisos } = await this.service.exportar(id, dto || {}, user?.nome || 'Sistema');
    res.set({
      'Content-Type': 'text/plain; charset=iso-8859-1',
      'Content-Disposition': `attachment; filename=${nome}`,
      'X-Avisos': encodeURIComponent(JSON.stringify(avisos)),
      'Access-Control-Expose-Headers': 'Content-Disposition, X-Avisos',
    });
    res.send(buffer);
  }

  /** Prévia (padrão) ou aplicação (?aplicar=true) do resultado exportado da BLL. */
  @Post('importar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = /\.(exp|txt)$/i.test(file.originalname || '');
        cb(ok ? null : new BadRequestException('Envie o arquivo .EXP (ou .TXT) exportado do portal'), ok);
      },
    }),
  )
  async importar(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('aplicar') aplicar: string,
    @Query('forcar') forcar: string,
    @CurrentUser() user: any,
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id, 'escrita');
    return this.service.importar(id, file, aplicar === 'true' || aplicar === '1', user?.nome || 'Sistema', forcar === 'true' || forcar === '1');
  }

  @Get('historico')
  async historico(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id, 'leitura');
    return this.service.historico(id);
  }

  @Get('historico/:integracaoId/arquivo')
  async arquivo(@Param('id') id: string, @Param('integracaoId') integracaoId: string, @AtorAtual() ator: Ator, @Res() res: Response) {
    await this.acesso.assertOrgaoDaLicitacao(ator, id, 'leitura');
    const { nome, buffer } = await this.service.arquivo(id, integracaoId);
    res.set({ 'Content-Type': 'text/plain; charset=iso-8859-1', 'Content-Disposition': `attachment; filename=${nome}` });
    res.send(buffer);
  }
}

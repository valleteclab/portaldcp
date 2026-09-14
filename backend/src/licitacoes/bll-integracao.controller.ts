import { Controller, Get, Post, Body, Param, Query, Res, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { BllIntegracaoService } from './bll-integracao.service';
import type { ExportarBllDto } from './bll-integracao.service';

/** Troca de arquivos com a BLL Compras (e portais com o mesmo leiaute). */
@Controller('licitacoes/:id/bll')
export class BllIntegracaoController {
  constructor(private readonly service: BllIntegracaoService) {}

  @Get('previa-exportacao')
  previa(@Param('id') id: string) {
    return this.service.previaExportacao(id);
  }

  /** Gera e baixa o .IMP; grava os campos de entrega/garantia informados. */
  @Post('exportar')
  async exportar(@Param('id') id: string, @Body() dto: ExportarBllDto, @CurrentUser() user: any, @Res() res: Response) {
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
  importar(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('aplicar') aplicar: string,
    @Query('forcar') forcar: string,
    @CurrentUser() user: any,
  ) {
    return this.service.importar(id, file, aplicar === 'true' || aplicar === '1', user?.nome || 'Sistema', forcar === 'true' || forcar === '1');
  }

  @Get('historico')
  historico(@Param('id') id: string) {
    return this.service.historico(id);
  }

  @Get('historico/:integracaoId/arquivo')
  async arquivo(@Param('id') id: string, @Param('integracaoId') integracaoId: string, @Res() res: Response) {
    const { nome, buffer } = await this.service.arquivo(id, integracaoId);
    res.set({ 'Content-Type': 'text/plain; charset=iso-8859-1', 'Content-Disposition': `attachment; filename=${nome}` });
    res.send(buffer);
  }
}

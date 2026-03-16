import { Controller, Get, Post, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { AnpService, PrecosBarreirasMultiploResponse } from './anp.service';

@ApiTags('ANP - Preços de Combustíveis')
@Controller('anp')
export class AnpController {
  constructor(private readonly anpService: AnpService) {}

  @Public()
  @Get('precos/barreiras-ba')
  @ApiOperation({
    summary: 'Preços ANP - Barreiras-BA',
    description:
      'Retorna os preços médios de combustíveis das últimas 2 semanas publicadas pela ANP para Barreiras-BA. Faz download automático do site da ANP.',
  })
  async getPrecosBarreirasBa(): Promise<PrecosBarreirasMultiploResponse> {
    return this.anpService.getPrecosBarreirasBa();
  }

  @Public()
  @Post('precos/barreiras-ba/upload')
  @UseInterceptors(
    FileInterceptor('arquivo', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        arquivo: { type: 'string', format: 'binary', description: 'Planilha Excel (.xlsx) da ANP' },
      },
    },
  })
  @ApiOperation({
    summary: 'Upload manual - Preços Barreiras-BA',
    description:
      'Envia a planilha Excel baixada do site da ANP. Use quando o download automático falhar (ex: 403).',
  })
  async uploadPrecosBarreirasBa(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<PrecosBarreirasResponse> {
    if (!file?.buffer) {
      throw new BadRequestException('Envie o arquivo Excel no campo "arquivo".');
    }
    return this.anpService.processarArquivoExcel(file.buffer);
  }
}

import { Controller, Get, Post, Body, Param, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { PatrimonioInventarioService } from './patrimonio-inventario.service';
import { PatrimonioMovimentacaoService } from './patrimonio-movimentacao.service';

/**
 * Rotas públicas do patrimônio (sem JWT):
 * - /p/<id> do QR da plaqueta → dados básicos do bem;
 * - conferência do inventário pelo link com token do setor (app no celular);
 * - aceite de transferência pelo link com token do lote.
 * O token de 64 hex é a credencial; as rotas têm limite por IP.
 */
@Controller('patrimonio-pub')
@Public()
export class PatrimonioPublicController {
  constructor(
    private readonly inventario: PatrimonioInventarioService,
    private readonly movimentacao: PatrimonioMovimentacaoService,
  ) {}

  @Get('movimentacao/:token')
  lote(@Param('token') token: string) {
    return this.movimentacao.obterLotePorToken(token);
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('movimentacao/:token/responder')
  responder(@Param('token') token: string, @Body() body: any) {
    return this.movimentacao.responderLote(token, { nome: body?.nome, aceitar: !!body?.aceitar, motivo: body?.motivo });
  }

  @Get('bem/:id')
  bem(@Param('id') id: string) {
    return this.inventario.bemPublico(id);
  }

  @Get('inventario/:token')
  setor(@Param('token') token: string) {
    return this.inventario.obterPorToken(token);
  }

  @Throttle({ default: { limit: 240, ttl: 60000 } })
  @Post('inventario/:token/leitura')
  leitura(@Param('token') token: string, @Body() body: any) {
    return this.inventario.registrarLeitura(token, {
      codigo: body?.codigo,
      origem: body?.origem,
      estado_conservacao: body?.estado_conservacao,
      observacao: body?.observacao,
      lido_por: body?.lido_por,
    });
  }

  /** Varredura de sala: até 500 códigos por chamada (leitor RFID). */
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('inventario/:token/leituras-lote')
  leiturasLote(@Param('token') token: string, @Body() body: any) {
    return this.inventario.registrarLeiturasLote(token, {
      codigos: Array.isArray(body?.codigos) ? body.codigos : [],
      origem: body?.origem,
      lido_por: body?.lido_por,
    });
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('inventario/:token/sem-plaqueta')
  semPlaqueta(@Param('token') token: string, @Body() body: any) {
    return this.inventario.cadastrarSemPlaqueta(token, {
      descricao: body?.descricao,
      categoria_id: body?.categoria_id,
      estado_conservacao: body?.estado_conservacao,
      observacao: body?.observacao,
      lido_por: body?.lido_por,
      marca: body?.marca,
      modelo: body?.modelo,
      numero_serie: body?.numero_serie,
    });
  }

  /**
   * Foto de uma leitura da conferência (multipart `file`, jpg/png/webp até 10 MB).
   * Fica em memória e o service grava na pasta do órgão do token.
   */
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('inventario/:token/leituras/:leituraId/foto')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'].includes(file.mimetype);
        cb(ok ? null : new BadRequestException('Envie uma imagem JPG, PNG ou WEBP'), ok);
      },
    }),
  )
  fotoLeitura(
    @Param('token') token: string,
    @Param('leituraId') leituraId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
  ) {
    return this.inventario.salvarFotoLeitura(token, leituraId, file, { lido_por: body?.lido_por, legenda: body?.legenda });
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('inventario/:token/fechar')
  fechar(@Param('token') token: string, @Body() body: any) {
    return this.inventario.fecharSetor(token, { nome: body?.nome, observacoes: body?.observacoes });
  }
}

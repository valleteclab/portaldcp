import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseInterceptors,
  UploadedFile,
  Res,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { mkdirSync, renameSync, copyFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { UploadService } from './upload.service';
import { AcessoArquivosService } from './acesso-arquivos.service';
import { enviarArquivo } from './servir-arquivo';
import { AtorAtual, AutenticacaoOpcional } from '../auth/acesso/acesso.decorators';
import { ehOrgao } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';
import { caminhoLogico, diretorioDeGravacao, sanitizarTipo, tipoPublico } from '../common/arquivos/arquivos';

/**
 * UPLOAD GENÉRICO e download por caminho lógico.
 *
 *  - POST /api/uploads (login): grava o arquivo. Tipo SENSÍVEL (qualquer um
 *    fora de TIPOS_PUBLICOS — ex.: `documentos`, `fiscal-estadual` do registro
 *    cadastral) vai para o diretório PRIVADO; tipo público só pelo órgão. O
 *    dono (quem enviou) fica em `arquivos_upload`.
 *  - GET /api/uploads/<tipo>/[sub/]<arquivo>: pasta pública sem login; sensível
 *    exige URL assinada (entregue pela API a quem pôde ver o registro) ou
 *    Bearer com checagem de dono (AcessoArquivosService). Sem permissão → 404.
 *  - DELETE removido: não tinha uso no frontend e permitia a qualquer conta
 *    apagar qualquer arquivo. Exclusões acontecem pelos módulos donos do
 *    registro (anexo de medição, documento de contrato...).
 */
@Controller('uploads')
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly acessoArquivos: AcessoArquivosService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('tipo') tipoInformado: string,
    @AtorAtual() ator: Ator,
  ) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }
    const tipo = sanitizarTipo(tipoInformado);
    const publico = tipoPublico(tipo);
    if (publico && !(ator?.admin || ehOrgao(ator))) {
      apagarSilencioso(file.path);
      throw new ForbiddenException('Envio para esta pasta é exclusivo do órgão');
    }

    // O Multer grava numa pasta de recepção (o `tipo` do corpo pode chegar
    // DEPOIS do arquivo no multipart); aqui, com o corpo completo, o arquivo
    // vai para a pasta certa (privada se sensível).
    const destinoDir = diretorioDeGravacao(tipo);
    mkdirSync(destinoDir, { recursive: true });
    const destino = join(destinoDir, file.filename);
    moverArquivo(file.path, destino);

    await this.acessoArquivos.registrarUpload({
      caminho: `${tipo}/${file.filename}`,
      tipo,
      privado: !publico,
      nomeOriginal: file.originalname,
      ator,
    });

    return {
      success: true,
      filename: file.filename,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      tipo,
      url: this.uploadService.getFileUrl(tipo, file.filename),
    };
  }

  /** /api/uploads/:tipo/:a/:b/:filename (profundidade máxima) */
  @AutenticacaoOpcional()
  @Get(':tipo/:a/:b/:filename')
  async getArquivo4(
    @Param('tipo') tipo: string,
    @Param('a') a: string,
    @Param('b') b: string,
    @Param('filename') filename: string,
    @Query('expira') expira: string,
    @Query('assinatura') assinatura: string,
    @AtorAtual() ator: Ator | null,
    @Res() res: Response,
  ) {
    return this.servir([tipo, a, b, filename], { ator, expira, assinatura }, res);
  }

  /** /api/uploads/medicoes/:medicaoId/:filename e similares */
  @AutenticacaoOpcional()
  @Get(':tipo/:subdir/:filename')
  async getNestedFile(
    @Param('tipo') tipo: string,
    @Param('subdir') subdir: string,
    @Param('filename') filename: string,
    @Query('expira') expira: string,
    @Query('assinatura') assinatura: string,
    @AtorAtual() ator: Ator | null,
    @Res() res: Response,
  ) {
    return this.servir([tipo, subdir, filename], { ator, expira, assinatura }, res);
  }

  @AutenticacaoOpcional()
  @Get(':tipo/:filename')
  async getFile(
    @Param('tipo') tipo: string,
    @Param('filename') filename: string,
    @Query('expira') expira: string,
    @Query('assinatura') assinatura: string,
    @AtorAtual() ator: Ator | null,
    @Res() res: Response,
  ) {
    return this.servir([tipo, filename], { ator, expira, assinatura }, res);
  }

  private async servir(
    segmentos: string[],
    pedido: { ator: Ator | null; expira?: string; assinatura?: string },
    res: Response,
  ) {
    const c = caminhoLogico(segmentos);
    const fisico = await this.acessoArquivos.autorizarLeitura(c, {
      ator: pedido.ator,
      expira: pedido.expira ?? null,
      assinatura: pedido.assinatura ?? null,
    });
    await enviarArquivo(res, fisico, !!c && tipoPublico(c.tipo));
  }
}

function moverArquivo(origem: string, destino: string): void {
  if (origem === destino) return;
  try {
    renameSync(origem, destino);
  } catch (e: any) {
    if (e?.code !== 'EXDEV') throw e;
    copyFileSync(origem, destino);
    unlinkSync(origem);
  }
}

function apagarSilencioso(caminho?: string): void {
  try {
    if (caminho && existsSync(caminho)) unlinkSync(caminho);
  } catch {
    /* ignora */
  }
}

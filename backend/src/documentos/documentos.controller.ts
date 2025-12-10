import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseInterceptors,
  UploadedFile,
  Res,
  HttpStatus
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { DocumentosService } from './documentos.service';
import { TipoDocumentoLicitacao } from './entities/documento-licitacao.entity';

@Controller('documentos')
export class DocumentosController {
  constructor(private readonly documentosService: DocumentosService) {}

  // Upload de documento
  @Post('licitacao/:licitacaoId')
  @UseInterceptors(FileInterceptor('arquivo'))
  async upload(
    @Param('licitacaoId') licitacaoId: string,
    @UploadedFile() arquivo: Express.Multer.File,
    @Body() body: {
      tipo: TipoDocumentoLicitacao;
      titulo: string;
      descricao?: string;
      numero_documento?: string;
      data_documento?: string;
      publico?: string;
    }
  ) {
    return this.documentosService.upload(licitacaoId, body.tipo, arquivo, {
      titulo: body.titulo,
      descricao: body.descricao,
      numero_documento: body.numero_documento,
      data_documento: body.data_documento ? new Date(body.data_documento) : undefined,
      publico: body.publico === 'true'
    });
  }

  // Listar documentos de uma licitação
  @Get('licitacao/:licitacaoId')
  async findByLicitacao(
    @Param('licitacaoId') licitacaoId: string,
    @Query('publicos') apenasPublicos?: string
  ) {
    return this.documentosService.findByLicitacao(
      licitacaoId,
      apenasPublicos === 'true'
    );
  }

  // Listar documentos por tipo
  @Get('licitacao/:licitacaoId/tipo/:tipo')
  async findByTipo(
    @Param('licitacaoId') licitacaoId: string,
    @Param('tipo') tipo: TipoDocumentoLicitacao
  ) {
    return this.documentosService.findByTipo(licitacaoId, tipo);
  }

  // Buscar documento específico
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.documentosService.findOne(id);
  }

  // Download do arquivo
  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const { buffer, documento } = await this.documentosService.getArquivo(id);

    res.set({
      'Content-Type': documento.mime_type,
      'Content-Disposition': `attachment; filename="${documento.nome_original}"`,
      'Content-Length': buffer.length
    });

    res.status(HttpStatus.OK).send(buffer);
  }

  // Visualizar arquivo (inline)
  @Get(':id/visualizar')
  async visualizar(@Param('id') id: string, @Res() res: Response) {
    const { buffer, documento } = await this.documentosService.getArquivo(id);

    res.set({
      'Content-Type': documento.mime_type,
      'Content-Disposition': `inline; filename="${documento.nome_original}"`,
      'Content-Length': buffer.length
    });

    res.status(HttpStatus.OK).send(buffer);
  }

  // Vincular documento já existente (arquivo já foi enviado via /uploads)
  @Post('licitacao/:licitacaoId/vincular')
  async vincular(
    @Param('licitacaoId') licitacaoId: string,
    @Body() body: {
      tipo: TipoDocumentoLicitacao;
      titulo: string;
      nome_original: string;
      caminho: string;
      descricao?: string;
      publico?: boolean;
    }
  ) {
    return this.documentosService.vincularDocumentoExistente(licitacaoId, {
      tipo: body.tipo,
      titulo: body.titulo,
      nome_original: body.nome_original,
      caminho: body.caminho,
      descricao: body.descricao,
      publico: body.publico ?? true
    });
  }

  // Publicar documento
  @Put(':id/publicar')
  async publicar(@Param('id') id: string) {
    return this.documentosService.publicar(id);
  }

  // Excluir documento
  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.documentosService.delete(id);
    return { message: 'Documento excluído com sucesso' };
  }

  // Estatísticas de documentos
  @Get('licitacao/:licitacaoId/estatisticas')
  async estatisticas(@Param('licitacaoId') licitacaoId: string) {
    return this.documentosService.contarPorTipo(licitacaoId);
  }

  // ============ ENDPOINTS PÚBLICOS ============

  // Listar documentos públicos (para portal)
  @Get('publicos/lista')
  async listarPublicos(
    @Query('licitacaoId') licitacaoId?: string,
    @Query('tipo') tipo?: TipoDocumentoLicitacao,
    @Query('orgaoId') orgaoId?: string
  ) {
    return this.documentosService.findPublicos({ licitacaoId, tipo, orgaoId });
  }

  // Download público (verifica se documento é público)
  @Get('publicos/:id/download')
  async downloadPublico(@Param('id') id: string, @Res() res: Response) {
    const documento = await this.documentosService.findOne(id);
    
    if (!documento.publico) {
      res.status(HttpStatus.FORBIDDEN).json({ message: 'Documento não é público' });
      return;
    }

    const { buffer } = await this.documentosService.getArquivo(id);

    res.set({
      'Content-Type': documento.mime_type,
      'Content-Disposition': `attachment; filename="${documento.nome_original}"`,
      'Content-Length': buffer.length
    });

    res.status(HttpStatus.OK).send(buffer);
  }
}

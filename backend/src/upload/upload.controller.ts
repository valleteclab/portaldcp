import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseInterceptors,
  UploadedFile,
  Res,
  NotFoundException,
  BadRequestException,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream, existsSync } from 'fs';
import { UploadService } from './upload.service';
import { Public } from '../auth/public.decorator';

@Controller('uploads')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('tipo') tipo: string,
    @Body('fornecedor_id') fornecedorId: string,
  ) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    return {
      success: true,
      filename: file.filename,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      tipo: tipo || 'geral',
      url: this.uploadService.getFileUrl(tipo || 'geral', file.filename),
    };
  }

  /**
   * Serve arquivos com path de 3 segmentos: /uploads/medicoes/:subdir/:filename
   * Usado para anexos de medição organizados por medicaoId.
   */
  @Public()
  @Get(':tipo/:subdir/:filename')
  async getNestedFile(
    @Param('tipo') tipo: string,
    @Param('subdir') subdir: string,
    @Param('filename') filename: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    // Sanitizar parâmetros (evitar path traversal)
    const safeTipo = tipo.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeSubdir = subdir.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

    const filePath = this.uploadService.getFilePath(`${safeTipo}/${safeSubdir}`, safeFilename);

    if (!existsSync(filePath)) {
      throw new NotFoundException('Arquivo não encontrado');
    }

    const file = createReadStream(filePath);
    this.setContentType(res, safeFilename);
    return new StreamableFile(file);
  }

  @Public()
  @Get(':tipo/:filename')
  async getFile(
    @Param('tipo') tipo: string,
    @Param('filename') filename: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const filePath = this.uploadService.getFilePath(tipo, filename);
    
    if (!existsSync(filePath)) {
      throw new NotFoundException('Arquivo não encontrado');
    }

    const file = createReadStream(filePath);
    this.setContentType(res, filename);
    return new StreamableFile(file);
  }

  /** Helper para definir Content-Type baseado na extensão */
  private setContentType(res: Response, filename: string) {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') {
      res.set({ 'Content-Type': 'application/pdf' });
    } else if (['jpg', 'jpeg'].includes(ext || '')) {
      res.set({ 'Content-Type': 'image/jpeg' });
    } else if (ext === 'png') {
      res.set({ 'Content-Type': 'image/png' });
    } else if (ext === 'xml') {
      res.set({ 'Content-Type': 'application/xml' });
    }
  }

  @Delete(':tipo/:filename')
  async deleteFile(
    @Param('tipo') tipo: string,
    @Param('filename') filename: string,
  ) {
    const deleted = this.uploadService.deleteFile(tipo, filename);
    
    if (!deleted) {
      throw new NotFoundException('Arquivo não encontrado');
    }

    return { success: true, message: 'Arquivo excluído com sucesso' };
  }
}

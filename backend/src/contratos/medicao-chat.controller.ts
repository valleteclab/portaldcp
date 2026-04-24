import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MedicaoChatService } from './medicao-chat.service';

@Controller('fornecedor/contratos')
export class MedicaoChatController {
  constructor(private readonly medicaoChatService: MedicaoChatService) {}

  @Post(':contratoId/medicao-chat/sessoes')
  async iniciarSessao(
    @Param('contratoId') contratoId: string,
    @Body() body: { fornecedor_id: string; medicao_id?: string },
  ) {
    if (!body.fornecedor_id) {
      throw new BadRequestException('fornecedor_id é obrigatório');
    }
    return this.medicaoChatService.iniciarOuRetomarSessao(
      contratoId,
      body.fornecedor_id,
      body.medicao_id,
    );
  }

  @Get('medicao-chat/sessoes/:sessionId')
  async obterSessao(
    @Param('sessionId') sessionId: string,
    @Query('fornecedorId') fornecedorId: string,
  ) {
    if (!fornecedorId) {
      throw new BadRequestException('fornecedorId é obrigatório');
    }
    return this.medicaoChatService.obterSessao(sessionId, fornecedorId);
  }

  @Post('medicao-chat/sessoes/:sessionId/mensagens')
  async enviarMensagem(
    @Param('sessionId') sessionId: string,
    @Body() body: { fornecedor_id: string; mensagem: string },
  ) {
    if (!body.fornecedor_id) {
      throw new BadRequestException('fornecedor_id é obrigatório');
    }
    if (!body.mensagem?.trim()) {
      throw new BadRequestException('mensagem é obrigatória');
    }
    return this.medicaoChatService.processarMensagem(
      sessionId,
      body.fornecedor_id,
      body.mensagem,
    );
  }

  @Post('medicao-chat/sessoes/:sessionId/anexos')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async anexarArquivo(
    @Param('sessionId') sessionId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { fornecedor_id: string; descricao?: string },
  ) {
    if (!body.fornecedor_id) {
      throw new BadRequestException('fornecedor_id é obrigatório');
    }
    return this.medicaoChatService.anexarArquivo(
      sessionId,
      body.fornecedor_id,
      file,
      body.descricao,
    );
  }

  @Post('medicao-chat/sessoes/:sessionId/reset')
  async resetarSessao(
    @Param('sessionId') sessionId: string,
    @Body() body: { fornecedor_id: string },
  ) {
    if (!body.fornecedor_id) {
      throw new BadRequestException('fornecedor_id é obrigatório');
    }
    return this.medicaoChatService.resetarConversa(sessionId, body.fornecedor_id);
  }
}

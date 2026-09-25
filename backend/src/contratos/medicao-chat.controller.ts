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
import { AcessoLicitacaoService, AtorAtual, SomenteFornecedor } from '../auth/acesso';
import type { Ator } from '../auth/acesso';

/**
 * Medição assistida (chat) do portal do fornecedor.
 * Identidade = token: `fornecedor_id`/`fornecedorId` legado do cliente só é
 * aceito se igual ao do token (senão 403). O service confere a posse do
 * contrato/sessão pelo fornecedor. Órgão → 403.
 */
@Controller('fornecedor/contratos')
@SomenteFornecedor()
export class MedicaoChatController {
  constructor(
    private readonly medicaoChatService: MedicaoChatService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  @Post(':contratoId/medicao-chat/sessoes')
  async iniciarSessao(
    @Param('contratoId') contratoId: string,
    @Body() body: { fornecedor_id?: string; medicao_id?: string },
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.acesso.fornecedorDoToken(ator, body?.fornecedor_id);
    return this.medicaoChatService.iniciarOuRetomarSessao(
      contratoId,
      fornecedorId,
      body.medicao_id,
    );
  }

  @Get('medicao-chat/sessoes/:sessionId')
  async obterSessao(
    @Param('sessionId') sessionId: string,
    @Query('fornecedorId') fornecedorIdInformado: string,
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.acesso.fornecedorDoToken(ator, fornecedorIdInformado);
    return this.medicaoChatService.obterSessao(sessionId, fornecedorId);
  }

  @Post('medicao-chat/sessoes/:sessionId/mensagens')
  async enviarMensagem(
    @Param('sessionId') sessionId: string,
    @Body() body: { fornecedor_id?: string; mensagem: string },
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.acesso.fornecedorDoToken(ator, body?.fornecedor_id);
    if (!body.mensagem?.trim()) {
      throw new BadRequestException('mensagem é obrigatória');
    }
    return this.medicaoChatService.processarMensagem(
      sessionId,
      fornecedorId,
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
    @Body() body: { fornecedor_id?: string; descricao?: string },
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.acesso.fornecedorDoToken(ator, body?.fornecedor_id);
    return this.medicaoChatService.anexarArquivo(
      sessionId,
      fornecedorId,
      file,
      body.descricao,
    );
  }

  @Post('medicao-chat/sessoes/:sessionId/reset')
  async resetarSessao(
    @Param('sessionId') sessionId: string,
    @Body() body: { fornecedor_id?: string; limpar_rascunho?: boolean },
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.acesso.fornecedorDoToken(ator, body?.fornecedor_id);
    return this.medicaoChatService.resetarConversa(
      sessionId,
      fornecedorId,
      Boolean(body.limpar_rascunho),
    );
  }
}

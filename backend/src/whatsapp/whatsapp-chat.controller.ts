import {
  Controller, Get, Post, Patch, Param, Body, Req,
  Sse, MessageEvent, UseGuards, Logger,
} from '@nestjs/common';
import { Observable, fromEvent, map, filter } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WhatsappChatService } from './whatsapp-chat.service';

@UseGuards(JwtAuthGuard)
@Controller('api/whatsapp/chat')
export class WhatsappChatController {
  private readonly logger = new Logger(WhatsappChatController.name);

  constructor(private readonly chatService: WhatsappChatService) {}

  @Get('conversas')
  async listarConversas(@Req() req: any) {
    const orgaoId = req.user?.orgao_id;
    return this.chatService.listarConversas(orgaoId);
  }

  @Get('conversas/:id/mensagens')
  async listarMensagens(@Req() req: any, @Param('id') id: string) {
    const orgaoId = req.user?.orgao_id;
    return this.chatService.listarMensagens(orgaoId, id);
  }

  @Post('conversas/:id/mensagens')
  async enviarMensagem(
    @Req() req: any,
    @Param('id') id: string,
    @Body('conteudo') conteudo: string,
  ) {
    const orgaoId = req.user?.orgao_id;
    return this.chatService.enviarMensagem(orgaoId, id, conteudo);
  }

  @Patch('conversas/:id/lida')
  async marcarComoLida(@Req() req: any, @Param('id') id: string) {
    const orgaoId = req.user?.orgao_id;
    await this.chatService.marcarComoLida(orgaoId, id);
    return { ok: true };
  }

  @Post('conversas/iniciar')
  async iniciarConversa(
    @Req() req: any,
    @Body('phone') phone: string,
    @Body('nomeContato') nomeContato?: string,
  ) {
    const orgaoId = req.user?.orgao_id;
    return this.chatService.obterOuCriarConversa(orgaoId, phone.replace(/\D/g, ''), nomeContato);
  }

  @Sse('eventos')
  eventos(@Req() req: any): Observable<MessageEvent> {
    const orgaoId = req.user?.orgao_id;
    return this.chatService.novaMensagem$.pipe(
      filter(evt => evt.orgaoId === orgaoId),
      map(evt => ({
        data: JSON.stringify({
          conversaId: evt.conversaId,
          mensagem: evt.mensagem,
        }),
      })),
    );
  }
}

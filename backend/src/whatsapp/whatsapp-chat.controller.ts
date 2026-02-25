import {
  Controller, Get, Post, Patch, Param, Body, Req,
  Sse, MessageEvent, UseGuards, Logger, ForbiddenException,
} from '@nestjs/common';
import { Observable, fromEvent, map, filter } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WhatsappChatService } from './whatsapp-chat.service';
import { Orgao } from '../orgaos/entities/orgao.entity';

@UseGuards(JwtAuthGuard)
@Controller('whatsapp/chat')
export class WhatsappChatController {
  private readonly logger = new Logger(WhatsappChatController.name);

  constructor(
    private readonly chatService: WhatsappChatService,
    @InjectRepository(Orgao)
    private readonly orgaoRepo: Repository<Orgao>,
  ) {}

  private getOrgaoId(req: any): string {
    const user = req.user;
    return user?.orgaoId || user?.sub;
  }

  private async verificarModulo(orgaoId: string): Promise<void> {
    const orgao = await this.orgaoRepo.findOne({ where: { id: orgaoId }, select: ['id', 'modulos_habilitados'] });
    if (!orgao) throw new ForbiddenException('Órgão não encontrado.');
    const modulos: string[] = orgao.modulos_habilitados || [];
    if (!modulos.includes('WHATSAPP_CHAT')) {
      throw new ForbiddenException(
        'O módulo "WhatsApp Chat" não está habilitado para este órgão. ' +
        'Solicite a ativação ao administrador do sistema.',
      );
    }
  }

  @Get('conversas')
  async listarConversas(@Req() req: any) {
    const orgaoId = this.getOrgaoId(req);
    await this.verificarModulo(orgaoId);
    return this.chatService.listarConversas(orgaoId);
  }

  @Get('conversas/:id/mensagens')
  async listarMensagens(@Req() req: any, @Param('id') id: string) {
    const orgaoId = this.getOrgaoId(req);
    await this.verificarModulo(orgaoId);
    return this.chatService.listarMensagens(orgaoId, id);
  }

  @Post('conversas/:id/mensagens')
  async enviarMensagem(
    @Req() req: any,
    @Param('id') id: string,
    @Body('conteudo') conteudo: string,
  ) {
    const orgaoId = this.getOrgaoId(req);
    await this.verificarModulo(orgaoId);
    return this.chatService.enviarMensagem(orgaoId, id, conteudo);
  }

  @Patch('conversas/:id/lida')
  async marcarComoLida(@Req() req: any, @Param('id') id: string) {
    const orgaoId = this.getOrgaoId(req);
    await this.verificarModulo(orgaoId);
    await this.chatService.marcarComoLida(orgaoId, id);
    return { ok: true };
  }

  @Post('conversas/iniciar')
  async iniciarConversa(
    @Req() req: any,
    @Body('phone') phone: string,
    @Body('nomeContato') nomeContato?: string,
  ) {
    const orgaoId = this.getOrgaoId(req);
    await this.verificarModulo(orgaoId);
    return this.chatService.obterOuCriarConversa(orgaoId, phone.replace(/\D/g, ''), nomeContato);
  }

  @Sse('eventos')
  async eventos(@Req() req: any): Promise<Observable<MessageEvent>> {
    const orgaoId = this.getOrgaoId(req);
    await this.verificarModulo(orgaoId);
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

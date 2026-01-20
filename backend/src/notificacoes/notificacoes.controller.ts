import { Controller, Get, Post, Param, Query, Req, ParseUUIDPipe } from '@nestjs/common';
import { NotificacoesService } from './notificacoes.service';

interface JwtPayload {
  sub: string;
  email: string;
  orgaoId?: string;
  orgao_id?: string;
}

@Controller('api/notificacoes')
export class NotificacoesController {
  constructor(private readonly notificacoesService: NotificacoesService) {}

  private getOrgaoId(user: JwtPayload): string {
    return user.orgaoId || (user as any).orgao_id || '';
  }

  /**
   * Lista notificações do usuário logado
   */
  @Get()
  async listar(
    @Req() request: { user: JwtPayload },
    @Query('apenasNaoLidas') apenasNaoLidas?: string,
    @Query('limite') limite?: string,
  ) {
    const user = request.user;
    const orgaoId = this.getOrgaoId(user);

    return this.notificacoesService.listarPorUsuario(user.sub, orgaoId, {
      apenasNaoLidas: apenasNaoLidas === 'true',
      limite: limite ? parseInt(limite) : undefined,
    });
  }

  /**
   * Conta notificações não lidas
   */
  @Get('nao-lidas/count')
  async contarNaoLidas(@Req() request: { user: JwtPayload }) {
    const user = request.user;
    const orgaoId = this.getOrgaoId(user);

    const count = await this.notificacoesService.contarNaoLidas(user.sub, orgaoId);
    return { count };
  }

  /**
   * Marca notificação como lida
   */
  @Post(':id/marcar-lida')
  async marcarComoLida(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    const user = request.user;
    return this.notificacoesService.marcarComoLida(id, user.sub);
  }

  /**
   * Marca todas as notificações como lidas
   */
  @Post('marcar-todas-lidas')
  async marcarTodasComoLidas(@Req() request: { user: JwtPayload }) {
    const user = request.user;
    const orgaoId = this.getOrgaoId(user);

    await this.notificacoesService.marcarTodasComoLidas(user.sub, orgaoId);
    return { success: true };
  }
}

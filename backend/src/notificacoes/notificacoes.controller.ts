import { Controller, Get, Post, Param, Query, Req, ParseUUIDPipe } from '@nestjs/common';
import { NotificacoesService } from './notificacoes.service';

interface JwtPayload {
  sub: string;
  email: string;
  type?: string;
  orgaoId?: string;
  orgao_id?: string;
}

@Controller('notificacoes')
export class NotificacoesController {
  constructor(private readonly notificacoesService: NotificacoesService) {}

  /**
   * Resolve o orgaoId do JWT.
   * - ORGAO type: sub é o próprio orgaoId
   * - USUARIO type: orgaoId ou orgao_id do JWT
   * - ADMIN: retorna vazio
   */
  private getOrgaoId(user: JwtPayload): string {
    const tipo = ((user as any).type || '').toUpperCase();
    if (tipo === 'ORGAO') return user.sub;
    return user.orgaoId || (user as any).orgao_id || '';
  }

  private isFornecedor(user: JwtPayload): boolean {
    const tipo = ((user as any).type || '').toUpperCase();
    return tipo === 'FORNECEDOR';
  }

  private isOrgao(user: JwtPayload): boolean {
    const tipo = ((user as any).type || '').toUpperCase();
    return tipo === 'ORGAO';
  }

  /**
   * Lista notificações do usuário logado
   * - Fornecedor: busca por usuario_id (sem filtrar orgao_id)
   * - Órgão (login direto): busca TODAS notificações do orgao (orgao_id), sem filtrar usuario_id
   * - Usuário: busca por usuario_id + orgao_id
   */
  @Get()
  async listar(
    @Req() request: { user: JwtPayload },
    @Query('apenasNaoLidas') apenasNaoLidas?: string,
    @Query('limite') limite?: string,
  ) {
    const user = request.user;

    if (this.isFornecedor(user)) {
      return this.notificacoesService.listarPorUsuarioSemOrgao(user.sub, {
        apenasNaoLidas: apenasNaoLidas === 'true',
        limite: limite ? parseInt(limite) : undefined,
      });
    }

    const orgaoId = this.getOrgaoId(user);

    // Login direto como órgão: mostra TODAS notificações do órgão
    if (this.isOrgao(user)) {
      return this.notificacoesService.listarPorOrgao(orgaoId, {
        apenasNaoLidas: apenasNaoLidas === 'true',
        limite: limite ? parseInt(limite) : undefined,
      });
    }

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

    if (this.isFornecedor(user)) {
      return { count: await this.notificacoesService.contarNaoLidasSemOrgao(user.sub) };
    }

    const orgaoId = this.getOrgaoId(user);

    // Login direto como órgão: conta TODAS não lidas do órgão
    if (this.isOrgao(user)) {
      return { count: await this.notificacoesService.contarNaoLidasPorOrgao(orgaoId) };
    }

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
    // Para órgão, marca como lida independente do usuario_id
    if (this.isOrgao(user)) {
      return this.notificacoesService.marcarComoLidaPorOrgao(id, user.sub);
    }
    return this.notificacoesService.marcarComoLida(id, user.sub);
  }

  /**
   * Marca todas as notificações como lidas
   */
  @Post('marcar-todas-lidas')
  async marcarTodasComoLidas(@Req() request: { user: JwtPayload }) {
    const user = request.user;

    if (this.isFornecedor(user)) {
      await this.notificacoesService.marcarTodasComoLidasSemOrgao(user.sub);
      return { success: true };
    }

    const orgaoId = this.getOrgaoId(user);

    // Login direto como órgão: marca TODAS do órgão
    if (this.isOrgao(user)) {
      await this.notificacoesService.marcarTodasComoLidasPorOrgao(orgaoId);
      return { success: true };
    }

    await this.notificacoesService.marcarTodasComoLidas(user.sub, orgaoId);
    return { success: true };
  }
}

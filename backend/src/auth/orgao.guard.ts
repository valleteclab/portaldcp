import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthService, JwtPayload } from './auth.service';

/**
 * Guard que verifica se o usuário pertence ao órgão especificado no parâmetro da rota
 * Usa o orgao_id do token JWT para validar acesso
 */
@Injectable()
export class OrgaoGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: JwtPayload = request.user;

    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    // Extrai orgao_id do parâmetro da rota ou do body
    const orgaoId = request.params.orgaoId || request.body.orgao_id || request.query.orgao_id;

    // Se não tem orgao_id na requisição, permite (pode ser uma rota que não precisa)
    if (!orgaoId) {
      return true;
    }

    // Verifica se o usuário pertence ao órgão
    const pertenceAoOrgao = await this.authService.verificarOrgao(user, orgaoId);

    if (!pertenceAoOrgao) {
      throw new ForbiddenException('Acesso negado: você não pertence a este órgão');
    }

    return true;
  }
}


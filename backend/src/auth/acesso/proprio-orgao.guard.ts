import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { atorDaRequisicao, ehOrgao } from './ator';

/**
 * Rotas `/orgaos/:orgaoId/...`: o órgão da URL tem de ser o do token.
 * ADMIN da plataforma passa; fornecedor e usuário de outro órgão recebem 403.
 * Sem dependências — basta `@UseGuards(ProprioOrgaoGuard)` na classe.
 */
@Injectable()
export class ProprioOrgaoGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const ator = atorDaRequisicao(req);
    if (!ator) throw new UnauthorizedException('Autenticação necessária');
    if (ator.admin) return true;
    const orgaoId = req.params?.orgaoId;
    if (ehOrgao(ator) && orgaoId && ator.orgaoId === orgaoId) return true;
    throw new ForbiddenException('Acesso negado: este recurso é de outro órgão');
  }
}

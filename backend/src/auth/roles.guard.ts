import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, Role } from './roles.decorator';
import { JwtPayload } from './auth.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: JwtPayload = request.user;

    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    // Se não tem role no payload, verifica se é órgão (que tem acesso total)
    if (!user.role) {
      // Por enquanto, órgãos têm acesso total
      // Quando Usuario for criado, isso será mais restritivo
      if (user.type === 'ORGAO') {
        return true;
      }
      throw new ForbiddenException('Acesso negado: permissões insuficientes');
    }

    const hasRole = requiredRoles.some((role) => user.role === role);

    if (!hasRole) {
      throw new ForbiddenException('Acesso negado: permissões insuficientes');
    }

    return true;
  }
}


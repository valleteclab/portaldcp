import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtPayload, UserType } from './auth.service';

export const PERMITE_ORGAO_KEY = 'permite_orgao';

/**
 * Escape hatch do AdminGuard: libera a rota para usuários de órgão.
 * Use só onde o órgão realmente precisa da rota — e valide no handler o que
 * ele pode tocar. Sem isso, tudo sob o AdminGuard é exclusivo do admin.
 */
export const PermiteOrgao = () => SetMetadata(PERMITE_ORGAO_KEY, true);

/**
 * Restringe a rota ao administrador da plataforma (UserType.ADMIN).
 *
 * O JwtAuthGuard global só garante que existe alguém logado, e o ModuloGuard
 * libera qualquer rota que não declare módulo — então rotas de configuração
 * ficavam acessíveis a qualquer conta autenticada, inclusive fornecedor (o
 * cadastro de fornecedor é público). Este guard fecha isso.
 *
 * Atenção: `role === 'ADMIN'` NÃO serve aqui. Esse papel é o de administrador
 * *do órgão* (roles.decorator.ts), não o da plataforma.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: JwtPayload | undefined = request.user;

    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    if (user.type === UserType.ADMIN) {
      return true;
    }

    const permiteOrgao = this.reflector.getAllAndOverride<boolean>(
      PERMITE_ORGAO_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (
      permiteOrgao &&
      (user.type === UserType.ORGAO || user.type === UserType.USUARIO)
    ) {
      return true;
    }

    throw new ForbiddenException(
      'Acesso restrito ao administrador da plataforma',
    );
  }
}

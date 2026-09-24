import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { AUTENTICACAO_OPCIONAL_KEY } from './acesso/acesso.decorators';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Verifica se a rota está marcada como pública
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      // @AutenticacaoOpcional(): rota pública que identifica o ator SE houver
      // Bearer válido (req.user). Token inválido/expirado → segue anônimo.
      const opcional = this.reflector.getAllAndOverride<boolean>(AUTENTICACAO_OPCIONAL_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      const req = context.switchToHttp().getRequest();
      if (opcional && /^Bearer\s+\S+/i.test(req?.headers?.authorization || '')) {
        try {
          await (super.canActivate(context) as Promise<boolean>);
        } catch {
          req.user = undefined;
        }
      }
      return true;
    }

    return (await super.canActivate(context)) as boolean;
  }

  handleRequest(err: any, user: any, info: any) {
    // Você pode lançar uma exceção baseado em "info" ou "err"
    if (err || !user) {
      throw err || new UnauthorizedException('Token inválido ou expirado');
    }
    return user;
  }
}


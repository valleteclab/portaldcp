import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_MODULE_KEY } from './require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';

@Injectable()
export class ModuloGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredModules = this.reflector.getAllAndOverride<ModuloSistema[]>(
      REQUIRED_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredModules || requiredModules.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    // Admin tem acesso a tudo
    if (user.role === 'admin') {
      return true;
    }

    // Verifica se o órgão do usuário tem acesso aos módulos requeridos
    const orgaoModulos = user.orgao?.modulos_ativos || [];
    
    const hasAccess = requiredModules.some(modulo => 
      orgaoModulos.includes(modulo)
    );

    if (!hasAccess) {
      throw new ForbiddenException(
        `Seu órgão não tem acesso ao módulo: ${requiredModules.join(', ')}`
      );
    }

    return true;
  }
}


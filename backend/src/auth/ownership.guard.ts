import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtPayload, UserType } from './auth.service';

/**
 * Decorator para marcar qual parâmetro da rota contém o ID do recurso
 * Exemplo: @OwnershipParam('fornecedorId')
 */
export const OWNERSHIP_PARAM_KEY = 'ownership_param';
export const OwnershipParam = (param: string) => 
  (target: any, key: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(OWNERSHIP_PARAM_KEY, param, descriptor.value);
    return descriptor;
  };

/**
 * Guard que valida se o usuário autenticado é o dono do recurso
 * 
 * Uso:
 * @UseGuards(JwtAuthGuard, OwnershipGuard)
 * @OwnershipParam('fornecedorId')
 * @Get(':fornecedorId/dados')
 * async getDados(@Param('fornecedorId') fornecedorId: string) { ... }
 */
@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    // Obtém o nome do parâmetro que contém o ID do recurso
    const paramName = this.reflector.get<string>(
      OWNERSHIP_PARAM_KEY,
      context.getHandler(),
    );

    if (!paramName) {
      // Se não especificou parâmetro, permite (guard não se aplica)
      return true;
    }

    const resourceId = request.params[paramName];

    if (!resourceId) {
      // Se o parâmetro não existe na rota, permite
      return true;
    }

    // Valida ownership baseado no tipo de usuário
    switch (user.type) {
      case UserType.FORNECEDOR:
        // Fornecedor só pode acessar seus próprios recursos
        if (user.sub !== resourceId) {
          throw new ForbiddenException('Você não tem permissão para acessar este recurso');
        }
        break;

      case UserType.ORGAO:
        // Órgão pode acessar recursos do próprio órgão
        if (user.sub !== resourceId && user.orgaoId !== resourceId) {
          throw new ForbiddenException('Você não tem permissão para acessar este recurso');
        }
        break;

      case UserType.USUARIO:
        // Usuário do órgão pode acessar recursos do órgão ao qual pertence
        if (user.orgaoId !== resourceId && user.sub !== resourceId) {
          throw new ForbiddenException('Você não tem permissão para acessar este recurso');
        }
        break;

      default:
        throw new ForbiddenException('Tipo de usuário inválido');
    }

    return true;
  }
}

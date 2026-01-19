import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { REQUIRED_MODULE_KEY } from './require-module.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { JwtPayload, UserType } from './auth.service';

@Injectable()
export class ModuloGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(Orgao)
    private readonly orgaoRepository: Repository<Orgao>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Se a rota é pública, não precisa verificar módulos
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredModules = this.reflector.getAllAndOverride<ModuloSistema[]>(
      REQUIRED_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredModules || requiredModules.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: JwtPayload = request.user;

    if (!user) {
      // Debug: log quando não há usuário
      console.log('[ModuloGuard] Usuário não autenticado na requisição:', request.url);
      throw new ForbiddenException('Usuário não autenticado');
    }

    // Debug: log do usuário e módulos requeridos
    console.log('[ModuloGuard] Verificando módulos para usuário:', {
      type: user.type,
      sub: user.sub,
      orgaoId: user.orgaoId,
      requiredModules,
    });

    // Admin tem acesso a tudo
    if (user.type === UserType.ADMIN || user.role === 'admin') {
      return true;
    }

    // Para usuários do tipo ORGAO, carrega o órgão do banco
    let orgaoModulos: ModuloSistema[] = [];
    if (user.type === UserType.ORGAO) {
      const orgao = await this.orgaoRepository.findOne({
        where: { id: user.sub },
      });
      orgaoModulos = orgao?.modulos_habilitados || [];
      console.log('[ModuloGuard] Módulos do órgão no banco:', {
        orgaoId: user.sub,
        modulos: orgaoModulos,
      });
    } else if (user.orgaoId) {
      // Para usuários vinculados a um órgão
      const orgao = await this.orgaoRepository.findOne({
        where: { id: user.orgaoId },
      });
      orgaoModulos = orgao?.modulos_habilitados || [];
      console.log('[ModuloGuard] Módulos do órgão vinculado no banco:', {
        orgaoId: user.orgaoId,
        modulos: orgaoModulos,
      });
    }
    
    // Se não tiver módulos definidos no banco, permite acesso (compatibilidade)
    // Isso permite que órgãos sem módulos configurados ainda funcionem
    // Mas se houver módulos definidos, verifica se o módulo requerido está habilitado
    if (orgaoModulos && orgaoModulos.length > 0) {
      // Se há módulos definidos, verifica se o módulo requerido está habilitado
      const hasAccess = requiredModules.some(modulo => 
        orgaoModulos.includes(modulo)
      );

      console.log('[ModuloGuard] Verificação de acesso:', {
        requiredModules,
        orgaoModulos,
        hasAccess,
      });

      if (!hasAccess) {
        console.log('[ModuloGuard] ACESSO NEGADO - Módulo requerido não está habilitado');
        throw new ForbiddenException(
          `Seu órgão não tem acesso ao módulo: ${requiredModules.join(', ')}. Configure os módulos no painel administrativo.`
        );
      }
    } else {
      console.log('[ModuloGuard] Permite acesso - nenhum módulo definido no banco (compatibilidade)');
    }
    // Se não há módulos definidos, permite acesso (compatibilidade com sistema antigo)

    return true;
  }
}


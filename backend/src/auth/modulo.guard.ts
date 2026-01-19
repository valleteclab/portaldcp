import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { REQUIRED_MODULE_KEY } from './require-module.decorator';
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
      throw new ForbiddenException('Usuário não autenticado');
    }

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
    } else if (user.orgaoId) {
      // Para usuários vinculados a um órgão
      const orgao = await this.orgaoRepository.findOne({
        where: { id: user.orgaoId },
      });
      orgaoModulos = orgao?.modulos_habilitados || [];
    }
    
    // Se não tiver módulos definidos no banco, permite acesso (compatibilidade)
    // Isso permite que órgãos sem módulos configurados ainda funcionem
    // Mas se houver módulos definidos, verifica se o módulo requerido está habilitado
    if (orgaoModulos && orgaoModulos.length > 0) {
      // Se há módulos definidos, verifica se o módulo requerido está habilitado
      const hasAccess = requiredModules.some(modulo => 
        orgaoModulos.includes(modulo)
      );

      if (!hasAccess) {
        throw new ForbiddenException(
          `Seu órgão não tem acesso ao módulo: ${requiredModules.join(', ')}. Configure os módulos no painel administrativo.`
        );
      }
    }
    // Se não há módulos definidos, permite acesso (compatibilidade com sistema antigo)

    return true;
  }
}


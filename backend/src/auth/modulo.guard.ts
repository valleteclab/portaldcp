import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { REQUIRED_MODULE_KEY } from './require-module.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { Orgao } from '../orgaos/entities/orgao.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { JwtPayload, UserType } from './auth.service';

@Injectable()
export class ModuloGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(Orgao)
    private readonly orgaoRepository: Repository<Orgao>,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
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
      throw new ForbiddenException('Usuário não autenticado');
    }

    // Debug: log do usuário e módulos requeridos (reduzido para evitar rate limit)
    // console.log('[ModuloGuard] Verificando módulos para usuário:', {
    //   type: user.type,
    //   sub: user.sub,
    //   orgaoId: user.orgaoId,
    //   requiredModules,
    // });

    // Admin tem acesso a tudo
    if (user.type === UserType.ADMIN || user.role === 'admin') {
      return true;
    }

    // Módulos efetivos: interseção entre módulos do órgão e módulos do usuário
    let modulosEfetivos: ModuloSistema[] = [];
    let orgaoModulos: ModuloSistema[] = [];
    let usuarioModulos: ModuloSistema[] | null = null;

    if (user.type === UserType.ORGAO) {
      // Login direto do órgão: usa apenas módulos do órgão
      const orgao = await this.orgaoRepository.findOne({
        where: { id: user.sub },
      });
      orgaoModulos = orgao?.modulos_habilitados || [];
      modulosEfetivos = orgaoModulos;
    } else if (user.type === UserType.USUARIO) {
      // Usuário vinculado a órgão: verifica módulos do órgão E do usuário
      const orgaoId = user.orgaoId || (user as any).orgao_id;
      
      if (orgaoId) {
        // Busca órgão
        const orgao = await this.orgaoRepository.findOne({
          where: { id: orgaoId },
        });
        orgaoModulos = orgao?.modulos_habilitados || [];
        
        // Busca usuário para verificar módulos individuais
        const usuario = await this.usuarioRepository.findOne({
          where: { id: user.sub },
        });
        usuarioModulos = usuario?.modulos_habilitados || null;
        
        // Se o usuário tem módulos configurados, faz interseção com módulos do órgão
        // Se não tem (null/vazio), herda todos os módulos do órgão
        if (usuarioModulos && usuarioModulos.length > 0) {
          // Interseção: usuário só pode ter acesso aos módulos que AMBOS têm
          modulosEfetivos = usuarioModulos.filter(m => orgaoModulos.includes(m));
        } else {
          // Herda todos os módulos do órgão
          modulosEfetivos = orgaoModulos;
        }
      }
    } else if (user.orgaoId) {
      // Fallback para outros tipos de usuário
      const orgao = await this.orgaoRepository.findOne({
        where: { id: user.orgaoId },
      });
      orgaoModulos = orgao?.modulos_habilitados || [];
      modulosEfetivos = orgaoModulos;
    }
    
    // Se não tiver módulos definidos no banco, permite acesso (compatibilidade)
    // Isso permite que órgãos sem módulos configurados ainda funcionem
    if (modulosEfetivos && modulosEfetivos.length > 0) {
      // Se há módulos definidos, verifica se o módulo requerido está habilitado
      const hasAccess = requiredModules.some(modulo => 
        modulosEfetivos.includes(modulo)
      );

      if (!hasAccess) {
        // Mensagem diferente se for restrição do órgão ou do usuário
        if (usuarioModulos && usuarioModulos.length > 0) {
          throw new ForbiddenException(
            `Você não tem permissão para acessar o módulo: ${requiredModules.join(', ')}. Solicite acesso ao administrador do seu órgão.`
          );
        } else {
          throw new ForbiddenException(
            `Seu órgão não tem acesso ao módulo: ${requiredModules.join(', ')}. Configure os módulos no painel administrativo.`
          );
        }
      }
    }
    // Se não há módulos definidos, permite acesso (compatibilidade com sistema antigo)

    return true;
  }
}


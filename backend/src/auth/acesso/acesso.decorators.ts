import {
  applyDecorators,
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../public.decorator';
import { Ator, atorDaRequisicao, ehFornecedor, ehOrgao } from './ator';

/**
 * Decorators de PAPEL (quem pode chamar a rota). Não checam DONO do recurso —
 * isso é do AcessoLicitacaoService, chamado no handler com o id da rota.
 *
 *   @SomenteOrgao()       ORGAO ou USUARIO (com órgão). ADMIN da plataforma passa.
 *   @SomenteFornecedor()  FORNECEDOR. ADMIN NÃO passa (ninguém age como fornecedor).
 *   @AutenticacaoOpcional() rota pública que, SE vier Bearer válido, preenche o ator
 *                          (ex.: painel público que mostra ao fornecedor logado o valor dele).
 *   @AtorAtual()          parâmetro: Ator | null (montado do JWT; nunca do corpo).
 *
 * Aplicável no método ou na classe. Recusa com 403 (papel errado) ou 401 (sem login).
 */

export const PAPEIS_PERMITIDOS_KEY = 'acesso:papeis';
export const AUTENTICACAO_OPCIONAL_KEY = 'acesso:autenticacao_opcional';

export type PapelPermitido = 'ORGAO' | 'FORNECEDOR' | 'ADMIN';

@Injectable()
export class PapelGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const papeis = this.reflector.getAllAndOverride<PapelPermitido[]>(PAPEIS_PERMITIDOS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!papeis || papeis.length === 0) return true;

    const ator = atorDaRequisicao(context.switchToHttp().getRequest());
    if (!ator) throw new UnauthorizedException('Autenticação necessária');

    if (ator.admin && papeis.includes('ADMIN')) return true;
    if (papeis.includes('ORGAO') && ehOrgao(ator)) return true;
    if (papeis.includes('FORNECEDOR') && ehFornecedor(ator)) return true;

    if (papeis.length === 1 && papeis[0] === 'FORNECEDOR') {
      throw new ForbiddenException('Ação exclusiva de fornecedor');
    }
    if (papeis.includes('ORGAO') && !papeis.includes('FORNECEDOR')) {
      throw new ForbiddenException('Ação exclusiva do órgão');
    }
    throw new ForbiddenException('Acesso negado para este perfil');
  }
}

/** Declara os papéis aceitos (uso interno dos atalhos abaixo). */
export const PapeisPermitidos = (...papeis: PapelPermitido[]) =>
  applyDecorators(SetMetadata(PAPEIS_PERMITIDOS_KEY, papeis), UseGuards(PapelGuard));

/** Órgão (ORGAO/USUARIO). ADMIN da plataforma também passa. */
export const SomenteOrgao = () => PapeisPermitidos('ORGAO', 'ADMIN');

/** Fornecedor autenticado. Identidade do fornecedor = token (use @AtorAtual()). */
export const SomenteFornecedor = () => PapeisPermitidos('FORNECEDOR');

/** Órgão ou fornecedor (ex.: chat da sala). ADMIN passa. */
export const OrgaoOuFornecedor = () => PapeisPermitidos('ORGAO', 'FORNECEDOR', 'ADMIN');

/**
 * Rota PÚBLICA com login opcional: sem token → ator null; com Bearer válido →
 * ator preenchido; com token inválido/expirado → segue como anônimo (é leitura
 * pública — nada além do público é entregue a quem não tem ator).
 * Tratado no JwtAuthGuard global.
 */
export const AutenticacaoOpcional = () =>
  applyDecorators(SetMetadata(IS_PUBLIC_KEY, true), SetMetadata(AUTENTICACAO_OPCIONAL_KEY, true));

/** Parâmetro do handler: o ator autenticado (ou null em rota pública sem login). */
export const AtorAtual = createParamDecorator((_data: unknown, ctx: ExecutionContext): Ator | null => {
  return atorDaRequisicao(ctx.switchToHttp().getRequest());
});

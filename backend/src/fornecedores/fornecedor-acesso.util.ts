import { JwtPayload, UserType } from '../auth/auth.service';

/**
 * Regras de autorização das rotas de escrita/leitura sensível do cadastro de
 * fornecedores. Funções puras (sem banco): o controller resolve o vínculo
 * órgão × fornecedor e repassa o resultado aqui.
 *
 * Importante: só `type === ADMIN` conta como administrador — o campo `role`
 * do token NÃO é aceito como admin.
 */
export type RegraAcessoFornecedor =
  /** Apenas o super admin da plataforma. */
  | 'ADMIN'
  /** O próprio fornecedor (token FORNECEDOR com sub === id) ou ADMIN. */
  | 'PROPRIO_OU_ADMIN'
  /** Órgão (ORGAO/USUARIO) com vínculo com o fornecedor, ou ADMIN. */
  | 'ORGAO_VINCULADO_OU_ADMIN'
  /** O próprio fornecedor, órgão com vínculo, ou ADMIN. */
  | 'PROPRIO_ORGAO_VINCULADO_OU_ADMIN';

/** Campos do cadastro que um órgão pode alterar via PUT /fornecedores/:id. */
export const CAMPOS_UPDATE_PERMITIDOS_ORGAO = ['razao_social', 'nome_fantasia'] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && UUID_RE.test(valor);
}

export function isAdmin(user?: Partial<JwtPayload> | null): boolean {
  return !!user && user.type === UserType.ADMIN;
}

export function isProprioFornecedor(user: Partial<JwtPayload> | null | undefined, fornecedorId: string): boolean {
  return (
    !!user &&
    user.type === UserType.FORNECEDOR &&
    typeof user.sub === 'string' &&
    user.sub.length > 0 &&
    user.sub === fornecedorId
  );
}

/** Órgão do usuário logado (ORGAO → sub; USUARIO → orgaoId). Demais tipos: null. */
export function orgaoIdDoUsuario(user?: Partial<JwtPayload> | null): string | null {
  if (!user) return null;
  if (user.type === UserType.ORGAO) return user.sub || null;
  if (user.type === UserType.USUARIO) {
    return user.orgaoId || (user as any).orgao_id || null;
  }
  return null;
}

/** Token de órgão (ORGAO, ou USUARIO com órgão) ou ADMIN — nunca FORNECEDOR. */
export function isOrgaoOuAdmin(user?: Partial<JwtPayload> | null): boolean {
  return isAdmin(user) || orgaoIdDoUsuario(user) !== null;
}

/** A regra depende de vínculo órgão × fornecedor para este usuário? (evita consulta desnecessária) */
export function regraPrecisaVinculo(user: Partial<JwtPayload> | null | undefined, regra: RegraAcessoFornecedor): boolean {
  if (regra !== 'ORGAO_VINCULADO_OU_ADMIN' && regra !== 'PROPRIO_ORGAO_VINCULADO_OU_ADMIN') return false;
  return orgaoIdDoUsuario(user) !== null;
}

/**
 * Decide se o usuário pode acessar o fornecedor segundo a regra.
 * `orgaoTemVinculo` só é considerado para tokens ORGAO/USUARIO.
 */
export function podeAcessarFornecedor(
  user: Partial<JwtPayload> | null | undefined,
  fornecedorId: string,
  regra: RegraAcessoFornecedor,
  orgaoTemVinculo = false,
): boolean {
  if (!user || !fornecedorId) return false;
  if (isAdmin(user)) return true;

  switch (regra) {
    case 'ADMIN':
      return false;
    case 'PROPRIO_OU_ADMIN':
      return isProprioFornecedor(user, fornecedorId);
    case 'ORGAO_VINCULADO_OU_ADMIN':
      return orgaoIdDoUsuario(user) !== null && orgaoTemVinculo === true;
    case 'PROPRIO_ORGAO_VINCULADO_OU_ADMIN':
      return (
        isProprioFornecedor(user, fornecedorId) ||
        (orgaoIdDoUsuario(user) !== null && orgaoTemVinculo === true)
      );
    default:
      return false;
  }
}

/**
 * Para PUT /fornecedores/:id feito por órgão: retorna os campos enviados que o
 * órgão NÃO pode alterar (vazio = ok). Campos com valor `undefined` são ignorados.
 */
export function camposNaoPermitidosParaOrgao(body: Record<string, unknown> | null | undefined): string[] {
  if (!body || typeof body !== 'object') return [];
  const permitidos = new Set<string>(CAMPOS_UPDATE_PERMITIDOS_ORGAO);
  return Object.keys(body).filter((k) => body[k] !== undefined && !permitidos.has(k));
}

/**
 * POST /completar-credenciamento: o fornecedor só pode completar o próprio
 * cadastro (o serviço localiza o registro pelo e-mail do corpo).
 */
export function emailCorrespondeAoProprio(emailDoCadastro: string | null | undefined, emailDoCorpo: string | null | undefined): boolean {
  const a = (emailDoCadastro || '').trim().toLowerCase();
  const b = (emailDoCorpo || '').trim().toLowerCase();
  return a.length > 0 && a === b;
}

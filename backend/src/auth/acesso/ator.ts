import { JwtPayload, UserType } from '../auth.service';

/**
 * ATOR AUTENTICADO — fonte ÚNICA de identidade para autorização.
 *
 * Tudo que decide "quem é" e "de qual órgão/fornecedor" vem daqui, montado a
 * partir do JWT já validado (req.user / client.data do socket). NUNCA de
 * body/query/params/payload de socket: um id vindo do cliente é, no máximo,
 * um filtro que precisa ser confrontado com o ator.
 *
 * Tipos de token (auth.service.ts / usuarios.controller.ts):
 *  - ORGAO      → login do próprio órgão: `sub` = id do órgão
 *  - USUARIO    → servidor do órgão (pregoeiro, apoio...): `sub` = id do usuário,
 *                 `orgaoId` = órgão ao qual pertence
 *  - FORNECEDOR → `sub` = id do fornecedor
 *  - ADMIN      → administrador da PLATAFORMA (não é o `role` ADMIN do órgão)
 */
export type TipoAtor = 'ORGAO' | 'USUARIO' | 'FORNECEDOR' | 'ADMIN';

export interface Ator {
  tipo: TipoAtor;
  /** `sub` do token (id do órgão, do usuário, do fornecedor ou 'super-admin'). */
  id: string;
  /** Órgão do ator: ORGAO → o próprio; USUARIO → o do cadastro; demais → null. */
  orgaoId: string | null;
  /** Só para FORNECEDOR. */
  fornecedorId: string | null;
  /** Só para USUARIO (servidor do órgão). */
  usuarioId: string | null;
  /** Administrador da plataforma (acesso total, inclusive padrões do sistema). */
  admin: boolean;
  /** Papel do usuário do órgão (PREGOEIRO, ADMIN do órgão...), quando houver. */
  role: string | null;
}

/** ORGAO ou USUARIO com órgão definido (lado da Administração). */
export function ehOrgao(ator: Ator | null | undefined): ator is Ator & { orgaoId: string } {
  return !!ator && (ator.tipo === 'ORGAO' || ator.tipo === 'USUARIO') && !!ator.orgaoId;
}

export function ehFornecedor(ator: Ator | null | undefined): ator is Ator & { fornecedorId: string } {
  return !!ator && ator.tipo === 'FORNECEDOR' && !!ator.fornecedorId;
}

export function ehAdmin(ator: Ator | null | undefined): boolean {
  return !!ator && ator.admin;
}

/**
 * Converte o payload do JWT (já validado pela JwtStrategy / pelo autenticador
 * de socket) em Ator. Devolve null para ausente ou tipo desconhecido.
 */
export function atorDoPayload(payload: JwtPayload | null | undefined): Ator | null {
  if (!payload || !payload.sub || !payload.type) return null;
  const base = {
    id: String(payload.sub),
    orgaoId: null as string | null,
    fornecedorId: null as string | null,
    usuarioId: null as string | null,
    admin: false,
    role: payload.role ?? null,
  };
  switch (payload.type) {
    case UserType.ORGAO:
      return { ...base, tipo: 'ORGAO', orgaoId: String(payload.sub) };
    case UserType.USUARIO: {
      // Tokens antigos podem trazer `orgao_id` (snake_case)
      const orgaoId = payload.orgaoId || (payload as any).orgao_id || null;
      return { ...base, tipo: 'USUARIO', usuarioId: String(payload.sub), orgaoId: orgaoId ? String(orgaoId) : null };
    }
    case UserType.FORNECEDOR:
      return { ...base, tipo: 'FORNECEDOR', fornecedorId: String(payload.sub) };
    case UserType.ADMIN:
      return { ...base, tipo: 'ADMIN', admin: true };
    default:
      return null;
  }
}

/** Ator da requisição HTTP (null em rota pública sem token). */
export function atorDaRequisicao(req: { user?: any } | null | undefined): Ator | null {
  return atorDoPayload(req?.user);
}

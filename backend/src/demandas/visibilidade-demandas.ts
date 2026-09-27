/**
 * VISIBILIDADE DAS DEMANDAS dentro do órgão (funções PURAS — sem banco).
 *
 * Regra (homologação multiusuário, 27/09): quem só pede (requisitante) vê as
 * demandas do SEU setor e as que ele mesmo criou; veem TODAS:
 *  - o login do órgão e o admin da plataforma;
 *  - o administrador do órgão (role ADMIN);
 *  - quem aprova demandas (regra do modelo de fluxo — padrão "pode aprovar demandas");
 *  - a unidade de planejamento (quem monta o DFD — papel PLANEJAMENTO) e quem
 *    aprova o DFD consolidado (2ª aprovação).
 * O escopo vem SEMPRE do token + banco (nunca do corpo/consulta).
 */
import { PapelFaseInterna } from '../fase-interna/fluxo/codigos';
import type { PessoaDoOrgao } from '../fase-interna/fluxo/planejamento-fluxo';

export type EscopoDemandas =
  | { todas: true }
  | {
      todas: false;
      /** Usuário (criou → vê). */
      usuarioId: string;
      /** Setor do usuário (null = sem setor: só as que criou). */
      setorId: string | null;
      /** Nome do setor — demandas antigas sem `setor_id` casam pelo nome da unidade requisitante. */
      setorNome: string | null;
    };

/** Quem consulta vê todas as demandas do órgão? */
export function veTodasAsDemandas(
  pessoa: PessoaDoOrgao | null,
  pode: { aprovarDemanda: boolean; montarDfd: boolean; aprovarDfd: boolean },
): boolean {
  if (!pessoa) return false;
  if (pessoa.orgao || pessoa.admin_orgao) return true;
  if (pode.aprovarDemanda || pode.montarDfd || pode.aprovarDfd) return true;
  return pessoa.papeis.includes(PapelFaseInterna.PLANEJAMENTO);
}

const norm = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase();

/** A demanda está no escopo? (GET :id, escrita e filtros em memória) */
export function demandaNoEscopo(
  escopo: EscopoDemandas,
  d: { setor_id?: string | null; unidade_requisitante?: string | null; criado_por_id?: string | null },
): boolean {
  if (escopo.todas) return true;
  if (d.criado_por_id && d.criado_por_id === escopo.usuarioId) return true;
  if (!escopo.setorId) return false;
  if (d.setor_id) return d.setor_id === escopo.setorId;
  // demanda antiga, sem setor gravado: pelo nome da unidade requisitante
  return !!escopo.setorNome && norm(d.unidade_requisitante) === norm(escopo.setorNome);
}

/**
 * Condição SQL do escopo sobre o alias `alias` (params nomeados do TypeORM).
 * `todas` → null (sem filtro).
 */
export function condicaoSqlDoEscopo(
  escopo: EscopoDemandas,
  alias = 'd',
): { sql: string; params: Record<string, unknown> } | null {
  if (escopo.todas) return null;
  const partes = [`${alias}.criado_por_id = :escUsuario`];
  const params: Record<string, unknown> = { escUsuario: escopo.usuarioId };
  if (escopo.setorId) {
    partes.push(`${alias}.setor_id = :escSetor`);
    params.escSetor = escopo.setorId;
    if (escopo.setorNome) {
      partes.push(`(${alias}.setor_id IS NULL AND lower(trim(${alias}.unidade_requisitante)) = :escSetorNome)`);
      params.escSetorNome = norm(escopo.setorNome);
    }
  }
  return { sql: `(${partes.join(' OR ')})`, params };
}

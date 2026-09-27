/**
 * PLANEJAMENTO — o que vem ANTES do processo (demanda → DFD), no modelo de
 * fluxo em dados (F1: "nada hardcoded"). Um por órgão; `orgao_id` nulo = o
 * padrão do sistema, semeado no boot. Funções PURAS (sem banco).
 *
 *  - quem APROVA a demanda (o pedido do setor) — padrão: quem tem "pode
 *    aprovar demandas" (a regra de sempre);
 *  - quem MONTA o DFD consolidado e abre o processo (a unidade de
 *    planejamento) — padrão: o papel funcional PLANEJAMENTO (e sempre o
 *    administrador do órgão / o login do órgão);
 *  - 2ª aprovação do DFD consolidado — DESLIGADA por padrão; quando ligada, o
 *    processo só abre depois dela, pelo aprovador configurado.
 */
import { PAPEIS_FASE_INTERNA, PapelFaseInterna, ROTULO_PAPEL } from './codigos';
import type { TipoAprovador } from './modelo-fluxo';

export interface RegraPessoa {
  tipo: TipoAprovador;
  valor: string | null;
}

export interface PlanejamentoFluxo {
  id: string | null;
  orgao_id: string | null;
  versao: number;
  /** Quem aprova a demanda (pedido) no módulo de demandas. */
  aprovador_demanda: RegraPessoa;
  /** Quem monta o DFD consolidado e abre o processo (unidade de planejamento). */
  responsavel_dfd: RegraPessoa;
  /** 2ª aprovação (do DFD consolidado). */
  aprovacao_dfd: { exigida: boolean; aprovador: RegraPessoa };
}

/** Padrão do sistema (a semente do boot). */
export function planejamentoSemente(): PlanejamentoFluxo {
  return {
    id: null,
    orgao_id: null,
    versao: 1,
    aprovador_demanda: { tipo: 'PERMISSAO', valor: null },
    responsavel_dfd: { tipo: 'PAPEL', valor: PapelFaseInterna.PLANEJAMENTO },
    aprovacao_dfd: { exigida: false, aprovador: { tipo: 'PERMISSAO', valor: null } },
  };
}

const TIPOS: TipoAprovador[] = ['PERMISSAO', 'PAPEL', 'SETOR', 'USUARIO'];

function regra(v: any, padrao: RegraPessoa): RegraPessoa {
  const tipo = String(v?.tipo ?? '').toUpperCase() as TipoAprovador;
  if (!TIPOS.includes(tipo)) return { ...padrao };
  return { tipo, valor: tipo === 'PERMISSAO' ? null : v?.valor ? String(v.valor) : null };
}

/** Linha gravada (jsonb) → planejamento completo (campo que faltar vem da semente). */
export function normalizarPlanejamento(linha: any): PlanejamentoFluxo {
  const s = planejamentoSemente();
  return {
    id: linha?.id ?? null,
    orgao_id: linha?.orgao_id ?? null,
    versao: Number(linha?.versao) || 1,
    aprovador_demanda: regra(linha?.aprovador_demanda, s.aprovador_demanda),
    responsavel_dfd: regra(linha?.responsavel_dfd, s.responsavel_dfd),
    aprovacao_dfd: {
      exigida: linha?.aprovacao_dfd?.exigida === true,
      aprovador: regra(linha?.aprovacao_dfd?.aprovador, s.aprovacao_dfd.aprovador),
    },
  };
}

export interface ErroPlanejamento {
  campo: string;
  mensagem: string;
}

/** Aplica o corpo do PUT (só os campos informados) e devolve o novo + erros de formato. */
export function aplicarEdicaoPlanejamento(atual: PlanejamentoFluxo, corpo: any): { planejamento: PlanejamentoFluxo; erros: ErroPlanejamento[] } {
  const erros: ErroPlanejamento[] = [];
  const novo: PlanejamentoFluxo = JSON.parse(JSON.stringify(atual));
  const lerRegra = (v: any, campo: string): RegraPessoa | null => {
    const tipo = String(v?.tipo ?? '').toUpperCase();
    if (!TIPOS.includes(tipo as TipoAprovador)) {
      erros.push({ campo, mensagem: `${campo}: use PERMISSAO, PAPEL, SETOR ou USUARIO.` });
      return null;
    }
    return { tipo: tipo as TipoAprovador, valor: tipo === 'PERMISSAO' ? null : v?.valor ? String(v.valor) : null };
  };
  if (corpo?.aprovador_demanda !== undefined) {
    const r = lerRegra(corpo.aprovador_demanda, 'aprovador_demanda');
    if (r) novo.aprovador_demanda = r;
  }
  if (corpo?.responsavel_dfd !== undefined) {
    const r = lerRegra(corpo.responsavel_dfd, 'responsavel_dfd');
    if (r) novo.responsavel_dfd = r;
  }
  if (corpo?.aprovacao_dfd !== undefined) {
    const a = corpo.aprovacao_dfd ?? {};
    if (a.exigida !== undefined) {
      if (typeof a.exigida !== 'boolean') erros.push({ campo: 'aprovacao_dfd.exigida', mensagem: 'A 2ª aprovação do DFD deve ser ligada ou desligada (verdadeiro/falso).' });
      else novo.aprovacao_dfd.exigida = a.exigida;
    }
    if (a.aprovador !== undefined) {
      const r = lerRegra(a.aprovador, 'aprovacao_dfd.aprovador');
      if (r) novo.aprovacao_dfd.aprovador = r;
    }
  }
  return { planejamento: novo, erros };
}

/**
 * Valida as regras contra o órgão: papel conhecido, setor do órgão, pessoa
 * ativa do órgão; PAPEL/SETOR/USUARIO exigem o valor.
 */
export function validarPlanejamento(
  p: PlanejamentoFluxo,
  opcoes: { papeis?: string[]; setores?: string[]; usuarios?: Array<{ id: string; ativo?: boolean }> },
): ErroPlanejamento[] {
  const erros: ErroPlanejamento[] = [];
  const papeis = opcoes.papeis ?? PAPEIS_FASE_INTERNA;
  const conferir = (r: RegraPessoa, campo: string, rotulo: string) => {
    if (r.tipo === 'PERMISSAO') return;
    if (!r.valor) erros.push({ campo, mensagem: `Informe ${rotulo} (papel, setor ou pessoa).` });
    else if (r.tipo === 'PAPEL' && !papeis.includes(r.valor)) erros.push({ campo, mensagem: `Papel inválido em ${rotulo}: ${r.valor}.` });
    else if (r.tipo === 'SETOR' && opcoes.setores && !opcoes.setores.includes(r.valor)) erros.push({ campo, mensagem: `O setor de ${rotulo} não pertence ao órgão.` });
    else if (r.tipo === 'USUARIO' && opcoes.usuarios && !opcoes.usuarios.some((u) => u.id === r.valor && u.ativo !== false)) {
      erros.push({ campo, mensagem: `${rotulo[0].toUpperCase()}${rotulo.slice(1)} deve ser usuário ativo do órgão.` });
    }
  };
  conferir(p.aprovador_demanda, 'aprovador_demanda', 'quem aprova a demanda');
  conferir(p.responsavel_dfd, 'responsavel_dfd', 'quem monta o DFD (unidade de planejamento)');
  conferir(p.aprovacao_dfd.aprovador, 'aprovacao_dfd.aprovador', 'quem aprova o DFD consolidado');
  return erros;
}

/** Quem consulta, para as regras (tudo do banco / do token — nunca do corpo). */
export interface PessoaDoOrgao {
  /** Login do próprio órgão (token ORGAO) ou admin da plataforma: pode tudo. */
  orgao: boolean;
  /** Usuário do órgão com role ADMIN (administrador do órgão). */
  admin_orgao: boolean;
  usuario_id: string | null;
  papeis: string[];
  setor_id: string | null;
  pode_aprovar_demandas: boolean;
}

/**
 * A pessoa atende a regra? PERMISSAO: para APROVAR = "pode aprovar demandas";
 * para MONTAR o DFD = só o administrador do órgão. O login do órgão (e o
 * admin da plataforma) sempre atende; o administrador do órgão sempre MONTA
 * o DFD (padrão pedido pelo dono: administrador + papel PLANEJAMENTO).
 */
export function pessoaAtende(r: RegraPessoa, p: PessoaDoOrgao, uso: 'APROVAR' | 'MONTAR'): boolean {
  if (p.orgao) return true;
  if (uso === 'MONTAR' && p.admin_orgao) return true;
  if (!p.usuario_id) return false;
  switch (r.tipo) {
    case 'PAPEL':
      return !!r.valor && p.papeis.includes(r.valor);
    case 'SETOR':
      return !!r.valor && p.setor_id === r.valor;
    case 'USUARIO':
      return !!r.valor && r.valor === p.usuario_id;
    default:
      return uso === 'APROVAR' ? p.pode_aprovar_demandas : false;
  }
}

/** Rótulo legível da regra. */
export function rotuloRegra(r: RegraPessoa, uso: 'APROVAR' | 'MONTAR', nomes: { setor?: string | null; usuario?: string | null } = {}): string {
  switch (r.tipo) {
    case 'PAPEL':
      return `Papel ${ROTULO_PAPEL[r.valor as PapelFaseInterna] ?? r.valor}${uso === 'MONTAR' ? ' (e o administrador do órgão)' : ''}`;
    case 'SETOR':
      return `Setor ${nomes.setor ?? r.valor}${uso === 'MONTAR' ? ' (e o administrador do órgão)' : ''}`;
    case 'USUARIO':
      return `${nomes.usuario ?? 'Pessoa designada'}${uso === 'MONTAR' ? ' (e o administrador do órgão)' : ''}`;
    default:
      return uso === 'APROVAR' ? 'Quem tem a permissão "aprovar demandas" (e o login do órgão)' : 'Só o administrador do órgão (e o login do órgão)';
  }
}

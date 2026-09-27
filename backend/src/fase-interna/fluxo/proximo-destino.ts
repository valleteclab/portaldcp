/**
 * POSSE ÚNICA + TAREFAS POR ETAPA (F3a — integração tramitação ↔ tarefas,
 * docs/licitacao/PLANO-FLUXO-TRAMITACAO.md §2, §6 e §10) — funções PURAS.
 *
 * "Nada hardcoded": nenhuma sequência de setores fica em código. O destino de
 * cada etapa vem do RESPONSÁVEL da etapa no modelo de fluxo do processo
 * (pessoa, setor ou papel — este resolvido pelos usuários do órgão que têm o
 * papel), e o próximo destino sai das etapas calculadas (dependências do
 * modelo) e de com quem o processo está (a posse da tramitação).
 *
 *  - `destinoDaEtapa`: setor/pessoa que recebe o processo para a etapa;
 *  - `etapaComODetentor`: a etapa é de quem está com o processo?
 *  - `responsavelNaPosse`: responsável da TAREFA da etapa considerando a posse
 *    (chegada ao setor/pessoa → as tarefas das etapas dele passam ao destino);
 *  - `sugerirEnvio`: para onde o processo vai a seguir (destinos agrupados, o
 *    principal, a finalidade e o despacho sugerido);
 *  - `acaoNaConclusao`: o que fazer quando as etapas do detentor terminam
 *    (modo SIMPLES → envio automático; POR_SETOR → tarefa "Enviar o processo").
 */
import { despachoPadrao } from '../tramitacao-regras';
import type { Responsavel } from '../tarefas/tarefa-regras';

export type ModoFluxo = 'SIMPLES' | 'POR_SETOR';

/** Setor e/ou pessoa que recebe o processo. */
export interface DestinoEtapa {
  setor_id: string | null;
  usuario_id: string | null;
  /** "Contabilidade", "Contabilidade · Maria", "Maria". */
  rotulo: string;
}

/** Com quem o processo está (tramitação vigente). */
export interface Posse {
  setor_id: string | null;
  usuario_id: string | null;
  /** Etapas para as quais o processo foi enviado (informadas no envio). */
  etapas?: string[] | null;
}

/** Responsável da etapa no modelo (o mesmo de `EtapaDoModelo.responsavel`). */
export interface ResponsavelDoModelo {
  papel: string | null;
  setor_id: string | null;
  usuario_id: string | null;
}

/** Usuário ativo do órgão (para resolver papel → setor/pessoa). */
export interface UsuarioParaDestino {
  id: string;
  nome: string;
  setor_id: string | null;
  setor_nome: string | null;
  papeis: string[];
}

export interface ContextoDestino {
  modo: ModoFluxo | string;
  /** Quem conduz o processo (agente designado ou quem criou). */
  condutor_id: string | null;
  /** Papel cujo responsável é o condutor, quando houver (o do agente de contratação). */
  papel_do_condutor?: string | null;
  usuarios: UsuarioParaDestino[];
  setores: Array<{ id: string; nome: string }>;
}

const rotuloDe = (setor: string | null | undefined, pessoa: string | null | undefined) =>
  [setor, pessoa].filter((x) => !!x && String(x).trim()).join(' · ') || 'destino';

function destinoDaPessoa(u: UsuarioParaDestino): DestinoEtapa {
  return { setor_id: u.setor_id, usuario_id: u.id, rotulo: rotuloDe(u.setor_nome, u.nome) };
}

function destinoDoSetor(id: string, ctx: ContextoDestino): DestinoEtapa | null {
  const s = ctx.setores.find((x) => x.id === id);
  return s ? { setor_id: s.id, usuario_id: null, rotulo: s.nome } : null;
}

/**
 * Papel → destino pelos usuários ATIVOS que têm o papel: uma pessoa só → o
 * setor dela (ou ela, sem lotação); várias, todas no mesmo setor → o setor;
 * espalhadas ou ninguém → não há destino único (null).
 */
export function destinoDoPapel(papel: string, ctx: ContextoDestino): DestinoEtapa | null {
  const com = ctx.usuarios.filter((u) => u.papeis.includes(papel));
  if (!com.length) return null;
  if (com.length === 1) {
    const u = com[0];
    return u.setor_id ? destinoDoSetor(u.setor_id, ctx) ?? destinoDaPessoa(u) : destinoDaPessoa(u);
  }
  const setores = new Set(com.map((u) => u.setor_id));
  if (setores.size === 1 && com[0].setor_id) return destinoDoSetor(com[0].setor_id, ctx);
  return null;
}

/**
 * DESTINO DA ETAPA (para onde o processo vai para esta etapa), pelo
 * responsável da etapa no modelo:
 *  - pessoa → ela (no setor dela); setor → o setor;
 *  - papel (modo POR_SETOR) → quem tem o papel (`destinoDoPapel`); o papel do
 *    condutor (agente) com condutor no processo → o condutor;
 *  - modo SIMPLES (uma pessoa conduz tudo — decisão 1 do dono): só a pessoa
 *    ou o setor DEFINIDOS no modelo tiram o processo do condutor; o resto
 *    (papel, nada definido) fica com o condutor.
 * null = sem destino definido (o envio é manual, escolhendo o destino).
 */
export function destinoDaEtapa(r: ResponsavelDoModelo | null | undefined, ctx: ContextoDestino): DestinoEtapa | null {
  const condutor = ctx.condutor_id ? ctx.usuarios.find((u) => u.id === ctx.condutor_id) ?? null : null;
  const simples = ctx.modo !== 'POR_SETOR';
  let d: DestinoEtapa | null = null;
  if (r?.usuario_id) {
    const u = ctx.usuarios.find((x) => x.id === r.usuario_id);
    d = u ? destinoDaPessoa(u) : null;
  } else if (r?.setor_id) {
    d = destinoDoSetor(r.setor_id, ctx);
  } else if (r?.papel && !simples) {
    d = condutor && ctx.papel_do_condutor && r.papel === ctx.papel_do_condutor ? destinoDaPessoa(condutor) : destinoDoPapel(r.papel, ctx);
  }
  if (!d && simples && condutor) d = destinoDaPessoa(condutor);
  return d;
}

/** Mesmo setor e mesma pessoa. */
export function mesmoDestino(a: Pick<Posse, 'setor_id' | 'usuario_id'> | null | undefined, b: Pick<Posse, 'setor_id' | 'usuario_id'> | null | undefined): boolean {
  if (!a || !b) return false;
  return (a.setor_id ?? null) === (b.setor_id ?? null) && (a.usuario_id ?? null) === (b.usuario_id ?? null);
}

/**
 * A etapa é de quem está com o processo? Foi enviada para ela (etapas do
 * envio), ou o destino da etapa é a pessoa ou o setor de quem tem a posse.
 */
export function etapaComODetentor(codigo: string, destino: DestinoEtapa | null | undefined, posse: Posse | null | undefined): boolean {
  if (!posse) return false;
  if (posse.etapas?.includes(codigo)) return true;
  if (!destino) return false;
  if (destino.usuario_id && posse.usuario_id && destino.usuario_id === posse.usuario_id) return true;
  return !!destino.setor_id && !!posse.setor_id && destino.setor_id === posse.setor_id;
}

/**
 * RESPONSÁVEL DA TAREFA com a posse (a "chegada"): as tarefas das etapas de
 * quem recebeu o processo passam a ser do destino do envio.
 *  - enviado a uma PESSOA → a tarefa vai para ela;
 *  - enviado a um SETOR → a tarefa vai para o setor (salvo etapa de uma
 *    pessoa certa desse setor, que continua com ela);
 *  - modo POR_SETOR com a posse exatamente no destino do modelo: nada muda (a
 *    tarefa já é de lá pelo modelo — papel/setor). No modo SIMPLES a tarefa é
 *    do condutor até o processo chegar a outro setor/pessoa.
 * A reatribuição manual (`atribuicao_manual`) é respeitada por quem aplica.
 */
export function responsavelNaPosse(
  base: Responsavel,
  codigo: string,
  destino: DestinoEtapa | null | undefined,
  posse: Posse | null | undefined,
  modo: ModoFluxo | string = 'POR_SETOR',
): Responsavel {
  if (!posse || (!posse.setor_id && !posse.usuario_id)) return base;
  if (!etapaComODetentor(codigo, destino, posse)) return base;
  if (modo === 'POR_SETOR' && destino && mesmoDestino(destino, posse)) return base;
  if (posse.usuario_id) return base.usuario_id === posse.usuario_id ? base : { usuario_id: posse.usuario_id, papel: null, setor_id: null };
  if (destino?.usuario_id && destino.setor_id && destino.setor_id === posse.setor_id) {
    return base.usuario_id === destino.usuario_id ? base : { usuario_id: destino.usuario_id, papel: null, setor_id: null };
  }
  if (base.setor_id && base.setor_id === posse.setor_id) return base;
  return { usuario_id: null, papel: null, setor_id: posse.setor_id };
}

// ---------------------------------------------------------------------------
// Sugestão de envio
// ---------------------------------------------------------------------------

/** O que a função precisa de cada passo calculado (`PassoCalculado`). */
export interface PassoParaEnvio {
  passo: string;
  titulo: string;
  situacao: string;
  pendencias: string[];
}

export interface DestinoSugerido extends DestinoEtapa {
  /** [codigo, nome] das etapas que esperam por este destino. */
  etapas: Array<[string, string]>;
  principal: boolean;
}

export interface SugestaoEnvio {
  destinos: DestinoSugerido[];
  /** Etapas de quem está com o processo que ainda estão por fazer. */
  pendentes_do_detentor: Array<[string, string]>;
  /** Etapas disponíveis sem setor/pessoa definidos no modelo (o envio é manual). */
  sem_destino: Array<[string, string]>;
  finalidade: string | null;
  despacho_sugerido: string;
}

/** A etapa está para ser feita agora (disponível, em andamento ou a revisar sem pendência)? */
export function passoParaFazer(p: Pick<PassoParaEnvio, 'situacao' | 'pendencias'>): boolean {
  if (p.situacao === 'DISPONIVEL' || p.situacao === 'EM_ANDAMENTO') return true;
  return p.situacao === 'A_REVISAR' && p.pendencias.length === 0;
}

/** Primeira letra minúscula no meio da frase — salvo sigla ("ETP", "TR"). */
const minuscula = (t: string) => (t && !/^[A-ZÀ-Ý]{2}/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);

/** "a pesquisa de preços e a reserva orçamentária" a partir dos nomes das etapas. */
export function finalidadeDasEtapas(nomes: string[]): string | null {
  const n = [...new Set(nomes.map((x) => minuscula(String(x ?? '').trim())).filter(Boolean))];
  if (!n.length) return null;
  return n.length === 1 ? n[0] : `${n.slice(0, -1).join(', ')} e ${n[n.length - 1]}`;
}

export const chaveDoDestino = (d: Pick<DestinoEtapa, 'setor_id' | 'usuario_id'>) => `${d.setor_id ?? ''}|${d.usuario_id ?? ''}`;

/**
 * PARA ONDE O PROCESSO VAI A SEGUIR: as etapas a fazer que NÃO são de quem
 * está com o processo, agrupadas pelo destino (na ordem das etapas — a do
 * modelo); a primeira é a principal. Sem posse, todas as etapas a fazer
 * contam. A finalidade e o despacho sugerido saem dos nomes das etapas.
 */
export function sugerirEnvio(passos: PassoParaEnvio[], destinos: Record<string, DestinoEtapa | null>, posse: Posse | null | undefined): SugestaoEnvio {
  const aFazer = passos.filter(passoParaFazer);
  const doDetentor = posse ? aFazer.filter((p) => etapaComODetentor(p.passo, destinos[p.passo], posse)) : [];
  const grupos = new Map<string, DestinoSugerido>();
  const semDestino: Array<[string, string]> = [];
  for (const p of aFazer) {
    if (doDetentor.includes(p)) continue;
    const d = destinos[p.passo];
    if (!d || (!d.setor_id && !d.usuario_id)) {
      semDestino.push([p.passo, p.titulo]);
      continue;
    }
    if (posse && mesmoDestino(d, posse)) continue;
    const k = chaveDoDestino(d);
    const g = grupos.get(k) ?? { ...d, etapas: [], principal: false };
    g.etapas.push([p.passo, p.titulo]);
    grupos.set(k, g);
  }
  const lista = [...grupos.values()];
  if (lista.length) lista[0].principal = true;
  const principal = lista[0] ?? null;
  const finalidade = principal ? finalidadeDasEtapas(principal.etapas.map(([, nome]) => nome)) : null;
  return {
    destinos: lista,
    pendentes_do_detentor: doDetentor.map((p) => [p.passo, p.titulo]),
    sem_destino: semDestino,
    finalidade,
    despacho_sugerido: principal ? despachoPadrao(principal.rotulo, finalidade) : '',
  };
}

// ---------------------------------------------------------------------------
// Conclusão das etapas de quem está com o processo
// ---------------------------------------------------------------------------

export type AcaoNaConclusao =
  | { tipo: 'NADA'; motivo: string }
  | { tipo: 'ENVIAR_AUTOMATICO'; destino: DestinoSugerido; finalidade: string | null; despacho: string }
  | { tipo: 'TAREFA_ENVIAR'; destino: DestinoSugerido; finalidade: string | null; despacho: string };

/**
 * QUANDO AS ETAPAS DE QUEM ESTÁ COM O PROCESSO TERMINAM: alguma etapa
 * concluiu nesta sincronização, o detentor não tem mais nada a fazer e há
 * etapa disponível de outro setor/pessoa →
 *  - modo SIMPLES: o sistema envia sozinho (decisão 1 do dono), com despacho padrão;
 *  - modo POR_SETOR: tarefa ao detentor "Enviar o processo para …" com o despacho sugerido.
 */
export function acaoNaConclusao(
  modo: ModoFluxo | string,
  concluidasAgora: string[],
  sugestao: SugestaoEnvio,
  posse: Posse | null | undefined,
): AcaoNaConclusao {
  if (!posse) return { tipo: 'NADA', motivo: 'Sem posse registrada.' };
  if (!concluidasAgora.length) return { tipo: 'NADA', motivo: 'Nenhuma etapa concluiu agora.' };
  if (sugestao.pendentes_do_detentor.length) return { tipo: 'NADA', motivo: 'Quem está com o processo ainda tem etapa a fazer.' };
  const destino = sugestao.destinos.find((d) => d.principal);
  if (!destino) return { tipo: 'NADA', motivo: 'Nenhuma etapa disponível em outro setor.' };
  const base = { destino, finalidade: sugestao.finalidade, despacho: sugestao.despacho_sugerido };
  return modo === 'POR_SETOR' ? { tipo: 'TAREFA_ENVIAR', ...base } : { tipo: 'ENVIAR_AUTOMATICO', ...base };
}

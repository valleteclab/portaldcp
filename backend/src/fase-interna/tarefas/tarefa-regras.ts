/**
 * TAREFAS DA FASE INTERNA (Entrega 2) — regras puras (sem banco).
 *
 *  - prazo em dias úteis pelo calendário do órgão (mesma função única de
 *    prazos da publicação: `fimDoPrazoEmDiasUteis`, art. 183);
 *  - responsável de cada passo (modo SIMPLES × POR_SETOR);
 *  - plano de sincronização: o que criar, concluir, cancelar e reatribuir a
 *    partir das etapas calculadas e das tarefas abertas — idempotente (rodar
 *    de novo com o resultado aplicado não gera nada).
 */
import { CalendarioDiasUteis, fimDoPrazoEmDiasUteis } from '../../common/prazos/dias-uteis';
import { ConfigFaseInternaEfetiva } from './configuracao-fase-interna';
import { DEFINICAO_PASSO, PapelFaseInterna, PassoCalculado, PassoFaseInterna } from './etapas-fase-interna';

/** Chave de idempotência da tarefa de um passo. */
export const chaveDoPasso = (passo: PassoFaseInterna | string) => `etapa:${passo}`;

/**
 * Vencimento da tarefa: N dias úteis contados do dia seguinte ao da criação
 * (art. 183 — exclui o dia do começo, inclui o do vencimento; 23:59:59 de
 * Brasília). Sem prazo (null/0) → null.
 */
export function prazoDaTarefa(inicio: Date, dias: number | null | undefined, cal?: CalendarioDiasUteis): Date | null {
  const n = Math.floor(Number(dias) || 0);
  if (n <= 0) return null;
  return fimDoPrazoEmDiasUteis(inicio, n, cal);
}

/** A tarefa aberta passou do prazo? */
export function tarefaAtrasada(t: { status: string; prazo: Date | string | null }, agora: Date = new Date()): boolean {
  return t.status === 'ABERTA' && !!t.prazo && new Date(t.prazo).getTime() < agora.getTime();
}

export interface Responsavel {
  usuario_id: string | null;
  papel: string | null;
  setor_id: string | null;
}

/**
 * Responsável pelo passo:
 *  - SIMPLES: o responsável do processo (agente de contratação/pregoeiro);
 *    sem ele, quem criou o processo; sem ninguém, a caixa do papel "Agente de
 *    contratação" do órgão.
 *  - POR_SETOR: o papel/setor configurado para o passo; se o papel é o de
 *    agente de contratação e o processo tem agente, vai direto para ele.
 */
export function responsavelDoPasso(
  passo: PassoFaseInterna,
  config: Pick<ConfigFaseInternaEfetiva, 'modo' | 'responsaveis'>,
  processo: { agente_id?: string | null; criador_usuario_id?: string | null },
): Responsavel {
  const agente = processo.agente_id || null;
  const criador = processo.criador_usuario_id || null;
  if (config.modo !== 'POR_SETOR') {
    const usuario = agente || criador;
    return usuario
      ? { usuario_id: usuario, papel: null, setor_id: null }
      : { usuario_id: null, papel: PapelFaseInterna.AGENTE_CONTRATACAO, setor_id: null };
  }
  const r = config.responsaveis[passo] ?? { papel: DEFINICAO_PASSO[passo].papel_padrao, setor_id: null };
  if (r.papel === PapelFaseInterna.AGENTE_CONTRATACAO && !r.setor_id && agente) {
    return { usuario_id: agente, papel: null, setor_id: null };
  }
  return { usuario_id: null, papel: r.papel ?? null, setor_id: r.setor_id ?? null };
}

export function mesmoResponsavel(a: Responsavel, b: Responsavel): boolean {
  return (a.usuario_id ?? null) === (b.usuario_id ?? null) && (a.papel ?? null) === (b.papel ?? null) && (a.setor_id ?? null) === (b.setor_id ?? null);
}

export interface TarefaAberta {
  id: string;
  chave: string | null;
  origem: string;
  atribuicao_manual: boolean;
  responsavel_usuario_id: string | null;
  responsavel_papel: string | null;
  responsavel_setor_id: string | null;
}

export interface PlanoSincronizacao {
  criar: Array<{ passo: PassoCalculado; responsavel: Responsavel }>;
  concluir: Array<{ tarefa_id: string; passo: PassoCalculado }>;
  cancelar: Array<{ tarefa_id: string; motivo: string }>;
  reatribuir: Array<{ tarefa_id: string; de: Responsavel; para: Responsavel }>;
}

/**
 * O que fazer para as tarefas refletirem as etapas:
 *  - passo disponível/em andamento sem tarefa aberta → criar;
 *  - passo concluído com tarefa aberta → concluir;
 *  - passo que deixou de existir (ex.: controle interno desativado) → cancelar;
 *  - fase interna encerrada sem a peça → cancelar; processo revogado/anulado
 *    → cancelar TODAS as abertas (inclusive diligências e achados);
 *  - responsável calculado mudou (config, agente do processo) e a tarefa não
 *    foi reatribuída à mão → reatribuir.
 * Passo AGUARDANDO com tarefa aberta (dependência voltou atrás): mantém.
 */
export function planejarSincronizacao(
  passos: PassoCalculado[],
  abertas: TarefaAberta[],
  responsavelDe: (passo: PassoFaseInterna) => Responsavel,
  opcoes: { processo_encerrado?: boolean } = {},
): PlanoSincronizacao {
  const plano: PlanoSincronizacao = { criar: [], concluir: [], cancelar: [], reatribuir: [] };
  const porChave = new Map(passos.map((p) => [chaveDoPasso(p.passo), p]));
  const comTarefa = new Set<string>();

  for (const t of abertas) {
    if (opcoes.processo_encerrado) {
      plano.cancelar.push({ tarefa_id: t.id, motivo: 'Processo revogado ou anulado.' });
      continue;
    }
    if (t.origem !== 'ETAPA' || !t.chave) continue;
    comTarefa.add(t.chave);
    const passo = porChave.get(t.chave);
    if (!passo) {
      plano.cancelar.push({ tarefa_id: t.id, motivo: 'A etapa deixou de se aplicar a este processo.' });
      continue;
    }
    switch (passo.situacao) {
      case 'CONCLUIDO':
        plano.concluir.push({ tarefa_id: t.id, passo });
        break;
      case 'NAO_REALIZADO':
        plano.cancelar.push({ tarefa_id: t.id, motivo: 'A fase interna foi encerrada sem esta peça.' });
        break;
      case 'CANCELADO':
        plano.cancelar.push({ tarefa_id: t.id, motivo: 'Processo revogado ou anulado.' });
        break;
      case 'DISPONIVEL':
      case 'EM_ANDAMENTO': {
        if (t.atribuicao_manual) break;
        const atual: Responsavel = { usuario_id: t.responsavel_usuario_id, papel: t.responsavel_papel, setor_id: t.responsavel_setor_id };
        const novo = responsavelDe(passo.passo);
        if (!mesmoResponsavel(atual, novo)) plano.reatribuir.push({ tarefa_id: t.id, de: atual, para: novo });
        break;
      }
      default:
        break; // AGUARDANDO: mantém
    }
  }
  if (opcoes.processo_encerrado) return plano;

  for (const p of passos) {
    if ((p.situacao === 'DISPONIVEL' || p.situacao === 'EM_ANDAMENTO') && !comTarefa.has(chaveDoPasso(p.passo))) {
      plano.criar.push({ passo: p, responsavel: responsavelDe(p.passo) });
    }
  }
  return plano;
}

/**
 * Quem cumpriu a peça (registrado na conclusão automática): o último
 * signatário (assinada), quem marcou "não se aplica", quem anexou/elaborou.
 */
export function quemCumpriu(doc: {
  status?: string | null;
  assinaturas?: Array<{ assinante_id?: string; assinante_nome?: string; data_assinatura?: string }> | null;
  aprovador_id?: string | null;
  aprovador_nome?: string | null;
  criado_por_id?: string | null;
  criado_por_nome?: string | null;
}): { id: string | null; nome: string | null } {
  if (doc.status === 'ASSINADO' && doc.assinaturas?.length) {
    const ultima = [...doc.assinaturas].sort((a, b) => String(a.data_assinatura ?? '').localeCompare(String(b.data_assinatura ?? ''))).pop()!;
    return { id: ultima.assinante_id || null, nome: ultima.assinante_nome || null };
  }
  if (doc.status === 'APROVADO' && (doc.aprovador_id || doc.aprovador_nome)) {
    return { id: doc.aprovador_id || null, nome: doc.aprovador_nome || null };
  }
  return { id: doc.criado_por_id || null, nome: doc.criado_por_nome || null };
}

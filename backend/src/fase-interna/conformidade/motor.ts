/**
 * MOTOR DE CONFORMIDADE — execução e idempotência (Entrega 4). Funções puras.
 *
 *  - `avaliarRegras(ctx)`: roda cada regra da lista (uma que falhe não derruba
 *    as outras — o erro fica registrado e os achados dela não mudam).
 *  - `planejarRevisao(existentes, avaliacoes)`: o que criar, atualizar,
 *    reabrir e resolver. REEXECUÇÃO IDEMPOTENTE: com as mesmas entradas, a
 *    segunda revisão não muda nada; o achado que deixa de ocorrer vira
 *    RESOLVIDO (com o motivo); o JUSTIFICADO continua justificado enquanto a
 *    mesma ocorrência persistir (mesma chave) e volta a ABERTO se virar
 *    bloqueio; o RESOLVIDO que reaparece é REABERTO.
 *  - `pendenciasDoPortao(portao, ...)`: o que o ato protegido recusa, com o
 *    que falta e onde (peça e folha).
 */
import { REGRAS } from './regras';
import type { AchadoCalculado, AvaliacaoRegra, ContextoConformidade, Evidencia, Portao, Regra, Severidade } from './tipos';

export type StatusAchado = 'ABERTO' | 'RESOLVIDO' | 'JUSTIFICADO';

export function avaliarRegras(ctx: ContextoConformidade, regras: Regra[] = REGRAS): AvaliacaoRegra[] {
  return regras.map((regra) => {
    try {
      const motivo = regra.aplicavel ? regra.aplicavel(ctx) : null;
      if (motivo) return { regra, aplicavel: false, motivo, achados: [] };
      const achados = regra.avaliar(ctx).map((a) => ({ ...a, regra: regra.codigo }));
      // Mesma ocorrência duas vezes (mesma chave): fica a primeira
      const unicos = achados.filter((a, i) => achados.findIndex((b) => b.chave === a.chave) === i);
      return { regra, aplicavel: true, motivo: null, achados: unicos };
    } catch (e: any) {
      return { regra, aplicavel: true, motivo: null, achados: [], erro: String(e?.message ?? e) };
    }
  });
}

export const todosOsAchados = (avaliacoes: AvaliacaoRegra[]): AchadoCalculado[] => avaliacoes.flatMap((a) => a.achados);

/** Achado gravado (o que o planejamento precisa). */
export interface AchadoExistente {
  id: string;
  regra: string;
  chave: string;
  status: StatusAchado;
  severidade: Severidade;
  titulo: string;
  mensagem: string;
  evidencias: Evidencia[];
  exige_justificativa: boolean;
}

export interface PlanoRevisao {
  criar: AchadoCalculado[];
  /** Mesma ocorrência com texto/evidências/severidade novos (status mantido). */
  atualizar: Array<{ id: string; achado: AchadoCalculado }>;
  /** Voltou a ocorrer (estava resolvido) ou virou bloqueio (estava justificado). */
  reabrir: Array<{ id: string; achado: AchadoCalculado; motivo: string }>;
  resolver: Array<{ id: string; motivo: string }>;
}

/** JSON com as chaves em ordem (o jsonb do Postgres devolve as chaves reordenadas: a comparação não pode depender disso). */
const canonico = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));

const mesmoConteudo = (e: AchadoExistente, a: AchadoCalculado) =>
  e.severidade === a.severidade &&
  e.titulo === a.titulo &&
  e.mensagem === a.mensagem &&
  !!e.exige_justificativa === !!a.exige_justificativa &&
  canonico(e.evidencias ?? []) === canonico(a.evidencias ?? []);

export function planejarRevisao(existentes: AchadoExistente[], avaliacoes: AvaliacaoRegra[]): PlanoRevisao {
  const plano: PlanoRevisao = { criar: [], atualizar: [], reabrir: [], resolver: [] };
  const porChave = new Map(existentes.map((e) => [`${e.regra}|${e.chave}`, e]));
  const vistos = new Set<string>();

  for (const av of avaliacoes) {
    if (av.erro) {
      // Regra que falhou: os achados dela ficam como estão (nada some por erro)
      for (const e of existentes) if (e.regra === av.regra.codigo) vistos.add(`${e.regra}|${e.chave}`);
      continue;
    }
    for (const a of av.achados) {
      const k = `${a.regra}|${a.chave}`;
      vistos.add(k);
      const e = porChave.get(k);
      if (!e) {
        plano.criar.push(a);
      } else if (e.status === 'RESOLVIDO') {
        plano.reabrir.push({ id: e.id, achado: a, motivo: 'Voltou a ocorrer na revisão.' });
      } else if (e.status === 'JUSTIFICADO' && a.severidade === 'BLOQUEIO') {
        plano.reabrir.push({ id: e.id, achado: a, motivo: 'Passou a bloqueio — bloqueio não se justifica: corrija a peça.' });
      } else if (!mesmoConteudo(e, a)) {
        plano.atualizar.push({ id: e.id, achado: a });
      }
    }
  }
  const motivoDaRegra = new Map(avaliacoes.filter((a) => !a.aplicavel).map((a) => [a.regra.codigo, a.motivo]));
  for (const e of existentes) {
    if (e.status === 'RESOLVIDO' || vistos.has(`${e.regra}|${e.chave}`)) continue;
    const naoSeAplica = motivoDaRegra.get(e.regra);
    plano.resolver.push({ id: e.id, motivo: naoSeAplica ? `A regra deixou de se aplicar: ${naoSeAplica}` : 'Deixou de ocorrer na revisão (peça corrigida).' });
  }
  return plano;
}

export const planoVazio = (p: PlanoRevisao) => !p.criar.length && !p.atualizar.length && !p.reabrir.length && !p.resolver.length;

// ---------------------------------------------------------------------------
// Portões
// ---------------------------------------------------------------------------

/**
 * Regras que cada portão aplica POR PADRÃO. A: limite; B: limite + art. 72
 * (I, II, IV) + parecer; C: tudo o que não é do portão B — mais as que
 * declaram `tambem_no_portao` (PARECER-01 segura o autorizar E o publicar).
 * Desde a F1 isto é só a SEMENTE das travas por ato (`fluxo/travas.ts`,
 * tabela `travas_ato_fluxo`): quem decide no ato são os dados.
 */
export function regrasDoPortao(portao: Portao, regras: Regra[] = REGRAS): Regra[] {
  const tambem = (r: Regra) => !!r.tambem_no_portao?.includes(portao);
  if (portao === 'A') return regras.filter((r) => r.etapa === 'PESQUISA' || tambem(r));
  if (portao === 'B') return regras.filter((r) => r.etapa === 'PESQUISA' || r.etapa === 'AUTORIZACAO' || tambem(r));
  return regras.filter((r) => r.portao !== 'B' || tambem(r));
}

const onde = (a: AchadoCalculado) => {
  const lugares = a.evidencias
    .filter((e) => e.titulo)
    .slice(0, 4)
    .map((e) => `${e.titulo}${e.folha != null ? `, fl. ${e.folha}` : ''}`);
  return lugares.length ? ` [${[...new Set(lugares)].join('; ')}]` : '';
};

/**
 * Nome do portão para quem lê: "Trava da lei (<ato que ela segura>)" (plano
 * §3 e decisão 4 do dono). Os códigos internos (A/B/C, `portao`) não mudam.
 */
export const ROTULO_PORTAO: Record<Portao, string> = {
  A: 'Trava da lei (concluir a pesquisa)',
  B: 'Trava da lei (autorizar)',
  C: 'Trava da lei (publicar)',
};

/**
 * PENDÊNCIAS DO PORTÃO — o que impede o ato protegido: achado BLOQUEIO aberto
 * das regras do portão e achado ATENÇÃO que exige justificativa e não foi
 * justificado. As regras garantidas pela pré-condição do próprio ato não se
 * repetem (mesma regra, uma mensagem só). `justificados`: "REGRA|chave" dos
 * achados JUSTIFICADOS gravados.
 */
export function pendenciasDoPortao(
  portao: Portao,
  avaliacoes: AvaliacaoRegra[],
  justificados: Set<string>,
  /**
   * F1: as regras do ATO e a severidade aplicada nele vêm dos DADOS (travas
   * por ato — `fluxo/travas.ts`). Sem isso, o padrão de sempre (`regrasDoPortao`).
   */
  doAto?: Array<{ regra: Regra; severidade: Severidade }>,
): string[] {
  const lista = doAto ?? regrasDoPortao(portao).map((regra) => ({ regra, severidade: regra.severidade }));
  const doPortao = new Map(lista.filter((x) => !x.regra.garantida_no_ato).map((x) => [x.regra.codigo, x]));
  const r: string[] = [];
  for (const av of avaliacoes) {
    const trava = doPortao.get(av.regra.codigo);
    if (!trava) continue;
    // Severidade do dado diferente da regra: vale a do dado neste ato
    const severidadeNoAto = (a: AchadoCalculado) => (trava.severidade !== trava.regra.severidade ? trava.severidade : a.severidade);
    for (const a of av.achados) {
      if (severidadeNoAto(a) === 'BLOQUEIO') r.push(`${ROTULO_PORTAO[portao]} — ${a.regra}: ${a.mensagem}${onde(a)}`);
      else if (a.exige_justificativa && !justificados.has(`${a.regra}|${a.chave}`)) {
        r.push(`${ROTULO_PORTAO[portao]} — ${a.regra} (justificativa obrigatória): ${a.mensagem}${onde(a)}`);
      }
    }
  }
  return r;
}

/** Achados que contam no botão "Publicar — resolva N bloqueios" (todas as regras). */
export function impedemPublicar(achados: Array<Pick<AchadoCalculado, 'severidade' | 'exige_justificativa'> & { status?: string }>): number {
  return achados.filter((a) => (a.status ?? 'ABERTO') === 'ABERTO' && (a.severidade === 'BLOQUEIO' || a.exige_justificativa)).length;
}

/**
 * CONTAGENS DA CONFORMIDADE — uma função só para o quadro do processo, o
 * checklist de pré-publicação e a tela da conformidade (homologação E6):
 * bloqueios e atenções ABERTOS (todas as regras e portões), o que impede
 * publicar e os bloqueios por portão.
 */
export function contagemDaConformidade(
  achados: Array<{ regra: string; severidade: Severidade; exige_justificativa?: boolean; status: string; portao?: string | null }>,
  regras: Regra[] = REGRAS,
): { bloqueios: number; atencoes: number; impedem_publicar: number; bloqueios_por_portao: Record<Portao, number> } {
  const abertos = achados.filter((a) => a.status === 'ABERTO');
  const porPortao: Record<Portao, number> = { A: 0, B: 0, C: 0 };
  for (const a of abertos.filter((x) => x.severidade === 'BLOQUEIO')) {
    const p = (a.portao ?? regras.find((r) => r.codigo === a.regra)?.portao ?? 'C') as Portao;
    porPortao[p] = (porPortao[p] ?? 0) + 1;
  }
  return {
    bloqueios: abertos.filter((a) => a.severidade === 'BLOQUEIO').length,
    atencoes: abertos.filter((a) => a.severidade === 'ATENCAO').length,
    impedem_publicar: impedemPublicar(abertos.map((a) => ({ severidade: a.severidade, exige_justificativa: !!a.exige_justificativa, status: a.status }))),
    bloqueios_por_portao: porPortao,
  };
}

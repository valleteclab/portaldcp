/**
 * TEMPO POR ETAPA (mockup aprovado 07/10/2026, aba do Andamento): quanto cada
 * etapa de UMA versão do fluxo leva de verdade, comparado com o prazo dela.
 *
 * Regras de conta (puras — o serviço só busca as linhas):
 * - a unidade é o dia útil (calendário do órgão), como o prazo da etapa;
 * - o tempo de uma etapa num processo é a soma das rodadas dela: cada
 *   devolução reabre a etapa e o tempo volta a contar;
 * - "no prazo" compara esse total com o prazo da etapa em dias úteis;
 * - entra no período o processo cuja etapa foi concluída (rodada final) a
 *   partir de `desde`.
 */

export interface PassoTempo {
  acao_id: string;
  nome: string;
  responsavel: string | null;
  prazo_dias_uteis: number | null;
}

export interface TarefaTempo {
  id: string;
  acao_id: string;
  instancia_id: string;
  /** ABERTA | CONCLUIDA | DEVOLVIDA | INDEFERIDA */
  status: string;
  created_at: Date;
  concluida_em: Date | null;
  concluida_por_nome: string | null;
  /** Dias úteis esperando o recebimento (só contratação; nulo = não se aplica). */
  espera_dias?: number | null;
}

export interface InstanciaTempo {
  id: string;
  status: string;
  processo_id: string | null;
  processo_numero: string | null;
  objeto: string | null;
}

export type ContaDiasUteis = (de: Date, ate: Date) => number;

interface EntradaTempo {
  passos: PassoTempo[];
  tarefas: TarefaTempo[];
  instancias: InstanciaTempo[];
  desde: Date;
  agora: Date;
  diasUteis: ContaDiasUteis;
}

/** Uma etapa num processo, já somadas as rodadas. */
interface Passagem {
  instancia_id: string;
  dias: number;
  rodadas: number;
  final: TarefaTempo;
  espera: number | null;
}

const umaCasa = (v: number) => Math.round(v * 10) / 10;
const media = (xs: number[]) => (xs.length ? umaCasa(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

function porInstancia(tarefas: TarefaTempo[]): Map<string, TarefaTempo[]> {
  const m = new Map<string, TarefaTempo[]>();
  for (const t of tarefas) m.set(t.instancia_id, [...(m.get(t.instancia_id) ?? []), t]);
  for (const lista of m.values()) lista.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
  return m;
}

/** Passagens concluídas de uma etapa no período (uma por processo). */
function passagens(acaoId: string, e: EntradaTempo, grupos = porInstancia(e.tarefas)): Passagem[] {
  const out: Passagem[] = [];
  for (const [instanciaId, lista] of grupos) {
    const daEtapa = lista.filter((t) => t.acao_id === acaoId);
    const final = [...daEtapa].reverse().find((t) => t.status === 'CONCLUIDA' && t.concluida_em);
    if (!final || final.concluida_em!.getTime() < e.desde.getTime()) continue;
    const rodadas = daEtapa.filter((t) => (t.status === 'CONCLUIDA' || t.status === 'DEVOLVIDA') && t.concluida_em && t.created_at.getTime() <= final.created_at.getTime());
    const dias = rodadas.reduce((s, t) => s + e.diasUteis(t.created_at, t.concluida_em!), 0);
    const esperas = rodadas.map((t) => t.espera_dias).filter((x): x is number => typeof x === 'number');
    out.push({ instancia_id: instanciaId, dias, rodadas: rodadas.length, final, espera: esperas.length ? esperas.reduce((s, x) => s + x, 0) : null });
  }
  return out;
}

/** Quantas vezes a etapa voltou (foi refeita) e quem a devolveu. */
function retornos(acaoId: string, e: EntradaTempo, grupos = porInstancia(e.tarefas)) {
  const nomes = new Map(e.passos.map((p) => [p.acao_id, p.nome]));
  const por = new Map<string, number>();
  let total = 0;
  for (const lista of grupos.values()) {
    for (let i = 1; i < lista.length; i++) {
      const t = lista[i];
      const antes = lista[i - 1];
      if (t.acao_id !== acaoId || antes.status !== 'DEVOLVIDA' || t.created_at.getTime() < e.desde.getTime()) continue;
      total++;
      const quem = nomes.get(antes.acao_id) ?? 'outra etapa';
      por.set(quem, (por.get(quem) ?? 0) + 1);
    }
  }
  return { total, por: [...por.entries()].map(([etapa, vezes]) => ({ etapa, vezes })).sort((a, b) => b.vezes - a.vezes) };
}

function noPrazo(dias: number, prazo: number | null): boolean | null {
  return prazo && prazo > 0 ? dias <= prazo : null;
}

export function resumoTempoEtapas(e: EntradaTempo) {
  const grupos = porInstancia(e.tarefas);
  const etapas = e.passos.map((p) => {
    const ps = passagens(p.acao_id, e, grupos);
    const avaliadas = ps.map((x) => noPrazo(x.dias, p.prazo_dias_uteis)).filter((x): x is boolean => x !== null);
    const abertas = e.tarefas.filter((t) => t.acao_id === p.acao_id && t.status === 'ABERTA');
    const atrasadas = p.prazo_dias_uteis ? abertas.filter((t) => e.diasUteis(t.created_at, e.agora) > p.prazo_dias_uteis!).length : 0;
    const r = retornos(p.acao_id, e, grupos);
    const devolveu = e.tarefas.filter((t) => t.acao_id === p.acao_id && t.status === 'DEVOLVIDA' && t.concluida_em && t.concluida_em.getTime() >= e.desde.getTime()).length;
    return {
      acao_id: p.acao_id,
      nome: p.nome,
      responsavel: p.responsavel,
      prazo_dias_uteis: p.prazo_dias_uteis,
      media_dias_uteis: media(ps.map((x) => x.dias)),
      concluidas: ps.length,
      no_prazo: avaliadas.filter(Boolean).length,
      avaliadas: avaliadas.length,
      abertas_agora: abertas.length,
      atrasadas_agora: atrasadas,
      refeita: r.total,
      refeita_por: r.por,
      devolveu,
    };
  });

  const concluidas = e.instancias.filter((i) => i.status === 'CONCLUIDA').filter((i) => {
    const fim = (grupos.get(i.id) ?? []).reduce((m, t) => Math.max(m, t.concluida_em?.getTime() ?? 0), 0);
    return fim >= e.desde.getTime();
  });
  const totais = concluidas.map((i) => e.passos.reduce((s, p) => s + (passagens(p.acao_id, { ...e, desde: new Date(0) }, new Map([[i.id, grupos.get(i.id) ?? []]]))[0]?.dias ?? 0), 0));
  const avaliadas = etapas.reduce((s, x) => s + x.avaliadas, 0);
  const pior = etapas
    .filter((x) => x.media_dias_uteis !== null && x.prazo_dias_uteis && x.media_dias_uteis > x.prazo_dias_uteis)
    .map((x) => ({ acao_id: x.acao_id, nome: x.nome, excesso_dias_uteis: umaCasa(x.media_dias_uteis! - x.prazo_dias_uteis!) }))
    .sort((a, b) => b.excesso_dias_uteis - a.excesso_dias_uteis)[0] ?? null;

  return {
    resumo: {
      processos_concluidos: concluidas.length,
      tempo_total_medio_dias_uteis: media(totais),
      prazo_somado_dias_uteis: e.passos.reduce((s, p) => s + (p.prazo_dias_uteis ?? 0), 0),
      pct_no_prazo: avaliadas ? Math.round((etapas.reduce((s, x) => s + x.no_prazo, 0) / avaliadas) * 100) : null,
      pior_etapa: pior,
    },
    etapas,
  };
}

/** Mês (AAAA-MM) no relógio de Brasília. */
function mesDe(d: Date): string {
  const local = new Date(d.getTime() - 3 * 3_600_000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function detalheTempoEtapa(e: EntradaTempo & { acao_id: string; mostrarPessoas: boolean }) {
  const passo = e.passos.find((p) => p.acao_id === e.acao_id);
  if (!passo) return null;
  const grupos = porInstancia(e.tarefas);
  const ps = passagens(e.acao_id, e, grupos);
  const instancias = new Map(e.instancias.map((i) => [i.id, i]));
  const prazo = passo.prazo_dias_uteis;

  const meses = new Map<string, number[]>();
  for (const x of ps) {
    const k = mesDe(x.final.concluida_em!);
    meses.set(k, [...(meses.get(k) ?? []), x.dias]);
  }
  const pessoas = new Map<string, number[]>();
  for (const x of ps) {
    const k = x.final.concluida_por_nome || 'Não identificado';
    pessoas.set(k, [...(pessoas.get(k) ?? []), x.dias]);
  }
  const comEspera = ps.filter((x) => x.espera !== null);
  const r = retornos(e.acao_id, e, grupos);
  const devolveu = e.tarefas.filter((t) => t.acao_id === e.acao_id && t.status === 'DEVOLVIDA' && t.concluida_em && t.concluida_em.getTime() >= e.desde.getTime()).length;
  const avaliadas = ps.map((x) => noPrazo(x.dias, prazo)).filter((x): x is boolean => x !== null);

  return {
    acao_id: passo.acao_id,
    nome: passo.nome,
    responsavel: passo.responsavel,
    prazo_dias_uteis: prazo,
    posicao: e.passos.indexOf(passo) + 1,
    total_etapas: e.passos.length,
    media_dias_uteis: media(ps.map((x) => x.dias)),
    concluidas: ps.length,
    no_prazo: avaliadas.filter(Boolean).length,
    avaliadas: avaliadas.length,
    mais_rapida: ps.length ? Math.min(...ps.map((x) => x.dias)) : null,
    mais_lenta: ps.length ? Math.max(...ps.map((x) => x.dias)) : null,
    devolveu,
    refeita: r.total,
    refeita_por: r.por,
    meses: [...meses.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, xs]) => ({ mes, media_dias_uteis: media(xs), concluidas: xs.length })),
    espera: comEspera.length
      ? { espera_dias_uteis: media(comEspera.map((x) => x.espera!)), analise_dias_uteis: media(comEspera.map((x) => Math.max(0, x.dias - x.espera!))), processos: comEspera.length }
      : null,
    por_pessoa: e.mostrarPessoas
      ? [...pessoas.entries()].map(([nome, xs]) => ({ nome, concluidas: xs.length, media_dias_uteis: media(xs) })).sort((a, b) => b.concluidas - a.concluidas)
      : null,
    processos: ps
      .map((x) => {
        const i = instancias.get(x.instancia_id);
        return {
          processo_id: i?.processo_id ?? null,
          numero: i?.processo_numero ?? null,
          objeto: i?.objeto ?? null,
          quem: e.mostrarPessoas ? x.final.concluida_por_nome : null,
          dias_uteis: x.dias,
          rodadas: x.rodadas,
          acima_do_prazo: prazo ? x.dias > prazo : false,
        };
      })
      .sort((a, b) => b.dias_uteis - a.dias_uteis)
      .slice(0, 30),
  };
}

/** Média de cada etapa no período — a fila mostra "Média da etapa" ao lado do tempo atual. */
export function mediasPorEtapa(e: EntradaTempo): Map<string, number | null> {
  const grupos = porInstancia(e.tarefas);
  return new Map(e.passos.map((p) => [p.acao_id, media(passagens(p.acao_id, e, grupos).map((x) => x.dias))]));
}

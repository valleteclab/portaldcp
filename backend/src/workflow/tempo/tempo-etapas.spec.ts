import { detalheTempoEtapa, mediasPorEtapa, resumoTempoEtapas, type InstanciaTempo, type PassoTempo, type TarefaTempo } from './tempo-etapas';

// Conta simples para o teste: cada dia de calendário vale 1 dia útil
const DIA = 86_400_000;
const d = (n: number) => new Date(Date.UTC(2026, 8, 1, 15) + n * DIA);
const diasUteis = (de: Date, ate: Date) => Math.round((ate.getTime() - de.getTime()) / DIA);

const passos: PassoTempo[] = [
  { acao_id: 'etp', nome: 'ETP', responsavel: 'Compras', prazo_dias_uteis: 3 },
  { acao_id: 'parecer', nome: 'Parecer jurídico', responsavel: 'Jurídico', prazo_dias_uteis: 5 },
];
let seq = 0;
const t = (acao: string, inst: string, status: string, de: number, ate: number | null, quem = 'Júlia', espera?: number): TarefaTempo => ({
  id: `t${++seq}`, acao_id: acao, instancia_id: inst, status, created_at: d(de), concluida_em: ate === null ? null : d(ate), concluida_por_nome: ate === null ? null : quem, espera_dias: espera,
});
const inst = (id: string, status = 'CONCLUIDA'): InstanciaTempo => ({ id, status, processo_id: `p-${id}`, processo_numero: `2026/000${id}`, objeto: `Objeto ${id}` });

describe('tempo por etapa', () => {
  const tarefas: TarefaTempo[] = [
    // processo 1: ETP 2 dias; parecer devolve no 2º dia, ETP refeito em 1 dia, parecer conclui em 4 → parecer = 2 + 4 = 6
    t('etp', '1', 'CONCLUIDA', 0, 2),
    t('parecer', '1', 'DEVOLVIDA', 2, 4, 'Marcos'),
    t('etp', '1', 'CONCLUIDA', 4, 5),
    t('parecer', '1', 'CONCLUIDA', 5, 9, 'Marcos'),
    // processo 2: ETP 5 dias (acima do prazo de 3); parecer 3 dias
    t('etp', '2', 'CONCLUIDA', 0, 5),
    t('parecer', '2', 'CONCLUIDA', 5, 8, 'Júlia'),
    // processo 3: ETP concluído ANTES do período, parecer aberto há 7 dias (atrasado)
    t('etp', '3', 'CONCLUIDA', -40, -38),
    t('parecer', '3', 'ABERTA', 3, null),
  ];
  const base = { passos, tarefas, instancias: [inst('1'), inst('2'), inst('3', 'EM_ANDAMENTO')], desde: d(-10), agora: d(10), diasUteis };

  it('média por etapa soma as rodadas e compara com o prazo', () => {
    const r = resumoTempoEtapas(base);
    const etp = r.etapas.find((x) => x.acao_id === 'etp')!;
    const parecer = r.etapas.find((x) => x.acao_id === 'parecer')!;
    // ETP: processo 1 = 2 + 1 (refeito) = 3; processo 2 = 5 → média 4; no prazo só o 1
    expect(etp).toMatchObject({ media_dias_uteis: 4, concluidas: 2, no_prazo: 1, avaliadas: 2, refeita: 1, refeita_por: [{ etapa: 'Parecer jurídico', vezes: 1 }] });
    // Parecer: processo 1 = 2 + 4 = 6 (acima de 5); processo 2 = 3 → média 4,5
    expect(parecer).toMatchObject({ media_dias_uteis: 4.5, concluidas: 2, no_prazo: 1, devolveu: 1, abertas_agora: 1, atrasadas_agora: 1 });
  });

  it('resumo: processos concluídos, tempo total, % no prazo e a etapa que mais passa do prazo', () => {
    const r = resumoTempoEtapas(base);
    expect(r.resumo).toEqual({
      processos_concluidos: 2,
      tempo_total_medio_dias_uteis: 8.5, // (3 + 6) e (5 + 3)
      prazo_somado_dias_uteis: 8,
      pct_no_prazo: 50,
      pior_etapa: { acao_id: 'etp', nome: 'ETP', excesso_dias_uteis: 1 },
    });
  });

  it('etapa concluída antes do período fica de fora', () => {
    const r = resumoTempoEtapas({ ...base, desde: d(6) });
    expect(r.etapas.find((x) => x.acao_id === 'etp')!.concluidas).toBe(0);
    expect(r.etapas.find((x) => x.acao_id === 'parecer')!.concluidas).toBe(2);
  });

  it('detalhe: mais rápida e mais lenta, processos do mais lento, pessoas só para quem pode ver', () => {
    const det = detalheTempoEtapa({ ...base, acao_id: 'parecer', mostrarPessoas: false })!;
    expect(det).toMatchObject({ posicao: 2, total_etapas: 2, mais_rapida: 3, mais_lenta: 6, devolveu: 1, por_pessoa: null });
    expect(det.processos.map((p) => [p.numero, p.dias_uteis, p.rodadas, p.acima_do_prazo, p.quem])).toEqual([
      ['2026/0001', 6, 2, true, null],
      ['2026/0002', 3, 1, false, null],
    ]);
    const comPessoas = detalheTempoEtapa({ ...base, acao_id: 'parecer', mostrarPessoas: true })!;
    expect(comPessoas.por_pessoa).toEqual([
      { nome: 'Marcos', concluidas: 1, media_dias_uteis: 6 },
      { nome: 'Júlia', concluidas: 1, media_dias_uteis: 3 },
    ]);
  });

  it('espera pelo recebimento (contratação) separa o tempo parado do tempo de análise', () => {
    const tarefasComEspera = [t('parecer', '9', 'CONCLUIDA', 0, 8, 'Júlia', 3)];
    const det = detalheTempoEtapa({ ...base, tarefas: tarefasComEspera, instancias: [inst('9')], acao_id: 'parecer', mostrarPessoas: false })!;
    expect(det.espera).toEqual({ espera_dias_uteis: 3, analise_dias_uteis: 5, processos: 1 });
    expect(detalheTempoEtapa({ ...base, acao_id: 'parecer', mostrarPessoas: false })!.espera).toBeNull();
  });

  it('meses agrupam pela conclusão no relógio de Brasília', () => {
    const det = detalheTempoEtapa({ ...base, acao_id: 'etp', mostrarPessoas: false })!;
    expect(det.meses).toEqual([{ mes: '2026-09', media_dias_uteis: 4, concluidas: 2 }]);
  });

  it('média por etapa para a fila', () => {
    expect(mediasPorEtapa(base)).toEqual(new Map([['etp', 4], ['parecer', 4.5]]));
  });

  it('etapa inexistente no fluxo → nulo', () => {
    expect(detalheTempoEtapa({ ...base, acao_id: 'outra', mostrarPessoas: true })).toBeNull();
  });
});

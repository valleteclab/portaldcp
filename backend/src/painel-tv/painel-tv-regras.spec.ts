import { criarCalendario } from '../common/prazos/calendario';
import { EtapaFaseInterna as E, etapaAtual, etapasDaFaseInterna } from '../fase-interna/tarefas/etapas-fase-interna';
import { modeloSemente } from '../fase-interna/fluxo/semente-fluxo';
import {
  CHAVES_PROIBIDAS,
  COLUNAS_PAINEL,
  CacheCurto,
  LimitadorPorChave,
  chavesProibidasEm,
  colunaDoProcesso,
  comQuemDoCartao,
  contarPorFaixa,
  corDoPrazo,
  diasNaEtapa,
  faixaDosDiasRestantes,
  hojeEmBrasilia,
  indicacaoProrrogacao,
  janelaValida,
  numeroDoProcesso,
  prazoEfetivoDaEtapa,
  processoAtrasado,
  removerChavesProibidas,
  resumirTexto,
  rotuloDaEtapa,
  selecionarContratosVencendo,
} from './painel-tv-regras';

const semFeriado = criarCalendario([]);

/** Instrução do art. 72 como devolve o getInstrucao (mesma forma do spec das etapas). */
function instrucaoDireta(status: Partial<Record<string, string>> = {}) {
  return ['DFD', 'PP', 'AA', 'ETP', 'TR', 'AR', 'PJ', 'DO', 'JC', 'DP', 'RAG', 'MC'].map((tipo) => ({
    tipo,
    titulo: tipo,
    obrigatorio: ['DFD', 'PP', 'AA'].includes(tipo),
    status: status[tipo] ?? 'PENDENTE',
  }));
}
const ok = (...tipos: string[]) => Object.fromEntries(tipos.map((t) => [t, 'OK']));
const direta = { contratacao_direta: true, fase: 'PLANEJAMENTO', situacao: 'ATIVA' };

describe('colunas do quadro — a partir das etapas da fase interna e das fases', () => {
  it('12 colunas, da demanda ao contrato, na ordem', () => {
    expect(COLUNAS_PAINEL.map((c) => c.chave)).toEqual([
      'DEMANDA', 'PLANEJAMENTO', 'PESQUISA', 'RESERVA', 'AUTORIZACAO', 'MINUTAS_PARECER',
      'PUBLICACAO', 'PROPOSTAS', 'JULGAMENTO', 'RECURSO', 'HOMOLOGACAO', 'CONTRATO',
    ]);
  });

  it('fase interna: a coluna vem da etapa atual de etapasDaFaseInterna (sem regra nova)', () => {
    const coluna = (status: Record<string, string>) => {
      const atual = etapaAtual(etapasDaFaseInterna(direta, instrucaoDireta(status), modeloSemente('DISPENSA')));
      return colunaDoProcesso({ fase: 'PLANEJAMENTO', situacao: 'ATIVA', etapa_atual: atual?.etapa ?? null });
    };
    expect(coluna({})).toBe('DEMANDA');
    expect(coluna(ok('DFD'))).toBe('PLANEJAMENTO'); // ETP e TR disponíveis
    expect(coluna(ok('DFD', 'ETP', 'AR', 'TR'))).toBe('PESQUISA');
    expect(coluna(ok('DFD', 'ETP', 'AR', 'TR', 'PP'))).toBe('RESERVA');
    expect(coluna(ok('DFD', 'ETP', 'AR', 'TR', 'PP', 'DO'))).toBe('AUTORIZACAO');
    expect(coluna(ok('DFD', 'ETP', 'AR', 'TR', 'PP', 'DO', 'AA', 'DP'))).toBe('MINUTAS_PARECER');
    expect(coluna(ok('DFD', 'ETP', 'AR', 'TR', 'PP', 'DO', 'AA', 'DP', 'RAG', 'MC', 'JC', 'PJ'))).toBe('PUBLICACAO');
  });

  it('cada etapa da Entrega 2 tem coluna; ETP e TR no Planejamento; controle interno com o parecer', () => {
    for (const etapa of Object.values(E)) {
      expect(colunaDoProcesso({ fase: 'PLANEJAMENTO', situacao: 'ATIVA', etapa_atual: etapa })).not.toBeNull();
    }
    expect(colunaDoProcesso({ fase: 'PLANEJAMENTO', situacao: 'ATIVA', etapa_atual: E.ETP_RISCOS })).toBe('PLANEJAMENTO');
    expect(colunaDoProcesso({ fase: 'TERMO_REFERENCIA', situacao: 'ATIVA', etapa_atual: E.TERMO_REFERENCIA })).toBe('PLANEJAMENTO');
    expect(colunaDoProcesso({ fase: 'ANALISE_JURIDICA', situacao: 'ATIVA', etapa_atual: E.CONTROLE_INTERNO })).toBe('MINUTAS_PARECER');
    expect(rotuloDaEtapa({ fase: 'PLANEJAMENTO', situacao: 'ATIVA', etapa_atual: E.TERMO_REFERENCIA })).toBe('Termo de referência');
  });

  it('fase interna sem etapa atual: a coluna da fase da máquina', () => {
    expect(colunaDoProcesso({ fase: 'PESQUISA_PRECOS', situacao: 'ATIVA', etapa_atual: null })).toBe('PESQUISA');
    expect(colunaDoProcesso({ fase: 'APROVACAO_INTERNA', situacao: 'ATIVA' })).toBe('AUTORIZACAO');
  });

  it('fase externa: publicação (aguardando PNCP), propostas, julgamento, recurso, homologação e contrato', () => {
    const c = (fase: string, extra: Record<string, unknown> = {}) => colunaDoProcesso({ fase, situacao: 'ATIVA', ...extra });
    expect(c('AGUARDANDO_DIVULGACAO')).toBe('PUBLICACAO');
    expect(rotuloDaEtapa({ fase: 'AGUARDANDO_DIVULGACAO', situacao: 'ATIVA' })).toBe('Aguardando PNCP');
    expect(c('PUBLICADO')).toBe('PROPOSTAS');
    expect(c('IMPUGNACAO')).toBe('PROPOSTAS');
    expect(c('ACOLHIMENTO_PROPOSTAS')).toBe('PROPOSTAS');
    expect(c('ANALISE_PROPOSTAS')).toBe('JULGAMENTO');
    expect(c('EM_DISPUTA')).toBe('JULGAMENTO');
    expect(c('JULGAMENTO')).toBe('JULGAMENTO');
    expect(c('HABILITACAO')).toBe('JULGAMENTO');
    expect(c('RECURSO')).toBe('RECURSO');
    expect(c('ADJUDICACAO')).toBe('HOMOLOGACAO');
    expect(c('HOMOLOGACAO')).toBe('HOMOLOGACAO');
    expect(c('HOMOLOGACAO', { data_homologacao: new Date() })).toBe('CONTRATO');
  });

  it('suspenso aparece; concluído, revogado, anulado, deserto e fracassado não', () => {
    expect(colunaDoProcesso({ fase: 'ACOLHIMENTO_PROPOSTAS', situacao: 'SUSPENSA' })).toBe('PROPOSTAS');
    for (const s of ['CONCLUIDA', 'REVOGADA', 'ANULADA', 'DESERTA', 'FRACASSADA']) {
      expect(colunaDoProcesso({ fase: 'HOMOLOGACAO', situacao: s, data_homologacao: new Date() })).toBeNull();
      expect(colunaDoProcesso({ fase: 'PLANEJAMENTO', situacao: s, etapa_atual: E.DEMANDA })).toBeNull();
    }
    // valores legados do enum de fase não entram
    expect(colunaDoProcesso({ fase: 'CONCLUIDO', situacao: 'ATIVA' })).toBeNull();
  });
});

describe('cor do prazo — dias úteis pelo calendário do órgão', () => {
  // sexta 25/09/2026, 10h de Brasília
  const agora = new Date('2026-09-25T13:00:00Z');
  const fimDoDia = (iso: string) => new Date(`${iso}T02:59:59.999Z`); // 23:59:59 de Brasília do dia anterior ao ISO

  it('vermelho quando venceu; amarelo em até 2 dias úteis; verde depois; sem prazo = null', () => {
    expect(corDoPrazo(fimDoDia('2026-09-25'), agora, semFeriado)).toBe('VERMELHO'); // venceu ontem (24/09)
    expect(corDoPrazo(fimDoDia('2026-09-26'), agora, semFeriado)).toBe('AMARELO'); // vence hoje
    expect(corDoPrazo(fimDoDia('2026-09-29'), agora, semFeriado)).toBe('AMARELO'); // segunda 28 = 1 dia útil
    expect(corDoPrazo(fimDoDia('2026-09-30'), agora, semFeriado)).toBe('AMARELO'); // terça 29 = 2 dias úteis
    expect(corDoPrazo(fimDoDia('2026-10-01'), agora, semFeriado)).toBe('VERDE'); // quarta 30 = 3 dias úteis
    expect(corDoPrazo(null, agora, semFeriado)).toBeNull();
  });

  it('o fim de semana e o feriado do órgão não contam', () => {
    const comFeriado = criarCalendario([{ descricao: 'Aniversário da cidade', data: '2026-09-29' }]);
    // quarta 30/09: sem feriado são 3 dias úteis (verde); com o feriado na terça, 2 (amarelo)
    expect(corDoPrazo(fimDoDia('2026-10-01'), agora, semFeriado)).toBe('VERDE');
    expect(corDoPrazo(fimDoDia('2026-10-01'), agora, comFeriado)).toBe('AMARELO');
  });

  it('prazo efetivo: o da tarefa; sem tarefa, o configurado contado da entrada na etapa', () => {
    const tarefa = new Date('2026-10-10T02:59:59.999Z');
    expect(prazoEfetivoDaEtapa({ prazo_tarefa: tarefa, entrada_etapa: agora, prazo_dias_uteis: 3 }, semFeriado)).toEqual(tarefa);
    // entrou na sexta 25/09; 3 dias úteis → quarta 30/09 23:59:59 de Brasília
    expect(prazoEfetivoDaEtapa({ entrada_etapa: agora, prazo_dias_uteis: 3 }, semFeriado)!.toISOString()).toBe('2026-10-01T02:59:59.999Z');
    expect(prazoEfetivoDaEtapa({ entrada_etapa: agora, prazo_dias_uteis: null }, semFeriado)).toBeNull();
  });

  it('atrasado: tarefa aberta vencida OU etapa parada além do prazo configurado', () => {
    const ontem = new Date('2026-09-24T12:00:00Z');
    const amanha = new Date('2026-09-26T12:00:00Z');
    expect(processoAtrasado({ prazos_tarefas_abertas: [ontem], prazo_etapa: null }, agora)).toBe(true);
    expect(processoAtrasado({ prazos_tarefas_abertas: [amanha, null], prazo_etapa: ontem }, agora)).toBe(true);
    expect(processoAtrasado({ prazos_tarefas_abertas: [amanha, null], prazo_etapa: amanha }, agora)).toBe(false);
    expect(processoAtrasado({ prazos_tarefas_abertas: [], prazo_etapa: null }, agora)).toBe(false);
  });
});

describe('dias na etapa (calendário de Brasília)', () => {
  it('conta os dias corridos desde a entrada, pelo dia de Brasília', () => {
    const agora = new Date('2026-09-26T02:00:00Z'); // 25/09 23h em Brasília
    expect(diasNaEtapa(new Date('2026-09-25T04:00:00Z'), agora)).toBe(0); // 25/09 01h
    expect(diasNaEtapa(new Date('2026-09-25T02:00:00Z'), agora)).toBe(1); // 24/09 23h
    expect(diasNaEtapa(new Date('2026-09-15T15:00:00Z'), agora)).toBe(10);
    expect(diasNaEtapa(null, agora)).toBeNull();
  });
});

describe('contratos vencendo', () => {
  const hoje = '2026-09-26';
  const c = (fim: string | null, status = 'VIGENTE') => ({ status, data_vigencia_fim: fim });

  it('só vigentes, de hoje até a janela, do mais próximo ao mais distante', () => {
    const lista = [c('2026-12-20'), c('2026-10-06'), c('2026-09-25'), c('2027-03-01'), c('2026-10-01', 'ENCERRADO'), c(null), c('2026-09-26')];
    const sel = selecionarContratosVencendo(lista, hoje, 90);
    expect(sel.map((x) => [x.data_vigencia_fim, x.dias_restantes])).toEqual([
      ['2026-09-26', 0],
      ['2026-10-06', 10],
      ['2026-12-20', 85],
    ]);
    expect(selecionarContratosVencendo(lista, hoje, 30).map((x) => x.dias_restantes)).toEqual([0, 10]);
    expect(selecionarContratosVencendo(lista, hoje, 120).map((x) => x.dias_restantes)).toEqual([0, 10, 85]);
    expect(selecionarContratosVencendo([c('2027-01-20')], hoje, 120).map((x) => x.dias_restantes)).toEqual([116]);
  });

  it('cor dos dias restantes: vermelho ≤ 30, amarelo ≤ 60, neutro até 90', () => {
    expect(faixaDosDiasRestantes(0)).toBe('VERMELHO');
    expect(faixaDosDiasRestantes(30)).toBe('VERMELHO');
    expect(faixaDosDiasRestantes(31)).toBe('AMARELO');
    expect(faixaDosDiasRestantes(60)).toBe('AMARELO');
    expect(faixaDosDiasRestantes(61)).toBe('NEUTRO');
    expect(contarPorFaixa([5, 30, 45, 80, 100])).toEqual({ ate_30: 2, ate_60: 3, ate_90: 4 });
  });

  it('janelas aceitas: 30, 60, 90 e 120', () => {
    expect([30, 60, 90, 120].every(janelaValida)).toBe(true);
    expect([0, 45, 180, '90x', null].some(janelaValida)).toBe(false);
  });

  it('serviço contínuo pode prorrogar (art. 107) até 10 anos; sem a informação, nada', () => {
    expect(indicacaoProrrogacao({ modalidade_execucao: 'CONTINUADO', data_vigencia_inicio: '2024-01-01', data_vigencia_fim: '2026-12-31' })).toBe('CONTINUO_ART107');
    expect(indicacaoProrrogacao({ modalidade_execucao: 'CONTINUADO', data_vigencia_inicio: '2016-10-01', data_vigencia_fim: '2026-10-01' })).toBe('NAO_PRORROGAVEL');
    expect(indicacaoProrrogacao({ modalidade_execucao: 'ITEM_QUANTIDADE', data_vigencia_inicio: '2026-01-01', data_vigencia_fim: '2026-12-31' })).toBeNull();
  });

  it('"hoje" é o dia de Brasília (23h de 25/09 em Brasília ainda é 25/09)', () => {
    expect(hojeEmBrasilia(new Date('2026-09-26T02:00:00Z'))).toBe('2026-09-25');
    expect(hojeEmBrasilia(new Date('2026-09-26T03:00:00Z'))).toBe('2026-09-26');
  });
});

describe('campos sigilosos — nunca saem no JSON da TV', () => {
  it('encontra e remove as chaves proibidas em qualquer nível', () => {
    const sujo = {
      orgao: { nome: 'Câmara', email: 'x@y.gov.br' },
      colunas: [{ processos: [{ numero: 'PA 1/2026', valor_total_estimado: 123456.78, propostas: [{ valor_proposta: 1 }] }] }],
      contratos: [{ numero: '001/2026', valor: 1000, responsavel: { nome: 'Fulano', cpf: '12345678901', telefone: '71999999999' } }],
      rodape: { achados: [{ texto: 'marca sem justificativa' }], parecer: 'favorável' },
    };
    expect(chavesProibidasEm(sujo).sort()).toEqual(
      [
        '$.orgao.email',
        '$.colunas[0].processos[0].valor_total_estimado',
        '$.colunas[0].processos[0].propostas',
        '$.colunas[0].processos[0].propostas[0].valor_proposta',
        '$.contratos[0].responsavel.cpf',
        '$.contratos[0].responsavel.telefone',
        '$.rodape.achados',
        '$.rodape.achados[0].texto',
        '$.rodape.parecer',
      ].sort(),
    );
    const limpo = removerChavesProibidas(sujo);
    expect(chavesProibidasEm(limpo)).toEqual([]);
    // o que é permitido continua: valor do contrato vigente (público) e nome do servidor (uso interno)
    expect(limpo.contratos[0]).toEqual({ numero: '001/2026', valor: 1000, responsavel: { nome: 'Fulano' } });
    expect(limpo.colunas[0].processos[0]).toEqual({ numero: 'PA 1/2026' });
  });

  it('a lista cobre valor estimado, propostas/lances/licitantes, pareceres/achados e dados pessoais', () => {
    for (const k of ['valor_total_estimado', 'propostas', 'lances', 'licitantes', 'parecer', 'achados', 'evidencias', 'cpf', 'email', 'telefone', 'token_hash']) {
      expect(CHAVES_PROIBIDAS).toContain(k);
    }
  });
});

describe('texto e número', () => {
  it('objeto resumido (~70 caracteres) cortado na palavra', () => {
    const longo = 'Contratação de empresa especializada para prestação de serviços de manutenção preventiva e corretiva';
    const r = resumirTexto(longo, 70);
    expect(r.length).toBeLessThanOrEqual(70);
    expect(r.endsWith('…')).toBe(true);
    expect(longo.startsWith(r.slice(0, -1))).toBe(true);
    expect(resumirTexto('  Curto   demais ')).toBe('Curto demais');
  });

  it('PA e número da modalidade', () => {
    expect(numeroDoProcesso({ numero_processo: '139/2025', numero_edital: '029/2025', modalidade: 'DISPENSA_ELETRONICA' })).toBe('PA 139/2025 · Dispensa 029/2025');
    expect(numeroDoProcesso({ numero_processo: '140/2025', numero_edital: null, modalidade: 'PREGAO_ELETRONICO' })).toBe('PA 140/2025');
  });
});

describe('limite por token e cache curto', () => {
  it('limita N requisições por janela e libera na janela seguinte', () => {
    const l = new LimitadorPorChave(3, 60_000);
    const t0 = 1_000_000;
    expect([1, 2, 3, 4].map(() => l.permitir('tv-a', t0))).toEqual([true, true, true, false]);
    expect(l.permitir('tv-b', t0)).toBe(true); // outro token não é afetado
    expect(l.permitir('tv-a', t0 + 60_000)).toBe(true);
  });

  it('não acumula estado: descarta janelas vencidas quando o mapa enche', () => {
    const l = new LimitadorPorChave(5, 1_000, 10);
    for (let i = 0; i < 10; i++) l.permitir(`k${i}`, 0);
    expect(l.tamanho).toBe(10);
    l.permitir('nova', 5_000);
    expect(l.tamanho).toBe(1);
    for (let i = 0; i < 50; i++) l.permitir(`ataque${i}`, 5_000);
    expect(l.tamanho).toBeLessThanOrEqual(10);
  });

  it('cache devolve dentro do prazo e expira depois', () => {
    const c = new CacheCurto<number>(45_000);
    c.guardar('orgao', 1, 0);
    expect(c.obter('orgao', 44_999)).toBe(1);
    expect(c.obter('orgao', 45_000)).toBeUndefined();
    c.guardar('orgao', 2, 0, 0); // ttl 0 = sem cache
    expect(c.obter('orgao', 1)).toBeUndefined();
  });
});

describe('com quem está (F3): pela tramitação; sem ela, pela tarefa; sem tarefa, o agente', () => {
  const agora = new Date('2026-09-28T15:00:00Z');

  it('posse da tramitação: setor e/ou pessoa, desde, prazo e atraso — nunca o despacho', () => {
    const c = comQuemDoCartao(
      { setor: { nome: 'Contabilidade' }, usuario: { nome: 'Kátia' }, desde: '2026-09-20T12:00:00.000Z', prazo: '2026-09-23T23:59:59.000Z', vencido: true },
      { responsavel_usuario_id: 'x', responsavel_nome: 'Outro' },
      'Agente',
      agora,
    );
    expect(c).toEqual({ nome: 'Contabilidade · Kátia', tipo: 'PESSOA', desde: '2026-09-20T12:00:00.000Z', prazo: '2026-09-23T23:59:59.000Z', atrasado: true });
    expect(chavesProibidasEm(c)).toEqual([]);
    expect(comQuemDoCartao({ setor: { nome: 'Jurídico' }, usuario: null, desde: null, prazo: null, vencido: false }, null, null, agora)?.tipo).toBe('SETOR');
  });

  it('sem tramitação: o responsável da tarefa aberta (com o prazo dela); sem tarefa: o agente', () => {
    expect(
      comQuemDoCartao(null, { responsavel_usuario_id: 'u', responsavel_nome: 'Pedro', created_at: '2026-09-25T10:00:00Z', prazo: '2026-09-27T10:00:00Z' }, 'Agente', agora),
    ).toEqual({ nome: 'Pedro', tipo: 'PESSOA', desde: '2026-09-25T10:00:00.000Z', prazo: '2026-09-27T10:00:00.000Z', atrasado: true });
    expect(comQuemDoCartao(null, { rotulo_papel: 'Compras', setor_nome: 'Compras' }, null, agora)).toMatchObject({ nome: 'Compras · setor Compras', tipo: 'SETOR', atrasado: false });
    expect(comQuemDoCartao(null, null, 'Ana', agora)).toEqual({ nome: 'Ana', tipo: 'AGENTE', desde: null, prazo: null, atrasado: false });
    expect(comQuemDoCartao(null, null, null, agora)).toBeNull();
  });
});

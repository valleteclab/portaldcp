import { fimDoPrazoEmDiasUteis, limiteDiasUteisAntes } from '../common/prazos/dias-uteis';
import { AtoRecorrido, StatusRecurso } from './entities/recurso-administrativo.entity';
import {
  atrasosDoRecurso,
  desfechoDaFaseRecursal,
  estadoJanela,
  evolucaoPorPrazo,
  minutosDaJanela,
  motivoMinutosInvalidos,
  motivoNaoApresentaContrarrazoes,
  motivoNaoApresentaRazoes,
  motivoNaoRegistraIntencao,
  planejarInvalidacoes,
  prazoAutoridade,
  prazoContrarrazoes,
  prazoRazoes,
  prazoReconsideracao,
  situacaoDoAlvoProvido,
  situacaoRestaurada,
} from './regras-recursos';

/** Instante em Brasília (UTC-3) → Date. */
const br = (iso: string) => new Date(`${iso}-03:00`);
const fimDoDia = (dia: string) => br(`${dia}T23:59:59.999`);

describe('Dias úteis (art. 183 — função única)', () => {
  it('exclui o dia do começo e vence no fim do N-ésimo dia útil (Brasília)', () => {
    // sexta 25/09/2026 → seg 28 (1), ter 29 (2), qua 30 (3)
    expect(fimDoPrazoEmDiasUteis(br('2026-09-25T10:00:00'), 3)).toEqual(fimDoDia('2026-09-30'));
  });

  it('começo em sábado/domingo: conta a partir do 1º dia útil seguinte', () => {
    expect(fimDoPrazoEmDiasUteis(br('2026-09-26T09:00:00'), 1)).toEqual(fimDoDia('2026-09-28'));
    expect(fimDoPrazoEmDiasUteis(br('2026-09-27T23:00:00'), 3)).toEqual(fimDoDia('2026-09-30'));
  });

  it('usa o dia de Brasília, não o UTC (23h de Brasília já é o dia seguinte em UTC)', () => {
    // qui 24/09 23:30 (Brasília) = sex 25/09 02:30 UTC → começo é quinta
    expect(fimDoPrazoEmDiasUteis(br('2026-09-24T23:30:00'), 1)).toEqual(fimDoDia('2026-09-25'));
  });

  it('10 dias úteis atravessam dois fins de semana e o feriado de 12/10 (E7a)', () => {
    // seg 28/09 → 29,30,01,02 (4) · 05..09 (9) · 12 é feriado nacional · 13 (10)
    expect(fimDoPrazoEmDiasUteis(br('2026-09-28T08:00:00'), 10)).toEqual(fimDoDia('2026-10-13'));
  });

  it('prazo "antes" (art. 164) continua igual pela mesma função', () => {
    expect(limiteDiasUteisAntes(br('2026-10-19T09:00:00'), 3)).toEqual(fimDoDia('2026-10-14'));
  });
});

describe('Prazos do recurso (art. 165; IN 73 art. 40)', () => {
  const admissao = br('2026-09-25T15:00:00'); // sexta

  it('razões em 3 dias úteis da admissão; contrarrazões em 3 dias úteis do FIM das razões', () => {
    const razoes = prazoRazoes(admissao);
    expect(razoes).toEqual(fimDoDia('2026-09-30'));
    expect(prazoContrarrazoes(razoes)).toEqual(fimDoDia('2026-10-05'));
  });

  it('reconsideração em 3 dias úteis; autoridade em 10 dias úteis do encaminhamento', () => {
    expect(prazoReconsideracao(fimDoDia('2026-10-05'))).toEqual(fimDoDia('2026-10-08'));
    // 09 (1) · 12 feriado · 13..16 (5) · 19..23 (10)
    expect(prazoAutoridade(br('2026-10-08T10:00:00'))).toEqual(fimDoDia('2026-10-23'));
  });

  it('parâmetro do órgão muda os dias das partes', () => {
    expect(prazoRazoes(admissao, 5)).toEqual(fimDoDia('2026-10-02'));
  });
});

describe('Janela de intenção (art. 165 §1º I; IN 73 art. 40)', () => {
  it('duração: nunca menos de 10 min; vale o maior entre parâmetro e pedido', () => {
    expect(minutosDaJanela(5)).toBe(10);
    expect(minutosDaJanela(15)).toBe(15);
    expect(minutosDaJanela(10, 30)).toBe(30);
    expect(motivoMinutosInvalidos(5, 10)).toMatch(/mínimo 10 minutos/);
    expect(motivoMinutosInvalidos(20, 10)).toBeNull();
  });

  it('aberta até fecha_em; depois disso a intenção preclui (409)', () => {
    const j = { aberta_em: br('2026-09-25T10:00:00'), fecha_em: br('2026-09-25T10:10:00') };
    expect(estadoJanela(j, br('2026-09-25T10:09:59'))).toBe('ABERTA');
    expect(motivoNaoRegistraIntencao(j, br('2026-09-25T10:09:59'))).toBeNull();
    expect(estadoJanela(j, br('2026-09-25T10:10:00'))).toBe('ENCERRADA');
    expect(motivoNaoRegistraIntencao(j, br('2026-09-25T10:10:01'))).toMatch(/preclusão/);
    expect(motivoNaoRegistraIntencao(null)).toMatch(/Não há janela/);
    expect(estadoJanela({ ...j, superada_em: br('2026-09-25T10:05:00') }, br('2026-09-25T10:06:00'))).toBe('SUPERADA');
  });
});

describe('Máquina do recurso: partes e prazos', () => {
  const base = {
    fornecedor_id: 'A',
    prazo_razoes: br('2026-09-30T23:59:59.999'),
    prazo_contrarrazoes: br('2026-10-05T23:59:59.999'),
  };

  it('razões: só o recorrente (403), só aguardando razões e no prazo (409)', () => {
    const r = { ...base, status: StatusRecurso.AGUARDANDO_RAZOES };
    expect(motivoNaoApresentaRazoes(r, 'B', br('2026-09-29T10:00:00'))?.status).toBe(403);
    expect(motivoNaoApresentaRazoes(r, 'A', br('2026-09-29T10:00:00'))).toBeNull();
    expect(motivoNaoApresentaRazoes(r, 'A', br('2026-10-01T00:00:01'))).toMatchObject({ status: 409 });
    expect(motivoNaoApresentaRazoes({ ...r, status: StatusRecurso.CONTRARRAZOES }, 'A')).toMatchObject({ status: 409 });
  });

  it('contrarrazões: nunca o recorrente (403); só na fase e no prazo (409)', () => {
    const r = { ...base, status: StatusRecurso.CONTRARRAZOES };
    expect(motivoNaoApresentaContrarrazoes(r, 'A', br('2026-10-02T10:00:00'))?.status).toBe(403);
    expect(motivoNaoApresentaContrarrazoes(r, 'B', br('2026-10-02T10:00:00'))).toBeNull();
    expect(motivoNaoApresentaContrarrazoes(r, 'B', br('2026-10-06T00:00:01'))).toMatchObject({ status: 409 });
    expect(motivoNaoApresentaContrarrazoes({ ...r, status: StatusRecurso.AGUARDANDO_RAZOES }, 'B')).toMatchObject({ status: 409 });
  });

  it('decurso: razões não apresentadas → NAO_CONHECIDO; contrarrazões encerradas → EM_ANALISE com prazo do agente', () => {
    expect(evolucaoPorPrazo({ ...base, status: StatusRecurso.AGUARDANDO_RAZOES }, br('2026-09-30T20:00:00'))).toBeNull();
    expect(evolucaoPorPrazo({ ...base, status: StatusRecurso.AGUARDANDO_RAZOES }, br('2026-10-01T08:00:00'))).toMatchObject({
      status: StatusRecurso.NAO_CONHECIDO,
    });
    const ev = evolucaoPorPrazo({ ...base, status: StatusRecurso.CONTRARRAZOES }, br('2026-10-06T08:00:00'));
    expect(ev).toMatchObject({ status: StatusRecurso.EM_ANALISE });
    expect(ev!.prazo_reconsideracao).toEqual(fimDoDia('2026-10-08'));
    expect(evolucaoPorPrazo({ ...base, status: StatusRecurso.EM_ANALISE }, br('2026-12-01T08:00:00'))).toBeNull();
  });

  it('prazos do agente/autoridade vencidos são SINALIZADOS (nunca decididos sozinhos)', () => {
    const agora = br('2026-10-09T08:00:00');
    expect(atrasosDoRecurso({ ...base, status: StatusRecurso.EM_ANALISE, prazo_reconsideracao: fimDoDia('2026-10-08') }, agora)).toEqual({
      reconsideracaoAtrasada: true,
      autoridadeAtrasada: false,
    });
    expect(
      atrasosDoRecurso({ ...base, status: StatusRecurso.AGUARDANDO_AUTORIDADE, prazo_decisao_autoridade: fimDoDia('2026-10-22') }, agora),
    ).toEqual({ reconsideracaoAtrasada: false, autoridadeAtrasada: false });
  });
});

describe('Efeito do provimento (art. 165 §3º)', () => {
  it('inabilitação reformada: HABILITADO onde a proposta estava aceita; nas demais, de volta ao ranking', () => {
    expect(situacaoRestaurada(AtoRecorrido.INABILITACAO, true)).toBe('HABILITADO');
    expect(situacaoRestaurada(AtoRecorrido.INABILITACAO, false)).toBe('CLASSIFICADO');
    expect(situacaoRestaurada(AtoRecorrido.RECUSA_PROPOSTA, true)).toBe('CLASSIFICADO');
    expect(situacaoRestaurada(AtoRecorrido.DESCLASSIFICACAO, false)).toBe('CLASSIFICADO');
  });

  it('ato de terceiro provido: habilitação → INABILITADO; aceitação → DESCLASSIFICADO', () => {
    expect(situacaoDoAlvoProvido(AtoRecorrido.HABILITACAO_TERCEIRO)).toBe('INABILITADO');
    expect(situacaoDoAlvoProvido(AtoRecorrido.ACEITACAO_TERCEIRO)).toBe('DESCLASSIFICADO');
    expect(situacaoDoAlvoProvido(AtoRecorrido.OUTRO)).toBeNull();
  });

  it('invalida só os atos de quem ficou ABAIXO do recorrente restaurado', () => {
    const ranking = [
      { fornecedorId: 'X', situacao: 'CLASSIFICADO', excluido: false },
      { fornecedorId: 'A', situacao: 'HABILITADO', excluido: false }, // recorrente restaurado
      { fornecedorId: 'D', situacao: 'HABILITADO', excluido: false }, // promovido no lugar de A
      { fornecedorId: 'B', situacao: 'CONVOCADO_ACEITACAO', excluido: false },
      { fornecedorId: 'C', situacao: 'CLASSIFICADO', excluido: false },
      { fornecedorId: 'E', situacao: 'RECUSADO', excluido: true },
    ];
    expect(planejarInvalidacoes(ranking, 'A')).toEqual([
      { fornecedorId: 'D', de: 'HABILITADO' },
      { fornecedorId: 'B', de: 'CONVOCADO_ACEITACAO' },
    ]);
    expect(planejarInvalidacoes(ranking, 'Z')).toEqual([]);
  });

  it('desfecho da fase recursal pela máquina de estados', () => {
    expect(desfechoDaFaseRecursal({ unidadesSemAceite: 0, resultadoAlterado: false })).toBe('DECIDIR_RECURSOS');
    expect(desfechoDaFaseRecursal({ unidadesSemAceite: 0, resultadoAlterado: true })).toBe('RETORNAR_HABILITACAO');
    expect(desfechoDaFaseRecursal({ unidadesSemAceite: 2, resultadoAlterado: true })).toBe('RETORNAR_JULGAMENTO');
  });
});

import { FaseLicitacao, Licitacao, ModalidadeLicitacao, SituacaoLicitacao } from '../entities/licitacao.entity';
import { CALENDARIO_NACIONAL } from '../../common/prazos/calendario';
import { reajustarCronogramaNaDivulgacao } from '../../publicacao/regras-publicacao';
import { definicaoDoAto } from './definicoes';
import { aplicarNoEstado, avaliarAtosDisponiveis, pendenciasDoAto } from './maquina';
import { AtoLicitacao, ConsultasTransicao, ContextoTransicao } from './transicoes.tipos';

/**
 * Divulgação oficial confirmada pelo PNCP (arts. 54, 55 e 174; art. 75 §3º;
 * IN SEGES 67/2021) + regras de atos da dispensa (arts. 11, 15, 22 da IN 67)
 * + art. 71 §§1º a 3º. Núcleo puro — os e2e cobrem banco, fila e telas.
 */

const F = FaseLicitacao;
const A = AtoLicitacao;
const M = ModalidadeLicitacao;

function lic(p: Partial<Licitacao>): Licitacao {
  return { id: 'l1', numero_processo: 'P-1', modalidade: M.DISPENSA_ELETRONICA, fase: F.PLANEJAMENTO, situacao: SituacaoLicitacao.ATIVA, observacoes: null, ...p } as unknown as Licitacao;
}

function consultas(p: Partial<Record<keyof ConsultasTransicao, any>> = {}): ConsultasTransicao {
  return {
    propostasRecebidas: async () => p.propostasRecebidas ?? 0,
    propostasEnviadas: async () => p.propostasEnviadas ?? p.propostasRecebidas ?? 0,
    propostasAptasDisputa: async () => 1,
    contratosAssinados: async () => 0,
    contratosOuAtasGerados: async () => 0,
    itens: async () => p.itens ?? [{ status: 'ATIVO', fornecedor_vencedor_id: null }],
    instrucaoProcesso: async () => ({ pode_divulgar: true, pendentes: [] }),
    avisoContratacaoVigente: async () => p.avisoContratacaoVigente ?? null,
    interessadosExtincao: async () => p.interessadosExtincao ?? 0,
    intencaoExtincaoAberta: async () => null,
  };
}

function ctx(l: Licitacao, ato: AtoLicitacao, extra: Partial<ContextoTransicao> = {}): ContextoTransicao {
  return { licitacao: l, ato, agora: new Date('2026-09-28T15:00:00Z'), consultas: consultas(), dados: {}, ...extra };
}

describe('Reconferência do cronograma pela divulgação CONFIRMADA (art. 55; art. 75 §3º)', () => {
  // segunda 28/09/2026: 3 dias úteis → quinta 01/10 (art. 183: exclui o dia do começo)
  const divulgacao = new Date('2026-09-28T15:00:00Z');

  test('dispensa confirmada a tempo: nada muda (o início efetivo é a própria data da divulgação)', () => {
    const r = reajustarCronogramaNaDivulgacao(
      { modalidade: M.DISPENSA_ELETRONICA },
      { data_inicio_acolhimento: '2026-09-28T14:00:00Z', data_fim_acolhimento: '2026-10-02T15:00:00Z', data_abertura_sessao: '2026-10-02T15:00:00Z', data_limite_impugnacao: '2026-10-02T15:00:00Z' },
      divulgacao,
      { cal: CALENDARIO_NACIONAL },
    );
    expect(r.ajustes).toEqual([]);
    expect(r.descricao).toBeNull();
    expect(r.cronograma.data_fim_acolhimento).toEqual(new Date('2026-10-02T15:00:00Z'));
  });

  test('dispensa confirmada tarde: fim do recebimento (e abertura/limite que o acompanhavam) vai ao 3º dia útil, mesmo horário', () => {
    const r = reajustarCronogramaNaDivulgacao(
      { modalidade: M.DISPENSA_ELETRONICA },
      { data_inicio_acolhimento: '2026-09-23T12:00:00Z', data_fim_acolhimento: '2026-09-28T18:00:00Z', data_abertura_sessao: '2026-09-28T18:00:00Z', data_limite_impugnacao: '2026-09-28T18:00:00Z' },
      divulgacao,
      { cal: CALENDARIO_NACIONAL },
    );
    // 18:00Z = 15:00 em Brasília; 3º dia útil depois de 28/09 = 01/10
    expect(r.cronograma.data_fim_acolhimento).toEqual(new Date('2026-10-01T18:00:00Z'));
    expect(r.cronograma.data_abertura_sessao).toEqual(new Date('2026-10-01T18:00:00Z'));
    expect(r.cronograma.data_limite_impugnacao).toEqual(new Date('2026-10-01T18:00:00Z'));
    expect(r.cronograma.data_inicio_acolhimento).toEqual(new Date('2026-09-23T12:00:00Z'));
    expect(r.descricao).toMatch(/3 dias úteis/);
    expect(r.minimo).toEqual(new Date('2026-10-01T03:00:00Z'));
  });

  test('pregão (8 dias úteis): abertura adiada e o limite de impugnação do edital cai (vale o art. 164 da nova abertura)', () => {
    const r = reajustarCronogramaNaDivulgacao(
      { modalidade: M.PREGAO_ELETRONICO, tipo_contratacao: 'COMPRA', criterio_julgamento: 'MENOR_PRECO' },
      { data_inicio_acolhimento: '2026-09-20T12:00:00Z', data_fim_acolhimento: '2026-10-05T13:00:00Z', data_abertura_sessao: '2026-10-05T13:00:00Z', data_limite_impugnacao: '2026-09-30T20:00:00Z' },
      divulgacao,
      { cal: CALENDARIO_NACIONAL },
    );
    // 8 dias úteis depois de 28/09 → 08/10 (sem feriado nacional no período)
    expect(r.cronograma.data_abertura_sessao).toEqual(new Date('2026-10-08T13:00:00Z'));
    expect(r.cronograma.data_fim_acolhimento).toEqual(new Date('2026-10-08T13:00:00Z'));
    expect(r.cronograma.data_limite_impugnacao).toBeNull();
  });

  test('sem prazo mínimo (credenciamento): nada é ajustado', () => {
    const r = reajustarCronogramaNaDivulgacao(
      { modalidade: M.CREDENCIAMENTO },
      { data_inicio_acolhimento: '2026-09-01T12:00:00Z', data_fim_acolhimento: '2027-09-01T12:00:00Z' },
      divulgacao,
      { cal: CALENDARIO_NACIONAL },
    );
    expect(r.ajustes).toEqual([]);
  });
});

describe('Atos da divulgação e da dispensa', () => {
  test('PUBLICAR leva a AGUARDANDO_DIVULGACAO (seleção externa: PUBLICADO) e exige o aviso gerado na dispensa', async () => {
    const def = definicaoDoAto(M.DISPENSA_ELETRONICA, A.PUBLICAR)!;
    const l = lic({ fase: F.APROVACAO_INTERNA });
    const p = await pendenciasDoAto(def, { ...ctx(l, A.PUBLICAR), somenteAvaliacao: true });
    expect(p.join(' ')).toMatch(/Gere o aviso de contratação direta/);
    const ok = await pendenciasDoAto(def, { ...ctx(l, A.PUBLICAR, { consultas: consultas({ avisoContratacaoVigente: { documento_id: 'd', versao: 1 } }) }), somenteAvaliacao: true });
    expect(ok).toEqual([]);
    aplicarNoEstado(def, l, ctx(l, A.PUBLICAR, { dados: { data_fim_acolhimento: '2026-10-05T15:00:00Z' } }));
    expect(l.fase).toBe(F.AGUARDANDO_DIVULGACAO);
    const ext = lic({ fase: F.APROVACAO_INTERNA, selecao_externa: true } as any);
    aplicarNoEstado(def, ext, ctx(ext, A.PUBLICAR));
    expect(ext.fase).toBe(F.PUBLICADO);
  });

  test('CONFIRMAR_DIVULGACAO grava a divulgação oficial e estende o cronograma, anotando o ajuste nos dados do ato', () => {
    const def = definicaoDoAto(M.DISPENSA_ELETRONICA, A.CONFIRMAR_DIVULGACAO)!;
    expect(def.somenteSistema).toBe(true);
    const l = lic({ fase: F.AGUARDANDO_DIVULGACAO, data_inicio_acolhimento: new Date('2026-09-23T12:00:00Z'), data_fim_acolhimento: new Date('2026-09-28T18:00:00Z') } as any);
    const c = ctx(l, A.CONFIRMAR_DIVULGACAO, { dados: { data_divulgacao: '2026-09-28T15:00:00Z', meio: 'PNCP', referencia: '123-1-000001/2026' } });
    aplicarNoEstado(def, l, c);
    expect(l.fase).toBe(F.PUBLICADO);
    expect(l.data_divulgacao_oficial).toEqual(new Date('2026-09-28T15:00:00Z'));
    expect(l.meio_divulgacao_oficial).toBe('PNCP');
    expect(l.data_fim_acolhimento).toEqual(new Date('2026-10-01T18:00:00Z'));
    expect(c.dados!.cronograma_ajustado.length).toBeGreaterThan(0);
    expect(c.dados!.ajuste_descricao).toMatch(/Divulgação oficial confirmada/);
  });

  test('antes da divulgação confirmada não há julgar, deserta nem fracassada', async () => {
    const l = lic({ fase: F.AGUARDANDO_DIVULGACAO, data_fim_acolhimento: new Date('2026-09-01T12:00:00Z') } as any);
    const atos = await avaliarAtosDisponiveis(l, (d) => ctx(l, d.ato));
    const nomes = atos.map((a) => a.ato);
    expect(nomes).not.toContain(A.JULGAR_DISPENSA);
    expect(nomes).not.toContain(A.DECLARAR_DESERTA);
    expect(nomes).not.toContain(A.DECLARAR_FRACASSADA);
    expect(nomes).not.toContain(A.CONFIRMAR_DIVULGACAO); // só o sistema
  });

  test('julgar a dispensa: só depois do fim do prazo e da etapa de lances encerrada (IN 67 arts. 11 e 15)', async () => {
    const def = definicaoDoAto(M.DISPENSA_ELETRONICA, A.JULGAR_DISPENSA)!;
    const base = { fase: F.ANALISE_PROPOSTAS, data_fim_acolhimento: new Date('2026-09-25T12:00:00Z') } as any;
    const semJanela = await pendenciasDoAto(def, ctx(lic(base), A.JULGAR_DISPENSA, { consultas: consultas({ propostasRecebidas: 2 }) }));
    expect(semJanela.join(' ')).toMatch(/Abra a fase de lances/);
    const aberta = await pendenciasDoAto(def, ctx(lic({ ...base, dispensa_lances_fim: new Date('2026-09-28T20:00:00Z') }), A.JULGAR_DISPENSA, { consultas: consultas({ propostasRecebidas: 2 }) }));
    expect(aberta.join(' ')).toMatch(/art\. 15/);
    const encerrada = await pendenciasDoAto(def, ctx(lic({ ...base, dispensa_lances_fim: new Date('2026-09-28T10:00:00Z') }), A.JULGAR_DISPENSA, { consultas: consultas({ propostasRecebidas: 2 }) }));
    expect(encerrada).toEqual([]);
    const semPropostas = await pendenciasDoAto(def, ctx(lic(base), A.JULGAR_DISPENSA));
    expect(semPropostas.join(' ')).toMatch(/declare a dispensa deserta/);
  });

  test('deserta: só depois do prazo e sem proposta; fracassada: com interessados e nenhuma aproveitável; providência do art. 22 da IN 67', async () => {
    const deserta = definicaoDoAto(M.DISPENSA_ELETRONICA, A.DECLARAR_DESERTA)!;
    const fracassada = definicaoDoAto(M.DISPENSA_ELETRONICA, A.DECLARAR_FRACASSADA)!;
    const noPrazo = lic({ fase: F.ACOLHIMENTO_PROPOSTAS, data_fim_acolhimento: new Date('2026-10-05T12:00:00Z') } as any);
    expect((await pendenciasDoAto(deserta, { ...ctx(noPrazo, A.DECLARAR_DESERTA), somenteAvaliacao: true })).join(' ')).toMatch(/depois do fim do prazo/);
    const vencido = lic({ fase: F.ANALISE_PROPOSTAS, data_fim_acolhimento: new Date('2026-09-25T12:00:00Z') } as any);
    expect(await pendenciasDoAto(deserta, { ...ctx(vencido, A.DECLARAR_DESERTA), somenteAvaliacao: true })).toEqual([]);
    // executar exige a providência (deserta: só I ou III)
    const semProv = await pendenciasDoAto(deserta, ctx(vencido, A.DECLARAR_DESERTA, { motivo: 'Nenhuma proposta', dados: { providencia_art22: 'PRAZO_ADEQUACAO' } }));
    expect(semProv.join(' ')).toMatch(/art\. 22 da IN SEGES 67\/2021/);
    expect(await pendenciasDoAto(deserta, ctx(vencido, A.DECLARAR_DESERTA, { motivo: 'Nenhuma proposta', dados: { providencia_art22: 'REPUBLICAR' } }))).toEqual([]);
    // fracassada: sem proposta → é deserta; com todas desclassificadas → ok
    expect((await pendenciasDoAto(fracassada, { ...ctx(vencido, A.DECLARAR_FRACASSADA), somenteAvaliacao: true })).join(' ')).toMatch(/DESERTA/);
    const desclass = consultas({ propostasEnviadas: 2, propostasRecebidas: 0 });
    expect(await pendenciasDoAto(fracassada, { ...ctx(vencido, A.DECLARAR_FRACASSADA, { consultas: desclass }), somenteAvaliacao: true })).toEqual([]);
    expect(await pendenciasDoAto(fracassada, ctx(vencido, A.DECLARAR_FRACASSADA, { consultas: desclass, motivo: 'Todas desclassificadas', dados: { providencia_art22: 'PRAZO_ADEQUACAO' } }))).toEqual([]);
    // válidas ainda não julgadas → julgue antes
    const validas = consultas({ propostasEnviadas: 2, propostasRecebidas: 2 });
    expect((await pendenciasDoAto(fracassada, { ...ctx(vencido, A.DECLARAR_FRACASSADA, { consultas: validas }), somenteAvaliacao: true })).join(' ')).toMatch(/julgue as propostas/);
  });

  test('revogar sem interessados: justificativa do fato superveniente e registro automático de que não havia a quem ouvir (art. 71 §§2º e 3º)', async () => {
    const def = definicaoDoAto(M.PREGAO_ELETRONICO, A.REVOGAR)!;
    const l = lic({ modalidade: M.PREGAO_ELETRONICO, fase: F.PUBLICADO });
    expect((await pendenciasDoAto(def, ctx(l, A.REVOGAR, { motivo: 'curto' }))).join(' ')).toMatch(/fato superveniente/);
    const anular = definicaoDoAto(M.PREGAO_ELETRONICO, A.ANULAR)!;
    expect((await pendenciasDoAto(anular, ctx(l, A.ANULAR, { motivo: 'curto' }))).join(' ')).toMatch(/vício insanável/);
    const c = ctx(l, A.REVOGAR, { motivo: 'Fato superveniente: extinção da demanda pela secretaria' });
    for (const e of def.efeitosPersistidos ?? []) await e(l, { query: async () => [] } as any, c);
    expect(c.dados!.manifestacao_previa).toMatch(/Não havia interessados a ouvir/);
    expect(l.observacoes).toMatch(/art\. 71, §3º/);
  });
});

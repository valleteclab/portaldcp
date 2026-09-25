import {
  StatusConvocacaoMpe,
  analisarEmpateFicto,
  beneficioDaUnidade,
  convocacaoExpirada,
  enquadramentoMpe,
  limiteDoIntervalo,
  motivoDeclaracaoIncompativel,
  motivoExclusivoAcimaDoLimite,
  motivoForaDaExclusividade,
  motivoNaoExerce,
  motivoPercentualCotaInvalido,
  noIntervaloDoEmpateFicto,
  normalizarBeneficioMpeLicitacao,
  percentualEmpateFicto,
  prazoConvocacaoAte,
  quantidadeDaCota,
  tempoSuspenso,
  estadoDoPrazoMpe,
  pendenciasPublicacaoArt48,
} from './regras-me-epp';
import { exclusividadeMpeArt48 } from '../../licitacoes/transicoes/definicoes';
import { conferirSorteio } from '../sorteio';

const AMPLA = { empateFicto: true, somenteMpe: false };
const sorteio = { licitacaoId: 'lic-1', unidadeId: 'item-1', atoEm: new Date('2026-09-24T12:00:00Z') };
const rk = (...o: Array<[string, number]>) => o.map(([f, v], i) => ({ fornecedorId: f, valor: v, posicao: i + 1 }));

describe('ME/EPP — enquadramento (porte do cadastro + declaração)', () => {
  test('ME, EPP e MEI com declaração são enquadradas; sem declaração ou porte demais, não', () => {
    expect(enquadramentoMpe('ME', true)).toBe(true);
    expect(enquadramentoMpe('EPP', true)).toBe(true);
    expect(enquadramentoMpe('MEI', true)).toBe(true);
    expect(enquadramentoMpe('ME', false)).toBe(false);
    expect(enquadramentoMpe('MEDIO', true)).toBe(false);
    expect(enquadramentoMpe(null, true)).toBe(false);
  });

  test('declaração incompatível com o cadastro é recusada', () => {
    expect(motivoDeclaracaoIncompativel('GRANDE', true)).toMatch(/incompatível/);
    expect(motivoDeclaracaoIncompativel(null, true)).toMatch(/sem porte/);
    expect(motivoDeclaracaoIncompativel('GRANDE', false)).toBeNull();
    expect(motivoDeclaracaoIncompativel('EPP', true)).toBeNull();
  });
});

describe('ME/EPP — intervalo do empate ficto (art. 44)', () => {
  test('5% no pregão e 10% nas demais (parâmetros do órgão)', () => {
    expect(percentualEmpateFicto('PREGAO_ELETRONICO', { percentual_empate_ficto_pregao: 5, percentual_empate_ficto_demais: 10 })).toBe(5);
    expect(percentualEmpateFicto('CONCORRENCIA', { percentual_empate_ficto_pregao: 5, percentual_empate_ficto_demais: 10 })).toBe(10);
    expect(percentualEmpateFicto('PREGAO_ELETRONICO', null)).toBe(5);
    expect(percentualEmpateFicto('CONCORRENCIA', undefined)).toBe(10);
  });

  test('limite em centavos inteiros (inclusive), igual à melhor também é empate', () => {
    expect(noIntervaloDoEmpateFicto(105, 100, 5)).toBe(true);
    expect(noIntervaloDoEmpateFicto(105.01, 100, 5)).toBe(false);
    expect(noIntervaloDoEmpateFicto(100, 100, 5)).toBe(true);
    expect(noIntervaloDoEmpateFicto(110, 100, 10)).toBe(true);
    expect(noIntervaloDoEmpateFicto(110.01, 100, 10)).toBe(false);
    // 0,1 + 0,2: sem erro de ponto flutuante
    expect(noIntervaloDoEmpateFicto(945.0, 900, 5)).toBe(true);
    expect(limiteDoIntervalo(900, 5)).toBe(945);
  });
});

describe('ME/EPP — análise do empate ficto da unidade (arts. 44/45)', () => {
  const base = { percentual: 5, direcao: 'MENOR' as const, modalidade: 'PREGAO_ELETRONICO', beneficio: AMPLA, sorteio };

  test('melhor oferta de não-ME; MEs no intervalo em ordem de classificação; ME fora do intervalo não entra', () => {
    const r = analisarEmpateFicto({ ...base, ranking: rk(['G', 900], ['M2', 930], ['D', 935], ['M1', 940], ['M3', 946]), mpe: new Set(['M1', 'M2', 'M3']) });
    expect(r.aplica).toBe(true);
    if (!r.aplica) return;
    expect(r.melhor).toEqual({ fornecedorId: 'G', valor: 900 });
    expect(r.limite).toBe(945);
    expect(r.candidatos.map((c) => [c.fornecedorId, c.ordem])).toEqual([
      ['M2', 1],
      ['M1', 2],
    ]);
    expect(r.sorteio).toBeNull();
  });

  test('10% nas demais modalidades (concorrência)', () => {
    const r = analisarEmpateFicto({ ...base, modalidade: 'CONCORRENCIA', percentual: 10, ranking: rk(['G', 100], ['M1', 109.99]), mpe: new Set(['M1']) });
    expect(r.aplica).toBe(true);
  });

  test('melhor oferta já de ME/EPP → sem benefício (art. 45 §2º)', () => {
    const r = analisarEmpateFicto({ ...base, ranking: rk(['M1', 900], ['G', 901]), mpe: new Set(['M1']) });
    expect(r).toMatchObject({ aplica: false });
    expect((r as any).motivo).toMatch(/já é de ME\/EPP/);
  });

  test('nenhuma ME no intervalo → segue direto para a aceitação', () => {
    const r = analisarEmpateFicto({ ...base, ranking: rk(['G', 900], ['M1', 946]), mpe: new Set(['M1']) });
    expect(r.aplica).toBe(false);
    expect((r as any).motivo).toMatch(/Nenhuma ME\/EPP/);
  });

  test('unidade exclusiva/cota, maior lance e dispensa não têm empate ficto', () => {
    const ranking = rk(['G', 900], ['M1', 901]);
    const mpe = new Set(['M1']);
    expect(analisarEmpateFicto({ ...base, ranking, mpe, beneficio: { empateFicto: false, somenteMpe: true } }).aplica).toBe(false);
    expect(analisarEmpateFicto({ ...base, ranking, mpe, direcao: 'MAIOR' }).aplica).toBe(false);
    expect(analisarEmpateFicto({ ...base, ranking, mpe, modalidade: 'DISPENSA_ELETRONICA' }).aplica).toBe(false);
  });

  test('excluídos (recusado/desclassificado) não contam como melhor nem como candidatos', () => {
    const ranking = [
      { fornecedorId: 'G1', valor: 890, posicao: 0, excluido: true },
      { fornecedorId: 'G2', valor: 900, posicao: 1 },
      { fornecedorId: 'M1', valor: 901, posicao: 2, excluido: true },
      { fornecedorId: 'M2', valor: 920, posicao: 3 },
    ];
    const r = analisarEmpateFicto({ ...base, ranking, mpe: new Set(['M1', 'M2']) });
    expect(r.aplica && r.melhor.fornecedorId).toBe('G2');
    expect(r.aplica && r.candidatos.map((c) => c.fornecedorId)).toEqual(['M2']);
  });

  test('ME/EPP com valores IGUAIS no intervalo → sorteio auditável e reproduzível (art. 45 III)', () => {
    const entrada = { ...base, ranking: rk(['G', 900], ['MA', 920], ['MB', 920], ['MC', 920], ['MD', 930]), mpe: new Set(['MA', 'MB', 'MC', 'MD']) };
    const r1 = analisarEmpateFicto(entrada);
    const r2 = analisarEmpateFicto({ ...entrada, ranking: [...entrada.ranking].reverse().map((e, i) => ({ ...e, posicao: 5 - i })) });
    expect(r1.aplica && r2.aplica).toBe(true);
    if (!r1.aplica || !r2.aplica) return;
    const ordem1 = r1.candidatos.map((c) => c.fornecedorId);
    expect(ordem1.slice(0, 3).sort()).toEqual(['MA', 'MB', 'MC']);
    expect(ordem1[3]).toBe('MD');
    expect(r1.candidatos.slice(0, 3).every((c) => c.sorteado)).toBe(true);
    // mesma entrada pública → mesma ordem, independentemente da ordem de chegada
    expect(r2.candidatos.map((c) => c.fornecedorId)).toEqual(ordem1);
    expect(r1.sorteio!.grupos).toHaveLength(1);
    expect(conferirSorteio(r1.sorteio!.grupos[0])).toBe(true);
    expect(r1.sorteio!.grupos[0].entrada).toMatch(/LC123-ART45-III/);
  });
});

describe('ME/EPP — resposta da convocada (art. 45 I e §3º)', () => {
  const agora = new Date('2026-09-24T12:00:00Z');
  const aberta = { status: StatusConvocacaoMpe.AGUARDANDO, prazo_ate: prazoConvocacaoAte(agora, 5) };

  test('prazo de 5 minutos', () => {
    expect(new Date(aberta.prazo_ate).getTime() - agora.getTime()).toBe(5 * 60_000);
    expect(convocacaoExpirada(aberta, new Date(agora.getTime() + 5 * 60_000))).toBe(false);
    expect(convocacaoExpirada(aberta, new Date(agora.getTime() + 5 * 60_000 + 1))).toBe(true);
  });

  test('oferta ESTRITAMENTE inferior à melhor; igual ou acima recusada', () => {
    expect(motivoNaoExerce(aberta, 899.99, 900, agora)).toBeNull();
    expect(motivoNaoExerce(aberta, 900, 900, agora)).toMatch(/MENOR/);
    expect(motivoNaoExerce(aberta, 901, 900, agora)).toMatch(/MENOR/);
    expect(motivoNaoExerce(aberta, 0, 900, agora)).toMatch(/Informe/);
    expect(motivoNaoExerce(aberta, 'abc', 900, agora)).toMatch(/Informe/);
  });

  test('fora do prazo ou convocação já respondida → recusada', () => {
    expect(motivoNaoExerce(aberta, 800, 900, new Date(agora.getTime() + 6 * 60_000))).toMatch(/precluso/);
    expect(motivoNaoExerce({ ...aberta, status: StatusConvocacaoMpe.DECLINADA }, 800, 900, agora)).toMatch(/não está aberta/);
  });
});

describe('ME/EPP — art. 48: exclusivo e cota reservada', () => {
  test('benefício por modo: GERAL (só tipo_beneficio_mpe), POR_LOTE, POR_ITEM e cota', () => {
    expect(beneficioDaUnidade({ modo: 'GERAL', tipoLicitacao: 'EXCLUSIVO' })).toMatchObject({ tipo: 'EXCLUSIVO', somenteMpe: true, empateFicto: false });
    expect(beneficioDaUnidade({ modo: 'GERAL', tipoLicitacao: 'COTA_RESERVADA' }).tipo).toBe('COTA_RESERVADA');
    expect(beneficioDaUnidade({ modo: 'GERAL', tipoLicitacao: 'NENHUM' })).toMatchObject({ tipo: 'NENHUM', empateFicto: true });
    expect(beneficioDaUnidade({ modo: 'POR_LOTE', tipoLicitacao: 'EXCLUSIVO', tipoLote: 'NENHUM' }).tipo).toBe('NENHUM');
    expect(beneficioDaUnidade({ modo: 'POR_LOTE', tipoLote: 'EXCLUSIVO' }).somenteMpe).toBe(true);
    expect(beneficioDaUnidade({ modo: 'POR_ITEM', tiposParticipacaoItens: ['EXCLUSIVO_MPE'] }).tipo).toBe('EXCLUSIVO');
    expect(beneficioDaUnidade({ modo: 'POR_ITEM', tiposParticipacaoItens: ['EXCLUSIVO_MPE', 'AMPLA'] }).tipo).toBe('NENHUM');
    expect(beneficioDaUnidade({ modo: 'POR_ITEM', tiposParticipacaoItens: ['COTA_RESERVADA'] })).toMatchObject({ tipo: 'COTA_RESERVADA', somenteMpe: false, empateFicto: true });
    expect(beneficioDaUnidade({ modo: 'GERAL', tipoLicitacao: 'COTA_RESERVADA', ehCota: true })).toMatchObject({ ehCota: true, somenteMpe: true, empateFicto: false });
    // tratamento diferenciado desligado: art. 48 off, empate ficto continua
    expect(beneficioDaUnidade({ tratamentoDiferenciado: false, tipoLicitacao: 'EXCLUSIVO' })).toMatchObject({ tipo: 'NENHUM', empateFicto: true });
  });

  test('exclusividade: não ME/EPP recusada com o fundamento; ME/EPP enquadrada passa', () => {
    const excl = beneficioDaUnidade({ tipoLicitacao: 'EXCLUSIVO' });
    expect(motivoForaDaExclusividade(excl, false, 'Item 1')).toMatch(/EXCLUSIVO.*art\. 48, I/);
    expect(motivoForaDaExclusividade(excl, true, 'Item 1')).toBeNull();
    const cota = beneficioDaUnidade({ ehCota: true });
    expect(motivoForaDaExclusividade(cota, false, 'Item 3')).toMatch(/COTA RESERVADA.*art\. 48, III/);
    expect(motivoForaDaExclusividade(beneficioDaUnidade({}), false, 'Item 1')).toBeNull();
  });

  test('exclusivo só até R$ 80.000 (art. 48 I)', () => {
    expect(motivoExclusivoAcimaDoLimite(80000)).toBeNull();
    expect(motivoExclusivoAcimaDoLimite(80000.01)).toMatch(/80\.000/);
  });

  test('cota: percentual > 0 e ≤ parâmetro (nunca acima de 25%)', () => {
    expect(motivoPercentualCotaInvalido(25, 25)).toBeNull();
    expect(motivoPercentualCotaInvalido(25.01, 25)).toMatch(/acima do máximo/);
    expect(motivoPercentualCotaInvalido(20, 15)).toMatch(/máximo de 15%/);
    expect(motivoPercentualCotaInvalido(30, 40)).toMatch(/máximo de 25%/);
    expect(motivoPercentualCotaInvalido(0, 25)).toMatch(/maior que zero/);
    expect(motivoPercentualCotaInvalido(null, 25)).toMatch(/maior que zero/);
  });

  test('quantidade da cota: inteira arredonda para baixo; fracionária em 4 casas; soma preservada', () => {
    expect(quantidadeDaCota(100, 25)).toEqual({ cota: 25, principal: 75 });
    expect(quantidadeDaCota(10, 25)).toEqual({ cota: 2, principal: 8 });
    expect(quantidadeDaCota(3, 25)).toEqual({ cota: 0, principal: 3 });
    expect(quantidadeDaCota(10.5, 20)).toEqual({ cota: 2.1, principal: 8.4 });
  });

  test('escrita: tipo novo é a fonte; legado aceito como entrada e sempre derivado', () => {
    expect(normalizarBeneficioMpeLicitacao({})).toEqual({});
    expect(normalizarBeneficioMpeLicitacao({ exclusivo_mpe: true })).toMatchObject({ tipo_beneficio_mpe: 'EXCLUSIVO', exclusivo_mpe: true, cota_reservada: false });
    expect(normalizarBeneficioMpeLicitacao({ tipo_beneficio_mpe: 'COTA_RESERVADA', exclusivo_mpe: true })).toMatchObject({
      tipo_beneficio_mpe: 'COTA_RESERVADA',
      exclusivo_mpe: false,
      cota_reservada: true,
      percentual_cota_reservada: 25,
    });
    expect(() => normalizarBeneficioMpeLicitacao({ tipo_beneficio_mpe: 'COTA_RESERVADA', percentual_cota_reservada: 40 })).toThrow(/25%/);
    expect(normalizarBeneficioMpeLicitacao({ exclusivo_mpe: false }, { tipo_beneficio_mpe: 'EXCLUSIVO' })).toMatchObject({ tipo_beneficio_mpe: 'NENHUM' });
    expect(() => normalizarBeneficioMpeLicitacao({ tipo_beneficio_mpe: 'XPTO' })).toThrow(/inválido/);
  });
});

describe('ME/EPP — prazo do desempate PAUSADO na suspensão (devido processo)', () => {
  const MIN = 60_000;
  const T0 = 1_000_000;

  test('sem suspensão: 5 min corridos; vence depois disso', () => {
    const p = tempoSuspenso([], T0, T0 + 6 * MIN);
    expect(p).toEqual({ pausadoMs: 0, suspensaAgora: false });
    expect(estadoDoPrazoMpe({ totalMs: 5 * MIN, convocadaMs: T0, agoraMs: T0 + 4 * MIN, ...p })).toMatchObject({ expirada: false, restanteMs: MIN });
    expect(estadoDoPrazoMpe({ totalMs: 5 * MIN, convocadaMs: T0, agoraMs: T0 + 6 * MIN, ...p }).expirada).toBe(true);
  });

  test('suspensa: nunca expira e guarda o restante; retomada: o restante volta a correr', () => {
    const suspensa = [{ emMs: T0 + 2 * MIN, fonte: 'SESSAO' as const, suspende: true }];
    const durante = tempoSuspenso(suspensa, T0, T0 + 30 * MIN);
    expect(durante).toEqual({ pausadoMs: 28 * MIN, suspensaAgora: true });
    const e1 = estadoDoPrazoMpe({ totalMs: 5 * MIN, convocadaMs: T0, agoraMs: T0 + 30 * MIN, ...durante });
    expect(e1).toMatchObject({ expirada: false, suspensa: true, restanteMs: 3 * MIN });
    const retomada = [...suspensa, { emMs: T0 + 30 * MIN, fonte: 'SESSAO' as const, suspende: false }];
    const depois = tempoSuspenso(retomada, T0, T0 + 32 * MIN);
    expect(depois).toEqual({ pausadoMs: 28 * MIN, suspensaAgora: false });
    expect(estadoDoPrazoMpe({ totalMs: 5 * MIN, convocadaMs: T0, agoraMs: T0 + 32 * MIN, ...depois })).toMatchObject({ expirada: false, restanteMs: MIN });
    const tarde = tempoSuspenso(retomada, T0, T0 + 34 * MIN);
    expect(estadoDoPrazoMpe({ totalMs: 5 * MIN, convocadaMs: T0, agoraMs: T0 + 34 * MIN, ...tarde }).expirada).toBe(true);
  });

  test('sessão e licitação suspensas ao mesmo tempo: a pausa é a UNIÃO dos intervalos; suspensão anterior à convocação conta desde ela', () => {
    const marcos = [
      { emMs: T0 - MIN, fonte: 'LICITACAO' as const, suspende: true },
      { emMs: T0 + MIN, fonte: 'SESSAO' as const, suspende: true },
      { emMs: T0 + 2 * MIN, fonte: 'LICITACAO' as const, suspende: false },
      { emMs: T0 + 4 * MIN, fonte: 'SESSAO' as const, suspende: false },
    ];
    expect(tempoSuspenso(marcos, T0, T0 + 10 * MIN)).toEqual({ pausadoMs: 4 * MIN, suspensaAgora: false });
  });

  test('status atual suspenso sem marco registrado → suspensa (nunca expira)', () => {
    const p = tempoSuspenso([], T0, T0 + 10 * MIN, { sessao: true });
    expect(estadoDoPrazoMpe({ totalMs: 5 * MIN, convocadaMs: T0, agoraMs: T0 + 10 * MIN, ...p })).toMatchObject({ expirada: false, suspensa: true });
  });
});

describe('ME/EPP — PUBLICAR × art. 48 I (bloqueio acima de R$ 80.000; justificativa do art. 49 até o limite)', () => {
  const u = (rotulo: string, valorEstimado: number, exclusiva: boolean, ehCota = false) => ({ rotulo, valorEstimado, exclusiva, ehCota });

  test('exclusivo acima do limite bloqueia, listando as unidades; a cota (art. 48 III) não entra', () => {
    const p = pendenciasPublicacaoArt48(
      { limite: 80000, unidades: [u('Item 1', 80000.01, true), u('Item 2', 80000, true), u('Item 3', 500000, true, true)] },
      'justificativa longa o bastante para o art. 49',
    );
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/Item 1 \(R\$ 80\.000,01\)/);
    expect(p[0]).not.toMatch(/Item 2|Item 3/);
  });

  test('itens até o limite sem exclusividade exigem justificativa (≥ 20); acima do limite, ampla não exige', () => {
    const c = { limite: 80000, unidades: [u('Item 1', 1000, false), u('Lote 2', 90000, false)] };
    const sem = pendenciasPublicacaoArt48(c, '');
    expect(sem).toHaveLength(1);
    expect(sem[0]).toMatch(/Item 1/);
    expect(sem[0]).not.toMatch(/Lote 2/);
    expect(pendenciasPublicacaoArt48(c, 'curta')).toHaveLength(1);
    expect(pendenciasPublicacaoArt48(c, 'Art. 49, II: menos de 3 ME/EPP competitivas')).toEqual([]);
    // listagem de atos (sem o formulário): só o bloqueio é avaliado
    expect(pendenciasPublicacaoArt48(c, null, true)).toEqual([]);
    expect(pendenciasPublicacaoArt48(null, null)).toEqual([]);
  });

  test('pré-condição do PUBLICAR usa a conferência, os dados do ato e a justificativa gravada', async () => {
    const conferencia = { limite: 80000, unidades: [u('Item 1', 90000, true), u('Item 2', 100, false)] };
    const ctx = (dados: any, licitacao: any = {}) =>
      ({ ato: 'PUBLICAR', dados, licitacao, agora: new Date(), consultas: { conferenciaArt48: async () => conferencia } }) as any;
    const p1 = (await exclusividadeMpeArt48(ctx({}))) as string[];
    expect(p1).toHaveLength(2);
    const p2 = (await exclusividadeMpeArt48(ctx({ justificativa_nao_exclusividade_mpe: 'Art. 49, III: desvantajoso para a Administração' }))) as string[];
    expect(p2).toHaveLength(1);
    expect(p2[0]).toMatch(/Item 1/);
    const p3 = (await exclusividadeMpeArt48(ctx({}, { justificativa_nao_exclusividade_mpe: 'Art. 49, II: gravada na edição do edital' }))) as string[];
    expect(p3).toHaveLength(1);
    expect(await exclusividadeMpeArt48({ ...ctx({}), consultas: {} } as any)).toBeNull();
  });
});

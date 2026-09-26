import {
  EtapaFaseInterna as E,
  PassoFaseInterna as P,
  etapaAtual,
  etapasDaFaseInterna,
  passoDaPeca,
  passosDasEtapas,
  situacaoDaEtapa,
} from './etapas-fase-interna';

/** Instrução do art. 72 (contratação direta), como devolve o getInstrucao. */
function instrucaoDireta(status: Partial<Record<string, string>> = {}, extras: Array<{ tipo: string; titulo: string }> = []) {
  const linhas = [
    { tipo: 'DFD', titulo: 'DFD', obrigatorio: true },
    { tipo: 'PP', titulo: 'Estimativa', obrigatorio: true },
    { tipo: 'AA', titulo: 'Autorização', obrigatorio: true },
    { tipo: 'ETP', titulo: 'ETP', obrigatorio: false },
    { tipo: 'TR', titulo: 'TR', obrigatorio: false },
    { tipo: 'AR', titulo: 'Riscos', obrigatorio: false },
    { tipo: 'PJ', titulo: 'Parecer', obrigatorio: false },
    { tipo: 'DO', titulo: 'Dotação', obrigatorio: false },
    { tipo: 'JC', titulo: 'Justificativa', obrigatorio: false },
    { tipo: 'DP', titulo: 'Designação', obrigatorio: false },
    { tipo: 'RAG', titulo: 'Relatório', obrigatorio: false },
    { tipo: 'MC', titulo: 'Minuta do contrato', obrigatorio: false },
    ...extras.map((x) => ({ ...x, obrigatorio: false })),
  ];
  return linhas.map((l) => ({ ...l, status: status[l.tipo] ?? 'PENDENTE' }));
}

/** Rito completo (art. 18): obrigatórios de todas as etapas. */
function instrucaoRito(status: Partial<Record<string, string>> = {}) {
  return ['DFD', 'ETP', 'TR', 'JC', 'PP', 'MCP', 'PJ', 'AA', 'DP', 'DO'].map((tipo) => ({
    tipo,
    titulo: tipo,
    obrigatorio: true,
    status: status[tipo] ?? 'PENDENTE',
  }));
}

const ok = (...tipos: string[]) => Object.fromEntries(tipos.map((t) => [t, 'OK']));
const semCI = { controle_interno_ativo: false };
const comCI = { controle_interno_ativo: true };
const direta = { contratacao_direta: true, fase: 'PLANEJAMENTO', situacao: 'ATIVA' };
const rito = { contratacao_direta: false, fase: 'PLANEJAMENTO', situacao: 'ATIVA' };
const passo = (etapas: ReturnType<typeof etapasDaFaseInterna>, p: P) => passosDasEtapas(etapas).find((x) => x.passo === p)!;

describe('etapasDaFaseInterna — contratação direta (art. 72)', () => {
  it('processo novo: só a demanda está disponível; o resto aguarda a dependência', () => {
    const etapas = etapasDaFaseInterna(direta, instrucaoDireta(), semCI);
    expect(etapas.map((e) => e.etapa)).toEqual([
      E.DEMANDA, E.ETP_RISCOS, E.TERMO_REFERENCIA, E.PESQUISA_PRECOS, E.RESERVA_ORCAMENTARIA,
      E.AUTORIZACAO, E.MINUTAS_PARECER, E.CONFORMIDADE_PUBLICACAO,
    ]);
    expect(etapas.map((e) => e.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(passo(etapas, P.DFD).situacao).toBe('DISPONIVEL');
    expect(passo(etapas, P.ETP).situacao).toBe('AGUARDANDO');
    expect(passo(etapas, P.ETP).pendencias).toEqual([P.DFD]);
    expect(etapaAtual(etapas)?.etapa).toBe(E.DEMANDA);
  });

  it('DFD pronto libera estudo, TR e pesquisa (em paralelo); a reserva espera a pesquisa', () => {
    const etapas = etapasDaFaseInterna(direta, instrucaoDireta(ok('DFD')), semCI);
    expect(passo(etapas, P.DFD).situacao).toBe('CONCLUIDO');
    expect([P.ETP, P.TR, P.PESQUISA].map((p) => passo(etapas, p).situacao)).toEqual(['DISPONIVEL', 'DISPONIVEL', 'DISPONIVEL']);
    expect(passo(etapas, P.RESERVA).situacao).toBe('AGUARDANDO');
    expect(passo(etapas, P.RESERVA).pendencias).toEqual([P.PESQUISA]);
    expect(etapaAtual(etapas)?.etapa).toBe(E.ETP_RISCOS);
  });

  it('autorização (portão B) depende de demanda, estudo, TR, pesquisa e reserva', () => {
    const quase = etapasDaFaseInterna(direta, instrucaoDireta(ok('DFD', 'ETP', 'AR', 'TR', 'PP')), semCI);
    expect(passo(quase, P.AUTORIZACAO).situacao).toBe('AGUARDANDO');
    expect(passo(quase, P.AUTORIZACAO).pendencias).toEqual([P.RESERVA]);
    expect(passo(quase, P.AUTORIZACAO).portao).toBe('B_ART72');
    const tudo = etapasDaFaseInterna(direta, instrucaoDireta(ok('DFD', 'ETP', 'AR', 'TR', 'PP', 'DO')), semCI);
    expect(passo(tudo, P.AUTORIZACAO).situacao).toBe('DISPONIVEL');
  });

  it('"não se aplica" conta como pronta (ETP e riscos dispensados = etapa concluída, marcada)', () => {
    const etapas = etapasDaFaseInterna(direta, instrucaoDireta({ DFD: 'OK', ETP: 'NAO_SE_APLICA', AR: 'NAO_SE_APLICA' }), semCI);
    const etp = etapas.find((e) => e.etapa === E.ETP_RISCOS)!;
    expect(etp.situacao).toBe('CONCLUIDA');
    expect(etp.nao_se_aplica).toBe(true);
  });

  it('peça anexada/assinada conta (status OK vindo da instrução); em assinatura é "em andamento"', () => {
    const etapas = etapasDaFaseInterna(direta, instrucaoDireta({ DFD: 'OK', PP: 'EM_ASSINATURA', ETP: 'OK' }), semCI);
    expect(passo(etapas, P.PESQUISA).situacao).toBe('EM_ANDAMENTO');
    // ETP pronto, riscos pendente: etapa em andamento, e a tarefa aponta para a peça que falta
    expect(passo(etapas, P.ETP).situacao).toBe('EM_ANDAMENTO');
    expect(passo(etapas, P.ETP).peca_pendente).toBe('AR');
  });

  it('peça feita ANTES da dependência conta na hora (ordem é sugestão)', () => {
    const etapas = etapasDaFaseInterna(direta, instrucaoDireta(ok('AA', 'DP')), semCI);
    expect(passo(etapas, P.AUTORIZACAO).situacao).toBe('CONCLUIDO');
    expect(passo(etapas, P.DFD).situacao).toBe('DISPONIVEL');
  });

  it('minutas depois da autorização; o parecer exige as minutas', () => {
    const base = ok('DFD', 'ETP', 'AR', 'TR', 'PP', 'DO', 'AA', 'DP');
    const semMinutas = etapasDaFaseInterna(direta, instrucaoDireta(base), semCI);
    expect(passo(semMinutas, P.MINUTAS).situacao).toBe('DISPONIVEL');
    expect(passo(semMinutas, P.PARECER).situacao).toBe('AGUARDANDO');
    expect(passo(semMinutas, P.PARECER).portao).toBe('MINUTAS_ANTES_DO_PARECER');
    const comMinutas = etapasDaFaseInterna(direta, instrucaoDireta({ ...base, RAG: 'OK', MC: 'OK', JC: 'OK' }), semCI);
    expect(passo(comMinutas, P.PARECER).situacao).toBe('DISPONIVEL');
    expect(comMinutas.find((e) => e.etapa === E.MINUTAS_PARECER)!.situacao).toBe('EM_ANDAMENTO');
  });

  it('controle interno ATIVO: etapa entre o parecer e a publicação; a publicação espera por ela', () => {
    const tudo = ok('DFD', 'ETP', 'AR', 'TR', 'PP', 'DO', 'AA', 'DP', 'RAG', 'MC', 'JC', 'PJ');
    const extras = [{ tipo: 'MCI', titulo: 'Controle interno' }];
    const etapas = etapasDaFaseInterna(direta, instrucaoDireta(tudo, extras), comCI);
    expect(etapas.map((e) => e.etapa).slice(-2)).toEqual([E.CONTROLE_INTERNO, E.CONFORMIDADE_PUBLICACAO]);
    expect(passo(etapas, P.CONTROLE_INTERNO).situacao).toBe('DISPONIVEL');
    expect(passo(etapas, P.PUBLICACAO).situacao).toBe('AGUARDANDO');
    expect(passo(etapas, P.PUBLICACAO).pendencias).toEqual([P.CONTROLE_INTERNO]);
    const feito = etapasDaFaseInterna(direta, instrucaoDireta({ ...tudo, MCI: 'OK' }, extras), comCI);
    expect(passo(feito, P.PUBLICACAO).situacao).toBe('DISPONIVEL');
  });

  it('controle interno INATIVO: a etapa some (mesmo com a peça na instrução) e a publicação não espera', () => {
    const tudo = ok('DFD', 'ETP', 'AR', 'TR', 'PP', 'DO', 'AA', 'DP', 'RAG', 'MC', 'JC', 'PJ');
    const etapas = etapasDaFaseInterna(direta, instrucaoDireta(tudo, [{ tipo: 'MCI', titulo: 'CI' }]), semCI);
    expect(etapas.some((e) => e.etapa === E.CONTROLE_INTERNO)).toBe(false);
    expect(passo(etapas, P.PUBLICACAO).situacao).toBe('DISPONIVEL');
    expect(passo(etapas, P.PUBLICACAO).portao).toBe('C_CONFORMIDADE');
  });

  it('processo divulgado: publicação concluída; o que faltou vira "não realizado"', () => {
    const etapas = etapasDaFaseInterna({ ...direta, fase: 'AGUARDANDO_DIVULGACAO' }, instrucaoDireta(ok('DFD', 'PP', 'AA')), semCI);
    expect(passo(etapas, P.PUBLICACAO).situacao).toBe('CONCLUIDO');
    expect(passo(etapas, P.ETP).situacao).toBe('NAO_REALIZADO');
    expect(etapaAtual(etapas)).toBeNull();
  });

  it('revogado na fase interna: o que não estava pronto fica cancelado', () => {
    const etapas = etapasDaFaseInterna({ ...direta, situacao: 'REVOGADA' }, instrucaoDireta(ok('DFD')), semCI);
    expect(passo(etapas, P.DFD).situacao).toBe('CONCLUIDO');
    expect(passo(etapas, P.ETP).situacao).toBe('CANCELADO');
    expect(passo(etapas, P.PUBLICACAO).situacao).toBe('CANCELADO');
    expect(etapas.find((e) => e.etapa === E.ETP_RISCOS)!.situacao).toBe('CANCELADA');
  });
});

describe('etapasDaFaseInterna — rito completo (art. 18) e máquina de estados', () => {
  it('sem minutas na instrução, o passo some; parecer vem antes da autorização', () => {
    const etapas = etapasDaFaseInterna(rito, instrucaoRito(), semCI);
    expect(passosDasEtapas(etapas).map((p) => p.passo)).toEqual([P.DFD, P.ETP, P.TR, P.PESQUISA, P.RESERVA, P.PARECER, P.AUTORIZACAO, P.PUBLICACAO]);
    expect(etapas.map((e) => e.etapa)).toEqual([
      E.DEMANDA, E.ETP_RISCOS, E.TERMO_REFERENCIA, E.PESQUISA_PRECOS, E.RESERVA_ORCAMENTARIA,
      E.MINUTAS_PARECER, E.AUTORIZACAO, E.CONFORMIDADE_PUBLICACAO,
    ]);
    const quase = etapasDaFaseInterna(rito, instrucaoRito(ok('DFD', 'ETP', 'TR', 'JC', 'PP', 'MCP', 'DO')), semCI);
    expect(passo(quase, P.PARECER).situacao).toBe('DISPONIVEL');
    expect(passo(quase, P.AUTORIZACAO).pendencias).toEqual([P.PARECER]);
  });

  it('a justificativa (JC) vai com o TR no rito completo e com as minutas na direta', () => {
    expect(passoDaPeca('JC', false)).toBe(P.TR);
    expect(passoDaPeca('JC', true)).toBe(P.MINUTAS);
    expect(passoDaPeca('PJE', true)).toBeNull(); // parecer da fase externa não é etapa interna
    expect(passoDaPeca('MCI', true)).toBe(P.CONTROLE_INTERNO);
  });

  it('cada etapa diz a fase da máquina a que corresponde', () => {
    const etapas = etapasDaFaseInterna(rito, instrucaoRito(), semCI);
    const fase = (e: E) => etapas.find((x) => x.etapa === e)!.fase_maquina;
    expect(fase(E.DEMANDA)).toBe('PLANEJAMENTO');
    expect(fase(E.TERMO_REFERENCIA)).toBe('TERMO_REFERENCIA');
    expect(fase(E.MINUTAS_PARECER)).toBe('ANALISE_JURIDICA');
    expect(fase(E.AUTORIZACAO)).toBe('APROVACAO_INTERNA');
  });
});

describe('situacaoDaEtapa', () => {
  it('agrega os passos', () => {
    expect(situacaoDaEtapa(['CONCLUIDO', 'CONCLUIDO'])).toBe('CONCLUIDA');
    expect(situacaoDaEtapa(['CONCLUIDO', 'AGUARDANDO'])).toBe('EM_ANDAMENTO');
    expect(situacaoDaEtapa(['CONCLUIDO', 'NAO_REALIZADO'])).toBe('NAO_REALIZADA');
    expect(situacaoDaEtapa(['DISPONIVEL'])).toBe('DISPONIVEL');
    expect(situacaoDaEtapa(['AGUARDANDO'])).toBe('AGUARDANDO');
    expect(situacaoDaEtapa(['CANCELADO', 'CONCLUIDO'])).toBe('CANCELADA');
  });
});

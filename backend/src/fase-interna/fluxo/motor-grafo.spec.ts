import { etapasDaFaseInterna, EstadoFluxoParaEtapas, passosDasEtapas } from '../tarefas/etapas-fase-interna';
import { PAPEIS_FASE_INTERNA } from './codigos';
import { GrafoFluxo, grafoDeEtapas, normalizarGrafo, projetarGrafo } from './grafo-fluxo';
import { ModeloFluxo, TipoProcessoFluxo } from './modelo-fluxo';
import { comAprovacaoDeFinancas, MODELOS_PRONTOS } from './modelos-prontos-fluxo';
import { AcaoSimulacao, DadosCondicao, EstadoSimulacao, alvosDaDevolucao, avaliarCondicao, conferirGrafo, etapasVivas, simular } from './motor-grafo';
import { REQUISITOS_SEMENTE, etapasSemente, modeloSemente } from './semente-fluxo';

const conferir = (g: GrafoFluxo, tipo: TipoProcessoFluxo = 'DISPENSA') => conferirGrafo(g, { tipo, requisitos: REQUISITOS_SEMENTE, papeis: PAPEIS_FASE_INTERNA });
const camara = (tipo: TipoProcessoFluxo = 'DISPENSA') => grafoDeEtapas(etapasSemente(tipo));
const prefeitura = () => comAprovacaoDeFinancas(camara(), 50000);
const nome = (g: GrafoFluxo, id: string) => g.nos.find((n) => n.id === id)!.nome;
const ids = (e: EstadoSimulacao) => [...e.ativos].sort();

/** Fluxo da demanda do protótipo (secretário → condição → Finanças; correção por devolução). */
function demanda(): GrafoFluxo {
  return normalizarGrafo(
    {
      nos: [
        { id: 'n1', tipo: 'inicio', nome: 'Setor faz o pedido' },
        { id: 'n2', tipo: 'aprovacao', nome: 'Secretário da pasta', responsavel: { papel: 'AUTORIDADE' } },
        { id: 'n3', tipo: 'etapa', nome: 'Corrigir o pedido', responsavel: { papel: 'REQUISITANTE' } },
        { id: 'n4', tipo: 'condicao', nome: 'Valor acima de R$ 50 mil?' },
        { id: 'n5', tipo: 'aprovacao', nome: 'Secretário de Finanças', responsavel: { papel: 'CONTABILIDADE' } },
        { id: 'n6', tipo: 'fim', nome: 'Vai para o Planejamento (DFD)' },
      ],
      arestas: [
        { de: 'n1', para: 'n2' },
        { de: 'n2', para: 'n4' },
        { de: 'n2', para: 'n3', rotulo: 'devolve' },
        { de: 'n3', para: 'n2' },
        { de: 'n4', para: 'n5', rotulo: 'sim' },
        { de: 'n4', para: 'n6', rotulo: 'não' },
        { de: 'n5', para: 'n6' },
      ],
    },
    { tipo: 'DISPENSA' },
  ).grafo;
}

describe('condição avaliável pelo sistema', () => {
  it('valor, tipo de contratação, modalidade e fundamento; manual ou sem dado → null (pergunta)', () => {
    const v = { campo: 'valor_total_estimado', operador: '>', valor: 50000 } as const;
    expect(avaliarCondicao(v, { valor_total_estimado: 60000 })).toBe('sim');
    expect(avaliarCondicao(v, { valor_total_estimado: 50000 })).toBe('nao');
    expect(avaliarCondicao({ ...v, operador: '>=' }, { valor_total_estimado: 50000 })).toBe('sim');
    expect(avaliarCondicao({ campo: 'valor_total_estimado', operador: 'entre', valor: 10, valor_ate: 20 }, { valor_total_estimado: 15 })).toBe('sim');
    expect(avaliarCondicao(v, { valor_total_estimado: 0 })).toBeNull();
    expect(avaliarCondicao(v, {})).toBeNull();
    expect(avaliarCondicao({ campo: 'tipo_contratacao', operador: 'em', valores: ['OBRA', 'SERVICO_ENGENHARIA'] }, { tipo_contratacao: 'OBRA' })).toBe('sim');
    expect(avaliarCondicao({ campo: 'tipo_contratacao', operador: 'igual', valor: 'COMPRA' }, { tipo_contratacao: 'SERVICO' })).toBe('nao');
    expect(avaliarCondicao({ campo: 'modalidade', operador: 'diferente', valor: 'DISPENSA' }, { modalidade: 'INEXIGIBILIDADE' })).toBe('sim');
    expect(avaliarCondicao({ campo: 'fundamento_legal', operador: 'contem', valor: 'art. 75, II' }, { fundamento_legal: 'Lei 14.133/2021, Art. 75, II' })).toBe('sim');
    expect(avaliarCondicao({ campo: 'manual' }, { valor_total_estimado: 1 })).toBeNull();
  });
});

describe('simulação ("Testar") — a mesma regra do protótipo', () => {
  it('paralelo e junção: ETP, TR e pesquisa andam juntos; a reserva espera só a pesquisa; as minutas esperam os três', () => {
    const g = camara();
    let r = simular(g, null, { tipo: 'iniciar' });
    expect(ids(r.estado)).toEqual(['DFD']);
    r = simular(g, r.estado, { tipo: 'concluir', no: 'DFD' });
    expect(ids(r.estado)).toEqual(['ETP', 'PESQUISA', 'TR']); // a autorização de início (desligada) é atravessada
    r = simular(g, r.estado, { tipo: 'concluir', no: 'PESQUISA' });
    expect(ids(r.estado)).toEqual(['ETP', 'RESERVA', 'TR']); // indicação da modalidade (desligada) atravessada
    r = simular(g, r.estado, { tipo: 'concluir', no: 'RESERVA' });
    r = simular(g, r.estado, { tipo: 'concluir', no: 'ETP' });
    expect(ids(r.estado)).toEqual(['TR']);
    r = simular(g, r.estado, { tipo: 'concluir', no: 'TR' });
    expect(ids(r.estado)).toEqual(['MINUTAS']);
    for (const no of ['MINUTAS', 'PARECER', 'AUTORIZACAO', 'PUBLICACAO']) r = simular(g, r.estado, { tipo: 'concluir', no });
    expect(r.estado.fim).toBe(true);
    expect(r.log).toContain('Fim: Fase interna concluída');
  });

  it('condição automática (dados do exemplo) e manual (pergunta); ramo não escolhido não bloqueia a junção', () => {
    const g = prefeitura();
    const ate = (dados?: DadosCondicao) => {
      let r = simular(g, null, { tipo: 'iniciar' }, { dados });
      for (const no of ['DFD', 'PESQUISA']) r = simular(g, r.estado, { tipo: 'concluir', no }, { dados });
      return r;
    };
    const acima = ate({ valor_total_estimado: 80000 });
    expect(ids(acima.estado)).toEqual(['ETP', 'TR', 'financas']);
    expect(acima.log.join('\n')).toMatch(/O sistema avaliou "Valor estimado acima de R\$ 50\.000\?".*: sim/);
    const abaixo = ate({ valor_total_estimado: 10000 });
    expect(ids(abaixo.estado)).toEqual(['ETP', 'RESERVA', 'TR']); // Finanças não bloqueia a reserva
    const manual = ate();
    expect(ids(manual.estado)).toEqual(['ETP', 'TR', 'valor_financas']);
    expect(simular(g, manual.estado, { tipo: 'concluir', no: 'valor_financas' }).erro).toMatch(/responda sim ou não/);
    const r = simular(g, manual.estado, { tipo: 'responder', no: 'valor_financas', resposta: 'nao' });
    expect(ids(r.estado)).toEqual(['ETP', 'RESERVA', 'TR']);
  });

  it('devolve: Finanças devolve à pesquisa; corrigida, volta DIRETO para Finanças (sem refazer o meio)', () => {
    const g = prefeitura();
    const dados = { valor_total_estimado: 80000 };
    let r = simular(g, null, { tipo: 'iniciar' }, { dados });
    for (const no of ['DFD', 'PESQUISA']) r = simular(g, r.estado, { tipo: 'concluir', no }, { dados });
    r = simular(g, r.estado, { tipo: 'devolver', no: 'financas' }, { dados });
    expect(ids(r.estado)).toEqual(['ETP', 'PESQUISA', 'TR']);
    expect(r.estado.retornos).toEqual({ PESQUISA: 'financas' });
    expect(r.log).toEqual(['Contabilidade devolveu: Secretário de Finanças aprova a despesa', 'Voltou para Compras: Pesquisa de preços e mapa']);
    r = simular(g, r.estado, { tipo: 'concluir', no: 'PESQUISA' }, { dados });
    expect(ids(r.estado)).toEqual(['ETP', 'TR', 'financas']);
    expect(r.estado.decisoes).toEqual({ valor_financas: 'sim' }); // a condição não foi refeita
    r = simular(g, r.estado, { tipo: 'concluir', no: 'financas' }, { dados });
    expect(ids(r.estado)).toEqual(['ETP', 'RESERVA', 'TR']);
    // Só aprovação devolve; nó que não está com ninguém é recusado sem mudar nada
    expect(simular(g, r.estado, { tipo: 'devolver', no: 'RESERVA' }).erro).toMatch(/Só uma aprovação/);
    expect(simular(g, r.estado, { tipo: 'concluir', no: 'MINUTAS' }).erro).toMatch(/não está com ninguém/);
  });

  it('sem aresta devolve: devolve às anteriores; correção alcançada só por devolve (fluxo da demanda do protótipo)', () => {
    const g = demanda();
    let r = simular(g, null, { tipo: 'iniciar' });
    expect(ids(r.estado)).toEqual(['n2']); // "Corrigir o pedido" não bloqueia o secretário
    r = simular(g, r.estado, { tipo: 'devolver', no: 'n2' });
    expect(ids(r.estado)).toEqual(['n3']);
    r = simular(g, r.estado, { tipo: 'concluir', no: 'n3' });
    expect(ids(r.estado)).toEqual(['n2']);
    r = simular(g, r.estado, { tipo: 'concluir', no: 'n2' });
    expect(ids(r.estado)).toEqual(['n4']);
    r = simular(g, r.estado, { tipo: 'responder', no: 'n4', resposta: 'nao' });
    expect(r.estado.fim).toBe(true);
    // Aprovação sem devolve: às anteriores (a condição no caminho é atravessada)
    const semDevolve: GrafoFluxo = { ...g, arestas: g.arestas.filter((a) => a.rotulo !== 'devolve') };
    const e = projetarGrafo(semDevolve);
    expect(alvosDaDevolucao(e, 'U_N5')).toEqual(['U_N2']);
  });
});

describe('conferência (estrutura + lei)', () => {
  it('os modelos prontos são válidos (e o do sistema, nos três tipos)', () => {
    for (const m of MODELOS_PRONTOS) for (const t of m.tipos) expect([m.codigo, t, conferir(m.grafo(t), t)]).toMatchObject([m.codigo, t, { ok: true, erros: [] }]);
    const c = conferir(camara());
    expect(c.lei.every((x) => x.ok)).toBe(true);
    expect(c.lei.map((x) => x.texto)).toEqual(expect.arrayContaining(['Pesquisa de preços e mapa antes de Autorização da autoridade competente']));
  });

  it('estrutura: início, fim, alcance, saída, condição sim/não, rótulos, ciclo, quem faz', () => {
    const { grafo } = normalizarGrafo(
      {
        nos: [
          { id: 'i', tipo: 'inicio' },
          { id: 'i2', tipo: 'inicio' },
          { id: 'a', tipo: 'aprovacao', nome: 'Aprova', responsavel: null },
          { id: 'b', tipo: 'etapa', nome: 'Faz', responsavel: { papel: 'COMPRAS' } },
          { id: 'c', tipo: 'condicao', nome: 'Pergunta' },
          { id: 'solta', tipo: 'etapa', nome: 'Solta', responsavel: { papel: 'COMPRAS' } },
        ],
        arestas: [
          { de: 'i', para: 'a' },
          { de: 'a', para: 'b' },
          { de: 'b', para: 'a' },
          { de: 'b', para: 'c', rotulo: 'sim' },
          { de: 'c', para: 'b', rotulo: 'sim' },
          { de: 'b', para: 'a', rotulo: 'devolve' },
        ],
      },
      { tipo: 'DISPENSA' },
    );
    const c = conferir(grafo);
    const codigos = c.erros.map((e) => e.codigo);
    expect(c.ok).toBe(false);
    for (const k of ['GRAFO_INICIO', 'GRAFO_FIM', 'GRAFO_NAO_ALCANCAVEL', 'GRAFO_SEM_SAIDA', 'GRAFO_CONDICAO_SAIDAS', 'GRAFO_ROTULO', 'CICLO', 'GRAFO_SEM_RESPONSAVEL']) expect([k, codigos.includes(k)]).toEqual([k, true]);
  });

  it('lei: falta a autorização → erro com o artigo; autorização antes da pesquisa → erro', () => {
    const g = camara();
    const semAut = normalizarGrafo(
      { ...g, nos: g.nos.filter((n) => n.id !== 'AUTORIZACAO'), arestas: [...g.arestas.filter((a) => a.de !== 'AUTORIZACAO' && a.para !== 'AUTORIZACAO'), { de: 'PARECER', para: 'PUBLICACAO' }] },
      { tipo: 'DISPENSA' },
    ).grafo;
    const c = conferir(semAut);
    expect(c.erros).toEqual(expect.arrayContaining([expect.objectContaining({ codigo: 'RL-CD-AUTORIZACAO', fundamento: 'art. 72, VIII' })]));
    expect(c.lei.find((x) => x.codigo === 'RL-CD-AUTORIZACAO')).toMatchObject({ ok: false });
  });

  it('lei ramo a ramo: a pesquisa só no "sim" de uma condição → erro (no "não" a autorização vem sem pesquisa)', () => {
    const g = camara();
    // DFD → condição: sim → PESQUISA → RESERVA …; não → RESERVA (pula a pesquisa)
    const { grafo } = normalizarGrafo(
      {
        ...g,
        nos: [...g.nos, { id: 'q', tipo: 'condicao', nome: 'Tem cotação?', condicao: { campo: 'manual' } }],
        arestas: [
          ...g.arestas.filter((a) => !(a.para === 'PESQUISA' && a.rotulo !== 'devolve')),
          { de: 'DFD', para: 'q' },
          { de: 'q', para: 'PESQUISA', rotulo: 'sim' },
          { de: 'q', para: 'INDICACAO_MODALIDADE', rotulo: 'nao' },
        ],
      },
      { tipo: 'DISPENSA' },
    );
    const c = conferir(grafo);
    expect(c.ok).toBe(false);
    expect(c.erros.find((e) => e.codigo === 'RL-CD-PESQUISA')?.mensagem).toMatch(/Quando "Tem cotação\?" = não, o processo pula "Pesquisa de preços e mapa"/);
  });
});

// ---------------------------------------------------------------------------
// EQUIVALÊNCIA: a simulação no grafo × o motor derivado do processo real
// ---------------------------------------------------------------------------

/** Estado do processo real (peças, despachos, decisões, devoluções) que acompanha as ações da simulação. */
class ProcessoDeTeste {
  status: Record<string, string> = {};
  divulgada = false;
  estado: Required<Pick<EstadoFluxoParaEtapas, 'reabertas' | 'registros' | 'decisoes' | 'retornos'>> = { reabertas: {}, registros: {}, decisoes: {}, retornos: {} };
  constructor(
    readonly g: GrafoFluxo,
    readonly modelo: ModeloFluxo,
    readonly dados: DadosCondicao,
  ) {}
  etapa(id: string) {
    return this.modelo.etapas.find((e) => e.no_id === id)!;
  }
  passos() {
    const instrucao = this.modelo.etapas.flatMap((e) => e.tipos_peca.map((t) => ({ tipo: t, titulo: t, obrigatorio: true, status: this.status[t] ?? 'PENDENTE' })));
    return passosDasEtapas(etapasDaFaseInterna({ contratacao_direta: true, fase: 'PLANEJAMENTO', situacao: 'ATIVA', dados: this.dados }, instrucao, this.modelo, {}, { demanda_aprovada: true, ...this.estado }));
  }
  /** Com alguém agora: disponível ou em andamento (a pesquisa refeita, a condição que pergunta). */
  ativos() {
    return this.passos()
      .filter((p) => p.situacao === 'DISPONIVEL' || p.situacao === 'EM_ANDAMENTO')
      .filter((p) => !(p.conclusao === 'DIVULGACAO' && this.divulgada))
      .map((p) => this.modelo.etapas.find((e) => e.codigo === p.passo)!.no_id!)
      .sort();
  }
  aplicar(a: AcaoSimulacao) {
    if (a.tipo === 'iniciar') return;
    const e = this.etapa(a.no);
    if (a.tipo === 'responder') this.estado.decisoes[e.codigo] = { resposta: a.resposta, automatica: false };
    else if (a.tipo === 'concluir') {
      delete this.estado.reabertas[e.codigo];
      if (e.conclusao === 'DIVULGACAO') this.divulgada = true; // a publicação conclui com a divulgação (fora da fase interna)
      else if (e.conclusao === 'PECAS') for (const t of e.tipos_peca) this.status[t] = 'OK';
      else this.estado.registros[e.codigo] = { em: '2026-09-28' };
      // A aprovação concluída encerra a devolução que ela fez
      for (const [t, m] of Object.entries(this.estado.retornos)) if (m.de === e.codigo) delete this.estado.retornos[t];
    } else if (a.tipo === 'devolver') {
      const alvos = a.para?.length ? a.para.map((id) => this.etapa(id).codigo) : alvosDaDevolucao(this.modelo.etapas, e.codigo);
      for (const t of alvos) {
        const concluida = this.passos().find((p) => p.passo === t)?.situacao === 'CONCLUIDO';
        if (concluida) this.estado.reabertas[t] = { em: '2026-09-28' };
        delete this.estado.registros[t];
        this.estado.retornos[t] = { em: '2026-09-28', de: e.codigo };
      }
    }
  }
}

function percorrer(g: GrafoFluxo, roteiro: AcaoSimulacao[], dados: DadosCondicao) {
  const modelo: ModeloFluxo = { ...modeloSemente('DISPENSA'), aprovacao_demanda: { ...modeloSemente('DISPENSA').aprovacao_demanda, exigida: false }, etapas: projetarGrafo(g) };
  const proc = new ProcessoDeTeste(g, modelo, dados);
  const desligados = new Set(g.nos.filter((n) => n.ligada === false).map((n) => n.id));
  let r = simular(g, null, { tipo: 'iniciar' }, { dados });
  const conferirPasso = (quando: string) => expect([quando, proc.ativos()]).toEqual([quando, ids(r.estado).filter((x) => !desligados.has(x))]);
  conferirPasso('início');
  for (const a of roteiro) {
    r = simular(g, r.estado, a, { dados });
    expect(r.erro).toBeNull();
    proc.aplicar(a);
    conferirPasso(`${a.tipo} ${'no' in a ? nome(g, a.no) : ''}`);
  }
  return r;
}

describe('equivalência: simulação no grafo = motor do processo real', () => {
  it('Câmara (modelo do sistema convertido): caminho inteiro, em paralelo', () => {
    const r = percorrer(
      camara(),
      ['DFD', 'TR', 'PESQUISA', 'ETP', 'RESERVA', 'MINUTAS', 'PARECER', 'AUTORIZACAO', 'PUBLICACAO'].map((no) => ({ tipo: 'concluir', no }) as AcaoSimulacao),
      {},
    );
    expect(r.estado.fim).toBe(true);
  });

  it('Prefeitura: condição automática acima do limite, devolução à pesquisa e retorno direto a Finanças', () => {
    const c = (no: string): AcaoSimulacao => ({ tipo: 'concluir', no });
    percorrer(prefeitura(), [c('DFD'), c('PESQUISA'), { tipo: 'devolver', no: 'financas' }, c('ETP'), c('PESQUISA'), c('financas'), c('RESERVA'), c('TR'), c('MINUTAS')], { valor_total_estimado: 80000 });
  });

  it('Prefeitura: abaixo do limite, Finanças some e a reserva não espera', () => {
    const c = (no: string): AcaoSimulacao => ({ tipo: 'concluir', no });
    percorrer(prefeitura(), [c('DFD'), c('PESQUISA'), c('RESERVA'), c('ETP'), c('TR'), c('MINUTAS')], { valor_total_estimado: 1000 });
  });

  it('Prefeitura sem valor ainda: a condição pergunta (manual); a resposta "sim" abre Finanças', () => {
    const c = (no: string): AcaoSimulacao => ({ tipo: 'concluir', no });
    percorrer(prefeitura(), [c('DFD'), c('PESQUISA'), { tipo: 'responder', no: 'valor_financas', resposta: 'sim' }, c('financas'), c('RESERVA')], {});
  });

  it('fluxo com correção alcançada só por devolve (sem aresta devolve explícita → às anteriores)', () => {
    const g = demanda();
    percorrer(g, [{ tipo: 'devolver', no: 'n2' }, { tipo: 'concluir', no: 'n3' }, { tipo: 'concluir', no: 'n2' }, { tipo: 'responder', no: 'n4', resposta: 'sim' }, { tipo: 'concluir', no: 'n5' }], {});
  });
});

describe('etapas vivas', () => {
  it('modelo antigo (sem raiz) → null (todas vivas); saída não escolhida morre; correção viva com devolução ou feita', () => {
    expect(etapasVivas(modeloSemente('DISPENSA').etapas, {})).toBeNull();
    const e = projetarGrafo(prefeitura());
    expect(etapasVivas(e, {})!.has('U_FINANCAS')).toBe(true);
    expect(etapasVivas(e, { C_VALOR_FINANCAS: 'nao' })!.has('U_FINANCAS')).toBe(false);
    expect(etapasVivas(e, { C_VALOR_FINANCAS: 'nao' })!.has('RESERVA')).toBe(true);
    const d = projetarGrafo(demanda());
    expect(etapasVivas(d, {})!.has('U_N3')).toBe(false);
    expect(etapasVivas(d, {}, { retornos: { U_N3: { de: 'U_N2' } } })!.has('U_N3')).toBe(true);
  });
});

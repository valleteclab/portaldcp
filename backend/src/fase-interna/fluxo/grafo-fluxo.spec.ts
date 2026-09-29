import { EtapaDoModelo, ModeloFluxo, TipoProcessoFluxo, aplicarEdicao, dependenciasEfetivas } from './modelo-fluxo';
import { etapasDaFaseInterna } from '../tarefas/etapas-fase-interna';
import { aplicarEdicaoLegadaNoGrafo, etapaDaPeca, grafoDeEtapas, normalizarGrafo, projetarGrafo } from './grafo-fluxo';
import { modeloSemente } from './semente-fluxo';

/** Tira os campos novos (grafo) para comparar com a etapa do modelo antigo. */
const semGrafo = (e: EtapaDoModelo) => {
  const { no_id, tipo_no, raiz, devolve_para, ramos, condicao, ...resto } = e as any;
  void no_id;
  void tipo_no;
  void raiz;
  void devolve_para;
  void ramos;
  void condicao;
  return resto;
};
const porCodigo = (lista: EtapaDoModelo[]) => Object.fromEntries(lista.map((e) => [e.codigo, semGrafo(e)]));
const TIPOS: TipoProcessoFluxo[] = ['DISPENSA', 'INEXIGIBILIDADE', 'LICITACAO'];

/** Instrução com todas as peças que o modelo conhece, no status pedido. */
function instrucao(m: Pick<ModeloFluxo, 'etapas'>, status: Record<string, string> = {}) {
  return m.etapas.flatMap((e) => e.tipos_peca.map((t) => ({ tipo: t, titulo: t, obrigatorio: true, status: status[t] ?? 'PENDENTE' })));
}
/** O que o motor devolve, sem os campos novos (para comparar o antes e o depois). */
const limpo = (x: unknown) => JSON.parse(JSON.stringify(x, (k, v) => (k === 'tipo_no' || k === 'decisao' || k === 'retorno' ? undefined : v)));

describe('grafo ⇄ etapas: o modelo antigo vira grafo EQUIVALENTE', () => {
  it('projetar(converter(semente)) devolve as MESMAS etapas (todos os campos, dependências na mesma ordem) nos três tipos', () => {
    for (const tipo of TIPOS) {
      const etapas = modeloSemente(tipo).etapas;
      const projetadas = projetarGrafo(grafoDeEtapas(etapas));
      expect(porCodigo(projetadas)).toEqual(porCodigo(etapas));
      for (const e of etapas) expect([tipo, e.codigo, projetadas.find((x) => x.codigo === e.codigo)!.depende_de]).toEqual([tipo, e.codigo, e.depende_de]);
    }
  });

  it('modelo editado pelo órgão (controle interno e autorização de início ligados, prazo, pessoa, dependências trocadas) também', () => {
    const base = modeloSemente('DISPENSA');
    const { modelo } = aplicarEdicao(base, {
      etapas: [
        { codigo: 'CONTROLE_INTERNO', ligada: true },
        { codigo: 'AUTORIZACAO_INICIO', ligada: true, prazo_dias_uteis: 2 },
        { codigo: 'RESERVA', responsavel: { setor_id: '11111111-1111-1111-1111-111111111111' }, ia_rascunho: true },
        { codigo: 'TR', depende_de: ['ETP'] },
      ],
    });
    const projetadas = projetarGrafo(grafoDeEtapas(modelo.etapas));
    expect(porCodigo(projetadas)).toEqual(porCodigo(modelo.etapas));
    expect(dependenciasEfetivas(projetadas)).toEqual(dependenciasEfetivas(modelo.etapas));
  });

  it('o grafo convertido: 1 início, 1 fim, etapa sem dependência sai do início, publicação vai ao fim, parecer devolve a quem fez as peças', () => {
    const g = grafoDeEtapas(modeloSemente('DISPENSA').etapas);
    expect(g.nos.filter((n) => n.tipo === 'inicio')).toHaveLength(1);
    expect(g.nos.filter((n) => n.tipo === 'fim')).toHaveLength(1);
    expect(g.arestas.filter((a) => a.de === 'inicio').map((a) => a.para)).toEqual(['DFD']);
    expect(g.arestas.filter((a) => a.para === 'fim').map((a) => a.de)).toEqual(['PUBLICACAO']);
    const devolve = g.arestas.filter((a) => a.de === 'PARECER' && a.rotulo === 'devolve').map((a) => a.para);
    expect(devolve).toEqual(['MINUTAS', 'RESERVA', 'PESQUISA', 'TR', 'ETP', 'DFD']);
    expect(g.arestas.filter((a) => a.de === 'AUTORIZACAO' && a.rotulo === 'devolve').map((a) => a.para)).toEqual(['MINUTAS']);
    expect(g.nos.find((n) => n.id === 'PARECER')!.tipo).toBe('aprovacao');
    // Posições automáticas (o editor desenha)
    expect(g.nos.every((n) => n.x >= 40 && n.y >= 40)).toBe(true);
  });

  it('o MOTOR dá o mesmo resultado com o modelo antigo e com o grafo convertido (cada situação das peças)', () => {
    for (const tipo of ['DISPENSA', 'LICITACAO'] as TipoProcessoFluxo[]) {
      const antigo = { ...modeloSemente(tipo), aprovacao_demanda: { ...modeloSemente(tipo).aprovacao_demanda } };
      const novo = { ...antigo, etapas: projetarGrafo(grafoDeEtapas(antigo.etapas)) };
      const proc = { contratacao_direta: tipo !== 'LICITACAO', fase: 'PLANEJAMENTO', situacao: 'ATIVA' };
      const cenarios: Array<{ status: Record<string, string>; estado?: any }> = [
        { status: {} },
        { status: { DFD: 'OK' }, estado: { demanda_aprovada: false } },
        { status: { DFD: 'OK', ETP: 'EM_ELABORACAO', PP: 'OK' }, estado: { demanda_aprovada: true } },
        { status: { DFD: 'OK', ETP: 'OK', AR: 'OK', TR: 'OK', PP: 'OK', MCP: 'OK', DO: 'OK' }, estado: { reabertas: { PESQUISA: { em: '2026-09-01' } }, a_revisar: { RESERVA: { em: '2026-09-01' } } } },
        { status: Object.fromEntries(antigo.etapas.flatMap((e) => e.tipos_peca).map((t) => [t, 'OK'])) },
      ];
      for (const c of cenarios) {
        const a = etapasDaFaseInterna(proc, instrucao(antigo, c.status), antigo, {}, c.estado ?? {});
        const b = etapasDaFaseInterna(proc, instrucao(antigo, c.status), novo, {}, c.estado ?? {});
        expect(limpo(b)).toEqual(limpo(a));
      }
      // Fase externa (divulgado) e revogado
      for (const p of [{ ...proc, fase: 'PUBLICADO' }, { ...proc, situacao: 'REVOGADA' }]) {
        expect(limpo(etapasDaFaseInterna(p, instrucao(antigo), novo))).toEqual(limpo(etapasDaFaseInterna(p, instrucao(antigo), antigo)));
      }
    }
  });
});

describe('normalização (editor, IA, modelo pronto)', () => {
  it('peça (código real ou apelido) → etapa do catálogo; nó sem peça → etapa criada pelo órgão (despacho); condição com código C_', () => {
    expect(etapaDaPeca('PP', 'DISPENSA')).toBe('PESQUISA');
    expect(etapaDaPeca('AVISO', 'DISPENSA')).toBe('PUBLICACAO');
    expect(etapaDaPeca('JC', 'DISPENSA')).toBe('MINUTAS');
    expect(etapaDaPeca('JC', 'LICITACAO')).toBe('TR');
    expect(etapaDaPeca('XYZ', 'DISPENSA')).toBeNull();
    const { grafo, ajustes } = normalizarGrafo(
      {
        nos: [
          { id: 'n1', tipo: 'inicio', nome: 'Início' },
          { id: 'n2', tipo: 'etapa', nome: 'Pesquisa', pecas: ['PP'] },
          { id: 'n3', tipo: 'aprovacao', nome: 'Finanças aprova', responsavel: { tipo: 'PAPEL', valor: 'CONTABILIDADE' } },
          { id: 'n4', tipo: 'condicao', nome: 'Acima de 50 mil?', condicao: { campo: 'valor_total_estimado', operador: '>', valor: '50.000' } },
          { id: 'n5', tipo: 'etapa', nome: 'Duas etapas', pecas: ['ETP', 'TR', 'ZZZ'] },
          { id: 'n6', tipo: 'fim', nome: 'Fim' },
          { id: 'x', tipo: 'coisa' },
        ],
        arestas: [
          { de: 'n1', para: 'n2' },
          { de: 'n2', para: 'n4' },
          { de: 'n4', para: 'n3', rotulo: 'sim' },
          { de: 'n4', para: 'n6', rotulo: 'não' },
          { de: 'n3', para: 'n6' },
          { de: 'n3', para: 'n2', rotulo: 'devolve' },
          { de: 'n3', para: 'nao-existe' },
          { de: 'n2', para: 'n2' },
        ],
      },
      { tipo: 'DISPENSA' },
    );
    const no = (id: string) => grafo.nos.find((n) => n.id === id)!;
    expect(no('n2')).toMatchObject({ codigo: 'PESQUISA', pecas: ['PP', 'MCP'], conclusao: 'PECAS', tela: 'pesquisa', responsavel: { papel: 'COMPRAS' }, prazo_dias_uteis: 30 });
    expect(no('n3')).toMatchObject({ codigo: 'U_N3', pecas: [], conclusao: 'REGISTRO', responsavel: { papel: 'CONTABILIDADE', setor_id: null, usuario_id: null } });
    expect(no('n4')).toMatchObject({ codigo: 'C_N4', conclusao: 'CONDICAO', condicao: { campo: 'valor_total_estimado', operador: '>', valor: 50000 } });
    expect(no('n5').codigo).toBe('ETP');
    expect(grafo.nos.some((n) => n.id === 'x')).toBe(false);
    expect(grafo.arestas.map((a) => [a.de, a.para, a.rotulo])).toEqual([
      ['n1', 'n2', 'normal'],
      ['n2', 'n4', 'normal'],
      ['n4', 'n3', 'sim'],
      ['n4', 'n6', 'nao'],
      ['n3', 'n6', 'normal'],
      ['n3', 'n2', 'devolve'],
    ]);
    expect(ajustes.map((a) => a.mensagem).join(' | ')).toMatch(/Peça desconhecida \(ZZZ\)/);
    expect(ajustes.map((a) => a.mensagem).join(' | ')).toMatch(/2 etapas do sistema/);
    // Projeção: dependência pela condição guarda a resposta (ramos); aprovação guarda o devolve
    const e = projetarGrafo(grafo);
    expect(e.find((x) => x.codigo === 'U_N3')).toMatchObject({ depende_de: ['C_N4'], ramos: { C_N4: 'sim' }, devolve_para: ['PESQUISA'], tipo_no: 'aprovacao', raiz: false });
    expect(e.find((x) => x.codigo === 'PESQUISA')).toMatchObject({ raiz: true, depende_de: [] });
  });

  it('o grafo convertido passa pela normalização sem mudar a projeção (ida e volta do editor)', () => {
    for (const tipo of TIPOS) {
      const g = grafoDeEtapas(modeloSemente(tipo).etapas);
      const { grafo, ajustes } = normalizarGrafo(JSON.parse(JSON.stringify(g)), { tipo });
      expect(ajustes).toEqual([]);
      expect(porCodigo(projetarGrafo(grafo))).toEqual(porCodigo(projetarGrafo(g)));
    }
  });

  it('IA: responsável de fora do órgão é descartado; papel desconhecido sai', () => {
    const { grafo, ajustes } = normalizarGrafo(
      { nos: [{ id: 'a', tipo: 'aprovacao', nome: 'X', responsavel: { setor_id: 'outro', papel: 'REI' } }], arestas: [] },
      { tipo: 'DISPENSA', setores: ['s1'], descartarInvalidos: true },
    );
    expect(grafo.nos[0].responsavel).toEqual({ papel: null, setor_id: null, usuario_id: null });
    expect(ajustes).toHaveLength(2);
  });
});

describe('tela antiga (lista de etapas) sobre o grafo', () => {
  it('campos vão para o nó; dependência trocada reescreve as setas; quem ficou sem saída vai ao fim; condição e etapa criada ficam', () => {
    const base = modeloSemente('DISPENSA');
    const { grafo: g0 } = normalizarGrafo(
      {
        ...grafoDeEtapas(base.etapas),
        nos: [...grafoDeEtapas(base.etapas).nos, { id: 'fin', tipo: 'aprovacao', nome: 'Finanças', responsavel: { papel: 'CONTABILIDADE' } }],
        arestas: [...grafoDeEtapas(base.etapas).arestas, { de: 'PESQUISA', para: 'fin' }, { de: 'fin', para: 'RESERVA' }],
      },
      { tipo: 'DISPENSA' },
    );
    const antes = projetarGrafo(g0);
    const m: ModeloFluxo = { ...base, etapas: antes };
    const { modelo } = aplicarEdicao(m, { etapas: [{ codigo: 'RESERVA', prazo_dias_uteis: 9, depende_de: ['U_FIN'] }, { codigo: 'U_FIN', titulo: 'Finanças aprova' }] });
    const g = aplicarEdicaoLegadaNoGrafo(g0, antes, modelo.etapas);
    const depois = projetarGrafo(g);
    expect(depois.find((e) => e.codigo === 'RESERVA')).toMatchObject({ prazo_dias_uteis: 9, depende_de: ['U_FIN'] });
    expect(depois.find((e) => e.codigo === 'U_FIN')).toMatchObject({ titulo: 'Finanças aprova', depende_de: ['PESQUISA'] });
    // INDICACAO_MODALIDADE perdeu a saída (a reserva não depende mais dela): vai ao fim
    expect(g.arestas.some((a) => a.de === 'INDICACAO_MODALIDADE' && a.para === 'fim')).toBe(true);
  });
});

import { pendenciasDoPortao, regrasDoPortao } from '../conformidade/motor';
import { REGRAS } from '../conformidade/regras';
import type { AvaliacaoRegra } from '../conformidade/tipos';
import { PassoFaseInterna as P, etapasDaFaseInterna, passosDasEtapas } from '../tarefas/etapas-fase-interna';
import { planejarSincronizacao } from '../tarefas/tarefa-regras';
import { CODIGOS_DO_CATALOGO } from './catalogo-fluxo';
import { PAPEIS_FASE_INTERNA } from './codigos';
import {
  ModeloFluxo,
  aplicarEdicao,
  cicloNasDependencias,
  dependenciasEfetivas,
  dependentesDe,
  modeloEfetivoDoProcesso,
  niveisDoGrafo,
  snapshotDoModelo,
  tipoDoProcesso,
  validarModelo,
} from './modelo-fluxo';
import { REQUISITOS_SEMENTE, comOrdemNovaDaDireta, modeloSemente, ordemAnteriorDaDireta } from './semente-fluxo';
import { regrasDaTrava, travasSemente } from './travas';

const opcoes = { catalogo: CODIGOS_DO_CATALOGO, papeis: PAPEIS_FASE_INTERNA };
const validar = (m: ModeloFluxo, extra: Partial<Parameters<typeof validarModelo>[2]> = {}) => validarModelo(m, REQUISITOS_SEMENTE, { ...opcoes, ...extra });
const editar = (m: ModeloFluxo, etapas: any[], resto: any = {}) => aplicarEdicao(m, { etapas, ...resto }).modelo;

/**
 * Contratação direta: o MAPA APROVADO PELO DONO (§4 do plano; homologação
 * multiusuário, 27/09/2026) — … → reserva → minutas → parecer → (controle
 * interno) → AUTORIZAÇÃO → publicação (art. 53, §4º; art. 72, VI a VIII;
 * Portaria 089/2024). Até então a semente repetia as constantes antigas
 * (autorização antes das minutas e do parecer).
 */
const DEPENDENCIAS_DIRETA: Record<string, string[]> = {
  DFD: [],
  ETP: ['DFD'],
  TR: ['DFD'],
  PESQUISA: ['DFD'],
  RESERVA: ['PESQUISA'],
  MINUTAS: ['ETP', 'TR', 'RESERVA'],
  PARECER: ['MINUTAS'],
  AUTORIZACAO: ['DFD', 'ETP', 'TR', 'PESQUISA', 'RESERVA', 'PARECER'],
  PUBLICACAO: ['AUTORIZACAO', 'PARECER'],
};
const DEPENDENCIAS_RITO_ANTIGAS: Record<string, string[]> = {
  DFD: [],
  ETP: ['DFD'],
  TR: ['DFD'],
  PESQUISA: ['DFD'],
  RESERVA: ['PESQUISA'],
  MINUTAS: ['ETP', 'TR', 'PESQUISA'],
  PARECER: ['MINUTAS', 'ETP', 'TR', 'PESQUISA'],
  AUTORIZACAO: ['PARECER', 'RESERVA'],
  PUBLICACAO: ['AUTORIZACAO'],
};
const PRAZOS_089 = { DFD: null, ETP: null, TR: null, PESQUISA: 30, RESERVA: 3, AUTORIZACAO: 3, MINUTAS: 5, PARECER: 5, CONTROLE_INTERNO: 3, PUBLICACAO: 5 };

describe('semente "Câmara — Portaria 089"', () => {
  it('dependências efetivas (opcionais desligadas atravessadas): direta (dispensa e inexigibilidade) no mapa do dono; rito igual às constantes antigas', () => {
    for (const tipo of ['DISPENSA', 'INEXIGIBILIDADE'] as const) {
      const direta = dependenciasEfetivas(modeloSemente(tipo).etapas);
      for (const [k, v] of Object.entries(DEPENDENCIAS_DIRETA)) expect([tipo, k, [...(direta.get(k) ?? [])].sort()]).toEqual([tipo, k, [...v].sort()]);
    }
    const rito = dependenciasEfetivas(modeloSemente('LICITACAO').etapas);
    for (const [k, v] of Object.entries(DEPENDENCIAS_RITO_ANTIGAS)) expect([k, [...(rito.get(k) ?? [])].sort()]).toEqual([k, [...v].sort()]);
  });

  it('prazos da Portaria 089, controle interno e as duas etapas novas desligados, aprovação da demanda exigida', () => {
    const m = modeloSemente('DISPENSA');
    for (const [k, v] of Object.entries(PRAZOS_089)) expect([k, m.etapas.find((e) => e.codigo === k)!.prazo_dias_uteis]).toEqual([k, v]);
    const ligada = (c: string) => m.etapas.find((e) => e.codigo === c)!.ligada;
    expect([ligada('CONTROLE_INTERNO'), ligada('AUTORIZACAO_INICIO'), ligada('INDICACAO_MODALIDADE')]).toEqual([false, false, false]);
    expect(m.aprovacao_demanda).toMatchObject({ exigida: true, etapa: 'DFD', aprovador: { tipo: 'PERMISSAO' } });
  });

  it('a semente é válida pela lei nos três tipos', () => {
    for (const t of ['DISPENSA', 'INEXIGIBILIDADE', 'LICITACAO'] as const) expect(validar(modeloSemente(t))).toMatchObject({ ok: true, erros: [] });
  });

  it('travas por ato semeadas = portões de sempre (A, B, C)', () => {
    const t = travasSemente();
    expect(t.filter((x) => x.ato === 'CONCLUIR_PESQUISA').map((x) => x.regra)).toEqual(regrasDoPortao('A').map((r) => r.codigo));
    expect(t.filter((x) => x.ato === 'AUTORIZAR').map((x) => x.regra)).toEqual(regrasDoPortao('B').map((r) => r.codigo));
    expect(t.filter((x) => x.ato === 'PUBLICAR').map((x) => x.regra)).toEqual(regrasDoPortao('C').map((r) => r.codigo));
    expect(t.every((x) => x.severidade === REGRAS.find((r) => r.codigo === x.regra)!.severidade)).toBe(true);
  });

  it('tipo do processo: a mesma classificação do rito (direta × licitação), inexigibilidade à parte', () => {
    expect(tipoDoProcesso('DISPENSA_ELETRONICA', true)).toBe('DISPENSA');
    expect(tipoDoProcesso('INEXIGIBILIDADE', true)).toBe('INEXIGIBILIDADE');
    expect(tipoDoProcesso('CREDENCIAMENTO', true)).toBe('INEXIGIBILIDADE');
    expect(tipoDoProcesso('PREGAO_ELETRONICO', false)).toBe('LICITACAO');
  });
});

describe('validação do modelo pela lei (erro com o artigo)', () => {
  const base = modeloSemente('DISPENSA');

  it('sem a autorização da autoridade: recusa citando o art. 72, VIII', () => {
    const r = validar(editar(base, [{ codigo: 'AUTORIZACAO', obrigatoria: false, ligada: false }]));
    expect(r.ok).toBe(false);
    expect(r.erros.find((e) => e.codigo === 'RL-CD-AUTORIZACAO')).toMatchObject({ fundamento: 'art. 72, VIII', mensagem: expect.stringMatching(/autorização da autoridade.*art\. 72, VIII/) });
  });

  it('autorização antes da pesquisa e da reserva: recusa (art. 72, II, IV e VIII)', () => {
    const r = validar(editar(base, [{ codigo: 'AUTORIZACAO', depende_de: ['DFD', 'ETP', 'TR'] }]));
    expect(r.erros.map((e) => e.codigo)).toEqual(expect.arrayContaining(['RL-CD-AUT-PESQ', 'RL-CD-AUT-RES']));
    expect(r.erros.find((e) => e.codigo === 'RL-CD-AUT-PESQ')!.mensagem).toMatch(/art\. 72, II e VIII/);
  });

  it('obrigatória não se desliga; opcional pode ligar e desligar', () => {
    expect(validar(editar(base, [{ codigo: 'PESQUISA', ligada: false }])).erros.map((e) => e.codigo)).toContain('OBRIGATORIA_DESLIGADA');
    expect(validar(editar(base, [{ codigo: 'AUTORIZACAO_INICIO', ligada: true }, { codigo: 'CONTROLE_INTERNO', ligada: true }])).ok).toBe(true);
  });

  it('ciclo nas dependências é recusado', () => {
    const m = editar(base, [{ codigo: 'DFD', depende_de: ['PUBLICACAO'] }]);
    expect(cicloNasDependencias(m.etapas)).not.toBeNull();
    expect(validar(m).erros.map((e) => e.codigo)).toContain('CICLO');
  });

  it('parecer dispensável por ato: permitido na contratação direta; recusado na licitação (art. 53, caput)', () => {
    expect(validar(editar(base, [{ codigo: 'PARECER', dispensavel_por_ato: true }])).ok).toBe(true);
    const lic = validar(editar(modeloSemente('LICITACAO'), [{ codigo: 'PARECER', dispensavel_por_ato: true }]));
    expect(lic.erros.find((e) => e.codigo === 'DISPENSA_NAO_PERMITIDA')).toMatchObject({ fundamento: 'art. 53, caput' });
  });

  it('responsável de outro órgão e prazo inválido são recusados', () => {
    const m = editar(base, [{ codigo: 'RESERVA', responsavel: { setor_id: 's-outro' } }]);
    expect(validar(m, { setores: ['s-meu'] }).erros.map((e) => e.codigo)).toContain('SETOR_DE_OUTRO_ORGAO');
    const e = aplicarEdicao(base, { etapas: [{ codigo: 'RESERVA', prazo_dias_uteis: 999 }, { codigo: 'XYZ' }] });
    expect(e.erros.map((x) => x.codigo)).toEqual(['PRAZO_INVALIDO', 'ETAPA_DESCONHECIDA']);
  });

  it('segregação de funções: a mesma pessoa na pesquisa e na autorização gera AVISO (art. 7º, §1º), não erro', () => {
    const m = editar(base, [
      { codigo: 'PESQUISA', responsavel: { usuario_id: 'u1' } },
      { codigo: 'AUTORIZACAO', responsavel: { papel: 'AUTORIDADE' } },
    ]);
    const r = validar(m, { usuarios: [{ id: 'u1', nome: 'Ana', papeis: ['AUTORIDADE'], setor_id: null }], setores: [] });
    expect(r.ok).toBe(true);
    expect(r.avisos[0]).toMatchObject({ codigo: 'RL-SEG-PESQ-AUT', fundamento: 'art. 7º, §1º', mensagem: expect.stringMatching(/Ana/) });
  });
});

describe('ordem da contratação direta (homologação multiusuário, 27/09/2026)', () => {
  it('a semente não tem aviso de ordem: autorização depois do parecer nos dois tipos da contratação direta', () => {
    for (const t of ['DISPENSA', 'INEXIGIBILIDADE'] as const) expect(validar(modeloSemente(t)).avisos.filter((a) => a.codigo === 'AVISO_AUTORIZACAO_ANTES_DO_PARECER')).toEqual([]);
  });

  it('autorização antes do parecer: salva (não é erro), mas com AVISO citando o art. 53, §4º — só na contratação direta', () => {
    const antigo = editar(modeloSemente('DISPENSA'), [
      { codigo: 'AUTORIZACAO', depende_de: ['DFD', 'ETP', 'TR', 'PESQUISA', 'RESERVA'] },
      { codigo: 'MINUTAS', depende_de: ['AUTORIZACAO'] },
      { codigo: 'PUBLICACAO', depende_de: ['PARECER', 'CONTROLE_INTERNO'] },
    ]);
    const r = validar(antigo);
    expect(r.ok).toBe(true);
    expect(r.avisos).toContainEqual(expect.objectContaining({ codigo: 'AVISO_AUTORIZACAO_ANTES_DO_PARECER', fundamento: 'art. 53, §4º', etapa: 'AUTORIZACAO' }));
    expect(validar(modeloSemente('LICITACAO')).avisos.some((a) => a.codigo === 'AVISO_AUTORIZACAO_ANTES_DO_PARECER')).toBe(false);
  });

  it('migração de boot: reconhece a ordem anterior intocada e aplica a nova (sem mexer no resto do órgão)', () => {
    const antigo = editar(modeloSemente('INEXIGIBILIDADE'), [
      { codigo: 'AUTORIZACAO', ordem: 60, depende_de: ['DFD', 'ETP', 'TR', 'PESQUISA', 'RESERVA'] },
      { codigo: 'MINUTAS', ordem: 70, depende_de: ['AUTORIZACAO'] },
      { codigo: 'PARECER', ordem: 80, depende_de: ['MINUTAS'] },
      { codigo: 'CONTROLE_INTERNO', ordem: 90, depende_de: ['PARECER'] },
      { codigo: 'PUBLICACAO', ordem: 100, depende_de: ['PARECER', 'CONTROLE_INTERNO'] },
      { codigo: 'TR', prazo_dias_uteis: 7 },
    ]);
    expect(ordemAnteriorDaDireta(antigo.etapas)).toBe(true);
    const novo = comOrdemNovaDaDireta(antigo.etapas);
    expect(ordemAnteriorDaDireta(novo)).toBe(false); // idempotente: não reaplica
    const dep = (c: string) => novo.find((e) => e.codigo === c)!.depende_de;
    expect(dep('AUTORIZACAO')).toEqual(expect.arrayContaining(['PARECER']));
    expect(dep('MINUTAS')).not.toContain('AUTORIZACAO');
    expect(novo.find((e) => e.codigo === 'TR')!.prazo_dias_uteis).toBe(7);
    // Modelo editado pelo órgão (outra ordem) não é reconhecido: fica como está
    expect(ordemAnteriorDaDireta(editar(antigo, [{ codigo: 'MINUTAS', depende_de: ['AUTORIZACAO', 'RESERVA'] }]).etapas)).toBe(false);
  });

  it('"exigir a posse para trabalhar nas peças": ligada na semente, editável (booleano) e segue o modelo vigente no processo', () => {
    const m = modeloSemente('DISPENSA');
    expect(m.exigir_posse_pecas).toBe(true);
    const desl = aplicarEdicao(m, { exigir_posse_pecas: false });
    expect(desl.erros).toEqual([]);
    expect(desl.modelo.exigir_posse_pecas).toBe(false);
    expect(aplicarEdicao(m, { exigir_posse_pecas: 'sim' }).erros[0]).toMatchObject({ codigo: 'CAMPO_INVALIDO' });
    expect(modeloEfetivoDoProcesso(snapshotDoModelo(m), desl.modelo).exigir_posse_pecas).toBe(false);
  });
});

describe('desenho e dependências (paralelo)', () => {
  it('níveis do grafo: etapas independentes na mesma coluna', () => {
    expect(niveisDoGrafo(modeloSemente('DISPENSA').etapas).map((n) => n.etapas)).toEqual([
      ['DFD'],
      ['ETP', 'TR', 'PESQUISA'],
      ['RESERVA'],
      ['MINUTAS'],
      ['PARECER'],
      ['AUTORIZACAO'],
      ['PUBLICACAO'],
    ]);
    const comInicio = editar(modeloSemente('DISPENSA'), [{ codigo: 'AUTORIZACAO_INICIO', ligada: true }]);
    expect(niveisDoGrafo(comInicio.etapas).slice(0, 3).map((n) => n.etapas)).toEqual([['DFD'], ['AUTORIZACAO_INICIO'], ['ETP', 'TR', 'PESQUISA']]);
  });

  it('dependentes (transitivos) de uma etapa', () => {
    expect(dependentesDe(modeloSemente('DISPENSA').etapas, 'PESQUISA').sort()).toEqual(['AUTORIZACAO', 'MINUTAS', 'PARECER', 'PUBLICACAO', 'RESERVA']);
    expect(dependentesDe(modeloSemente('DISPENSA').etapas, 'PARECER').sort()).toEqual(['AUTORIZACAO', 'PUBLICACAO']);
  });
});

describe('etapasDaFaseInterna com o modelo (F1)', () => {
  const direta = { contratacao_direta: true, fase: 'PLANEJAMENTO', situacao: 'ATIVA' };
  const instr = (status: Record<string, string>) =>
    ['DFD', 'PP', 'AA', 'ETP', 'TR', 'AR', 'PJ', 'DO', 'JC', 'DP', 'RAG', 'MC'].map((tipo) => ({ tipo, titulo: tipo, obrigatorio: false, status: status[tipo] ?? 'PENDENTE' }));
  const passo = (etapas: ReturnType<typeof etapasDaFaseInterna>, p: string) => passosDasEtapas(etapas).find((x) => x.passo === p)!;
  const m = modeloSemente('DISPENSA');

  it('com a DFD pronta, estudo, TR e pesquisa podem começar em paralelo', () => {
    const e = etapasDaFaseInterna(direta, instr({ DFD: 'OK' }), m, {}, { demanda_aprovada: true });
    expect(['ETP', 'TR', 'PESQUISA'].map((c) => [passo(e, c).situacao, passo(e, c).pode_iniciar])).toEqual([
      ['DISPONIVEL', true],
      ['DISPONIVEL', true],
      ['DISPONIVEL', true],
    ]);
    expect(passo(e, 'RESERVA')).toMatchObject({ situacao: 'AGUARDANDO', pode_iniciar: false, pendencias: ['PESQUISA'] });
  });

  it('aprovação da demanda exigida e não dada: a DFD pronta aguarda a aprovação e as demais aguardam', () => {
    const e = etapasDaFaseInterna(direta, instr({ DFD: 'OK' }), m, {}, { demanda_aprovada: false });
    expect(passo(e, 'DFD')).toMatchObject({ situacao: 'EM_ANDAMENTO', aguardando_aprovacao: true, pode_iniciar: true, aguardando_demanda: false });
    expect(passo(e, 'ETP')).toMatchObject({ situacao: 'AGUARDANDO', pode_iniciar: false, aguardando_demanda: true });
    // Homologação multiusuário: peça começada antes da aprovação não faz a etapa "poder começar" — nem gera tarefa
    const cedo = etapasDaFaseInterna(direta, instr({ DFD: 'OK', PP: 'EM_ELABORACAO' }), m, {}, { demanda_aprovada: false });
    expect(passo(cedo, 'PESQUISA')).toMatchObject({ situacao: 'EM_ANDAMENTO', pode_iniciar: false, aguardando_demanda: true });
    const plano = planejarSincronizacao(passosDasEtapas(cedo), [], () => ({ usuario_id: 'u', papel: null, setor_id: null }));
    expect(plano.criar.map((c) => c.passo.passo)).toEqual(['DFD']);
    // modelo sem a exigência: segue como antes
    const sem = { ...m, aprovacao_demanda: { ...m.aprovacao_demanda, exigida: false } };
    expect(passo(etapasDaFaseInterna(direta, instr({ DFD: 'OK' }), sem, {}, { demanda_aprovada: false }), 'DFD').situacao).toBe('CONCLUIDO');
  });

  it('etapa opcional de REGISTRO ligada: as seguintes esperam o despacho; registrado, seguem', () => {
    const comInicio = editar(m, [{ codigo: 'AUTORIZACAO_INICIO', ligada: true }]);
    const antes = etapasDaFaseInterna(direta, instr({ DFD: 'OK' }), comInicio);
    expect(passo(antes, 'AUTORIZACAO_INICIO')).toMatchObject({ situacao: 'DISPONIVEL', conclusao: 'REGISTRO', opcional: true });
    expect(passo(antes, 'ETP')).toMatchObject({ situacao: 'AGUARDANDO', pendencias: ['AUTORIZACAO_INICIO'] });
    const depois = etapasDaFaseInterna(direta, instr({ DFD: 'OK' }), comInicio, {}, { registros: { AUTORIZACAO_INICIO: { em: '2026-09-26T10:00:00Z', texto: 'Autorizo o início.' } } });
    expect(passo(depois, 'AUTORIZACAO_INICIO').situacao).toBe('CONCLUIDO');
    expect(passo(depois, 'ETP').situacao).toBe('DISPONIVEL');
  });

  it('voltar: a etapa reaberta não conclui e a dependente concluída fica "a revisar" (tarefa de revisão só quando a reaberta concluir)', () => {
    const status = { DFD: 'OK', ETP: 'OK', AR: 'OK', TR: 'OK', PP: 'OK' };
    const estado = {
      demanda_aprovada: true,
      reabertas: { PESQUISA: { em: '2026-09-26T10:00:00Z', motivo: 'Cotação vencida' } },
      a_revisar: { RESERVA: { em: '2026-09-26T10:00:00Z', motivo: 'pesquisa reaberta' } },
    };
    const e = etapasDaFaseInterna(direta, instr({ ...status, DO: 'OK' }), m, {}, estado);
    expect(passo(e, 'PESQUISA')).toMatchObject({ situacao: 'EM_ANDAMENTO', reaberta: { motivo: 'Cotação vencida' } });
    expect(passo(e, 'RESERVA')).toMatchObject({ situacao: 'A_REVISAR', a_revisar: { motivo: 'pesquisa reaberta' }, pendencias: ['PESQUISA'] });
    expect(passo(e, 'AUTORIZACAO').situacao).toBe('AGUARDANDO');
    const resp = () => ({ usuario_id: 'u1', papel: null, setor_id: null });
    const plano = planejarSincronizacao(passosDasEtapas(e), [], resp);
    expect(plano.criar.map((c) => c.passo.passo)).toContain(P.PESQUISA);
    expect(plano.criar.map((c) => c.passo.passo)).not.toContain(P.RESERVA);
    // a pesquisa revista (marca limpa): a reserva a revisar ganha a tarefa
    const depois = etapasDaFaseInterna(direta, instr({ ...status, DO: 'OK' }), m, {}, { ...estado, reabertas: {} });
    expect(planejarSincronizacao(passosDasEtapas(depois), [], resp).criar.map((c) => c.passo.passo)).toContain(P.RESERVA);
  });
});

describe('modelo do processo: snapshot (caminho) + operacional vigente', () => {
  it('editar as dependências depois não muda o processo em andamento; prazo e opcional ligada seguem o vigente', () => {
    const snap = snapshotDoModelo(modeloSemente('DISPENSA'));
    const vigente = editar(modeloSemente('DISPENSA'), [
      { codigo: 'RESERVA', depende_de: ['PESQUISA', 'TR'], prazo_dias_uteis: 7 },
      { codigo: 'CONTROLE_INTERNO', ligada: true },
      { codigo: 'PESQUISA', responsavel: { papel: 'AGENTE_CONTRATACAO' } },
    ]);
    const efetivo = modeloEfetivoDoProcesso(snap, vigente);
    const e = (c: string) => efetivo.etapas.find((x) => x.codigo === c)!;
    expect(e('RESERVA').depende_de).toEqual(['PESQUISA', 'INDICACAO_MODALIDADE']);
    expect(e('RESERVA').prazo_dias_uteis).toBe(7);
    expect(e('CONTROLE_INTERNO').ligada).toBe(true);
    expect(e('PESQUISA').responsavel.papel).toBe('AGENTE_CONTRATACAO');
  });

  it('opcional ligada depois: entra só se o processo ainda não passou por ela', () => {
    const snap = snapshotDoModelo(modeloSemente('DISPENSA'));
    const efetivo = modeloEfetivoDoProcesso(snap, editar(modeloSemente('DISPENSA'), [{ codigo: 'AUTORIZACAO_INICIO', ligada: true }]));
    expect(efetivo.etapas.find((x) => x.codigo === 'AUTORIZACAO_INICIO')).toMatchObject({ ligada: true, entrou_depois: true });
    const proc = { contratacao_direta: true, fase: 'PLANEJAMENTO', situacao: 'ATIVA' };
    const instr = (status: Record<string, string>) => ['DFD', 'ETP', 'TR', 'PP'].map((tipo) => ({ tipo, titulo: tipo, obrigatorio: false, status: status[tipo] ?? 'PENDENTE' }));
    const tem = (st: Record<string, string>) => passosDasEtapas(etapasDaFaseInterna(proc, instr(st), efetivo)).some((p) => p.passo === 'AUTORIZACAO_INICIO');
    expect(tem({ DFD: 'OK' })).toBe(true); // ninguém depois dela começou: entra
    expect(tem({ DFD: 'OK', ETP: 'EM_ELABORACAO' })).toBe(false); // o estudo já começou: fica fora
  });
});

describe('travas por ato em dados', () => {
  it('rebaixar a severidade no ato (BLOQUEIO → ATENÇÃO) deixa de travar; desativar tira a regra do ato', () => {
    const lim = REGRAS.find((r) => r.codigo === 'LIM-01')!;
    const av: AvaliacaoRegra[] = [
      { regra: lim, aplicavel: true, motivo: null, achados: [{ regra: 'LIM-01', chave: 'x', severidade: 'BLOQUEIO', titulo: 't', mensagem: 'acima do limite', evidencias: [] }] },
    ];
    const travas = travasSemente();
    expect(pendenciasDoPortao('A', av, new Set(), regrasDaTrava(travas, 'CONCLUIR_PESQUISA'))).toHaveLength(1);
    const rebaixada = travas.map((t) => (t.regra === 'LIM-01' ? { ...t, severidade: 'ATENCAO' as const } : t));
    expect(pendenciasDoPortao('A', av, new Set(), regrasDaTrava(rebaixada, 'CONCLUIR_PESQUISA'))).toEqual([]);
    const desativada = travas.map((t) => (t.regra === 'LIM-01' ? { ...t, ativa: false } : t));
    expect(pendenciasDoPortao('A', av, new Set(), regrasDaTrava(desativada, 'CONCLUIR_PESQUISA'))).toEqual([]);
  });
});

import { definicaoDoNo } from '../nos/catalogo-nos';
import { ETAPAS_EXIGIDAS, normalizarEtapas } from '../desenho/desenho';
import { normalizarAplicacao } from '../aplicacao/aplicacao-fluxo';
import { CHAVES_FLUXO_PADRAO_CONTRATACAO, MODELOS_PRONTOS, modeloPronto, setorSugerido } from './catalogo-modelos';
import { ehFluxoDeInstrucao, errosDaInstrucao } from '../nos/definicao-modalidade';

describe('catálogo de modelos prontos', () => {
  it.each(MODELOS_PRONTOS.map((m) => [m.chave, m]))('%s: etapas válidas para o desenho, com as exigidas pela lei', (_chave, m) => {
    for (const e of m.etapas) expect(definicaoDoNo(e.tipo)?.disponivel).toBe(true);
    const etapas = normalizarEtapas({ etapas: m.etapas.map((e, i) => ({ chave: `novo-${i}`, tipo: e.tipo, nome: e.nome, responsavel_tipo: e.solicitante ? 'SOLICITANTE' : 'SETOR', prazo_dias_uteis: e.prazo })) });
    expect(etapas).toHaveLength(m.etapas.length);
    const tipos = m.etapas.map((e) => e.tipo);
    expect(errosDaInstrucao(tipos)).toEqual([]);
    // A instrução não tem parecer nem publicação: ficam nos fluxos de modalidade
    if (!ehFluxoDeInstrucao(tipos)) for (const exigida of ETAPAS_EXIGIDAS[m.tipo_processo] ?? []) expect(tipos.includes(exigida)).toBe(true);
    if (m.aplicacao) expect(normalizarAplicacao(m.aplicacao)).toEqual(m.aplicacao);
  });

  it('chaves únicas, sem colidir com as rotas antigas', () => {
    const chaves = MODELOS_PRONTOS.map((m) => m.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    expect(chaves).not.toContain('aditivo');
    expect(chaves).not.toContain('demanda-dfd');
    expect(modeloPronto('inexigibilidade-camara')?.aplicacao?.modalidades).toEqual(['INEXIGIBILIDADE']);
    // Instrução: termina na Definição da modalidade; os de modalidade começam no Despacho da Mesa
    expect(modeloPronto('instrucao-contratacao-camara')?.etapas.at(-1)?.tipo).toBe('DEFINICAO_MODALIDADE');
    expect(modeloPronto('inexigibilidade-camara')?.etapas[0].tipo).toBe('APROVACAO');
    expect(modeloPronto('dispensa-camara')?.aplicacao?.modalidades).toEqual(['DISPENSA_ELETRONICA']);
    expect(modeloPronto('contratacao-padrao')?.aplicacao?.padrao).toBe(true);
  });

  // Travas do art. 72 (11/2026): a autoridade não autoriza antes do relatório do agente
  // nem do parecer; o fluxo termina na publicação (o resto são atos da licitação).
  const deModalidade = MODELOS_PRONTOS.filter((m) => m.tipo_processo === 'CONTRATACAO' && m.aplicacao);
  it.each(deModalidade.map((m) => [m.chave, m]))('%s: relatório e parecer antes da autorização; termina na publicação', (_c, m) => {
    const tipos = m.etapas.map((e) => e.tipo);
    const pos = (t: string) => tipos.indexOf(t);
    expect(pos('MINUTAS')).toBeGreaterThanOrEqual(0);
    expect(pos('MINUTAS')).toBeLessThan(pos('AUTORIZACAO'));
    expect(pos('PARECER_JURIDICO')).toBeLessThan(pos('AUTORIZACAO'));
    expect(tipos.at(-1)).toBe('PUBLICACAO');
    expect(tipos.slice(pos('AUTORIZACAO') + 1)).not.toContain('APROVACAO');
  });

  it('fluxo padrão da contratação: só chaves que existem, uma instrução e um padrão', () => {
    const modelos = CHAVES_FLUXO_PADRAO_CONTRATACAO.map((c) => modeloPronto(c));
    expect(modelos.every(Boolean)).toBe(true);
    expect(modelos.filter((m) => !m!.aplicacao)).toHaveLength(1);
    expect(modelos.filter((m) => m!.aplicacao?.padrao)).toHaveLength(1);
  });
});

describe('setorSugerido', () => {
  const setores = [
    { id: '1', nome: 'Departamento de Contabilidade' },
    { id: '2', nome: 'Procuradoria Jurídica' },
    { id: '3', nome: 'Gabinete da Presidência' },
    { id: '4', nome: 'Setor de Licitações e Contratos' },
    { id: '5', nome: 'Recursos Humanos' },
    { id: '6', nome: 'Gerência de Compras' },
  ];

  it('acha pelo trecho do nome, sem acento e sem caixa', () => {
    expect(setorSugerido(setores, ['jurid'])).toBe('2');
    expect(setorSugerido(setores, ['presid', 'gabinete'])).toBe('3');
    expect(setorSugerido(setores, ['licita'])).toBe('4');
  });

  it('sigla curta só como palavra inteira', () => {
    expect(setorSugerido([{ id: 'x', nome: 'Arquivo' }], ['rh'])).toBeNull();
    expect(setorSugerido([{ id: 'y', nome: 'RH' }], ['rh'])).toBe('y');
  });

  it('sem setor parecido: nulo (a ativação pede o responsável)', () => {
    expect(setorSugerido(setores, ['patrim'])).toBeNull();
  });
});

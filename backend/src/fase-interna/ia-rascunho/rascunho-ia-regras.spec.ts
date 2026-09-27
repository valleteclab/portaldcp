import { MODELOS_PADRAO } from '../modelos-padrao';
import {
  DEFINICOES_RASCUNHO,
  DadosContexto,
  GERANDO_EXPIRA_MS,
  PassoParaRascunho,
  anonimizar,
  camposDoRascunho,
  etapaDaPeca,
  extrairJson,
  htmlSeguro,
  interpretarResposta,
  montarContexto,
  montarPrompt,
  rascunhosAoChegar,
  resumoIaDaPeca,
  secoesParaAplicar,
  situacaoVisivel,
} from './rascunho-ia-regras';

const LIC = '11111111-1111-1111-1111-111111111111';
const passo = (p: Partial<PassoParaRascunho>): PassoParaRascunho => ({
  passo: 'DFD',
  situacao: 'DISPONIVEL',
  pode_iniciar: true,
  ia_rascunho: true,
  conclusao: 'PECAS',
  pecas: [{ tipo: 'DFD', pronta: false }],
  reaberta: null,
  ...p,
});
const secoesDe = (tipo: string) => MODELOS_PADRAO.find((m) => m.tipo === tipo)!.secoes;

const dados = (over: Partial<DadosContexto> = {}): DadosContexto => ({
  processo: {
    numero_processo: '139/2025',
    objeto: 'Aquisição de material de expediente',
    modalidade: 'Dispensa eletrônica',
    contratacao_direta: true,
    fundamento: 'art. 75, II, da Lei nº 14.133/2021',
    sigiloso: false,
    valor_estimado: 12345.67,
    orgao: 'Câmara Municipal',
  },
  itens: [{ numero_item: 1, descricao: 'Papel A4 75g', quantidade: 100, unidade: 'RESMA', valor_unitario: 25.5 }],
  reserva: { dotacao: 'Elemento 3.3.90.30', situacao: 'reservada', leis: 'a LOA 2026' },
  pecas_prontas: [],
  ...over,
});

describe('F4a — rascunho da IA: quando nasce sozinho', () => {
  it('etapa disponível com ia_rascunho ligado e peça não pronta → um rascunho, com chave idempotente', () => {
    expect(rascunhosAoChegar(LIC, [passo({})])).toEqual([{ etapa: 'DFD', peca: 'DFD', chave: `auto:${LIC}:DFD:DFD` }]);
  });

  it('não nasce: IA desligada no modelo, etapa aguardando/dependência pendente, peça pronta ou etapa concluída', () => {
    expect(rascunhosAoChegar(LIC, [passo({ ia_rascunho: false })])).toEqual([]);
    expect(rascunhosAoChegar(LIC, [passo({ situacao: 'AGUARDANDO', pode_iniciar: false })])).toEqual([]);
    expect(rascunhosAoChegar(LIC, [passo({ pecas: [{ tipo: 'DFD', pronta: true }] })])).toEqual([]);
    expect(rascunhosAoChegar(LIC, [passo({ situacao: 'CONCLUIDO' })])).toEqual([]);
    // Etapa sem rascunho da IA no catálogo (pesquisa tem o agente próprio)
    expect(rascunhosAoChegar(LIC, [passo({ passo: 'PESQUISA', pecas: [{ tipo: 'PP', pronta: false }] })])).toEqual([]);
  });

  it('em andamento também vale; cada peça da etapa com rascunho (TR, autorização, parecer, controle interno)', () => {
    const r = rascunhosAoChegar(LIC, [
      passo({ passo: 'TR', situacao: 'EM_ANDAMENTO', pecas: [{ tipo: 'TR', pronta: false }, { tipo: 'PB', pronta: false }] }),
      passo({ passo: 'AUTORIZACAO', pecas: [{ tipo: 'AA', pronta: false }, { tipo: 'DP', pronta: false }] }),
      passo({ passo: 'PARECER', pecas: [{ tipo: 'PJ', pronta: false }] }),
      passo({ passo: 'CONTROLE_INTERNO', pecas: [{ tipo: 'MCI', pronta: false }] }),
    ]);
    expect(r.map((x) => x.peca)).toEqual(['TR', 'AA', 'PJ', 'MCI']);
  });

  it('etapa de REGISTRO (despacho) disponível → rascunho do despacho', () => {
    expect(rascunhosAoChegar(LIC, [passo({ passo: 'AUTORIZACAO_INICIO', conclusao: 'REGISTRO', pecas: [] })])).toEqual([
      { etapa: 'AUTORIZACAO_INICIO', peca: 'REGISTRO', chave: `auto:${LIC}:AUTORIZACAO_INICIO:REGISTRO` },
    ]);
  });

  it('etapa REABERTA ganha chave nova (novo ciclo); sincronizar de novo não muda a chave', () => {
    const a = rascunhosAoChegar(LIC, [passo({})])[0].chave;
    expect(rascunhosAoChegar(LIC, [passo({})])[0].chave).toBe(a);
    const b = rascunhosAoChegar(LIC, [passo({ situacao: 'EM_ANDAMENTO', reaberta: { em: '2026-09-27T10:00:00.000Z' } })])[0].chave;
    expect(b).not.toBe(a);
    expect(b).toContain(':r2026-09-27T10:00:00.000Z');
  });

  it('etapa de cada peça', () => {
    expect(etapaDaPeca('AA')).toBe('AUTORIZACAO');
    expect(etapaDaPeca('PJ')).toBe('PARECER');
    expect(etapaDaPeca('REGISTRO')).toBeNull();
  });
});

describe('F4a — privacidade do contexto', () => {
  it('anonimizar tira CPF, CNPJ, e-mail e telefone e preserva valores e números do processo', () => {
    const t = anonimizar('Fulano CPF 123.456.789-09 (12345678909), CNPJ 12.345.678/0001-90, fulano@orgao.gov.br, tel (77) 99999-1234 e 3611-2233. PA 139/2025, R$ 1.234,56, 100 resmas.');
    expect(t).not.toMatch(/123\.456\.789-09|12345678909|12\.345\.678\/0001-90|fulano@|99999-1234|3611-2233/);
    expect(t).toContain('[CPF]');
    expect(t).toContain('[CNPJ]');
    expect(t).toContain('[e-mail]');
    expect(t).toContain('[telefone]');
    expect(t).toContain('PA 139/2025');
    expect(t).toContain('R$ 1.234,56');
    expect(t).toContain('100 resmas');
  });

  it('contexto: dados do processo, itens e peças prontas; juntada só com nº e data', () => {
    const c = montarContexto(
      dados({
        pecas_prontas: [
          { tipo: 'DFD', titulo: 'DFD', anexada: false, secoes: { demanda: '<p>Falta papel. Contato: joao@x.com</p>' } },
          { tipo: 'PP', titulo: 'Pesquisa de preços', anexada: true, numero: 'PP 01/2026', data: '2026-09-20' },
        ],
      }),
    );
    expect(c).toContain('Processo administrativo nº 139/2025');
    expect(c).toContain('art. 75, II');
    expect(c).toContain('Papel A4 75g — 100 RESMA');
    expect(c).toContain('R$');
    expect(c).toContain('[demanda] Falta papel. Contato: [e-mail]');
    expect(c).toContain('Pesquisa de preços: juntada (feita fora), nº PP 01/2026, de 2026-09-20.');
    expect(c).not.toContain('joao@x.com');
  });

  it('orçamento SIGILOSO (art. 24): nenhum valor sai do sistema', () => {
    const c = montarContexto(dados({ processo: { ...dados().processo, sigiloso: true } }));
    expect(c).toContain('SIGILOSO');
    expect(c).not.toContain('12.345,67');
    expect(c).not.toMatch(/valor unitário/);
  });
});

describe('F4a — seções pedidas à IA (modelo do documento)', () => {
  it('DFD: só a necessidade (a seção que a tela mostra); quantidades, PCA e data o sistema monta', () => {
    expect(camposDoRascunho(DEFINICOES_RASCUNHO.DFD, secoesDe('DFD')).map((c) => c.id)).toEqual(['demanda']);
  });

  it('ETP/TR: todas as seções do modelo, menos as preenchidas com dados do processo', () => {
    const etp = camposDoRascunho(DEFINICOES_RASCUNHO.ETP, secoesDe('ETP')).map((c) => c.id);
    expect(etp).toContain('necessidade');
    expect(etp).toContain('viabilidade');
    expect(etp).not.toContain('estimativa_valor');
    expect(etp).not.toContain('previsao_pca');
    const tr = camposDoRascunho(DEFINICOES_RASCUNHO.TR, secoesDe('TR')).map((c) => c.id);
    expect(tr).toContain('objeto');
    expect(tr).not.toContain('estimativa_valor_tr');
    expect(tr).not.toContain('dotacao_orcamentaria_tr');
  });

  it('seção com texto padrão do modelo do órgão (lê o processo) não é da IA', () => {
    const campos = camposDoRascunho(DEFINICOES_RASCUNHO.ETP, [
      { id: 'necessidade', titulo: '1. Necessidade *' },
      { id: 'solucao', titulo: 'Solução', texto_padrao: '<p>{{licitacao.objeto}}</p>' },
    ]);
    expect(campos.map((c) => c.id)).toEqual(['necessidade']);
    expect(campos[0].titulo).toBe('1. Necessidade');
  });

  it('peças sem seções no modelo: campos fixos (autorização, parecer, controle interno, despacho)', () => {
    expect(camposDoRascunho(DEFINICOES_RASCUNHO.AA, []).map((c) => c.id)).toEqual(['autorizacao']);
    expect(camposDoRascunho(DEFINICOES_RASCUNHO.PJ, []).map((c) => c.id)).toEqual(['relatorio', 'fundamentacao', 'ressalvas', 'conclusao']);
    expect(camposDoRascunho(DEFINICOES_RASCUNHO.MCI, []).map((c) => c.id)).toEqual(['texto', 'apontamentos']);
    expect(camposDoRascunho(DEFINICOES_RASCUNHO.REGISTRO, []).map((c) => c.id)).toEqual(['texto']);
  });

  it('prompt: chaves pedidas, contexto e a conclusão sugerida só no parecer/controle interno', () => {
    const pj = montarPrompt(DEFINICOES_RASCUNHO.PJ, camposDoRascunho(DEFINICOES_RASCUNHO.PJ, []), 'CONTEXTO-X');
    expect(pj.usuario).toContain('"relatorio", "fundamentacao", "ressalvas", "conclusao", "conclusao_sugerida"');
    expect(pj.usuario).toContain('MINUTA');
    expect(pj.usuario).toContain('CONTEXTO-X');
    expect(pj.sistema).toMatch(/JSON/);
    const aa = montarPrompt(DEFINICOES_RASCUNHO.AA, camposDoRascunho(DEFINICOES_RASCUNHO.AA, []), 'C');
    expect(aa.usuario).toContain('art. 72, VIII');
    expect(aa.usuario).not.toContain('conclusao_sugerida');
  });
});

describe('F4a — leitura da resposta da IA', () => {
  it('extrairJson: aceita cercas de código e texto antes/depois; inválido → null', () => {
    expect(extrairJson('```json\n{"a":"b"}\n```')).toEqual({ a: 'b' });
    expect(extrairJson('Segue:\n{"a": 1}\nObrigado')).toEqual({ a: 1 });
    expect(extrairJson('sem json')).toBeNull();
    expect(extrairJson('{quebrado')).toBeNull();
  });

  it('htmlSeguro: só tags simples, sem atributos nem script; texto vira parágrafos', () => {
    expect(htmlSeguro('<p onclick="x()">Oi <script>alert(1)</script><strong class="a">forte</strong></p><img src=x onerror=y>')).toBe('<p>Oi <strong>forte</strong></p>');
    expect(htmlSeguro('Linha 1\n\nLinha <2>')).toBe('<p>Linha 1</p><p>Linha &lt;2&gt;</p>');
    expect(htmlSeguro('<h2>Título</h2><div>corpo</div>')).toBe('<p>Título</p><p>corpo</p>');
  });

  it('interpretarResposta: só os campos pedidos, no formato de cada um; conclusão sugerida validada', () => {
    const def = DEFINICOES_RASCUNHO.PJ;
    const campos = camposDoRascunho(def, []);
    const r = interpretarResposta(
      def,
      campos,
      JSON.stringify({ relatorio: '<p>Relatório <b>x</b></p>', fundamentacao: '**Art. 72** cumprido.', ressalvas: '', conclusao: 'Favorável.', conclusao_sugerida: 'favoravel', intruso: 'não entra' }),
    );
    expect(r.secoes).toEqual({ relatorio: 'Relatório x', fundamentacao: 'Art. 72 cumprido.', conclusao: 'Favorável.' });
    expect(r.extras).toEqual({ conclusao_sugerida: 'FAVORAVEL' });
    const invalida = interpretarResposta(def, campos, JSON.stringify({ fundamentacao: 'ok', conclusao_sugerida: 'APROVADO' }));
    expect(invalida.extras).toEqual({});
  });

  it('seções HTML: sanitizadas; campo único aceita texto puro; nada útil → erro', () => {
    const etp = DEFINICOES_RASCUNHO.ETP;
    const campos = camposDoRascunho(etp, secoesDe('ETP'));
    const r = interpretarResposta(etp, campos, JSON.stringify({ necessidade: '<p style="x">A <script>x</script>necessidade</p>' }));
    expect(r.secoes).toEqual({ necessidade: '<p>A necessidade</p>' });
    const reg = interpretarResposta(DEFINICOES_RASCUNHO.REGISTRO, camposDoRascunho(DEFINICOES_RASCUNHO.REGISTRO, []), 'Autorizo o início do processo.');
    expect(reg.secoes).toEqual({ texto: 'Autorizo o início do processo.' });
    expect(() => interpretarResposta(etp, campos, '{"outra":"x"}')).toThrow(/formato esperado/);
    expect(() => interpretarResposta(etp, campos, 'lixo')).toThrow(/formato esperado/);
  });
});

describe('F4a — aceite: texto humano nunca é sobrescrito', () => {
  it('só as seções vazias entram; as já escritas ficam', () => {
    const r = secoesParaAplicar(
      { necessidade: '<p>Texto do servidor</p>', solucao: '<p> </p>', requisitos: '' },
      { necessidade: '<p>IA</p>', solucao: '<p>Solução IA</p>', requisitos: '<p>Req IA</p>', vazio: '<p></p>' },
    );
    expect(r.aplicar).toEqual({ solucao: '<p>Solução IA</p>', requisitos: '<p>Req IA</p>' });
    expect(r.mantidas).toEqual(['necessidade']);
  });

  it('"gerando" parado vira falho para a tela', () => {
    const antigo = new Date(Date.now() - GERANDO_EXPIRA_MS - 1000);
    expect(situacaoVisivel('GERANDO', antigo)).toBe('FALHOU');
    expect(situacaoVisivel('GERANDO', new Date())).toBe('GERANDO');
    expect(situacaoVisivel('GERADO', antigo)).toBe('GERADO');
  });

  it('metadado discreto da peça (fora do texto oficial)', () => {
    expect(resumoIaDaPeca({ demanda: 'x' })).toBeNull();
    expect(resumoIaDaPeca({ _ia_rascunho: { modelo_ia: 'm', aceito_por_nome: 'Ana', revisado_por_nome: 'Bia' } })).toMatchObject({ modelo_ia: 'm', aceito_por_nome: 'Ana', revisado_por_nome: 'Bia' });
  });
});

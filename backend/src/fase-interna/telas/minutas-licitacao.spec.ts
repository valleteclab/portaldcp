import { MINUTA_AVISO_PREAMBULO, MODELO_JC_LICITACAO, MODELOS_PADRAO, RAG_CONCLUSAO_PADRAO, RAG_ENQUADRAMENTO_PADRAO } from '../modelos-padrao';
import { TipoDocumentoFaseInterna } from '../entities/documento-fase-interna.entity';
import { SECOES_DA_LICITACAO, completarJustificativaDaLicitacao, ehLicitacaoCompetitiva, numeroDaPortariaJuntada, secoesParaLicitacao } from './minutas-regras';
import { PECAS_JUNTAS_DA_LICITACAO } from '../../workflow/ponte/ponte-fase-interna';

/**
 * Pregão 2026/00070 (homologação 09/11/2026): o relatório e a minuta do edital
 * saíam com o texto da dispensa (aviso, art. 72, limite da dispensa) e quatro
 * seções do edital vazias.
 */
const DISPENSA = [MINUTA_AVISO_PREAMBULO, '<p>{{licitacao.forma_disputa}}</p>', RAG_ENQUADRAMENTO_PADRAO, RAG_CONCLUSAO_PADRAO];
const modelo = (tipo: TipoDocumentoFaseInterna) => MODELOS_PADRAO.find((m) => m.tipo === tipo)!.secoes;

describe('minutas na licitação (pregão, concorrência)', () => {
  it('só a licitação competitiva troca os textos', () => {
    expect(ehLicitacaoCompetitiva('PREGAO_ELETRONICO')).toBe(true);
    expect(ehLicitacaoCompetitiva('CONCORRENCIA')).toBe(true);
    expect(ehLicitacaoCompetitiva('DISPENSA_ELETRONICA')).toBe(false);
    expect(ehLicitacaoCompetitiva('INEXIGIBILIDADE')).toBe(false);
    expect(ehLicitacaoCompetitiva('CREDENCIAMENTO')).toBe(false);
    expect(ehLicitacaoCompetitiva(null)).toBe(false);
  });

  it('minuta do edital: preâmbulo do aviso, julgamento e as seções vazias ganham o texto da licitação', () => {
    const ids = secoesParaLicitacao('ME', modelo(TipoDocumentoFaseInterna.MINUTA_EDITAL), DISPENSA);
    expect(ids.sort()).toEqual(['contratacao', 'habilitacao', 'julgamento', 'participacao', 'preambulo', 'recursos']);
    expect(SECOES_DA_LICITACAO.ME.preambulo).toContain('realizará licitação');
    expect(SECOES_DA_LICITACAO.ME.recursos).toContain('art. 165');
  });

  it('relatório do agente: enquadramento da dispensa, razão da escolha e conclusão trocam; preço e orçamento ficam', () => {
    const ids = secoesParaLicitacao('RAG', modelo(TipoDocumentoFaseInterna.RELATORIO_AGENTE), DISPENSA);
    expect(ids.sort()).toEqual(['conclusao', 'enquadramento', 'escolha']);
    expect(SECOES_DA_LICITACAO.RAG.conclusao).toContain('minuta do edital');
    expect(SECOES_DA_LICITACAO.RAG.enquadramento).not.toContain('limite_dispensa');
  });

  it('seção que o órgão reescreveu no modelo não é tocada; contrato não muda', () => {
    const proprio = modelo(TipoDocumentoFaseInterna.MINUTA_EDITAL).map((s) => (s.id === 'preambulo' ? { ...s, texto_padrao: '<p>Preâmbulo do órgão</p>' } : s));
    expect(secoesParaLicitacao('ME', proprio, DISPENSA)).not.toContain('preambulo');
    expect(secoesParaLicitacao('MC', modelo(TipoDocumentoFaseInterna.MINUTA_CONTRATO), DISPENSA)).toEqual([]);
  });
});

describe('portaria juntada por etapa do fluxo', () => {
  it('lê o número do título da peça', () => {
    expect(numeroDaPortariaJuntada({ titulo: 'Portaria nº 012/2026 — designa o pregoeiro, a equipe de apoio e os fiscais do contrato' })).toBe('Portaria nº 012/2026');
    expect(numeroDaPortariaJuntada({ titulo: 'PORTARIA N. 7/2026' })).toBe('PORTARIA N. 7/2026');
    expect(numeroDaPortariaJuntada({ titulo: 'Designação da equipe', numero_documento: '014/2026' })).toBe('Portaria nº 014/2026');
    expect(numeroDaPortariaJuntada(null)).toBeNull();
  });
});

describe('justificativa da contratação na licitação (art. 18, IX) — peça da etapa do TR', () => {
  it('o modelo da licitação tem as seções do art. 18, IX; o ETP e o TR completam motivação, habilitação e parcelamento', () => {
    expect(MODELO_JC_LICITACAO.secoes.map((s) => s.id)).toEqual(['motivacao', 'modalidade', 'habilitacao', 'parcelamento', 'me_epp']);
    const r = completarJustificativaDaLicitacao(
      { motivacao: '<p>Padrão.</p>', modalidade: '<p>Pregão.</p>', habilitacao: '<p>Padrão.</p>', parcelamento: '<p>Padrão.</p>' },
      { ETP: { necessidade: '<p>Aparelhos sem manutenção.</p>', parcelamento: '<p>Não parcelar.</p>' }, TR: { selecao_habilitacao: '<p>Atestado de capacidade.</p>' } },
    );
    expect(r.motivacao).toContain('Conforme o estudo técnico preliminar');
    expect(r.motivacao).toContain('Aparelhos sem manutenção');
    expect(r.habilitacao).toContain('Atestado de capacidade');
    expect(r.parcelamento).toContain('Não parcelar');
    expect(r.modalidade).toBe('<p>Pregão.</p>');
    // sem ETP/TR: fica o texto padrão
    expect(completarJustificativaDaLicitacao({ motivacao: '<p>Padrão.</p>' }, { ETP: null, TR: null })).toEqual({ motivacao: '<p>Padrão.</p>' });
  });

  it('a etapa do TR da licitação exige a justificativa (ponte do fluxo)', () => {
    expect(PECAS_JUNTAS_DA_LICITACAO.TR.map((p) => p.tipo)).toEqual(['JC']);
  });
});

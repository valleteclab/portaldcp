import { naoSeAplicaVale, PRONTA_NA_INSTRUCAO, statusDaPeca } from './peca-regras';

const doc = (extra: Record<string, unknown> = {}) => ({ tipo: 'ETP', status: 'EM_ELABORACAO', caminho_arquivo: null, arquivo_pdf_path: null, descricao: null, dados_estruturados: {}, ...extra });

describe('statusDaPeca — critério único da instrução, da ponte e da trava da lei', () => {
  const livre = { pode_nao_se_aplicar: true };
  it('sem peça: pendente; em elaboração sem PDF: em elaboração; gerada/anexada: OK', () => {
    expect(statusDaPeca(null, livre)).toBe('PENDENTE');
    expect(statusDaPeca(doc(), livre)).toBe('EM_ELABORACAO');
    expect(statusDaPeca(doc({ arquivo_pdf_path: '/a.pdf' }), livre)).toBe('OK');
    expect(statusDaPeca(doc({ status: 'IMPORTADO' }), livre)).toBe('OK');
    expect(statusDaPeca(doc({ status: 'ASSINADO' }), livre)).toBe('OK');
  });
  it('assinatura e aprovação em curso não contam', () => {
    expect(statusDaPeca(doc({ status: 'AGUARDANDO_ASSINATURA', arquivo_pdf_path: '/a.pdf' }), livre)).toBe('EM_ASSINATURA');
    expect(statusDaPeca(doc({ status: 'AGUARDANDO_APROVACAO', arquivo_pdf_path: '/a.pdf' }), livre)).toBe('EM_APROVACAO');
    expect(statusDaPeca(doc({ status: 'REPROVADO', arquivo_pdf_path: '/a.pdf' }), livre)).toBe('EM_ELABORACAO');
  });
  it('aprovação interna ligada: só aprovada/anexada/assinada', () => {
    const r = { pode_nao_se_aplicar: false, exige_aprovacao: true };
    expect(statusDaPeca(doc({ arquivo_pdf_path: '/a.pdf' }), r)).toBe('EM_ELABORACAO');
    expect(statusDaPeca(doc({ status: 'APROVADO' }), r)).toBe('OK');
  });
  it('"não se aplica": só onde permitido; na obrigatória a marca é ignorada', () => {
    const marcada = doc({ dados_estruturados: { nao_se_aplica: true } });
    expect(naoSeAplicaVale(marcada, livre)).toBe(true);
    expect(statusDaPeca(marcada, livre)).toBe('NAO_SE_APLICA');
    expect(statusDaPeca(marcada, { pode_nao_se_aplicar: false })).toBe('EM_ELABORACAO');
    expect(statusDaPeca(doc({ status: 'IMPORTADO', dados_estruturados: { nao_se_aplica: true } }), { pode_nao_se_aplicar: false })).toBe('OK');
    expect(PRONTA_NA_INSTRUCAO.has('NAO_SE_APLICA')).toBe(true);
    expect(PRONTA_NA_INSTRUCAO.has('EM_ASSINATURA')).toBe(false);
  });
});

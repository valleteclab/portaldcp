import PDFDocument = require('pdfkit');
import { conteudoEditavel, mesmoTextoDaSecao, pecaContaComoPronta, registroDeEmissao } from './peca-regras';
import { GeradorDocumentoService } from './gerador-documento.service';

/**
 * Homologação multiusuário:
 *  - E5: a versão nova parte do conteúdo da última versão feita no sistema
 *    (as seções não somem depois de anexar um PDF);
 *  - "Gerar TR" ficava "Rascunho": o editor salvava de novo, ao montar, o
 *    mesmo texto — salvar a seção com o mesmo texto não é edição;
 *  - PDF do TR com as seções 2+ espremidas: o cursor ficava na última coluna
 *    da tabela de itens.
 */
describe('conteudoEditavel — base para gerar de novo', () => {
  it('fica só o conteúdo das seções (sem chaves internas, "não se aplica" nem seções vazias)', () => {
    expect(
      conteudoEditavel({
        objeto: '<p>Papel A4</p>',
        requisitos: '<p></p>',
        _emitido: { em: 'x' },
        _edicoes: {},
        nao_se_aplica: false,
        justificativa_nao_se_aplica: 'x',
        itens: [{ a: 1 }],
      }),
    ).toEqual({ objeto: '<p>Papel A4</p>', itens: [{ a: 1 }] });
    expect(conteudoEditavel(null)).toEqual({});
    expect(conteudoEditavel([1, 2])).toEqual({});
  });
});

describe('mesmoTextoDaSecao — salvar o mesmo texto não é edição', () => {
  it('igual (ignorando espaços nas pontas e o parágrafo vazio) → true; texto novo ou seção nova → false', () => {
    expect(mesmoTextoDaSecao('<p>Objeto</p>', '<p>Objeto</p>')).toBe(true);
    expect(mesmoTextoDaSecao('  <p>Objeto</p>\n', '<p>Objeto</p>')).toBe(true);
    expect(mesmoTextoDaSecao('', '<p></p>')).toBe(true);
    expect(mesmoTextoDaSecao('<p>Objeto</p>', '<p>Objeto alterado</p>')).toBe(false);
    expect(mesmoTextoDaSecao(undefined, '<p>Objeto</p>')).toBe(false);
  });

  it('a peça emitida continua pronta quando nada mudou de fato', () => {
    const doc = { tipo: 'TR', status: 'EM_ELABORACAO', descricao: '<p>Objeto</p>', dados_estruturados: { objeto: '<p>Objeto</p>' } as any };
    doc.dados_estruturados._emitido = registroDeEmissao(doc);
    expect(pecaContaComoPronta(doc)).toBe(true);
    // o "salvar" do editor com o mesmo texto é ignorado (mesmoTextoDaSecao) — a impressão não muda
    expect(mesmoTextoDaSecao(doc.dados_estruturados.objeto, '<p>Objeto</p>')).toBe(true);
  });
});

describe('PDF — texto depois da tabela volta à margem', () => {
  it('renderTabelaNoPdf devolve o cursor à margem esquerda (as seções seguintes usam a largura toda)', () => {
    const svc = Object.create(GeradorDocumentoService.prototype) as any;
    const pdf = new PDFDocument({ size: 'A4', margins: { top: 70, bottom: 60, left: 60, right: 60 } });
    pdf.on('data', () => undefined);
    svc.renderTabelaNoPdf(
      pdf,
      '<thead><tr><th>Item</th><th>Descrição</th><th>Qtde</th></tr></thead><tbody><tr><td>01</td><td>Papel A4</td><td>4</td></tr></tbody>',
      '',
    );
    expect(pdf.x).toBe(60);
    const antes = pdf.y;
    svc.renderTokensNoPdf(pdf, '<h2>2. Fundamentação</h2><p>Texto longo da seção seguinte, que precisa ocupar a largura inteira da página.</p>');
    expect(pdf.x).toBe(60);
    expect(pdf.y).toBeGreaterThan(antes);
    pdf.end();
  });
});

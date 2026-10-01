import {
  blocosDaPeca,
  ContextoDaPeca,
  contarLacunas,
  extrairJsonDaResposta,
  htmlDaPecaSeguro,
  modeloDaPeca,
  montarPromptDaPeca,
  temLacuna,
  textoDaPeca,
} from './peca-documento';

const contexto = (o: Partial<ContextoDaPeca> = {}): ContextoDaPeca => ({
  orgao_nome: 'Câmara Municipal',
  setor_nome: 'Orçamento',
  numero_processo: '2026/00031',
  tipo_processo: 'ADITIVO',
  objeto: 'Termo aditivo ao contrato nº 012/2026',
  etapa_rotulo: 'Reserva de recurso',
  tipo_peca: 'RESERVA_DOTACAO',
  titulo_peca: 'Reserva de dotação orçamentária',
  contrato: { numero: '012/2026', objeto: 'Publicidade', fornecedor: 'Agência <X> Ltda', valor_global: 240000 },
  pecas: [{ titulo: 'Pedido de aditivo', folhas: 'fls. 1–2', texto: 'Acréscimo de R$ 12.400,00' }],
  autor_nome: 'Maria',
  autor_cargo: 'Chefe',
  ...o,
});

describe('peça feita no sistema — regras puras', () => {
  it('HTML seguro: mantém o permitido, descarta script/atributos, div vira parágrafo, alinhamento fica', () => {
    const h = htmlDaPecaSeguro('<div onclick="x()">Oi</div><script>alert(1)</script><p style="text-align:center;color:red">C</p><span>s</span><h1>T</h1><mark>lac</mark>');
    expect(h).toBe('<p>Oi</p><p style="text-align:center">C</p>s<p>T</p><mark>lac</mark>');
    expect(htmlDaPecaSeguro('linha 1\nlinha 2\n\npar 2')).toBe('<p>linha 1<br/>linha 2</p><p>par 2</p>');
    expect(htmlDaPecaSeguro('<p></p><p>  </p>')).toBe('');
  });

  it('lacunas: detecta e conta', () => {
    expect(temLacuna('<p>a <mark>b</mark></p>')).toBe(true);
    expect(temLacuna('<p>a</p>')).toBe(false);
    expect(contarLacunas('<p><mark>1</mark> e <mark>2</mark></p>')).toBe(2);
  });

  it('texto corrido para busca', () => {
    expect(textoDaPeca('<h3>T</h3><p>a&nbsp;b &amp; c<br/>d</p><ul><li>x</li></ul>')).toBe('T\na b & c\nd\nx');
  });

  it('blocos para o PDF: título, parágrafos alinhados e listas numeradas ou não', () => {
    const b = blocosDaPeca('<h3 style="text-align:center">T</h3><p>P1</p><ol><li>um</li><li>dois</li></ol><ul><li>x</li></ul><p style="text-align:justify">P2</p>');
    expect(b.map((x) => [x.tipo, x.texto, x.alinhamento, x.numero])).toEqual([
      ['titulo', 'T', 'center', null],
      ['paragrafo', 'P1', 'left', null],
      ['item', 'um', 'left', 1],
      ['item', 'dois', 'left', 2],
      ['item', 'x', 'left', null],
      ['paragrafo', 'P2', 'justify', null],
    ]);
    expect(blocosDaPeca('só texto')).toEqual([{ tipo: 'paragrafo', texto: 'só texto', alinhamento: 'left', numero: null }]);
  });

  it('modelo: usa o contrato do contexto, escapa HTML do fornecedor e deixa lacunas', () => {
    const h = modeloDaPeca(contexto());
    expect(h).toContain('RESERVA DE DOTAÇÃO');
    expect(h).toContain('contrato nº 012/2026, firmado com Agência &lt;X&gt; Ltda');
    expect(temLacuna(h)).toBe(true);
    expect(modeloDaPeca(contexto({ tipo_peca: null, titulo_peca: 'Ofício' }))).toContain('OFÍCIO');
  });

  it('prompt da IA: traz contrato, peças e a orientação; pede JSON com html e <mark>', () => {
    const p = montarPromptDaPeca(contexto(), 'usar a dotação 02.01');
    expect(p.sistema).toContain('<mark>');
    expect(p.usuario).toContain('Contrato nº 012/2026 com Agência <X> Ltda');
    expect(p.usuario).toContain('R$');
    expect(p.usuario).toContain('- Pedido de aditivo (fls. 1–2): Acréscimo');
    expect(p.usuario).toContain('Orientação de quem pediu: usar a dotação 02.01');
    expect(p.usuario).toContain('"titulo"');
  });

  it('resposta da IA: aceita cerca de código, limpa o html e descarta vazio', () => {
    const r = extrairJsonDaResposta('```json\n{"titulo":"Reserva","html":"<h3>R</h3><p onclick=\\"x\\">ok <mark>falta</mark></p>"}\n```');
    expect(r).toEqual({ titulo: 'Reserva', html: '<h3>R</h3><p>ok <mark>falta</mark></p>' });
    expect(extrairJsonDaResposta('nada')).toBeNull();
    expect(extrairJsonDaResposta('{"html":""}')).toBeNull();
  });
});

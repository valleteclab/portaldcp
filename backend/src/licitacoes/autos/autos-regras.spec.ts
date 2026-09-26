import {
  ORDEM_LOGICA_AUTOS,
  carimboDeFolha,
  dataPorExtenso,
  impressaoDosAutos,
  numerarFolhas,
  ordenarPecasDosAutos,
  paginasDoIndice,
  posicaoDoCarimbo,
  quebrarLinhas,
  rotuloFaixa,
  textoSeguroPdf,
} from './autos-regras';

/** AUTOS EM PDF (fase interna, Entrega 6) — ordem lógica, folhas contínuas, carimbo, cache. */
describe('autos em PDF — ordem lógica das peças', () => {
  it('segue a ordem lógica dos autos, NÃO a ordem das datas (caso PA 139/2025: ETP de 14/11 antes do DFD de 10/12)', () => {
    const chegada = [
      { chave: 'PJ', data: '2025-12-17' },
      { chave: 'ETP', data: '2025-11-14' },
      { chave: 'CONTRATO', data: '2026-02-03' },
      { chave: 'AVISO_PUBLICADO', data: '2026-01-13' },
      { chave: 'DO', data: '2025-12-04' },
      { chave: 'DFD', data: '2025-12-10' },
      { chave: 'PP', data: '2025-12-10' },
      { chave: 'TR', data: '2025-12-10' },
      { chave: 'AA', data: '2025-12-10' },
      { chave: 'DP', data: '2025-01-02' },
      { chave: 'RAG', data: '2025-12-10' },
      { chave: 'ME', data: '2025-12-10' },
      { chave: 'MC', data: '2025-12-10' },
      { chave: 'MCI', data: '2025-12-18' },
      { chave: 'PJE', data: '2026-01-23' },
      { chave: 'TERMO_JUSTIFICATIVAS', data: null },
      { chave: 'REGISTRO_PUBLICACOES', data: '2026-01-13' },
      { chave: 'PDO', data: '2026-01-13' },
      { chave: 'ATA_SESSAO', data: '2026-01-20' },
      { chave: 'TERMO_HOMOLOGACAO', data: '2026-01-30' },
      { chave: 'AR', data: '2025-11-14' },
      { chave: 'PP_CERTIDAO', data: '2025-12-10' },
    ];
    expect(ordenarPecasDosAutos(chegada).map((p) => p.chave)).toEqual([
      'DFD', 'ETP', 'AR', 'TR', 'PP', 'PP_CERTIDAO', 'DO', 'AA', 'DP', 'RAG', 'ME', 'MC', 'PJ', 'MCI', 'TERMO_JUSTIFICATIVAS',
      'AVISO_PUBLICADO', 'REGISTRO_PUBLICACOES', 'PDO', 'ATA_SESSAO', 'PJE', 'TERMO_HOMOLOGACAO', 'CONTRATO',
    ]);
  });

  it('a capa, o termo de abertura e o índice vêm primeiro; o termo de encerramento por último; tipo desconhecido antes do encerramento', () => {
    expect(ORDEM_LOGICA_AUTOS.slice(0, 3)).toEqual(['CAPA', 'TERMO_ABERTURA', 'INDICE']);
    expect(ORDEM_LOGICA_AUTOS[ORDEM_LOGICA_AUTOS.length - 1]).toBe('TERMO_ENCERRAMENTO');
    expect(ordenarPecasDosAutos([{ chave: 'TERMO_ENCERRAMENTO' }, { chave: 'XYZ' }, { chave: 'DFD' }]).map((p) => p.chave)).toEqual(['DFD', 'XYZ', 'TERMO_ENCERRAMENTO']);
  });

  it('dentro da mesma chave vale a ordem informada (contratos pelo número), depois a de chegada', () => {
    const r = ordenarPecasDosAutos([
      { chave: 'CONTRATO', ordem: '10/2026' },
      { chave: 'CONTRATO', ordem: '2/2026' },
      { chave: 'CONTRATO', ordem: null, id: 'a' },
    ] as any[]);
    expect(r.map((p: any) => p.ordem)).toEqual([null, '2/2026', '10/2026']);
  });
});

describe('autos em PDF — folhas contínuas e carimbo', () => {
  it('numeração contínua com peças anexadas de várias páginas', () => {
    // capa (1), termo de abertura (2), índice (3) → peças a partir da folha 4
    const faixas = numerarFolhas([1, 12, 3, 1, 40], 4);
    expect(faixas).toEqual([
      { folha_inicial: 4, folha_final: 4 },
      { folha_inicial: 5, folha_final: 16 },
      { folha_inicial: 17, folha_final: 19 },
      { folha_inicial: 20, folha_final: 20 },
      { folha_inicial: 21, folha_final: 60 },
    ]);
    // sem buraco nem repetição
    for (let i = 1; i < faixas.length; i++) expect(faixas[i].folha_inicial).toBe(faixas[i - 1].folha_final + 1);
    expect(rotuloFaixa(faixas[1])).toBe('5–16');
    expect(rotuloFaixa(faixas[0])).toBe('4');
    // página "zero" conta como 1 folha
    expect(numerarFolhas([0], 1)).toEqual([{ folha_inicial: 1, folha_final: 1 }]);
  });

  it('o índice ocupa as folhas necessárias (sabido antes de numerar)', () => {
    expect(paginasDoIndice(0)).toBe(1);
    expect(paginasDoIndice(26)).toBe(1);
    expect(paginasDoIndice(27)).toBe(2);
    expect(paginasDoIndice(200)).toBe(8);
  });

  it('carimbo "Fl. 000123" com seis dígitos', () => {
    expect(carimboDeFolha(1)).toBe('Fl. 000001');
    expect(carimboDeFolha(123)).toBe('Fl. 000123');
    expect(carimboDeFolha(184)).toBe('Fl. 000184');
  });

  it('carimbo no canto superior direito VISÍVEL, com a rotação da página', () => {
    const caixa = { x: 0, y: 0, width: 600, height: 800 };
    expect(posicaoDoCarimbo(caixa, 0, 50, 9, 18)).toEqual({ x: 532, y: 773, angulo: 0 });
    expect(posicaoDoCarimbo(caixa, 90, 50, 9, 18)).toEqual({ x: 27, y: 732, angulo: 90 });
    expect(posicaoDoCarimbo(caixa, 180, 50, 9, 18)).toEqual({ x: 68, y: 27, angulo: 180 });
    expect(posicaoDoCarimbo(caixa, 270, 50, 9, 18)).toEqual({ x: 573, y: 68, angulo: 270 });
    expect(posicaoDoCarimbo(caixa, -90, 50, 9, 18).angulo).toBe(270);
    // caixa deslocada (CropBox)
    expect(posicaoDoCarimbo({ x: 10, y: 20, width: 600, height: 800 }, 0, 50, 9, 18)).toEqual({ x: 542, y: 793, angulo: 0 });
  });
});

describe('autos em PDF — cache e textos', () => {
  it('a impressão muda quando uma peça muda e fica igual quando nada muda', () => {
    const base = { pecas: [['DFD', 'id1:1:IMPORTADO:abc'], ['PP', 'id2:1:x']] };
    expect(impressaoDosAutos(base)).toBe(impressaoDosAutos(JSON.parse(JSON.stringify(base))));
    expect(impressaoDosAutos(base)).not.toBe(impressaoDosAutos({ pecas: [['DFD', 'id1:2:IMPORTADO:def'], ['PP', 'id2:1:x']] }));
    expect(impressaoDosAutos(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('texto seguro para as fontes padrão do PDF (sem quebrar a geração)', () => {
    expect(textoSeguroPdf('Ação — “ok” ≥ 3 ✓ 🎉\nlinha')).toBe('Ação — “ok” >= 3   linha');
    expect(quebrarLinhas('uma duas tres quatro', 9, (s) => s.length)).toEqual(['uma duas', 'tres', 'quatro']);
  });

  it('data por extenso no fuso de Brasília', () => {
    expect(dataPorExtenso(new Date('2026-01-14T02:00:00Z'))).toBe('13 de janeiro de 2026');
    expect(dataPorExtenso(new Date('2026-01-14T15:00:00Z'))).toBe('14 de janeiro de 2026');
  });
});

import { PDFDocument, StandardFonts } from 'pdf-lib';
import { incisosDoArt75Citados, leisOrcamentariasCitadas, ocorrenciasDeOutroProcesso, referenciasDivergentes } from './texto';
import { paginasDoPdf } from './texto-pdf';

describe('Conformidade — leitura do texto das peças', () => {
  it('incisos do art. 75 nas três formas', () => {
    expect(incisosDoArt75Citados('com fundamento no art. 75, I, e no artigo 75 inciso II; inciso VIII do art. 75').sort()).toEqual(['I', 'II', 'VIII']);
    expect(incisosDoArt75Citados('art. 75, §3º (prazo)')).toEqual([]);
  });

  it('número de outro processo (VINC-01), com a folha', () => {
    expect(referenciasDivergentes('PA 115/2025 / Dispensa 025/2025', { numero_processo: '139/2025', numero_dispensa: '029/2025' })).toEqual(['PA nº 115/2025', 'Dispensa nº 25/2025']);
    const o = ocorrenciasDeOutroProcesso([{ folha: 63, texto: 'cláusula 2.1.2: PA 115/2025' }], { numero_processo: '139/2025' });
    expect(o[0]).toMatchObject({ folha: 63, referencia: 'PA nº 115/2025' });
  });

  it('leis orçamentárias classificadas pelo contexto; leis gerais ficam de fora', () => {
    const r = leisOrcamentariasCitadas([
      { folha: 35, texto: 'na dotação da Lei Orçamentária Anual nº 1.141/2024, observada a Lei de Diretrizes Orçamentárias (Lei nº 1.140/2024) e a Lei nº 14.133/2021.' },
      { folha: 81, texto: 'PPA 2022-2025 (Lei Municipal 1.050/2021)' },
    ]);
    expect(r.map((x) => [x.tipo, x.numero, x.folha])).toEqual([
      ['LOA', '1141/2024', 35],
      ['LDO', '1140/2024', 35],
      ['PPA', '1050/2021', 81],
    ]);
  });

  it('texto do PDF anexado, página a página (pdf-parse, sem OCR)', async () => {
    const d = await PDFDocument.create();
    const f = await d.embedFont(StandardFonts.Helvetica);
    d.addPage().drawText('Contrato vinculado ao PA 115/2025 - art. 75, inciso I', { x: 50, y: 700, size: 12, font: f });
    d.addPage().drawText('Pagina dois', { x: 50, y: 700, size: 12, font: f });
    const paginas = await paginasDoPdf(Buffer.from(await d.save()));
    expect(paginas).toHaveLength(2);
    expect(paginas![0]).toContain('PA 115/2025');
    expect(paginas![1]).toContain('Pagina dois');
    expect(await paginasDoPdf(Buffer.from('não é pdf'))).toBeNull();
  }, 60_000);
});

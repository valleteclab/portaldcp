import {
  dataDocumentoDaAssinatura,
  hojeEmBrasilia,
  normalizarSignatariosInformados,
  pareceSerPdf,
  planoNovaVersao,
  proximaFaixaDeFolhas,
  validarDataDocumentoAnexo,
} from './peca-regras';

describe('peça da fase interna — data do documento', () => {
  const agora = new Date('2026-09-26T15:00:00Z'); // 12h em Brasília

  it('anexada: data informada é obrigatória e guardada ao meio-dia de Brasília', () => {
    const r = validarDataDocumentoAnexo('2025-12-17', agora);
    expect(r).toMatchObject({ ok: true, dia: '2025-12-17' });
    if (r.ok) expect(r.data.toISOString()).toBe('2025-12-17T15:00:00.000Z');
    expect(validarDataDocumentoAnexo('', agora)).toMatchObject({ ok: false, erro: expect.stringMatching(/Informe a data/) });
    expect(validarDataDocumentoAnexo(undefined, agora).ok).toBe(false);
  });

  it('anexada: não pode ser futura (hoje vale; amanhã não)', () => {
    expect(validarDataDocumentoAnexo('2026-09-26', agora).ok).toBe(true);
    expect(validarDataDocumentoAnexo('2026-09-27', agora)).toMatchObject({ ok: false, erro: expect.stringMatching(/futura/) });
  });

  it('o "hoje" é o de Brasília (23h de Brasília ainda é o mesmo dia)', () => {
    const noite = new Date('2026-09-27T02:30:00Z'); // 23h30 de 26/09 em Brasília
    expect(hojeEmBrasilia(noite)).toBe('2026-09-26');
    expect(validarDataDocumentoAnexo('2026-09-27', noite).ok).toBe(false);
  });

  it('anexada: formato e calendário válidos', () => {
    expect(validarDataDocumentoAnexo('17/12/2025', agora).ok).toBe(false);
    expect(validarDataDocumentoAnexo('2025-02-30', agora).ok).toBe(false);
    expect(validarDataDocumentoAnexo('1980-01-01', agora).ok).toBe(false);
    expect(validarDataDocumentoAnexo('2025-12-17T00:00:00.000Z', agora)).toMatchObject({ ok: true, dia: '2025-12-17' });
  });

  it('gerada e assinada no sistema: data = última assinatura (nunca digitada)', () => {
    const d = dataDocumentoDaAssinatura(['2026-01-30T10:00:00Z', new Date('2026-02-03T09:00:00Z'), null, '2026-01-31T08:00:00Z']);
    expect(d?.toISOString()).toBe('2026-02-03T09:00:00.000Z');
    expect(dataDocumentoDaAssinatura([])).toBeNull();
  });
});

describe('peça da fase interna — versões e folhas', () => {
  it('substituir cria a versão seguinte apontando a anterior', () => {
    expect(planoNovaVersao(null)).toEqual({ versao: 1, versao_anterior_id: null });
    expect(planoNovaVersao({ id: 'v1', versao: 1 })).toEqual({ versao: 2, versao_anterior_id: 'v1' });
    expect(planoNovaVersao({ id: 'v3', versao: 3 })).toEqual({ versao: 4, versao_anterior_id: 'v3' });
  });

  it('folhas em sequência por processo', () => {
    expect(proximaFaixaDeFolhas(null, 3)).toEqual({ folha_inicial: 1, folha_final: 3 });
    expect(proximaFaixaDeFolhas(3, 1)).toEqual({ folha_inicial: 4, folha_final: 4 });
    expect(proximaFaixaDeFolhas(4, 12)).toEqual({ folha_inicial: 5, folha_final: 16 });
    expect(proximaFaixaDeFolhas(16, 0)).toEqual({ folha_inicial: 17, folha_final: 17 }); // peça conta ao menos 1 folha
  });
});

describe('peça anexada — metadados', () => {
  it('signatários: JSON do multipart, lista ou texto "nome - cargo"', () => {
    expect(normalizarSignatariosInformados('[{"nome":"Ana","cargo":"Procuradora"},{"nome":" "}]')).toEqual([{ nome: 'Ana', cargo: 'Procuradora' }]);
    expect(normalizarSignatariosInformados([{ nome: 'Rui' }])).toEqual([{ nome: 'Rui', cargo: null }]);
    expect(normalizarSignatariosInformados('Ana Souza - Presidente; João - 1º Secretário')).toEqual([
      { nome: 'Ana Souza', cargo: 'Presidente' },
      { nome: 'João', cargo: '1º Secretário' },
    ]);
    expect(normalizarSignatariosInformados(undefined)).toEqual([]);
  });

  it('só PDF de verdade', () => {
    expect(pareceSerPdf(Buffer.from('%PDF-1.4\n...'))).toBe(true);
    expect(pareceSerPdf(Buffer.from('GIF89a...'))).toBe(false);
    expect(pareceSerPdf(null)).toBe(false);
  });
});

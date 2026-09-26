import { decidirRegeracao, hashSecoes, incisosDoArt75Citados, normalizarNumero, pecaEditadaAMao, referenciasDivergentes, secoesDaPeca } from './minutas-regras';

const gerada = (secoes: Record<string, string>, extra: Record<string, unknown> = {}) => ({
  id: 'd1',
  tipo: 'MC',
  status: 'EM_ELABORACAO',
  origem: 'INTERNO',
  dados_estruturados: { ...secoes, _gerado: { hash: hashSecoes(secoes), em: '2026-09-26' }, ...extra },
});

describe('Minutas geradas por modelo — regeração ao mudar o processo (Entrega 3B)', () => {
  const secoes = { vinculacao: '<p>Processo Administrativo nº 139/2025, com fundamento na Lei 14.133/2021, art. 75, II</p>', foro: '<p>Foro</p>' };

  it('a impressão do texto ignora a ordem das chaves e as chaves internas', () => {
    expect(hashSecoes({ a: 'x', b: 'y' })).toBe(hashSecoes({ b: 'y', a: 'x' }));
    expect(secoesDaPeca({ a: 'x', _gerado: { hash: 1 }, nao_se_aplica: false, n: 3 })).toEqual({ a: 'x' });
  });

  it('gerada e intocada → REGERAR', () => {
    expect(pecaEditadaAMao(gerada(secoes))).toBe(false);
    expect(decidirRegeracao(gerada(secoes))).toEqual({ acao: 'REGERAR' });
  });

  it('editada à mão → marcada como desatualizada (não regera)', () => {
    const doc = gerada(secoes);
    doc.dados_estruturados.foro = '<p>Foro da comarca de LEM, editado pelo agente</p>';
    expect(pecaEditadaAMao(doc)).toBe(true);
    expect(decidirRegeracao(doc)).toEqual({ acao: 'MARCAR_DESATUALIZADA', motivo: 'EDITADA' });
  });

  it('assinada, em assinatura ou aprovada → desatualizada; peça assinada nunca é reescrita', () => {
    expect(decidirRegeracao({ ...gerada(secoes), status: 'ASSINADO' })).toEqual({ acao: 'MARCAR_DESATUALIZADA', motivo: 'ASSINADA' });
    expect(decidirRegeracao({ ...gerada(secoes), status: 'AGUARDANDO_ASSINATURA' })).toEqual({ acao: 'MARCAR_DESATUALIZADA', motivo: 'EM_ASSINATURA' });
    expect(decidirRegeracao({ ...gerada(secoes), status: 'APROVADO' })).toEqual({ acao: 'MARCAR_DESATUALIZADA', motivo: 'APROVADA' });
  });

  it('não gerada pelo modelo, anexada, "não se aplica" ou substituída → ignora', () => {
    expect(decidirRegeracao({ id: 'x', tipo: 'MC', status: 'EM_ELABORACAO', origem: 'INTERNO', dados_estruturados: { a: 'texto' } })).toMatchObject({ acao: 'IGNORAR', motivo: 'NAO_GERADA' });
    expect(decidirRegeracao({ ...gerada(secoes), origem: 'ARQUIVO', status: 'IMPORTADO' })).toMatchObject({ acao: 'IGNORAR', motivo: 'ANEXADA' });
    expect(decidirRegeracao(gerada(secoes, { nao_se_aplica: true }))).toMatchObject({ acao: 'IGNORAR', motivo: 'NAO_SE_APLICA' });
    expect(decidirRegeracao({ ...gerada(secoes), status: 'SUBSTITUIDO' })).toMatchObject({ acao: 'IGNORAR', motivo: 'SUBSTITUIDA' });
  });
});

describe('Conferências de texto das minutas (leitura)', () => {
  it('PA 139/2025: a minuta que cita o "PA 115/2025 / Dispensa 025/2025" de outro processo é apontada', () => {
    const texto = '<p>2.1.2. O Processo Administrativo nº 115/2025, a Dispensa de Licitação nº 025/2025 e seus anexos;</p>';
    expect(referenciasDivergentes(texto, { numero_processo: '139/2025', numero_dispensa: '029/2025' })).toEqual(
      expect.arrayContaining(['Processo Administrativo nº 115/2025', 'Dispensa de Licitação nº 25/2025']),
    );
  });

  it('com o número do próprio processo (e da dispensa, com ou sem zeros) não aponta nada', () => {
    const texto = 'Processo Administrativo nº 139/2025 (Dispensa Eletrônica nº 029/2025)';
    expect(referenciasDivergentes(texto, { numero_processo: '139/2025', numero_dispensa: '29/2025' })).toEqual([]);
    expect(normalizarNumero('0029 / 2025')).toBe('29/2025');
  });

  it('incisos do art. 75 citados: "art. 75, I" no aviso × "art. 75, inciso II" no contrato', () => {
    expect(incisosDoArt75Citados('com fundamento no art. 75, I, da Lei; e no Art. 75, inciso II')).toEqual(['I', 'II']);
    expect(incisosDoArt75Citados('Lei 14.133/2021, art. 75, II')).toEqual(['II']);
    expect(incisosDoArt75Citados('art. 74, caput')).toEqual([]);
  });
});

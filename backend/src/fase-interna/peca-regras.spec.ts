import {
  dataDocumentoDaAssinatura,
  hojeEmBrasilia,
  impressaoConteudoPeca,
  normalizarSignatariosInformados,
  pareceSerPdf,
  pecaContaComoPronta,
  pecaEmitida,
  pecaProntaPelaRegraAnterior,
  registroDeEmissao,
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

describe('peça que só vale assinada (Entrega 3B — despacho, parecer, controle interno)', () => {
  const gerada = { tipo: 'AA', descricao: '<p>AUTORIZO</p>', arquivo_pdf_path: 'x.pdf', dados_estruturados: { autorizacao: '<p>AUTORIZO</p>', _exige_assinatura: true } };
  it('gerada com texto e PDF, mas sem assinatura, não conta; assinada ou anexada conta; devolvida não', () => {
    expect(pecaContaComoPronta({ ...gerada, status: 'EM_ELABORACAO' })).toBe(false);
    expect(pecaContaComoPronta({ ...gerada, status: 'AGUARDANDO_ASSINATURA' })).toBe(false);
    expect(pecaContaComoPronta({ ...gerada, status: 'ASSINADO' })).toBe(true);
    expect(pecaContaComoPronta({ ...gerada, status: 'REPROVADO' })).toBe(false);
    expect(pecaContaComoPronta({ tipo: 'AA', status: 'IMPORTADO', caminho_arquivo: 'a.pdf' })).toBe(true);
    // sem a marca e só com texto (rascunho): não conta — a peça precisa ser GERADA (homologação E4)
    expect(pecaContaComoPronta({ tipo: 'AA', status: 'EM_ELABORACAO', descricao: '<p>AUTORIZO</p>' })).toBe(false);
  });
});

describe('peça feita no sistema só é PRONTA depois de gerada/emitida (homologação 26/09/2026 — E4)', () => {
  const dfd = { tipo: 'DFD', status: 'EM_ELABORACAO', descricao: '<p>Necessidade</p>', dados_estruturados: { demanda: '<p>Necessidade</p>', _dfd: { responsavel_id: 'u1' } } };

  it('rascunho salvo automaticamente (texto, campos) é "em elaboração"', () => {
    expect(pecaContaComoPronta(dfd)).toBe(false);
    expect(pecaEmitida(dfd)).toBe(false);
  });

  it('gerada: conta; editar depois volta a "em elaboração"; gerar de novo volta a contar', () => {
    const gerada = { ...dfd, arquivo_pdf_path: 'x.pdf', dados_estruturados: { ...dfd.dados_estruturados, _emitido: registroDeEmissao(dfd, { id: 'u1', nome: 'Agente' }) } };
    expect(pecaContaComoPronta(gerada)).toBe(true);
    // chaves internas (autor da edição, marcações) não mudam o conteúdo
    const comMeta = { ...gerada, dados_estruturados: { ...gerada.dados_estruturados, _edicoes: { demanda: { por_nome: 'X' } }, _desatualizada: { motivo: 'X' } } };
    expect(pecaContaComoPronta(comMeta)).toBe(true);
    // a ordem das chaves não importa
    const reordenado = { ...gerada, dados_estruturados: { _emitido: gerada.dados_estruturados._emitido, _dfd: gerada.dados_estruturados._dfd, demanda: '<p>Necessidade</p>' } };
    expect(pecaContaComoPronta(reordenado)).toBe(true);
    const editada = { ...gerada, descricao: '<p>Necessidade alterada</p>', dados_estruturados: { ...gerada.dados_estruturados, demanda: '<p>Necessidade alterada</p>' } };
    expect(pecaContaComoPronta(editada)).toBe(false);
    const regerada = { ...editada, dados_estruturados: { ...editada.dados_estruturados, _emitido: registroDeEmissao(editada) } };
    expect(pecaContaComoPronta(regerada)).toBe(true);
  });

  it('pesquisa com cotações mas sem o mapa emitido não conta; com o mapa conta', () => {
    const pp = { tipo: 'PP', status: 'EM_ELABORACAO', dados_estruturados: { itens: [{ item_numero: 1, cotacoes: [{ valor_unitario: 10 }] }] } as any };
    expect(pecaContaComoPronta(pp)).toBe(false);
    const emitida = { ...pp, arquivo_pdf_path: 'mapa.pdf', descricao: 'Pesquisa', dados_estruturados: { ...pp.dados_estruturados } };
    emitida.dados_estruturados._emitido = registroDeEmissao(emitida);
    expect(pecaContaComoPronta(emitida)).toBe(true);
    // nova cotação depois do mapa: a pesquisa volta a "em elaboração"
    const mais = { ...emitida, dados_estruturados: { ...emitida.dados_estruturados, itens: [{ item_numero: 1, cotacoes: [{ valor_unitario: 10 }, { valor_unitario: 12 }] }] } };
    expect(pecaContaComoPronta(mais)).toBe(false);
  });

  it('dados existentes: PDF gerado antes da regra continua pronto; legado migrado conta; anexada e "não se aplica" contam', () => {
    expect(pecaContaComoPronta({ tipo: 'TR', status: 'EM_ELABORACAO', descricao: '<p>TR</p>', arquivo_pdf_path: 'tr.pdf', dados_estruturados: { objeto: '<p>TR</p>' } })).toBe(true);
    expect(pecaContaComoPronta({ tipo: 'JC', status: 'EM_ELABORACAO', descricao: '<p>J</p>', dados_estruturados: { justificativa: '<p>J</p>', _emitido: { em: 'x', legado: true } } })).toBe(true);
    expect(pecaContaComoPronta({ tipo: 'DFD', status: 'IMPORTADO', caminho_arquivo: 'a.pdf' })).toBe(true);
    expect(pecaContaComoPronta({ tipo: 'ETP', status: 'APROVADO', dados_estruturados: { nao_se_aplica: true } })).toBe(true);
  });

  it('regra anterior (só para a migração de processos já divulgados): o texto bastava', () => {
    expect(pecaProntaPelaRegraAnterior(dfd)).toBe(true);
    expect(pecaProntaPelaRegraAnterior({ tipo: 'PP', status: 'EM_ELABORACAO', dados_estruturados: { itens: [{ cotacoes: [] }] } })).toBe(false);
  });

  it('impressão estável do conteúdo (sem as chaves internas)', () => {
    const a = impressaoConteudoPeca({ descricao: 'x', dados_estruturados: { b: 1, a: { d: 2, c: [1, 2] }, _x: 1 } });
    const b = impressaoConteudoPeca({ descricao: ' x ', dados_estruturados: { a: { c: [1, 2], d: 2 }, b: 1 } });
    expect(a).toBe(b);
    expect(impressaoConteudoPeca({ descricao: 'x', dados_estruturados: { a: 1 } })).not.toBe(impressaoConteudoPeca({ descricao: 'x', dados_estruturados: { a: 2 } }));
  });
});

import { colunasTipadasDosMetadados, dataValida, mensagemCamposInvalidos, normalizarCamposTipados, tipoDaColuna } from './normalizar-campos-edicao';

const COLUNAS = colunasTipadasDosMetadados([
  { propertyName: 'data_publicacao_edital', type: 'timestamp', isNullable: true },
  { propertyName: 'data_abertura_sessao', type: 'timestamp without time zone', isNullable: true },
  { propertyName: 'valor_total_estimado', type: 'decimal', isNullable: true },
  { propertyName: 'tempo_prorrogacao', type: 'int', isNullable: true },
  { propertyName: 'item_pca_id', type: 'uuid', isNullable: true },
  { propertyName: 'usa_lotes', type: 'boolean', isNullable: false },
  { propertyName: 'objeto', type: 'text', isNullable: false },
  { propertyName: 'item_pca', type: 'uuid', isNullable: true, relationMetadata: {} },
]);

describe('normalização dos campos tipados na edição do processo (homologação E1)', () => {
  it('reconhece os tipos das colunas (string do TypeORM ou construtor)', () => {
    expect(tipoDaColuna('timestamp')).toBe('DATA');
    expect(tipoDaColuna('timestamp without time zone')).toBe('DATA');
    expect(tipoDaColuna('date')).toBe('DATA');
    expect(tipoDaColuna(Date)).toBe('DATA');
    expect(tipoDaColuna('decimal')).toBe('NUMERO');
    expect(tipoDaColuna('int')).toBe('INTEIRO');
    expect(tipoDaColuna('uuid')).toBe('UUID');
    expect(tipoDaColuna('boolean')).toBe('BOOLEANO');
    expect(tipoDaColuna('text')).toBeNull();
    expect(tipoDaColuna(String)).toBeNull();
    // coluna só de relação fica de fora
    expect(COLUNAS.map((c) => c.propriedade)).not.toContain('item_pca');
  });

  it('datas vazias do cronograma viram NULL (não "Invalid Date" → 500)', () => {
    const dados: any = { data_publicacao_edital: '', data_abertura_sessao: '   ', objeto: 'x' };
    expect(normalizarCamposTipados(dados, COLUNAS)).toEqual([]);
    expect(dados).toEqual({ data_publicacao_edital: null, data_abertura_sessao: null, objeto: 'x' });
  });

  it('datas válidas passam (dia, data e hora, com fuso, Date)', () => {
    for (const d of ['2026-09-30', '2026-09-30T10:00', '2026-09-30T10:00:00', '2026-09-30T10:00:00.000Z', '2026-09-30T10:00:00-03:00', new Date()]) {
      expect(dataValida(d)).toBe(true);
    }
  });

  it('data lixo, 31/02 e mês 13 → campo inválido com o rótulo da tela', () => {
    const dados: any = { data_publicacao_edital: 'amanhã', data_abertura_sessao: '2026-02-31' };
    const r = normalizarCamposTipados(dados, COLUNAS);
    expect(r.map((x) => x.campo)).toEqual(['data_publicacao_edital', 'data_abertura_sessao']);
    expect(mensagemCamposInvalidos(r)).toMatch(/Data de publicação \("amanhã"\) — data inválida/);
    expect(mensagemCamposInvalidos(r)).toMatch(/Abertura da sessão/);
    expect(dataValida('2026-13-01')).toBe(false);
    expect(dataValida(new Date('x'))).toBe(false);
  });

  it('números: vazio → NULL; texto numérico → número; lixo e inteiro com decimais → inválido', () => {
    const dados: any = { valor_total_estimado: '', tempo_prorrogacao: '2' };
    expect(normalizarCamposTipados(dados, COLUNAS)).toEqual([]);
    expect(dados).toEqual({ valor_total_estimado: null, tempo_prorrogacao: 2 });
    const ruim: any = { valor_total_estimado: 'abc', tempo_prorrogacao: 1.5 };
    expect(normalizarCamposTipados(ruim, COLUNAS).map((x) => x.campo)).toEqual(['valor_total_estimado', 'tempo_prorrogacao']);
  });

  it('UUID vazio → NULL; inválido → 400; booleano obrigatório vazio mantém o gravado', () => {
    const dados: any = { item_pca_id: '', usa_lotes: '' };
    expect(normalizarCamposTipados(dados, COLUNAS)).toEqual([]);
    expect(dados).toEqual({ item_pca_id: null });
    expect(normalizarCamposTipados({ item_pca_id: 'nao-e-uuid' }, COLUNAS)[0].campo).toBe('item_pca_id');
    const b: any = { usa_lotes: 'true' };
    normalizarCamposTipados(b, COLUNAS);
    expect(b.usa_lotes).toBe(true);
  });

  it('campos ausentes e objetos de relação não são tocados', () => {
    const dados: any = { item_pca_id: undefined, data_publicacao_edital: { qualquer: 1 } };
    expect(normalizarCamposTipados(dados, COLUNAS)).toEqual([]);
    expect(dados).toEqual({ item_pca_id: undefined, data_publicacao_edital: { qualquer: 1 } });
  });
});

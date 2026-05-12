import {
  FontePrecosProvider,
  fontePrecosAderenteAoItem,
  mapearResultadoFontePrecos,
  normalizarValorFontePrecos,
} from './pesquisa-precos-providers.service';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import axios from 'axios';

function itemNotebook(): ItemLicitacao {
  return {
    numero_item: 3,
    codigo_catmat: '637590',
    descricao_resumida:
      'Notebook - Tela: Superior A 14, Interatividade Da Tela: Sem Interatividade, Memoria Ram: Superior A 8',
    descricao_detalhada:
      'Notebook - Tela: Superior A 14, Interatividade Da Tela: Sem Interatividade, Memoria Ram: Superior A 8, Nucleos Por Processador: Superior A 8, Armazenamento Hdd: Sem Disco Hdd, Armazenamento Ssd: 480 A 1.000 Gb, Sistema Operacional: Proprietario, Garantia On Site: Superior A 36',
    quantidade: 1,
    unidade_medida: 'UN',
  } as unknown as ItemLicitacao;
}

describe('FontePrecosProvider helpers', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('converte valor unitario brasileiro para numero', () => {
    expect(normalizarValorFontePrecos('3.104,62')).toBe(3104.62);
    expect(normalizarValorFontePrecos('R$ 7.565,67')).toBe(7565.67);
    expect(normalizarValorFontePrecos('')).toBe(0);
  });

  it('mapeia resultado aderente usando valor unitario, data e melhor URL', () => {
    const candidato = mapearResultadoFontePrecos(
      {
        base: 'PNCP',
        uasg: { descricao: 'Camara Municipal de Exemplo' },
        fornecedor: { cnpj: '12345678000199', razao_social: 'Fornecedor Teste LTDA' },
        descricao:
          'Notebook tela 15 polegadas, memoria RAM 16GB, SSD 512GB, Windows, processador Intel Core i7, garantia on site 36 meses',
        descricao_comp: 'Item CATMAT 637590 para notebook corporativo',
        objeto: 'Aquisicao de notebooks',
        valor_unitario: '7.565,67',
        quant: '1',
        unidade: 'UN',
        dt_homologacao: '06/11/2025',
        url_edital: 'https://example.gov.br/edital.pdf',
        fonte: 'https://fonte.example',
      },
      itemNotebook(),
    );

    expect(candidato).toMatchObject({
      item_numero: 3,
      fonte_tipo: 'MIDIA_ESPECIALIZADA',
      valor_unitario: 7565.67,
      data_pesquisa: '2025-11-06',
      url_referencia: 'https://example.gov.br/edital.pdf',
      fornecedor_cnpj: '12345678000199',
    });
    expect(candidato?.descricao_fonte).toContain('Fonte de Precos');
  });

  it('ignora resultado sem valor unitario real', () => {
    const candidato = mapearResultadoFontePrecos(
      {
        descricao: 'Notebook tela 15 memoria RAM 16GB SSD 512GB Windows',
        valor_total: '50.000,00',
        fonte: 'https://example.gov.br/processo',
      },
      itemNotebook(),
    );

    expect(candidato).toBeNull();
  });

  it('aceita notebook aderente e rejeita itens claramente incompatíveis', () => {
    const item = itemNotebook();

    expect(
      fontePrecosAderenteAoItem(
        {
          descricao: 'Notebook tela 15 polegadas memoria RAM 16GB SSD 512GB Windows garantia on site',
        },
        item,
      ).aderente,
    ).toBe(true);

    for (const descricao of [
      'Veiculo tipo camionete diesel',
      'Computador desktop com monitor',
      'Bateria para notebook',
      'SSD 512GB avulso',
      'Notebook infantil educativo brinquedo',
    ]) {
      expect(fontePrecosAderenteAoItem({ descricao }, item).aderente).toBe(false);
    }
  });

  it('autentica com CSRF, consulta por CATMAT e reutiliza sessao', async () => {
    const get = jest.spyOn(axios, 'get').mockImplementation(async (url: string) => {
      if (url.endsWith('/login')) {
        return {
          data: '<input type="hidden" name="csrfmiddlewaretoken" value="csrf-123">',
          headers: { 'set-cookie': ['csrftoken=csrf-cookie; Path=/'] },
          status: 200,
        } as any;
      }
      if (url.endsWith('/api/check-session')) {
        return { data: { user: 'Teste' }, headers: {}, status: 200 } as any;
      }
      if (url.includes('/api/expressa/search/page')) {
        return {
          data: {
            result: {
              '1': {
                base: 'PNCP',
                uasg: { descricao: 'UASG Teste' },
                descricao: 'Notebook tela 15 memoria RAM 16GB SSD 512GB Windows garantia on site',
                descricao_comp: 'CATMAT 637590 notebook corporativo',
                valor_unitario: '4.999,90',
                dt_homologacao: '2026-03-20',
                url_edital: 'https://example.gov.br/edital.pdf',
              },
            },
          },
          headers: {},
          status: 200,
        } as any;
      }
      throw new Error(`URL inesperada: ${url}`);
    });
    const post = jest.spyOn(axios, 'post').mockResolvedValue({
      data: '',
      headers: { 'set-cookie': ['sessionid=session-123; Path=/'] },
      status: 302,
    } as any);

    const provider = new FontePrecosProvider({
      get: (key: string) =>
        ({
          FONTE_PRECOS_BASE_URL: 'https://fonte.example',
          FONTE_PRECOS_EMAIL: 'user@example.com',
          FONTE_PRECOS_PASSWORD: 'secret',
          FONTE_PRECOS_PERIODO_DIAS: '365',
        })[key],
    } as any);

    const context = {
      licitacao: {} as any,
      itens: [itemNotebook()],
      scope: { maxPorFonte: 8 },
    };

    const primeira = await provider.buscar(context);
    const segunda = await provider.buscar(context);

    expect(primeira).toHaveLength(1);
    expect(segunda).toHaveLength(1);
    expect(primeira[0]).toMatchObject({
      valor_unitario: 4999.9,
      url_referencia: 'https://example.gov.br/edital.pdf',
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(get.mock.calls.some(([url]) => String(url).endsWith('/api/expressa/search/page1'))).toBe(true);
  });
});

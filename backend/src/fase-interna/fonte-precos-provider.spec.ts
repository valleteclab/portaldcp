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

  it('normaliza URL base configurada com /login antes de autenticar', async () => {
    const get = jest.spyOn(axios, 'get').mockImplementation(async (url: string) => {
      if (url === 'https://fonte.example/login') {
        return {
          data: '<input type="hidden" name="csrfmiddlewaretoken" value="csrf-123">',
          headers: { 'set-cookie': ['csrftoken=csrf-cookie; Path=/'] },
          status: 200,
        } as any;
      }
      if (url === 'https://fonte.example/api/check-session') {
        return { data: { user: 'Teste' }, headers: {}, status: 200 } as any;
      }
      if (String(url).startsWith('https://fonte.example/api/expressa/search/page')) {
        return { data: { result: {} }, headers: {}, status: 200 } as any;
      }
      throw new Error(`URL inesperada: ${url}`);
    });
    jest.spyOn(axios, 'post').mockResolvedValue({
      data: '',
      headers: { 'set-cookie': ['sessionid=session-123; Path=/'] },
      status: 302,
    } as any);

    const provider = new FontePrecosProvider({
      get: (key: string) =>
        ({
          FONTE_PRECOS_BASE_URL: 'https://fonte.example/login',
          FONTE_PRECOS_EMAIL: 'user@example.com',
          FONTE_PRECOS_PASSWORD: 'secret',
        })[key],
    } as any);

    await provider.buscar({
      licitacao: {} as any,
      itens: [itemNotebook()],
      scope: { maxPorFonte: 1 },
    });

    expect(get.mock.calls.map(([url]) => url)).toContain('https://fonte.example/login');
    expect(get.mock.calls.map(([url]) => url)).not.toContain('https://fonte.example/login/login');
  });
});

describe('referências que exigem conferência', () => {
  const {
    avisoDeUnidadeDiferente,
    ehPaginaDeListagem,
    exigeConferencia,
    tipoDeReferencia,
    FLAG_REFERENCIA_COMPLEMENTAR,
    ORIGEM_BUSCA_WEB,
  } = require('./pesquisa-precos-providers.service');

  it('unidade: resma lá e caixa aqui avisa; sinônimos e unidade desconhecida não', () => {
    expect(avisoDeUnidadeDiferente('RESMA', 'CAIXA')).toMatch(/Unidade diferente \(RESMA lá, CAIXA aqui\)/);
    expect(avisoDeUnidadeDiferente('Unidade', 'UN')).toBeNull();
    expect(avisoDeUnidadeDiferente('cx', 'Caixa')).toBeNull();
    expect(avisoDeUnidadeDiferente('Frasco 500 ml', 'UN')).toBeNull();
    expect(avisoDeUnidadeDiferente('', 'UN')).toBeNull();
  });

  it('link de listagem ou busca não é página de produto', () => {
    expect(ehPaginaDeListagem('https://www.kalunga.com.br/depto/papeis/15')).toBe(true);
    expect(ehPaginaDeListagem('https://www.amazon.com.br/sandisk-64gb/s?k=sandisk+64gb')).toBe(true);
    expect(ehPaginaDeListagem('https://loja.com.br/busca?q=pen+drive')).toBe(true);
    expect(ehPaginaDeListagem('https://www.casadopapel.com.br/papel-a4-75g-chamex-caixa-com-10-pacotes-p10888')).toBe(false);
  });

  it('banco de preços: a impressora não entra sozinha na pesquisa do toner', () => {
    const toner = { numero_item: 1, descricao_resumida: 'Toner compatível para impressora laser, preto', quantidade: 30, unidade_medida: 'UNIDADE' } as unknown as ItemLicitacao;
    const base = { valor_unitario: '39,72', quant: '10', dt_homologacao: '18/09/2026', url_edital: 'https://example.gov.br/edital.pdf' };
    const certo = mapearResultadoFontePrecos({ ...base, descricao: 'Toner compatível preto para impressora laser HP 105A' }, toner);
    expect(certo).toBeTruthy();
    expect(exigeConferencia(certo)).toBe(false);
    const impressora = mapearResultadoFontePrecos({ ...base, valor_unitario: '5.300,00', descricao: 'IMPRESSORA LASER MULTIFUNCIONAL COLOR, compatível com toner preto' }, toner);
    // pode até vir como referência, mas nunca sem alguém conferir
    if (impressora) {
      expect(impressora.flags.join(' ')).toMatch(/revisar/);
      expect(exigeConferencia(impressora)).toBe(true);
    }
  });

  it('banco de preços: item de descrição curta com referência idêntica não fica como parcial', () => {
    const cabo = { numero_item: 10, descricao_resumida: 'Cabo HDMI 2 metros', quantidade: 20, unidade_medida: 'UNIDADE' } as unknown as ItemLicitacao;
    const base = { valor_unitario: '11,99', quant: '20', unidade: 'UN', dt_homologacao: '18/09/2026', url_edital: 'https://example.gov.br/edital.pdf' };
    const igual = mapearResultadoFontePrecos({ ...base, descricao: 'CABO HDMI 2 METROS CADA' }, cabo);
    expect(igual.flags.join(' ')).not.toMatch(/parcial/);
    expect(exigeConferencia(igual)).toBe(false);
    // faltando palavra do item, continua parcial
    const outro = mapearResultadoFontePrecos({ ...base, descricao: 'Cabo HDMI x VGA adaptador, 2 unidades' }, cabo);
    if (outro) expect(exigeConferencia(outro)).toBe(true);
  });

  it('só o preço praticado e sem ressalva entra sozinho na cesta', () => {
    const praticado = { flags: ['Mesmo estado (BA).'], evidencia: { origem: 'PNCP — valor homologado do item' } };
    expect(tipoDeReferencia(praticado)).toBe('PRATICADO');
    expect(exigeConferencia(praticado)).toBe(false);

    const loja = { flags: [], evidencia: { origem: ORIGEM_BUSCA_WEB } };
    expect(tipoDeReferencia(loja)).toBe('MERCADO');
    expect(exigeConferencia(loja)).toBe(true);

    const estimado = { flags: [FLAG_REFERENCIA_COMPLEMENTAR], evidencia: { origem: 'PNCP — valor estimado do item' } };
    expect(tipoDeReferencia(estimado)).toBe('ESTIMADO');
    expect(exigeConferencia(estimado)).toBe(true);

    // banco de preços: aderência integral entra; parcial ou com unidade diferente espera
    const banco = { flags: ['Fonte complementar Fonte de Precos: validar comprovante antes de aprovar como fonte oficial.'], evidencia: { origem: 'Fonte de Precos - Pesquisa Expressa autenticada' } };
    expect(exigeConferencia(banco)).toBe(false);
    expect(exigeConferencia({ ...banco, flags: [...banco.flags, 'Aderencia textual parcial: revisar antes de aprovar.'] })).toBe(true);
    expect(exigeConferencia({ ...banco, flags: [avisoDeUnidadeDiferente('RESMA', 'CAIXA')] })).toBe(true);
  });
});

describe('inciso do art. 23 de cada cotação', () => {
  const { incisoDaCotacao } = require('./telas/pesquisa-regras');
  it('banco "Fonte de Preços" conta como contratações similares (II), loja como mídia (III)', () => {
    expect(incisoDaCotacao({ fonte: 'MIDIA_ESPECIALIZADA', descricao_fonte: 'Fonte de Precos - pncp - MUNICIPIO DE TIMBO' })).toBe('II');
    expect(incisoDaCotacao({ fonte: 'MIDIA_ESPECIALIZADA', descricao_fonte: 'Relatório', observacao: 'Importada do CSV Fonte de Precos' })).toBe('II');
    expect(incisoDaCotacao({ fonte: 'MIDIA_ESPECIALIZADA', descricao_fonte: 'Kalunga' })).toBe('III');
    expect(incisoDaCotacao({ fonte: 'PNCP', descricao_fonte: 'PNCP item 1' })).toBe('II');
    expect(incisoDaCotacao({ fonte: 'PAINEL_DE_PRECOS', descricao_fonte: 'Painel' })).toBe('I');
  });
});

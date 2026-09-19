import {
  antigoSiga,
  avaliarBemSiga,
  BemParaSiga,
  ConfigPatrimonioSiga,
  cpfValido,
  linhaPatrimonioSiga,
  pendenciasBemSiga,
  tipoSigaEfetivo,
  tombosRepetidos,
} from './siga-patrimonio.util';

const config: ConfigPatrimonioSiga = {
  codigo_unidade: '123',
  codigo_orgao: '1',
  codigo_unidade_orcamentaria: '101',
  data_inicio: null,
};

const bemOk = (extra: Partial<BemParaSiga> = {}): BemParaSiga => ({
  plaqueta: '0042',
  descricao: 'Mesa de escritório em MDF, 1,20 m, com 3 gavetas',
  siga_tipo_bem: null,
  categoria: { siga_tipo_bem: 1 },
  referencia_contabil: '0577/2025',
  valor_aquisicao: 1234.5,
  responsavel_nome: 'Maria da Conceição Souza',
  responsavel_cpf: '529.982.247-25',
  data_aquisicao: '2025-03-10',
  data_baixa: null,
  ...extra,
});

/** Posição 0-based inclusiva do leiaute → trecho da linha. */
const campo = (linha: string, ini: number, fim: number) => linha.slice(ini, fim + 1);

describe('siga-patrimonio.util — CPF', () => {
  it('aceita CPF válido com ou sem máscara', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('52998224725')).toBe(true);
    expect(cpfValido('111.444.777-35')).toBe(true);
  });

  it('rejeita dígito verificador errado, repetidos, tamanho errado e vazio', () => {
    expect(cpfValido('529.982.247-24')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cpfValido('1234567890')).toBe(false);
    expect(cpfValido('')).toBe(false);
    expect(cpfValido(null)).toBe(false);
  });
});

describe('siga-patrimonio.util — linha do arquivo Patrimonio', () => {
  const linha = linhaPatrimonioSiga(bemOk(), config, 2);

  it('tem exatamente 251 posições', () => {
    expect(linha.length).toBe(251);
  });

  it('preenche cada campo na posição do leiaute', () => {
    expect(campo(linha, 0, 0)).toBe('1');
    expect(campo(linha, 1, 4)).toBe(' 123');
    expect(campo(linha, 5, 8)).toBe('2025');
    expect(campo(linha, 9, 23)).toBe('0042'.padEnd(15, ' '));
    expect(campo(linha, 24, 25)).toBe(' 1');
    expect(campo(linha, 26, 125)).toBe('Mesa de escritório em MDF, 1,20 m, com 3 gavetas'.padEnd(100, ' '));
    expect(campo(linha, 126, 135)).toBe('       577');
    expect(campo(linha, 136, 136)).toBe('2');
    expect(campo(linha, 137, 152)).toBe('0000000000123450');
    expect(campo(linha, 153, 202)).toBe('Maria da Conceição Souza'.padEnd(50, ' '));
    expect(campo(linha, 203, 216)).toBe('52998224725   ');
    expect(campo(linha, 217, 224)).toBe('10032025');
    expect(campo(linha, 225, 232)).toBe('        ');
    expect(campo(linha, 233, 236)).toBe('   1');
    expect(campo(linha, 237, 240)).toBe(' 101');
    expect(campo(linha, 241, 250)).toBe('         2');
  });

  it('empenho "0577/2025" vira "577" (sem zeros à esquerda); sem empenho fica em branco', () => {
    expect(campo(linhaPatrimonioSiga(bemOk({ referencia_contabil: '659' }), config, 2), 126, 135)).toBe('       659');
    expect(campo(linhaPatrimonioSiga(bemOk({ referencia_contabil: null }), config, 2), 126, 135)).toBe(' '.repeat(10));
  });

  it('data de baixa em ddmmaaaa', () => {
    const l = linhaPatrimonioSiga(bemOk({ data_baixa: '2026-08-01' }), config, 3);
    expect(campo(l, 225, 232)).toBe('01082026');
    expect(campo(l, 241, 250)).toBe('         3');
  });

  it('tipo do bem sobrepõe o da categoria', () => {
    const b = bemOk({ siga_tipo_bem: 9 });
    expect(tipoSigaEfetivo(b)).toBe(9);
    expect(campo(linhaPatrimonioSiga(b, config, 2), 24, 25)).toBe(' 9');
    expect(tipoSigaEfetivo(bemOk({ categoria: null }))).toBeNull();
  });

  it('descrição longa é cortada em 100 e caracteres proibidos saem', () => {
    const l = linhaPatrimonioSiga(bemOk({ descricao: "Armário d'aço; " + 'x'.repeat(200) }), config, 2);
    expect(l.length).toBe(251);
    expect(campo(l, 26, 125).startsWith('Armário d aço x')).toBe(true);
  });

  it('lança erro quando há pendência', () => {
    expect(() => linhaPatrimonioSiga(bemOk({ responsavel_cpf: null }), config, 2)).toThrow(/CPF/);
  });
});

describe('siga-patrimonio.util — st_Antigo', () => {
  it('"1" quando não há nº de empenho', () => {
    expect(antigoSiga(bemOk({ referencia_contabil: null }), null)).toBe('1');
    expect(antigoSiga(bemOk({ referencia_contabil: 'S/N' }), null)).toBe('1');
  });

  it('"1" quando adquirido antes do início do SIGA; "2" a partir dele', () => {
    expect(antigoSiga(bemOk({ data_aquisicao: '2019-12-31' }), '2020-01-01')).toBe('1');
    expect(antigoSiga(bemOk({ data_aquisicao: '2020-01-01' }), '2020-01-01')).toBe('2');
  });

  it('"2" com empenho e sem data de início configurada', () => {
    expect(antigoSiga(bemOk(), null)).toBe('2');
    expect(linhaPatrimonioSiga(bemOk({ data_aquisicao: '2010-05-05' }), { ...config, data_inicio: '2015-01-01' }, 2)[136]).toBe('1');
  });
});

describe('siga-patrimonio.util — pendências', () => {
  it('bem completo não tem pendência', () => {
    expect(pendenciasBemSiga(bemOk())).toEqual([]);
    expect(avaliarBemSiga(bemOk(), config).linha).toHaveLength(251);
  });

  it('aponta os campos obrigatórios que faltam', () => {
    const tipos = pendenciasBemSiga({
      plaqueta: '',
      descricao: ' ',
      categoria: null,
      responsavel_nome: null,
      responsavel_cpf: '123',
      data_aquisicao: null,
    }).map((p) => p.tipo);
    expect(tipos).toEqual(
      expect.arrayContaining(['SEM_TOMBO', 'SEM_DESCRICAO', 'SEM_TIPO', 'SEM_RESPONSAVEL', 'CPF_INVALIDO', 'SEM_DATA_AQUISICAO']),
    );
  });

  it('data de aquisição antes de 2000 ou no futuro', () => {
    expect(pendenciasBemSiga(bemOk({ data_aquisicao: '1998-05-01' }))[0].tipo).toBe('DATA_AQUISICAO_INVALIDA');
    expect(pendenciasBemSiga(bemOk({ data_aquisicao: '2099-01-01' }), new Date(2026, 8, 19))[0].tipo).toBe('DATA_AQUISICAO_INVALIDA');
  });

  it('tombo com mais de 15 caracteres, baixa antes da aquisição e valor negativo', () => {
    expect(pendenciasBemSiga(bemOk({ plaqueta: '1234567890123456' })).map((p) => p.tipo)).toEqual(['TOMBO_LONGO']);
    expect(pendenciasBemSiga(bemOk({ data_baixa: '2024-01-01' })).map((p) => p.tipo)).toEqual(['BAIXA_INVALIDA']);
    expect(pendenciasBemSiga(bemOk({ valor_aquisicao: -1 })).map((p) => p.tipo)).toEqual(['VALOR_INVALIDO']);
  });

  it('mensagens em português para o usuário', () => {
    const [p] = pendenciasBemSiga(bemOk({ responsavel_cpf: null }));
    expect(p.mensagem).toBe('Informe o CPF do responsável pelo bem.');
    const avaliado = avaliarBemSiga(bemOk({ responsavel_nome: '' }), config);
    expect(avaliado.linha).toBeNull();
    expect(avaliado.pendencias[0].tipo).toBe('SEM_RESPONSAVEL');
  });

  it('detecta tombos repetidos (sem diferenciar maiúsculas)', () => {
    const rep = tombosRepetidos([{ plaqueta: '10' }, { plaqueta: 'a1' }, { plaqueta: '10' }, { plaqueta: 'A1' }, { plaqueta: '11' }]);
    expect([...rep].sort()).toEqual(['10', 'A1']);
  });
});

import { TipoCombustivelVeiculo } from './entities/veiculo.entity';
import {
  agregarConsumoCombustivel,
  codigoCombustivelConsumo,
  codigoCombustivelFrota,
  competenciaSiga,
  ConsumoFonte,
  dataBrasilia,
  linhaCombustivelSiga,
  linhaFrotaSiga,
  pendenciasVeiculoSiga,
  registroBemFrota,
  stAntigoVeiculo,
  TAMANHO_LINHA_COMBUSTIVEL,
  TAMANHO_LINHA_FROTA,
  VeiculoSiga,
} from './siga-frota.util';

const veiculo = (extra: Partial<VeiculoSiga> = {}): VeiculoSiga => ({
  id: 'v1',
  placa: 'abc-1d23',
  tipo_combustivel: TipoCombustivelVeiculo.DIESEL,
  siga_tipo_veiculo: 7,
  siga_marca_veiculo: 42,
  renavam: '01234567890',
  chassi: '9bwzzz377vt004251',
  ano: 2022,
  alugado: false,
  nota_fiscal_ou_contrato: 'NF 1234',
  valor_aquisicao: '185000.50',
  numero_empenho: '0577/2025',
  data_aquisicao: '2025-03-15',
  data_baixa: null,
  ...extra,
});

/** Posições 0-based inclusivas, como no leiaute. */
const pos = (linha: string, de: number, ate: number) => linha.slice(de, ate + 1);

describe('siga-frota.util — arquivo de Frota', () => {
  it('monta a linha com 150 posições nos lugares do leiaute', () => {
    const l = linhaFrotaSiga(veiculo(), { codigoUnidade: '123' }, 2);
    expect(l).toHaveLength(TAMANHO_LINHA_FROTA);
    expect(pos(l, 0, 0)).toBe('1');
    expect(pos(l, 1, 4)).toBe(' 123');
    expect(pos(l, 5, 19)).toBe('ABC1D23        ');
    expect(pos(l, 20, 21)).toBe(' 7');
    expect(pos(l, 22, 24)).toBe(' 42');
    expect(pos(l, 25, 26)).toBe(' 3');
    expect(pos(l, 27, 30)).toBe('    ');
    expect(pos(l, 31, 50)).toBe('01234567890'.padStart(20, ' '));
    expect(pos(l, 51, 75)).toBe('9BWZZZ377VT004251'.padEnd(25, ' '));
    expect(pos(l, 76, 79)).toBe('2022');
    expect(pos(l, 80, 80)).toBe('N');
    expect(pos(l, 81, 96)).toBe('NF 1234'.padEnd(16, ' '));
    expect(pos(l, 97, 112)).toBe('0000000018500050');
    expect(pos(l, 113, 113)).toBe('2');
    expect(pos(l, 114, 123)).toBe('       577');
    expect(pos(l, 124, 131)).toBe('15032025');
    expect(pos(l, 132, 139)).toBe('        ');
    expect(pos(l, 140, 149)).toBe('         2');
  });

  it('st_Alugado: "S" quando alugado, "N" quando próprio', () => {
    const alugado = linhaFrotaSiga(
      veiculo({ alugado: true, valor_aquisicao: null, nota_fiscal_ou_contrato: 'CT 012/2026' }),
      { codigoUnidade: '1' },
      3,
    );
    expect(pos(alugado, 80, 80)).toBe('S');
    expect(pos(alugado, 81, 96)).toBe('CT 012/2026'.padEnd(16, ' '));
    expect(pos(alugado, 97, 112)).toBe('0'.repeat(16));
    expect(pos(linhaFrotaSiga(veiculo(), { codigoUnidade: '1' }, 3), 80, 80)).toBe('N');
  });

  it('st_Antigo: "1" quando adquirido antes do início do SIGA', () => {
    expect(stAntigoVeiculo('2019-12-31', '2020-01-01')).toBe('1');
    expect(stAntigoVeiculo('2020-01-01', '2020-01-01')).toBe('2');
    expect(stAntigoVeiculo('2019-12-31', null)).toBe('2');
    const l = linhaFrotaSiga(veiculo(), { codigoUnidade: '1', dataInicioSiga: '2026-01-01' }, 2);
    expect(pos(l, 113, 113)).toBe('1');
  });

  it('data de baixa preenchida sai em ddmmaaaa', () => {
    const l = linhaFrotaSiga(veiculo({ data_baixa: '2026-08-01' }), { codigoUnidade: '1' }, 2);
    expect(pos(l, 132, 139)).toBe('01082026');
  });

  it('empenho vazio vira brancos', () => {
    const l = linhaFrotaSiga(veiculo({ numero_empenho: null }), { codigoUnidade: '1' }, 2);
    expect(pos(l, 114, 123)).toBe(' '.repeat(10));
  });

  it('veículo completo não tem pendências', () => {
    expect(pendenciasVeiculoSiga(veiculo())).toEqual([]);
  });

  it('aponta cada dado que falta', () => {
    const p = pendenciasVeiculoSiga(
      veiculo({
        placa: '',
        siga_tipo_veiculo: null,
        siga_marca_veiculo: null,
        tipo_combustivel: TipoCombustivelVeiculo.ELETRICO,
        renavam: null,
        chassi: '',
        ano: null,
        data_aquisicao: null,
        nota_fiscal_ou_contrato: null,
        valor_aquisicao: null,
      }),
    );
    expect(p).toEqual(
      expect.arrayContaining([
        'Placa não informada',
        'Tipo de veículo (código do SIGA) não informado',
        'Marca do veículo (código do SIGA) não informada',
        'Combustível sem código no SIGA (aceita gasolina, álcool, diesel, gás ou flex)',
        'RENAVAM não informado',
        'Chassi não informado',
        'Ano de fabricação inválido',
        'Data de aquisição não informada',
        'Nº da nota fiscal de aquisição não informado',
        'Valor de aquisição não informado (veículo próprio)',
      ]),
    );
    expect(() => linhaFrotaSiga(veiculo({ placa: '' }), { codigoUnidade: '1' }, 2)).toThrow();
  });

  it('alugado não exige valor; pede nº do contrato de locação', () => {
    const p = pendenciasVeiculoSiga(veiculo({ alugado: true, valor_aquisicao: null, nota_fiscal_ou_contrato: null }));
    expect(p).toEqual(['Nº do contrato de locação não informado']);
  });

  it('valida códigos do SIGA, RENAVAM, data antes de 2000 e baixa antes da aquisição', () => {
    expect(pendenciasVeiculoSiga(veiculo({ siga_tipo_veiculo: 100 }))).toContain(
      'Tipo de veículo (código do SIGA) deve ter até 2 dígitos',
    );
    expect(pendenciasVeiculoSiga(veiculo({ siga_marca_veiculo: 1000 }))).toContain(
      'Marca do veículo (código do SIGA) deve ter até 3 dígitos',
    );
    expect(pendenciasVeiculoSiga(veiculo({ renavam: '12AB' }))).toContain('RENAVAM deve ter só números (até 20 dígitos)');
    expect(pendenciasVeiculoSiga(veiculo({ data_aquisicao: '1999-05-01' }))).toContain(
      'Data de aquisição anterior a 2000 não é aceita pelo SIGA',
    );
    expect(pendenciasVeiculoSiga(veiculo({ data_baixa: '2024-01-01' }))).toContain(
      'Data de baixa anterior à data de aquisição',
    );
  });

  it('mapeia o combustível do veículo para o código do arquivo de Frota', () => {
    expect(codigoCombustivelFrota(TipoCombustivelVeiculo.GASOLINA)).toBe(1);
    expect(codigoCombustivelFrota(TipoCombustivelVeiculo.ETANOL)).toBe(2);
    expect(codigoCombustivelFrota(TipoCombustivelVeiculo.DIESEL)).toBe(3);
    expect(codigoCombustivelFrota(TipoCombustivelVeiculo.GNV)).toBe(4);
    expect(codigoCombustivelFrota(TipoCombustivelVeiculo.FLEX)).toBe(5);
    expect(codigoCombustivelFrota(TipoCombustivelVeiculo.ELETRICO)).toBeNull();
  });

  it('registro do bem: placa sem hífen/espaço, maiúscula', () => {
    expect(registroBemFrota(' abc-1234 ')).toBe('ABC1234');
  });
});

describe('siga-frota.util — arquivo de Combustível', () => {
  const veiculos = [
    { id: 'v1', placa: 'ABC-1D23', data_aquisicao: '2025-03-15', siga_enviado_em: new Date() },
    { id: 'v2', placa: 'XYZ9A87', data_aquisicao: '2024-01-10', siga_enviado_em: null },
    { id: 'v3', placa: 'SEM0D01', data_aquisicao: null, siga_enviado_em: null },
  ];
  const c = (extra: Partial<ConsumoFonte>): ConsumoFonte => ({
    veiculo_id: 'v1',
    placa: 'ABC-1D23',
    data: '2026-08-10',
    litros: 10,
    valor: 60,
    combustivel: 'DIESEL',
    ...extra,
  });

  it('mapeia o combustível abastecido (1 Gasolina, 2 Álcool, 3 Diesel, 4 GNV)', () => {
    expect(codigoCombustivelConsumo('GASOLINA')).toBe(1);
    expect(codigoCombustivelConsumo('Gasolina comum')).toBe(1);
    expect(codigoCombustivelConsumo('ETANOL')).toBe(2);
    expect(codigoCombustivelConsumo('Álcool')).toBe(2);
    expect(codigoCombustivelConsumo('Diesel S10')).toBe(3);
    expect(codigoCombustivelConsumo('GNV')).toBe(4);
    expect(codigoCombustivelConsumo('FLEX')).toBeNull();
    expect(codigoCombustivelConsumo('ELETRICO')).toBeNull();
    expect(codigoCombustivelConsumo('')).toBeNull();
  });

  it('competência AAAA-MM vira AAAAMM; formato errado é rejeitado', () => {
    expect(competenciaSiga('2026-08')).toBe('202608');
    expect(() => competenciaSiga('2026-13')).toThrow();
    expect(() => competenciaSiga('08/2026')).toThrow();
    expect(() => competenciaSiga('2026-8')).toThrow();
  });

  it('soma abastecimentos do mesmo veículo e combustível; exclui outro mês', () => {
    const linhas = agregarConsumoCombustivel(
      '2026-08',
      [
        c({ litros: 20.5, valor: '123.45' }),
        c({ veiculo_id: null, placa: 'abc1d23', litros: '25.178', valor: 150.1, data: '2026-08-31' }),
        c({ litros: 99, valor: 999, data: '2026-07-31' }),
        c({ litros: 5, valor: 30, combustivel: 'GASOLINA' }),
      ],
      veiculos,
    );
    expect(linhas).toHaveLength(2);
    const diesel = linhas.find((l) => l.combustivel_codigo === 3)!;
    expect(diesel.litros).toBe(45.678);
    expect(diesel.custo).toBe(273.55);
    expect(diesel.abastecimentos).toBe(2);
    expect(diesel.pendencias).toEqual([]);
    expect(diesel.avisos).toEqual([]);
    expect(linhas.find((l) => l.combustivel_codigo === 1)!.litros).toBe(5);
  });

  it('monta a linha de combustível com litros em 3 casas nas posições do leiaute', () => {
    const [linha] = agregarConsumoCombustivel('2026-08', [c({ litros: 20.5, valor: 123.45 }), c({ litros: 25.178, valor: 150.1 })], veiculos);
    const l = linhaCombustivelSiga(linha, '123', '2026-08', 2);
    expect(l).toHaveLength(TAMANHO_LINHA_COMBUSTIVEL);
    expect(pos(l, 0, 0)).toBe('1');
    expect(pos(l, 1, 4)).toBe(' 123');
    expect(pos(l, 5, 19)).toBe('ABC1D23        ');
    expect(pos(l, 20, 21)).toBe(' 3');
    expect(pos(l, 22, 28)).toBe('0045678');
    expect(pos(l, 29, 44)).toBe('0000000000027355');
    expect(pos(l, 45, 50)).toBe('202608');
    expect(pos(l, 51, 58)).toBe('15032025');
    expect(pos(l, 59, 68)).toBe('         2');
  });

  it('pendências: flex, veículo sem data de aquisição, placa fora da frota; aviso se ainda não enviado', () => {
    const linhas = agregarConsumoCombustivel(
      '2026-08',
      [
        c({ combustivel: 'FLEX' }),
        c({ veiculo_id: 'v3', placa: 'SEM0D01' }),
        c({ veiculo_id: null, placa: 'NAO0000' }),
        c({ veiculo_id: 'v2', placa: 'XYZ9A87' }),
      ],
      veiculos,
    );
    const flex = linhas.find((l) => l.veiculo_id === 'v1')!;
    expect(flex.pendencias[0]).toMatch(/Flex/);
    expect(() => linhaCombustivelSiga(flex, '1', '2026-08', 2)).toThrow();
    expect(linhas.find((l) => l.veiculo_id === 'v3')!.pendencias).toContain(
      'Veículo sem data de aquisição (exigida pelo SIGA)',
    );
    expect(linhas.find((l) => l.registro_bem === 'NAO0000')!.pendencias).toContain('Veículo não cadastrado na frota');
    const v2 = linhas.find((l) => l.veiculo_id === 'v2')!;
    expect(v2.pendencias).toEqual([]);
    expect(v2.avisos[0]).toMatch(/ainda não enviado/);
  });

  it('data do abastecimento em Brasília (virada do mês)', () => {
    expect(dataBrasilia(new Date('2026-09-01T02:30:00Z'))).toBe('2026-08-31');
    expect(dataBrasilia(new Date('2026-09-01T03:00:00Z'))).toBe('2026-09-01');
    expect(dataBrasilia(null)).toBeNull();
  });
});

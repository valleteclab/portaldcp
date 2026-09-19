/**
 * Arquivos do SIGA (TCM-BA) do módulo Frota:
 * - "Frota" (tabela 68, grupo Consumo): cadastro dos veículos, 150 posições.
 *   O SIGA cadastra por inclusão — cada veículo é enviado uma vez.
 * - "Combustivel" (tabela 70, Informes Mensais): consumo do mês por veículo e
 *   combustível. O leiaute diz "68 posições", mas a soma dos campos (o
 *   sequencial ocupa 59–68, 10 bytes) dá 69 — montamos pelos tamanhos dos
 *   campos, isto é, 69 caracteres.
 *
 * Funções puras (sem banco) para poder testar as posições exatas.
 */
import { campoAN, campoD, campoN, campoV, ErroCampoSiga, numeroEmpenhoSiga } from '../siga/siga-arquivo.util';
import { TipoCombustivelVeiculo } from './entities/veiculo.entity';

export const TAMANHO_LINHA_FROTA = 150;
export const TAMANHO_LINHA_COMBUSTIVEL = 69;

/** Campos do veículo usados no arquivo de Frota. */
export interface VeiculoSiga {
  id: string;
  placa: string | null;
  tipo_combustivel: TipoCombustivelVeiculo | string | null;
  siga_tipo_veiculo: number | null;
  siga_marca_veiculo: number | null;
  renavam: string | null;
  chassi: string | null;
  ano: number | null;
  alugado: boolean | null;
  nota_fiscal_ou_contrato: string | null;
  valor_aquisicao: number | string | null;
  numero_empenho: string | null;
  data_aquisicao: string | Date | null;
  data_baixa: string | Date | null;
}

// ─────────────────────────── utilitários ───────────────────────────

/** nu_RegistroBem: a placa sem espaços/hífen, em maiúsculas (a mesma nos dois arquivos). */
export function registroBemFrota(placa: string | null | undefined): string {
  return String(placa ?? '').toUpperCase().replace(/[\s\-.]/g, '');
}

function dataIso(valor: string | Date | null | undefined): string | null {
  if (!valor) return null;
  if (valor instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${valor.getFullYear()}-${p(valor.getMonth() + 1)}-${p(valor.getDate())}`;
  }
  const iso = String(valor).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

const arred = (valor: number, casas: number) => Math.round(valor * 10 ** casas) / 10 ** casas;

/** Competência 'AAAA-MM' → 'AAAAMM'. Lança ErroCampoSiga se inválida. */
export function competenciaSiga(competencia: string | null | undefined): string {
  const m = String(competencia ?? '').trim().match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!m) throw new ErroCampoSiga('Competência inválida: informe no formato AAAA-MM.');
  if (Number(m[1]) < 2000) throw new ErroCampoSiga('Competência anterior a 2000 não é aceita pelo SIGA.');
  return `${m[1]}${m[2]}`;
}

// ─────────────────────────── combustíveis ───────────────────────────

/** tp_Combustivel do arquivo de Frota: 1 Gasolina, 2 Álcool, 3 Diesel, 4 Gás, 5 Flex. */
export function codigoCombustivelFrota(tipo: string | null | undefined): number | null {
  switch (String(tipo ?? '').toUpperCase()) {
    case TipoCombustivelVeiculo.GASOLINA:
      return 1;
    case TipoCombustivelVeiculo.ETANOL:
      return 2;
    case TipoCombustivelVeiculo.DIESEL:
      return 3;
    case TipoCombustivelVeiculo.GNV:
      return 4;
    case TipoCombustivelVeiculo.FLEX:
      return 5;
    default:
      return null; // ELETRICO e desconhecidos
  }
}

export const ROTULO_COMBUSTIVEL_CONSUMO: Record<number, string> = {
  1: 'Gasolina',
  2: 'Álcool',
  3: 'Diesel',
  4: 'GNV',
};

/**
 * tp_Combustivel do arquivo de Combustível (o que foi de fato comprado):
 * 1 Gasolina, 2 Álcool, 3 Diesel, 4 GNV. Aceita os enums do sistema e textos
 * livres ("Gasolina comum", "Diesel S10", "Álcool"...). Flex/elétrico → null.
 */
export function codigoCombustivelConsumo(tipo: string | null | undefined): number | null {
  const t = String(tipo ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  if (!t.trim() || t.includes('flex') || t.includes('eletric')) return null;
  if (t.includes('gasolina')) return 1;
  if (t.includes('etanol') || t.includes('alcool')) return 2;
  if (t.includes('diesel')) return 3;
  if (t.includes('gnv') || t.includes('gas natural')) return 4;
  return null;
}

// ─────────────────────────── arquivo de Frota ───────────────────────────

export interface ContextoFrotaSiga {
  codigoUnidade: string;
  /** siga_data_inicio do órgão ('YYYY-MM-DD'): aquisição anterior → st_Antigo = "1". */
  dataInicioSiga?: string | null;
}

/** O que falta no veículo para entrar no arquivo de Frota (vazio = pronto). */
export function pendenciasVeiculoSiga(v: VeiculoSiga): string[] {
  const faltas: string[] = [];
  const registro = registroBemFrota(v.placa);
  if (!registro) faltas.push('Placa não informada');
  else if (registro.length > 15) faltas.push('Placa/registro do bem com mais de 15 caracteres');

  const tipo = v.siga_tipo_veiculo == null ? null : Number(v.siga_tipo_veiculo);
  if (tipo == null) faltas.push('Tipo de veículo (código do SIGA) não informado');
  else if (!Number.isInteger(tipo) || tipo < 1 || tipo > 99) faltas.push('Tipo de veículo (código do SIGA) deve ter até 2 dígitos');

  const marca = v.siga_marca_veiculo == null ? null : Number(v.siga_marca_veiculo);
  if (marca == null) faltas.push('Marca do veículo (código do SIGA) não informada');
  else if (!Number.isInteger(marca) || marca < 1 || marca > 999) faltas.push('Marca do veículo (código do SIGA) deve ter até 3 dígitos');

  if (codigoCombustivelFrota(v.tipo_combustivel) == null)
    faltas.push('Combustível sem código no SIGA (aceita gasolina, álcool, diesel, gás ou flex)');

  const renavam = String(v.renavam ?? '').replace(/[\s.\-]/g, '');
  if (!renavam) faltas.push('RENAVAM não informado');
  else if (!/^\d{1,20}$/.test(renavam)) faltas.push('RENAVAM deve ter só números (até 20 dígitos)');

  if (!String(v.chassi ?? '').trim()) faltas.push('Chassi não informado');

  const ano = Number(v.ano);
  if (!v.ano || !Number.isInteger(ano) || ano < 1900 || ano > 9999) faltas.push('Ano de fabricação inválido');

  const aquisicao = dataIso(v.data_aquisicao);
  if (!aquisicao) faltas.push(v.alugado ? 'Data do contrato de locação não informada' : 'Data de aquisição não informada');
  else if (Number(aquisicao.slice(0, 4)) < 2000)
    faltas.push('Data de aquisição anterior a 2000 não é aceita pelo SIGA');

  if (!String(v.nota_fiscal_ou_contrato ?? '').trim())
    faltas.push(v.alugado ? 'Nº do contrato de locação não informado' : 'Nº da nota fiscal de aquisição não informado');

  const valor = v.valor_aquisicao == null || v.valor_aquisicao === '' ? null : Number(v.valor_aquisicao);
  if (!v.alugado && (valor == null || !(valor > 0))) faltas.push('Valor de aquisição não informado (veículo próprio)');
  if (valor != null && (!Number.isFinite(valor) || valor < 0)) faltas.push('Valor de aquisição inválido');

  if (String(v.numero_empenho ?? '').trim()) {
    const empenho = numeroEmpenhoSiga(v.numero_empenho);
    if (!empenho) faltas.push('Nº do empenho inválido');
    else if (empenho.length > 10) faltas.push('Nº do empenho com mais de 10 dígitos');
  }

  const baixa = dataIso(v.data_baixa);
  if (v.data_baixa && !baixa) faltas.push('Data de baixa inválida');
  else if (baixa && aquisicao && baixa < aquisicao) faltas.push('Data de baixa anterior à data de aquisição');

  return faltas;
}

/** st_Antigo: "1" quando adquirido antes do início do uso do SIGA, senão "2". */
export function stAntigoVeiculo(dataAquisicao: string | Date | null | undefined, dataInicioSiga?: string | null): '1' | '2' {
  const aquisicao = dataIso(dataAquisicao);
  const inicio = dataIso(dataInicioSiga ?? null);
  return aquisicao && inicio && aquisicao < inicio ? '1' : '2';
}

/** Linha de detalhe do arquivo de Frota (150 posições). Exige veículo sem pendências. */
export function linhaFrotaSiga(v: VeiculoSiga, ctx: ContextoFrotaSiga, sequencial: number): string {
  const pendencias = pendenciasVeiculoSiga(v);
  if (pendencias.length) throw new ErroCampoSiga(`Veículo ${v.placa ?? v.id}: ${pendencias.join('; ')}`);
  const linha =
    '1' +
    campoN(ctx.codigoUnidade, 4) +
    campoAN(registroBemFrota(v.placa), 15) +
    campoN(Number(v.siga_tipo_veiculo), 2) +
    campoN(Number(v.siga_marca_veiculo), 3) +
    campoN(codigoCombustivelFrota(v.tipo_combustivel), 2) +
    ' '.repeat(4) + // Reservado TCM
    campoN(String(v.renavam).replace(/[\s.\-]/g, ''), 20) +
    campoAN(String(v.chassi).toUpperCase(), 25) +
    campoN(Number(v.ano), 4) +
    (v.alugado ? 'S' : 'N') +
    campoAN(v.nota_fiscal_ou_contrato, 16) +
    campoV(v.valor_aquisicao ?? 0, 16) +
    stAntigoVeiculo(v.data_aquisicao, ctx.dataInicioSiga) +
    campoN(numeroEmpenhoSiga(v.numero_empenho), 10) +
    campoD(dataIso(v.data_aquisicao)) +
    campoD(dataIso(v.data_baixa)) +
    campoN(sequencial, 10);
  if (linha.length !== TAMANHO_LINHA_FROTA)
    throw new ErroCampoSiga(`Linha de frota com ${linha.length} posições (esperado ${TAMANHO_LINHA_FROTA})`);
  return linha;
}

// ─────────────────────────── arquivo de Combustível ───────────────────────────

/** Um abastecimento (legado) ou uma requisição abastecida, já normalizado. */
export interface ConsumoFonte {
  veiculo_id: string | null;
  placa: string | null;
  /** Data do abastecimento 'YYYY-MM-DD' (horário de Brasília). */
  data: string;
  litros: number | string;
  valor: number | string;
  combustivel: string | null;
}

export interface LinhaConsumoSiga {
  veiculo_id: string | null;
  placa: string;
  registro_bem: string;
  combustivel_codigo: number | null;
  combustivel: string;
  litros: number;
  custo: number;
  abastecimentos: number;
  data_aquisicao: string | null;
  /** Impedem a linha de entrar no arquivo. */
  pendencias: string[];
  /** Não impedem, mas merecem atenção (ex.: veículo ainda não cadastrado no SIGA). */
  avisos: string[];
}

export interface VeiculoConsumo {
  id: string;
  placa: string | null;
  data_aquisicao: string | Date | null;
  siga_enviado_em: Date | string | null;
}

/**
 * Soma os consumos da competência por (veículo, combustível). Litros com 3
 * casas e custo com 2. Consumos fora do mês são ignorados.
 */
export function agregarConsumoCombustivel(
  competencia: string,
  consumos: ConsumoFonte[],
  veiculos: VeiculoConsumo[],
): LinhaConsumoSiga[] {
  competenciaSiga(competencia);
  const porId = new Map(veiculos.map((v) => [v.id, v]));
  const porPlaca = new Map(veiculos.map((v) => [registroBemFrota(v.placa), v]));
  const grupos = new Map<string, LinhaConsumoSiga>();

  for (const c of consumos) {
    if (!c.data || String(c.data).slice(0, 7) !== competencia) continue;
    const veiculo = (c.veiculo_id && porId.get(c.veiculo_id)) || porPlaca.get(registroBemFrota(c.placa)) || null;
    const registro = registroBemFrota(veiculo?.placa ?? c.placa);
    const codigo = codigoCombustivelConsumo(c.combustivel);
    const chaveCombustivel = codigo ?? `?${String(c.combustivel ?? '').toUpperCase()}`;
    const chave = `${veiculo?.id ?? `placa:${registro}`}|${chaveCombustivel}`;

    let linha = grupos.get(chave);
    if (!linha) {
      const pendencias: string[] = [];
      const avisos: string[] = [];
      if (!veiculo) pendencias.push('Veículo não cadastrado na frota');
      if (!registro) pendencias.push('Placa não informada');
      if (codigo == null) {
        const nome = String(c.combustivel ?? '').trim() || 'não informado';
        pendencias.push(
          /flex/i.test(nome)
            ? 'Combustível registrado como Flex — o SIGA exige o combustível abastecido (gasolina ou álcool)'
            : `Combustível "${nome}" sem código no SIGA`,
        );
      }
      const aquisicao = veiculo ? dataIso(veiculo.data_aquisicao) : null;
      if (veiculo && !aquisicao) pendencias.push('Veículo sem data de aquisição (exigida pelo SIGA)');
      if (veiculo && !veiculo.siga_enviado_em)
        avisos.push('Veículo ainda não enviado no arquivo de Frota — importe o cadastro no SIGA antes do consumo');
      linha = {
        veiculo_id: veiculo?.id ?? null,
        placa: veiculo?.placa ?? c.placa ?? '',
        registro_bem: registro,
        combustivel_codigo: codigo,
        combustivel: codigo ? ROTULO_COMBUSTIVEL_CONSUMO[codigo] : String(c.combustivel ?? '').trim() || '—',
        litros: 0,
        custo: 0,
        abastecimentos: 0,
        data_aquisicao: aquisicao,
        pendencias,
        avisos,
      };
      grupos.set(chave, linha);
    }
    linha.litros += Number(c.litros) || 0;
    linha.custo += Number(c.valor) || 0;
    linha.abastecimentos += 1;
  }

  return [...grupos.values()]
    .map((l) => ({ ...l, litros: arred(l.litros, 3), custo: arred(l.custo, 2) }))
    .sort((a, b) => a.registro_bem.localeCompare(b.registro_bem) || (a.combustivel_codigo ?? 99) - (b.combustivel_codigo ?? 99));
}

/** Linha de detalhe do arquivo de Combustível (69 caracteres; ver nota no topo). */
export function linhaCombustivelSiga(
  l: LinhaConsumoSiga,
  codigoUnidade: string,
  competencia: string,
  sequencial: number,
): string {
  if (l.pendencias.length) throw new ErroCampoSiga(`Consumo ${l.placa}: ${l.pendencias.join('; ')}`);
  const linha =
    '1' +
    campoN(codigoUnidade, 4) +
    campoAN(l.registro_bem, 15) +
    campoN(l.combustivel_codigo, 2) +
    campoV(l.litros, 7, 3) +
    campoV(l.custo, 16) +
    campoN(competenciaSiga(competencia), 6) +
    campoD(l.data_aquisicao) +
    campoN(sequencial, 10);
  if (linha.length !== TAMANHO_LINHA_COMBUSTIVEL)
    throw new ErroCampoSiga(`Linha de combustível com ${linha.length} posições (esperado ${TAMANHO_LINHA_COMBUSTIVEL})`);
  return linha;
}

/** Data de hoje em Brasília como 'AAAAMMDD' (nome do arquivo). */
export function hojeBrasiliaCompacto(base = new Date()): string {
  const b = new Date(base.getTime() - 3 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${b.getUTCFullYear()}${p(b.getUTCMonth() + 1)}${p(b.getUTCDate())}`;
}

/** Data 'YYYY-MM-DD' de um instante, em Brasília (UTC-3). */
export function dataBrasilia(instante: Date | string | null | undefined): string | null {
  if (!instante) return null;
  const d = instante instanceof Date ? instante : new Date(instante);
  if (Number.isNaN(d.getTime())) return null;
  const b = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${b.getUTCFullYear()}-${p(b.getUTCMonth() + 1)}-${p(b.getUTCDate())}`;
}

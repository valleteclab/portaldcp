import {
  campoAN,
  campoD,
  campoN,
  campoV,
  ErroCampoSiga,
  numeroEmpenhoSiga,
  textoSiga,
} from '../siga/siga-arquivo.util';

/**
 * Arquivo "Patrimonio" do SIGA (TCM-BA), tabela 69 — 251 posições por linha.
 * O SIGA só aceita INCLUSÃO de bens por arquivo: reenviar um tombo já
 * cadastrado é rejeitado, e baixa/alteração de bem já enviado só se faz
 * digitando nas telas do SIGA.
 */

export const TAMANHO_LINHA_PATRIMONIO_SIGA = 251;

export const TIPOS_BEM_SIGA: Record<number, string> = {
  1: 'Móveis, utensílios e mobiliários',
  2: 'Máquinas, motores e geradores',
  3: 'Equipamentos, instrumentos, instrumentos musicais e ferramentas',
  4: 'Semoventes',
  5: 'Biblioteca',
  6: 'Imóveis',
  7: 'Diversos bens móveis e objetos de arte',
  8: 'Natureza industrial',
  9: 'Veículos',
};

export function tipoSigaValido(tipo: unknown): tipo is number {
  return Number.isInteger(tipo) && (tipo as number) >= 1 && (tipo as number) <= 9;
}

export type TipoPendenciaSiga =
  | 'SEM_TOMBO'
  | 'TOMBO_LONGO'
  | 'TOMBO_DUPLICADO'
  | 'SEM_DESCRICAO'
  | 'SEM_TIPO'
  | 'SEM_RESPONSAVEL'
  | 'CPF_INVALIDO'
  | 'SEM_DATA_AQUISICAO'
  | 'DATA_AQUISICAO_INVALIDA'
  | 'VALOR_INVALIDO'
  | 'EMPENHO_INVALIDO'
  | 'BAIXA_INVALIDA';

export const ROTULOS_PENDENCIA_SIGA: Record<TipoPendenciaSiga, string> = {
  SEM_TOMBO: 'Sem nº de tombo',
  TOMBO_LONGO: 'Tombo com mais de 15 caracteres',
  TOMBO_DUPLICADO: 'Tombo repetido',
  SEM_DESCRICAO: 'Sem descrição',
  SEM_TIPO: 'Sem tipo SIGA',
  SEM_RESPONSAVEL: 'Sem responsável',
  CPF_INVALIDO: 'CPF do responsável ausente ou inválido',
  SEM_DATA_AQUISICAO: 'Sem data de aquisição',
  DATA_AQUISICAO_INVALIDA: 'Data de aquisição inválida',
  VALOR_INVALIDO: 'Valor inválido',
  EMPENHO_INVALIDO: 'Nº de empenho inválido',
  BAIXA_INVALIDA: 'Data de baixa inválida',
};

export interface PendenciaSiga {
  tipo: TipoPendenciaSiga;
  mensagem: string;
}

/** Só o que o arquivo precisa do bem (facilita o teste sem entidade). */
export interface BemParaSiga {
  plaqueta?: string | null;
  descricao?: string | null;
  siga_tipo_bem?: number | null;
  categoria?: { siga_tipo_bem?: number | null } | null;
  referencia_contabil?: string | null;
  valor_aquisicao?: number | string | null;
  responsavel_nome?: string | null;
  responsavel_cpf?: string | null;
  data_aquisicao?: Date | string | null;
  data_baixa?: Date | string | null;
}

export interface ConfigPatrimonioSiga {
  codigo_unidade: string | null;
  codigo_orgao: string | null;
  codigo_unidade_orcamentaria: string | null;
  /** Início do uso do SIGA pelo órgão (YYYY-MM-DD): bem adquirido antes é "anterior ao SIGA". */
  data_inicio: string | null;
}

export function somenteDigitos(valor: unknown): string {
  return String(valor ?? '').replace(/\D/g, '');
}

/** CPF com dígitos verificadores válidos (aceita com ou sem máscara). */
export function cpfValido(cpf: unknown): boolean {
  const d = somenteDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (base: string) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(d.slice(0, 9)) === Number(d[9]) && dv(d.slice(0, 10)) === Number(d[10]);
}

/** Tipo SIGA efetivo: o do bem, senão o da categoria. */
export function tipoSigaEfetivo(bem: BemParaSiga): number | null {
  if (tipoSigaValido(bem.siga_tipo_bem)) return bem.siga_tipo_bem;
  const cat = bem.categoria?.siga_tipo_bem;
  return tipoSigaValido(cat) ? cat : null;
}

function isoData(valor: Date | string | null | undefined): string | null {
  if (!valor) return null;
  if (valor instanceof Date) {
    if (isNaN(valor.getTime())) return null;
    return `${valor.getFullYear()}-${String(valor.getMonth() + 1).padStart(2, '0')}-${String(valor.getDate()).padStart(2, '0')}`;
  }
  const s = String(valor).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * st_Antigo: "1" (anterior ao SIGA) quando o bem não tem nº de empenho ou foi
 * adquirido antes da data de início do SIGA no órgão; senão "2".
 */
export function antigoSiga(bem: BemParaSiga, dataInicio: string | null): '1' | '2' {
  if (!numeroEmpenhoSiga(bem.referencia_contabil)) return '1';
  const aquisicao = isoData(bem.data_aquisicao);
  const inicio = dataInicio ? String(dataInicio).slice(0, 10) : null;
  if (inicio && aquisicao && aquisicao < inicio) return '1';
  return '2';
}

function fmt(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Pendências do bem para o arquivo (vazio = pronto). Não verifica tombo repetido (ver `tombosRepetidos`). */
export function pendenciasBemSiga(bem: BemParaSiga, hoje = new Date()): PendenciaSiga[] {
  const p: PendenciaSiga[] = [];
  const add = (tipo: TipoPendenciaSiga, mensagem: string) => p.push({ tipo, mensagem });

  const tombo = textoSiga(bem.plaqueta);
  if (!tombo) add('SEM_TOMBO', 'Informe o nº de tombo (plaqueta) do bem.');
  else if (tombo.length > 15) add('TOMBO_LONGO', `O tombo "${tombo}" tem mais de 15 caracteres (limite do SIGA).`);

  if (!textoSiga(bem.descricao)) add('SEM_DESCRICAO', 'Informe a descrição do bem.');

  if (!tipoSigaEfetivo(bem))
    add('SEM_TIPO', 'Defina o tipo do bem no SIGA (no bem ou na categoria).');

  if (!textoSiga(bem.responsavel_nome)) add('SEM_RESPONSAVEL', 'Informe o nome do responsável pelo bem.');
  if (!cpfValido(bem.responsavel_cpf))
    add('CPF_INVALIDO', bem.responsavel_cpf ? `CPF do responsável inválido: ${bem.responsavel_cpf}.` : 'Informe o CPF do responsável pelo bem.');

  const aquisicao = isoData(bem.data_aquisicao);
  const hojeIso = isoData(hoje)!;
  if (!bem.data_aquisicao) add('SEM_DATA_AQUISICAO', 'Informe a data de aquisição.');
  else if (!aquisicao) add('DATA_AQUISICAO_INVALIDA', 'Data de aquisição inválida.');
  else if (aquisicao < '2000-01-01')
    add('DATA_AQUISICAO_INVALIDA', `Aquisição em ${fmt(aquisicao)}: o SIGA não aceita datas anteriores a 2000.`);
  else if (aquisicao > hojeIso) add('DATA_AQUISICAO_INVALIDA', `Aquisição em ${fmt(aquisicao)} está no futuro.`);

  if (bem.valor_aquisicao !== null && bem.valor_aquisicao !== undefined && bem.valor_aquisicao !== '') {
    const v = Number(bem.valor_aquisicao);
    if (!Number.isFinite(v) || v < 0) add('VALOR_INVALIDO', `Valor de aquisição inválido: ${bem.valor_aquisicao}.`);
    else if (Math.round(v * 100) >= 10 ** 16) add('VALOR_INVALIDO', 'Valor de aquisição excede o tamanho do campo do SIGA.');
  }

  if (numeroEmpenhoSiga(bem.referencia_contabil).length > 10)
    add('EMPENHO_INVALIDO', `Nº de empenho "${bem.referencia_contabil}" tem mais de 10 dígitos.`);

  if (bem.data_baixa) {
    const baixa = isoData(bem.data_baixa);
    if (!baixa || baixa < '2000-01-01') add('BAIXA_INVALIDA', 'Data de baixa inválida.');
    else if (aquisicao && baixa < aquisicao) add('BAIXA_INVALIDA', `Baixa em ${fmt(baixa)} é anterior à aquisição.`);
  }
  return p;
}

/** Tombos (normalizados) que aparecem mais de uma vez na lista. */
export function tombosRepetidos(bens: BemParaSiga[]): Set<string> {
  const vistos = new Set<string>();
  const repetidos = new Set<string>();
  for (const b of bens) {
    const t = textoSiga(b.plaqueta).toUpperCase();
    if (!t) continue;
    if (vistos.has(t)) repetidos.add(t);
    vistos.add(t);
  }
  return repetidos;
}

export function chaveTombo(plaqueta: unknown): string {
  return textoSiga(plaqueta).toUpperCase();
}

/**
 * Monta a linha de detalhe (251 posições) — lança ErroCampoSiga se o bem
 * tiver pendência. Posições do leiaute (0-based, inclusivas):
 * 0 tp_Registro · 1–4 cd_Unidade · 5–8 dt_AnoCriacao · 9–23 nu_TomboRegistroBem ·
 * 24–25 tp_BemPatrimonial · 26–125 de_DescricaoBem · 126–135 nu_Empenho ·
 * 136 st_Antigo · 137–152 vl_ValorBem · 153–202 nm_Responsavel ·
 * 203–216 cd_CicParticipante · 217–224 dt_Aquisicao · 225–232 dt_Baixa ·
 * 233–236 cd_Órgão · 237–240 cd_UnidadeOrcamentaria · 241–250 nu_SequencialRegistro.
 */
export function linhaPatrimonioSiga(bem: BemParaSiga, config: ConfigPatrimonioSiga, sequencial: number): string {
  const pend = pendenciasBemSiga(bem);
  if (pend.length) throw new ErroCampoSiga(pend.map((x) => x.mensagem).join(' '));
  const aquisicao = isoData(bem.data_aquisicao)!;
  const linha =
    '1' +
    campoN(config.codigo_unidade, 4) +
    campoN(aquisicao.slice(0, 4), 4) +
    campoAN(bem.plaqueta, 15) +
    campoN(tipoSigaEfetivo(bem), 2) +
    campoAN(bem.descricao, 100) +
    campoN(numeroEmpenhoSiga(bem.referencia_contabil), 10) +
    antigoSiga(bem, config.data_inicio) +
    campoV(bem.valor_aquisicao, 16) +
    campoAN(bem.responsavel_nome, 50) +
    campoAN(somenteDigitos(bem.responsavel_cpf), 14) +
    campoD(aquisicao) +
    campoD(isoData(bem.data_baixa)) +
    campoN(config.codigo_orgao, 4) +
    campoN(config.codigo_unidade_orcamentaria, 4) +
    campoN(sequencial, 10);
  if (linha.length !== TAMANHO_LINHA_PATRIMONIO_SIGA)
    throw new ErroCampoSiga(`Linha do bem ${bem.plaqueta} com ${linha.length} posições (esperado 251).`);
  return linha;
}

/** Linha pronta ou lista de pendências do bem. */
export function avaliarBemSiga(
  bem: BemParaSiga,
  config: ConfigPatrimonioSiga,
  sequencial = 2,
): { linha: string; pendencias: [] } | { linha: null; pendencias: PendenciaSiga[] } {
  const pendencias = pendenciasBemSiga(bem);
  if (pendencias.length) return { linha: null, pendencias };
  try {
    return { linha: linhaPatrimonioSiga(bem, config, sequencial), pendencias: [] };
  } catch (e: any) {
    return { linha: null, pendencias: [{ tipo: 'VALOR_INVALIDO', mensagem: e?.message || 'Campo inválido.' }] };
  }
}

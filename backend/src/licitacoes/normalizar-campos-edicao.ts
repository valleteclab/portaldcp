/**
 * EDIÇÃO DO PROCESSO (PUT /licitacoes/:id) — normalização dos campos tipados.
 *
 * O corpo da edição é `Partial<CreateLicitacaoDto>` (tipo sem classe em tempo
 * de execução: o ValidationPipe não confere nada). A tela "Editar processo"
 * manda o formulário inteiro, com as datas do cronograma vazias ('') na fase
 * interna — e o TypeORM convertia '' em `Invalid Date`, que chegava ao banco
 * como "0NaN-NaN-NaN…" (QueryFailedError → 500; homologação de 26/09/2026, E1).
 *
 * Regra (uma só para todas as colunas tipadas da entidade, lidas dos
 * metadados do TypeORM — nenhum campo novo precisa ser lembrado aqui):
 *  - vazio ('' ou só espaços) → NULL (coluna que aceita nulo) ou o campo é
 *    ignorado (coluna obrigatória — mantém o valor gravado);
 *  - data, número, inteiro, UUID ou booleano inválido → 400 com a lista dos
 *    campos e uma mensagem em português. Nunca 500.
 */

export type TipoCampo = 'DATA' | 'NUMERO' | 'INTEIRO' | 'UUID' | 'BOOLEANO';

export interface ColunaTipada {
  propriedade: string;
  tipo: TipoCampo;
  nullable: boolean;
}

export interface CampoInvalido {
  campo: string;
  rotulo: string;
  valor: string;
  mensagem: string;
}

/** Nomes dos campos na tela (o que o usuário reconhece). */
const ROTULOS: Record<string, string> = {
  data_publicacao_edital: 'Data de publicação',
  data_limite_impugnacao: 'Data-limite para impugnação',
  data_inicio_acolhimento: 'Início do recebimento das propostas',
  data_fim_acolhimento: 'Fim do recebimento das propostas',
  data_abertura_sessao: 'Abertura da sessão',
  valor_total_estimado: 'Valor total estimado',
  intervalo_minimo_lances: 'Intervalo mínimo entre lances',
  tempo_prorrogacao: 'Tempo de prorrogação',
  diferenca_minima_lances: 'Diferença mínima entre lances',
  percentual_cota_reservada: 'Percentual da cota reservada',
  pregoeiro_id: 'Agente de contratação/pregoeiro',
  item_pca_id: 'Item do PCA',
};

export const rotuloDoCampo = (campo: string) => ROTULOS[campo] ?? campo.replace(/_/g, ' ');

/** Tipo "de negócio" de uma coluna do TypeORM (`column.type`: string ou construtor). */
export function tipoDaColuna(type: unknown): TipoCampo | null {
  if (type === Date) return 'DATA';
  if (type === Number) return 'NUMERO';
  if (type === Boolean) return 'BOOLEANO';
  if (typeof type === 'function') return null;
  const t = String(type ?? '').toLowerCase().trim();
  if (!t) return null;
  if (/^(timestamp|timestamptz|date|datetime|time)\b/.test(t) || t.startsWith('timestamp')) return 'DATA';
  if (/^(int|integer|smallint|bigint|int2|int4|int8)$/.test(t)) return 'INTEIRO';
  if (/^(decimal|numeric|float|float4|float8|double|double precision|real|money)$/.test(t)) return 'NUMERO';
  if (t === 'uuid') return 'UUID';
  if (t === 'boolean' || t === 'bool') return 'BOOLEANO';
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Dia civil válido (rejeita 31/02, mês 13…) — o `Date` do JS "rola" o excedente. */
function diaCivilValido(ano: number, mes: number, dia: number): boolean {
  if (ano < 1900 || ano > 9999 || mes < 1 || mes > 12 || dia < 1) return false;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return dia <= ultimo;
}

/** Data aceita: AAAA-MM-DD, AAAA-MM-DDTHH:mm[:ss[.sss]][Z|±HH:mm] ou um `Date` válido. */
export function dataValida(v: unknown): boolean {
  if (v instanceof Date) return !Number.isNaN(v.getTime());
  if (typeof v !== 'string') return false;
  const s = v.trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/);
  if (!m) return false;
  if (!diaCivilValido(Number(m[1]), Number(m[2]), Number(m[3]))) return false;
  if (m[4] !== undefined && (Number(m[4]) > 23 || Number(m[5]) > 59 || (m[6] !== undefined && Number(m[6]) > 59))) return false;
  return !Number.isNaN(new Date(s).getTime());
}

const vazio = (v: unknown) => typeof v === 'string' && v.trim() === '';

/**
 * Normaliza `dados` NO LUGAR (as chaves ausentes não são tocadas) e devolve os
 * campos inválidos (lista vazia = tudo certo).
 */
export function normalizarCamposTipados(dados: Record<string, any>, colunas: ColunaTipada[]): CampoInvalido[] {
  const invalidos: CampoInvalido[] = [];
  const invalido = (c: ColunaTipada, valor: unknown, mensagem: string) =>
    invalidos.push({ campo: c.propriedade, rotulo: rotuloDoCampo(c.propriedade), valor: String(valor).slice(0, 60), mensagem });

  for (const c of colunas) {
    if (!Object.prototype.hasOwnProperty.call(dados, c.propriedade)) continue;
    const v = dados[c.propriedade];
    if (v === undefined) continue;
    // objeto de relação (ex.: `item_pca` que a tela devolve junto) — não é valor da coluna
    if (v !== null && typeof v === 'object' && !(v instanceof Date)) continue;
    if (v === null || vazio(v)) {
      if (c.nullable) dados[c.propriedade] = null;
      else delete dados[c.propriedade];
      continue;
    }
    switch (c.tipo) {
      case 'DATA':
        if (!dataValida(v)) invalido(c, v, 'data inválida — use o formato AAAA-MM-DD ou AAAA-MM-DDTHH:mm');
        else if (typeof v === 'string') dados[c.propriedade] = v.trim();
        break;
      case 'NUMERO':
      case 'INTEIRO': {
        let n: number;
        if (typeof v === 'number') n = v;
        else if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) n = Number(v.trim());
        else n = Number.NaN;
        if (!Number.isFinite(n)) invalido(c, v, 'número inválido');
        else if (c.tipo === 'INTEIRO' && !Number.isInteger(n)) invalido(c, v, 'deve ser um número inteiro');
        else dados[c.propriedade] = n;
        break;
      }
      case 'UUID':
        if (typeof v !== 'string' || !UUID.test(v.trim())) invalido(c, v, 'identificador inválido');
        else dados[c.propriedade] = v.trim();
        break;
      case 'BOOLEANO':
        if (v === true || v === false) break;
        if (v === 'true' || v === 'false') dados[c.propriedade] = v === 'true';
        else invalido(c, v, 'deve ser sim ou não (true/false)');
        break;
    }
  }
  return invalidos;
}

/** Mensagem única do 400 ("Data inválida em Abertura da sessão: \"xx\" — …"). */
export function mensagemCamposInvalidos(invalidos: CampoInvalido[]): string {
  return `Dados inválidos no processo: ${invalidos.map((i) => `${i.rotulo} ("${i.valor}") — ${i.mensagem}`).join('; ')}.`;
}

/** Colunas tipadas da entidade a partir dos metadados do TypeORM. */
export function colunasTipadasDosMetadados(colunas: Array<{ propertyName: string; type: unknown; isNullable: boolean; relationMetadata?: unknown }>): ColunaTipada[] {
  const r: ColunaTipada[] = [];
  for (const c of colunas ?? []) {
    // coluna só de relação (sem @Column próprio): o valor é o objeto relacionado
    if (c.relationMetadata && !String(c.propertyName).endsWith('_id')) continue;
    const tipo = tipoDaColuna(c.type);
    if (!tipo) continue;
    r.push({ propriedade: c.propertyName, tipo, nullable: !!c.isNullable });
  }
  return r;
}

/**
 * TEXTOS DAS PEÇAS (homologação de 26/09/2026) — funções puras de formatação
 * usadas pelos modelos de documento e pelos PDFs da fase interna:
 *
 *  - rótulo legível de códigos internos (nunca "DISPENSA_ELETRONICA",
 *    "MENOR_PRECO" no texto de uma peça);
 *  - dado do cadastro do órgão que é marcador de "não preenchido" ('A definir',
 *    CEP 00000-000…) tratado como ausente — nunca "A definir, 26 de setembro";
 *  - quantidade no padrão brasileiro, sem zeros inúteis ("12 meses", nunca
 *    "12.0000 MES");
 *  - `{{variavel}}` que sobrar (modelo do órgão com variável desconhecida)
 *    sai como "—", nunca cru no PDF.
 */

/** Marcadores gravados no cadastro quando o dado não foi informado. */
const MARCADORES_VAZIOS = new Set(['a definir', 'a informar', 'não informado', 'nao informado', '000.000.000-00', '00000-000', '00.000.000/0000-00', 'xx']);

/** Valor do cadastro ou '' quando vazio/marcador de "não preenchido". */
export function valorCadastral(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s || MARCADORES_VAZIOS.has(s.toLowerCase())) return '';
  return s;
}

/** "Luís Eduardo Magalhães/BA" (município do cadastro do órgão) ou '' se não houver. */
export function localDoOrgao(orgao: { cidade?: string | null; uf?: string | null } | null | undefined): string {
  const cidade = valorCadastral(orgao?.cidade);
  if (!cidade) return '';
  const uf = valorCadastral(orgao?.uf).toUpperCase();
  return /^[A-Z]{2}$/.test(uf) ? `${cidade}/${uf}` : cidade;
}

/** "Cidade/UF, 26 de setembro de 2026" — sem cidade no cadastro, só a data. */
export function localEData(local: string, dataPorExtenso: string): string {
  return local ? `${local}, ${dataPorExtenso}` : dataPorExtenso;
}

/** Data por extenso no fuso de Brasília ("26 de setembro de 2026"). */
export function dataPorExtensoBrasilia(d: Date = new Date()): string {
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'long', year: 'numeric' });
}

const MODALIDADES: Record<string, string> = {
  PREGAO_ELETRONICO: 'Pregão eletrônico',
  PREGAO_PRESENCIAL: 'Pregão presencial',
  CONCORRENCIA: 'Concorrência',
  CONCORRENCIA_ELETRONICA: 'Concorrência eletrônica',
  CONCORRENCIA_PRESENCIAL: 'Concorrência presencial',
  CONCURSO: 'Concurso',
  LEILAO: 'Leilão',
  DIALOGO_COMPETITIVO: 'Diálogo competitivo',
  DISPENSA_ELETRONICA: 'Dispensa eletrônica',
  DISPENSA: 'Dispensa',
  INEXIGIBILIDADE: 'Inexigibilidade',
  CREDENCIAMENTO: 'Credenciamento',
};

const CRITERIOS: Record<string, string> = {
  MENOR_PRECO: 'menor preço',
  MAIOR_DESCONTO: 'maior desconto',
  MELHOR_TECNICA: 'melhor técnica ou conteúdo artístico',
  TECNICA_E_PRECO: 'técnica e preço',
  MAIOR_LANCE: 'maior lance',
  MAIOR_RETORNO_ECONOMICO: 'maior retorno econômico',
};

const MODOS_DISPUTA: Record<string, string> = {
  ABERTO: 'aberto',
  ABERTO_FECHADO: 'aberto e fechado',
  FECHADO_ABERTO: 'fechado e aberto',
  FECHADO: 'fechado',
};

const humanizar = (codigo: string) => codigo.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** "Dispensa eletrônica" (nunca o código interno). */
export function rotuloModalidade(m: string | null | undefined): string {
  const c = String(m ?? '').trim();
  if (!c) return '—';
  return MODALIDADES[c] ?? humanizar(c);
}

/** "menor preço". */
export function rotuloCriterio(c: string | null | undefined): string {
  const k = String(c ?? '').trim();
  if (!k) return '—';
  return CRITERIOS[k] ?? humanizar(k).toLowerCase();
}

/** "aberto e fechado". */
export function rotuloModoDisputa(m: string | null | undefined): string {
  const k = String(m ?? '').trim();
  if (!k) return '—';
  return MODOS_DISPUTA[k] ?? humanizar(k).toLowerCase();
}

/** Quantidade no padrão brasileiro, sem zeros à direita: "12", "1,5", "1.200". */
export function formatarQuantidade(q: unknown): string {
  const n = Number(q);
  if (!Number.isFinite(n)) return String(q ?? '—');
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

/** Unidade da tabela de unidades do item: [singular, plural]. */
const UNIDADES: Record<string, [string, string]> = {
  UNIDADE: ['unidade', 'unidades'],
  PECA: ['peça', 'peças'],
  CAIXA: ['caixa', 'caixas'],
  PACOTE: ['pacote', 'pacotes'],
  METRO: ['metro', 'metros'],
  METRO_QUADRADO: ['m²', 'm²'],
  METRO_CUBICO: ['m³', 'm³'],
  LITRO: ['litro', 'litros'],
  QUILOGRAMA: ['kg', 'kg'],
  TONELADA: ['tonelada', 'toneladas'],
  HORA: ['hora', 'horas'],
  DIARIA: ['diária', 'diárias'],
  MES: ['mês', 'meses'],
  ANO: ['ano', 'anos'],
  SERVICO: ['serviço', 'serviços'],
  GLOBAL: ['global', 'global'],
};

/** "meses" para (MES, 12); unidade desconhecida sai como veio. */
export function rotuloUnidade(u: unknown, quantidade?: unknown): string {
  const k = String(u ?? '').trim().toUpperCase();
  const par = UNIDADES[k];
  if (!par) return String(u ?? '').trim();
  const n = Number(quantidade);
  return Number.isFinite(n) && Math.abs(n) > 1 ? par[1] : par[0];
}

/** "12 meses", "1 serviço", "2,5 kg". */
export function quantidadeComUnidade(q: unknown, u: unknown): string {
  const unidade = rotuloUnidade(u, q);
  return unidade ? `${formatarQuantidade(q)} ${unidade}` : formatarQuantidade(q);
}

/** Valor em reais ("R$ 22.600,00"). */
export const BRL = (n: unknown) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Marcador de variável de modelo ({{orgao.nome}}). */
export const PADRAO_VARIAVEL = /\{\{\s*([\w.]+)\s*\}\}/g;

/** Troca as variáveis conhecidas; a desconhecida (ou sem valor) sai como `semValor`. */
export function substituirVariaveis(texto: string, contexto: Record<string, string>, semValor = '—'): string {
  return String(texto ?? '').replace(PADRAO_VARIAVEL, (_m, chave: string) => {
    const v = contexto[chave];
    return v === undefined || v === null || String(v).trim() === '' ? semValor : String(v);
  });
}

/** Variáveis citadas num texto de modelo. */
export function variaveisDoTexto(texto: string): string[] {
  return [...String(texto ?? '').matchAll(PADRAO_VARIAVEL)].map((m) => m[1]);
}

/** Rede de segurança do PDF: nenhum `{{…}}` cru sai numa peça. */
export function semVariaveisCruas(texto: string, semValor = '—'): string {
  return String(texto ?? '').replace(/\{\{[^{}]*\}\}/g, semValor);
}

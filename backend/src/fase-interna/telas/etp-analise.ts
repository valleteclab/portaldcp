/**
 * ASSISTENTE DO ETP — análises PURAS (Entrega 3A; SPEC §6; mockup ETP.dc.html).
 *
 *  - incisos do art. 18, §1º e os obrigatórios do §2º (I, IV, VI, VIII e XIII);
 *  - detecção de INDICAÇÃO DE MARCA (art. 41, I): a marca só pode ser citada
 *    "apenas como referência", com "ou similar/equivalente" e justificativa.
 *    Regra (plano, correção 5 da SPEC):
 *      · marca citada SEM a forma de referência e sem justificativa → BLOQUEIO;
 *      · marca citada COM "similar/equivalente/superior" → ATENÇÃO, e a
 *        justificativa passa a ser obrigatória;
 *      · com a justificativa do art. 41, I registrada → JUSTIFICADO (informativo);
 *  - coerência entre seções: cada requisito citado na necessidade aparece na
 *    solução e no TR;
 *  - a IA é complementar: estas funções rodam sempre, sem IA.
 */

export interface IncisoEtp {
  inciso: string;
  secao_id: string;
  titulo: string;
  obrigatorio: boolean;
}

/** Seções do modelo padrão do ETP (modelos-padrao.ts) ↔ incisos do art. 18, §1º. */
export const INCISOS_ETP: IncisoEtp[] = [
  { inciso: 'I', secao_id: 'necessidade', titulo: 'Descrição da necessidade', obrigatorio: true },
  { inciso: 'II', secao_id: 'previsao_pca', titulo: 'Previsão no PCA', obrigatorio: false },
  { inciso: 'III', secao_id: 'requisitos', titulo: 'Requisitos da contratação', obrigatorio: false },
  { inciso: 'IV', secao_id: 'estimativa', titulo: 'Estimativa das quantidades', obrigatorio: true },
  { inciso: 'V', secao_id: 'levantamento', titulo: 'Levantamento de mercado', obrigatorio: false },
  { inciso: 'VI', secao_id: 'estimativa_valor', titulo: 'Estimativa do valor', obrigatorio: true },
  { inciso: 'VII', secao_id: 'solucao', titulo: 'Descrição da solução', obrigatorio: false },
  { inciso: 'VIII', secao_id: 'parcelamento', titulo: 'Justificativa do parcelamento', obrigatorio: true },
  { inciso: 'IX', secao_id: 'beneficios', titulo: 'Resultados pretendidos', obrigatorio: false },
  { inciso: 'X', secao_id: 'providencias', titulo: 'Providências prévias', obrigatorio: false },
  { inciso: 'XI', secao_id: 'correlatas', titulo: 'Contratações correlatas', obrigatorio: false },
  { inciso: 'XII', secao_id: 'sustentabilidade', titulo: 'Impactos ambientais', obrigatorio: false },
  { inciso: 'XIII', secao_id: 'viabilidade', titulo: 'Declaração de viabilidade', obrigatorio: true },
];

/** Texto puro de um trecho HTML. */
export function textoPuro(html: unknown): string {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/** Seção preenchida = mais de 10 caracteres de texto (mesma regra do editor). */
export function secaoPreenchida(html: unknown): boolean {
  return textoPuro(html).length > 10;
}

export interface SituacaoInciso extends IncisoEtp {
  preenchido: boolean;
}

export function situacaoDosIncisos(secoes: Record<string, unknown> | null | undefined): SituacaoInciso[] {
  const s = secoes || {};
  return INCISOS_ETP.map((i) => ({ ...i, preenchido: secaoPreenchida(s[i.secao_id]) }));
}

/** Incisos OBRIGATÓRIOS (§2º: I, IV, VI, VIII e XIII) ainda vazios. */
export function incisosObrigatoriosVazios(secoes: Record<string, unknown> | null | undefined): SituacaoInciso[] {
  return situacaoDosIncisos(secoes).filter((i) => i.obrigatorio && !i.preenchido);
}

// ---------------------------------------------------------------------------
// Indicação de marca (art. 41, I)
// ---------------------------------------------------------------------------

export type SeveridadeMarca = 'BLOQUEIO' | 'ATENCAO' | 'JUSTIFICADO';

export interface AchadoMarca {
  secao_id: string;
  /** Frase em que a marca aparece. */
  trecho: string;
  marca: string;
  /** Citada na forma de referência ("ou similar", "ou equivalente", "de referência")? */
  como_referencia: boolean;
  severidade: SeveridadeMarca;
  mensagem: string;
}

/** Siglas e palavras que não são marca (vocabulário de contratação pública). */
const NAO_MARCA = new Set(
  [
    'ETP', 'TR', 'DFD', 'PCA', 'CNPJ', 'CPF', 'LEI', 'ART', 'PNCP', 'CATMAT', 'CATSER', 'ME', 'EPP', 'TIC', 'PJ', 'PF', 'LDO', 'LOA', 'PPA',
    'LRF', 'IN', 'SEGES', 'ABNT', 'NBR', 'ISO', 'INMETRO', 'ANVISA', 'SUS', 'TV', 'FM', 'AM', 'HD', 'SSD', 'USB', 'HDMI', 'NDI', 'IA', 'API',
    'PDF', 'CD', 'DVD', 'LED', 'LCD', 'GB', 'TB', 'MB', 'KG', 'UN', 'BR', 'BA', 'SP', 'RJ', 'MG', 'CI', 'OS', 'OF', 'EPI', 'EPC', 'CFTV',
    'IP', 'VOIP', 'WEB', 'SAAS', 'ERP', 'CRM', 'GPS', 'RFID', 'QR', 'SMS', 'NFE', 'NF', 'ICMS', 'ISS', 'INSS', 'FGTS', 'CLT', 'MEI',
    'Câmara', 'Camara', 'Municipal', 'Prefeitura', 'Secretaria', 'Administração', 'Lei', 'Decreto', 'Portaria', 'Estado', 'União',
    'Rádio', 'Radio', 'Televisão', 'Poder', 'Executivo', 'Legislativo', 'Federal', 'Brasil', 'Nacional', 'Plano', 'Anual', 'Contratações',
    'Termo', 'Referência', 'Estudo', 'Técnico', 'Preliminar', 'Documento', 'Formalização', 'Demanda', 'Contratante', 'Contratada',
    'A', 'O', 'Os', 'As', 'Um', 'Uma', 'De', 'Do', 'Da', 'Ao', 'À', 'No', 'Na', 'Em', 'Para', 'Com', 'Por', 'Se', 'Que', 'Ou', 'E',
  ].map((s) => s.toLowerCase()),
);

/** Forma de referência admitida pelo art. 41, I, "d". */
const RE_REFERENCIA = /\b(ou\s+(similar|equivalente|superior|de\s+melhor\s+qualidade)|similar\s+ou\s+superior|equivalente\s+ou\s+superior|apenas\s+(como|a\s+t[ií]tulo\s+de)\s+refer[êe]ncia|a\s+t[ií]tulo\s+de\s+refer[êe]ncia|como\s+refer[êe]ncia|de\s+refer[êe]ncia)\b/i;

/** "(similar|equivalente|superior|compatível) ao/à [software|sistema…] NOME" */
const RE_COMPARACAO =
  /\b(?:similar|equivalente|superior|compat[ií]vel|id[êe]ntic[oa]|igual)\s+(?:ou\s+(?:superior|similar|equivalente)\s+)?(?:a|ao|à|aos|às|com\s+o|com\s+a)\s+(?:(?:software|sistema|solu[cç][aã]o|produto|equipamento|aparelho|plataforma|aplicativo|programa|modelo|marca|linha|padr[aã]o)\s+)?([A-ZÀ-Ý0-9][\wÀ-ÿ.\-]*(?:\s+[A-ZÀ-Ý0-9][\wÀ-ÿ.\-]*){0,2})(?:\s*\(([^)]{2,40})\))?/g;
/** "marca X", "fabricante X", "modelo X" */
const RE_MARCA_EXPLICITA = /\b(?:marca|fabricante|modelo|fabrica[cç][aã]o)\s*:?\s+([A-ZÀ-Ý0-9][\wÀ-ÿ.\-]*(?:\s+[A-ZÀ-Ý0-9][\wÀ-ÿ.\-]*){0,2})/g;

function limparNome(nome: string): string | null {
  const partes = nome
    .trim()
    .replace(/[.,;:]+$/, '')
    .split(/\s+/)
    .filter((p) => !NAO_MARCA.has(p.toLowerCase().replace(/[.,;:()]/g, '')));
  const n = partes.join(' ').trim();
  if (n.length < 2) return null;
  if (/^\d+$/.test(n)) return null;
  return n;
}

function frases(texto: string): string[] {
  return texto
    .split(/(?<=[.;!?])\s+|\n+/)
    .map((f) => f.trim())
    .filter(Boolean);
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Detecta indicação de marca nas seções (HTML ou texto). `marcas`: nomes de
 * marca conhecidos (cadastro do órgão), procurados por palavra inteira.
 * `justificativa`: justificativa formal do art. 41, I registrada no ETP.
 */
export function detectarIndicacaoMarca(
  secoes: Record<string, unknown> | null | undefined,
  opcoes: { marcas?: string[]; justificativa?: string | null } = {},
): AchadoMarca[] {
  const justificado = String(opcoes.justificativa ?? '').trim().length >= 20;
  const marcasConhecidas = (opcoes.marcas || []).map((m) => String(m || '').trim()).filter((m) => m.length >= 2);
  const achados: AchadoMarca[] = [];
  const vistos = new Set<string>();

  for (const [secaoId, valor] of Object.entries(secoes || {})) {
    if (secaoId.startsWith('_') || typeof valor !== 'string') continue;
    for (const frase of frases(textoPuro(valor))) {
      const encontrados: string[] = [];
      for (const re of [RE_COMPARACAO, RE_MARCA_EXPLICITA]) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(frase))) {
          const nome = limparNome(m[1] || '');
          if (nome) encontrados.push(nome);
          const extra = m[2] ? limparNome(m[2]) : null;
          if (extra) encontrados.push(extra);
        }
      }
      for (const marca of marcasConhecidas) {
        if (new RegExp(`(^|[^\\wÀ-ÿ])${escapar(marca)}([^\\wÀ-ÿ]|$)`, 'i').test(frase)) encontrados.push(marca);
      }
      if (!encontrados.length) continue;
      const comoReferencia = RE_REFERENCIA.test(frase);
      for (const marca of encontrados) {
        const chave = `${secaoId}|${marca.toLowerCase()}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        const severidade: SeveridadeMarca = justificado ? 'JUSTIFICADO' : comoReferencia ? 'ATENCAO' : 'BLOQUEIO';
        achados.push({
          secao_id: secaoId,
          trecho: frase.length > 280 ? `${frase.slice(0, 277)}…` : frase,
          marca,
          como_referencia: comoReferencia,
          severidade,
          mensagem:
            severidade === 'JUSTIFICADO'
              ? `Marca "${marca}" citada com justificativa do art. 41, I registrada.`
              : severidade === 'ATENCAO'
                ? `Marca "${marca}" citada como referência ("ou similar/equivalente"). O art. 41, I exige justificativa formal (padronização, compatibilidade, ser a única que atende ou referência).`
                : `Marca "${marca}" citada sem a forma "apenas como referência, ou similar/equivalente" e sem justificativa: restringe a competição (art. 41, I). Reescreva pela função ou justifique.`,
        });
      }
    }
  }
  return achados;
}

// ---------------------------------------------------------------------------
// Coerência entre seções
// ---------------------------------------------------------------------------

/** Siglas técnicas que não indicam requisito (vocabulário jurídico/administrativo). */
const SIGLAS_IGNORADAS = new Set(['ETP', 'TR', 'DFD', 'PCA', 'CNPJ', 'LEI', 'ART', 'PNCP', 'CATMAT', 'CATSER', 'ME', 'EPP', 'PJ', 'LDO', 'LOA', 'PPA', 'LRF', 'IN', 'SEGES', 'TV']);

/**
 * Termos relevantes de um texto: siglas técnicas (ex.: NDI) e expressões em
 * maiúsculas iniciais com 2+ palavras (ex.: Closed Caption).
 */
export function termosRelevantes(html: unknown): string[] {
  const texto = textoPuro(html);
  const termos = new Set<string>();
  for (const m of texto.matchAll(/\b([A-Z]{2,}[0-9]*)\b/g)) {
    if (!SIGLAS_IGNORADAS.has(m[1])) termos.add(m[1]);
  }
  for (const m of texto.matchAll(/\b([A-Z][a-zà-ÿ]+(?:\s+[A-Z][a-zà-ÿ]+)+)\b/g)) {
    const t = m[1];
    if (!t.split(/\s+/).every((p) => NAO_MARCA.has(p.toLowerCase()))) termos.add(t);
  }
  return [...termos];
}

export interface IncoerenciaSecoes {
  termo: string;
  ausente_em: string[];
  mensagem: string;
}

/**
 * Cada requisito citado na necessidade (DFD/ETP I) precisa aparecer na
 * solução (ETP VII) e no TR, quando o TR já existe.
 */
export function coerenciaEntreSecoes(entrada: { necessidade: unknown; solucao: unknown; tr?: unknown }): IncoerenciaSecoes[] {
  const termos = termosRelevantes(entrada.necessidade);
  const solucao = textoPuro(entrada.solucao).toLowerCase();
  const tr = entrada.tr === undefined || entrada.tr === null ? null : textoPuro(entrada.tr).toLowerCase();
  const r: IncoerenciaSecoes[] = [];
  for (const termo of termos) {
    const t = termo.toLowerCase();
    const ausente: string[] = [];
    if (!solucao.includes(t)) ausente.push('solução (inciso VII)');
    if (tr !== null && tr.length > 0 && !tr.includes(t)) ausente.push('termo de referência');
    if (ausente.length) {
      r.push({ termo, ausente_em: ausente, mensagem: `A necessidade cita "${termo}", que não aparece em: ${ausente.join(' e ')}.` });
    }
  }
  return r;
}

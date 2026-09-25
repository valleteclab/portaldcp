/**
 * ============================================================================
 * CALENDÁRIO DE FERIADOS — núcleo PURO (plano E7a item 1)
 * ============================================================================
 *
 * Lei 14.133/2021, art. 183, III: nos prazos em dias úteis "serão computados
 * somente os dias em que ocorrer expediente administrativo no órgão ou
 * entidade competente". Logo, o dia útil depende do ÓRGÃO:
 *   - feriados NACIONAIS (Lei 662/1949, Lei 6.802/1980, Lei 14.759/2023 e a
 *     Paixão de Cristo, feriado nacional na portaria anual do governo federal);
 *   - feriados ESTADUAIS da UF do órgão (cadastrados pelo administrador da
 *     plataforma);
 *   - feriados MUNICIPAIS e pontos facultativos cadastrados pelo próprio órgão;
 *   - PONTO FACULTATIVO (Carnaval, Corpus Christi, Dia do Servidor...) só conta
 *     como dia sem expediente quando o ÓRGÃO o adota (decisão E7a: o ponto
 *     facultativo federal não obriga o município; quem decide é o órgão).
 *
 * Aqui não há banco nem Nest: o `FeriadosService` carrega as regras do banco
 * (tabela `feriados`, pequena) e registra a fonte com `definirFonteDeFeriados`;
 * `calendarioDoOrgao(orgaoId)` devolve, SÍNCRONO, o calendário daquele órgão.
 * Sem fonte registrada (testes unitários, scripts), vale o calendário nacional
 * do código (`FERIADOS_NACIONAIS_PADRAO`).
 *
 * Datas: os dias são tratados como "meia-noite UTC do relógio de parede de
 * Brasília" (mesma convenção de `dias-uteis.ts`).
 */

/** Feriados/pontos facultativos móveis, calculados a partir da Páscoa. */
export enum FeriadoMovel {
  CARNAVAL_SEGUNDA = 'CARNAVAL_SEGUNDA', // Páscoa − 48
  CARNAVAL_TERCA = 'CARNAVAL_TERCA', // Páscoa − 47
  QUARTA_CINZAS = 'QUARTA_CINZAS', // Páscoa − 46
  SEXTA_SANTA = 'SEXTA_SANTA', // Páscoa − 2 (Paixão de Cristo)
  PASCOA = 'PASCOA', // domingo
  CORPUS_CHRISTI = 'CORPUS_CHRISTI', // Páscoa + 60
}

const DESLOCAMENTO_MOVEL: Record<FeriadoMovel, number> = {
  [FeriadoMovel.CARNAVAL_SEGUNDA]: -48,
  [FeriadoMovel.CARNAVAL_TERCA]: -47,
  [FeriadoMovel.QUARTA_CINZAS]: -46,
  [FeriadoMovel.SEXTA_SANTA]: -2,
  [FeriadoMovel.PASCOA]: 0,
  [FeriadoMovel.CORPUS_CHRISTI]: 60,
};

export const ROTULO_FERIADO_MOVEL: Record<FeriadoMovel, string> = {
  [FeriadoMovel.CARNAVAL_SEGUNDA]: 'Carnaval (segunda-feira)',
  [FeriadoMovel.CARNAVAL_TERCA]: 'Carnaval (terça-feira)',
  [FeriadoMovel.QUARTA_CINZAS]: 'Quarta-feira de Cinzas',
  [FeriadoMovel.SEXTA_SANTA]: 'Paixão de Cristo (Sexta-feira Santa)',
  [FeriadoMovel.PASCOA]: 'Páscoa',
  [FeriadoMovel.CORPUS_CHRISTI]: 'Corpus Christi',
};

const DIA = 86_400_000;

/**
 * Domingo de Páscoa (calendário gregoriano — algoritmo anônimo de
 * Meeus/Jones/Butcher). Devolve meia-noite UTC do dia.
 */
export function domingoDePascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31); // 3 = março, 4 = abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/** Data (meia-noite UTC) do feriado móvel no ano. */
export function dataDoFeriadoMovel(movel: FeriadoMovel, ano: number): Date {
  return new Date(domingoDePascoa(ano).getTime() + DESLOCAMENTO_MOVEL[movel] * DIA);
}

/** 'YYYY-MM-DD' de um dia (meia-noite UTC). */
export function isoDoDia(diaUtc: Date): string {
  return diaUtc.toISOString().slice(0, 10);
}

/**
 * Regra de feriado JÁ FILTRADA para o órgão (o que chega aqui conta como dia
 * sem expediente). `data` = 'YYYY-MM-DD'; com `recorrente`, só dia e mês
 * valem (repete todo ano). `movel` = calculado da Páscoa (ignora `data`).
 */
export interface RegraFeriado {
  descricao: string;
  data?: string | null;
  recorrente?: boolean;
  movel?: FeriadoMovel | string | null;
}

/** Calendário de dias sem expediente de um órgão. */
export interface CalendarioDiasUteis {
  /** Descrição do feriado no dia (meia-noite UTC do relógio de Brasília) ou null. */
  feriado(diaUtc: Date): string | null;
}

/** Monta o calendário (memoizado por ano) a partir das regras. */
export function criarCalendario(regras: RegraFeriado[]): CalendarioDiasUteis {
  const exatas = new Map<string, string>();
  const anuais = new Map<string, string>(); // 'MM-DD'
  const moveis: Array<{ movel: FeriadoMovel; descricao: string }> = [];
  for (const r of regras) {
    if (r.movel && (Object.values(FeriadoMovel) as string[]).includes(String(r.movel))) {
      moveis.push({ movel: r.movel as FeriadoMovel, descricao: r.descricao });
      continue;
    }
    const iso = String(r.data ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
    if (r.recorrente) {
      if (!anuais.has(iso.slice(5))) anuais.set(iso.slice(5), r.descricao);
    } else if (!exatas.has(iso)) {
      exatas.set(iso, r.descricao);
    }
  }
  const moveisPorAno = new Map<number, Map<string, string>>();
  const moveisDoAno = (ano: number): Map<string, string> => {
    let m = moveisPorAno.get(ano);
    if (!m) {
      m = new Map();
      for (const x of moveis) {
        const iso = isoDoDia(dataDoFeriadoMovel(x.movel, ano));
        if (!m.has(iso)) m.set(iso, x.descricao);
      }
      moveisPorAno.set(ano, m);
    }
    return m;
  };
  return {
    feriado(diaUtc: Date): string | null {
      const iso = isoDoDia(diaUtc);
      return (
        exatas.get(iso) ??
        anuais.get(iso.slice(5)) ??
        (moveis.length ? moveisDoAno(diaUtc.getUTCFullYear()).get(iso) : undefined) ??
        null
      );
    },
  };
}

/**
 * Feriados NACIONAIS e pontos facultativos federais — semente da tabela
 * `feriados` e calendário padrão (sem fonte registrada).
 *  - feriados (sempre sem expediente): Confraternização (1/1), Tiradentes
 *    (21/4), Dia do Trabalho (1/5), Independência (7/9), N. Sra. Aparecida
 *    (12/10), Finados (2/11), Proclamação da República (15/11), Dia Nacional de
 *    Zumbi e da Consciência Negra (20/11 — Lei 14.759/2023), Natal (25/12) e
 *    Paixão de Cristo (móvel);
 *  - pontos facultativos (só contam se o órgão adotar): Carnaval segunda e
 *    terça, Corpus Christi e Dia do Servidor Público (28/10).
 * A Quarta-feira de Cinzas é ponto facultativo só até as 14h — há expediente,
 * então não entra (o órgão pode cadastrar se fechar o dia inteiro).
 */
export interface FeriadoPadrao extends RegraFeriado {
  chave: string;
  ponto_facultativo: boolean;
  base_legal: string;
}

export const FERIADOS_NACIONAIS_PADRAO: FeriadoPadrao[] = [
  { chave: 'NAC-0101', descricao: 'Confraternização Universal', data: '2000-01-01', recorrente: true, ponto_facultativo: false, base_legal: 'Lei 662/1949' },
  { chave: 'NAC-0421', descricao: 'Tiradentes', data: '2000-04-21', recorrente: true, ponto_facultativo: false, base_legal: 'Lei 662/1949' },
  { chave: 'NAC-0501', descricao: 'Dia do Trabalho', data: '2000-05-01', recorrente: true, ponto_facultativo: false, base_legal: 'Lei 662/1949' },
  { chave: 'NAC-0907', descricao: 'Independência do Brasil', data: '2000-09-07', recorrente: true, ponto_facultativo: false, base_legal: 'Lei 662/1949' },
  { chave: 'NAC-1012', descricao: 'Nossa Senhora Aparecida', data: '2000-10-12', recorrente: true, ponto_facultativo: false, base_legal: 'Lei 6.802/1980' },
  { chave: 'NAC-1102', descricao: 'Finados', data: '2000-11-02', recorrente: true, ponto_facultativo: false, base_legal: 'Lei 662/1949' },
  { chave: 'NAC-1115', descricao: 'Proclamação da República', data: '2000-11-15', recorrente: true, ponto_facultativo: false, base_legal: 'Lei 662/1949' },
  { chave: 'NAC-1120', descricao: 'Dia Nacional de Zumbi e da Consciência Negra', data: '2000-11-20', recorrente: true, ponto_facultativo: false, base_legal: 'Lei 14.759/2023' },
  { chave: 'NAC-1225', descricao: 'Natal', data: '2000-12-25', recorrente: true, ponto_facultativo: false, base_legal: 'Lei 662/1949' },
  { chave: 'NAC-SEXTA-SANTA', descricao: ROTULO_FERIADO_MOVEL[FeriadoMovel.SEXTA_SANTA], movel: FeriadoMovel.SEXTA_SANTA, ponto_facultativo: false, base_legal: 'Lei 9.093/1995; portaria anual do Ministério da Gestão' },
  { chave: 'PF-CARNAVAL-SEG', descricao: ROTULO_FERIADO_MOVEL[FeriadoMovel.CARNAVAL_SEGUNDA], movel: FeriadoMovel.CARNAVAL_SEGUNDA, ponto_facultativo: true, base_legal: 'Ponto facultativo federal (portaria anual)' },
  { chave: 'PF-CARNAVAL-TER', descricao: ROTULO_FERIADO_MOVEL[FeriadoMovel.CARNAVAL_TERCA], movel: FeriadoMovel.CARNAVAL_TERCA, ponto_facultativo: true, base_legal: 'Ponto facultativo federal (portaria anual)' },
  { chave: 'PF-CORPUS-CHRISTI', descricao: ROTULO_FERIADO_MOVEL[FeriadoMovel.CORPUS_CHRISTI], movel: FeriadoMovel.CORPUS_CHRISTI, ponto_facultativo: true, base_legal: 'Ponto facultativo federal (portaria anual)' },
  { chave: 'PF-1028', descricao: 'Dia do Servidor Público', data: '2000-10-28', recorrente: true, ponto_facultativo: true, base_legal: 'Lei 8.112/1990, art. 236 (ponto facultativo)' },
];

/** Calendário nacional do código (sem pontos facultativos). */
export const CALENDARIO_NACIONAL: CalendarioDiasUteis = criarCalendario(
  FERIADOS_NACIONAIS_PADRAO.filter((f) => !f.ponto_facultativo),
);

// ---------------------------------------------------------------------------
// Fonte registrada (banco) + cache por órgão
// ---------------------------------------------------------------------------

export interface FonteDeFeriados {
  /** Regras que contam como dia sem expediente para o órgão (null = só nacionais). */
  regrasDoOrgao(orgaoId: string | null): RegraFeriado[];
}

let fonte: FonteDeFeriados | null = null;
const cache = new Map<string, CalendarioDiasUteis>();

/** O FeriadosService registra a fonte ao carregar o banco (e a cada alteração). */
export function definirFonteDeFeriados(f: FonteDeFeriados | null): void {
  fonte = f;
  cache.clear();
}

/** Descarta os calendários montados (depois de CRUD de feriados). */
export function invalidarCalendarios(): void {
  cache.clear();
}

/**
 * Calendário de dias sem expediente do ÓRGÃO (art. 183, III). Síncrono.
 * Sem órgão → só os feriados nacionais (da fonte, ou do código).
 */
export function calendarioDoOrgao(orgaoId?: string | null): CalendarioDiasUteis {
  if (!fonte) return CALENDARIO_NACIONAL;
  const chave = orgaoId || '*';
  let cal = cache.get(chave);
  if (!cal) {
    cal = criarCalendario(fonte.regrasDoOrgao(orgaoId || null));
    cache.set(chave, cal);
  }
  return cal;
}

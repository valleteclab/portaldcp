/**
 * CONFIGURAÇÃO DA FASE INTERNA POR ÓRGÃO (Entrega 2) — regras puras.
 *
 *  - modo SIMPLES (padrão — decisão 1 do dono): uma pessoa pode fazer tudo;
 *    toda tarefa vai para o responsável do processo (agente de contratação).
 *  - modo POR_SETOR: cada passo vai para o papel/setor configurado.
 *  - controle interno: etapa opcional, DESATIVADA por padrão (decisão 3).
 *  - prazos padrão em dias úteis por passo — modelo da Portaria 089/2024 da
 *    Câmara de LEM (Compras 30, Contabilidade 3, Presidência 3, agente 5,
 *    Jurídico 5, Controle interno 3, Publicação 5).
 * Sem linha na tabela, vale o padrão.
 */
import { DEFINICAO_PASSO, PapelFaseInterna, PassoFaseInterna } from './etapas-fase-interna';

export type ModoFaseInterna = 'SIMPLES' | 'POR_SETOR';

export interface ResponsavelDoPassoConfig {
  papel: PapelFaseInterna | null;
  setor_id: string | null;
}

export interface ConfigFaseInternaEfetiva {
  orgao_id: string;
  modo: ModoFaseInterna;
  controle_interno_ativo: boolean;
  responsaveis: Record<PassoFaseInterna, ResponsavelDoPassoConfig>;
  prazos: Record<PassoFaseInterna, number | null>;
  /** true = ainda não gravada (valores padrão). */
  padrao: boolean;
}

const PASSOS = Object.values(PassoFaseInterna) as PassoFaseInterna[];
const PAPEIS = Object.values(PapelFaseInterna) as string[];

export function papelValido(v: unknown): v is PapelFaseInterna {
  return typeof v === 'string' && PAPEIS.includes(v);
}

/** Responsáveis padrão do modo POR_SETOR (papel de cada passo, sem setor). */
export function responsaveisPadrao(): Record<PassoFaseInterna, ResponsavelDoPassoConfig> {
  return Object.fromEntries(PASSOS.map((p) => [p, { papel: DEFINICAO_PASSO[p].papel_padrao, setor_id: null }])) as Record<
    PassoFaseInterna,
    ResponsavelDoPassoConfig
  >;
}

/** Prazos do modelo "Portaria 089/2024 — Câmara de LEM". */
export function prazosPortaria089(): Record<PassoFaseInterna, number | null> {
  return Object.fromEntries(PASSOS.map((p) => [p, DEFINICAO_PASSO[p].prazo_padrao])) as Record<PassoFaseInterna, number | null>;
}

/** Linha gravada (ou nada) → configuração efetiva, com o padrão no que faltar. */
export function configEfetiva(
  orgaoId: string,
  linha?: {
    modo?: string | null;
    controle_interno_ativo?: boolean | null;
    responsaveis?: Record<string, any> | null;
    prazos?: Record<string, any> | null;
  } | null,
): ConfigFaseInternaEfetiva {
  const responsaveis = responsaveisPadrao();
  const prazos = prazosPortaria089();
  for (const p of PASSOS) {
    const r = linha?.responsaveis?.[p];
    if (r && typeof r === 'object') {
      responsaveis[p] = {
        papel: papelValido(r.papel) ? r.papel : null,
        setor_id: typeof r.setor_id === 'string' && r.setor_id ? r.setor_id : null,
      };
    }
    if (linha?.prazos && p in linha.prazos) prazos[p] = normalizarPrazo(linha.prazos[p]);
  }
  return {
    orgao_id: orgaoId,
    modo: linha?.modo === 'POR_SETOR' ? 'POR_SETOR' : 'SIMPLES',
    controle_interno_ativo: !!linha?.controle_interno_ativo,
    responsaveis,
    prazos,
    padrao: !linha,
  };
}

function normalizarPrazo(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 365) : null;
}

/**
 * Valida o corpo do PUT da configuração. Devolve os campos a gravar ou a lista
 * de erros. `setoresDoOrgao`: ids dos setores do órgão (setor de outro órgão
 * é recusado).
 */
export function validarConfiguracao(
  corpo: any,
  setoresDoOrgao: string[],
): { ok: true; valores: { modo: ModoFaseInterna; controle_interno_ativo: boolean; responsaveis: Record<string, ResponsavelDoPassoConfig>; prazos: Record<string, number | null> } } | { ok: false; erros: string[] } {
  const erros: string[] = [];
  const modo = corpo?.modo ?? 'SIMPLES';
  if (modo !== 'SIMPLES' && modo !== 'POR_SETOR') erros.push('Modo inválido — use SIMPLES ou POR_SETOR.');
  const base = configEfetiva('x', null);
  const responsaveis: Record<string, ResponsavelDoPassoConfig> = { ...base.responsaveis };
  const prazos: Record<string, number | null> = { ...base.prazos };

  for (const [passo, r] of Object.entries((corpo?.responsaveis ?? {}) as Record<string, any>)) {
    if (!PASSOS.includes(passo as PassoFaseInterna)) {
      erros.push(`Etapa desconhecida: ${passo}.`);
      continue;
    }
    const papel = r?.papel ?? null;
    const setor = r?.setor_id ?? null;
    if (papel !== null && !papelValido(papel)) erros.push(`Papel inválido em ${passo}: ${papel}.`);
    if (setor !== null && !setoresDoOrgao.includes(String(setor))) erros.push(`Setor de ${passo} não pertence ao órgão.`);
    if (papel === null && setor === null) erros.push(`Informe o papel ou o setor responsável por ${passo}.`);
    responsaveis[passo] = { papel: papelValido(papel) ? papel : null, setor_id: setor ? String(setor) : null };
  }
  for (const [passo, v] of Object.entries((corpo?.prazos ?? {}) as Record<string, any>)) {
    if (!PASSOS.includes(passo as PassoFaseInterna)) {
      erros.push(`Etapa desconhecida: ${passo}.`);
      continue;
    }
    if (v !== null && v !== '' && (!Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 365)) {
      erros.push(`Prazo de ${passo} inválido (0 a 365 dias úteis; vazio = sem prazo).`);
    }
    prazos[passo] = normalizarPrazo(v);
  }
  if (erros.length) return { ok: false, erros };
  return {
    ok: true,
    valores: { modo, controle_interno_ativo: !!corpo?.controle_interno_ativo, responsaveis, prazos },
  };
}

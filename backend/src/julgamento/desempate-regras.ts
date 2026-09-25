/**
 * ============================================================================
 * DESEMPATE — REGRAS PURAS (Lei 14.133/2021 art. 60; IN SEGES 73/2022 art. 28)
 * ============================================================================
 *
 * Art. 60. Em caso de empate entre duas ou mais propostas, serão utilizados
 * os seguintes critérios de desempate, nesta ordem:
 *   I   – disputa final, hipótese em que os licitantes empatados poderão
 *         apresentar nova proposta em ato contínuo à classificação;
 *   II  – avaliação do desempenho contratual prévio dos licitantes (registros
 *         cadastrais — art. 88 §§3º e 4º);
 *   III – desenvolvimento de ações de equidade entre homens e mulheres no
 *         ambiente de trabalho, conforme regulamento (Decreto 11.430/2023);
 *   IV  – desenvolvimento de programa de integridade.
 * §1º Em igualdade de condições, se não houver desempate, preferência,
 * sucessivamente, aos bens e serviços produzidos ou prestados por:
 *   I   – empresas estabelecidas no território do Estado (ou DF) do órgão
 *         licitante — no caso de órgão municipal, no Estado em que o
 *         Município se localize;
 *   II  – empresas brasileiras;
 *   III – empresas que invistam em pesquisa e desenvolvimento de tecnologia no País;
 *   IV  – empresas que comprovem a prática de mitigação (Lei 12.187/2009).
 * §2º Sem prejuízo do art. 44 da LC 123/2006 (tratado na etapa ME/EPP).
 * IN 73 art. 28 §2º: persistindo o empate, SORTEIO em ato público (sorteio.ts).
 *
 * Cada critério, na ordem, divide cada bloco ainda empatado em "atende" (na
 * frente) e "não atende"; só desempata se os dois lados tiverem alguém.
 * Critério sem dado no sistema é registrado como NÃO APLICÁVEL (com o motivo)
 * e pulado — nunca "inventado". A disputa final (I) é um ato com prazo
 * (DesempateService); aqui só se monta o resultado dela em blocos.
 */

import type { DirecaoLance } from '../disputa-v2/modos-disputa';

export enum CriterioDesempate {
  DISPUTA_FINAL = 'DISPUTA_FINAL',
  DESEMPENHO_CONTRATUAL = 'DESEMPENHO_CONTRATUAL',
  EQUIDADE_GENERO = 'EQUIDADE_GENERO',
  PROGRAMA_INTEGRIDADE = 'PROGRAMA_INTEGRIDADE',
  EMPRESA_DO_ESTADO = 'EMPRESA_DO_ESTADO',
  EMPRESA_BRASILEIRA = 'EMPRESA_BRASILEIRA',
  PESQUISA_TECNOLOGIA_PAIS = 'PESQUISA_TECNOLOGIA_PAIS',
  MITIGACAO_EMISSOES = 'MITIGACAO_EMISSOES',
  SORTEIO = 'SORTEIO',
}

export const CRITERIOS_ART60: ReadonlyArray<{ criterio: CriterioDesempate; baseLegal: string; descricao: string }> = [
  { criterio: CriterioDesempate.DISPUTA_FINAL, baseLegal: 'Lei 14.133/2021, art. 60, I', descricao: 'Disputa final (nova proposta dos empatados)' },
  { criterio: CriterioDesempate.DESEMPENHO_CONTRATUAL, baseLegal: 'Lei 14.133/2021, art. 60, II', descricao: 'Avaliação do desempenho contratual prévio' },
  { criterio: CriterioDesempate.EQUIDADE_GENERO, baseLegal: 'Lei 14.133/2021, art. 60, III', descricao: 'Ações de equidade entre homens e mulheres' },
  { criterio: CriterioDesempate.PROGRAMA_INTEGRIDADE, baseLegal: 'Lei 14.133/2021, art. 60, IV', descricao: 'Programa de integridade' },
  { criterio: CriterioDesempate.EMPRESA_DO_ESTADO, baseLegal: 'Lei 14.133/2021, art. 60, §1º, I', descricao: 'Empresa estabelecida no Estado do órgão licitante' },
  { criterio: CriterioDesempate.EMPRESA_BRASILEIRA, baseLegal: 'Lei 14.133/2021, art. 60, §1º, II', descricao: 'Empresa brasileira' },
  { criterio: CriterioDesempate.PESQUISA_TECNOLOGIA_PAIS, baseLegal: 'Lei 14.133/2021, art. 60, §1º, III', descricao: 'Investimento em pesquisa e tecnologia no País' },
  { criterio: CriterioDesempate.MITIGACAO_EMISSOES, baseLegal: 'Lei 14.133/2021, art. 60, §1º, IV', descricao: 'Prática de mitigação (Lei 12.187/2009)' },
  { criterio: CriterioDesempate.SORTEIO, baseLegal: 'IN SEGES 73/2022, art. 28, §2º', descricao: 'Sorteio em ato público' },
];

/** Critérios aplicados automaticamente depois da disputa final (II a §1º IV), na ordem. */
export const CRITERIOS_AUTOMATICOS: ReadonlyArray<CriterioDesempate> = CRITERIOS_ART60.map((c) => c.criterio).filter(
  (c) => c !== CriterioDesempate.DISPUTA_FINAL && c !== CriterioDesempate.SORTEIO,
);

/** Motivos de "não aplicável" dos critérios sem dado no sistema (documentados). */
export const MOTIVO_NAO_APLICAVEL: Partial<Record<CriterioDesempate, string>> = {
  [CriterioDesempate.DESEMPENHO_CONTRATUAL]:
    'Não aplicável — sem registro cadastral de desempenho contratual (art. 88 §§3º-4º) no sistema.',
  [CriterioDesempate.EQUIDADE_GENERO]:
    'Não aplicável — o sistema não coleta a comprovação de ações de equidade entre homens e mulheres (Decreto 11.430/2023).',
  [CriterioDesempate.PESQUISA_TECNOLOGIA_PAIS]:
    'Não aplicável — o sistema não coleta a comprovação de investimento em pesquisa e desenvolvimento de tecnologia no País.',
  [CriterioDesempate.MITIGACAO_EMISSOES]:
    'Não aplicável — o sistema não coleta a comprovação de práticas de mitigação (Lei 12.187/2009).',
};

export const UFS_BRASIL = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB',
  'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

/** Dados do licitante usados pelos critérios automáticos (vindos do cadastro e da proposta). */
export interface DadosLicitanteDesempate {
  fornecedorId: string;
  /** UF do cadastro do fornecedor. */
  uf: string | null;
  cpfCnpj: string | null;
  /** Declaração de programa de integridade da proposta (null = sem proposta/dado). */
  declaracaoIntegridade: boolean | null;
}

export interface ContextoDesempate {
  /** UF do órgão licitante (§1º I: para órgão municipal, o Estado do Município — é a mesma UF). */
  ufOrgao: string | null;
}

export interface PassoDesempate {
  criterio: CriterioDesempate;
  baseLegal: string;
  descricao: string;
  aplicavel: boolean;
  motivo?: string;
  /** Houve desempate (algum bloco foi dividido) neste critério. */
  desempatou: boolean;
  /** Quem atendeu ao critério (ids), quando aplicável. */
  atenderam?: string[];
  /** Blocos depois do critério (ids por bloco, na ordem). */
  blocos: string[][];
  /** Dados extras (disputa final: ofertas; sorteio: semente, entrada...). */
  detalhes?: Record<string, unknown>;
}

const infoCriterio = (c: CriterioDesempate) => CRITERIOS_ART60.find((x) => x.criterio === c)!;

const soDigitos = (v: string | null | undefined) => String(v ?? '').replace(/\D/g, '');
const uf = (v: string | null | undefined) => String(v ?? '').trim().toUpperCase();

/**
 * Avalia um critério automático: aplicável? quem atende?
 *  - IV integridade: declaração da proposta (autodeclaração; sem dado de ninguém → não aplicável);
 *  - §1º I: UF do fornecedor = UF do órgão;
 *  - §1º II: CNPJ (14 dígitos) com sede em UF brasileira — o cadastro da
 *    plataforma é de pessoas jurídicas/físicas inscritas no Brasil; CPF não é "empresa";
 *  - II, III, §1º III, §1º IV: sem dado → não aplicável.
 */
export function avaliarCriterio(
  criterio: CriterioDesempate,
  dados: DadosLicitanteDesempate[],
  ctx: ContextoDesempate,
): { aplicavel: boolean; motivo?: string; atende: Set<string> } {
  const atende = new Set<string>();
  switch (criterio) {
    case CriterioDesempate.PROGRAMA_INTEGRIDADE: {
      if (dados.every((d) => d.declaracaoIntegridade == null)) {
        return { aplicavel: false, motivo: 'Não aplicável — nenhuma declaração de programa de integridade registrada nas propostas.', atende };
      }
      dados.filter((d) => d.declaracaoIntegridade === true).forEach((d) => atende.add(d.fornecedorId));
      return { aplicavel: true, atende };
    }
    case CriterioDesempate.EMPRESA_DO_ESTADO: {
      const ufOrgao = uf(ctx.ufOrgao);
      if (!UFS_BRASIL.includes(ufOrgao)) {
        return { aplicavel: false, motivo: 'Não aplicável — UF do órgão licitante não cadastrada.', atende };
      }
      dados.filter((d) => uf(d.uf) === ufOrgao).forEach((d) => atende.add(d.fornecedorId));
      return { aplicavel: true, atende };
    }
    case CriterioDesempate.EMPRESA_BRASILEIRA: {
      dados
        .filter((d) => soDigitos(d.cpfCnpj).length === 14 && UFS_BRASIL.includes(uf(d.uf)))
        .forEach((d) => atende.add(d.fornecedorId));
      return { aplicavel: true, atende };
    }
    default:
      return { aplicavel: false, motivo: MOTIVO_NAO_APLICAVEL[criterio] ?? 'Não aplicável.', atende };
  }
}

/**
 * Aplica os critérios II..§1º IV, na ordem, aos blocos ainda empatados
 * (entrada: blocos já na ordem do resultado da disputa final). Devolve os
 * blocos finais (os de tamanho > 1 vão a sorteio) e a trilha de cada passo.
 */
export function aplicarCriteriosAutomaticos(
  blocosEntrada: string[][],
  dados: DadosLicitanteDesempate[],
  ctx: ContextoDesempate,
): { blocos: string[][]; trilha: PassoDesempate[] } {
  let blocos = blocosEntrada.map((b) => [...b]);
  const trilha: PassoDesempate[] = [];
  const porId = new Map(dados.map((d) => [d.fornecedorId, d]));
  for (const criterio of CRITERIOS_AUTOMATICOS) {
    const info = infoCriterio(criterio);
    if (blocos.every((b) => b.length <= 1)) break;
    const empatados = blocos.filter((b) => b.length > 1).flat();
    const av = avaliarCriterio(
      criterio,
      empatados.map((id) => porId.get(id) ?? { fornecedorId: id, uf: null, cpfCnpj: null, declaracaoIntegridade: null }),
      ctx,
    );
    let desempatou = false;
    if (av.aplicavel) {
      const novos: string[][] = [];
      for (const b of blocos) {
        if (b.length <= 1) {
          novos.push(b);
          continue;
        }
        const sim = b.filter((id) => av.atende.has(id));
        const nao = b.filter((id) => !av.atende.has(id));
        if (sim.length && nao.length) {
          desempatou = true;
          novos.push(sim, nao);
        } else {
          novos.push(b);
        }
      }
      blocos = novos;
    }
    trilha.push({
      criterio,
      baseLegal: info.baseLegal,
      descricao: info.descricao,
      aplicavel: av.aplicavel,
      ...(av.motivo ? { motivo: av.motivo } : {}),
      desempatou,
      ...(av.aplicavel ? { atenderam: empatados.filter((id) => av.atende.has(id)) } : {}),
      blocos: blocos.map((b) => [...b]),
    });
  }
  return { blocos, trilha };
}

export const empateResolvido = (blocos: string[][]) => blocos.every((b) => b.length <= 1);

/**
 * Resultado da DISPUTA FINAL (art. 60 I) em blocos: cada empatado fica com a
 * nova proposta (se melhor que o valor empatado, na direção do critério) ou
 * com o valor empatado; ordena e agrupa valores iguais (ao centavo).
 * Usado quando a chave do ranking é o próprio valor (menor preço, maior
 * desconto, maior lance); nos critérios pontuados a chave vem do ranking.
 */
export function blocosPorChave(
  membros: Array<{ fornecedorId: string; chave: number; registradoEm?: number }>,
  direcao: DirecaoLance,
  casas = 2,
): string[][] {
  const f = 10 ** casas;
  const k = (v: number) => Math.round(Number(v) * f);
  const ord = [...membros].sort((a, b) => (direcao === 'MAIOR' ? k(b.chave) - k(a.chave) : k(a.chave) - k(b.chave)) || (a.registradoEm ?? 0) - (b.registradoEm ?? 0));
  const blocos: string[][] = [];
  for (const m of ord) {
    const ultimo = blocos[blocos.length - 1];
    const ref = ultimo ? ord.find((o) => o.fornecedorId === ultimo[0])! : null;
    if (ref && k(ref.chave) === k(m.chave)) ultimo.push(m.fornecedorId);
    else blocos.push([m.fornecedorId]);
  }
  return blocos;
}

/** Oferta da disputa final é válida? Estritamente melhor que o valor empatado, 2 casas. */
export function motivoOfertaDisputaFinalInvalida(valor: number, valorEmpatado: number, direcao: DirecaoLance): string | null {
  const v = Number(valor);
  if (!Number.isFinite(v) || v <= 0) return 'Valor inválido';
  if (Math.abs(Math.round(v * 100) / 100 - v) > 1e-9) return 'Informe o valor com no máximo 2 casas decimais';
  const melhor = direcao === 'MAIOR' ? v > Number(valorEmpatado) : v < Number(valorEmpatado);
  if (!melhor) {
    return direcao === 'MAIOR'
      ? `A nova proposta deve ser MAIOR que o valor empatado (R$ ${Number(valorEmpatado).toFixed(2)})`
      : `A nova proposta deve ser MENOR que o valor empatado (R$ ${Number(valorEmpatado).toFixed(2)})`;
  }
  return null;
}

/** Prazo da disputa final (ato contínuo): minutos, entre 1 e 60; padrão 5. */
export const PRAZO_DISPUTA_FINAL_PADRAO_MINUTOS = 5;
export function motivoPrazoDisputaFinalInvalido(minutos: number | null | undefined): string | null {
  if (minutos == null) return null;
  const m = Number(minutos);
  if (!Number.isInteger(m) || m < 1 || m > 60) {
    return 'O prazo da disputa final é em minutos (inteiro de 1 a 60) — o art. 60, I, fala em "ato contínuo à classificação".';
  }
  return null;
}

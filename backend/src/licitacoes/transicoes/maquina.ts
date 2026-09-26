import { FaseLicitacao, Licitacao, SituacaoLicitacao, SITUACOES_TERMINAIS } from '../entities/licitacao.entity';
import { definicaoDoAto, fluxoDaModalidade } from './definicoes';
import { indiceFase, ROTULO_FASE, ROTULO_SITUACAO } from './fases';
import { AtoLicitacao, AtoDisponivel, ContextoTransicao, DefinicaoAto } from './transicoes.tipos';

/**
 * NÚCLEO PURO da máquina de estados — sem banco, sem Nest. O
 * TransicoesService só acrescenta transação, lock, histórico e eventos.
 */

export type EstadoLicitacao = Pick<Licitacao, 'fase' | 'situacao' | 'modalidade'> & Partial<Licitacao>;

/** Situação efetiva (linhas antigas sem a coluna preenchida = ATIVA). */
export function situacaoDe(lic: { situacao?: SituacaoLicitacao | null }): SituacaoLicitacao {
  return lic.situacao ?? SituacaoLicitacao.ATIVA;
}

export function faseDestino(def: DefinicaoAto, lic: EstadoLicitacao, ctx?: ContextoTransicao): FaseLicitacao {
  if (!def.para) return lic.fase;
  return typeof def.para === 'function' ? def.para(lic as Licitacao, ctx) : def.para;
}

/**
 * Motivo pelo qual o ESTADO atual (fase + situação) não admite o ato, ou null.
 * (Pré-condições de dados/prazos são avaliadas à parte em `pendenciasDoAto`.)
 */
export function conflitoDeEstado(def: DefinicaoAto | undefined, lic: EstadoLicitacao, ato?: AtoLicitacao): string | null {
  if (!def) {
    return `O ato ${ato ?? ''} não se aplica à modalidade ${lic.modalidade}.`.replace('  ', ' ');
  }
  const situacao = situacaoDe(lic);
  const aceitas = def.situacoesOrigem ?? [SituacaoLicitacao.ATIVA];
  if (!aceitas.includes(situacao)) {
    if (SITUACOES_TERMINAIS.includes(situacao)) {
      return `Licitação ${ROTULO_SITUACAO[situacao].toLowerCase()} — processo encerrado, nenhum ato é possível (${def.rotulo}).`;
    }
    if (situacao === SituacaoLicitacao.SUSPENSA) {
      return `Licitação suspensa — retome o processo antes de: ${def.rotulo}.`;
    }
    return `Ato "${def.rotulo}" exige a licitação ${aceitas.map((s) => ROTULO_SITUACAO[s].toLowerCase()).join(' ou ')} (situação atual: ${ROTULO_SITUACAO[situacao].toLowerCase()}).`;
  }
  if (!def.de.includes(lic.fase)) {
    const especifica = def.mensagemForaDaFase?.(lic as Licitacao);
    if (especifica) return especifica;
    const fases = def.de.map((f) => ROTULO_FASE[f] ?? f).join(', ');
    return `Ato "${def.rotulo}" não é permitido na fase ${ROTULO_FASE[lic.fase] ?? lic.fase} (permitido em: ${fases}).`;
  }
  return null;
}

/** Pendências (pré-condições não atendidas) do ato, na ordem da definição. */
export async function pendenciasDoAto(def: DefinicaoAto, ctx: ContextoTransicao): Promise<string[]> {
  const pendencias: string[] = [];
  if (def.requerMotivo && !ctx.somenteAvaliacao && !(ctx.motivo || '').trim()) {
    pendencias.push(`Motivo obrigatório para: ${def.rotulo}.`);
  }
  for (const pre of def.precondicoes ?? []) {
    const r = await pre(ctx);
    if (!r) continue;
    for (const p of Array.isArray(r) ? r : [r]) if (p) pendencias.push(p);
  }
  return pendencias;
}

export interface ResultadoAplicacao {
  fase_de: FaseLicitacao;
  fase_para: FaseLicitacao;
  situacao_de: SituacaoLicitacao;
  situacao_para: SituacaoLicitacao;
}

/**
 * Aplica o ato no objeto (fase, fase_anterior, situação e efeitos).
 * Pressupõe estado e pré-condições já validados.
 */
export function aplicarNoEstado(def: DefinicaoAto, lic: Licitacao, ctx: ContextoTransicao): ResultadoAplicacao {
  const fase_de = lic.fase;
  const situacao_de = situacaoDe(lic);
  const fase_para = faseDestino(def, lic, ctx);
  const situacao_para = def.situacaoPara ?? situacao_de;

  if (fase_para !== fase_de) {
    lic.fase_anterior = fase_de;
    lic.fase = fase_para;
  }
  lic.situacao = situacao_para;
  for (const efeito of def.efeitos ?? []) efeito(lic, ctx);

  // Motivo também vai para as observações (acrescentado, nunca sobrescrito)
  const motivo = (ctx.motivo || '').trim();
  if (motivo && (def.requerMotivo || def.situacaoPara)) {
    const linha = `[${ctx.agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}] ${def.rotulo}: ${motivo}`;
    lic.observacoes = lic.observacoes ? `${lic.observacoes}\n${linha}` : linha;
  }
  return { fase_de, fase_para, situacao_de, situacao_para };
}

/**
 * O ato já está "aplicado" (pedido idempotente): a licitação já está na fase
 * de destino ou além (e o ato não muda situação).
 */
export function jaAplicado(def: DefinicaoAto, lic: EstadoLicitacao): boolean {
  if (def.situacaoPara) return situacaoDe(lic) === def.situacaoPara;
  if (!def.para) return false;
  if (typeof def.para === 'function') {
    // Destino calculado (ex.: PUBLICAR → AGUARDANDO_DIVULGACAO | PUBLICADO): fora
    // da fase de origem e já no destino (ou além) = aplicado.
    if (def.de.includes(lic.fase)) return false;
    const destino = def.para(lic as Licitacao);
    return indiceFase(destino) >= 0 && indiceFase(lic.fase) >= indiceFase(destino);
  }
  if (def.de.includes(lic.fase) && def.para !== lic.fase) return false;
  return indiceFase(lic.fase) >= indiceFase(def.para);
}

function ehAutoTransicao(def: DefinicaoAto, lic: EstadoLicitacao): boolean {
  return !def.situacaoPara && faseDestino(def, lic) === lic.fase;
}

/** Ato "seguinte" para o PUT avancar-fase (compatibilidade com a tela antiga). */
export function atoPrincipal(lic: EstadoLicitacao): DefinicaoAto | undefined {
  return fluxoDaModalidade(lic.modalidade).find(
    (d) => d.principal && d.de.includes(lic.fase) && !ehAutoTransicao(d, lic),
  );
}

/** Ato de retorno para o PUT retroceder-fase (compatibilidade). */
export function atoDeRetorno(lic: EstadoLicitacao): DefinicaoAto | undefined {
  return fluxoDaModalidade(lic.modalidade).find((d) => d.retorno && d.de.includes(lic.fase));
}

/**
 * Atos que a TELA pode oferecer agora (ignora os `somenteSistema`), com as
 * pendências de cada um. Atos cujo estado não permite ficam de fora.
 */
export async function avaliarAtosDisponiveis(
  lic: Licitacao,
  criarContexto: (def: DefinicaoAto) => ContextoTransicao,
): Promise<AtoDisponivel[]> {
  const saida: AtoDisponivel[] = [];
  for (const def of fluxoDaModalidade(lic.modalidade)) {
    if (def.somenteSistema) continue;
    if (conflitoDeEstado(def, lic)) continue;
    const ctx = { ...criarContexto(def), somenteAvaliacao: true };
    const pendencias = await pendenciasDoAto(def, ctx);
    const para = def.para ? faseDestino(def, lic, ctx) : null;
    saida.push({
      ato: def.ato,
      rotulo: def.rotulo,
      fase_para: para && para !== lic.fase ? para : null,
      situacao_para: def.situacaoPara ?? null,
      requer_motivo: !!def.requerMotivo,
      requer_dados: !!def.requerDados,
      endpoint: def.endpoint ?? null,
      disponivel: pendencias.length === 0,
      pendencias,
    });
  }
  return saida;
}

export { definicaoDoAto };

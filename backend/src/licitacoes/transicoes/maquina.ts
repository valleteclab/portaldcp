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

// ---------------------------------------------------------------------------
// Menu "Mais ações" do cockpit (E8 — Etapa B da tela do processo)
// ---------------------------------------------------------------------------

/**
 * Atos oferecidos no menu "Mais ações" da tela do processo. Os demais atos
 * têm lugar próprio (publicar e julgar na área da etapa atual; disputa,
 * habilitação e recursos na sala; adjudicar/homologar no resultado).
 */
export const ATOS_DO_MENU: AtoLicitacao[] = [
  AtoLicitacao.SUSPENDER,
  AtoLicitacao.RETOMAR,
  AtoLicitacao.RETIFICAR_EDITAL,
  AtoLicitacao.CANCELAR_PUBLICACAO,
  AtoLicitacao.REGISTRAR_RESULTADO_EXTERNO,
  AtoLicitacao.INTENCAO_REVOGAR,
  AtoLicitacao.REVOGAR,
  AtoLicitacao.INTENCAO_ANULAR,
  AtoLicitacao.ANULAR,
  AtoLicitacao.DECLARAR_DESERTA,
  AtoLicitacao.DECLARAR_FRACASSADA,
];

/**
 * Atos que continuam no menu, BLOQUEADOS e com o motivo escrito, quando a
 * fase ainda não os admite (o agente precisa saber quando liberam). Os outros
 * atos fora da fase simplesmente não aparecem (ex.: cancelar a publicação
 * ainda na fase interna).
 */
const MOSTRAR_BLOQUEADO_FORA_DA_FASE: AtoLicitacao[] = [
  AtoLicitacao.SUSPENDER,
  AtoLicitacao.RETIFICAR_EDITAL,
  AtoLicitacao.DECLARAR_DESERTA,
  AtoLicitacao.DECLARAR_FRACASSADA,
];

export interface AcaoDoMenu {
  ato: AtoLicitacao;
  rotulo: string;
  disponivel: boolean;
  /** Pendências (ato na fase certa) ou o motivo de a fase não admitir o ato. */
  motivos: string[];
  /** true = a fase/situação ainda não admite o ato (não é pendência de dados). */
  fora_da_fase: boolean;
  requer_motivo: boolean;
  endpoint: string | null;
}

/**
 * Ações do menu "Mais ações" com disponibilidade e motivo — a MESMA máquina
 * de estados que executa os atos (conflito de estado + pré-condições em modo
 * de avaliação). Processo encerrado (revogado, anulado, deserto, fracassado,
 * concluído): nenhum ato. Inclui CANCELAR_PUBLICACAO, que é `somenteSistema`
 * no POST genérico mas tem endpoint próprio do órgão
 * (`POST /licitacoes/:id/cancelar-publicacao`, que passa pela máquina).
 */
export async function avaliarAcoesDoMenu(
  lic: Licitacao,
  criarContexto: (def: DefinicaoAto) => ContextoTransicao,
  atos: AtoLicitacao[] = ATOS_DO_MENU,
): Promise<AcaoDoMenu[]> {
  const situacao = situacaoDe(lic);
  if (SITUACOES_TERMINAIS.includes(situacao)) return [];
  const saida: AcaoDoMenu[] = [];
  for (const ato of atos) {
    const def = definicaoDoAto(lic.modalidade, ato);
    if (!def) continue;
    // Retomar só com a licitação suspensa; suspender, só com ela ativa
    if (ato === AtoLicitacao.RETOMAR && situacao !== SituacaoLicitacao.SUSPENSA) continue;
    if (ato === AtoLicitacao.SUSPENDER && situacao === SituacaoLicitacao.SUSPENSA) continue;
    // Seleção externa: a publicação é da plataforma de origem (nada a cancelar aqui)
    if (ato === AtoLicitacao.CANCELAR_PUBLICACAO && (lic as any).selecao_externa) continue;
    const base = {
      ato,
      rotulo: ato === AtoLicitacao.CANCELAR_PUBLICACAO ? 'Cancelar publicação' : def.rotulo,
      requer_motivo: !!def.requerMotivo,
      endpoint: ato === AtoLicitacao.CANCELAR_PUBLICACAO ? 'POST /licitacoes/:id/cancelar-publicacao' : def.endpoint ?? null,
    };
    const conflito = conflitoDeEstado(def, lic);
    if (conflito) {
      if (MOSTRAR_BLOQUEADO_FORA_DA_FASE.includes(ato)) saida.push({ ...base, disponivel: false, motivos: [conflito], fora_da_fase: true });
      continue;
    }
    const pendencias = await pendenciasDoAto(def, { ...criarContexto(def), somenteAvaliacao: true });
    saida.push({ ...base, disponivel: pendencias.length === 0, motivos: pendencias, fora_da_fase: false });
  }
  return saida;
}

export { definicaoDoAto };

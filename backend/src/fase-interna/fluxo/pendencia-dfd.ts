/**
 * PENDÊNCIA "MONTAR O DFD" (regras puras) — depois de a demanda ser aprovada,
 * quem monta o DFD consolidado (unidade de planejamento, pela regra de
 * Configurações › Fluxo) é avisado e passa a ter a pendência em "Minhas
 * tarefas" e no menu. Ver `pendencia-dfd.service.ts`.
 */

/** Tela da unidade de planejamento (escolher as demandas e montar o DFD). */
export const LINK_CONSOLIDACAO = '/orgao/demandas/consolidacao';

/** Chave da pendência na caixa "Para mim" (uma por órgão e pessoa — derivada, nunca duplica). */
export const CHAVE_PENDENCIA_DFD = 'dfd:montar';

/** `entidade_tipo` do aviso ao planejamento (agrupamento: ver `decidirAviso`). */
export const ENTIDADE_AVISO_DFD = 'DFD_PENDENTE';

/**
 * Janela do agrupamento: enquanto o aviso anterior NÃO foi lido e tem menos
 * que isto, a nova aprovação só atualiza o texto (total novo) — sem outro
 * e-mail/WhatsApp. Lido ou mais antigo → aviso novo.
 */
export const JANELA_AGRUPAMENTO_AVISO_MS = 12 * 60 * 60 * 1000;

/** Ano corrente no fuso de Brasília (a virada de ano não depende do UTC do servidor). */
export function anoDeBrasilia(agora: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(agora));
}

/**
 * Exercícios que contam na pendência: do ano passado em diante (o mesmo
 * início do seletor da tela do DFD consolidado). Demandas aprovadas de
 * exercícios mais antigos são legado e não geram pendência para sempre.
 */
export function anoMinimoDaPendencia(anoAtual: number): number {
  return anoAtual - 1;
}

export interface DemandasLivres {
  total: number;
  por_ano: Array<{ ano: number; n: number }>;
}

/**
 * Link da tela do planejamento: o exercício mais próximo com demanda livre
 * (a tela abre no ano corrente; outro ano vai no `?ano=`).
 */
export function linkDaPendencia(livres: DemandasLivres, anoAtual: number): string {
  const anos = livres.por_ano.filter((a) => a.n > 0).map((a) => a.ano).sort((a, b) => a - b);
  const alvo = anos.find((a) => a >= anoAtual) ?? anos[0];
  return alvo && alvo !== anoAtual ? `${LINK_CONSOLIDACAO}?ano=${alvo}` : LINK_CONSOLIDACAO;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** "N demanda(s) aprovada(s) aguardando" — texto da tarefa e do aviso. */
export function textoTotal(n: number): string {
  return `${plural(n, 'demanda aprovada', 'demandas aprovadas')} aguardando o DFD`;
}

/** Pendência para a caixa "Para mim" (null quando não há nada livre). */
export function pendenciaDaCaixa(livres: DemandasLivres, anoAtual: number) {
  if (!livres.total) return null;
  return {
    chave: CHAVE_PENDENCIA_DFD,
    titulo: `Montar o DFD — ${plural(livres.total, 'demanda aprovada aguardando', 'demandas aprovadas aguardando')}`,
    descricao:
      'Junte as demandas aprovadas dos setores num DFD consolidado (Lei 14.133, art. 12, VII) e abra o processo. A pendência some quando todas entrarem num DFD.',
    quantidade: livres.total,
    por_ano: livres.por_ano,
    destino: linkDaPendencia(livres, anoAtual),
  };
}

/** Texto do aviso ao planejamento (sino, e-mail e WhatsApp). */
export function textoAvisoPlanejamento(d: { objeto: string | null | undefined; setor: string | null | undefined; total: number }) {
  const objeto = String(d.objeto ?? '').trim() || 'Demanda';
  const setor = String(d.setor ?? '').trim();
  const total = Math.max(1, d.total);
  return {
    titulo: 'Demanda aprovada — monte o DFD',
    mensagem: `Demanda aprovada: ${objeto}${setor ? ` (${setor})` : ''} — pronta para entrar num DFD. Há ${plural(total, 'demanda aprovada', 'demandas aprovadas')} aguardando o DFD.`,
  };
}

/**
 * QUEM RECEBE o aviso de "demanda aprovada, monte o DFD": quem monta o DFD
 * (usuários do órgão pela regra), sem repetir ninguém e SEM quem aprovou
 * (acabou de fazer — a pendência fica em "Minhas tarefas" e no menu).
 * `requisitanteIncluido`: quem pediu também monta o DFD → recebe só ESTE
 * aviso (o aviso ao requisitante não sai de novo).
 */
export function destinatariosDoAviso<T extends { id: string }>(
  planejamento: T[],
  opcoes: { aprovadorId?: string | null; requisitanteId?: string | null },
): { para: T[]; requisitanteIncluido: boolean } {
  const vistos = new Set<string>();
  const para: T[] = [];
  for (const u of planejamento) {
    if (!u?.id || vistos.has(u.id)) continue;
    vistos.add(u.id);
    if (opcoes.aprovadorId && u.id === opcoes.aprovadorId) continue;
    para.push(u);
  }
  const requisitanteIncluido = !!opcoes.requisitanteId && para.some((u) => u.id === opcoes.requisitanteId);
  return { para, requisitanteIncluido };
}

/**
 * AGRUPAMENTO (várias aprovações em sequência): aviso anterior da mesma
 * pendência, não lido e dentro da janela → ATUALIZAR (texto com o total novo,
 * sem outro e-mail/WhatsApp); senão → CRIAR (sino + e-mail + WhatsApp).
 */
export function decidirAviso(
  anterior: { lida: boolean; created_at: Date | string } | null | undefined,
  agora: Date = new Date(),
  janelaMs: number = JANELA_AGRUPAMENTO_AVISO_MS,
): 'CRIAR' | 'ATUALIZAR' {
  if (!anterior || anterior.lida) return 'CRIAR';
  const criado = new Date(anterior.created_at).getTime();
  if (!Number.isFinite(criado)) return 'CRIAR';
  return agora.getTime() - criado < janelaMs ? 'ATUALIZAR' : 'CRIAR';
}

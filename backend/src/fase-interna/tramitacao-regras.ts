/**
 * TRAMITAÇÃO COMO ESPINHA (F2) — regras puras (sem banco).
 *
 *  - quem pode receber/devolver/enviar (setor de destino, pessoa de destino,
 *    chefe do setor ou administrador do órgão);
 *  - quem é avisado da chegada (pessoa → só ela; setor → todos os usuários
 *    ativos do setor + o chefe, se houver);
 *  - data de ocorrência do lançamento posterior (não futura, não anterior à
 *    movimentação anterior);
 *  - prazo em dias úteis pelo calendário do órgão (art. 183 — mesma função
 *    única de `common/prazos/dias-uteis`), situação do prazo e avisos;
 *  - despacho padrão do envio automático e a linha do tempo.
 */
import {
  CalendarioDiasUteis,
  DESLOCAMENTO_BRASILIA_MS,
  DIA_MS,
  diaEmBrasilia,
  diasUteisEntre,
  fimDoPrazoEmDiasUteis,
} from '../common/prazos/dias-uteis';

// ---------------------------------------------------------------------------
// Quem pode atuar
// ---------------------------------------------------------------------------

/** Quem está agindo (sempre do JWT + cadastro — nunca do corpo da requisição). */
export interface PerfilTramitacao {
  /** Usuário do órgão (null no login do próprio órgão ou do admin da plataforma). */
  usuario_id: string | null;
  nome: string;
  cargo: string | null;
  /** Setor de lotação do usuário. */
  setor_id: string | null;
  /** Login do órgão, papel ADMIN do órgão ou administrador da plataforma. */
  admin_orgao: boolean;
}

export interface DestinoTramitacao {
  para_setor_id?: string | null;
  para_usuario_id?: string | null;
}

/**
 * Pode receber/devolver (ou enviar adiante) o que está com este destino?
 * Administrador do órgão; a pessoa de destino; quem é lotado no setor de
 * destino; o chefe do setor de destino.
 */
export function podeAtuarNoDestino(p: PerfilTramitacao, t: DestinoTramitacao, chefeDoSetor?: string | null): boolean {
  if (p.admin_orgao) return true;
  if (!p.usuario_id) return false;
  if (t.para_usuario_id && t.para_usuario_id === p.usuario_id) return true;
  if (t.para_setor_id && p.setor_id && t.para_setor_id === p.setor_id) return true;
  if (chefeDoSetor && chefeDoSetor === p.usuario_id) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Destinatários do aviso de chegada
// ---------------------------------------------------------------------------

export interface CandidatoAviso {
  id: string;
  setor_id?: string | null;
  email?: string | null;
  telefone?: string | null;
}

/**
 * Quem recebe o aviso de chegada (decisão do dono, plano §10.5):
 *  - envio para uma PESSOA → só ela;
 *  - envio para o SETOR → todos os usuários ativos do setor e, se o setor
 *    tiver chefe cadastrado, o chefe também.
 * Quem enviou não é avisado do próprio envio. Sem repetição.
 * `candidatos` já vêm filtrados (ativos, do órgão).
 */
export function escolherDestinatarios<T extends CandidatoAviso>(
  envio: DestinoTramitacao,
  candidatos: T[],
  chefeId: string | null | undefined,
  remetenteId?: string | null,
): T[] {
  const escolhidos = new Map<string, T>();
  if (envio.para_usuario_id) {
    const u = candidatos.find((c) => c.id === envio.para_usuario_id);
    if (u) escolhidos.set(u.id, u);
  } else if (envio.para_setor_id) {
    for (const c of candidatos) if (c.setor_id && c.setor_id === envio.para_setor_id) escolhidos.set(c.id, c);
    if (chefeId) {
      const chefe = candidatos.find((c) => c.id === chefeId);
      if (chefe) escolhidos.set(chefe.id, chefe);
    }
  }
  if (remetenteId) escolhidos.delete(remetenteId);
  return [...escolhidos.values()];
}

// ---------------------------------------------------------------------------
// Data de ocorrência (lançamento de movimentação que já aconteceu)
// ---------------------------------------------------------------------------

export type ResultadoDataOcorrencia = { ok: true; data: Date; somente_data: boolean } | { ok: false; erro: string };

const SO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida a data em que a movimentação OCORREU:
 *  - "AAAA-MM-DD" (só a data): vale o fim daquele dia em Brasília, limitado a
 *    agora (lançar "hoje" = agora);
 *  - data e hora ISO: como informada;
 *  - não pode ser futura (tolerância de 1 minuto de relógio);
 *  - não pode ser anterior à movimentação anterior (`minimo`).
 */
export function validarDataOcorrencia(
  valor: unknown,
  opcoes: { agora?: Date; minimo?: Date | null } = {},
): ResultadoDataOcorrencia {
  const agora = opcoes.agora ?? new Date();
  const txt = String(valor ?? '').trim();
  if (!txt) return { ok: false, erro: 'Informe a data em que a movimentação ocorreu.' };
  let data: Date;
  let somenteData = false;
  if (SO_DATA.test(txt)) {
    const [a, m, d] = txt.split('-').map(Number);
    const meiaNoite = Date.UTC(a, m - 1, d);
    const conferida = new Date(meiaNoite);
    if (conferida.getUTCFullYear() !== a || conferida.getUTCMonth() !== m - 1 || conferida.getUTCDate() !== d) {
      return { ok: false, erro: 'Data da movimentação inválida.' };
    }
    if (meiaNoite > diaEmBrasilia(agora)) return { ok: false, erro: 'A data da movimentação não pode ser futura.' };
    const fimDoDia = new Date(meiaNoite + DIA_MS - 1000 + DESLOCAMENTO_BRASILIA_MS);
    data = fimDoDia.getTime() > agora.getTime() ? new Date(agora.getTime()) : fimDoDia;
    somenteData = true;
  } else {
    data = new Date(txt);
    if (Number.isNaN(data.getTime())) return { ok: false, erro: 'Data da movimentação inválida.' };
    if (data.getTime() > agora.getTime() + 60_000) return { ok: false, erro: 'A data da movimentação não pode ser futura.' };
  }
  const minimo = opcoes.minimo ? new Date(opcoes.minimo) : null;
  if (minimo && data.getTime() < minimo.getTime()) {
    // Só a data, no MESMO dia da movimentação anterior: vale logo depois dela
    if (somenteData && diaEmBrasilia(data) === diaEmBrasilia(minimo)) {
      return { ok: true, data: new Date(Math.min(agora.getTime(), minimo.getTime() + 1000)), somente_data: true };
    }
    return {
      ok: false,
      erro: `A data da movimentação não pode ser anterior à movimentação anterior (${dataHoraBrasilia(minimo)}).`,
    };
  }
  return { ok: true, data, somente_data: somenteData };
}

// ---------------------------------------------------------------------------
// Prazo em dias úteis
// ---------------------------------------------------------------------------

/** Fim do prazo de N dias úteis contados do envio (exclui o dia do começo — art. 183). Sem prazo → null. */
export function prazoDaTramitacao(inicio: Date, diasUteis: number | null | undefined, cal?: CalendarioDiasUteis): Date | null {
  const n = Math.floor(Number(diasUteis) || 0);
  if (n <= 0) return null;
  return fimDoPrazoEmDiasUteis(inicio, n, cal);
}

/**
 * Situação do prazo agora: dias úteis restantes (0 = vence hoje; negativo =
 * dias úteis de atraso) e se já venceu.
 */
export function situacaoDoPrazo(
  prazo: Date | string | null | undefined,
  agora: Date,
  cal?: CalendarioDiasUteis,
): { dias_uteis_restantes: number | null; vencido: boolean } {
  if (!prazo) return { dias_uteis_restantes: null, vencido: false };
  const p = new Date(prazo);
  if (agora.getTime() <= p.getTime()) return { dias_uteis_restantes: diasUteisEntre(agora, p, cal), vencido: false };
  return { dias_uteis_restantes: -diasUteisEntre(p, agora, cal), vencido: true };
}

export type EventoPrazo = 'VESPERA' | 'VENCIDO';

/**
 * Aviso de prazo devido agora (job diário; idempotente pelos carimbos):
 *  - VENCIDO: passou do fim do prazo e ainda não foi avisado;
 *  - VÉSPERA: falta 1 dia útil (ou vence hoje) e ainda não foi avisado.
 * Só para o processo que ainda está no destino (PENDENTE/RECEBIDA).
 */
export function avisoDePrazoDevido(
  t: { status: string; data_prazo?: Date | string | null; aviso_vespera_em?: Date | string | null; aviso_vencido_em?: Date | string | null },
  agora: Date,
  cal?: CalendarioDiasUteis,
): EventoPrazo | null {
  if (!t.data_prazo || !['PENDENTE', 'RECEBIDA'].includes(t.status)) return null;
  const s = situacaoDoPrazo(t.data_prazo, agora, cal);
  if (s.vencido) return t.aviso_vencido_em ? null : 'VENCIDO';
  if ((s.dias_uteis_restantes ?? 99) <= 1) return t.aviso_vespera_em ? null : 'VESPERA';
  return null;
}

// ---------------------------------------------------------------------------
// Despacho padrão e textos
// ---------------------------------------------------------------------------

/** "Encaminhe-se ao(à) Contabilidade para a reserva orçamentária." */
export function despachoPadrao(destino: string, finalidade?: string | null): string {
  const f = String(finalidade ?? '').trim().replace(/[.;\s]+$/, '');
  const alvo = String(destino || 'setor de destino').trim();
  if (!f) return `Encaminhe-se ao(à) ${alvo} para as providências de sua competência.`;
  return `Encaminhe-se ao(à) ${alvo} ${/^(para|a fim|com vistas)\b/i.test(f) ? f : `para ${f}`}.`;
}

/** Posse inicial (F3): "Autue-se e encaminhe-se ao(à) Compras para a pesquisa de preços." */
export function despachoDeAutuacao(destino: string, finalidade?: string | null): string {
  return `Autue-se e e${despachoPadrao(destino, finalidade).slice(1)}`;
}

/** "20/09/2026 às 14:05" no horário de Brasília (UTC-3 fixo). */
export function dataHoraBrasilia(d: Date | string): string {
  const b = new Date(new Date(d).getTime() - DESLOCAMENTO_BRASILIA_MS);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(b.getUTCDate())}/${p2(b.getUTCMonth() + 1)}/${b.getUTCFullYear()} às ${p2(b.getUTCHours())}:${p2(b.getUTCMinutes())}`;
}

/** "20/09/2026" no horário de Brasília. */
export function dataBrasilia(d: Date | string): string {
  return dataHoraBrasilia(d).split(' ')[0];
}

// ---------------------------------------------------------------------------
// Linha do tempo
// ---------------------------------------------------------------------------

export interface TramitacaoLinha {
  id: string;
  sequencia: number;
  de_setor_id?: string | null;
  de_setor_nome?: string | null;
  de_usuario_id?: string | null;
  de_usuario_nome?: string | null;
  para_setor_id?: string | null;
  para_setor_nome?: string | null;
  para_usuario_id?: string | null;
  para_usuario_nome?: string | null;
  despacho: string;
  finalidade?: string | null;
  prazo_dias?: number | null;
  prazo_dias_uteis?: number | null;
  data_prazo?: Date | string | null;
  status: string;
  data_envio: Date | string;
  data_ocorrencia?: Date | string | null;
  automatico?: boolean | null;
  devolucao_de_id?: string | null;
  lancado_posteriormente?: boolean | null;
  lancado_por_id?: string | null;
  lancado_por_nome?: string | null;
  data_recebimento?: Date | string | null;
  recebido_por_id?: string | null;
  recebido_por_nome?: string | null;
  recebimento_lancado_posteriormente?: boolean | null;
  recebimento_lancado_em?: Date | string | null;
  motivo_devolucao?: string | null;
  data_devolucao?: Date | string | null;
  despacho_arquivo?: string | null;
  folha_inicial?: number | null;
  folha_final?: number | null;
}

export type TipoEventoTramitacao = 'ENVIO' | 'DEVOLUCAO' | 'RECEBIMENTO';

export interface EventoLinhaDoTempo {
  tipo: TipoEventoTramitacao;
  tramitacao_id: string;
  sequencia: number;
  /** Quando OCORREU (data informada no lançamento posterior; senão, o registro). */
  data: string;
  de: { setor_id: string | null; setor_nome: string | null; usuario_id: string | null; usuario_nome: string | null };
  para: { setor_id: string | null; setor_nome: string | null; usuario_id: string | null; usuario_nome: string | null };
  /** Quem praticou o ato (enviou/devolveu/recebeu). */
  por: { id: string | null; nome: string | null };
  despacho: string | null;
  motivo: string | null;
  prazo: string | null;
  prazo_dias_uteis: number | null;
  automatico: boolean;
  lancado_posteriormente: boolean;
  /** Quando foi lançado no sistema (só no lançamento posterior). */
  lancado_em: string | null;
  lancado_por: { id: string | null; nome: string | null } | null;
  /** Folha do despacho nos autos (envio/devolução). */
  folha: { folha_inicial: number | null; folha_final: number | null; url: string } | null;
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

export function ehDevolucao(t: Pick<TramitacaoLinha, 'devolucao_de_id' | 'despacho'>): boolean {
  return !!t.devolucao_de_id || /^DEVOLU[CÇ][AÃ]O:/i.test(String(t.despacho ?? ''));
}

/** Momento efetivo do envio (lançamento posterior: a data em que ocorreu). */
export function momentoDoEnvio(t: Pick<TramitacaoLinha, 'data_ocorrencia' | 'data_envio'>): Date {
  return new Date(t.data_ocorrencia ?? t.data_envio);
}

/**
 * Linha do tempo cronológica: cada envio (ou devolução) e cada recebimento,
 * com despacho e o link da folha. A devolução aparece UMA vez — pelo
 * registro de volta (que leva o despacho "DEVOLUÇÃO: motivo").
 */
export function montarLinhaDoTempo(tramitacoes: TramitacaoLinha[], urlDaFolha: (id: string) => string): EventoLinhaDoTempo[] {
  const eventos: Array<EventoLinhaDoTempo & { _ordem: number }> = [];
  for (const t of tramitacoes) {
    const devolucao = ehDevolucao(t);
    const de = { setor_id: t.de_setor_id ?? null, setor_nome: t.de_setor_nome ?? null, usuario_id: t.de_usuario_id ?? null, usuario_nome: t.de_usuario_nome ?? null };
    const para = { setor_id: t.para_setor_id ?? null, setor_nome: t.para_setor_nome ?? null, usuario_id: t.para_usuario_id ?? null, usuario_nome: t.para_usuario_nome ?? null };
    eventos.push({
      tipo: devolucao ? 'DEVOLUCAO' : 'ENVIO',
      tramitacao_id: t.id,
      sequencia: t.sequencia,
      data: momentoDoEnvio(t).toISOString(),
      de,
      para,
      por: { id: t.de_usuario_id ?? null, nome: t.de_usuario_nome ?? null },
      despacho: t.despacho ?? null,
      motivo: devolucao ? String(t.despacho ?? '').replace(/^DEVOLU[CÇ][AÃ]O:\s*/i, '') || null : null,
      prazo: iso(t.data_prazo),
      prazo_dias_uteis: t.prazo_dias_uteis ?? null,
      automatico: !!t.automatico,
      lancado_posteriormente: !!t.lancado_posteriormente,
      lancado_em: t.lancado_posteriormente ? iso(t.data_envio) : null,
      lancado_por: t.lancado_posteriormente ? { id: t.lancado_por_id ?? null, nome: t.lancado_por_nome ?? null } : null,
      folha: t.despacho_arquivo ? { folha_inicial: t.folha_inicial ?? null, folha_final: t.folha_final ?? null, url: urlDaFolha(t.id) } : null,
      _ordem: 0,
    });
    if (t.data_recebimento) {
      eventos.push({
        tipo: 'RECEBIMENTO',
        tramitacao_id: t.id,
        sequencia: t.sequencia,
        data: new Date(t.data_recebimento).toISOString(),
        de,
        para,
        por: { id: t.recebido_por_id ?? null, nome: t.recebido_por_nome ?? null },
        despacho: null,
        motivo: null,
        prazo: iso(t.data_prazo),
        prazo_dias_uteis: t.prazo_dias_uteis ?? null,
        automatico: false,
        lancado_posteriormente: !!t.recebimento_lancado_posteriormente,
        lancado_em: t.recebimento_lancado_posteriormente ? iso(t.recebimento_lancado_em) : null,
        lancado_por: t.recebimento_lancado_posteriormente ? { id: t.recebido_por_id ?? null, nome: t.recebido_por_nome ?? null } : null,
        folha: null,
        _ordem: 1,
      });
    }
  }
  return eventos
    .sort((a, b) => a.data.localeCompare(b.data) || a.sequencia - b.sequencia || a._ordem - b._ordem)
    .map(({ _ordem, ...e }) => e);
}

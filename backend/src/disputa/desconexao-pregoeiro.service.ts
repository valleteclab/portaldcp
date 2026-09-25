import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, EntityManager, In } from 'typeorm';
import { EventoSessao, TipoEvento } from '../sessao/entities/evento-sessao.entity';
import { SessaoDisputa, StatusSessao } from '../sessao/entities/sessao-disputa.entity';
import { ItemLicitacao, StatusDisputaItem } from '../itens/entities/item-licitacao.entity';
import { EstadoModoItem } from './entities/estado-modo-item.entity';
import { LoteLicitacao } from '../lotes/entities/lote-licitacao.entity';
import { PADROES_MODOS, desconexaoExcedida, motivoRetomadaInvalida } from './modos-disputa';
import { licitacaoEstaAtiva } from '../sessao/licitacao-ativa';

/**
 * ============================================================================
 * DESCONEXÃO DO AGENTE DE CONTRATAÇÃO (IN SEGES 73/2022, art. 27)
 * ============================================================================
 *
 *  art. 27: desconectado o sistema para o agente na etapa de lances, e
 *    permanecendo acessível aos licitantes, os lances continuam sendo recebidos;
 *  §1º: se a desconexão persistir por MAIS DE 10 MINUTOS, a sessão é suspensa
 *    e só reinicia decorridas 24 HORAS da comunicação do fato aos
 *    participantes no sítio eletrônico.
 *
 * COMO A DESCONEXÃO É DETECTADA (decisão documentada): pelo sinal explícito do
 * socket da sala. O gateway `/disputa` avisa `pregoeiroEntrou` quando um
 * cliente do órgão dono entra na sala e `pregoeiroSaiu` quando o socket cai.
 * Quando a sessão fica SEM nenhum socket de pregoeiro, começa a contar o
 * prazo de carência; o verificador (cron a cada 5 s) suspende a sessão se ela
 * passar de 10 min SEM reconexão E houver item na etapa de lances.
 *  - Só conta depois que o pregoeiro esteve conectado por socket nesta
 *    instância (quem conduz só por REST nunca é considerado "desconectado").
 *  - O estado é em memória, por instância do backend: com várias réplicas é
 *    preciso sala com afinidade (sticky) ou trocar o mapa por Redis/tabela.
 *    Um reinício do backend zera a contagem (a favor da continuidade).
 *
 * RETOMADA: o pregoeiro COMUNICA a data de reinício aos participantes
 * (`agendarRetomada`: evento + mensagem no chat), com antecedência mínima de
 * 24 h; `exigirRetomadaPermitida` (usado por todos os caminhos de retomar)
 * recusa a retomada sem comunicação ou antes da data. Ao retomar, os relógios
 * dos itens em lances recomeçam do início da fase (a sessão foi "reiniciada").
 */

interface Presenca {
  sockets: Set<string>;
  desconectadoEm: number | null;
}

/** Tipo gravado em `dados_adicionais.tipo` da suspensão por desconexão. */
export const SUSPENSAO_DESCONEXAO = 'DESCONEXAO_AGENTE';
export const ATO_AGENDAMENTO_RETOMADA = 'AGENDAMENTO_RETOMADA';

type Emissor = (sala: string, evento: string, payload: any) => void;

@Injectable()
export class DesconexaoPregoeiroService {
  private readonly logger = new Logger(DesconexaoPregoeiroService.name);
  private readonly presencas = new Map<string, Presenca>();
  private emissor: Emissor | null = null;
  /** Limite em minutos (IN 73 art. 27 §1º: 10). */
  limiteMinutos: number = PADROES_MODOS.desconexaoLimiteMinutos;

  constructor(private readonly dataSource: DataSource) {}

  /** O gateway entrega a função de difusão (evita ciclo de injeção). */
  definirEmissor(emissor: Emissor) {
    this.emissor = emissor;
  }

  // ------------------------------------------------------------------ presença

  pregoeiroEntrou(sessaoId: string, socketId: string) {
    const p = this.presencas.get(sessaoId) ?? { sockets: new Set<string>(), desconectadoEm: null };
    p.sockets.add(socketId);
    p.desconectadoEm = null;
    this.presencas.set(sessaoId, p);
  }

  pregoeiroSaiu(sessaoId: string, socketId: string, agora: number = Date.now()) {
    const p = this.presencas.get(sessaoId);
    if (!p) return;
    p.sockets.delete(socketId);
    if (p.sockets.size === 0 && p.desconectadoEm === null) p.desconectadoEm = agora;
  }

  /** Para testes e monitoramento. */
  estado(sessaoId: string): { conectados: number; desconectadoEm: Date | null } | null {
    const p = this.presencas.get(sessaoId);
    return p ? { conectados: p.sockets.size, desconectadoEm: p.desconectadoEm ? new Date(p.desconectadoEm) : null } : null;
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async verificarDesconexoes(agora: number = Date.now()): Promise<string[]> {
    const suspensas: string[] = [];
    for (const [sessaoId, p] of this.presencas) {
      if (!desconexaoExcedida(p.desconectadoEm, agora, this.limiteMinutos)) continue;
      try {
        if (await this.suspenderPorDesconexao(sessaoId, new Date(p.desconectadoEm!))) suspensas.push(sessaoId);
      } catch (e: any) {
        this.logger.error(`Desconexão do agente (sessão ${sessaoId}): ${e?.message ?? e}`);
      }
      // Suspensa ou fora da etapa de lances: a contagem acaba aqui
      this.presencas.delete(sessaoId);
    }
    return suspensas;
  }

  /** Suspende a sessão se ela estiver na etapa de lances. Idempotente. */
  private async suspenderPorDesconexao(sessaoId: string, desconectadoEm: Date): Promise<boolean> {
    const r = await this.dataSource.transaction(async (m) => {
      const sessao = await m.findOne(SessaoDisputa, { where: { id: sessaoId }, lock: { mode: 'pessimistic_write' } });
      if (!sessao || sessao.status !== StatusSessao.MODO_ABERTO) return null;
      if (!(await licitacaoEstaAtiva(m, sessao.licitacao_id))) return null;
      // Dispensa eletrônica (IN 67/2021 — modo JANELA): não há regra de suspensão por desconexão
      const [lic] = await m.query(`SELECT modalidade::text AS modalidade FROM licitacoes WHERE id = $1`, [sessao.licitacao_id]);
      if (!desconexaoSuspendeModalidade(lic?.modalidade)) return null;
      const [{ n }] = await m.query(
        `SELECT COUNT(*)::int AS n FROM itens_licitacao WHERE licitacao_id = $1 AND status_disputa::text IN ('EM_DISPUTA','TEMPO_ALEATORIO')`,
        [sessao.licitacao_id],
      );
      if (!Number(n)) return null;
      const agora = new Date();
      await m.update(SessaoDisputa, sessaoId, {
        status: StatusSessao.SUSPENSA,
        motivo_suspensao: `${SUSPENSAO_DESCONEXAO}: desconexão do agente de contratação por mais de ${this.limiteMinutos} minutos (IN SEGES 73/2022, art. 27 §1º)`,
      });
      await m.save(
        m.create(EventoSessao, {
          sessao_id: sessaoId,
          tipo: TipoEvento.SESSAO_SUSPENSA,
          descricao:
            `Sessão suspensa automaticamente: o agente de contratação ficou desconectado por mais de ${this.limiteMinutos} minutos ` +
            'durante a etapa de lances (IN SEGES 73/2022, art. 27 §1º).',
          dados_adicionais: { tipo: SUSPENSAO_DESCONEXAO, desconectado_em: desconectadoEm.toISOString(), suspensa_em: agora.toISOString() },
          usuario_nome: 'SISTEMA',
          is_sistema: true,
        }),
      );
      const mensagem = await m.save(
        m.create(EventoSessao, {
          sessao_id: sessaoId,
          tipo: TipoEvento.MENSAGEM_SISTEMA,
          descricao:
            `A sessão pública foi SUSPENSA: o sistema ficou desconectado para o agente de contratação por mais de ${this.limiteMinutos} minutos ` +
            'durante a etapa de lances. Ela só será reiniciada decorridas 24 horas da comunicação da data de reinício aos participantes, ' +
            'que será feita nesta sala (IN SEGES 73/2022, art. 27 §1º). Os lances já registrados estão preservados.',
          dados_adicionais: { tipo: SUSPENSAO_DESCONEXAO },
          usuario_nome: 'SISTEMA',
          is_sistema: true,
        }),
      );
      return { mensagem, motivo: sessao.motivo_suspensao };
    });
    if (!r) return false;
    this.logger.warn(`Sessão ${sessaoId} suspensa por desconexão do agente (IN 73 art. 27 §1º)`);
    this.difundir(sessaoId, 'sessao_suspensa', { motivo: SUSPENSAO_DESCONEXAO, justificativa: r.mensagem.descricao });
    this.difundirMensagem(sessaoId, r.mensagem);
    return true;
  }

  // ------------------------------------------------------------------ retomada

  /**
   * Comunicação da data de reinício aos participantes (art. 27 §1º): evento +
   * mensagem no chat. A data precisa estar a pelo menos 24 h da comunicação.
   */
  async agendarRetomada(sessaoId: string, retomadaEm: Date, ator: { tipo: string; id: string | null }): Promise<{ retomadaEm: string; mensagem: EventoSessao }> {
    const agora = new Date();
    if (!(retomadaEm instanceof Date) || Number.isNaN(retomadaEm.getTime())) throw new BadRequestException('Data de retomada inválida');
    const motivo = motivoRetomadaInvalida(retomadaEm, agora);
    if (motivo) throw new BadRequestException(motivo);
    const mensagem = await this.dataSource.transaction(async (m) => {
      const sessao = await m.findOne(SessaoDisputa, { where: { id: sessaoId }, lock: { mode: 'pessimistic_write' } });
      if (!sessao) throw new NotFoundException('Sessão não encontrada');
      const susp = await suspensaoPorDesconexaoVigente(m, sessaoId);
      if (sessao.status !== StatusSessao.SUSPENSA || !susp) {
        throw new ConflictException('A sessão não está suspensa por desconexão do agente de contratação.');
      }
      const quando = retomadaEm.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
      return m.save(
        m.create(EventoSessao, {
          sessao_id: sessaoId,
          tipo: TipoEvento.MENSAGEM_SISTEMA,
          descricao:
            `COMUNICADO: a sessão pública suspensa por desconexão do agente de contratação será reiniciada em ${quando} (horário de Brasília), ` +
            'conforme o art. 27 §1º da IN SEGES 73/2022.',
          dados_adicionais: {
            ato: ATO_AGENDAMENTO_RETOMADA,
            retomada_em: retomadaEm.toISOString(),
            comunicado_em: agora.toISOString(),
            ator,
          },
          usuario_nome: 'PREGOEIRO',
          is_sistema: false,
        }),
      );
    });
    this.difundirMensagem(sessaoId, mensagem);
    this.difundir(sessaoId, 'retomada_agendada', { retomadaEm: retomadaEm.toISOString() });
    return { retomadaEm: retomadaEm.toISOString(), mensagem };
  }

  // ------------------------------------------------------------------ difusão

  private difundir(sessaoId: string, evento: string, payload: any) {
    try {
      this.emissor?.(`sessao:${sessaoId}`, evento, payload);
    } catch (e: any) {
      this.logger.warn(`Difusão de ${evento} falhou: ${e?.message ?? e}`);
    }
  }

  private difundirMensagem(sessaoId: string, e: EventoSessao) {
    this.difundir(sessaoId, 'nova_mensagem', {
      id: e.id,
      tipo: 'SISTEMA',
      remetente: e.usuario_nome || 'SISTEMA',
      conteudo: e.descricao,
      dataHora: e.created_at,
    });
  }
}

/**
 * A regra do art. 27 da IN SEGES 73/2022 vale para a sessão pública de
 * pregão/concorrência. A dispensa eletrônica (IN 67/2021, janela de lances)
 * não tem regra de suspensão por desconexão — nunca é suspensa por aqui.
 */
export function desconexaoSuspendeModalidade(modalidade: string | null | undefined): boolean {
  return !!modalidade && modalidade !== 'DISPENSA_ELETRONICA' && modalidade !== 'INEXIGIBILIDADE';
}

// ============================================================================
// Funções usadas por TODOS os caminhos de retomada (disputa e sessao)
// ============================================================================

/** A suspensão vigente da sessão é por desconexão do agente? Devolve o evento. */
export async function suspensaoPorDesconexaoVigente(m: EntityManager, sessaoId: string): Promise<{ id: string; created_at: Date } | null> {
  const [ultima] = await m.query(
    `SELECT id, created_at, dados_adicionais FROM eventos_sessao
      WHERE sessao_id = $1 AND tipo::text IN ('SESSAO_SUSPENSA','SESSAO_RETOMADA')
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [sessaoId],
  );
  if (!ultima || ultima.dados_adicionais?.tipo !== SUSPENSAO_DESCONEXAO) return null;
  return { id: ultima.id, created_at: new Date(ultima.created_at) };
}

/**
 * Recusa (409) a retomada de sessão suspensa por desconexão sem a comunicação
 * da data aos participantes ou antes dela (IN 73 art. 27 §1º). Devolve
 * `porDesconexao` para o chamador reiniciar os relógios.
 */
export async function exigirRetomadaPermitida(m: EntityManager, sessaoId: string, agora: Date = new Date()): Promise<{ porDesconexao: boolean }> {
  const susp = await suspensaoPorDesconexaoVigente(m, sessaoId);
  if (!susp) return { porDesconexao: false };
  const agendamentos: any[] = await m.query(
    `SELECT dados_adicionais FROM eventos_sessao
      WHERE sessao_id = $1 AND tipo::text = 'MENSAGEM_SISTEMA' AND dados_adicionais->>'ato' = $2 AND created_at >= $3
      ORDER BY created_at DESC LIMIT 1`,
    [sessaoId, ATO_AGENDAMENTO_RETOMADA, susp.created_at],
  );
  const ag = agendamentos[0]?.dados_adicionais;
  if (!ag?.retomada_em) {
    throw new ConflictException(
      'Sessão suspensa por desconexão do agente de contratação: comunique aos participantes a data de reinício ' +
        '(com antecedência mínima de 24 horas) antes de retomar (IN SEGES 73/2022, art. 27 §1º).',
    );
  }
  const retomadaEm = new Date(ag.retomada_em);
  const invalida = motivoRetomadaInvalida(retomadaEm, new Date(ag.comunicado_em));
  if (invalida) throw new ConflictException(invalida);
  if (agora.getTime() < retomadaEm.getTime()) {
    throw new ConflictException(
      `A sessão só pode ser reiniciada a partir de ${retomadaEm.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} ` +
        '(24 horas após a comunicação aos participantes — IN SEGES 73/2022, art. 27 §1º).',
    );
  }
  return { porDesconexao: true };
}

/**
 * Relógios das UNIDADES em lances (itens E lotes) ao retomar uma sessão
 * suspensa — helper ÚNICO para todos os caminhos de retomada:
 *  - suspensão por DESCONEXÃO do agente (art. 27 §1º — a sessão é
 *    "reiniciada"): cada unidade recomeça a fase em que estava (aberta:
 *    tempo inicial do zero; aleatório: novo início; fechada: prazo integral);
 *  - qualquer outra suspensão: os relógios são DESLOCADOS pela duração da
 *    pausa (o tempo restante de cada fase é preservado — antes, ao retomar,
 *    o relógio já vinha vencido e a unidade encerrava na hora).
 * Os lances registrados valem sempre. Devolve quantas unidades foram ajustadas.
 */
export async function retomarRelogiosDaSessao(
  m: EntityManager,
  sessaoId: string,
  licitacaoId: string,
  porDesconexao: boolean,
  agora: Date = new Date(),
): Promise<number> {
  let pausaMs = 0;
  if (!porDesconexao) {
    const [susp] = await m.query(
      `SELECT created_at FROM eventos_sessao WHERE sessao_id = $1 AND tipo::text = 'SESSAO_SUSPENSA' ORDER BY created_at DESC, id DESC LIMIT 1`,
      [sessaoId],
    );
    if (!susp) return 0;
    pausaMs = Math.max(0, agora.getTime() - new Date(susp.created_at).getTime());
    if (!pausaMs) return 0;
  }
  const mais = (d: Date | string | null | undefined) => (d ? new Date(new Date(d).getTime() + pausaMs) : null);
  const emLances = [StatusDisputaItem.EM_DISPUTA, StatusDisputaItem.TEMPO_ALEATORIO];
  const unidades: Array<{ entidade: any; u: any }> = [
    ...(await m.find(ItemLicitacao, { where: { licitacao_id: licitacaoId, status_disputa: In(emLances) } })).map((u) => ({ entidade: ItemLicitacao, u })),
    ...(await m.find(LoteLicitacao, { where: { licitacao_id: licitacaoId, status_disputa: In(emLances) } })).map((u) => ({ entidade: LoteLicitacao, u })),
  ];
  let n = 0;
  for (const { entidade, u } of unidades) {
    const est = await m.findOne(EstadoModoItem, { where: { item_id: u.id } });
    if (u.status_disputa === StatusDisputaItem.EM_DISPUTA) {
      await m.update(entidade, u.id, porDesconexao
        ? { disputa_iniciada_em: agora, ultimo_lance_em: agora }
        : { disputa_iniciada_em: mais(u.disputa_iniciada_em), ultimo_lance_em: mais(u.ultimo_lance_em) });
      if (est?.fase === 'FECHADA' && est.fase_iniciada_em && est.fase_termina_em) {
        const dur = new Date(est.fase_termina_em).getTime() - new Date(est.fase_iniciada_em).getTime();
        await m.update(EstadoModoItem, { item_id: u.id }, porDesconexao
          ? { fase_iniciada_em: agora, fase_termina_em: new Date(agora.getTime() + dur) }
          : { fase_iniciada_em: mais(est.fase_iniciada_em), fase_termina_em: mais(est.fase_termina_em) });
      }
    } else {
      await m.update(entidade, u.id, { inicio_tempo_aleatorio: porDesconexao ? agora : mais(u.inicio_tempo_aleatorio) });
      if (est) {
        await m.update(EstadoModoItem, { item_id: u.id }, {
          aleatorio_iniciado_em: porDesconexao ? agora : mais(est.aleatorio_iniciado_em),
        });
      }
    }
    // Itens do lote espelham o relógio do lote
    if (entidade === LoteLicitacao) {
      const [lote] = await m.query(`SELECT disputa_iniciada_em, ultimo_lance_em, inicio_tempo_aleatorio FROM lotes_licitacao WHERE id = $1`, [u.id]);
      await m.update(ItemLicitacao, { lote_id: u.id }, {
        disputa_iniciada_em: lote.disputa_iniciada_em,
        ultimo_lance_em: lote.ultimo_lance_em,
        inicio_tempo_aleatorio: lote.inicio_tempo_aleatorio,
      });
    }
    n++;
  }
  return n;
}

/** @deprecated use `retomarRelogiosDaSessao` (mantido para chamadas antigas). */
export async function reiniciarRelogiosAposDesconexao(m: EntityManager, licitacaoId: string, agora: Date = new Date()): Promise<number> {
  return retomarRelogiosDaSessao(m, '', licitacaoId, true, agora);
}

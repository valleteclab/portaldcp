import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { SessaoDisputa, StatusSessao, EtapaSessao } from '../sessao/entities/sessao-disputa.entity';
import { EventoSessao, TipoEvento } from '../sessao/entities/evento-sessao.entity';
import { ItemLicitacao, StatusDisputaItem } from '../itens/entities/item-licitacao.entity';
import { LoteLicitacao } from '../lotes/entities/lote-licitacao.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { Lance } from './entities/lance.entity';
import { AnonimizacaoService } from './anonimizacao.service';
import { ParametrosDisputaService } from './parametros-disputa.service';
import { ParametrosDisputa } from './parametros-disputa';
import { BaseLance, LanceRecusado, OrigemLance, centavos, referenciaNaBase, validarLance } from './modelo-lance';
import { ElegibilidadeLote, ItemPropostaLote, PropostaItemFornecedor, elegibilidadeNoLote, ratearLanceLote } from './rateio-lote';
import { ESTADO_REINICIADO, colunaDoStatus, estadoAoIniciar, podeExcluirLanceDireto, relogioDaUnidade } from './unidade-disputa';
import { idAnonimo } from './sigilo-disputa.service';
import { TransicoesService } from '../licitacoes/transicoes/transicoes.service';
import { AtoLicitacao, AtorTransicao } from '../licitacoes/transicoes/transicoes.tipos';
import { exigirLicitacaoAtiva } from '../sessao/licitacao-ativa';
import { ehUuid } from '../auth/acesso/acesso-licitacao.service';
import type { ItemDisputa, LanceRegistrado, LancePainelCancelamento } from './disputa.service';
import { ModoDisputaService } from './modo-disputa.service';
import { DirecaoLance, ordemSql } from './modos-disputa';
import { motivoForaDoBeneficioMpe } from '../julgamento/me-epp/beneficio-mpe.sql';

/**
 * ============================================================================
 * MOTOR DE DISPUTA — UNIDADE LOTE (base TOTAL_LOTE; plano E2 item 5)
 * ============================================================================
 *
 * Mesmo motor, mesma tabela de lances, mesmas regras (`validarLance`), mesmo
 * relógio (`relogioDaUnidade`) — a diferença é a UNIDADE: o lote.
 *
 *  - Estado da disputa (status, tempos, melhor lance) em `lotes_licitacao`,
 *    colunas homônimas às do item (`unidade-disputa.ts`). Os itens do lote
 *    ESPELHAM o status (EM_DISPUTA/ENCERRADO) e o melhor valor do item (a
 *    parcela do vencedor): assim fim da etapa de lances, sigilo, adjudicação,
 *    homologação e ata — que leem item — funcionam sem caminho próprio.
 *  - Elegibilidade: só quem cotou TODOS os itens do lote (`rateio-lote.ts`).
 *  - Lance do lote = linha em `lances` com `lote_id` e `item_id` nulo + uma
 *    linha de RATEIO por item (`lance_lote_id` = lance do lote), com
 *    `valor` = valor global do lote e unitário/total rateados.
 *  - Trava pessimista no LOTE (a ordem da trava é a ordem de registro —
 *    regra de lances iguais), licitação ATIVA (FOR SHARE), códigos anônimos
 *    da sessão, exclusão do próprio lance (art. 21 §3º) e cancelamento pelo
 *    pregoeiro (art. 21 §4º) sempre do lance do lote e do seu rateio juntos.
 *
 * Quem chama: DisputaService (despacha pelo id da unidade / base do lance) e
 * DisputaTimerService (relógio). Nada aqui difunde por socket.
 * ============================================================================
 */

const STATUS_PROPOSTA_VALIDA = ['CLASSIFICADA', 'RECEBIDA'];

export interface ComandoLanceLote {
  sessaoId: string;
  loteId: string;
  /** SEMPRE do token. */
  fornecedorId: string;
  valor: number;
  ip?: string;
  origem?: OrigemLance;
}

interface PropostaNoLote {
  fornecedorId: string;
  nome: string;
  enviadaEm: number;
  itens: PropostaItemFornecedor[];
}

interface LinhaAtiva {
  id: string;
  fornecedor_id: string;
  fornecedor_nome: string | null;
  valor: string;
  origem: OrigemLance;
  created_at: Date;
}

export interface ResultadoEncerramentoLote {
  lote: LoteLicitacao;
  melhor: Lance | null;
  jaEstavaEncerrado: boolean;
}

/** Visão de leitura (sessão e se as identidades vão anonimizadas). */
export interface ContextoLeituraLote {
  sessaoId: string;
  anonimizar: boolean;
  anonimo: (fornecedorId: string) => Promise<{ fornecedorId: string; fornecedorNome: string }>;
}

const qtd = (v: unknown) => (Number(v) > 0 ? Number(v) : 1);

@Injectable()
export class DisputaLoteService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => AnonimizacaoService))
    private readonly anonimizacao: AnonimizacaoService,
    private readonly transicoes: TransicoesService,
    private readonly parametros: ParametrosDisputaService,
    private readonly modos: ModoDisputaService,
  ) {}

  // ==========================================================================
  // CONSULTAS BÁSICAS
  // ==========================================================================

  /** O id é de um lote? (a sala usa o mesmo campo para item e lote) */
  async ehLote(id: string | null | undefined, manager?: EntityManager): Promise<boolean> {
    if (!ehUuid(id)) return false;
    const m = manager ?? this.dataSource.manager;
    const r = await m.query(`SELECT 1 FROM lotes_licitacao WHERE id = $1`, [id]);
    return r.length > 0;
  }

  async buscarLote(id: string, manager?: EntityManager): Promise<LoteLicitacao | null> {
    if (!ehUuid(id)) return null;
    return (manager ?? this.dataSource.manager).findOne(LoteLicitacao, { where: { id } });
  }

  /** Lote do item (null se o item está solto ou não existe). */
  async loteDoItem(itemId: string, manager?: EntityManager): Promise<string | null> {
    if (!ehUuid(itemId)) return null;
    const r = await (manager ?? this.dataSource.manager).query(`SELECT lote_id FROM itens_licitacao WHERE id = $1`, [itemId]);
    return r[0]?.lote_id ?? null;
  }

  private itensDoLote(m: EntityManager, loteId: string): Promise<ItemLicitacao[]> {
    return m.find(ItemLicitacao, { where: { lote_id: loteId }, order: { numero_item: 'ASC' } });
  }

  private referenciaItens(itens: ItemLicitacao[]) {
    return itens.map((i) => ({ id: i.id, numero: i.numero_item, quantidade: qtd(i.quantidade) }));
  }

  /** Trava o lote (FOR UPDATE) com tempo-limite — a unidade de disputa. */
  private async travarLote(m: EntityManager, loteId: string): Promise<LoteLicitacao | null> {
    await m.query(`SET LOCAL lock_timeout = '10s'`);
    try {
      return await m.findOne(LoteLicitacao, { where: { id: loteId }, lock: { mode: 'pessimistic_write' } });
    } catch (e: any) {
      if (e?.code === '55P03') throw new ConflictException('A sala está ocupada processando outro ato neste lote. Tente novamente.');
      throw e;
    }
  }

  /**
   * Propostas VÁLIDAS (CLASSIFICADA/RECEBIDA) da licitação nos itens dados,
   * por fornecedor, em ordem de envio (desempate de propostas iguais).
   */
  private async propostasNosItens(
    m: EntityManager,
    licitacaoId: string,
    itemIds: string[],
    fornecedorId?: string,
  ): Promise<Map<string, PropostaNoLote>> {
    const mapa = new Map<string, PropostaNoLote>();
    if (!itemIds.length) return mapa;
    const rows: any[] = await m.query(
      `SELECT p.fornecedor_id::text AS fornecedor_id, f.razao_social, p.data_envio, p.created_at,
              pi.item_licitacao_id::text AS item_id, pi.valor_unitario, pi.valor_total
         FROM proposta_itens pi
         JOIN propostas p ON p.id = pi.proposta_id
         LEFT JOIN fornecedores f ON f.id::text = p.fornecedor_id::text
        WHERE p.licitacao_id = $1
          AND p.status::text = ANY($2::text[])
          AND pi.item_licitacao_id::text = ANY($3::text[])
          ${fornecedorId ? 'AND p.fornecedor_id::text = $4' : ''}
        ORDER BY COALESCE(p.data_envio, p.created_at) ASC, p.fornecedor_id`,
      fornecedorId ? [licitacaoId, STATUS_PROPOSTA_VALIDA, itemIds, fornecedorId] : [licitacaoId, STATUS_PROPOSTA_VALIDA, itemIds],
    );
    for (const r of rows) {
      const fid = String(r.fornecedor_id);
      if (!mapa.has(fid)) {
        mapa.set(fid, {
          fornecedorId: fid,
          nome: r.razao_social || 'Fornecedor',
          enviadaEm: new Date(r.data_envio ?? r.created_at ?? 0).getTime(),
          itens: [],
        });
      }
      const p = mapa.get(fid)!;
      if (!p.itens.some((i) => i.itemId === String(r.item_id))) {
        p.itens.push({ itemId: String(r.item_id), valor_unitario: r.valor_unitario, valor_total: r.valor_total });
      }
    }
    return mapa;
  }

  /** Elegibilidade do fornecedor no lote (cotou todos os itens). */
  async elegibilidade(loteId: string, fornecedorId: string, manager?: EntityManager): Promise<ElegibilidadeLote> {
    const m = manager ?? this.dataSource.manager;
    const lote = await this.buscarLote(loteId, m);
    if (!lote) return { elegivel: false, itensNaoCotados: [], itens: [], totalProposta: 0 };
    const itens = await this.itensDoLote(m, loteId);
    const propostas = await this.propostasNosItens(m, lote.licitacao_id, itens.map((i) => i.id), fornecedorId);
    return elegibilidadeNoLote(this.referenciaItens(itens), propostas.get(fornecedorId)?.itens ?? []);
  }

  /**
   * Direção do critério da licitação do lote (E7c): maior lance (leilão) ordena
   * DECRESCENTE — o "melhor" do lote é o maior valor; os demais, crescente.
   */
  private async direcaoDoLote(m: EntityManager, loteId: string): Promise<DirecaoLance> {
    const [l] = await m.query(`SELECT licitacao_id FROM lotes_licitacao WHERE id = $1`, [loteId]);
    return l ? this.modos.direcao(String(l.licitacao_id), m) : 'MENOR';
  }

  private async lancesAtivosDoLote(m: EntityManager, loteId: string): Promise<LinhaAtiva[]> {
    const direcao = await this.direcaoDoLote(m, loteId);
    return m.query(
      // Lance final fechado: sigiloso até o fim do prazo (IN 73 art. 24 §2º) — fora do melhor/ranking
      `SELECT id, fornecedor_id, fornecedor_nome, valor, origem, created_at FROM lances l
        WHERE lote_id = $1 AND item_id IS NULL AND cancelado = false AND ${ModoDisputaService.SQL_LANCE_LOTE_VISIVEL}
        ORDER BY valor ${ordemSql(direcao)}, created_at ASC`,
      [loteId],
    );
  }

  private evento(m: EntityManager, dados: Partial<EventoSessao>) {
    return m.save(m.create(EventoSessao, { usuario_nome: 'SISTEMA', is_sistema: true, ...dados }));
  }

  // ==========================================================================
  // GRAVAÇÃO: lance do lote + rateio por item
  // ==========================================================================

  private async gravarLance(
    m: EntityManager,
    d: {
      lote: LoteLicitacao;
      itensProposta: ItemPropostaLote[];
      fornecedorId: string;
      fornecedorNome: string;
      valor: number;
      origem: OrigemLance;
      ip: string | null;
      criadoEm: Date;
    },
  ): Promise<Lance> {
    let parcelas;
    try {
      parcelas = ratearLanceLote(d.itensProposta, d.valor);
    } catch (e: any) {
      throw new LanceRecusado(e?.message ?? 'Rateio do lance do lote inválido', 'RATEIO_INVALIDO');
    }
    const comum = {
      licitacao_id: d.lote.licitacao_id,
      lote_id: d.lote.id,
      fornecedor_id: d.fornecedorId,
      fornecedor_nome: d.fornecedorNome,
      valor: d.valor,
      base_lance: BaseLance.TOTAL_LOTE,
      origem: d.origem,
      ip_origem: d.ip,
      cancelado: false,
      created_at: d.criadoEm,
    };
    const pai = await m.save(
      m.create(Lance, { ...comum, item_id: null as any, lance_lote_id: null, valor_total: d.valor, valor_unitario: null } as Partial<Lance>),
    );
    await m.save(
      parcelas.map((p) =>
        m.create(Lance, {
          ...comum,
          item_id: p.itemId,
          lance_lote_id: pai.id,
          valor_total: p.valor_total,
          valor_unitario: p.valor_unitario,
        } as Partial<Lance>),
      ),
    );
    return pai;
  }

  /**
   * Melhor lance do lote e, nos itens, a PARCELA do vencedor (o que o item
   * valeria se a disputa terminasse agora).
   */
  private async sincronizarMelhor(m: EntityManager, loteId: string): Promise<LinhaAtiva | null> {
    const [melhor] = await this.lancesAtivosDoLote(m, loteId);
    await m.update(LoteLicitacao, loteId, {
      melhor_lance_valor: melhor ? Number(melhor.valor) : null,
      melhor_lance_fornecedor_id: melhor ? melhor.fornecedor_id : null,
    });
    if (!melhor) {
      await m.update(ItemLicitacao, { lote_id: loteId }, { melhor_lance_valor: null as any, melhor_lance_fornecedor_id: null as any });
      return null;
    }
    const parcelas: Array<{ item_id: string; valor_total: string }> = await m.query(
      `SELECT item_id, valor_total FROM lances WHERE lance_lote_id = $1`,
      [melhor.id],
    );
    for (const p of parcelas) {
      await m.update(ItemLicitacao, p.item_id, {
        melhor_lance_valor: Number(p.valor_total),
        melhor_lance_fornecedor_id: melhor.fornecedor_id,
      });
    }
    return melhor;
  }

  /**
   * Proposta → lance de origem PROPOSTA do lote (valor = soma dos totais da
   * proposta nos itens do lote), só para quem cotou todos os itens. Roda com
   * o lote travado; checagem + índice único parcial `UQ_lances_lote_proposta_ativa`.
   */
  private async converterPropostas(m: EntityManager, lote: LoteLicitacao, itens: ItemLicitacao[], sessaoId: string): Promise<number> {
    const propostas = [...(await this.propostasNosItens(m, lote.licitacao_id, itens.map((i) => i.id))).values()].sort(
      (a, b) => a.enviadaEm - b.enviadaEm,
    );
    const ref = this.referenciaItens(itens);
    const base = Date.now();
    let criados = 0;
    let inelegiveis = 0;
    for (const p of propostas) {
      const e = elegibilidadeNoLote(ref, p.itens);
      if (!e.elegivel) {
        inelegiveis++;
        continue;
      }
      // Lote exclusivo/cota de ME/EPP: proposta de quem não é ME/EPP não entra na disputa (art. 48)
      if (await motivoForaDoBeneficioMpe(m, lote.id, p.fornecedorId)) continue;
      const existe = await m.count(Lance, {
        where: { lote_id: lote.id, item_id: IsNull(), fornecedor_id: p.fornecedorId, origem: OrigemLance.PROPOSTA, cancelado: false },
      });
      if (existe) continue;
      await this.gravarLance(m, {
        lote,
        itensProposta: e.itens,
        fornecedorId: p.fornecedorId,
        fornecedorNome: p.nome,
        valor: e.totalProposta,
        origem: OrigemLance.PROPOSTA,
        ip: 'SISTEMA',
        // ordem de envio preservada (desempate de propostas de mesmo valor)
        criadoEm: new Date(base + criados),
      });
      criados++;
    }
    if (inelegiveis > 0) {
      await this.evento(m, {
        sessao_id: sessaoId,
        tipo: TipoEvento.MENSAGEM_SISTEMA,
        descricao:
          `Lote ${lote.numero}: ${inelegiveis} proposta(s) não cotou(aram) todos os itens do lote e não participa(m) ` +
          `da disputa deste lote (o edital exige a cotação de todos os itens do grupo).`,
        dados_adicionais: { lote_id: lote.id, inelegiveis },
      });
    }
    return criados;
  }

  // ==========================================================================
  // INICIAR
  // ==========================================================================

  /**
   * Inicia a disputa dos lotes indicados (ids de lote ou de itens — um item
   * leva ao seu lote). Todo item da licitação precisa estar em algum lote.
   * Devolve quantos lotes e quantos itens (dos lotes) entraram em disputa.
   */
  async iniciar(
    sessao: SessaoDisputa,
    ids: string[],
    ator: AtorTransicao,
  ): Promise<{ itensIniciados: number; lotesIniciados: number; encerrarNaAbertura: string[] }> {
    const licitacaoId = sessao.licitacao_id;
    // Todos os modos do art. 56 valem para o lote (estratégias do ModoDisputaService, E2.4)
    const encerrarNaAbertura: string[] = [];
    const soltos: Array<{ numero_item: number }> = await this.dataSource.query(
      `SELECT numero_item FROM itens_licitacao WHERE licitacao_id = $1 AND lote_id IS NULL ORDER BY numero_item`,
      [licitacaoId],
    );
    if (soltos.length) {
      throw new ConflictException(
        `Disputa por lote: o(s) item(ns) ${soltos.map((s) => s.numero_item).join(', ')} não pertence(m) a nenhum lote. ` +
          `Vincule todos os itens a um lote antes de iniciar a disputa.`,
      );
    }

    const alvo = new Set<string>();
    for (const id of ids) {
      if (!ehUuid(id)) continue;
      const r: Array<{ id: string }> = await this.dataSource.query(
        `SELECT id::text AS id FROM lotes_licitacao WHERE id = $1 AND licitacao_id = $2
         UNION SELECT lote_id::text FROM itens_licitacao WHERE id = $1 AND licitacao_id = $2 AND lote_id IS NOT NULL`,
        [id, licitacaoId],
      );
      for (const x of r) alvo.add(x.id);
    }
    const aIniciar = (await this.dataSource.manager.find(LoteLicitacao, { where: { licitacao_id: licitacaoId }, order: { numero: 'ASC' } })).filter(
      (l) => alvo.has(l.id) && (!l.status_disputa || l.status_disputa === StatusDisputaItem.AGUARDANDO),
    );
    if (!aIniciar.length) return { itensIniciados: 0, lotesIniciados: 0, encerrarNaAbertura };

    // Primeira unidade em disputa = abertura da etapa de lances (idempotente)
    await this.transicoes.executar(licitacaoId, AtoLicitacao.INICIAR_DISPUTA, {
      ator,
      ignorarSeJaAplicado: true,
      registro: { origem: 'disputa/lote', sessao_id: sessao.id },
    });
    const participantes: Array<{ fornecedor_id: string }> = await this.dataSource.query(
      `SELECT DISTINCT fornecedor_id FROM propostas
        WHERE licitacao_id = $1 AND status IN ('CLASSIFICADA','RECEBIDA') ORDER BY fornecedor_id`,
      [licitacaoId],
    );
    await this.anonimizacao.atribuirCodigos(sessao.id, participantes.map((p) => String(p.fornecedor_id)));

    let lotesIniciados = 0;
    let itensIniciados = 0;
    for (const alvoLote of aIniciar) {
      const n = await this.dataSource.transaction(async (m) => {
        const lote = await this.travarLote(m, alvoLote.id);
        if (!lote || (lote.status_disputa && lote.status_disputa !== StatusDisputaItem.AGUARDANDO)) return 0;
        const itens = await this.itensDoLote(m, lote.id);
        if (!itens.length) return 0;
        await this.converterPropostas(m, lote, itens, sessao.id);
        const agora = new Date();
        const estado = estadoAoIniciar(agora);
        await m.update(LoteLicitacao, lote.id, estado as any);
        await m.update(ItemLicitacao, { lote_id: lote.id }, { ...estado, status_disputa: StatusDisputaItem.EM_DISPUTA } as any);
        await this.sincronizarMelhor(m, lote.id);
        // Estratégia do modo: fechado encerra na abertura; aberto-fechado/fechado-aberto gravam a fase
        const inicioModo = await this.modos.aoIniciarUnidade(m, sessao.id, lote.id, BaseLance.TOTAL_LOTE, agora);
        if (inicioModo.encerrarImediatamente) encerrarNaAbertura.push(lote.id);
        await this.evento(m, {
          sessao_id: sessao.id,
          tipo: TipoEvento.DISPUTA_ITEM_INICIADA,
          descricao:
            `Disputa iniciada para o Lote ${lote.numero} (itens ${itens.map((i) => i.numero_item).join(', ')}) — ` +
            `lances pelo valor global do lote`,
          dados_adicionais: { lote_id: lote.id, itens: itens.map((i) => i.id) },
        });
        return itens.length;
      });
      if (n > 0) {
        lotesIniciados++;
        itensIniciados += n;
      }
    }
    if (lotesIniciados > 0) {
      await this.dataSource.manager.update(SessaoDisputa, sessao.id, { status: StatusSessao.MODO_ABERTO, etapa: EtapaSessao.DISPUTA_LANCES });
    }
    return { itensIniciados, lotesIniciados, encerrarNaAbertura };
  }

  // ==========================================================================
  // REGISTRAR LANCE NO LOTE
  // ==========================================================================

  /**
   * Lance no lote (LANCE, DESEMPATE_MPE, NEGOCIACAO): mesmas regras do item
   * (`validarLance`) sobre o valor GLOBAL do lote; recusa quem não cotou todos
   * os itens do lote (isolamento). Transação com o lote travado.
   */
  async registrarLance(cmd: ComandoLanceLote): Promise<Lance> {
    let origem = cmd.origem ?? OrigemLance.LANCE;
    const valor = Number(cmd.valor);
    try {
      return await this.dataSource.transaction(async (m) => {
        const lote = await this.travarLote(m, cmd.loteId);
        if (!lote) throw new NotFoundException('Lote não encontrado');
        const sessao = await m.findOne(SessaoDisputa, { where: { id: cmd.sessaoId } });
        if (!sessao) throw new NotFoundException('Sessão não encontrada');
        if (lote.licitacao_id !== sessao.licitacao_id) throw new BadRequestException('Lote não pertence à licitação desta sessão');
        await exigirLicitacaoAtiva(m, sessao.licitacao_id, { bloquear: true });

        const params = await this.parametros.daSessao(cmd.sessaoId, m);
        if (params.baseLance !== BaseLance.TOTAL_LOTE) {
          throw new ConflictException('Esta licitação não é disputada por lote: dê o lance no item.');
        }

        // Lote exclusivo/cota de ME/EPP (LC 123 art. 48 I e III): só ME/EPP enquadrada dá lance
        const foraMpe = await motivoForaDoBeneficioMpe(m, lote.id, cmd.fornecedorId);
        if (foraMpe) throw new LanceRecusado(foraMpe, 'EXCLUSIVO_MPE');
        const itens = await this.itensDoLote(m, lote.id);
        const minha = (await this.propostasNosItens(m, lote.licitacao_id, itens.map((i) => i.id), cmd.fornecedorId)).get(cmd.fornecedorId);
        const eleg = elegibilidadeNoLote(this.referenciaItens(itens), minha?.itens ?? []);
        if (!eleg.elegivel) {
          throw new LanceRecusado(
            minha
              ? `Você não participa da disputa do Lote ${lote.numero}: sua proposta não cotou todos os itens do lote ` +
                  `(faltam os itens ${eleg.itensNaoCotados.join(', ')}). O edital exige a cotação de todos os itens do grupo.`
              : `Você não possui proposta classificada para o Lote ${lote.numero}. Apenas fornecedores com propostas classificadas podem dar lances.`,
            'SEM_PROPOSTA_LOTE',
          );
        }
        if (Number.isFinite(valor) && Math.abs(centavos(valor) - valor) > 1e-9) {
          throw new LanceRecusado('O lance do lote é em reais, com no máximo 2 casas decimais', 'VALOR_INVALIDO');
        }

        // Estratégia do modo (E2.4): lance final fechado (valor GLOBAL do lote, rateado como os
        // demais), participantes da fase, tempo aleatório = etapa aberta, piso do reinício
        const ctxModo = await this.modos.contexto(sessao.licitacao_id, m);
        const regraModo = await this.modos.regraDoLance(m, { item: lote, tipo: 'LOTE', fornecedorId: cmd.fornecedorId, origem, ctx: ctxModo });
        origem = regraModo.origem;

        const ativos = await this.lancesAtivosDoLote(m, lote.id);
        const meus = ativos
          .filter((l) => l.fornecedor_id === cmd.fornecedorId)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const melhor = ativos[0];
        const agora = new Date();

        validarLance({
          origem,
          valor,
          statusItem: regraModo.statusParaValidacao,
          sessaoSuspensa: sessao.status === StatusSessao.SUSPENSA,
          propostaNaBase: eleg.totalProposta,
          meuUltimo: meus[0] ? { valor: parseFloat(meus[0].valor), origem: meus[0].origem, criadoEm: new Date(meus[0].created_at) } : null,
          melhor: melhor ? { valor: parseFloat(melhor.valor), fornecedorId: melhor.fornecedor_id } : null,
          valoresDeOutros: ativos.filter((l) => l.fornecedor_id !== cmd.fornecedorId).map((l) => parseFloat(l.valor)),
          diferencaMinima: params.diferencaMinima,
          intervaloProprioSegundos: params.intervaloProprioSegundos,
          agora,
          // E7c: maior lance (leilão) — o lance do lote precisa SUBIR
          direcao: ctxModo.direcao,
        });
        regraModo.conferir(valor);

        const nome = (await m.query(`SELECT razao_social FROM fornecedores WHERE id::text = $1`, [cmd.fornecedorId]))[0]?.razao_social || 'Fornecedor';
        const lance = await this.gravarLance(m, {
          lote,
          itensProposta: eleg.itens,
          fornecedorId: cmd.fornecedorId,
          fornecedorNome: nome,
          valor,
          origem,
          ip: cmd.ip || null,
          criadoEm: agora,
        });
        if (origem === OrigemLance.LANCE) {
          await m.update(LoteLicitacao, lote.id, { ultimo_lance_em: agora });
          await m.update(ItemLicitacao, { lote_id: lote.id }, { ultimo_lance_em: agora });
        }
        await this.sincronizarMelhor(m, lote.id);

        await this.evento(m, {
          sessao_id: cmd.sessaoId,
          tipo: origem === OrigemLance.DESEMPATE_MPE ? TipoEvento.LANCE_MPE_REGISTRADO : TipoEvento.LANCE_REGISTRADO,
          descricao:
            origem === OrigemLance.DESEMPATE_MPE
              ? `ME/EPP exerceu o direito de preferência com lance de R$ ${valor.toFixed(2)} no Lote ${lote.numero} (LC 123, art. 45)`
              : origem === OrigemLance.LANCE_FECHADO
                ? `Lance final fechado recebido no Lote ${lote.numero} (sigiloso até o fim do prazo — IN 73 art. 24 §2º)`
                : `Lance de R$ ${valor.toFixed(2)} registrado no Lote ${lote.numero}`,
          fornecedor_id: cmd.fornecedorId,
          lance_id: lance.id,
          // O valor do lance fechado fica só na tabela de lances até o fim do prazo
          valor: origem === OrigemLance.LANCE_FECHADO ? undefined : valor,
          dados_adicionais: { origem, base_lance: BaseLance.TOTAL_LOTE, lote_id: lote.id },
        });
        return lance;
      });
    } catch (e) {
      if (e instanceof LanceRecusado) {
        const msg =
          e.codigo === 'ITEM_FORA_DE_DISPUTA'
            ? 'Lote não está em disputa'
            : e.message.replace(/do item/g, 'do lote').replace(/neste item/g, 'neste lote').replace(/para este item/g, 'para este lote');
        throw e.estado ? new ConflictException(msg) : new BadRequestException(msg);
      }
      throw e;
    }
  }

  // ==========================================================================
  // ENCERRAR
  // ==========================================================================

  /** Encerra a disputa do lote (idempotente); os itens espelham o encerramento. */
  async encerrar(sessao: SessaoDisputa, loteId: string): Promise<ResultadoEncerramentoLote> {
    return this.dataSource.transaction(async (m) => {
      const lote = await this.travarLote(m, loteId);
      if (!lote) throw new NotFoundException('Lote não encontrado');
      if (lote.licitacao_id !== sessao.licitacao_id) throw new BadRequestException('Lote não pertence à licitação desta sessão');
      if (lote.status_disputa === StatusDisputaItem.ENCERRADO || lote.status_disputa === StatusDisputaItem.NEGOCIACAO) {
        return { lote, melhor: null, jaEstavaEncerrado: true };
      }
      const agora = new Date();
      await m.update(LoteLicitacao, lote.id, { status_disputa: StatusDisputaItem.ENCERRADO, disputa_encerrada_em: agora });
      await m.update(ItemLicitacao, { lote_id: lote.id }, { status_disputa: StatusDisputaItem.ENCERRADO, disputa_encerrada_em: agora });
      const linha = await this.sincronizarMelhor(m, lote.id);
      const melhor = linha ? await m.findOne(Lance, { where: { id: linha.id } }) : null;
      const rateio = melhor
        ? await m.query(
            `SELECT l.item_id, i.numero_item, l.valor_unitario, l.valor_total
               FROM lances l JOIN itens_licitacao i ON i.id::text = l.item_id::text
              WHERE l.lance_lote_id = $1 ORDER BY i.numero_item`,
            [melhor.id],
          )
        : [];
      await this.evento(m, {
        sessao_id: sessao.id,
        tipo: TipoEvento.DISPUTA_ITEM_ENCERRADA,
        descricao: melhor
          ? `Lote ${lote.numero} encerrado. Melhor lance: R$ ${Number(melhor.valor).toFixed(2)} (${melhor.fornecedor_nome})`
          : `Lote ${lote.numero} encerrado sem lances (DESERTO)`,
        fornecedor_id: melhor?.fornecedor_id,
        valor: melhor ? Number(melhor.valor) : undefined,
        dados_adicionais: { lote_id: lote.id, rateio },
      });
      return { lote: { ...lote, status_disputa: StatusDisputaItem.ENCERRADO } as LoteLicitacao, melhor, jaEstavaEncerrado: false };
    });
  }

  /** Reinício da sessão: lotes voltam a AGUARDANDO (os lances já foram cancelados logicamente). */
  async reiniciarLotes(m: EntityManager, licitacaoId: string): Promise<number> {
    const r = await m.update(LoteLicitacao, { licitacao_id: licitacaoId }, ESTADO_REINICIADO as any);
    return r.affected || 0;
  }

  // ==========================================================================
  // RANKING E LEITURAS
  // ==========================================================================

  /** Ranking do lote: melhor valor ATIVO de cada fornecedor (lance do lote), na direção do critério (maior lance = decrescente). */
  async ranking(loteId: string, manager?: EntityManager): Promise<Array<{
    fornecedorId: string;
    fornecedorNome: string;
    melhorValor: number;
    registradoEm: Date;
    totalLances: number;
  }>> {
    const m = manager ?? this.dataSource.manager;
    const direcao = await this.direcaoDoLote(m, loteId);
    const sinal = direcao === 'MAIOR' ? -1 : 1;
    const rows: any[] = await m.query(
      `WITH ativos AS (
         SELECT l.*, COUNT(*) OVER (PARTITION BY l.fornecedor_id) AS total
           FROM lances l
          WHERE l.lote_id = $1 AND l.item_id IS NULL AND l.cancelado = false AND l.fornecedor_id IS NOT NULL
            AND ${ModoDisputaService.SQL_LANCE_LOTE_VISIVEL}
       )
       SELECT DISTINCT ON (a.fornecedor_id)
              a.fornecedor_id, COALESCE(f.razao_social, a.fornecedor_nome) AS nome, a.valor, a.created_at, a.total
         FROM ativos a LEFT JOIN fornecedores f ON f.id::text = a.fornecedor_id
        ORDER BY a.fornecedor_id, a.valor ${ordemSql(direcao)}, a.created_at ASC`,
      [loteId],
    );
    return rows
      .map((r) => ({
        fornecedorId: String(r.fornecedor_id),
        fornecedorNome: r.nome || 'Fornecedor',
        melhorValor: parseFloat(r.valor),
        registradoEm: new Date(r.created_at),
        totalLances: Number(r.total),
      }))
      .sort((a, b) => sinal * (a.melhorValor - b.melhorValor) || a.registradoEm.getTime() - b.registradoEm.getTime());
  }

  /**
   * Lotes da licitação como UNIDADES DE DISPUTA (mesma forma de ItemDisputa,
   * com `tipoUnidade: 'LOTE'` e os itens dentro). Leitura em lote (poucas
   * consultas), como a do item.
   */
  async unidades(
    sessao: SessaoDisputa,
    params: ParametrosDisputa,
    anonimizar: boolean,
    codigos: Map<string, string>,
    fornecedorId?: string,
  ): Promise<ItemDisputa[]> {
    const m = this.dataSource.manager;
    const lotes = await m.find(LoteLicitacao, { where: { licitacao_id: sessao.licitacao_id }, order: { numero: 'ASC' } });
    if (!lotes.length) return [];
    const itens = await m.find(ItemLicitacao, { where: { licitacao_id: sessao.licitacao_id }, order: { numero_item: 'ASC' } });
    const direcao = await this.modos.direcao(sessao.licitacao_id, m);
    const ativos: Array<{ lote_id: string; fornecedor_id: string | null; valor: string }> = await m.query(
      `SELECT lote_id::text AS lote_id, fornecedor_id, valor FROM lances l
        WHERE licitacao_id = $1 AND lote_id IS NOT NULL AND item_id IS NULL AND cancelado = false
          AND ${ModoDisputaService.SQL_LANCE_LOTE_VISIVEL}
        ORDER BY valor ${ordemSql(direcao)}, created_at ASC`,
      [sessao.licitacao_id],
    );
    const propostas = await this.propostasNosItens(m, sessao.licitacao_id, itens.map((i) => i.id));

    const saida: ItemDisputa[] = [];
    for (const lote of lotes) {
      const itensL = itens.filter((i) => i.lote_id === lote.id);
      if (!itensL.length) continue;
      const ref = this.referenciaItens(itensL);
      const lances = ativos.filter((a) => a.lote_id === lote.id);
      const elegiveis = [...propostas.values()].filter((p) => elegibilidadeNoLote(ref, p.itens).elegivel).length;
      const minha = fornecedorId ? elegibilidadeNoLote(ref, propostas.get(fornecedorId)?.itens ?? []) : null;

      let meuMelhorLance: number | undefined;
      let minhaPosicao: number | undefined;
      if (fornecedorId) {
        const meu = lances.find((l) => l.fornecedor_id === fornecedorId);
        if (meu) {
          meuMelhorLance = parseFloat(meu.valor);
          const vistos: string[] = [];
          for (const l of lances) if (l.fornecedor_id && !vistos.includes(l.fornecedor_id)) vistos.push(l.fornecedor_id);
          minhaPosicao = vistos.indexOf(fornecedorId) + 1 || undefined;
        } else if (minha?.elegivel) {
          meuMelhorLance = minha.totalProposta;
        }
      }

      const topo = lances[0];
      let melhorLance = topo
        ? { valor: parseFloat(topo.valor), fornecedorId: topo.fornecedor_id || '', fornecedorNome: 'Fornecedor' }
        : undefined;
      if (topo?.fornecedor_id) {
        const nome = (await m.query(`SELECT razao_social FROM fornecedores WHERE id::text = $1`, [topo.fornecedor_id]))[0]?.razao_social;
        melhorLance = { ...melhorLance!, fornecedorNome: nome || 'Fornecedor' };
        if (anonimizar) {
          const codigo = codigos.get(topo.fornecedor_id) ?? 'Licitante';
          melhorLance = { valor: melhorLance.valor, fornecedorId: idAnonimo(codigo), fornecedorNome: codigo };
        }
      }

      const status = colunaDoStatus(lote.status_disputa);
      const relogio = relogioDaUnidade(lote, params);
      const minhasPropostas = fornecedorId ? propostas.get(fornecedorId)?.itens ?? [] : [];
      const refTotal = centavos(itensL.reduce((s, i) => s + referenciaNaBase(i, BaseLance.TOTAL_ITEM), 0));

      saida.push({
        id: lote.id,
        numero: lote.numero,
        descricao: lote.descricao,
        quantidade: 1,
        unidade: 'LOTE',
        valorReferencia: refTotal,
        valorReferenciaUnitario: refTotal,
        baseLance: BaseLance.TOTAL_LOTE,
        valorMaximoAceitavel: undefined,
        status,
        tempoRestante: status === 'EM_DISPUTA' ? relogio.restanteSegundos : 0,
        emProrrogacao: status === 'EM_DISPUTA' ? relogio.emProrrogacao : false,
        melhorLance,
        meuMelhorLance,
        minhaPosicao,
        minhaPropostaInicial: minha?.elegivel ? minha.totalProposta : undefined,
        totalPropostas: elegiveis,
        totalLances: lances.length,
        tipoUnidade: 'LOTE',
        itensDoLote: itensL.map((i) => {
          const p = minhasPropostas.find((x) => x.itemId === i.id);
          return {
            id: i.id,
            numero: i.numero_item,
            descricao: i.descricao_resumida || i.descricao_detalhada || '',
            quantidade: qtd(i.quantidade),
            unidade: i.unidade_medida || 'UN',
            valorReferencia: referenciaNaBase(i, BaseLance.TOTAL_ITEM),
            ...(p ? { minhaProposta: { valorUnitario: Number(p.valor_unitario) || null, valorTotal: Number(p.valor_total) || null } } : {}),
          };
        }),
        ...(minha
          ? { elegivel: minha.elegivel, itensNaoCotados: minha.itensNaoCotados, possoDarLance: minha.elegivel && status === 'EM_DISPUTA' }
          : {}),
      });
    }
    return saida;
  }

  /** Propostas iniciais do lote (só elegíveis), na base do lote, com os itens. */
  async propostasIniciais(loteId: string, ctx: ContextoLeituraLote): Promise<any[]> {
    const m = this.dataSource.manager;
    const lote = await this.buscarLote(loteId, m);
    if (!lote) return [];
    const itens = await this.itensDoLote(m, loteId);
    const ref = this.referenciaItens(itens);
    const sinal = (await this.modos.direcao(lote.licitacao_id, m)) === 'MAIOR' ? -1 : 1;
    const propostas = [...(await this.propostasNosItens(m, lote.licitacao_id, itens.map((i) => i.id))).values()]
      .map((p) => ({ p, e: elegibilidadeNoLote(ref, p.itens) }))
      .filter((x) => x.e.elegivel)
      .sort((a, b) => sinal * (a.e.totalProposta - b.e.totalProposta) || a.p.enviadaEm - b.p.enviadaEm);
    return Promise.all(
      propostas.map(async ({ p, e }, index) => {
        let fornecedorId = p.fornecedorId;
        let fornecedorNome = p.nome;
        if (ctx.anonimizar) ({ fornecedorId, fornecedorNome } = await ctx.anonimo(p.fornecedorId));
        return {
          posicao: index + 1,
          fornecedorId,
          fornecedorNome,
          valor: e.totalProposta,
          valorUnitario: null,
          valorTotal: e.totalProposta,
          dataEnvio: new Date(p.enviadaEm),
          itens: e.itens.map((i) => ({ itemId: i.itemId, numero: i.numero, valorTotal: i.valorTotalProposta })),
        };
      }),
    );
  }

  async melhoresPorFornecedor(loteId: string, ctx: ContextoLeituraLote): Promise<any[]> {
    const ranking = await this.ranking(loteId);
    return Promise.all(
      ranking.map(async (r, index) => {
        let { fornecedorId, fornecedorNome } = r;
        if (ctx.anonimizar) ({ fornecedorId, fornecedorNome } = await ctx.anonimo(r.fornecedorId));
        return { posicao: index + 1, fornecedorId, fornecedorNome, melhorValor: r.melhorValor, totalLances: r.totalLances };
      }),
    );
  }

  /** Lances ativos do lote (mais recente primeiro), cada um com o rateio por item. */
  async lances(loteId: string, ctx: ContextoLeituraLote): Promise<Array<LanceRegistrado & { rateio: any[] }>> {
    const m = this.dataSource.manager;
    const statusLote = (await this.buscarLote(loteId, m))?.status_disputa;
    const pais = (await m.find(Lance, { where: { lote_id: loteId, item_id: IsNull(), cancelado: false }, order: { created_at: 'DESC' } }))
      // Lance final fechado: sigiloso até o fim do prazo (IN 73 art. 24 §2º)
      .filter((l) => ModoDisputaService.lanceVisivel(l.origem, statusLote));
    if (!pais.length) {
      const propostas = await this.propostasIniciais(loteId, ctx);
      return propostas.map((p) => ({
        id: `proposta-${p.fornecedorId}`,
        valor: p.valor,
        valorUnitario: null,
        valorTotal: p.valorTotal,
        fornecedorId: p.fornecedorId,
        fornecedorNome: p.fornecedorNome,
        dataHora: p.dataEnvio,
        origem: OrigemLance.PROPOSTA,
        rateio: p.itens,
      }));
    }
    const filhos: any[] = await m.query(
      `SELECT l.lance_lote_id, l.item_id, i.numero_item, l.valor_unitario, l.valor_total
         FROM lances l JOIN itens_licitacao i ON i.id::text = l.item_id::text
        WHERE l.lance_lote_id = ANY($1::uuid[]) ORDER BY i.numero_item`,
      [pais.map((p) => p.id)],
    );
    return Promise.all(
      pais.map(async (l) => {
        let fornecedorId = l.fornecedor_id || '';
        let fornecedorNome = l.fornecedor_nome || 'Fornecedor';
        if (ctx.anonimizar && fornecedorId) ({ fornecedorId, fornecedorNome } = await ctx.anonimo(fornecedorId));
        return {
          id: l.id,
          valor: parseFloat(String(l.valor)),
          valorUnitario: null,
          valorTotal: l.valor_total != null ? Number(l.valor_total) : null,
          fornecedorId,
          fornecedorNome,
          dataHora: l.created_at,
          origem: l.origem || OrigemLance.LANCE,
          rateio: filhos
            .filter((f) => String(f.lance_lote_id) === l.id)
            .map((f) => ({ itemId: String(f.item_id), numero: f.numero_item, valorUnitario: Number(f.valor_unitario), valorTotal: Number(f.valor_total) })),
        };
      }),
    );
  }

  // ==========================================================================
  // CANCELAMENTO (IN 73 art. 21 §3º e §4º) — lance do lote + rateio juntos
  // ==========================================================================

  private async estadoExclusao(m: EntityManager, loteId: string, fornecedorId: string) {
    const ultimo = await m.findOne(Lance, {
      where: { lote_id: loteId, item_id: IsNull(), fornecedor_id: fornecedorId, cancelado: false, origem: OrigemLance.LANCE },
      order: { created_at: 'DESC' },
    });
    const jaExcluiu =
      (await m.count(Lance, { where: { lote_id: loteId, item_id: IsNull(), fornecedor_id: fornecedorId, cancelado_por: 'FORNECEDOR' } })) > 0;
    return { ultimoProprioId: ultimo?.id ?? null, jaExcluiu };
  }

  async listarMeusLances(sessaoId: string, loteId: string, fornecedorId: string, prazoSegundos: number): Promise<LancePainelCancelamento[]> {
    const m = this.dataSource.manager;
    const sessao = await m.findOne(SessaoDisputa, { where: { id: sessaoId } });
    const lote = await this.buscarLote(loteId, m);
    if (!sessao || !lote || lote.licitacao_id !== sessao.licitacao_id) throw new BadRequestException('Lote inválido para esta sessão');
    const lances = await m.find(Lance, {
      where: { lote_id: loteId, item_id: IsNull(), fornecedor_id: fornecedorId, origem: OrigemLance.LANCE },
      order: { created_at: 'DESC' },
      take: 30,
    });
    const estado = await this.estadoExclusao(m, loteId, fornecedorId);
    const emDisputa = lote.status_disputa === StatusDisputaItem.EM_DISPUTA;
    const agora = Date.now();
    return lances.map((l) => {
      const e = podeExcluirLanceDireto(l, estado.ultimoProprioId, estado.jaExcluiu, prazoSegundos, agora);
      const pode = emDisputa && !l.cancelado && !l.solicitacao_cancelamento_pendente && e.pode;
      return {
        id: l.id,
        valor: parseFloat(String(l.valor)),
        criadoEm: new Date(l.created_at).toISOString(),
        cancelado: l.cancelado,
        solicitacaoPendente: l.solicitacao_cancelamento_pendente,
        podeCancelarDireto: pode,
        segundosRestantesCancelamentoDireto: pode ? e.segundosRestantes : 0,
      };
    });
  }

  private async prepararCancelamento(m: EntityManager, sessaoId: string, loteId: string, lanceId: string) {
    const sessao = await m.findOne(SessaoDisputa, { where: { id: sessaoId } });
    if (!sessao) throw new NotFoundException('Sessão não encontrada');
    await exigirLicitacaoAtiva(m, sessao.licitacao_id, { bloquear: true });
    const lote = await this.travarLote(m, loteId);
    if (!lote || lote.licitacao_id !== sessao.licitacao_id) throw new BadRequestException('Lote inválido para esta sessão');
    if (lote.status_disputa !== StatusDisputaItem.EM_DISPUTA) throw new BadRequestException('Lote não está em disputa');
    const lance = await m.findOne(Lance, { where: { id: lanceId } });
    if (!lance || lance.lote_id !== loteId || lance.item_id) throw new NotFoundException('Lance não encontrado');
    if (lance.cancelado) throw new BadRequestException('Lance já está cancelado');
    return { sessao, lote, lance };
  }

  /** Cancela o lance do lote e o seu rateio; ressincroniza tempo e melhor lance. */
  private async cancelarComRateio(m: EntityManager, lote: LoteLicitacao, lanceId: string, por: string, motivo: string) {
    const dados = { cancelado: true, cancelado_em: new Date(), cancelado_por: por, cancelado_motivo: motivo, solicitacao_cancelamento_pendente: false };
    await m.update(Lance, lanceId, dados);
    await m.update(Lance, { lance_lote_id: lanceId }, dados);
    const ultimo = await m.findOne(Lance, {
      where: { lote_id: lote.id, item_id: IsNull(), cancelado: false, origem: OrigemLance.LANCE },
      order: { created_at: 'DESC' },
    });
    const ultimoEm = (ultimo?.created_at ?? lote.disputa_iniciada_em ?? null) as any;
    await m.update(LoteLicitacao, lote.id, { ultimo_lance_em: ultimoEm });
    await m.update(ItemLicitacao, { lote_id: lote.id }, { ultimo_lance_em: ultimoEm });
    await this.sincronizarMelhor(m, lote.id);
  }

  async cancelarProprio(sessaoId: string, loteId: string, lanceId: string, fornecedorId: string, prazoSegundos: number): Promise<void> {
    await this.dataSource.transaction(async (m) => {
      const { lote, lance } = await this.prepararCancelamento(m, sessaoId, loteId, lanceId);
      if (lance.fornecedor_id !== fornecedorId) throw new ForbiddenException('Este lance não pertence ao fornecedor');
      if (lance.solicitacao_cancelamento_pendente) throw new BadRequestException('Já existe solicitação de cancelamento pendente para este lance');
      const estado = await this.estadoExclusao(m, loteId, fornecedorId);
      const e = podeExcluirLanceDireto(lance, estado.ultimoProprioId, estado.jaExcluiu, prazoSegundos, Date.now());
      if (!e.pode) throw new BadRequestException(e.motivo);
      await this.cancelarComRateio(m, lote, lance.id, 'FORNECEDOR', 'Exclusão do próprio último lance (IN 73 art. 21 §3º)');
    });
  }

  async solicitarCancelamento(
    sessaoId: string,
    loteId: string,
    lanceId: string,
    fornecedorId: string,
    prazoSegundos: number,
    motivo?: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (m) => {
      const { lance } = await this.prepararCancelamento(m, sessaoId, loteId, lanceId);
      if (lance.fornecedor_id !== fornecedorId) throw new ForbiddenException('Este lance não pertence ao fornecedor');
      if (lance.solicitacao_cancelamento_pendente) throw new BadRequestException('Solicitação de cancelamento já registrada');
      const estado = await this.estadoExclusao(m, loteId, fornecedorId);
      if (podeExcluirLanceDireto(lance, estado.ultimoProprioId, estado.jaExcluiu, prazoSegundos, Date.now()).pode) {
        throw new BadRequestException(`Ainda dentro do prazo de ${prazoSegundos} segundos: use a exclusão direta.`);
      }
      await m.update(Lance, lance.id, {
        solicitacao_cancelamento_pendente: true,
        solicitacao_cancelamento_em: new Date(),
        solicitacao_cancelamento_motivo: motivo?.trim() || null,
      });
    });
  }

  async pregoeiroCancelar(sessaoId: string, loteId: string, lanceId: string, orgaoId: string, justificativa: string): Promise<void> {
    await this.dataSource.transaction(async (m) => {
      const { sessao, lote, lance } = await this.prepararCancelamento(m, sessaoId, loteId, lanceId);
      const licitacao = await m.findOne(Licitacao, { where: { id: sessao.licitacao_id } });
      if (!licitacao || licitacao.orgao_id !== orgaoId) throw new ForbiddenException('Apenas o órgão da licitação pode cancelar lances');
      await this.cancelarComRateio(m, lote, lance.id, 'PREGOEIRO', justificativa);
    });
  }
}

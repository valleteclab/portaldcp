import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { FaseLicitacao } from '../licitacoes/entities/licitacao.entity';
import { SessaoDisputa } from '../sessao/entities/sessao-disputa.entity';
import { EventoSessao, TipoEvento } from '../sessao/entities/evento-sessao.entity';
import { exigirLicitacaoAtiva } from '../sessao/licitacao-ativa';
import { ItemLicitacao, StatusItem } from '../itens/entities/item-licitacao.entity';
import { TransicoesService } from '../licitacoes/transicoes/transicoes.service';
import { AtorTransicao, atorSistema } from '../licitacoes/transicoes/transicoes.tipos';
import { DisputaService } from '../disputa/disputa.service';
import { DisputaGateway } from '../disputa/disputa.gateway';
import { OrigemLance } from '../disputa/modelo-lance';
import { AceitacaoProposta } from './entities/aceitacao-proposta.entity';
import { NegociacaoUnidade } from './entities/negociacao-unidade.entity';
import { AceitacaoService } from './aceitacao.service';
import { RankingService, UnidadeJulgamento } from './ranking.service';
import { EntradaRanking, STATUS_ACEITACAO_ATIVOS, SituacaoLicitante, StatusAceitacao, atualDaUnidade } from './regras-julgamento';
import {
  ResultadoNegociacao,
  StatusContraproposta,
  StatusNegociacao,
  VISIBILIDADE_PARTICIPANTES,
  acimaDoPrecoMaximo,
  brl,
  motivoContrapropostaInvalida,
  motivoNaoAbre,
  motivoNaoAceitaPreco,
  motivoNaoDesclassifica,
  motivoNaoEncerra,
  motivoNaoResponde,
  precoMaximoDaUnidade,
  totalDaBase,
} from './regras-negociacao';

/** Autor de mensagem na negociação. */
export type AutorNegociacao = { tipo: 'AGENTE'; nome?: string; ator: AtorTransicao } | { tipo: 'LICITANTE'; fornecedorId: string };

const TIPOS_EVENTO_NEGOCIACAO = [
  TipoEvento.NEGOCIACAO_INICIADA,
  TipoEvento.NEGOCIACAO_PROPOSTA,
  TipoEvento.NEGOCIACAO_ACEITA,
  TipoEvento.NEGOCIACAO_RECUSADA,
  TipoEvento.NEGOCIACAO_ENCERRADA,
  TipoEvento.NEGOCIACAO_MENSAGEM,
];

const TAMANHO_MAXIMO_MENSAGEM = 2000;

/**
 * ============================================================================
 * NEGOCIAÇÃO (plano E3 item 4 — Lei 14.133/2021 art. 61; IN SEGES 73/2022
 * art. 30). Regras puras e base legal: `regras-negociacao.ts`.
 * ============================================================================
 *
 * Por UNIDADE (item ou lote), depois da etapa de lances e ANTES do aceite:
 *   lances encerrados → [desempate ME/EPP] → NEGOCIAÇÃO (obrigatória se acima
 *   do preço máximo) → proposta adequada ao valor negociado → aceite → habilitação
 *
 *  - o agente ABRE a negociação com o licitante na vez (ranking único);
 *  - troca MENSAGENS com ele e envia CONTRAPROPOSTA (valor menor que o
 *    atual, na base do lance);
 *  - o licitante ACEITA (o valor vira lance NEGOCIACAO pelo motor — o ranking
 *    e o teto da proposta adequada mudam; a convocação ativa é readequada) ou
 *    RECUSA com motivo;
 *  - o agente ENCERRA (valor mantido) ou, se o valor permanecer acima do preço
 *    máximo, DESCLASSIFICA (art. 59 III) — o próximo do ranking é chamado à
 *    negociação automaticamente (IN 73 art. 30 §1º); sem próximo, a unidade
 *    fracassa.
 * Negociação ACOMPANHADA pelos demais licitantes (IN 73 art. 30 §2º):
 * mensagens/contrapropostas/respostas são eventos `visibilidade: PARTICIPANTES`
 * — leitura do órgão dono e de todo licitante com proposta válida (REST
 * `/eventos`, painel de leitura e socket na sala da sessão, onde só entram o
 * órgão dono e os participantes); escrita só do agente e do licitante na vez.
 * Público anônimo e outros órgãos: só abertura e resultado (valor).
 */
@Injectable()
export class NegociacaoService implements OnModuleInit {
  private readonly logger = new Logger(NegociacaoService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ranking: RankingService,
    private readonly aceitacao: AceitacaoService,
    private readonly disputa: DisputaService,
    private readonly transicoes: TransicoesService,
    @Optional() private readonly gateway?: DisputaGateway,
  ) {}

  onModuleInit() {
    // Proposta adequada só depois de concluída a negociação em andamento (IN 73 art. 30 §4º)
    this.aceitacao.registrarGanchoAntesDaConvocacao(async ({ unidade, primeiro, manager }) => {
      const ativa = await manager.findOne(NegociacaoUnidade, {
        where: { unidade_id: unidade.id, fornecedor_id: primeiro.fornecedorId, status: StatusNegociacao.EM_ANDAMENTO },
      });
      return ativa
        ? `${this.rotulo(unidade)}: há negociação em andamento com o licitante — conclua-a antes de solicitar a proposta adequada (IN SEGES 73/2022, art. 30 §4º).`
        : null;
    });
    // Aceite acima do preço máximo só depois de negociar (art. 61; IN 73 art. 30) e, persistindo, motivado
    this.aceitacao.registrarGanchoAntesDoAceite(async ({ aceitacao, unidade, opts, manager }) => {
      const negs = await manager.find(NegociacaoUnidade, {
        where: { unidade_id: unidade.id, fornecedor_id: aceitacao.fornecedor_id },
      });
      const valorTotal = aceitacao.valor_total_readequado != null ? Number(aceitacao.valor_total_readequado) : Number(aceitacao.limites?.valorFinalTotal);
      const motivo = motivoNaoAceitaPreco({
        valorTotal,
        precoMaximo: precoMaximoDaUnidade(unidade.itens),
        negociacaoEmAndamento: negs.some((n) => n.status === StatusNegociacao.EM_ANDAMENTO),
        negociou: negs.some((n) => n.status === StatusNegociacao.CONCLUIDA),
        justificativa: opts.justificativaPrecoAcimaEstimado,
      });
      return motivo ? `${this.rotulo(unidade)}: ${motivo}` : null;
    });
  }

  // ==========================================================================
  // APOIO
  // ==========================================================================

  private rotulo(u: Pick<UnidadeJulgamento, 'tipo' | 'numero'>): string {
    return `${u.tipo === 'LOTE' ? 'Lote' : 'Item'} ${u.numero}`;
  }

  private async sessao(sessaoId: string, manager?: EntityManager): Promise<SessaoDisputa> {
    const s = await (manager ?? this.dataSource.manager).findOne(SessaoDisputa, { where: { id: sessaoId } });
    if (!s) throw new NotFoundException('Sessão não encontrada');
    return s;
  }

  /** Licitação ATIVA em JULGAMENTO + trava da unidade (a MESMA da aceitação: atos não se cruzam). */
  private async prepararAto(m: EntityManager, sessao: SessaoDisputa, unidadeId: string): Promise<void> {
    const lic = await exigirLicitacaoAtiva(m, sessao.licitacao_id, { bloquear: true });
    if (lic.fase !== FaseLicitacao.JULGAMENTO) {
      throw new ConflictException(`A negociação ocorre no julgamento (depois da etapa de lances); a licitação está em ${lic.fase}.`);
    }
    await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`aceitacao:${unidadeId}`]);
  }

  private async negociacaoDaSessao(m: EntityManager, sessaoId: string, negociacaoId: string, travar = true): Promise<NegociacaoUnidade> {
    const n = await m.findOne(NegociacaoUnidade, {
      where: { id: negociacaoId, sessao_id: sessaoId },
      ...(travar ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!n) throw new NotFoundException('Negociação não encontrada nesta sessão');
    return n;
  }

  /** Negociação do próprio licitante — a de outro responde 403 (os demais só acompanham). */
  private async negociacaoDoLicitante(m: EntityManager, sessaoId: string, negociacaoId: string, fornecedorId: string, travar = true) {
    const n = await this.negociacaoDaSessao(m, sessaoId, negociacaoId, travar);
    // A negociação é acompanhada por todos os participantes, mas só o licitante na vez escreve/responde
    if (n.fornecedor_id !== fornecedorId) {
      throw new ForbiddenException('Somente o licitante com quem a negociação foi aberta pode escrever ou responder; os demais apenas a acompanham (IN 73 art. 30 §2º).');
    }
    return n;
  }

  private async unidadeDa(m: EntityManager, n: NegociacaoUnidade): Promise<UnidadeJulgamento> {
    const u = await this.ranking.unidade(n.unidade_id, m);
    if (!u) throw new NotFoundException('Unidade não encontrada');
    return u;
  }

  private async nomes(ids: string[], manager?: EntityManager): Promise<Map<string, { razaoSocial: string; cpfCnpj: string }>> {
    const validos = [...new Set(ids.filter(Boolean))];
    if (!validos.length) return new Map();
    const rows: any[] = await (manager ?? this.dataSource.manager).query(
      `SELECT id::text AS id, razao_social, cpf_cnpj FROM fornecedores WHERE id::text = ANY($1)`,
      [validos],
    );
    return new Map(rows.map((r) => [r.id, { razaoSocial: r.razao_social, cpfCnpj: r.cpf_cnpj }]));
  }

  private quantidadeDaBase(u: UnidadeJulgamento): number {
    return u.tipo === 'ITEM' ? Number(u.itens[0]?.quantidade) || 1 : 1;
  }

  /**
   * O licitante da negociação ainda está na vez da unidade? Se saiu do ranking
   * por outro ato (recusa na aceitação, inabilitação, reinício), a negociação é
   * CANCELADA e o ato responde 409.
   */
  private async exigirNaVez(m: EntityManager, n: NegociacaoUnidade, u: UnidadeJulgamento): Promise<EntradaRanking> {
    const atual = atualDaUnidade(await this.ranking.ranking(u, m));
    if (atual && atual.fornecedorId === n.fornecedor_id) return atual;
    if (n.status === StatusNegociacao.EM_ANDAMENTO) {
      n.status = StatusNegociacao.CANCELADA;
      n.encerrada_em = new Date();
      n.encerrada_motivo = 'O licitante não está mais na vez da unidade (outro ato do julgamento)';
      if (n.contraproposta_status === StatusContraproposta.PENDENTE) n.contraproposta_status = null;
      await m.save(n);
    }
    throw new ConflictException('O licitante desta negociação não está mais na vez da unidade — a negociação foi cancelada');
  }

  /** Evento da negociação ACOMPANHADO pelos participantes (IN 73 art. 30 §2º) — não público. */
  private async eventoAcompanhado(
    m: EntityManager,
    n: NegociacaoUnidade,
    e: { tipo: TipoEvento; descricao: string; autor: 'AGENTE' | 'LICITANTE' | 'SISTEMA'; usuario?: string; valor?: number | null; dados?: Record<string, any> },
  ): Promise<EventoSessao> {
    return m.save(
      m.create(EventoSessao, {
        sessao_id: n.sessao_id,
        tipo: e.tipo,
        descricao: e.descricao,
        item_id: n.tipo_unidade === 'ITEM' ? n.unidade_id : undefined,
        fornecedor_id: n.fornecedor_id,
        fornecedor_identificador: n.fornecedor_id,
        valor: e.valor ?? undefined,
        usuario_nome: e.usuario ?? (e.autor === 'LICITANTE' ? n.fornecedor_id : e.autor === 'AGENTE' ? 'Agente de contratação' : 'SISTEMA'),
        is_sistema: e.autor === 'SISTEMA',
        dados_adicionais: {
          ...(e.dados ?? {}),
          visibilidade: VISIBILIDADE_PARTICIPANTES,
          negociacao_id: n.id,
          unidade_id: n.unidade_id,
          fornecedor_id: n.fornecedor_id,
          autor: e.autor,
        },
      }),
    );
  }

  /** Evento PÚBLICO (abertura/resultado): sem identidade, sem preço máximo, só o valor final. */
  private async eventoPublico(
    m: EntityManager,
    n: NegociacaoUnidade,
    e: { tipo: TipoEvento; descricao: string; usuario?: string; valor?: number | null; dados?: Record<string, any> },
  ): Promise<EventoSessao> {
    return m.save(
      m.create(EventoSessao, {
        sessao_id: n.sessao_id,
        tipo: e.tipo,
        descricao: e.descricao,
        item_id: n.tipo_unidade === 'ITEM' ? n.unidade_id : undefined,
        valor: e.valor ?? undefined,
        usuario_nome: e.usuario ?? 'SISTEMA',
        is_sistema: !e.usuario,
        dados_adicionais: { ...(e.dados ?? {}), negociacao_id: n.id, unidade_id: n.unidade_id },
      }),
    );
  }

  // --------------------------------------------------------------------------
  // Socket (depois do commit)
  // --------------------------------------------------------------------------

  private mensagemSocket(e: EventoSessao) {
    const d = e.dados_adicionais ?? {};
    return {
      id: e.id,
      negociacaoId: d.negociacao_id,
      unidadeId: d.unidade_id,
      tipo: e.tipo,
      autor: d.autor,
      texto: e.descricao,
      valor: e.valor != null ? Number(e.valor) : null,
      dataHora: e.created_at,
    };
  }

  /**
   * Participantes (IN 73 art. 30 §2º): a sala da sessão — só entram o órgão
   * dono/admin e os licitantes com proposta válida (anônimo e sem relação são
   * recusados no `entrar_sala`); o feed público da licitação não recebe.
   */
  private emitirParticipantes(sessaoId: string, _fornecedorId: string, evento: string, payload: Record<string, any>) {
    try {
      this.gateway?.server?.to(`sessao:${sessaoId}`).emit(evento, payload);
    } catch (e: any) {
      this.logger.warn(`Falha ao difundir ${evento}: ${e?.message}`);
    }
  }

  private emitirMensagens(sessaoId: string, fornecedorId: string, eventos: EventoSessao[]) {
    for (const e of eventos) this.emitirParticipantes(sessaoId, fornecedorId, 'negociacao_mensagem', this.mensagemSocket(e));
  }

  /** Público: resultado da negociação (só o valor) — IN 73 art. 30 §3º. */
  private emitirResultado(sessaoId: string, payload: Record<string, any>) {
    try {
      this.gateway?.server?.to(`sessao:${sessaoId}`).emit('negociacao_resultado', payload);
    } catch (e: any) {
      this.logger.warn(`Falha ao difundir negociacao_resultado: ${e?.message}`);
    }
  }

  // ==========================================================================
  // LEITURAS
  // ==========================================================================

  private visao(n: NegociacaoUnidade, mostrarPrecoMaximo: boolean) {
    return {
      id: n.id,
      unidadeId: n.unidade_id,
      tipoUnidade: n.tipo_unidade,
      fornecedorId: n.fornecedor_id,
      posicao: n.posicao,
      status: n.status,
      resultado: n.resultado,
      origem: n.origem,
      baseLance: n.base_lance,
      valorInicial: Number(n.valor_inicial),
      valorInicialTotal: Number(n.valor_inicial_total),
      valorFinal: n.valor_final != null ? Number(n.valor_final) : null,
      valorFinalTotal: n.valor_final_total != null ? Number(n.valor_final_total) : null,
      contraproposta:
        n.contraproposta_valor != null
          ? { valor: Number(n.contraproposta_valor), em: n.contraproposta_em, status: n.contraproposta_status }
          : null,
      rodadas: n.rodadas ?? [],
      abertaEm: n.aberta_em,
      encerradaEm: n.encerrada_em,
      encerradaMotivo: n.encerrada_motivo,
      // Preço máximo e obrigatoriedade: órgão sempre; licitantes só com orçamento público (art. 24)
      ...(mostrarPrecoMaximo
        ? { precoMaximoTotal: n.preco_maximo_total != null ? Number(n.preco_maximo_total) : null, obrigatoria: n.obrigatoria }
        : {}),
    };
  }

  private async mensagensDe(ids: string[], manager?: EntityManager) {
    if (!ids.length) return new Map<string, any[]>();
    const eventos = await (manager ?? this.dataSource.manager)
      .createQueryBuilder(EventoSessao, 'e')
      .where(`e.dados_adicionais->>'negociacao_id' IN (:...ids)`, { ids })
      .andWhere('e.tipo IN (:...tipos)', { tipos: TIPOS_EVENTO_NEGOCIACAO })
      .orderBy('e.created_at', 'ASC')
      .getMany();
    const mapa = new Map<string, any[]>();
    for (const e of eventos) {
      const id = e.dados_adicionais?.negociacao_id;
      if (!mapa.has(id)) mapa.set(id, []);
      mapa.get(id)!.push(this.mensagemSocket(e));
    }
    return mapa;
  }

  /**
   * Painel do agente (órgão dono): por unidade encerrada, o licitante na vez,
   * valor atual, preço máximo, alerta "acima do preço máximo" (negociação
   * obrigatória antes do aceite), negociação ativa com a conversa privada e o
   * histórico.
   */
  async painel(sessaoId: string) {
    const sessao = await this.sessao(sessaoId);
    const licitacaoId = sessao.licitacao_id;
    const [lic] = await this.dataSource.query(`SELECT fase::text AS fase FROM licitacoes WHERE id = $1`, [licitacaoId]);
    const direcao = await this.ranking.direcao(licitacaoId);
    const rankings = await this.ranking.rankingsDaLicitacao(licitacaoId);
    const negs = await this.dataSource.manager.find(NegociacaoUnidade, { where: { licitacao_id: licitacaoId }, order: { aberta_em: 'ASC' } });
    const mensagens = await this.mensagensDe(negs.map((n) => n.id));
    const cadastro = await this.nomes([...rankings.flatMap((r) => r.ranking.map((e) => e.fornecedorId)), ...negs.map((n) => n.fornecedor_id)]);

    const unidades = rankings.map(({ unidade: u, ranking }) => {
      const atual = atualDaUnidade(ranking);
      const precoMaximo = precoMaximoDaUnidade(u.itens);
      const comResultado = RankingService.unidadeComResultadoPossivel(u);
      const daUnidade = negs.filter((n) => n.unidade_id === u.id);
      const ativa = daUnidade.find((n) => n.status === StatusNegociacao.EM_ANDAMENTO) ?? null;
      const valorAtualTotal = atual ? totalDaBase(atual.melhorValor, u.baseLance, this.quantidadeDaBase(u)) : null;
      const acima = acimaDoPrecoMaximo(valorAtualTotal, precoMaximo);
      const negociouComAtual = !!atual && daUnidade.some((n) => n.fornecedor_id === atual.fornecedorId && n.status === StatusNegociacao.CONCLUIDA);
      const motivo = motivoNaoAbre({
        direcao,
        unidadeEncerrada: u.encerrada,
        comResultado,
        situacaoAtual: atual?.situacao ?? null,
        jaHaAtiva: !!ativa,
      });
      const podeAbrir = !motivo && lic?.fase === FaseLicitacao.JULGAMENTO;
      return {
        tipo: u.tipo,
        id: u.id,
        numero: u.numero,
        descricao: u.descricao,
        encerrada: u.encerrada,
        baseLance: u.baseLance,
        quantidade: this.quantidadeDaBase(u),
        precoMaximoTotal: precoMaximo,
        atual: atual
          ? {
              fornecedorId: atual.fornecedorId,
              razaoSocial: cadastro.get(atual.fornecedorId)?.razaoSocial ?? atual.fornecedorNome,
              cpfCnpj: cadastro.get(atual.fornecedorId)?.cpfCnpj ?? '',
              posicao: atual.posicao,
              situacao: atual.situacao,
              valorAtual: atual.melhorValor,
              valorAtualTotal,
            }
          : null,
        acimaDoPrecoMaximo: acima,
        /** Acima do preço máximo e ainda sem negociação concluída com o licitante na vez: o aceite fica bloqueado. */
        negociacaoObrigatoria: acima && !negociouComAtual && !!atual && !['ACEITO', 'HABILITADO', 'VENCEDOR'].includes(atual.situacao),
        podeAbrir,
        motivoNaoAbre: podeAbrir ? null : motivo,
        ativa: ativa
          ? {
              ...this.visao(ativa, true),
              razaoSocial: cadastro.get(ativa.fornecedor_id)?.razaoSocial ?? null,
              mensagens: mensagens.get(ativa.id) ?? [],
            }
          : null,
        historico: daUnidade.map((n) => ({
          ...this.visao(n, true),
          razaoSocial: cadastro.get(n.fornecedor_id)?.razaoSocial ?? null,
          mensagens: mensagens.get(n.id) ?? [],
        })),
      };
    });
    return {
      sessaoId,
      licitacaoId,
      faseLicitacao: lic?.fase ?? null,
      direcao,
      unidades,
    };
  }

  /**
   * Visão do LICITANTE participante: TODAS as negociações da sessão (IN 73
   * art. 30 §2º — acompanhadas pelos demais), só leitura nas alheias
   * (sem identificar o negociante: posição no ranking); escrita/resposta só
   * na própria. Preço máximo só se o orçamento não for sigiloso (art. 24).
   */
  async minhas(sessaoId: string, fornecedorId: string) {
    const sessao = await this.sessao(sessaoId);
    const negs = await this.dataSource.manager.find(NegociacaoUnidade, {
      where: { sessao_id: sessao.id },
      order: { aberta_em: 'ASC' },
    });
    const [lic] = await this.dataSource.query(`SELECT sigilo_orcamento::text AS sigilo FROM licitacoes WHERE id = $1`, [sessao.licitacao_id]);
    const orcamentoPublico = String(lic?.sigilo ?? 'PUBLICO') !== 'SIGILOSO';
    const mensagens = await this.mensagensDe(negs.map((n) => n.id));
    const unidades = negs.length ? await this.ranking.unidades(sessao.licitacao_id) : [];
    return {
      sessaoId,
      licitacaoId: sessao.licitacao_id,
      orcamentoPublico,
      negociacoes: negs.map((n) => {
        const u = unidades.find((x) => x.id === n.unidade_id);
        const minha = n.fornecedor_id === fornecedorId;
        const v = this.visao(n, orcamentoPublico);
        return {
          ...v,
          fornecedorId: minha ? n.fornecedor_id : null,
          minha,
          somenteLeitura: !minha,
          podeResponder: minha && !motivoNaoResponde(n),
          podeEnviarMensagem: minha && n.status === StatusNegociacao.EM_ANDAMENTO,
          unidade: u ? { tipo: u.tipo, id: u.id, numero: u.numero, descricao: u.descricao, quantidade: this.quantidadeDaBase(u) } : null,
          mensagens: mensagens.get(n.id) ?? [],
        };
      }),
    };
  }

  // ==========================================================================
  // ATOS DO AGENTE DE CONTRATAÇÃO
  // ==========================================================================

  /** Abre a negociação com o licitante NA VEZ da unidade (ranking único). */
  async abrir(sessaoId: string, unidadeId: string, opts: { mensagem?: string | null }, ator: AtorTransicao, usuarioNome?: string) {
    const sessao = await this.sessao(sessaoId);
    const u0 = await this.ranking.unidade(unidadeId);
    if (!u0 || u0.licitacaoId !== sessao.licitacao_id) throw new NotFoundException('Unidade não encontrada nesta licitação');
    const texto = (opts.mensagem ?? '').trim().slice(0, TAMANHO_MAXIMO_MENSAGEM);
    const emitir: EventoSessao[] = [];
    const n = await this.dataSource.transaction(async (m) => {
      await this.prepararAto(m, sessao, u0.id);
      const u = (await this.ranking.unidade(u0.id, m))!;
      const r = await this.abrirNaTransacao(m, sessao, u, ator, usuarioNome, 'MANUAL');
      if (texto) emitir.push(await this.eventoAcompanhado(m, r, { tipo: TipoEvento.NEGOCIACAO_MENSAGEM, descricao: texto, autor: 'AGENTE', usuario: usuarioNome }));
      return r;
    });
    this.emitirParticipantes(sessaoId, n.fornecedor_id, 'negociacao_atualizada', { negociacaoId: n.id, unidadeId: n.unidade_id, status: n.status });
    this.emitirMensagens(sessaoId, n.fornecedor_id, emitir);
    this.emitirResultado(sessaoId, { unidadeId: n.unidade_id, status: 'EM_ANDAMENTO', posicao: n.posicao });
    return this.visao(n, true);
  }

  private async abrirNaTransacao(
    m: EntityManager,
    sessao: SessaoDisputa,
    u: UnidadeJulgamento,
    ator: AtorTransicao,
    usuarioNome: string | undefined,
    origem: 'MANUAL' | 'AUTOMATICA',
  ): Promise<NegociacaoUnidade> {
    const direcao = await this.ranking.direcao(u.licitacaoId, m);
    const ranking = await this.ranking.ranking(u, m);
    const atual = atualDaUnidade(ranking);
    // Negociações ativas com quem saiu da vez (outro ato) ficam canceladas
    const ativas = await m.find(NegociacaoUnidade, { where: { unidade_id: u.id, status: StatusNegociacao.EM_ANDAMENTO } });
    for (const a of ativas.filter((x) => x.fornecedor_id !== atual?.fornecedorId)) {
      a.status = StatusNegociacao.CANCELADA;
      a.encerrada_em = new Date();
      a.encerrada_motivo = 'O licitante não está mais na vez da unidade (outro ato do julgamento)';
      await m.save(a);
    }
    const motivo = motivoNaoAbre({
      direcao,
      unidadeEncerrada: u.encerrada,
      comResultado: RankingService.unidadeComResultadoPossivel(u),
      situacaoAtual: atual?.situacao ?? null,
      jaHaAtiva: ativas.some((x) => x.fornecedor_id === atual?.fornecedorId),
    });
    if (motivo) throw new ConflictException(`${this.rotulo(u)}: ${motivo}`);
    const qtd = this.quantidadeDaBase(u);
    const precoMaximo = precoMaximoDaUnidade(u.itens);
    const valorTotal = totalDaBase(atual!.melhorValor, u.baseLance, qtd);
    const obrigatoria = acimaDoPrecoMaximo(valorTotal, precoMaximo);
    const n = await m.save(
      m.create(NegociacaoUnidade, {
        licitacao_id: u.licitacaoId,
        sessao_id: sessao.id,
        tipo_unidade: u.tipo,
        unidade_id: u.id,
        fornecedor_id: atual!.fornecedorId,
        posicao: atual!.posicao,
        status: StatusNegociacao.EM_ANDAMENTO,
        base_lance: u.baseLance,
        quantidade: qtd,
        valor_inicial: atual!.melhorValor,
        valor_inicial_total: valorTotal,
        preco_maximo_total: precoMaximo,
        obrigatoria,
        rodadas: [],
        aberta_em: new Date(),
        aberta_por_tipo: ator.tipo,
        aberta_por_id: ator.id,
        origem,
      }),
    );
    await this.eventoPublico(m, n, {
      tipo: TipoEvento.NEGOCIACAO_INICIADA,
      descricao:
        `${this.rotulo(u)}: negociação ${origem === 'AUTOMATICA' ? 'convocada automaticamente ' : ''}aberta com o ` +
        `${atual!.posicao}º colocado (Lei 14.133/2021, art. 61; IN SEGES 73/2022, art. 30). O resultado será divulgado ao final.`,
      usuario: usuarioNome ?? sessao.pregoeiro_nome ?? undefined,
      dados: { posicao: atual!.posicao, origem },
    });
    await this.eventoAcompanhado(m, n, {
      tipo: TipoEvento.NEGOCIACAO_MENSAGEM,
      descricao:
        `${this.rotulo(u)}: o agente de contratação abriu negociação com você sobre o seu valor atual de ${brl(atual!.melhorValor)}. ` +
        'A negociação é acompanhada pelos demais licitantes (IN SEGES 73/2022, art. 30 §2º).',
      autor: 'SISTEMA',
    });
    return n;
  }

  /** Contraproposta do agente (valor na base do lance, menor que o atual do licitante). */
  async contraproposta(
    sessaoId: string,
    negociacaoId: string,
    dados: { valor?: number | string | null; mensagem?: string | null },
    ator: AtorTransicao,
    usuarioNome?: string,
  ) {
    const valor = Number(dados.valor);
    const texto = (dados.mensagem ?? '').trim().slice(0, TAMANHO_MAXIMO_MENSAGEM);
    const sessao = await this.sessao(sessaoId);
    const emitir: EventoSessao[] = [];
    const n = await this.dataSource.transaction(async (m) => {
      const pre = await this.negociacaoDaSessao(m, sessaoId, negociacaoId, false);
      await this.prepararAto(m, sessao, pre.unidade_id);
      const n = await this.negociacaoDaSessao(m, sessaoId, negociacaoId);
      const u = await this.unidadeDa(m, n);
      if (n.status === StatusNegociacao.EM_ANDAMENTO) await this.exigirNaVez(m, n, u);
      const atual = atualDaUnidade(await this.ranking.ranking(u, m));
      const erro = motivoContrapropostaInvalida(n, valor, Number(atual?.melhorValor ?? n.valor_inicial), { casas: u.tipo === 'LOTE' ? 2 : 4 });
      if (erro) throw new BadRequestException(erro);
      const agora = new Date();
      const valorTotal = totalDaBase(valor, n.base_lance, Number(n.quantidade));
      n.contraproposta_valor = valor;
      n.contraproposta_em = agora;
      n.contraproposta_status = StatusContraproposta.PENDENTE;
      n.rodadas = [...(n.rodadas ?? []), { valor, valorTotal, enviadaEm: agora.toISOString(), status: StatusContraproposta.PENDENTE }];
      await m.save(n);
      emitir.push(
        await this.eventoAcompanhado(m, n, {
          tipo: TipoEvento.NEGOCIACAO_PROPOSTA,
          descricao: `Contraproposta do agente de contratação: ${brl(valor)}${n.base_lance === 'UNITARIO' ? ' (unitário)' : ''}. Aceite ou recuse.`,
          autor: 'AGENTE',
          usuario: usuarioNome,
          valor,
          dados: { valor, valor_total: valorTotal, rodada: n.rodadas.length },
        }),
      );
      if (texto) emitir.push(await this.eventoAcompanhado(m, n, { tipo: TipoEvento.NEGOCIACAO_MENSAGEM, descricao: texto, autor: 'AGENTE', usuario: usuarioNome }));
      return n;
    });
    this.emitirMensagens(sessaoId, n.fornecedor_id, emitir);
    this.emitirParticipantes(sessaoId, n.fornecedor_id, 'negociacao_atualizada', { negociacaoId: n.id, unidadeId: n.unidade_id, status: n.status });
    return this.visao(n, true);
  }

  /** Mensagem PRIVADA na negociação (agente ou o próprio licitante). */
  async mensagem(sessaoId: string, negociacaoId: string, autor: AutorNegociacao, textoBruto: string | undefined) {
    const texto = (textoBruto ?? '').trim();
    if (!texto) throw new BadRequestException('Mensagem vazia');
    if (texto.length > TAMANHO_MAXIMO_MENSAGEM) throw new BadRequestException(`Mensagem acima de ${TAMANHO_MAXIMO_MENSAGEM} caracteres`);
    const sessao = await this.sessao(sessaoId);
    const r = await this.dataSource.transaction(async (m) => {
      const n =
        autor.tipo === 'LICITANTE'
          ? await this.negociacaoDoLicitante(m, sessaoId, negociacaoId, autor.fornecedorId, false)
          : await this.negociacaoDaSessao(m, sessaoId, negociacaoId, false);
      await exigirLicitacaoAtiva(m, sessao.licitacao_id, { bloquear: true });
      if (n.status !== StatusNegociacao.EM_ANDAMENTO) throw new ConflictException('Esta negociação já foi concluída');
      const e = await this.eventoAcompanhado(m, n, {
        tipo: TipoEvento.NEGOCIACAO_MENSAGEM,
        descricao: texto,
        autor: autor.tipo,
        usuario: autor.tipo === 'AGENTE' ? autor.nome : undefined,
      });
      return { n, e };
    });
    this.emitirMensagens(sessaoId, r.n.fornecedor_id, [r.e]);
    return this.mensagemSocket(r.e);
  }

  /** Encerra sem (nova) redução — valor mantido; resultado público. */
  async encerrar(sessaoId: string, negociacaoId: string, motivo: string | undefined, ator: AtorTransicao, usuarioNome?: string) {
    const sessao = await this.sessao(sessaoId);
    const texto = (motivo ?? '').trim();
    const n = await this.dataSource.transaction(async (m) => {
      const pre = await this.negociacaoDaSessao(m, sessaoId, negociacaoId, false);
      await this.prepararAto(m, sessao, pre.unidade_id);
      const n = await this.negociacaoDaSessao(m, sessaoId, negociacaoId);
      const erro = motivoNaoEncerra(n);
      if (erro) throw new ConflictException(erro);
      const u = await this.unidadeDa(m, n);
      const atual = await this.exigirNaVez(m, n, u);
      const reduziu = (n.rodadas ?? []).some((r) => r.status === StatusContraproposta.ACEITA);
      n.status = StatusNegociacao.CONCLUIDA;
      n.resultado = reduziu ? ResultadoNegociacao.REDUZIDO : ResultadoNegociacao.MANTIDO;
      n.valor_final = atual.melhorValor;
      n.valor_final_total = totalDaBase(atual.melhorValor, n.base_lance, Number(n.quantidade));
      n.encerrada_em = new Date();
      n.encerrada_motivo = texto || null;
      await m.save(n);
      await this.eventoPublico(m, n, {
        tipo: TipoEvento.NEGOCIACAO_ENCERRADA,
        descricao:
          `${this.rotulo(u)}: negociação concluída — valor ${reduziu ? 'negociado' : 'mantido'} de ${brl(atual.melhorValor)} ` +
          '(Lei 14.133/2021, art. 61 §1º; IN SEGES 73/2022, art. 30 §3º).',
        usuario: usuarioNome ?? sessao.pregoeiro_nome ?? undefined,
        valor: atual.melhorValor,
        dados: { resultado: n.resultado, valor_final: atual.melhorValor },
      });
      return n;
    });
    this.emitirParticipantes(sessaoId, n.fornecedor_id, 'negociacao_atualizada', { negociacaoId: n.id, unidadeId: n.unidade_id, status: n.status });
    this.emitirResultado(sessaoId, { unidadeId: n.unidade_id, status: n.status, resultado: n.resultado, valorFinal: Number(n.valor_final) });
    return this.visao(n, true);
  }

  /**
   * Desclassifica o licitante que permaneceu acima do preço máximo depois da
   * negociação (Lei 14.133 art. 59 III; IN 73 art. 30 §1º): situação
   * DESCLASSIFICADO (sai do ranking), convocação de aceitação dele cancelada e
   * o PRÓXIMO do ranking é chamado à negociação automaticamente. Sem próximo,
   * a unidade fracassa.
   */
  async desclassificar(sessaoId: string, negociacaoId: string, motivo: string | undefined, ator: AtorTransicao, usuarioNome?: string) {
    const sessao = await this.sessao(sessaoId);
    const complemento = (motivo ?? '').trim();
    let fracassou = false;
    const r = await this.dataSource.transaction(async (m) => {
      const pre = await this.negociacaoDaSessao(m, sessaoId, negociacaoId, false);
      await this.prepararAto(m, sessao, pre.unidade_id);
      const n = await this.negociacaoDaSessao(m, sessaoId, negociacaoId);
      const u = await this.unidadeDa(m, n);
      const atual = n.status === StatusNegociacao.EM_ANDAMENTO ? await this.exigirNaVez(m, n, u) : null;
      const valorAtualNaBase = atual?.melhorValor ?? Number(n.valor_inicial);
      const valorTotal = totalDaBase(valorAtualNaBase, n.base_lance, Number(n.quantidade));
      const precoMaximo = precoMaximoDaUnidade(u.itens);
      const erro = motivoNaoDesclassifica(n, valorTotal, precoMaximo);
      if (erro) throw new ConflictException(erro);

      const textoMotivo =
        `Proposta de ${brl(valorTotal)} permaneceu acima do preço máximo da contratação após a negociação ` +
        `(Lei 14.133/2021, art. 59, III; IN SEGES 73/2022, art. 30 §1º)` + (complemento ? `. ${complemento}` : '');
      n.status = StatusNegociacao.CONCLUIDA;
      n.resultado = ResultadoNegociacao.DESCLASSIFICADO;
      n.valor_final = valorAtualNaBase;
      n.valor_final_total = valorTotal;
      n.encerrada_em = new Date();
      n.encerrada_motivo = textoMotivo;
      await m.save(n);
      await this.ranking.definirSituacao(m, u, n.fornecedor_id, SituacaoLicitante.DESCLASSIFICADO, { motivo: textoMotivo, ator });
      await m
        .createQueryBuilder()
        .update(AceitacaoProposta)
        .set({ status: StatusAceitacao.CANCELADA, decidida_em: () => 'now()', decisao_motivo: `Licitante desclassificado na negociação: ${textoMotivo}` })
        .where('unidade_id = :u AND fornecedor_id = :f AND status IN (:...s)', { u: u.id, f: n.fornecedor_id, s: [...STATUS_ACEITACAO_ATIVOS] })
        .execute();
      await this.eventoPublico(m, n, {
        tipo: TipoEvento.NEGOCIACAO_ENCERRADA,
        descricao: `${this.rotulo(u)}: negociação concluída sem valor dentro do preço máximo — valor final de ${brl(valorAtualNaBase)}.`,
        usuario: usuarioNome ?? sessao.pregoeiro_nome ?? undefined,
        valor: valorAtualNaBase,
        dados: { resultado: n.resultado, valor_final: valorAtualNaBase },
      });
      await m.save(
        m.create(EventoSessao, {
          sessao_id: sessaoId,
          tipo: TipoEvento.PROPOSTA_DESCLASSIFICADA,
          descricao: `${this.rotulo(u)}: proposta do ${n.posicao ?? ''}º colocado DESCLASSIFICADA. Motivo: ${textoMotivo}`,
          item_id: u.tipo === 'ITEM' ? u.id : undefined,
          fornecedor_id: n.fornecedor_id,
          fornecedor_identificador: n.fornecedor_id,
          usuario_nome: usuarioNome ?? sessao.pregoeiro_nome ?? 'SISTEMA',
          is_sistema: false,
          dados_adicionais: { negociacao_id: n.id, unidade_id: u.id, motivo: textoMotivo },
        }),
      );

      // IN 73 art. 30 §1º: a negociação segue com o próximo, na ordem de classificação
      const proximo = atualDaUnidade(await this.ranking.ranking(u, m));
      let nova: NegociacaoUnidade | null = null;
      if (proximo) {
        try {
          nova = await this.abrirNaTransacao(m, sessao, u, ator, usuarioNome, 'AUTOMATICA');
        } catch (e: any) {
          // ex.: desempate ME/EPP pendente — o agente abre depois; registra o motivo na ata
          await m.save(
            m.create(EventoSessao, {
              sessao_id: sessaoId,
              tipo: TipoEvento.MENSAGEM_SISTEMA,
              descricao: `${this.rotulo(u)}: a negociação com o próximo colocado não foi aberta automaticamente — ${e?.message ?? 'pendência na unidade'}.`,
              item_id: u.tipo === 'ITEM' ? u.id : undefined,
              usuario_nome: 'SISTEMA',
              is_sistema: true,
            }),
          );
        }
      } else {
        fracassou = true;
        await m.update(
          ItemLicitacao,
          u.itens.map((i) => i.id),
          { status: StatusItem.FRACASSADO, observacoes: 'Fracassado: nenhuma proposta dentro do preço máximo após a negociação (art. 59 III)' },
        );
        await m.save(
          m.create(EventoSessao, {
            sessao_id: sessaoId,
            tipo: TipoEvento.UNIDADE_FRACASSADA,
            descricao: `${this.rotulo(u)} FRACASSADO: não há mais licitantes classificados para negociar.`,
            item_id: u.tipo === 'ITEM' ? u.id : undefined,
            usuario_nome: 'SISTEMA',
            is_sistema: true,
            dados_adicionais: { unidade_id: u.id, tipo_unidade: u.tipo },
          }),
        );
      }
      return { n, nova };
    });
    if (fracassou) await this.transicoes.aplicarRollup(sessao.licitacao_id, ator);
    this.emitirParticipantes(sessaoId, r.n.fornecedor_id, 'negociacao_atualizada', { negociacaoId: r.n.id, unidadeId: r.n.unidade_id, status: r.n.status });
    this.emitirResultado(sessaoId, { unidadeId: r.n.unidade_id, status: r.n.status, resultado: r.n.resultado, valorFinal: Number(r.n.valor_final) });
    if (r.nova) {
      this.emitirParticipantes(sessaoId, r.nova.fornecedor_id, 'negociacao_atualizada', { negociacaoId: r.nova.id, unidadeId: r.nova.unidade_id, status: r.nova.status });
      this.emitirResultado(sessaoId, { unidadeId: r.nova.unidade_id, status: 'EM_ANDAMENTO', posicao: r.nova.posicao });
    }
    return {
      desclassificada: this.visao(r.n, true),
      proximaNegociacao: r.nova ? this.visao(r.nova, true) : null,
      unidadeFracassada: fracassou,
    };
  }

  // ==========================================================================
  // ATO DO LICITANTE — resposta à contraproposta (fornecedor do token)
  // ==========================================================================

  /**
   * Aceite: o valor da contraproposta vira lance NEGOCIACAO pelo motor (que
   * exige valor menor que o atual do licitante), a negociação é concluída
   * (REDUZIDO, resultado público) e a convocação de aceitação ativa passa a
   * exigir a proposta adequada ao valor negociado. Recusa: com motivo; a
   * negociação segue aberta para nova contraproposta, encerramento ou
   * desclassificação.
   */
  async responder(sessaoId: string, negociacaoId: string, fornecedorId: string, dados: { aceitar?: boolean; motivo?: string | null }) {
    if (typeof dados.aceitar !== 'boolean') throw new BadRequestException('Informe se aceita (true) ou recusa (false) a contraproposta');
    const sessao = await this.sessao(sessaoId);
    return dados.aceitar
      ? this.aceitarContraproposta(sessao, negociacaoId, fornecedorId)
      : this.recusarContraproposta(sessao, negociacaoId, fornecedorId, (dados.motivo ?? '').trim());
  }

  private async recusarContraproposta(sessao: SessaoDisputa, negociacaoId: string, fornecedorId: string, motivo: string) {
    if (motivo.length < 5) throw new BadRequestException('Informe o motivo da recusa da contraproposta');
    const emitir: EventoSessao[] = [];
    const n = await this.dataSource.transaction(async (m) => {
      const pre = await this.negociacaoDoLicitante(m, sessao.id, negociacaoId, fornecedorId, false);
      await this.prepararAto(m, sessao, pre.unidade_id);
      const n = await this.negociacaoDoLicitante(m, sessao.id, negociacaoId, fornecedorId);
      const erro = motivoNaoResponde(n);
      if (erro) throw new ConflictException(erro);
      await this.exigirNaVez(m, n, await this.unidadeDa(m, n));
      const agora = new Date();
      n.contraproposta_status = StatusContraproposta.RECUSADA;
      n.rodadas = (n.rodadas ?? []).map((r, i, arr) =>
        i === arr.length - 1 ? { ...r, status: StatusContraproposta.RECUSADA, respondidaEm: agora.toISOString(), motivo: motivo.slice(0, 500) } : r,
      );
      await m.save(n);
      emitir.push(
        await this.eventoAcompanhado(m, n, {
          tipo: TipoEvento.NEGOCIACAO_RECUSADA,
          descricao: `O licitante recusou a contraproposta de ${brl(Number(n.contraproposta_valor))}. Motivo: ${motivo.slice(0, 500)}`,
          autor: 'LICITANTE',
          valor: Number(n.contraproposta_valor),
          dados: { motivo: motivo.slice(0, 500) },
        }),
      );
      return n;
    });
    this.emitirMensagens(sessao.id, fornecedorId, emitir);
    this.emitirParticipantes(sessao.id, fornecedorId, 'negociacao_atualizada', { negociacaoId: n.id, unidadeId: n.unidade_id, status: n.status });
    return this.visao(n, false);
  }

  private async aceitarContraproposta(sessao: SessaoDisputa, negociacaoId: string, fornecedorId: string) {
    // 1) Reserva a contraproposta (PROCESSANDO) — dois aceites simultâneos não registram dois lances
    const reservada = await this.dataSource.transaction(async (m) => {
      const pre = await this.negociacaoDoLicitante(m, sessao.id, negociacaoId, fornecedorId, false);
      await this.prepararAto(m, sessao, pre.unidade_id);
      const n = await this.negociacaoDoLicitante(m, sessao.id, negociacaoId, fornecedorId);
      const erro = motivoNaoResponde(n);
      if (erro) throw new ConflictException(erro);
      await this.exigirNaVez(m, n, await this.unidadeDa(m, n));
      n.contraproposta_status = StatusContraproposta.PROCESSANDO;
      await m.save(n);
      return n;
    });
    const valor = Number(reservada.contraproposta_valor);

    // 2) Lance NEGOCIACAO pelo motor único (valida redução, item/lote encerrado, rateio no lote)
    let lanceId: string;
    try {
      const r = await this.disputa.registrarLanceComResultado({
        sessaoId: sessao.id,
        itemId: reservada.unidade_id,
        loteId: reservada.tipo_unidade === 'LOTE' ? reservada.unidade_id : undefined,
        fornecedorId,
        valor,
        origem: OrigemLance.NEGOCIACAO,
      });
      lanceId = r.lance.id;
    } catch (e) {
      await this.dataSource.manager.update(
        NegociacaoUnidade,
        { id: reservada.id, contraproposta_status: StatusContraproposta.PROCESSANDO },
        { contraproposta_status: StatusContraproposta.PENDENTE },
      );
      throw e;
    }

    // 3) Conclui a negociação (REDUZIDO), resultado público, readequa a convocação ativa
    const emitir: EventoSessao[] = [];
    const r = await this.dataSource.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`aceitacao:${reservada.unidade_id}`]);
      const n = await this.negociacaoDoLicitante(m, sessao.id, negociacaoId, fornecedorId);
      const u = await this.unidadeDa(m, n);
      const agora = new Date();
      const valorTotal = totalDaBase(valor, n.base_lance, Number(n.quantidade));
      n.contraproposta_status = StatusContraproposta.ACEITA;
      n.rodadas = (n.rodadas ?? []).map((x, i, arr) =>
        i === arr.length - 1 ? { ...x, status: StatusContraproposta.ACEITA, respondidaEm: agora.toISOString(), lanceId } : x,
      );
      n.lance_id = lanceId;
      n.status = StatusNegociacao.CONCLUIDA;
      n.resultado = ResultadoNegociacao.REDUZIDO;
      n.valor_final = valor;
      n.valor_final_total = valorTotal;
      n.encerrada_em = agora;
      await m.save(n);
      emitir.push(
        await this.eventoAcompanhado(m, n, {
          tipo: TipoEvento.NEGOCIACAO_ACEITA,
          descricao: `O licitante aceitou a contraproposta de ${brl(valor)}.`,
          autor: 'LICITANTE',
          valor,
          dados: { lance_id: lanceId },
        }),
      );
      await this.eventoPublico(m, n, {
        tipo: TipoEvento.NEGOCIACAO_ENCERRADA,
        descricao:
          `${this.rotulo(u)}: negociação concluída — valor negociado de ${brl(valor)} ` +
          '(Lei 14.133/2021, art. 61 §1º; IN SEGES 73/2022, art. 30 §3º).',
        valor,
        dados: { resultado: n.resultado, valor_final: valor, lance_id: lanceId },
      });
      const readequada = await this.aceitacao.readequarAposNegociacao(m, sessao.id, u, fornecedorId, atorSistema('negociacao'));
      return { n, readequada };
    });
    this.emitirMensagens(sessao.id, fornecedorId, emitir);
    this.emitirParticipantes(sessao.id, fornecedorId, 'negociacao_atualizada', { negociacaoId: r.n.id, unidadeId: r.n.unidade_id, status: r.n.status });
    this.emitirResultado(sessao.id, { unidadeId: r.n.unidade_id, status: r.n.status, resultado: r.n.resultado, valorFinal: valor });
    return { ...this.visao(r.n, false), lanceId, propostaAdequadaReaberta: !!r.readequada };
  }
}

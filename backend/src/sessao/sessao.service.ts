import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { SessaoDisputa, StatusSessao, EtapaSessao } from './entities/sessao-disputa.entity';
import { EventoSessao, TipoEvento } from './entities/evento-sessao.entity';
import { Licitacao, FaseLicitacao } from '../licitacoes/entities/licitacao.entity';
import { ItemLicitacao, StatusDisputaItem } from '../itens/entities/item-licitacao.entity';
import { Lance } from '../disputa-v2/entities/lance.entity';
import { DisputaService } from '../disputa-v2/disputa.service';
import { ParametrosDisputaService } from '../disputa-v2/parametros-disputa.service';
import { OrigemLance, valoresGravados, BaseLance } from '../disputa-v2/modelo-lance';
import { Proposta } from '../propostas/entities/proposta.entity';
import { PropostaItem } from '../propostas/entities/proposta-item.entity';
import { ParametrosLicitacaoService } from '../parametros-licitacao/parametros-licitacao.service';
import { TransicoesService } from '../licitacoes/transicoes/transicoes.service';
import { AtoLicitacao, AtorTransicao } from '../licitacoes/transicoes/transicoes.tipos';
import { exigirLicitacaoAtiva, motivoSessaoBloqueada } from './licitacao-ativa';
import { pedirEncerramentoDisputa } from './transicoes-sessao';
import { motivoModoCriterioInvalido } from '../disputa-v2/modos-disputa';
import { exigirRetomadaPermitida, retomarRelogiosDaSessao } from '../disputa-v2/desconexao-pregoeiro.service';
import { ordemSql } from '../disputa-v2/modos-disputa';
import { RankingService, UnidadeJulgamento } from '../julgamento/ranking.service';
import { AceitacaoService } from '../julgamento/aceitacao.service';

/**
 * Servico de Controle da Sessao de Disputa
 * Implementa regras da Lei 14.133/2021 e IN SEGES/ME
 */
@Injectable()
export class SessaoService {
  constructor(
    private readonly parametrosService: ParametrosLicitacaoService,
    @InjectRepository(SessaoDisputa)
    private readonly sessaoRepository: Repository<SessaoDisputa>,
    @InjectRepository(EventoSessao)
    private readonly eventoRepository: Repository<EventoSessao>,
    @InjectRepository(Licitacao)
    private readonly licitacaoRepository: Repository<Licitacao>,
    @InjectRepository(ItemLicitacao)
    private readonly itemRepository: Repository<ItemLicitacao>,
    @InjectRepository(Lance)
    private readonly lanceRepository: Repository<Lance>,
    @InjectRepository(Proposta)
    private readonly propostaRepository: Repository<Proposta>,
    @InjectRepository(PropostaItem)
    private readonly propostaItemRepository: Repository<PropostaItem>,
    private readonly transicoes: TransicoesService,
    private readonly disputa: DisputaService,
    private readonly parametrosDisputa: ParametrosDisputaService,
    private readonly ranking: RankingService,
    private readonly aceitacao: AceitacaoService,
  ) {}

  // ========================================
  // RANKING ÚNICO (plano E3 — fim do B4/B3)
  // ========================================

  /** Razão social / CNPJ / porte dos licitantes (cadastro). */
  private async cadastroFornecedores(ids: string[]): Promise<Map<string, { razaoSocial: string; cpfCnpj: string; porte: string | null }>> {
    const validos = [...new Set(ids.filter(Boolean))];
    if (!validos.length) return new Map();
    const rows: any[] = await this.licitacaoRepository.manager.query(
      `SELECT id::text AS id, razao_social, cpf_cnpj, porte::text AS porte FROM fornecedores WHERE id::text = ANY($1)`,
      [validos],
    );
    return new Map(rows.map((r) => [r.id, { razaoSocial: r.razao_social, cpfCnpj: r.cpf_cnpj ?? '', porte: r.porte ?? null }]));
  }

  /**
   * Ranking por LICITANTE da licitação, a partir do ranking único por unidade
   * (lances + situação do licitante). `valorTotal` = soma, nas unidades em que
   * ele está na vez ou classificado, do seu melhor valor TOTAL.
   */
  private async rankingPorLicitante(licitacaoId: string) {
    const { porUnidade, agregado } = await this.ranking.rankingAgregado(licitacaoId);
    const cadastro = await this.cadastroFornecedores(agregado.map((a) => a.fornecedorId));
    const totalDoLicitante = (fid: string) =>
      Math.round(
        porUnidade.reduce((soma, { unidade, ranking }) => {
          const e = ranking.find((r) => r.fornecedorId === fid);
          if (!e) return soma;
          const qtd = unidade.tipo === 'ITEM' ? unidade.itens[0]?.quantidade || 1 : 1;
          return soma + (unidade.baseLance === BaseLance.UNITARIO ? e.melhorValor * qtd : e.melhorValor);
        }, 0) * 100,
      ) / 100;
    const situacoesDo = (fid: string) =>
      porUnidade
        .map(({ unidade, ranking }) => ({ unidade, e: ranking.find((r) => r.fornecedorId === fid) }))
        .filter((x) => !!x.e)
        .map(({ unidade, e }) => ({ tipo: unidade.tipo, unidadeId: unidade.id, numero: unidade.numero, posicao: e!.posicao, situacao: e!.situacao }));
    const lista = agregado.map((a) => ({
      fornecedorId: a.fornecedorId,
      razaoSocial: cadastro.get(a.fornecedorId)?.razaoSocial ?? a.fornecedorNome,
      cpfCnpj: cadastro.get(a.fornecedorId)?.cpfCnpj ?? '',
      porte: cadastro.get(a.fornecedorId)?.porte ?? null,
      valorTotal: totalDoLicitante(a.fornecedorId),
      melhorPosicao: a.melhorPosicao,
      excluido: a.excluidoEmTodas,
      unidades: situacoesDo(a.fornecedorId),
    }));
    return { porUnidade, lista };
  }

  /**
   * Resultado de cada ITEM pelo ranking único: vencedor da unidade (item ou
   * lote do item) — nunca RECUSADO/INABILITADO/DESCLASSIFICADO — e o melhor
   * lance ATIVO dele no item (no lote, a linha de rateio do lance vencedor).
   */
  private async resultadoPorItem(
    licitacaoId: string,
    manager?: EntityManager,
  ): Promise<Map<string, { item: ItemLicitacao; fornecedorId: string; lance: Lance } | null>> {
    const m = manager ?? this.licitacaoRepository.manager;
    const unidades = await this.ranking.unidades(licitacaoId, m);
    const direcao = await this.ranking.direcao(licitacaoId, m);
    const itens = await m.find(ItemLicitacao, { where: { licitacao_id: licitacaoId }, order: { numero_item: 'ASC' } });
    const vencedores = new Map<string, string | null>();
    const saida = new Map<string, { item: ItemLicitacao; fornecedorId: string; lance: Lance } | null>();
    for (const item of itens) {
      const u: UnidadeJulgamento | undefined = unidades.find((x) => x.itens.some((i) => i.id === item.id));
      if (!u) {
        saida.set(item.id, null);
        continue;
      }
      if (!vencedores.has(u.id)) vencedores.set(u.id, (await this.ranking.vencedor(u, m))?.fornecedorId ?? null);
      const fid = vencedores.get(u.id);
      if (!fid) {
        saida.set(item.id, null);
        continue;
      }
      const lance = await m.findOne(Lance, {
        where: { item_id: item.id, licitacao_id: licitacaoId, fornecedor_id: fid, cancelado: false },
        order: { valor: ordemSql(direcao), created_at: 'ASC' },
      });
      saida.set(item.id, lance ? { item, fornecedorId: fid, lance } : null);
    }
    return saida;
  }

  // ========================================
  // GUARDAS E TRANSIÇÕES DA LICITAÇÃO (plano E1)
  // ========================================

  /**
   * Sessão do ato (404) com a licitação ATIVA (409 se suspensa/encerrada).
   * Todo ato da sala passa por aqui.
   */
  private async sessaoParaAto(sessaoId: string): Promise<SessaoDisputa> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');
    await exigirLicitacaoAtiva(this.licitacaoRepository, sessao.licitacao_id);
    return sessao;
  }

  /** Abertura da disputa (INICIAR_DISPUTA; idempotente se a licitação já passou dela). */
  private async iniciarDisputaDaLicitacao(licitacaoId: string, ator: AtorTransicao): Promise<void> {
    await this.transicoes.executar(licitacaoId, AtoLicitacao.INICIAR_DISPUTA, {
      ator,
      ignorarSeJaAplicado: true,
      registro: { origem: 'sessao' },
    });
  }

  /**
   * Adjudicação pela sala: DECIDIR_RECURSOS se a licitação está em RECURSO,
   * senão ADJUDICAR (idempotente se já adjudicada/homologada).
   */
  private async adjudicarLicitacao(
    licitacaoId: string,
    ator: AtorTransicao,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(Licitacao) : this.licitacaoRepository;
    const lic = await repo.findOne({ where: { id: licitacaoId }, select: { id: true, fase: true } });
    const ato = lic?.fase === FaseLicitacao.RECURSO ? AtoLicitacao.DECIDIR_RECURSOS : AtoLicitacao.ADJUDICAR;
    await this.transicoes.executar(licitacaoId, ato, {
      ator,
      manager,
      ignorarSeJaAplicado: true,
      registro: { origem: 'sessao' },
    });
  }

  // ========================================
  // CRIACAO E CONFIGURACAO DA SESSAO
  // ========================================

  async criarSessao(licitacaoId: string, pregoeiroId: string, pregoeiroNome: string): Promise<SessaoDisputa> {
    const licitacao = await this.licitacaoRepository.findOneBy({ id: licitacaoId });
    if (!licitacao) {
      throw new NotFoundException('Licitacao nao encontrada');
    }
    const bloqueio = motivoSessaoBloqueada(licitacao.situacao);
    if (bloqueio) throw new ConflictException({ message: bloqueio, situacao: licitacao.situacao });

    if (licitacao.fase !== FaseLicitacao.ACOLHIMENTO_PROPOSTAS && licitacao.fase !== FaseLicitacao.ANALISE_PROPOSTAS) {
      throw new BadRequestException('Licitacao nao esta na fase correta para iniciar sessao');
    }

    // Verifica se ja existe sessao ativa
    const sessaoExistente = await this.sessaoRepository.findOne({
      where: { licitacao_id: licitacaoId, status: StatusSessao.EM_ANDAMENTO }
    });

    if (sessaoExistente) {
      throw new BadRequestException('Ja existe uma sessao ativa para esta licitacao');
    }

    // Determina tipo de disputa baseado na configuração da licitação
    // Lei 14.133/2021, Art. 56
    const disputaPorItem = !licitacao.usa_lotes; // Se não usa lotes, disputa é por item
    const modoAberto = licitacao.modo_disputa === 'ABERTO' || licitacao.modo_disputa === 'ABERTO_FECHADO';
    const modoAbertoFechado = licitacao.modo_disputa === 'ABERTO_FECHADO' || licitacao.modo_disputa === 'FECHADO_ABERTO';

    // Tempos: resolvedor único (licitação → órgão → sistema) — a sessão guarda
    // a cópia; o pregoeiro pode ajustá-los na sala (disputa-v2 configuracoes).
    const parametros = await this.parametrosService.resolver(licitacao.orgao_id);
    const iniciais = await this.parametrosDisputa.valoresIniciaisDaSessao(licitacaoId);

    const sessao = this.sessaoRepository.create({
      licitacao_id: licitacaoId,
      pregoeiro_id: pregoeiroId,
      pregoeiro_nome: pregoeiroNome,
      status: StatusSessao.AGUARDANDO_INICIO,
      etapa: EtapaSessao.ABERTURA_SESSAO,
      data_hora_inicio_prevista: licitacao.data_abertura_sessao,
      // Configurações da licitação
      disputa_por_item: disputaPorItem,
      modo_aberto: modoAberto,
      modo_aberto_fechado: modoAbertoFechado,
      ...iniciais,
      lance_final_fechado_minutos: parametros.lance_final_fechado_minutos,
      etapa_aberta_minutos_hibrido: parametros.etapa_aberta_hibrida_minutos,
    });

    return await this.sessaoRepository.save(sessao);
  }

  // ========================================
  // INICIO DA SESSAO
  // ========================================

  async iniciarSessao(sessaoId: string, ator: AtorTransicao): Promise<SessaoDisputa> {
    const sessao = await this.sessaoParaAto(sessaoId);

    // Modo de disputa × critério (Lei 14.133 art. 56 §§1º e 2º) conferidos na abertura
    const licModo = await this.licitacaoRepository.findOne({
      where: { id: sessao.licitacao_id },
      select: { id: true, modo_disputa: true, criterio_julgamento: true },
    });
    const vedacaoModo = motivoModoCriterioInvalido(licModo?.modo_disputa, licModo?.criterio_julgamento);
    if (vedacaoModo) throw new BadRequestException(vedacaoModo);

    if (sessao.status !== StatusSessao.AGUARDANDO_INICIO) {
      throw new BadRequestException('Sessao ja foi iniciada ou encerrada');
    }

    // Validar data de abertura da sessão
    if (sessao.data_hora_inicio_prevista) {
      const agora = new Date();
      const dataAbertura = new Date(sessao.data_hora_inicio_prevista);
      
      if (agora < dataAbertura) {
        const dataFormatada = dataAbertura.toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        throw new BadRequestException(
          `A sessão só pode ser iniciada a partir de ${dataFormatada}. Aguarde a data de abertura programada.`
        );
      }
    }

    sessao.status = StatusSessao.EM_ANDAMENTO;
    sessao.etapa = EtapaSessao.ABERTURA_SESSAO;
    sessao.data_hora_inicio_real = new Date();

    // Abertura da sessão = fim do recebimento de propostas (ENCERRAR_ACOLHIMENTO,
    // idempotente se o cron/cockpit já encerrou) — mesma transação da sessão.
    await this.sessaoRepository.manager.transaction(async (manager) => {
      await this.transicoes.executar(sessao.licitacao_id, AtoLicitacao.ENCERRAR_ACOLHIMENTO, {
        ator,
        manager,
        ignorarSeJaAplicado: true,
        registro: { origem: 'sessao', sessao_id: sessao.id },
      });
      await manager.save(sessao);
    });

    // Registra evento
    await this.registrarEvento(sessao.id, TipoEvento.SESSAO_INICIADA, 
      'Sessao publica iniciada pelo Pregoeiro', undefined, undefined, sessao.pregoeiro_nome, true);

    return sessao;
  }

  /**
   * Reabre uma sessão encerrada para continuar a disputa
   */
  async reabrirSessao(sessaoId: string): Promise<SessaoDisputa> {
    const sessao = await this.sessaoParaAto(sessaoId);

    if (sessao.status !== StatusSessao.ENCERRADA && sessao.status !== StatusSessao.SUSPENSA) {
      throw new BadRequestException('Apenas sessoes encerradas ou suspensas podem ser reabertas');
    }
    // Suspensa por desconexão do agente: só 24 h após a comunicação (IN 73 art. 27 §1º);
    // relógios de itens/lotes recomeçam (desconexão) ou são deslocados pela pausa
    if (sessao.status === StatusSessao.SUSPENSA) {
      const retomada = await exigirRetomadaPermitida(this.sessaoRepository.manager, sessaoId);
      await retomarRelogiosDaSessao(this.sessaoRepository.manager, sessaoId, sessao.licitacao_id, retomada.porDesconexao);
    }

    // Verifica se a licitação ainda está em fase de disputa
    const licitacao = await this.licitacaoRepository.findOneBy({ id: sessao.licitacao_id });
    if (!licitacao) throw new NotFoundException('Licitacao nao encontrada');

    // Permite reabrir se a licitação ainda está em fase de disputa ou análise
    const fasesPermitidas = [FaseLicitacao.EM_DISPUTA, FaseLicitacao.ANALISE_PROPOSTAS, FaseLicitacao.JULGAMENTO];
    if (!fasesPermitidas.includes(licitacao.fase)) {
      throw new BadRequestException(`Licitacao esta na fase ${licitacao.fase}, nao e possivel reabrir a sessao`);
    }

    sessao.status = StatusSessao.EM_ANDAMENTO;
    sessao.etapa = EtapaSessao.DISPUTA_LANCES;

    await this.sessaoRepository.save(sessao);
    
    // Limpar data de encerramento via query direta
    await this.sessaoRepository.update(sessao.id, { data_hora_encerramento: null as any });

    // Registra evento
    await this.registrarEvento(sessao.id, TipoEvento.SESSAO_RETOMADA, 
      'Sessao reaberta pelo Pregoeiro', undefined, undefined, sessao.pregoeiro_nome, true);

    return sessao;
  }

  // ========================================
  // CONTROLE DE ETAPAS
  // ========================================

  async avancarParaDisputa(sessaoId: string, ator: AtorTransicao): Promise<SessaoDisputa> {
    const sessao = await this.sessaoParaAto(sessaoId);

    if (sessao.etapa !== EtapaSessao.ANALISE_PROPOSTAS && sessao.etapa !== EtapaSessao.DESCLASSIFICACAO_PROPOSTAS) {
      throw new BadRequestException('Etapa atual nao permite iniciar disputa');
    }

    // Abertura da etapa de lances: INICIAR_DISPUTA (pré-condições: data de
    // abertura e propostas aptas) antes de mexer na sessão
    await this.iniciarDisputaDaLicitacao(sessao.licitacao_id, ator);

    sessao.etapa = EtapaSessao.DISPUTA_LANCES;
    sessao.status = StatusSessao.MODO_ABERTO;
    sessao.ultimo_lance_em = new Date();

    await this.sessaoRepository.save(sessao);

    await this.registrarEvento(sessao.id, TipoEvento.DISPUTA_INICIADA,
      'Etapa de lances iniciada', undefined, undefined, sessao.pregoeiro_nome, true);

    return sessao;
  }

  /**
   * Inicia a disputa de um item pela sala legada — delega ao motor único
   * (disputa-v2): conversão proposta→lance, códigos anônimos e relógio são dele.
   */
  async iniciarDisputaItem(sessaoId: string, itemId: string, ator: AtorTransicao): Promise<SessaoDisputa> {
    await this.sessaoParaAto(sessaoId);
    const item = await this.itemRepository.findOneBy({ id: itemId });
    if (!item) throw new NotFoundException('Item nao encontrado');
    await this.disputa.iniciarDisputa(sessaoId, [itemId], ator);
    return this.sessaoRepository.findOneByOrFail({ id: sessaoId });
  }

  /**
   * Inicia todos os itens aguardando — pelo motor único. A disputa por LOTE
   * (valor global do lote) é do motor de lote (próxima etapa): o motor recusa
   * com 409 enquanto a licitação estiver com base TOTAL_LOTE.
   */
  async iniciarDisputaTodosItens(sessaoId: string, ator: AtorTransicao): Promise<{
    sessao: SessaoDisputa;
    itensIniciados: number;
    lotesIniciados: number;
    tipoDisputa: 'POR_ITEM' | 'POR_LOTE';
  }> {
    const sessao = await this.sessaoParaAto(sessaoId);
    const itens = await this.itemRepository.find({ where: { licitacao_id: sessao.licitacao_id }, select: ['id'] });
    const { itensIniciados } = await this.disputa.iniciarDisputa(sessaoId, itens.map((i) => i.id), ator);
    return {
      sessao: await this.sessaoRepository.findOneByOrFail({ id: sessaoId }),
      itensIniciados,
      lotesIniciados: 0,
      tipoDisputa: 'POR_ITEM',
    };
  }

  /** Inicia os itens selecionados — pelo motor único. */
  async iniciarItensSelecionados(sessaoId: string, itensIds: string[], ator: AtorTransicao): Promise<{ itensIniciados: number }> {
    await this.sessaoParaAto(sessaoId);
    return this.disputa.iniciarDisputa(sessaoId, itensIds, ator);
  }

  /**
   * Encerra a disputa do item atual (legado item_atual_id) — pelo motor.
   */
  async encerrarDisputaItem(sessaoId: string, ator: AtorTransicao): Promise<SessaoDisputa> {
    const sessao = await this.sessaoParaAto(sessaoId);
    if (!sessao.item_atual_id) throw new BadRequestException('Nenhum item em disputa nesta sessao');
    await this.disputa.encerrarItem(sessaoId, sessao.item_atual_id, ator);
    return this.sessaoRepository.findOneByOrFail({ id: sessaoId });
  }

  /** Encerra a disputa de um item por ID — pelo motor (único caminho de encerramento). */
  async encerrarDisputaItemPorId(sessaoId: string, itemId: string | undefined, ator: AtorTransicao): Promise<{ sessao: SessaoDisputa; itemNumero?: number }> {
    const sessao = await this.sessaoParaAto(sessaoId);
    const alvo = itemId || sessao.item_atual_id;
    if (!alvo) throw new BadRequestException('Nenhum item especificado para encerrar');
    const r = await this.disputa.encerrarItem(sessaoId, alvo, ator);
    return { sessao: await this.sessaoRepository.findOneByOrFail({ id: sessaoId }), itemNumero: r.itemNumero };
  }

  // ========================================
  // CONTROLE DE FASES - PREGOEIRO
  // ========================================

  /**
   * Permite ao pregoeiro alterar a fase/etapa da sessão
   * Útil para corrigir erros ou voltar a fases anteriores
   */
  async alterarFaseSessao(
    sessaoId: string, 
    novaEtapa: EtapaSessao, 
    novoStatus?: StatusSessao,
    motivo?: string
  ): Promise<SessaoDisputa> {
    const sessao = await this.sessaoParaAto(sessaoId);

    const etapaAnterior = sessao.etapa;
    const statusAnterior = sessao.status;

    sessao.etapa = novaEtapa;
    
    // Define status apropriado baseado na etapa
    if (novoStatus) {
      sessao.status = novoStatus;
    } else {
      // Status padrão por etapa
      if (novaEtapa === EtapaSessao.DISPUTA_LANCES || novaEtapa === EtapaSessao.RANDOM_ENCERRAMENTO) {
        sessao.status = StatusSessao.MODO_ABERTO;
      } else if (novaEtapa === EtapaSessao.ENCERRAMENTO) {
        sessao.status = StatusSessao.ENCERRADA;
      } else {
        sessao.status = StatusSessao.EM_ANDAMENTO;
      }
    }

    await this.sessaoRepository.save(sessao);

    // Registra evento de alteração de fase
    await this.registrarEvento(
      sessao.id,
      TipoEvento.MENSAGEM_SISTEMA,
      `Pregoeiro alterou fase: ${etapaAnterior} → ${novaEtapa}${motivo ? `. Motivo: ${motivo}` : ''}`,
      undefined,
      undefined,
      sessao.pregoeiro_nome,
      true,
      { etapa_anterior: etapaAnterior, etapa_nova: novaEtapa, status_anterior: statusAnterior, status_novo: sessao.status }
    );

    return sessao;
  }

  /**
   * Reinicia a disputa — pelo motor: retrato congelado + cancelamento LÓGICO
   * dos lances (o antigo DELETE de todos os lances da licitação foi removido).
   */
  async reiniciarDisputa(sessaoId: string, motivo: string | undefined, ator: AtorTransicao): Promise<SessaoDisputa> {
    await this.disputa.reiniciarSessao(sessaoId, motivo ?? '', ator);
    return this.sessaoRepository.findOneByOrFail({ id: sessaoId });
  }

  // ========================================
  // BENEFICIO ME/EPP (LC 123/2006) — E3: julgamento/me-epp (MeEppService).
  // Apuração automática do empate ficto no fim da etapa de lances da unidade;
  // a ME/EPP convocada responde SOZINHA pela sala (exercer/declinar). Os
  // antigos verificar/convocar/aceitar/recusar desta sala foram removidos.
  // ========================================

  // HABILITAÇÃO (arts. 62–70) — plano E4: habilitacao/habilitacao.service.ts
  // (exigências do edital, convocação com pré-checagem do registro cadastral,
  // documentos no banco, diligência, análise por documento, habilitar/
  // inabilitar, inversão de fases). Os antigos convocar/aprovar/reprovar e o
  // estado da habilitação desta sala foram removidos.

  // ========================================
  // RECURSOS (Art. 165) — plano E5: sessao/recursos.service.ts (janela de
  // intenção, admissibilidade, razões/contrarrazões do próprio licitante,
  // reconsideração/autoridade e efeito do provimento). O fluxo paralelo de
  // intenção por eventos (abrir/encerrar prazo, registrar, status) foi removido.
  // ========================================

  // ========================================
  // ADJUDICACAO E ENCERRAMENTO
  // ========================================

  async adjudicarItem(sessaoId: string, itemId: string, fornecedorId: string, valor: number): Promise<void> {
    const sessao = await this.sessaoParaAto(sessaoId);

    // B3: só se adjudica ao vencedor do ranking único (proposta aceita/habilitado;
    // nunca recusado, inabilitado ou desclassificado)
    const resultado = (await this.resultadoPorItem(sessao.licitacao_id)).get(itemId);
    if (!resultado || resultado.fornecedorId !== fornecedorId) {
      throw new BadRequestException('O fornecedor informado não é o vencedor deste item pelo julgamento (ranking de lances e situação do licitante).');
    }

    sessao.etapa = EtapaSessao.ADJUDICACAO;
    await this.sessaoRepository.save(sessao);

    await this.registrarEvento(sessao.id, TipoEvento.ITEM_ADJUDICADO,
      `Item adjudicado ao fornecedor ${fornecedorId} pelo valor de R$ ${valor.toFixed(2)}`,
      itemId, fornecedorId, sessao.pregoeiro_nome, false, { valor });
  }

  async encerrarSessao(sessaoId: string, ator: AtorTransicao): Promise<SessaoDisputa> {
    const sessao = await this.sessaoParaAto(sessaoId);

    sessao.status = StatusSessao.ENCERRADA;
    sessao.etapa = EtapaSessao.ENCERRAMENTO;
    sessao.data_hora_encerramento = new Date();

    // Licitação → ADJUDICACAO pelo ato nomeado (ADJUDICAR, ou DECIDIR_RECURSOS
    // em RECURSO); fora do rito (ainda em disputa/julgamento) → 409
    await this.sessaoRepository.manager.transaction(async (manager) => {
      await this.adjudicarLicitacao(sessao.licitacao_id, ator, manager);
      await manager.save(sessao);
    });

    await this.registrarEvento(sessao.id, TipoEvento.SESSAO_ENCERRADA,
      'Sessao publica encerrada pelo Pregoeiro',
      undefined, undefined, sessao.pregoeiro_nome, false);

    return sessao;
  }

  // NEGOCIAÇÃO (art. 61): julgamento/negociacao.service.ts (plano E3 — por unidade,
  // contraproposta privada, lance NEGOCIACAO pelo motor, resultado público).

  // ========================================
  // ADJUDICAÇÃO — métodos adicionais
  // ========================================

  /** Retorna itens encerrados com seus vencedores para confirmação da adjudicação */
  async getAdjudicacaoStatus(sessaoId: string) {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    // Itens da licitação
    const itens = await this.itemRepository.find({
      where: { licitacao_id: sessao.licitacao_id },
      order: { numero_item: 'ASC' },
    });

    // Vencedor de cada item pelo RANKING ÚNICO (B3: nunca o recusado/inabilitado)
    const resultados = await this.resultadoPorItem(sessao.licitacao_id);
    const cadastro = await this.cadastroFornecedores(
      [...resultados.values()].filter((r) => !!r).map((r) => r!.fornecedorId),
    );
    const itensPorLance = itens.map((item) => {
      const r = resultados.get(item.id);
      let vencedor: any = null;
      if (r) {
        const v = valoresGravados(r.lance, (r.lance.base_lance as BaseLance) || BaseLance.TOTAL_ITEM, Number(item.quantidade));
        vencedor = {
          fornecedorId: r.fornecedorId,
          razaoSocial: cadastro.get(r.fornecedorId)?.razaoSocial ?? 'Desconhecido',
          cpfCnpj: cadastro.get(r.fornecedorId)?.cpfCnpj ?? '',
          // valor TOTAL do item (o painel soma); unitário explícito
          valor: v.valor_total,
          valorUnitario: v.valor_unitario,
        };
      }
      return {
        itemId: item.id,
        numero: item.numero_item,
        descricao: item.descricao_resumida ?? item.descricao_detalhada,
        quantidade: item.quantidade,
        unidade: item.unidade_medida,
        vencedor,
      };
    });

    return {
      sessaoId,
      licitacaoId: sessao.licitacao_id,
      etapa: sessao.etapa,
      itens: itensPorLance,
    };
  }

  /** Adjudica todos os itens de uma vez e avança a licitação para ADJUDICACAO */
  async adjudicarTodos(sessaoId: string, ator: AtorTransicao): Promise<void> {
    const sessao = await this.sessaoParaAto(sessaoId);

    // Licitação → ADJUDICACAO (ADJUDICAR; DECIDIR_RECURSOS se em RECURSO;
    // idempotente se os recursos já foram decididos) — antes dos registros
    await this.adjudicarLicitacao(sessao.licitacao_id, ator);

    const itens = await this.itemRepository.find({
      where: { licitacao_id: sessao.licitacao_id },
      order: { numero_item: 'ASC' },
    });

    // B3: vencedor pelo ranking único (nunca recusado/inabilitado/desclassificado)
    const resultados = await this.resultadoPorItem(sessao.licitacao_id);
    let totalAdjudicados = 0;
    for (const item of itens) {
      const r = resultados.get(item.id);
      if (r) {
        const v = valoresGravados(r.lance, (r.lance.base_lance as BaseLance) || BaseLance.TOTAL_ITEM, Number(item.quantidade));
        await this.registrarEvento(sessao.id, TipoEvento.ITEM_ADJUDICADO,
          `Item ${item.numero_item} adjudicado ao fornecedor ${r.fornecedorId} por R$ ${v.valor_total.toFixed(2)}`,
          item.id, r.fornecedorId, sessao.pregoeiro_nome, true,
          { valor: v.valor_total, valor_unitario: v.valor_unitario });
        totalAdjudicados++;
      }
    }

    // Registra adjudicação geral
    await this.registrarEvento(sessao.id, TipoEvento.LICITACAO_ADJUDICADA,
      `Licitacao adjudicada. ${totalAdjudicados} item(ns) adjudicado(s) (Art. 71, Lei 14.133/2021).`,
      undefined, undefined, sessao.pregoeiro_nome, true);

    // Avança etapa para HOMOLOGACAO
    sessao.etapa = EtapaSessao.HOMOLOGACAO;
    await this.sessaoRepository.save(sessao);
  }

  // ========================================
  // HOMOLOGAÇÃO (Art. 71, Lei 14.133/2021)
  // ========================================

  /**
   * Homologação do resultado pela autoridade competente (Art. 71).
   * Ato final que confirma a adjudicação: fixa o vencedor e o valor homologado
   * de cada item, atualiza a licitação (fase HOMOLOGACAO + valor_homologado) e
   * encerra a sessão. Só pode ocorrer após a adjudicação.
   */
  async homologar(
    sessaoId: string,
    autoridade: { nome?: string; cargo?: string },
    ator: AtorTransicao,
  ): Promise<{ totalHomologado: number; valorTotal: number }> {
    const sessao = await this.sessaoParaAto(sessaoId);

    if (sessao.etapa !== EtapaSessao.HOMOLOGACAO && sessao.etapa !== EtapaSessao.ADJUDICACAO) {
      throw new BadRequestException(
        'A homologação só pode ocorrer após a adjudicação do resultado (Art. 71).',
      );
    }

    const itens = await this.itemRepository.find({
      where: { licitacao_id: sessao.licitacao_id },
      order: { numero_item: 'ASC' },
    });

    let totalHomologado = 0;
    let valorTotal = 0;
    // Uma transação: vencedor/valor de cada item + HOMOLOGAR (a pré-condição
    // "item adjudicado" lê os itens gravados aqui) + encerramento da sessão.
    // Valor: colunas explícitas do lance (B2 corrigido na E2). Vencedor: o do
    // RANKING ÚNICO (E3/B3) — nunca recusado, inabilitado ou desclassificado.
    await this.sessaoRepository.manager.transaction(async (manager) => {
      const resultados = await this.resultadoPorItem(sessao.licitacao_id, manager);
      for (const item of itens) {
        const r = resultados.get(item.id);
        if (!r) continue;
        const melhorLance = r.lance;

        // B2: unitário e total vêm das colunas explícitas do lance (o lance do
        // pregão por item é o TOTAL — nunca multiplicar pela quantidade de novo)
        const v = valoresGravados(melhorLance, (melhorLance.base_lance as BaseLance) || BaseLance.TOTAL_ITEM, Number(item.quantidade));
        const proposta = await manager.findOne(Proposta, {
          where: { licitacao_id: sessao.licitacao_id, fornecedor_id: melhorLance.fornecedor_id },
          relations: ['fornecedor'],
        });

        await manager.update(ItemLicitacao, item.id, {
          valor_unitario_homologado: v.valor_unitario,
          valor_total_homologado: v.valor_total,
          fornecedor_vencedor_id: melhorLance.fornecedor_id,
          fornecedor_vencedor_nome: proposta?.fornecedor?.razao_social ?? undefined,
        });
        totalHomologado++;
        valorTotal += v.valor_total;
      }
      valorTotal = Math.round(valorTotal * 100) / 100;

      // Licitação → HOMOLOGACAO pelo ato (data_homologacao pelo efeito do ato)
      await this.transicoes.executar(sessao.licitacao_id, AtoLicitacao.HOMOLOGAR, {
        ator,
        manager,
        aplicar: (lic) => {
          lic.valor_homologado = valorTotal;
        },
        registro: { origem: 'sessao', sessao_id: sessao.id, autoridade, totalHomologado, valorTotal },
      });

      // Encerra a sessão
      sessao.etapa = EtapaSessao.ENCERRAMENTO;
      sessao.status = StatusSessao.ENCERRADA;
      sessao.data_hora_encerramento = new Date();
      await manager.save(sessao);
    });

    await this.registrarEvento(sessao.id, TipoEvento.LICITACAO_HOMOLOGADA,
      `Resultado HOMOLOGADO pela autoridade competente${autoridade.nome ? ` (${autoridade.nome}${autoridade.cargo ? ` — ${autoridade.cargo}` : ''})` : ''}. ` +
      `${totalHomologado} item(ns), valor total R$ ${valorTotal.toFixed(2)} (Art. 71, Lei 14.133/2021).`,
      undefined, undefined, autoridade.nome || sessao.pregoeiro_nome, false,
      { totalHomologado, valorTotal, autoridade });

    return { totalHomologado, valorTotal };
  }

  async suspenderSessao(sessaoId: string, motivo: string): Promise<SessaoDisputa> {
    const sessao = await this.sessaoParaAto(sessaoId);

    sessao.status = StatusSessao.SUSPENSA;
    sessao.motivo_suspensao = motivo;

    await this.sessaoRepository.save(sessao);

    await this.registrarEvento(sessao.id, TipoEvento.SESSAO_SUSPENSA,
      `Sessao suspensa. Motivo: ${motivo}`,
      undefined, undefined, sessao.pregoeiro_nome, false, { motivo });

    return sessao;
  }

  /**
   * Gera a ATA completa da sessão de disputa
   * Conforme Art. 17, §2º da Lei 14.133/2021
   */
  async gerarAtaSessao(sessaoId: string): Promise<{
    sessao: any;
    licitacao: any;
    itens: any[];
    participantes: any[];
    lances: any[];
    mensagens: any[];
    eventos: any[];
    resumo: any;
  }> {
    // Buscar sessão com licitação
    const sessao = await this.sessaoRepository.findOne({
      where: { id: sessaoId },
      relations: ['licitacao']
    });

    if (!sessao) {
      throw new NotFoundException('Sessão não encontrada');
    }

    // Buscar licitação completa
    const licitacao = await this.licitacaoRepository.findOne({
      where: { id: sessao.licitacao_id }
    });

    // Buscar itens da licitação
    const itens = await this.itemRepository.find({
      where: { licitacao_id: sessao.licitacao_id },
      order: { numero_item: 'ASC' }
    });

    // Buscar todos os lances da sessão
    const lances = await this.lanceRepository
      .createQueryBuilder('l')
      .leftJoin('fornecedores', 'f', 'f.id::text = l.fornecedor_id')
      .where('l.item_id IN (:...itemIds)', { itemIds: itens.map(i => i.id.toString()) })
      .select([
        'l.id as id',
        'l.item_id as item_id',
        'l.valor as valor',
        'l.fornecedor_id as fornecedor_id',
        'l.fornecedor_nome as fornecedor_nome',
        'l.valor_unitario as valor_unitario',
        'l.valor_total as valor_total',
        'l.base_lance as base_lance',
        'l.origem as origem',
        'l.cancelado as cancelado',
        'l.cancelado_motivo as cancelado_motivo',
        'l.created_at as data_hora',
        'f.razao_social as razao_social',
        'f.cpf_cnpj as cnpj',
      ])
      .orderBy('l.created_at', 'ASC')
      .getRawMany();

    // Buscar participantes únicos (fornecedores que deram lances)
    const participantesUnicos = await this.lanceRepository
      .createQueryBuilder('l')
      .leftJoin('fornecedores', 'f', 'f.id::text = l.fornecedor_id')
      .where('l.item_id IN (:...itemIds)', { itemIds: itens.map(i => i.id.toString()) })
      .select([
        'DISTINCT l.fornecedor_id as fornecedor_id',
        'l.fornecedor_nome as fornecedor_nome',
        'f.razao_social as razao_social',
        'f.cpf_cnpj as cnpj',
        'f.porte as porte',
      ])
      .getRawMany();

    // Buscar todos os eventos (inclui mensagens)
    const eventos = await this.eventoRepository.find({
      where: { sessao_id: sessaoId },
      order: { created_at: 'ASC' }
    });

    // Filtrar apenas mensagens
    const mensagens = eventos
      .filter(e => 
        e.tipo === TipoEvento.MENSAGEM_PREGOEIRO || 
        e.tipo === TipoEvento.MENSAGEM_FORNECEDOR ||
        e.tipo === TipoEvento.MENSAGEM_SISTEMA
      )
      .map(e => ({
        id: e.id,
        tipo: e.tipo,
        remetente: e.usuario_nome || 'Sistema',
        mensagem: e.descricao,
        data_hora: e.created_at,
      }));

    // Resumo — só lances ATIVOS contam para o resultado; unitário/total explícitos (B2)
    const ativos = lances.filter((l) => !l.cancelado);
    const melhorDoItem = (itemId: string) =>
      ativos
        .filter((l) => l.item_id === itemId.toString())
        .sort((a, b) => parseFloat(a.valor) - parseFloat(b.valor) || new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime())[0];
    const totalDoLance = (l: any, item: ItemLicitacao) =>
      valoresGravados(l, (l.base_lance as BaseLance) || BaseLance.TOTAL_ITEM, Number(item.quantidade));

    const totalLances = ativos.length;
    const totalParticipantes = participantesUnicos.length;
    const valorTotalAdjudicado = itens.reduce((acc, item) => {
      const melhor = melhorDoItem(item.id);
      return acc + (melhor ? totalDoLance(melhor, item).valor_total : 0);
    }, 0);

    const valorTotalEstimado = itens.reduce((acc, item) => {
      return acc + (parseFloat(item.valor_unitario_estimado as any) || 0) * (parseFloat(item.quantidade as any) || 1);
    }, 0);

    const economiaTotal = valorTotalEstimado - valorTotalAdjudicado;
    const percentualEconomia = valorTotalEstimado > 0 ? (economiaTotal / valorTotalEstimado) * 100 : 0;

    const itensComResultado = itens.map(item => {
      const lancesItem = ativos.filter(l => l.item_id === item.id.toString());
      const melhorLance = melhorDoItem(item.id);
      const v = melhorLance ? totalDoLance(melhorLance, item) : null;
      const estimadoTotal = (parseFloat(item.valor_unitario_estimado as any) || 0) * (parseFloat(item.quantidade as any) || 1);

      return {
        id: item.id,
        numero: item.numero_item,
        descricao: item.descricao_resumida || item.descricao_detalhada,
        quantidade: item.quantidade,
        unidade: item.unidade_medida,
        valor_estimado: item.valor_unitario_estimado,
        valor_total_estimado: estimadoTotal,
        total_lances: lancesItem.length,
        melhor_lance: melhorLance ? {
          valor: melhorLance.valor,
          valor_unitario: v!.valor_unitario,
          valor_total: v!.valor_total,
          fornecedor: melhorLance.razao_social || melhorLance.fornecedor_nome,
          cnpj: melhorLance.cnpj,
          data_hora: melhorLance.data_hora,
        } : null,
        economia: v ? estimadoTotal - v.valor_total : 0,
      };
    });

    return {
      sessao: {
        id: sessao.id,
        status: sessao.status,
        etapa: sessao.etapa,
        data_inicio: sessao.data_hora_inicio_real,
        data_encerramento: sessao.data_hora_encerramento,
        pregoeiro: sessao.pregoeiro_nome,
        tempo_inatividade_minutos: sessao.tempo_inatividade_minutos,
        tempo_aleatorio_max_minutos: sessao.tempo_aleatorio_max_minutos,
      },
      licitacao: {
        id: licitacao?.id,
        numero_edital: licitacao?.numero_edital,
        numero_processo: licitacao?.numero_processo,
        objeto: licitacao?.objeto,
        modalidade: licitacao?.modalidade,
      },
      itens: itensComResultado,
      participantes: participantesUnicos.map(p => ({
        id: p.fornecedor_id,
        nome: p.razao_social || p.fornecedor_nome,
        cnpj: p.cnpj,
        porte: p.porte,
      })),
      lances: lances.map(l => ({
        id: l.id,
        item_id: l.item_id,
        valor: l.valor,
        valor_unitario: l.valor_unitario,
        valor_total: l.valor_total,
        origem: l.origem,
        cancelado: l.cancelado,
        cancelado_motivo: l.cancelado_motivo,
        fornecedor: l.razao_social || l.fornecedor_nome,
        cnpj: l.cnpj,
        data_hora: l.data_hora,
      })),
      mensagens,
      eventos: eventos.map(e => ({
        id: e.id,
        tipo: e.tipo,
        descricao: e.descricao,
        data_hora: e.created_at,
        usuario: e.usuario_nome,
        item_id: e.item_id,
        fornecedor_id: e.fornecedor_id,
        valor: e.valor,
        // Negociação (E3): acompanhada pelos participantes durante a sessão (IN 73 art. 30 §2º); na ata, registro integral
        visibilidade: e.dados_adicionais?.visibilidade ?? 'PUBLICA',
      })),
      resumo: {
        total_itens: itens.length,
        total_lances: totalLances,
        total_participantes: totalParticipantes,
        total_mensagens: mensagens.length,
        valor_estimado: valorTotalEstimado,
        valor_adjudicado: valorTotalAdjudicado,
        economia: economiaTotal,
        percentual_economia: percentualEconomia.toFixed(2),
      }
    };
  }

  // ========================================
  // UTILITARIOS
  // ========================================

  private async registrarEvento(
    sessaoId: string,
    tipo: TipoEvento,
    descricao: string,
    itemId?: string,
    fornecedorId?: string,
    usuarioNome?: string,
    isSistema: boolean = false,
    dadosAdicionais?: Record<string, any>
  ): Promise<EventoSessao> {
    const evento = this.eventoRepository.create({
      sessao_id: sessaoId,
      tipo,
      descricao,
      item_id: itemId,
      fornecedor_identificador: fornecedorId,
      usuario_nome: usuarioNome,
      is_sistema: isSistema,
      dados_adicionais: dadosAdicionais,
    });

    return await this.eventoRepository.save(evento);
  }

  async getEventosSessao(sessaoId: string): Promise<EventoSessao[]> {
    return await this.eventoRepository.find({
      where: { sessao_id: sessaoId },
      order: { created_at: 'ASC' }
    });
  }

  async getSessao(sessaoId: string): Promise<SessaoDisputa> {
    const sessao = await this.sessaoRepository.findOne({
      where: { id: sessaoId },
      relations: ['licitacao', 'item_atual']
    });

    if (!sessao) throw new NotFoundException('Sessao nao encontrada');
    return sessao;
  }

  async getSessaoPorLicitacao(licitacaoId: string): Promise<SessaoDisputa | null> {
    return await this.sessaoRepository.findOne({
      where: { licitacao_id: licitacaoId },
      order: { created_at: 'DESC' }
    });
  }

  /**
   * Prepara dados para a página de iniciar sessão
   * Inclui verificações pré-sessão conforme Lei 14.133/2021
   */
  async prepararDadosSessao(licitacaoId: string): Promise<{
    licitacao: any;
    verificacoes: {
      faseInternaOk: boolean;
      faseInternaMsg: string;
      editalPublicado: boolean;
      editalPublicadoMsg: string;
      prazoImpugnacao: boolean;
      prazoImpugnacaoMsg: string;
      propostasRecebidas: boolean;
      propostasRecebidasMsg: string;
      quantidadePropostas: number;
      dataAbertura: boolean;
      dataAberturaMsg: string;
      podeIniciar: boolean;
    };
    propostas: any[];
    itens: any[];
    configuracaoPadrao: {
      modoDisputa: string;
      tempoInatividade: number;
      tempoAleatorioMin: number;
      tempoAleatorioMax: number;
      intervaloMinLances: number;
      decrementoMinimo: number;
    };
    sessaoExistente: SessaoDisputa | null;
  }> {
    console.log(`[SessaoService] prepararDadosSessao - Iniciando para licitacaoId: ${licitacaoId}`);
    
    // Busca licitação com relações
    const licitacao = await this.licitacaoRepository.findOne({
      where: { id: licitacaoId },
      relations: ['orgao', 'itens']
    });

    console.log(`[SessaoService] Licitação encontrada:`, licitacao ? 'Sim' : 'Não');

    if (!licitacao) {
      throw new NotFoundException('Licitação não encontrada');
    }

    // Busca propostas (sem revelar nomes dos fornecedores)
    console.log(`[SessaoService] Buscando propostas...`);
    let propostasRaw: any[] = [];
    try {
      propostasRaw = await this.licitacaoRepository.manager.query(`
        SELECT 
          p.id,
          p.fornecedor_id,
          p.valor_total_proposta,
          p.status,
          p.created_at,
          f.razao_social,
          f.cnpj
        FROM propostas p
        LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
        WHERE p.licitacao_id = $1
        ORDER BY p.valor_total_proposta ASC
      `, [licitacaoId]);
      console.log(`[SessaoService] Propostas encontradas: ${propostasRaw.length}`);
    } catch (err: any) {
      console.error(`[SessaoService] Erro ao buscar propostas:`, err.message);
      propostasRaw = [];
    }

    // Anonimiza propostas (Fornecedor A, B, C...)
    const propostas = propostasRaw.map((p: any, index: number) => ({
      id: p.id,
      fornecedorId: p.fornecedor_id,
      // Nome anonimizado para exibição antes da disputa
      fornecedorAnonimo: `Fornecedor ${String.fromCharCode(65 + index)}`,
      // Nome real (só usar após disputa)
      fornecedorNome: p.razao_social,
      cnpj: p.cnpj,
      valorTotal: parseFloat(p.valor_total_proposta) || 0,
      status: p.status,
      dataEnvio: p.created_at,
    }));

    // Busca itens da licitação
    const itens = (licitacao.itens || []).map((item: any) => ({
      id: item.id,
      numero: item.numero_item,
      descricao: item.descricao_resumida || item.descricao_detalhada,
      quantidade: item.quantidade,
      unidade: item.unidade_medida,
      valorReferencia: parseFloat(item.valor_unitario_estimado) || 0,
      valorTotal: parseFloat(item.valor_total_estimado) || 0,
    }));

    // Verificações pré-sessão
    const agora = new Date();
    
    // 1. Fase interna concluída (deve estar em fase externa)
    const fasesExternas = ['PUBLICADO', 'IMPUGNACAO', 'ACOLHIMENTO_PROPOSTAS', 'ANALISE_PROPOSTAS', 'EM_DISPUTA'];
    const faseInternaOk = fasesExternas.includes(licitacao.fase);
    
    // 2. Edital publicado (verificar se foi enviado ao PNCP ou tem data de publicação)
    const editalPublicado = !!licitacao.data_publicacao_edital || !!licitacao.enviado_pncp;
    
    // 3. Prazo de impugnação encerrado
    const prazoImpugnacaoEncerrado = licitacao.data_limite_impugnacao 
      ? new Date(licitacao.data_limite_impugnacao) < agora 
      : true;
    
    // 4. Propostas recebidas
    const propostasValidas = propostas.filter((p: any) => p.status === 'ENVIADA' || p.status === 'VALIDA');
    const temPropostas = propostasValidas.length > 0;

    // 5. Data de abertura da sessão
    const dataAberturaChegou = licitacao.data_abertura_sessao 
      ? new Date(licitacao.data_abertura_sessao) <= agora 
      : true;

    // Verifica se pode iniciar
    const podeIniciar = faseInternaOk && editalPublicado && prazoImpugnacaoEncerrado && temPropostas && dataAberturaChegou;

    // Busca sessão existente
    const sessaoExistente = await this.sessaoRepository.findOne({
      where: { licitacao_id: licitacaoId },
      order: { created_at: 'DESC' }
    });

    // Configuração efetiva pelo resolvedor único (licitação → órgão → sistema)
    const p = await this.parametrosDisputa.daLicitacao(licitacaoId);
    const configuracaoPadrao = {
      modoDisputa: licitacao.modo_disputa || 'ABERTO',
      tempoInatividade: p.tempoInicialMinutos * 60, // segundos
      tempoAleatorioMin: p.tempoAleatorioMinMinutos, // minutos
      tempoAleatorioMax: p.tempoAleatorioMaxMinutos, // minutos
      intervaloMinLances: p.intervaloProprioSegundos, // segundos (0 = sem intervalo)
      decrementoMinimo: p.diferencaMinima?.valor ?? 0, // diferença mínima do edital
    };

    return {
      licitacao: {
        id: licitacao.id,
        numero: `${licitacao.modalidade?.substring(0, 2) || 'PE'} ${licitacao.numero_edital || ''}/${new Date(licitacao.created_at).getFullYear()}`,
        numeroProcesso: licitacao.numero_processo,
        objeto: licitacao.objeto,
        modalidade: licitacao.modalidade,
        criterioJulgamento: licitacao.criterio_julgamento,
        modoDisputa: licitacao.modo_disputa,
        valorEstimado: parseFloat(licitacao.valor_total_estimado as any) || 0,
        dataAbertura: licitacao.data_abertura_sessao,
        fase: licitacao.fase,
        pregoeiroNome: licitacao.pregoeiro_nome,
        pregoeiroId: licitacao.pregoeiro_id,
        orgao: licitacao.orgao ? {
          id: licitacao.orgao.id,
          nome: licitacao.orgao.nome,
          cnpj: licitacao.orgao.cnpj,
        } : null,
      },
      verificacoes: {
        faseInternaOk,
        faseInternaMsg: faseInternaOk ? 'Fase interna concluída' : 'Licitação ainda está em fase interna',
        editalPublicado,
        editalPublicadoMsg: editalPublicado ? 'Edital publicado' : 'Edital não foi publicado',
        prazoImpugnacao: prazoImpugnacaoEncerrado,
        prazoImpugnacaoMsg: prazoImpugnacaoEncerrado 
          ? 'Prazo de impugnação encerrado' 
          : `Prazo de impugnação até ${licitacao.data_limite_impugnacao}`,
        propostasRecebidas: temPropostas,
        propostasRecebidasMsg: temPropostas 
          ? `${propostasValidas.length} proposta(s) válida(s)` 
          : 'Nenhuma proposta recebida',
        quantidadePropostas: propostasValidas.length,
        dataAbertura: dataAberturaChegou,
        dataAberturaMsg: dataAberturaChegou 
          ? 'Data de abertura atingida' 
          : `Aguardando data de abertura: ${licitacao.data_abertura_sessao ? new Date(licitacao.data_abertura_sessao).toLocaleString('pt-BR') : 'não definida'}`,
        podeIniciar,
      },
      propostas,
      itens,
      configuracaoPadrao,
      sessaoExistente,
    };
  }

  /** Habilita/desabilita o chat dos licitantes (armazenamento único: eventos da sessão). */
  async toggleChat(sessaoId: string, habilitado: boolean): Promise<void> {
    await this.disputa.definirChat(sessaoId, habilitado);
  }
}

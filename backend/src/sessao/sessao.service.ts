import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SessaoDisputa, StatusSessao, EtapaSessao } from './entities/sessao-disputa.entity';
import { EventoSessao, TipoEvento } from './entities/evento-sessao.entity';
import { Licitacao, FaseLicitacao } from '../licitacoes/entities/licitacao.entity';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import { Lance } from '../lances/entities/lance.entity';

/**
 * Servico de Controle da Sessao de Disputa
 * Implementa regras da Lei 14.133/2021 e IN SEGES/ME
 */
@Injectable()
export class SessaoService {
  constructor(
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
  ) {}

  // ========================================
  // CRIACAO E CONFIGURACAO DA SESSAO
  // ========================================

  async criarSessao(licitacaoId: string, pregoeiroId: string, pregoeiroNome: string): Promise<SessaoDisputa> {
    const licitacao = await this.licitacaoRepository.findOneBy({ id: licitacaoId });
    if (!licitacao) {
      throw new NotFoundException('Licitacao nao encontrada');
    }

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

    const sessao = this.sessaoRepository.create({
      licitacao_id: licitacaoId,
      pregoeiro_id: pregoeiroId,
      pregoeiro_nome: pregoeiroNome,
      status: StatusSessao.AGUARDANDO_INICIO,
      etapa: EtapaSessao.ABERTURA_SESSAO,
      data_hora_inicio_prevista: licitacao.data_abertura_sessao,
      // Configuracoes padrao conforme IN SEGES/ME
      intervalo_minimo_lances_minutos: 3,
      tempo_inatividade_minutos: 10,
      tempo_aleatorio_min_minutos: 2,
      tempo_aleatorio_max_minutos: 30,
      tempo_prorrogacao_minutos: 2,
    });

    return await this.sessaoRepository.save(sessao);
  }

  // ========================================
  // INICIO DA SESSAO
  // ========================================

  async iniciarSessao(sessaoId: string): Promise<SessaoDisputa> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    if (sessao.status !== StatusSessao.AGUARDANDO_INICIO) {
      throw new BadRequestException('Sessao ja foi iniciada ou encerrada');
    }

    sessao.status = StatusSessao.EM_ANDAMENTO;
    sessao.etapa = EtapaSessao.ABERTURA_SESSAO;
    sessao.data_hora_inicio_real = new Date();

    await this.sessaoRepository.save(sessao);

    // Atualiza fase da licitacao
    await this.licitacaoRepository.update(sessao.licitacao_id, {
      fase: FaseLicitacao.ANALISE_PROPOSTAS
    });

    // Registra evento
    await this.registrarEvento(sessao.id, TipoEvento.SESSAO_INICIADA, 
      'Sessao publica iniciada pelo Pregoeiro', undefined, undefined, sessao.pregoeiro_nome, true);

    return sessao;
  }

  // ========================================
  // CONTROLE DE ETAPAS
  // ========================================

  async avancarParaDisputa(sessaoId: string): Promise<SessaoDisputa> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    if (sessao.etapa !== EtapaSessao.ANALISE_PROPOSTAS && sessao.etapa !== EtapaSessao.DESCLASSIFICACAO_PROPOSTAS) {
      throw new BadRequestException('Etapa atual nao permite iniciar disputa');
    }

    sessao.etapa = EtapaSessao.DISPUTA_LANCES;
    sessao.status = StatusSessao.MODO_ABERTO;
    sessao.ultimo_lance_em = new Date();

    await this.sessaoRepository.save(sessao);

    // Atualiza fase da licitacao
    await this.licitacaoRepository.update(sessao.licitacao_id, {
      fase: FaseLicitacao.EM_DISPUTA
    });

    await this.registrarEvento(sessao.id, TipoEvento.DISPUTA_INICIADA,
      'Etapa de lances iniciada', undefined, undefined, sessao.pregoeiro_nome, true);

    return sessao;
  }

  async iniciarDisputaItem(sessaoId: string, itemId: string): Promise<SessaoDisputa> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    const item = await this.itemRepository.findOneBy({ id: itemId });
    if (!item) throw new NotFoundException('Item nao encontrado');

    sessao.item_atual_id = itemId;
    sessao.ultimo_lance_em = new Date();
    sessao.inicio_tempo_aleatorio = undefined as any;
    sessao.tempo_aleatorio_sorteado = undefined as any;

    await this.sessaoRepository.save(sessao);

    await this.registrarEvento(sessao.id, TipoEvento.DISPUTA_ITEM_INICIADA,
      `Disputa iniciada para o Item ${item.numero_item}: ${item.descricao_resumida}`,
      itemId, undefined, sessao.pregoeiro_nome, true);

    return sessao;
  }

  // ========================================
  // REGISTRO DE LANCES COM VALIDACAO DE TEMPO
  // ========================================

  async registrarLance(
    sessaoId: string,
    itemId: string,
    fornecedorId: string,
    fornecedorNome: string,
    valor: number,
    ip: string
  ): Promise<Lance> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    // Validacoes de estado
    if (sessao.status !== StatusSessao.MODO_ABERTO) {
      throw new BadRequestException('Sessao nao esta em modo de disputa aberta');
    }

    if (sessao.item_atual_id !== itemId) {
      throw new BadRequestException('Este item nao esta em disputa no momento');
    }

    // Busca melhor lance atual
    const melhorLance = await this.lanceRepository.findOne({
      where: { licitacao_id: sessao.licitacao_id, cancelado: false },
      order: { valor: 'ASC' }
    });

    // Valida se o lance e menor que o melhor
    if (melhorLance && valor >= Number(melhorLance.valor)) {
      throw new BadRequestException(
        `Lance deve ser menor que o melhor lance atual (R$ ${melhorLance.valor})`
      );
    }

    // Busca ultimo lance do fornecedor
    const meuUltimoLance = await this.lanceRepository.findOne({
      where: { 
        licitacao_id: sessao.licitacao_id, 
        fornecedor_identificador: fornecedorId, 
        cancelado: false 
      },
      order: { created_at: 'DESC' }
    });

    // Valida autossuperacao
    if (meuUltimoLance && valor >= Number(meuUltimoLance.valor)) {
      throw new BadRequestException(
        `Lance deve ser menor que seu lance anterior (R$ ${meuUltimoLance.valor})`
      );
    }

    // Cria o lance
    const lance = this.lanceRepository.create({
      licitacao_id: sessao.licitacao_id,
      fornecedor_identificador: fornecedorId,
      valor,
      ip_origem: ip,
      cancelado: false,
    });

    await this.lanceRepository.save(lance);

    // Atualiza timestamp do ultimo lance (para controle de inatividade)
    sessao.ultimo_lance_em = new Date();

    // Se estava em tempo aleatorio, aplica prorrogacao
    if (sessao.inicio_tempo_aleatorio) {
      sessao.prorrogacoes_utilizadas++;
      await this.registrarEvento(sessao.id, TipoEvento.PRORROGACAO_AUTOMATICA,
        `Prorrogacao automatica aplicada (${sessao.tempo_prorrogacao_minutos} min)`,
        itemId, fornecedorId, fornecedorNome, true);
    }

    await this.sessaoRepository.save(sessao);

    // Registra evento
    await this.registrarEvento(sessao.id, TipoEvento.LANCE_REGISTRADO,
      `Lance de R$ ${valor.toFixed(2)} registrado`,
      itemId, fornecedorId, fornecedorNome, false, { valor, lance_id: lance.id });

    return lance;
  }

  // ========================================
  // CONTROLE DE TEMPO E ENCERRAMENTO AUTOMATICO
  // ========================================

  /**
   * Verifica inatividade e inicia tempo aleatorio
   * Art. 56, §3º - Encerramento por inatividade
   */
  async verificarInatividade(sessaoId: string): Promise<{ deveEncerrar: boolean; tempoRestante?: number }> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao || sessao.status !== StatusSessao.MODO_ABERTO) {
      return { deveEncerrar: false };
    }

    const agora = new Date();
    const ultimoLance = sessao.ultimo_lance_em || sessao.data_hora_inicio_real;
    const tempoInativo = (agora.getTime() - ultimoLance.getTime()) / 1000 / 60; // em minutos

    // Se passou o tempo de inatividade e ainda nao iniciou tempo aleatorio
    if (tempoInativo >= sessao.tempo_inatividade_minutos && !sessao.inicio_tempo_aleatorio) {
      await this.iniciarTempoAleatorio(sessaoId);
      return { deveEncerrar: false };
    }

    // Se ja esta em tempo aleatorio
    if (sessao.inicio_tempo_aleatorio) {
      const tempoDecorrido = (agora.getTime() - sessao.inicio_tempo_aleatorio.getTime()) / 1000 / 60;
      const tempoRestante = sessao.tempo_aleatorio_sorteado - tempoDecorrido;

      if (tempoRestante <= 0) {
        return { deveEncerrar: true };
      }

      return { deveEncerrar: false, tempoRestante: Math.ceil(tempoRestante * 60) }; // em segundos
    }

    return { deveEncerrar: false };
  }

  /**
   * Inicia o tempo aleatorio para encerramento
   * Sorteia um tempo entre 2 e 30 minutos
   */
  async iniciarTempoAleatorio(sessaoId: string): Promise<SessaoDisputa> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    // Sorteia tempo aleatorio
    const min = sessao.tempo_aleatorio_min_minutos;
    const max = sessao.tempo_aleatorio_max_minutos;
    const tempoSorteado = Math.floor(Math.random() * (max - min + 1)) + min;

    sessao.status = StatusSessao.RANDOM_ENCERRANDO;
    sessao.inicio_tempo_aleatorio = new Date();
    sessao.tempo_aleatorio_sorteado = tempoSorteado;

    await this.sessaoRepository.save(sessao);

    await this.registrarEvento(sessao.id, TipoEvento.TEMPO_ALEATORIO_INICIADO,
      'Tempo aleatorio para encerramento iniciado. Envie lances para prorrogar.',
      sessao.item_atual_id, undefined, 'SISTEMA', true);

    return sessao;
  }

  /**
   * Encerra a disputa do item atual
   */
  async encerrarDisputaItem(sessaoId: string): Promise<SessaoDisputa> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    const itemId = sessao.item_atual_id;

    // Busca vencedor provisorio
    const melhorLance = await this.lanceRepository.findOne({
      where: { licitacao_id: sessao.licitacao_id, cancelado: false },
      order: { valor: 'ASC' }
    });

    // Reseta controles de tempo
    sessao.inicio_tempo_aleatorio = undefined as any;
    sessao.tempo_aleatorio_sorteado = undefined as any;
    sessao.item_atual_id = undefined as any;
    sessao.status = StatusSessao.EM_ANDAMENTO;
    sessao.etapa = EtapaSessao.NEGOCIACAO;

    await this.sessaoRepository.save(sessao);

    const descricao = melhorLance 
      ? `Disputa encerrada. Melhor lance: R$ ${melhorLance.valor} - ${melhorLance.fornecedor_identificador}`
      : 'Disputa encerrada sem lances';

    await this.registrarEvento(sessao.id, TipoEvento.DISPUTA_ITEM_ENCERRADA,
      descricao, itemId, melhorLance?.fornecedor_identificador, 'SISTEMA', true,
      { melhor_lance: melhorLance?.valor });

    return sessao;
  }

  // ========================================
  // NEGOCIACAO (Art. 61)
  // ========================================

  async iniciarNegociacao(sessaoId: string, fornecedorId: string): Promise<void> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    sessao.etapa = EtapaSessao.NEGOCIACAO;
    await this.sessaoRepository.save(sessao);

    await this.registrarEvento(sessao.id, TipoEvento.NEGOCIACAO_INICIADA,
      `Pregoeiro iniciou negociacao com o fornecedor ${fornecedorId}`,
      sessao.item_atual_id, fornecedorId, sessao.pregoeiro_nome, false);
  }

  async registrarPropostaNegociacao(
    sessaoId: string, 
    fornecedorId: string, 
    valorProposto: number
  ): Promise<void> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    await this.registrarEvento(sessao.id, TipoEvento.NEGOCIACAO_PROPOSTA,
      `Fornecedor propoe novo valor: R$ ${valorProposto.toFixed(2)}`,
      sessao.item_atual_id, fornecedorId, fornecedorId, false,
      { valor_proposto: valorProposto });
  }

  // ========================================
  // BENEFICIO ME/EPP (LC 123/2006)
  // ========================================

  async verificarEmpateFicto(sessaoId: string, itemId: string): Promise<boolean> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) return false;

    // Busca os dois melhores lances
    const lances = await this.lanceRepository.find({
      where: { licitacao_id: sessao.licitacao_id, cancelado: false },
      order: { valor: 'ASC' },
      take: 2
    });

    if (lances.length < 2) return false;

    const melhorLance = Number(lances[0].valor);
    const segundoLance = Number(lances[1].valor);

    // Empate ficto: ate 5% de diferenca para ME/EPP
    const diferenca = ((segundoLance - melhorLance) / melhorLance) * 100;

    if (diferenca <= 5) {
      await this.registrarEvento(sessao.id, TipoEvento.EMPATE_FICTO_DETECTADO,
        `Empate ficto detectado. Diferenca de ${diferenca.toFixed(2)}% entre os melhores lances`,
        itemId, undefined, 'SISTEMA', true);
      return true;
    }

    return false;
  }

  async convocarMPEParaLance(sessaoId: string, fornecedorId: string): Promise<void> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    sessao.etapa = EtapaSessao.BENEFICIO_MPE;
    await this.sessaoRepository.save(sessao);

    await this.registrarEvento(sessao.id, TipoEvento.LANCE_MPE_SOLICITADO,
      `ME/EPP convocada para exercer direito de preferencia. Prazo: 5 minutos`,
      sessao.item_atual_id, fornecedorId, 'SISTEMA', true);
  }

  // ========================================
  // HABILITACAO
  // ========================================

  async convocarParaHabilitacao(sessaoId: string, fornecedorId: string): Promise<void> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    sessao.etapa = EtapaSessao.CONVOCACAO_HABILITACAO;
    await this.sessaoRepository.save(sessao);

    await this.registrarEvento(sessao.id, TipoEvento.CONVOCACAO_HABILITACAO,
      `Fornecedor ${fornecedorId} convocado para apresentar documentos de habilitacao`,
      undefined, fornecedorId, sessao.pregoeiro_nome, false);
  }

  async aprovarHabilitacao(sessaoId: string, fornecedorId: string): Promise<void> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    await this.registrarEvento(sessao.id, TipoEvento.HABILITACAO_APROVADA,
      `Habilitacao do fornecedor ${fornecedorId} APROVADA`,
      undefined, fornecedorId, sessao.pregoeiro_nome, false);
  }

  async reprovarHabilitacao(sessaoId: string, fornecedorId: string, motivo: string): Promise<void> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    await this.registrarEvento(sessao.id, TipoEvento.HABILITACAO_REPROVADA,
      `Habilitacao do fornecedor ${fornecedorId} REPROVADA. Motivo: ${motivo}`,
      undefined, fornecedorId, sessao.pregoeiro_nome, false, { motivo });
  }

  // ========================================
  // RECURSOS (Art. 165)
  // ========================================

  async abrirPrazoIntencaoRecurso(sessaoId: string): Promise<void> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    sessao.etapa = EtapaSessao.INTENCAO_RECURSO;
    await this.sessaoRepository.save(sessao);

    // Prazo de 10 minutos para manifestar intencao de recurso
    await this.registrarEvento(sessao.id, TipoEvento.PRAZO_RECURSAL_INICIADO,
      'Prazo de 10 minutos para manifestacao de intencao de recurso iniciado',
      undefined, undefined, sessao.pregoeiro_nome, true);
  }

  async registrarIntencaoRecurso(
    sessaoId: string, 
    fornecedorId: string, 
    motivacao: string
  ): Promise<void> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    await this.registrarEvento(sessao.id, TipoEvento.INTENCAO_RECURSO_REGISTRADA,
      `Fornecedor ${fornecedorId} manifestou intencao de recurso: ${motivacao}`,
      undefined, fornecedorId, fornecedorId, false, { motivacao });
  }

  // ========================================
  // ADJUDICACAO E ENCERRAMENTO
  // ========================================

  async adjudicarItem(sessaoId: string, itemId: string, fornecedorId: string, valor: number): Promise<void> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    sessao.etapa = EtapaSessao.ADJUDICACAO;
    await this.sessaoRepository.save(sessao);

    await this.registrarEvento(sessao.id, TipoEvento.ITEM_ADJUDICADO,
      `Item adjudicado ao fornecedor ${fornecedorId} pelo valor de R$ ${valor.toFixed(2)}`,
      itemId, fornecedorId, sessao.pregoeiro_nome, false, { valor });
  }

  async encerrarSessao(sessaoId: string): Promise<SessaoDisputa> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    sessao.status = StatusSessao.ENCERRADA;
    sessao.etapa = EtapaSessao.ENCERRAMENTO;
    sessao.data_hora_encerramento = new Date();

    await this.sessaoRepository.save(sessao);

    // Atualiza fase da licitacao
    await this.licitacaoRepository.update(sessao.licitacao_id, {
      fase: FaseLicitacao.ADJUDICACAO
    });

    await this.registrarEvento(sessao.id, TipoEvento.SESSAO_ENCERRADA,
      'Sessao publica encerrada pelo Pregoeiro',
      undefined, undefined, sessao.pregoeiro_nome, false);

    return sessao;
  }

  async suspenderSessao(sessaoId: string, motivo: string): Promise<SessaoDisputa> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    sessao.status = StatusSessao.SUSPENSA;
    sessao.motivo_suspensao = motivo;

    await this.sessaoRepository.save(sessao);

    await this.registrarEvento(sessao.id, TipoEvento.SESSAO_SUSPENSA,
      `Sessao suspensa. Motivo: ${motivo}`,
      undefined, undefined, sessao.pregoeiro_nome, false, { motivo });

    return sessao;
  }

  // ========================================
  // CRON JOB - VERIFICACAO AUTOMATICA
  // ========================================

  @Cron(CronExpression.EVERY_10_SECONDS)
  async verificarSessoesAtivas(): Promise<void> {
    const sessoesAtivas = await this.sessaoRepository.find({
      where: [
        { status: StatusSessao.MODO_ABERTO },
        { status: StatusSessao.RANDOM_ENCERRANDO }
      ]
    });

    for (const sessao of sessoesAtivas) {
      const resultado = await this.verificarInatividade(sessao.id);
      
      if (resultado.deveEncerrar) {
        await this.encerrarDisputaItem(sessao.id);
      }
    }
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

    // Verifica se pode iniciar
    const podeIniciar = faseInternaOk && editalPublicado && prazoImpugnacaoEncerrado && temPropostas;

    // Busca sessão existente
    const sessaoExistente = await this.sessaoRepository.findOne({
      where: { licitacao_id: licitacaoId },
      order: { created_at: 'DESC' }
    });

    // Configuração padrão conforme IN SEGES/ME
    const configuracaoPadrao = {
      modoDisputa: licitacao.modo_disputa || 'ABERTO',
      tempoInatividade: 180, // 3 minutos em segundos
      tempoAleatorioMin: 2, // minutos
      tempoAleatorioMax: 30, // minutos
      intervaloMinLances: 3, // segundos
      decrementoMinimo: 0.5, // percentual
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
        podeIniciar,
      },
      propostas,
      itens,
      configuracaoPadrao,
      sessaoExistente,
    };
  }
}

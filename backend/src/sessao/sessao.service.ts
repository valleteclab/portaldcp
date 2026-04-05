import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SessaoDisputa, StatusSessao, EtapaSessao } from './entities/sessao-disputa.entity';
import { EventoSessao, TipoEvento } from './entities/evento-sessao.entity';
import { Licitacao, FaseLicitacao } from '../licitacoes/entities/licitacao.entity';
import { ItemLicitacao, StatusDisputaItem } from '../itens/entities/item-licitacao.entity';
import { Lance } from '../lances/entities/lance.entity';
import { Proposta } from '../propostas/entities/proposta.entity';
import { PropostaItem } from '../propostas/entities/proposta-item.entity';

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
    @InjectRepository(Proposta)
    private readonly propostaRepository: Repository<Proposta>,
    @InjectRepository(PropostaItem)
    private readonly propostaItemRepository: Repository<PropostaItem>,
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

    // Determina tipo de disputa baseado na configuração da licitação
    // Lei 14.133/2021, Art. 56
    const disputaPorItem = !licitacao.usa_lotes; // Se não usa lotes, disputa é por item
    const modoAberto = licitacao.modo_disputa === 'ABERTO' || licitacao.modo_disputa === 'ABERTO_FECHADO';
    const modoAbertoFechado = licitacao.modo_disputa === 'ABERTO_FECHADO' || licitacao.modo_disputa === 'FECHADO_ABERTO';

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
      // Configuracoes de tempo herdadas da licitação (Lei 14.133/2021)
      intervalo_minimo_lances_minutos: licitacao.intervalo_minimo_lances || 3,
      tempo_inatividade_minutos: licitacao.tempo_inatividade || 10, // 10 min default
      tempo_aleatorio_min_minutos: 2,
      tempo_aleatorio_max_minutos: 30,
      tempo_prorrogacao_minutos: licitacao.tempo_prorrogacao || 2, // 2 min default
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

  /**
   * Reabre uma sessão encerrada para continuar a disputa
   */
  async reabrirSessao(sessaoId: string): Promise<SessaoDisputa> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    if (sessao.status !== StatusSessao.ENCERRADA && sessao.status !== StatusSessao.SUSPENSA) {
      throw new BadRequestException('Apenas sessoes encerradas ou suspensas podem ser reabertas');
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

  /**
   * Inicia disputa de um item específico
   * Agora o controle de tempo é POR ITEM, não por sessão
   */
  async iniciarDisputaItem(sessaoId: string, itemId: string): Promise<SessaoDisputa> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    const item = await this.itemRepository.findOneBy({ id: itemId });
    if (!item) throw new NotFoundException('Item nao encontrado');

    // Atualiza o item com status de disputa
    const agora = new Date();
    await this.itemRepository.update(itemId, {
      status_disputa: StatusDisputaItem.EM_DISPUTA,
      disputa_iniciada_em: agora,
      ultimo_lance_em: agora,
      inicio_tempo_aleatorio: undefined,
      tempo_aleatorio_sorteado: undefined,
    });

    // Mantém compatibilidade com item_atual_id (para sistemas legados)
    sessao.item_atual_id = itemId;
    sessao.ultimo_lance_em = agora;
    await this.sessaoRepository.save(sessao);

    await this.registrarEvento(sessao.id, TipoEvento.DISPUTA_ITEM_INICIADA,
      `Disputa iniciada para o Item ${item.numero_item}: ${item.descricao_resumida}`,
      itemId, undefined, sessao.pregoeiro_nome, true);

    return sessao;
  }

  /**
   * Inicia disputa conforme configuração da licitação
   * 
   * Lei 14.133/2021, Art. 56:
   * - DISPUTA POR ITEM: Cada item tem seu próprio cronômetro
   * - DISPUTA POR LOTE: Cada lote tem seu próprio cronômetro (itens do lote disputados juntos)
   */
  async iniciarDisputaTodosItens(sessaoId: string): Promise<{ 
    sessao: SessaoDisputa; 
    itensIniciados: number;
    lotesIniciados: number;
    tipoDisputa: 'POR_ITEM' | 'POR_LOTE';
  }> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    const licitacao = await this.licitacaoRepository.findOneBy({ id: sessao.licitacao_id });
    if (!licitacao) throw new NotFoundException('Licitacao nao encontrada');

    const agora = new Date();
    let itensIniciados = 0;
    let lotesIniciados = 0;
    const tipoDisputa = sessao.disputa_por_item ? 'POR_ITEM' : 'POR_LOTE';

    if (sessao.disputa_por_item) {
      // ========================================
      // DISPUTA POR ITEM - Cada item independente
      // ========================================
      const itens = await this.itemRepository.find({
        where: { licitacao_id: sessao.licitacao_id }
      });

      for (const item of itens) {
        if (!item.status_disputa || item.status_disputa === StatusDisputaItem.AGUARDANDO) {
          // Antes de iniciar, converter propostas em lances
          await this.converterPropostasEmLances(item.id, sessao.licitacao_id);
          
          await this.itemRepository.update(item.id, {
            status_disputa: StatusDisputaItem.EM_DISPUTA,
            disputa_iniciada_em: agora,
            ultimo_lance_em: agora,
            inicio_tempo_aleatorio: undefined,
            tempo_aleatorio_sorteado: undefined,
          });
          itensIniciados++;

          await this.registrarEvento(sessao.id, TipoEvento.DISPUTA_ITEM_INICIADA,
            `Disputa iniciada para o Item ${item.numero_item}: ${item.descricao_resumida}`,
            item.id, undefined, sessao.pregoeiro_nome, true);
        }
      }
    } else {
      // ========================================
      // DISPUTA POR LOTE - Itens agrupados por lote
      // Lance é sobre o valor total do lote
      // ========================================
      const itens = await this.itemRepository.find({
        where: { licitacao_id: sessao.licitacao_id }
      });

      // Agrupa itens por lote
      const itensPorLote = new Map<string, typeof itens>();
      for (const item of itens) {
        const loteId = item.lote_id || 'SEM_LOTE';
        if (!itensPorLote.has(loteId)) {
          itensPorLote.set(loteId, []);
        }
        itensPorLote.get(loteId)!.push(item);
      }

      // Inicia disputa para cada lote (todos os itens do lote juntos)
      for (const [loteId, itensDoLote] of itensPorLote) {
        // Verifica se algum item do lote já está em disputa
        const algumEmDisputa = itensDoLote.some(i => 
          i.status_disputa === StatusDisputaItem.EM_DISPUTA || 
          i.status_disputa === StatusDisputaItem.TEMPO_ALEATORIO
        );

        if (!algumEmDisputa) {
          // Inicia todos os itens do lote
          for (const item of itensDoLote) {
            await this.itemRepository.update(item.id, {
              status_disputa: StatusDisputaItem.EM_DISPUTA,
              disputa_iniciada_em: agora,
              ultimo_lance_em: agora,
              inicio_tempo_aleatorio: undefined,
              tempo_aleatorio_sorteado: undefined,
            });
            itensIniciados++;
          }
          lotesIniciados++;

          const descricaoLote = loteId === 'SEM_LOTE' 
            ? `Itens sem lote (${itensDoLote.length} itens)`
            : `Lote ${loteId} (${itensDoLote.length} itens)`;

          await this.registrarEvento(sessao.id, TipoEvento.DISPUTA_ITEM_INICIADA,
            `Disputa iniciada para ${descricaoLote}`,
            undefined, undefined, sessao.pregoeiro_nome, true);
        }
      }
    }

    // Atualiza sessão para modo aberto
    sessao.status = StatusSessao.MODO_ABERTO;
    sessao.etapa = EtapaSessao.DISPUTA_LANCES;
    await this.sessaoRepository.save(sessao);

    return { sessao, itensIniciados, lotesIniciados, tipoDisputa };
  }

  /**
   * Inicia disputa apenas para itens selecionados
   */
  async iniciarItensSelecionados(sessaoId: string, itensIds: string[]): Promise<{ 
    itensIniciados: number;
  }> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    const agora = new Date();
    let itensIniciados = 0;

    for (const itemId of itensIds) {
      const item = await this.itemRepository.findOneBy({ id: itemId });
      if (!item) continue;

      if (!item.status_disputa || item.status_disputa === StatusDisputaItem.AGUARDANDO) {
        // Converter propostas em lances antes de iniciar
        await this.converterPropostasEmLances(itemId, sessao.licitacao_id);
        
        await this.itemRepository.update(itemId, {
          status_disputa: StatusDisputaItem.EM_DISPUTA,
          disputa_iniciada_em: agora,
          ultimo_lance_em: agora,
          inicio_tempo_aleatorio: undefined,
          tempo_aleatorio_sorteado: undefined,
        });
        itensIniciados++;

        await this.registrarEvento(sessao.id, TipoEvento.DISPUTA_ITEM_INICIADA,
          `Disputa iniciada para o Item ${item.numero_item}: ${item.descricao_resumida}`,
          itemId, undefined, sessao.pregoeiro_nome, true);
      }
    }

    // Atualizar status da sessão se for o primeiro item
    if (itensIniciados > 0 && sessao.status !== StatusSessao.MODO_ABERTO) {
      sessao.status = StatusSessao.MODO_ABERTO;
      sessao.etapa = EtapaSessao.DISPUTA_LANCES;
      await this.sessaoRepository.save(sessao);
    }

    return { itensIniciados };
  }

  /**
   * Converte propostas em lances ao iniciar disputa
   */
  private async converterPropostasEmLances(itemId: string, licitacaoId: string): Promise<void> {
    // Buscar itens da proposta (relacionamento com item)
    const itensProposta = await this.propostaItemRepository.find({
      where: { item_licitacao_id: itemId },
      relations: ['proposta', 'proposta.fornecedor']
    });

    for (const itemProposta of itensProposta) {
      const proposta = itemProposta.proposta;
      
      // Apenas propostas classificadas/recebidas
      if (proposta.status !== 'CLASSIFICADA' && proposta.status !== 'RECEBIDA') {
        continue;
      }

      // Verificar se já existe lance para este fornecedor
      const lanceExistente = await this.lanceRepository.findOne({
        where: {
          item_id: itemId,
          fornecedor_identificador: proposta.fornecedor_id.toString()
        }
      });

      if (!lanceExistente && itemProposta.valor_total) {
        // Criar lance a partir da proposta
        const lance = this.lanceRepository.create({
          licitacao_id: licitacaoId,
          item_id: itemId,
          fornecedor_identificador: proposta.fornecedor_id.toString(),
          fornecedor_nome: proposta.fornecedor?.razao_social || 'Fornecedor',
          valor: itemProposta.valor_total,
          ip_origem: 'SISTEMA',
          cancelado: false,
          created_at: proposta.created_at || new Date()
        });

        await this.lanceRepository.save(lance);
      }
    }
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

    const item = await this.itemRepository.findOneBy({ id: itemId });
    if (!item) throw new NotFoundException('Item nao encontrado');

    // Validacoes de estado da sessão
    if (sessao.status !== StatusSessao.MODO_ABERTO && sessao.status !== StatusSessao.EM_ANDAMENTO) {
      throw new BadRequestException('Sessao nao esta em modo de disputa aberta');
    }

    // Validação por ITEM (não mais por sessão)
    if (item.status_disputa !== StatusDisputaItem.EM_DISPUTA && item.status_disputa !== StatusDisputaItem.TEMPO_ALEATORIO) {
      throw new BadRequestException('Este item nao esta em disputa no momento');
    }

    // Busca melhor lance atual DO ITEM
    const melhorLance = await this.lanceRepository.findOne({
      where: { item_id: itemId, cancelado: false },
      order: { valor: 'ASC' }
    });

    // Valida se o lance é igual ao melhor (não pode ter valores iguais)
    if (melhorLance && valor === Number(melhorLance.valor)) {
      throw new BadRequestException(
        `Lance não pode ser igual ao melhor lance atual (R$ ${Number(melhorLance.valor).toFixed(2)}). Informe um valor diferente.`
      );
    }

    // Valida se o lance e menor que o melhor
    if (melhorLance && valor >= Number(melhorLance.valor)) {
      throw new BadRequestException(
        `Lance deve ser menor que o melhor lance atual (R$ ${melhorLance.valor})`
      );
    }

    // Busca ultimo lance do fornecedor NESTE ITEM
    const meuUltimoLance = await this.lanceRepository.findOne({
      where: { 
        item_id: itemId, 
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
      item_id: itemId,
      fornecedor_identificador: fornecedorId,
      valor,
      ip_origem: ip,
      cancelado: false,
    });

    await this.lanceRepository.save(lance);

    const agora = new Date();

    // Atualiza timestamp do ultimo lance NO ITEM (controle por item)
    await this.itemRepository.update(itemId, {
      ultimo_lance_em: agora,
      melhor_lance_valor: valor,
      melhor_lance_fornecedor_id: fornecedorId,
    });

    // Se o item estava em tempo aleatorio, aplica prorrogacao
    if (item.inicio_tempo_aleatorio) {
      await this.registrarEvento(sessao.id, TipoEvento.PRORROGACAO_AUTOMATICA,
        `Prorrogacao automatica aplicada para Item ${item.numero_item}`,
        itemId, fornecedorId, fornecedorNome, true);
    }

    // Mantém compatibilidade com sessão (para sistemas legados)
    sessao.ultimo_lance_em = agora;
    await this.sessaoRepository.save(sessao);

    // Registra evento
    await this.registrarEvento(sessao.id, TipoEvento.LANCE_REGISTRADO,
      `Lance de R$ ${valor.toFixed(2)} registrado`,
      itemId, fornecedorId, fornecedorNome, false, { valor, lance_id: lance.id });

    return lance;
  }

  /**
   * Registra lance por LOTE (valor total do lote)
   * Na disputa por lote, o fornecedor dá lance sobre o valor total
   * O lance é registrado em TODOS os itens do lote proporcionalmente
   */
  async registrarLanceLote(
    sessaoId: string,
    loteId: string,
    fornecedorId: string,
    fornecedorNome: string,
    valorTotalLote: number,
    ip: string
  ): Promise<{ lances: Lance[]; valorTotal: number }> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    // Verifica se a sessão é por lote
    if (sessao.disputa_por_item) {
      throw new BadRequestException('Esta sessão é por item, não por lote. Use o endpoint de lance por item.');
    }

    // Busca todos os itens do lote
    const itensDoLote = await this.itemRepository.find({
      where: { lote_id: loteId, licitacao_id: sessao.licitacao_id }
    });

    if (itensDoLote.length === 0) {
      throw new NotFoundException('Nenhum item encontrado para este lote');
    }

    // Verifica se algum item do lote está em disputa
    const itemEmDisputa = itensDoLote.find(i => 
      i.status_disputa === StatusDisputaItem.EM_DISPUTA || 
      i.status_disputa === StatusDisputaItem.TEMPO_ALEATORIO
    );

    if (!itemEmDisputa) {
      throw new BadRequestException('Este lote não está em disputa no momento');
    }

    // Calcula valor total de referência do lote
    const valorReferenciaLote = itensDoLote.reduce((sum, item) => {
      return sum + (Number(item.valor_total_estimado) || 0);
    }, 0);

    // Busca melhor lance atual do lote (soma dos melhores lances de cada item)
    let melhorLanceAtualLote = 0;
    for (const item of itensDoLote) {
      const melhorLanceItem = await this.lanceRepository.findOne({
        where: { item_id: item.id, cancelado: false },
        order: { valor: 'ASC' }
      });
      if (melhorLanceItem) {
        melhorLanceAtualLote += Number(melhorLanceItem.valor) * item.quantidade;
      } else {
        // Se não tem lance, usa valor de referência
        melhorLanceAtualLote += Number(item.valor_total_estimado) || 0;
      }
    }

    // Valida se o lance é menor que o melhor atual
    if (valorTotalLote >= melhorLanceAtualLote) {
      throw new BadRequestException(
        `Lance deve ser menor que o melhor lance atual do lote (R$ ${melhorLanceAtualLote.toFixed(2)})`
      );
    }

    // Calcula fator de desconto
    const fatorDesconto = valorTotalLote / valorReferenciaLote;

    // Registra lance em cada item proporcionalmente
    const lances: Lance[] = [];
    const agora = new Date();

    for (const item of itensDoLote) {
      const valorUnitarioItem = (Number(item.valor_unitario_estimado) || 0) * fatorDesconto;
      
      const lance = this.lanceRepository.create({
        licitacao_id: sessao.licitacao_id,
        item_id: item.id,
        fornecedor_identificador: fornecedorId,
        valor: valorUnitarioItem,
        ip_origem: ip,
        cancelado: false,
      });

      await this.lanceRepository.save(lance);
      lances.push(lance);

      // Atualiza timestamp do ultimo lance no item
      await this.itemRepository.update(item.id, {
        ultimo_lance_em: agora,
        melhor_lance_valor: valorUnitarioItem,
        melhor_lance_fornecedor_id: fornecedorId,
      });
    }

    // Mantém compatibilidade com sessão
    sessao.ultimo_lance_em = agora;
    await this.sessaoRepository.save(sessao);

    // Registra evento
    await this.registrarEvento(sessao.id, TipoEvento.LANCE_REGISTRADO,
      `Lance de R$ ${valorTotalLote.toFixed(2)} registrado para Lote (${itensDoLote.length} itens)`,
      undefined, fornecedorId, fornecedorNome, false, { 
        valorTotal: valorTotalLote, 
        loteId,
        quantidadeItens: itensDoLote.length 
      });

    return { lances, valorTotal: valorTotalLote };
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
   * Encerra a disputa do item atual (legado)
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

  /**
   * Encerra a disputa de um item específico por ID
   * Usado no novo sistema de disputa simultânea
   */
  async encerrarDisputaItemPorId(sessaoId: string, itemId?: string): Promise<{ sessao: SessaoDisputa; itemNumero?: number }> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    // Se não passou itemId, usa o item_atual_id (compatibilidade)
    const targetItemId = itemId || sessao.item_atual_id;
    
    if (!targetItemId) {
      throw new BadRequestException('Nenhum item especificado para encerrar');
    }

    const item = await this.itemRepository.findOneBy({ id: targetItemId });
    if (!item) throw new NotFoundException('Item nao encontrado');

    // Busca melhor lance DO ITEM
    const melhorLance = await this.lanceRepository.findOne({
      where: { item_id: targetItemId, cancelado: false },
      order: { valor: 'ASC' }
    });

    // Atualiza status do item para ENCERRADO
    await this.itemRepository.update(targetItemId, {
      status_disputa: StatusDisputaItem.ENCERRADO,
      disputa_encerrada_em: new Date(),
      inicio_tempo_aleatorio: undefined,
      tempo_aleatorio_sorteado: undefined,
      melhor_lance_valor: melhorLance?.valor || undefined,
      melhor_lance_fornecedor_id: melhorLance?.fornecedor_identificador || undefined,
    });

    // Registra evento
    const descricao = melhorLance 
      ? `Item ${item.numero_item} encerrado. Melhor lance: R$ ${Number(melhorLance.valor).toFixed(2)} - ${melhorLance.fornecedor_identificador}`
      : `Item ${item.numero_item} encerrado sem lances`;

    await this.registrarEvento(sessao.id, TipoEvento.DISPUTA_ITEM_ENCERRADA,
      descricao, targetItemId, melhorLance?.fornecedor_identificador, 'SISTEMA', true,
      { melhor_lance: melhorLance?.valor, item_numero: item.numero_item });

    // Verifica se todos os itens foram encerrados
    const itensRestantes = await this.itemRepository.count({
      where: [
        { licitacao_id: sessao.licitacao_id, status_disputa: StatusDisputaItem.EM_DISPUTA },
        { licitacao_id: sessao.licitacao_id, status_disputa: StatusDisputaItem.TEMPO_ALEATORIO },
        { licitacao_id: sessao.licitacao_id, status_disputa: StatusDisputaItem.AGUARDANDO }
      ]
    });

    if (itensRestantes === 0) {
      // Todos os itens encerrados - avança para negociação
      sessao.status = StatusSessao.EM_ANDAMENTO;
      sessao.etapa = EtapaSessao.NEGOCIACAO;
      sessao.item_atual_id = undefined as any;
      await this.sessaoRepository.save(sessao);

      await this.registrarEvento(sessao.id, TipoEvento.DISPUTA_ENCERRADA,
        'Fase de disputa encerrada. Todos os itens foram finalizados.',
        undefined, undefined, 'SISTEMA', true);
    }

    return { sessao, itemNumero: item.numero_item };
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
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

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
   * Reinicia a disputa de todos os itens
   * Reseta status dos itens para AGUARDANDO e volta sessão para DISPUTA_LANCES
   */
  async reiniciarDisputa(sessaoId: string, motivo?: string): Promise<SessaoDisputa> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    // Reseta todos os itens para AGUARDANDO
    await this.itemRepository.update(
      { licitacao_id: sessao.licitacao_id },
      {
        status_disputa: StatusDisputaItem.AGUARDANDO,
        ultimo_lance_em: undefined,
        inicio_tempo_aleatorio: undefined,
        tempo_aleatorio_sorteado: undefined,
        disputa_iniciada_em: undefined,
        disputa_encerrada_em: undefined,
      }
    );

    // Remove TODOS os lances da licitação
    await this.lanceRepository.delete({
      licitacao_id: sessao.licitacao_id
    });

    // Volta sessão para fase de disputa
    sessao.etapa = EtapaSessao.DISPUTA_LANCES;
    sessao.status = StatusSessao.MODO_ABERTO;
    sessao.item_atual_id = undefined as any;
    sessao.inicio_tempo_aleatorio = undefined as any;
    sessao.tempo_aleatorio_sorteado = undefined as any;

    await this.sessaoRepository.save(sessao);

    await this.registrarEvento(
      sessao.id,
      TipoEvento.MENSAGEM_SISTEMA,
      `Disputa reiniciada pelo pregoeiro${motivo ? `. Motivo: ${motivo}` : ''}`,
      undefined,
      undefined,
      sessao.pregoeiro_nome,
      true
    );

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
    sessao.fornecedor_habilitacao_id = fornecedorId;
    await this.sessaoRepository.save(sessao);

    // Busca nome do fornecedor para o evento
    const proposta = await this.propostaRepository.findOne({
      where: { licitacao_id: sessao.licitacao_id, fornecedor_id: fornecedorId },
      relations: ['fornecedor'],
    });
    const nomeFornecedor = proposta?.fornecedor?.razao_social ?? fornecedorId;

    await this.registrarEvento(sessao.id, TipoEvento.CONVOCACAO_HABILITACAO,
      `Fornecedor ${nomeFornecedor} convocado para apresentar documentos de habilitacao (Art. 62, Lei 14.133/2021)`,
      undefined, fornecedorId, sessao.pregoeiro_nome, true);
  }

  async aprovarHabilitacao(sessaoId: string, fornecedorId: string): Promise<void> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    // Avança para prazo de intenção de recurso (Art. 165, Lei 14.133/2021)
    sessao.etapa = EtapaSessao.INTENCAO_RECURSO;
    sessao.fornecedor_habilitacao_id = null;
    await this.sessaoRepository.save(sessao);

    await this.registrarEvento(sessao.id, TipoEvento.HABILITACAO_APROVADA,
      `Habilitacao APROVADA. Sessao avancou para fase de intencao de recurso (Art. 165)`,
      undefined, fornecedorId, sessao.pregoeiro_nome, true);
  }

  async reprovarHabilitacao(sessaoId: string, fornecedorId: string, motivo: string): Promise<void> {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    await this.registrarEvento(sessao.id, TipoEvento.HABILITACAO_REPROVADA,
      `Habilitacao REPROVADA. Motivo: ${motivo}. Proximo classificado sera convocado.`,
      undefined, fornecedorId, sessao.pregoeiro_nome, true, { motivo });

    // Convoca o próximo classificado automaticamente
    const proximoId = await this.encontrarProximoClassificado(sessao.licitacao_id, fornecedorId);
    if (proximoId) {
      await this.convocarParaHabilitacao(sessaoId, proximoId);
    } else {
      // Sem próximo — sessão vai para encerramento sem vencedor
      sessao.etapa = EtapaSessao.ENCERRAMENTO;
      sessao.fornecedor_habilitacao_id = null;
      await this.sessaoRepository.save(sessao);
      await this.registrarEvento(sessao.id, TipoEvento.SESSAO_ENCERRADA,
        'Nenhum fornecedor habilitado. Sessao encerrada sem vencedor.',
        undefined, undefined, sessao.pregoeiro_nome, true);
    }
  }

  /** Retorna o ranking de habilitação: convocado atual + todos os classificados em ordem */
  async getHabilitacaoStatus(sessaoId: string) {
    const sessao = await this.sessaoRepository.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessao nao encontrada');

    // Propostas classificadas ordenadas por valor total (menor = melhor colocado)
    const propostas = await this.propostaRepository.find({
      where: { licitacao_id: sessao.licitacao_id },
      relations: ['fornecedor'],
      order: { valor_total_proposta: 'ASC' },
    });

    const classificadas = propostas.filter(p =>
      ['CLASSIFICADA', 'VENCEDORA', 'SEGUNDA_COLOCADA', 'ENVIADA', 'VALIDA'].includes(p.status)
    );

    const ranking = classificadas.map((p, i) => ({
      posicao: i + 1,
      fornecedorId: p.fornecedor_id,
      razaoSocial: p.fornecedor?.razao_social ?? 'Desconhecido',
      cpfCnpj: p.fornecedor?.cpf_cnpj ?? '',
      porte: (p.fornecedor as any)?.porte ?? null,
      valorTotal: Number(p.valor_total_proposta),
      status: p.status,
      isConvocado: p.fornecedor_id === sessao.fornecedor_habilitacao_id,
    }));

    const convocado = ranking.find(r => r.isConvocado) ?? null;

    return {
      sessaoId,
      licitacaoId: sessao.licitacao_id,
      etapa: sessao.etapa,
      convocado,
      ranking,
    };
  }

  /** Encontra o próximo fornecedor classificado após o atual (para reprovar habilitação) */
  private async encontrarProximoClassificado(licitacaoId: string, fornecedorAtualId: string): Promise<string | null> {
    const propostas = await this.propostaRepository.find({
      where: { licitacao_id: licitacaoId },
      order: { valor_total_proposta: 'ASC' },
    });
    const classificadas = propostas.filter(p =>
      ['CLASSIFICADA', 'VENCEDORA', 'SEGUNDA_COLOCADA', 'ENVIADA', 'VALIDA'].includes(p.status)
    );
    const idx = classificadas.findIndex(p => p.fornecedor_id === fornecedorAtualId);
    return classificadas[idx + 1]?.fornecedor_id ?? null;
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
        'l.created_at as data_hora',
        'f.razao_social as razao_social',
        'f.cnpj as cnpj',
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
        'f.cnpj as cnpj',
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

    // Calcular resumo
    const totalLances = lances.length;
    const totalParticipantes = participantesUnicos.length;
    const valorTotalAdjudicado = itens.reduce((acc, item) => {
      const melhorLance = lances
        .filter(l => l.item_id === item.id.toString())
        .sort((a, b) => parseFloat(a.valor) - parseFloat(b.valor))[0];
      return acc + (melhorLance ? parseFloat(melhorLance.valor) * parseFloat(item.quantidade as any) : 0);
    }, 0);

    const valorTotalEstimado = itens.reduce((acc, item) => {
      return acc + (parseFloat(item.valor_unitario_estimado as any) || 0) * (parseFloat(item.quantidade as any) || 1);
    }, 0);

    const economiaTotal = valorTotalEstimado - valorTotalAdjudicado;
    const percentualEconomia = valorTotalEstimado > 0 ? (economiaTotal / valorTotalEstimado) * 100 : 0;

    // Mapear itens com resultado
    const itensComResultado = itens.map(item => {
      const lancesItem = lances
        .filter(l => l.item_id === item.id.toString())
        .sort((a, b) => parseFloat(a.valor) - parseFloat(b.valor));
      
      const melhorLance = lancesItem[0];
      
      return {
        id: item.id,
        numero: item.numero_item,
        descricao: item.descricao_resumida || item.descricao_detalhada,
        quantidade: item.quantidade,
        unidade: item.unidade_medida,
        valor_estimado: item.valor_unitario_estimado,
        total_lances: lancesItem.length,
        melhor_lance: melhorLance ? {
          valor: melhorLance.valor,
          fornecedor: melhorLance.razao_social || melhorLance.fornecedor_nome,
          cnpj: melhorLance.cnpj,
          data_hora: melhorLance.data_hora,
        } : null,
        economia: melhorLance 
          ? parseFloat(item.valor_unitario_estimado as any) - parseFloat(melhorLance.valor)
          : 0,
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
  // CRON JOB - VERIFICACAO AUTOMATICA POR ITEM
  // Lei 14.133/2021 - Tempo de inatividade e tempo aleatório
  // ========================================

  @Cron(CronExpression.EVERY_10_SECONDS)
  async verificarItensEmDisputa(): Promise<void> {
    try {
      // Busca todos os itens em disputa ou em tempo aleatório
      const itensEmDisputa = await this.itemRepository.find({
        where: [
          { status_disputa: StatusDisputaItem.EM_DISPUTA },
          { status_disputa: StatusDisputaItem.TEMPO_ALEATORIO }
        ]
      });

      const agora = new Date();

      for (const item of itensEmDisputa) {
        // Busca a sessão do item para obter configurações de tempo
        const sessao = await this.sessaoRepository.findOne({
          where: { licitacao_id: item.licitacao_id, status: StatusSessao.MODO_ABERTO }
        });

        if (!sessao) continue;

        const tempoInatividade = (sessao.tempo_inatividade_minutos || 10) * 60 * 1000; // em ms
        const ultimoLance = item.ultimo_lance_em ? new Date(item.ultimo_lance_em).getTime() : 0;
        const tempoDecorrido = agora.getTime() - ultimoLance;

        // ========================================
        // ITEM EM DISPUTA - Verificar inatividade
        // ========================================
        if (item.status_disputa === StatusDisputaItem.EM_DISPUTA) {
          if (ultimoLance > 0 && tempoDecorrido >= tempoInatividade) {
            // Tempo de inatividade expirou - iniciar tempo aleatório
            await this.iniciarTempoAleatorioItem(item.id, sessao);
          }
        }

        // ========================================
        // ITEM EM TEMPO ALEATÓRIO - Verificar encerramento
        // ========================================
        if (item.status_disputa === StatusDisputaItem.TEMPO_ALEATORIO) {
          const inicioAleatorio = item.inicio_tempo_aleatorio ? new Date(item.inicio_tempo_aleatorio).getTime() : 0;
          const tempoSorteado = (item.tempo_aleatorio_sorteado || 0) * 1000; // em ms
          const tempoAleatorioDecorrido = agora.getTime() - inicioAleatorio;

          if (inicioAleatorio > 0 && tempoAleatorioDecorrido >= tempoSorteado) {
            // Tempo aleatório expirou - encerrar item
            await this.encerrarDisputaItemAutomatico(item.id, sessao);
          }
        }
      }
    } catch (error) {
      console.error('[CRON] Erro ao verificar itens em disputa:', error);
    }
  }

  /**
   * Inicia o tempo aleatório para um item específico
   * Lei 14.133/2021 - Tempo aleatório entre 1 e 30 minutos
   */
  private async iniciarTempoAleatorioItem(itemId: string, sessao: SessaoDisputa): Promise<void> {
    const minMinutos = sessao.tempo_aleatorio_min_minutos || 1;
    const maxMinutos = sessao.tempo_aleatorio_max_minutos || 30;
    
    // Sorteia tempo aleatório em segundos
    const tempoSorteado = Math.floor(Math.random() * (maxMinutos - minMinutos + 1) + minMinutos) * 60;
    
    await this.itemRepository.update(itemId, {
      status_disputa: StatusDisputaItem.TEMPO_ALEATORIO,
      inicio_tempo_aleatorio: new Date(),
      tempo_aleatorio_sorteado: tempoSorteado,
    });

    const item = await this.itemRepository.findOneBy({ id: itemId });
    
    await this.registrarEvento(
      sessao.id,
      TipoEvento.TEMPO_ALEATORIO_INICIADO,
      `Tempo aleatório iniciado para Item ${item?.numero_item}. Encerramento em até ${Math.ceil(tempoSorteado / 60)} minutos.`,
      itemId,
      undefined,
      'Sistema',
      true
    );

    console.log(`[CRON] Tempo aleatório iniciado para item ${itemId}: ${tempoSorteado}s`);
  }

  /**
   * Encerra automaticamente a disputa de um item
   */
  private async encerrarDisputaItemAutomatico(itemId: string, sessao: SessaoDisputa): Promise<void> {
    const item = await this.itemRepository.findOneBy({ id: itemId });
    if (!item) return;

    // Busca o melhor lance do item
    const melhorLance = await this.lanceRepository.findOne({
      where: { item_id: itemId, cancelado: false },
      order: { valor: 'ASC' }
    });

    await this.itemRepository.update(itemId, {
      status_disputa: StatusDisputaItem.ENCERRADO,
      disputa_encerrada_em: new Date(),
      melhor_lance_valor: melhorLance?.valor || undefined,
      melhor_lance_fornecedor_id: melhorLance?.fornecedor_id || undefined,
    });

    await this.registrarEvento(
      sessao.id,
      TipoEvento.DISPUTA_ITEM_ENCERRADA,
      `Disputa encerrada automaticamente para Item ${item.numero_item}: ${item.descricao_resumida}. ` +
      (melhorLance ? `Melhor lance: R$ ${Number(melhorLance.valor).toFixed(2)}` : 'Sem lances.'),
      itemId,
      melhorLance?.fornecedor_id,
      'Sistema',
      true
    );

    console.log(`[CRON] Item ${itemId} encerrado automaticamente`);

    // Verifica se todos os itens da sessão foram encerrados
    const itensRestantes = await this.itemRepository.count({
      where: [
        { licitacao_id: sessao.licitacao_id, status_disputa: StatusDisputaItem.EM_DISPUTA },
        { licitacao_id: sessao.licitacao_id, status_disputa: StatusDisputaItem.TEMPO_ALEATORIO }
      ]
    });

    if (itensRestantes === 0) {
      // Todos os itens encerrados - finalizar fase de disputa
      sessao.status = StatusSessao.EM_ANDAMENTO;
      sessao.etapa = EtapaSessao.CONVOCACAO_HABILITACAO;
      await this.sessaoRepository.save(sessao);

      await this.registrarEvento(
        sessao.id,
        TipoEvento.DISPUTA_ENCERRADA,
        'Fase de disputa encerrada. Todos os itens foram finalizados. Iniciando fase de habilitação.',
        undefined,
        undefined,
        'Sistema',
        true
      );

      console.log(`[CRON] Sessão ${sessao.id} - Fase de disputa encerrada`);
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

  // ========================================
  // SALA DE DISPUTA - ENDPOINTS PARA FORNECEDOR
  // ========================================

  /**
   * Lista todas as licitações com sessão ativa onde o fornecedor tem proposta
   * Usado na sala de disputa do fornecedor
   */
  async getLicitacoesAtivasFornecedor(fornecedorId: string): Promise<{
    licitacoes: any[];
  }> {
    if (!fornecedorId) {
      throw new BadRequestException('ID do fornecedor é obrigatório');
    }

    // Busca sessões ativas (EM_ANDAMENTO, AGUARDANDO_INICIO, etc)
    const sessoesAtivas = await this.sessaoRepository
      .createQueryBuilder('s')
      .innerJoin('licitacoes', 'l', 'l.id = s.licitacao_id')
      .innerJoin('propostas', 'p', 'p.licitacao_id = l.id AND p.fornecedor_id = :fornecedorId', { fornecedorId })
      .leftJoin('orgaos', 'o', 'o.id = l.orgao_id')
      .where('s.status IN (:...status)', { 
        status: [StatusSessao.AGUARDANDO_INICIO, StatusSessao.EM_ANDAMENTO, StatusSessao.MODO_ABERTO, StatusSessao.RANDOM_ENCERRANDO] 
      })
      .andWhere('p.status IN (:...propostaStatus)', { propostaStatus: ['ENVIADA', 'RECEBIDA', 'CLASSIFICADA'] })
      .select([
        's.id as sessao_id',
        's.status as sessao_status',
        's.etapa as sessao_etapa',
        's.item_atual_id as item_atual_id',
        'l.id as licitacao_id',
        'l.numero_edital as numero_edital',
        'l.numero_processo as numero_processo',
        'l.objeto as objeto',
        'l.modalidade as modalidade',
        'o.nome as orgao_nome',
        'o.id as orgao_id',
      ])
      .getRawMany();

    // Para cada sessão, buscar informações adicionais
    const licitacoes = await Promise.all(sessoesAtivas.map(async (sessao) => {
      // Contar itens em disputa
      const itensCount = await this.itemRepository
        .createQueryBuilder('i')
        .where('i.licitacao_id = :licitacaoId', { licitacaoId: sessao.licitacao_id })
        .getCount();

      // Buscar posição do fornecedor (baseado no melhor lance por item)
      const minhaPosicao = await this.calcularPosicaoGeralFornecedor(sessao.licitacao_id, fornecedorId);

      return {
        id: sessao.licitacao_id,
        sessaoId: sessao.sessao_id,
        numero: `${sessao.modalidade?.substring(0, 2) || 'PE'} ${sessao.numero_edital || ''}`,
        orgao: sessao.orgao_nome,
        orgaoId: sessao.orgao_id,
        objeto: sessao.objeto,
        status: sessao.sessao_status,
        etapa: sessao.sessao_etapa,
        itensEmDisputa: itensCount,
        itensTotal: itensCount,
        minhaPosicaoGeral: minhaPosicao,
      };
    }));

    return { licitacoes };
  }

  /**
   * Calcula a posição geral do fornecedor na licitação
   * Baseado na quantidade de itens onde está em 1º lugar
   */
  private async calcularPosicaoGeralFornecedor(licitacaoId: string, fornecedorId: string): Promise<number> {
    // Busca todos os itens da licitação
    const itens = await this.itemRepository.find({
      where: { licitacao_id: licitacaoId }
    });

    let itensEm1o = 0;
    let itensComLance = 0;

    for (const item of itens) {
      // Busca o melhor lance do item
      const melhorLance = await this.lanceRepository.findOne({
        where: { item_id: item.id },
        order: { valor: 'ASC' }
      });

      if (melhorLance) {
        if (melhorLance.fornecedor_id === fornecedorId) {
          itensEm1o++;
        }
        
        // Verifica se o fornecedor tem lance neste item
        const meuLance = await this.lanceRepository.findOne({
          where: { item_id: item.id, fornecedor_id: fornecedorId },
          order: { valor: 'ASC' }
        });
        
        if (meuLance) {
          itensComLance++;
        }
      }
    }

    // Retorna posição baseada em quantos itens está em 1º
    if (itensEm1o === itens.length && itens.length > 0) return 1;
    if (itensEm1o > 0) return 2;
    if (itensComLance > 0) return 3;
    return 0; // Sem lances
  }

  /**
   * Obtém os itens em disputa de uma sessão para o fornecedor
   * Inclui informações de posição e lances do fornecedor
   */
  async getItensSessaoFornecedor(sessaoId: string, fornecedorId: string): Promise<{
    itens: any[];
    sessao: any;
  }> {
    if (!fornecedorId) {
      throw new BadRequestException('ID do fornecedor é obrigatório');
    }

    const sessao = await this.sessaoRepository.findOne({
      where: { id: sessaoId }
    });

    if (!sessao) {
      throw new NotFoundException('Sessão não encontrada');
    }

    // Busca itens da licitação
    const itens = await this.itemRepository.find({
      where: { licitacao_id: sessao.licitacao_id },
      order: { numero_item: 'ASC' }
    });

    // Para cada item, buscar informações de lances
    const itensComLances = await Promise.all(itens.map(async (item) => {
      // Melhor lance do item
      const melhorLance = await this.lanceRepository.findOne({
        where: { item_id: item.id },
        order: { valor: 'ASC' }
      });

      // Meu melhor lance
      const meuMelhorLance = await this.lanceRepository.findOne({
        where: { item_id: item.id, fornecedor_id: fornecedorId },
        order: { valor: 'ASC' }
      });

      // Contar participantes (fornecedores distintos com lance)
      const participantes = await this.lanceRepository
        .createQueryBuilder('l')
        .select('COUNT(DISTINCT l.fornecedor_id)', 'count')
        .where('l.item_id = :itemId', { itemId: item.id })
        .getRawOne();

      // Calcular minha posição neste item
      let minhaPosicao: number | null = null;
      if (meuMelhorLance) {
        const lancesAcima = await this.lanceRepository
          .createQueryBuilder('l')
          .where('l.item_id = :itemId', { itemId: item.id })
          .andWhere('l.valor < :meuValor', { meuValor: meuMelhorLance.valor })
          .select('COUNT(DISTINCT l.fornecedor_id)', 'count')
          .getRawOne();
        
        minhaPosicao = parseInt(lancesAcima?.count || '0') + 1;
      }

      // Determinar status do item (baseado no status_disputa)
      const statusOriginal = item.status_disputa || 'AGUARDANDO';
      let status: 'EM_DISPUTA' | 'AGUARDANDO' | 'ENCERRADO';
      let emTempoAleatorio = false;
      
      // Mapear status para o formato esperado pelo frontend
      switch (statusOriginal) {
        case 'EM_DISPUTA':
        case 'TEMPO_ALEATORIO':
          status = 'EM_DISPUTA';
          if (statusOriginal === 'TEMPO_ALEATORIO') {
            emTempoAleatorio = true;
          }
          break;
        case 'ENCERRADO':
          status = 'ENCERRADO';
          break;
        default:
          status = 'AGUARDANDO';
      }

      // Calcular tempo restante (baseado no status do item)
      let tempoRestante = 0;
      
      if (status === 'EM_DISPUTA') {
        // Se o item está em disputa, calcular tempo baseado no início da disputa
        if (item.disputa_iniciada_em) {
          const tempoDecorrido = Math.floor((Date.now() - new Date(item.disputa_iniciada_em).getTime()) / 1000);
          tempoRestante = Math.max(0, (sessao.tempo_inatividade_minutos * 60) - tempoDecorrido);
        }

        // Se está em tempo aleatório, calcular tempo restante baseado no tempo aleatório
        if (emTempoAleatorio && item.inicio_tempo_aleatorio) {
          const tempoAleatorioDecorrido = Math.floor((Date.now() - new Date(item.inicio_tempo_aleatorio).getTime()) / 1000);
          const tempoAleatorioTotal = (item.tempo_aleatorio_sorteado || sessao.tempo_aleatorio_max_minutos) * 60;
          tempoRestante = Math.max(0, tempoAleatorioTotal - tempoAleatorioDecorrido);
        }
      }

      return {
        id: item.id,
        numero: item.numero_item,
        descricao: item.descricao_resumida || item.descricao_detalhada,
        quantidade: parseFloat(item.quantidade as any) || 1,
        unidade: item.unidade_medida,
        valorReferencia: parseFloat(item.valor_unitario_estimado as any) || 0,
        melhorLance: melhorLance ? parseFloat(melhorLance.valor as any) : null,
        meuLance: meuMelhorLance ? parseFloat(meuMelhorLance.valor as any) : null,
        minhaPosicao,
        totalParticipantes: parseInt(participantes?.count || '0'),
        tempoRestante,
        emTempoAleatorio,
        status,
      };
    }));

    return {
      itens: itensComLances,
      sessao: {
        id: sessao.id,
        status: sessao.status,
        etapa: sessao.etapa,
        itemAtualId: sessao.item_atual_id,
        tempoInatividade: sessao.tempo_inatividade_minutos,
        tempoAleatorioMin: sessao.tempo_aleatorio_min_minutos,
        tempoAleatorioMax: sessao.tempo_aleatorio_max_minutos,
      }
    };
  }

  /**
   * Obtém os lances de um item específico
   * Anonimiza nomes dos fornecedores (exceto o próprio)
   */
  async getLancesItem(itemId: string, fornecedorId: string): Promise<{
    lances: any[];
    melhorLance: any | null;
    meuMelhorLance: any | null;
  }> {
    if (!fornecedorId) {
      throw new BadRequestException('ID do fornecedor é obrigatório');
    }

    const item = await this.itemRepository.findOne({
      where: { id: itemId }
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    // Busca todos os lances do item ordenados por valor
    const lances = await this.lanceRepository
      .createQueryBuilder('l')
      .leftJoin('fornecedores', 'f', 'f.id::text = l.fornecedor_id')
      .where('l.item_id = :itemId', { itemId })
      .orderBy('l.valor', 'ASC')
      .addOrderBy('l.created_at', 'ASC')
      .select([
        'l.id as id',
        'l.valor as valor',
        'l.fornecedor_id as fornecedor_id',
        'l.created_at as created_at',
        'f.razao_social as razao_social',
      ])
      .getRawMany();

    // Mapear fornecedores para letras (anonimização)
    const fornecedoresMap = new Map<string, string>();
    let letraIndex = 0;
    
    lances.forEach(lance => {
      if (!fornecedoresMap.has(lance.fornecedor_id)) {
        fornecedoresMap.set(lance.fornecedor_id, String.fromCharCode(65 + letraIndex));
        letraIndex++;
      }
    });

    // Agrupar por fornecedor para pegar apenas o melhor lance de cada
    const melhoresLancesPorFornecedor = new Map<string, any>();
    lances.forEach(lance => {
      if (!melhoresLancesPorFornecedor.has(lance.fornecedor_id)) {
        melhoresLancesPorFornecedor.set(lance.fornecedor_id, lance);
      }
    });

    // Ordenar por valor e atribuir posição
    const lancesOrdenados = Array.from(melhoresLancesPorFornecedor.values())
      .sort((a, b) => parseFloat(a.valor) - parseFloat(b.valor))
      .map((lance, index) => ({
        id: lance.id,
        posicao: index + 1,
        fornecedor: lance.fornecedor_id === fornecedorId 
          ? 'Você' 
          : `Fornecedor ${fornecedoresMap.get(lance.fornecedor_id)}`,
        fornecedorId: lance.fornecedor_id,
        valor: parseFloat(lance.valor),
        valorTotal: parseFloat(lance.valor) * (parseFloat(item.quantidade as any) || 1),
        horario: new Date(lance.created_at).toLocaleTimeString('pt-BR'),
        isMeu: lance.fornecedor_id === fornecedorId,
      }));

    const melhorLance = lancesOrdenados.length > 0 ? lancesOrdenados[0] : null;
    const meuMelhorLance = lancesOrdenados.find(l => l.isMeu) || null;

    return {
      lances: lancesOrdenados,
      melhorLance,
      meuMelhorLance,
    };
  }

  /**
   * Obtém mensagens da sessão
   */
  async getMensagensSessao(sessaoId: string): Promise<{
    mensagens: any[];
  }> {
    // Buscar sessão para verificar etapa
    const sessao = await this.sessaoRepository.findOne({ where: { id: sessaoId } });
    
    // Etapas onde a identidade do fornecedor é revelada
    const etapasReveladas = [
      EtapaSessao.CONVOCACAO_HABILITACAO,
      EtapaSessao.ANALISE_HABILITACAO,
      EtapaSessao.INTENCAO_RECURSO,
      EtapaSessao.PRAZO_RECURSAL,
      EtapaSessao.ANALISE_RECURSOS,
      EtapaSessao.ADJUDICACAO,
      EtapaSessao.ENCERRAMENTO
    ];
    const revelarIdentidade = sessao && etapasReveladas.includes(sessao.etapa);

    const eventos = await this.eventoRepository.find({
      where: { sessao_id: sessaoId },
      order: { created_at: 'DESC' },
      take: 100, // Limitar para performance
    });

    const mensagens = eventos.map(evento => {
      let tipo = 'SISTEMA';
      if (evento.tipo === TipoEvento.MENSAGEM_PREGOEIRO) tipo = 'PREGOEIRO';
      else if (evento.tipo === TipoEvento.MENSAGEM_FORNECEDOR) tipo = 'FORNECEDOR';
      
      // Anonimizar fornecedor se não estiver em etapa revelada
      let remetente = evento.usuario_nome || 'Sistema';
      if (tipo === 'FORNECEDOR' && !revelarIdentidade && evento.fornecedor_id) {
        remetente = `Fornecedor ${evento.fornecedor_id.substring(0, 4).toUpperCase()}`;
      }
      
      return {
        id: evento.id,
        tipo,
        remetente,
        mensagem: evento.descricao,
        horario: new Date(evento.created_at).toLocaleTimeString('pt-BR'),
        destaque: evento.tipo === TipoEvento.TEMPO_ALEATORIO_INICIADO || 
                  evento.tipo === TipoEvento.DISPUTA_ITEM_ENCERRADA ||
                  evento.tipo === TipoEvento.SESSAO_SUSPENSA,
      };
    });

    return { mensagens: mensagens.reverse() }; // Ordem cronológica
  }

  /**
   * Salva mensagem do chat no banco de dados
   */
  async salvarMensagemChat(
    sessaoId: string,
    remetente: string,
    mensagem: string,
    isPregoeiro: boolean,
    fornecedorId?: string
  ): Promise<void> {
    const evento = this.eventoRepository.create({
      sessao_id: sessaoId,
      tipo: isPregoeiro ? TipoEvento.MENSAGEM_PREGOEIRO : TipoEvento.MENSAGEM_FORNECEDOR,
      descricao: mensagem,
      usuario_nome: remetente,
      fornecedor_id: fornecedorId,
    });
    await this.eventoRepository.save(evento);
  }

  /**
   * Habilita/desabilita o chat da sessão
   */
  async toggleChat(sessaoId: string, habilitado: boolean): Promise<void> {
    await this.sessaoRepository.update(sessaoId, {
      chat_desabilitado: !habilitado
    });

    // Registrar evento
    await this.registrarEvento(
      sessaoId,
      TipoEvento.MENSAGEM_SISTEMA,
      habilitado ? 'Chat habilitado pelo pregoeiro' : 'Chat desabilitado pelo pregoeiro',
      undefined, undefined, 'SISTEMA', true
    );
  }

  // ========================================
  // SALA DE DISPUTA - ENDPOINTS PARA PREGOEIRO
  // ========================================

  /**
   * Lista sessões ativas do pregoeiro
   */
  async getSessoesAtivasPregoeiro(pregoeiroId: string): Promise<{
    sessoes: any[];
  }> {
    if (!pregoeiroId) {
      throw new BadRequestException('ID do pregoeiro é obrigatório');
    }

    try {
      // Busca sessões ativas onde o usuário é pregoeiro da sessão ou da licitação
      const sessoesAtivas = await this.sessaoRepository
        .createQueryBuilder('s')
        .innerJoin('licitacoes', 'l', 'l.id = s.licitacao_id')
        .leftJoin('orgaos', 'o', 'o.id = l.orgao_id')
        .where('s.status IN (:...status)', { 
          status: [StatusSessao.AGUARDANDO_INICIO, StatusSessao.EM_ANDAMENTO, StatusSessao.MODO_ABERTO, StatusSessao.RANDOM_ENCERRANDO] 
        })
        .andWhere('(l.pregoeiro_id::text = :pregoeiroId OR s.pregoeiro_id::text = :pregoeiroId)', { pregoeiroId })
        .select([
          's.id as sessao_id',
          's.status as sessao_status',
          's.etapa as sessao_etapa',
          's.item_atual_id as item_atual_id',
          'l.id as licitacao_id',
          'l.numero_edital as numero_edital',
          'l.numero_processo as numero_processo',
          'l.objeto as objeto',
          'l.modalidade as modalidade',
          'o.nome as orgao_nome',
          'o.id as orgao_id',
        ])
        .getRawMany();

      const sessoes = await Promise.all(sessoesAtivas.map(async (sessao) => {
        try {
          const itensCount = await this.itemRepository
            .createQueryBuilder('i')
            .where('i.licitacao_id = :licitacaoId', { licitacaoId: sessao.licitacao_id })
            .getCount();

          // Contar itens encerrados (com adjudicação ou sem lances pendentes)
          const itensEncerrados = 0; // TODO: Implementar lógica real

          return {
            id: sessao.sessao_id,
            licitacaoId: sessao.licitacao_id,
            numero: `${sessao.modalidade?.substring(0, 2) || 'PE'} ${sessao.numero_edital || sessao.numero_processo || ''}`,
            orgao: sessao.orgao_nome || 'Órgão',
            objeto: sessao.objeto || 'Sem objeto',
            status: sessao.sessao_status,
            etapa: sessao.sessao_etapa,
            itemAtualId: sessao.item_atual_id,
            itensTotal: itensCount,
            itensEncerrados,
            fornecedoresOnline: 0, // TODO: Implementar via WebSocket
          };
        } catch (mapError) {
          console.error('Erro ao mapear sessão:', sessao.sessao_id, mapError);
          return null;
        }
      }));

      return { sessoes: sessoes.filter(Boolean) };
    } catch (error) {
      console.error('Erro em getSessoesAtivasPregoeiro:', error);
      // Retorna array vazio em vez de lançar erro para não quebrar o frontend
      return { sessoes: [] };
    }
  }

  /**
   * Obtém os itens em disputa de uma sessão para o pregoeiro
   * Inclui informações completas (não anonimizadas)
   */
  async getItensSessaoPregoeiro(sessaoId: string): Promise<{
    itens: any[];
    lotes: any[];
    sessao: any;
  }> {
    try {
      const sessao = await this.sessaoRepository.findOne({
        where: { id: sessaoId }
      });

      if (!sessao) {
        throw new NotFoundException('Sessão não encontrada');
      }

      const itens = await this.itemRepository.find({
        where: { licitacao_id: sessao.licitacao_id },
        order: { numero_item: 'ASC' }
      });

      const itensComLances = await Promise.all(itens.map(async (item) => {
        try {
          // Melhor lance do item
          let melhorLance = null;
          try {
            melhorLance = await this.lanceRepository
              .createQueryBuilder('l')
              .leftJoin('fornecedores', 'f', 'f.id::text = l.fornecedor_id')
              .where('l.item_id = :itemId', { itemId: item.id.toString() })
              .orderBy('l.valor', 'ASC')
              .select([
                'l.id as id',
                'l.valor as valor',
                'l.fornecedor_id as fornecedor_id',
                'l.fornecedor_nome as fornecedor_nome',
                'f.razao_social as razao_social',
              ])
              .getRawOne();
          } catch (e) {
            console.error('Erro ao buscar melhor lance:', e);
          }

          // Contar participantes
          let participantes = { count: '0' };
          try {
            participantes = await this.lanceRepository
              .createQueryBuilder('l')
              .select('COUNT(DISTINCT l.fornecedor_id)', 'count')
              .where('l.item_id = :itemId', { itemId: item.id.toString() })
              .getRawOne() || { count: '0' };
          } catch (e) {
            console.error('Erro ao contar participantes:', e);
          }

          // Determinar status do item - AGORA USA O CAMPO DO ITEM
          let status: 'EM_DISPUTA' | 'AGUARDANDO' | 'ENCERRADO' | 'TEMPO_ALEATORIO' | 'NEGOCIACAO' = 'AGUARDANDO';
          
          // Prioriza o status_disputa do item (novo sistema)
          if (item.status_disputa) {
            status = item.status_disputa as any;
          } else if (sessao.item_atual_id === item.id) {
            // Fallback para compatibilidade com sistema antigo
            status = 'EM_DISPUTA';
          } else if ((item as any).adjudicado || item.status === 'ADJUDICADO') {
            status = 'ENCERRADO';
          }

          // Calcular tempo restante - AGORA USA CAMPOS DO ITEM
          let tempoRestante = (sessao.tempo_inatividade_minutos || 10) * 60;
          let emTempoAleatorio = false;
          
          // Verifica se o item está em disputa (novo sistema ou legado)
          const itemEmDisputa = item.status_disputa === StatusDisputaItem.EM_DISPUTA || 
                                item.status_disputa === StatusDisputaItem.TEMPO_ALEATORIO ||
                                sessao.item_atual_id === item.id;
          
          if (itemEmDisputa) {
            try {
              // Usa o ultimo_lance_em do item se disponível
              const ultimoLanceEm = item.ultimo_lance_em || null;
              
              if (ultimoLanceEm) {
                const tempoDecorrido = Math.floor((Date.now() - new Date(ultimoLanceEm).getTime()) / 1000);
                tempoRestante = Math.max(0, ((sessao.tempo_inatividade_minutos || 10) * 60) - tempoDecorrido);
              } else {
                // Fallback: busca último lance do banco
                const ultimoLance = await this.lanceRepository.findOne({
                  where: { item_id: item.id.toString() },
                  order: { created_at: 'DESC' }
                });

                if (ultimoLance) {
                  const tempoDecorrido = Math.floor((Date.now() - new Date(ultimoLance.created_at).getTime()) / 1000);
                  tempoRestante = Math.max(0, ((sessao.tempo_inatividade_minutos || 10) * 60) - tempoDecorrido);
                }
              }

              // Verifica tempo aleatório do item
              if (item.inicio_tempo_aleatorio) {
                emTempoAleatorio = true;
                status = 'TEMPO_ALEATORIO';
              } else if (sessao.inicio_tempo_aleatorio && sessao.item_atual_id === item.id) {
                emTempoAleatorio = true;
                const tempoAleatorioDecorrido = Math.floor((Date.now() - new Date(sessao.inicio_tempo_aleatorio).getTime()) / 1000);
                const tempoAleatorioTotal = (sessao.tempo_aleatorio_sorteado || sessao.tempo_aleatorio_max_minutos || 10) * 60;
                tempoRestante = Math.max(0, tempoAleatorioTotal - tempoAleatorioDecorrido);
              }
            } catch (e) {
              console.error('Erro ao calcular tempo:', e);
            }
          }

          return {
            id: item.id,
            numero: item.numero_item,
            descricao: item.descricao_resumida || item.descricao_detalhada || 'Sem descrição',
            quantidade: parseFloat(item.quantidade as any) || 1,
            unidade: item.unidade_medida || 'UN',
            valorReferencia: parseFloat(item.valor_unitario_estimado as any) || 0,
            melhorLance: melhorLance ? parseFloat(melhorLance.valor) : null,
            melhorFornecedor: melhorLance ? (melhorLance.razao_social || melhorLance.fornecedor_nome || 'Fornecedor') : null,
            totalParticipantes: parseInt(participantes?.count || '0'),
            tempoRestante,
            emTempoAleatorio,
            status,
            loteId: item.lote_id || null,
          };
        } catch (itemError) {
          console.error('Erro ao processar item:', item.id, itemError);
          return {
            id: item.id,
            numero: item.numero_item,
            descricao: item.descricao_resumida || 'Erro ao carregar',
            quantidade: 1,
            unidade: 'UN',
            valorReferencia: 0,
            melhorLance: null,
            melhorFornecedor: null,
            totalParticipantes: 0,
            tempoRestante: 180,
            emTempoAleatorio: false,
            status: 'AGUARDANDO' as const,
            loteId: item.lote_id || null,
          };
        }
      }));

      // Se disputa é por lote, agrupa itens por lote
      let lotes: any[] = [];
      const disputaPorItemFinal = sessao.disputa_por_item !== false;
      
      if (!disputaPorItemFinal) {
        const loteMap = new Map<string, any>();
        
        for (const item of itensComLances) {
          const loteId = item.loteId || 'SEM_LOTE';
          if (!loteMap.has(loteId)) {
            loteMap.set(loteId, {
              id: loteId,
              numero: loteMap.size + 1,
              descricao: loteId === 'SEM_LOTE' ? 'Itens sem lote' : `Lote ${loteMap.size + 1}`,
              valorTotalEstimado: 0,
              melhorLance: null,
              melhorFornecedor: null,
              totalParticipantes: 0,
              tempoRestante: 600,
              emTempoAleatorio: false,
              status: 'AGUARDANDO',
              itens: []
            });
          }
          
          const lote = loteMap.get(loteId);
          lote.itens.push(item);
          lote.valorTotalEstimado += item.valorReferencia * item.quantidade;
          
          // Atualiza status do lote baseado nos itens
          if (item.status === 'EM_DISPUTA' || item.status === 'TEMPO_ALEATORIO') {
            lote.status = item.status;
            lote.tempoRestante = Math.min(lote.tempoRestante, item.tempoRestante);
            lote.emTempoAleatorio = item.emTempoAleatorio;
          }
          
          // Soma participantes únicos
          lote.totalParticipantes = Math.max(lote.totalParticipantes, item.totalParticipantes);
        }
        
        lotes = Array.from(loteMap.values());
      }

      return {
        itens: itensComLances,
        lotes,
        sessao: {
          id: sessao.id,
          status: sessao.status,
          etapa: sessao.etapa,
          itemAtualId: sessao.item_atual_id,
          disputaPorItem: disputaPorItemFinal,
          modoAberto: sessao.modo_aberto,
        }
      };
    } catch (error) {
      console.error('Erro em getItensSessaoPregoeiro:', error);
      throw error;
    }
  }

  /**
   * Obtém os lances de um item para o pregoeiro (não anonimizado)
   */
  async getLancesItemPregoeiro(itemId: string): Promise<{
    lances: any[];
  }> {
    const item = await this.itemRepository.findOne({
      where: { id: itemId }
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    const lances = await this.lanceRepository
      .createQueryBuilder('l')
      .leftJoin('fornecedores', 'f', 'f.id::text = l.fornecedor_id')
      .where('l.item_id = :itemId', { itemId })
      .orderBy('l.valor', 'ASC')
      .addOrderBy('l.created_at', 'ASC')
      .select([
        'l.id as id',
        'l.valor as valor',
        'l.fornecedor_id as fornecedor_id',
        'l.fornecedor_nome as fornecedor_nome',
        'l.created_at as created_at',
        'f.razao_social as razao_social',
        'f.cnpj as cnpj',
      ])
      .getRawMany();

    // Agrupar por fornecedor para pegar apenas o melhor lance de cada
    const melhoresLancesPorFornecedor = new Map<string, any>();
    lances.forEach(lance => {
      if (!melhoresLancesPorFornecedor.has(lance.fornecedor_id)) {
        melhoresLancesPorFornecedor.set(lance.fornecedor_id, lance);
      }
    });

    const lancesOrdenados = Array.from(melhoresLancesPorFornecedor.values())
      .sort((a, b) => parseFloat(a.valor) - parseFloat(b.valor))
      .map((lance, index) => ({
        id: lance.id,
        posicao: index + 1,
        fornecedor: lance.razao_social || lance.fornecedor_nome || 'Fornecedor',
        fornecedorId: lance.fornecedor_id,
        cnpj: lance.cnpj,
        valor: parseFloat(lance.valor),
        valorTotal: parseFloat(lance.valor) * (parseFloat(item.quantidade.toString()) || 1),
        horario: new Date(lance.created_at).toLocaleTimeString('pt-BR'),
      }));

    return { lances: lancesOrdenados };
  }
}

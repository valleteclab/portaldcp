import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource, EntityManager } from 'typeorm';
import { SessaoDisputa, StatusSessao, EtapaSessao } from '../sessao/entities/sessao-disputa.entity';
import { EventoSessao, TipoEvento } from '../sessao/entities/evento-sessao.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { ItemLicitacao, StatusDisputaItem } from '../itens/entities/item-licitacao.entity';
import { itemEmFaseComAnonimizacaoObrigatoria } from './disputa-anonimizacao-helpers';
import { Lance } from '../lances/entities/lance.entity';
import { Proposta } from '../propostas/entities/proposta.entity';
import { PropostaItem } from '../propostas/entities/proposta-item.entity';
import { AnonimizacaoService } from './anonimizacao.service';
import { CANCELAMENTO_LANCE_FORNECEDOR_SEGUNDOS } from './disputa-cancelamento.constants';

/**
 * ============================================================================
 * DISPUTA SERVICE V2
 * ============================================================================
 * 
 * Serviço limpo para controle da Sala de Disputa
 * Baseado no modelo do Comprasnet
 * 
 * Lei 14.133/2021 - Art. 56 (Modos de Disputa)
 * 
 * REGRAS DE SEGURANÇA:
 * - Fornecedor só pode entrar na sala se tiver proposta CLASSIFICADA
 * - Fornecedor só pode dar lance em item que tenha proposta
 * - Lance deve ser menor que o próprio lance anterior (não o melhor global)
 * - Lance deve ser menor que a proposta inicial do fornecedor
 * ============================================================================
 */

// Interfaces para tipagem clara
export interface ItemDisputa {
  id: string;
  numero: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  valorReferencia: number;
  valorMaximoAceitavel?: number;
  status: 'AGUARDANDO' | 'EM_DISPUTA' | 'ENCERRADO';
  tempoRestante: number;
  emProrrogacao: boolean;
  melhorLance?: {
    valor: number;
    fornecedorId: string;
    fornecedorNome: string;
  };
  // Dados específicos do fornecedor logado
  meuMelhorLance?: number;
  minhaPosicao?: number;
  minhaPropostaInicial?: number;
  totalPropostas: number;
  totalLances: number;
}

export interface LanceRegistrado {
  id: string;
  valor: number;
  fornecedorId: string;
  fornecedorNome: string;
  dataHora: Date;
  origem: 'PROPOSTA' | 'LANCE';
}

export interface MensagemChat {
  id: string;
  tipo: 'SISTEMA' | 'PREGOEIRO' | 'FORNECEDOR';
  remetente: string;
  conteudo: string;
  dataHora: Date;
}

export interface LancePainelCancelamentoV3 {
  id: string;
  valor: number;
  criadoEm: string;
  cancelado: boolean;
  solicitacaoPendente: boolean;
  podeCancelarDireto: boolean;
  segundosRestantesCancelamentoDireto: number;
}

export interface SolicitacaoCancelamentoPendenteV3 {
  lanceId: string;
  itemId: string;
  itemNumero: number;
  fornecedorId: string;
  fornecedorNome: string;
  valor: number;
  motivo: string | null;
  solicitadoEm: string;
}

@Injectable()
export class DisputaService {
  constructor(
    @InjectRepository(SessaoDisputa)
    private readonly sessaoRepo: Repository<SessaoDisputa>,
    @InjectRepository(EventoSessao)
    private readonly eventoRepo: Repository<EventoSessao>,
    @InjectRepository(Licitacao)
    private readonly licitacaoRepo: Repository<Licitacao>,
    @InjectRepository(ItemLicitacao)
    private readonly itemRepo: Repository<ItemLicitacao>,
    @InjectRepository(Lance)
    private readonly lanceRepo: Repository<Lance>,
    @InjectRepository(Proposta)
    private readonly propostaRepo: Repository<Proposta>,
    @InjectRepository(PropostaItem)
    private readonly propostaItemRepo: Repository<PropostaItem>,
    private readonly dataSource: DataSource,
    // Injetado via forwardRef para evitar dependência circular
    @Inject(forwardRef(() => AnonimizacaoService))
    private readonly anonimizacaoService: AnonimizacaoService,
  ) {}

  // ============================================================================
  // BUSCAR DADOS DA SESSÃO
  // ============================================================================

  /**
   * Busca sessão por ID com dados completos
   */
  async getSessao(sessaoId: string) {
    const sessao = await this.sessaoRepo.findOne({
      where: { id: sessaoId },
      relations: ['licitacao'],
    });

    if (!sessao) {
      throw new NotFoundException('Sessão não encontrada');
    }

    return {
      id: sessao.id,
      licitacaoId: sessao.licitacao_id,
      status: sessao.status,
      etapa: sessao.etapa,
      modoDisputa: sessao.modo_aberto ? 'ABERTO' : 'FECHADO',
      disputaPorItem: sessao.disputa_por_item,
      pregoeiro: {
        id: sessao.pregoeiro_id,
        nome: sessao.pregoeiro_nome,
      },
      tempoInatividade: sessao.tempo_inatividade_minutos,
      tempoAleatorioMin: sessao.tempo_aleatorio_min_minutos,
      tempoAleatorioMax: sessao.tempo_aleatorio_max_minutos,
      chatDesabilitado: sessao.chat_desabilitado,
      suspensa: sessao.status === StatusSessao.SUSPENSA,
      motivoSuspensao: sessao.motivo_suspensao,
      licitacao: sessao.licitacao ? {
        id: sessao.licitacao.id,
        numero: sessao.licitacao.numero_edital,
        objeto: sessao.licitacao.objeto,
      } : null,
    };
  }

  /**
   * Busca sessão por licitação
   */
  async getSessaoPorLicitacao(licitacaoId: string) {
    const sessao = await this.sessaoRepo.findOne({
      where: { licitacao_id: licitacaoId },
      order: { created_at: 'DESC' },
    });

    if (!sessao) {
      throw new NotFoundException('Sessão não encontrada para esta licitação');
    }

    return this.getSessao(sessao.id);
  }

  // ============================================================================
  // VALIDAÇÃO DE ELEGIBILIDADE DO FORNECEDOR
  // ============================================================================

  /**
   * Verifica se fornecedor pode participar da disputa
   * Regra: Deve ter pelo menos uma proposta CLASSIFICADA para a licitação
   */
  async verificarElegibilidadeFornecedor(sessaoId: string, fornecedorId: string): Promise<{
    elegivel: boolean;
    motivo?: string;
    propostasClassificadas: number;
  }> {
    const sessao = await this.sessaoRepo.findOne({
      where: { id: sessaoId },
    });

    if (!sessao) {
      return { elegivel: false, motivo: 'Sessão não encontrada', propostasClassificadas: 0 };
    }

    // Buscar propostas classificadas do fornecedor para esta licitação
    const propostasClassificadas = await this.propostaRepo.count({
      where: {
        licitacao_id: sessao.licitacao_id,
        fornecedor_id: fornecedorId,
        status: In(['CLASSIFICADA', 'RECEBIDA']),
      },
    });

    if (propostasClassificadas === 0) {
      return {
        elegivel: false,
        motivo: 'Você não possui proposta classificada para esta licitação. Apenas fornecedores com propostas classificadas podem participar da fase de lances.',
        propostasClassificadas: 0,
      };
    }

    return { elegivel: true, propostasClassificadas };
  }

  /**
   * Verifica se fornecedor pode dar lance em um item específico
   * Regra: Deve ter proposta CLASSIFICADA para aquele item
   */
  async verificarElegibilidadeParaItem(itemId: string, fornecedorId: string): Promise<{
    elegivel: boolean;
    motivo?: string;
    propostaInicial?: number;
  }> {
    const propostaItem = await this.propostaItemRepo
      .createQueryBuilder('pi')
      .innerJoin('pi.proposta', 'p')
      .where('pi.item_licitacao_id = :itemId', { itemId })
      .andWhere('p.fornecedor_id = :fornecedorId', { fornecedorId })
      .andWhere('p.status IN (:...status)', { status: ['CLASSIFICADA', 'RECEBIDA'] })
      .getOne();

    if (!propostaItem) {
      return {
        elegivel: false,
        motivo: 'Você não possui proposta classificada para este item. Apenas fornecedores com propostas classificadas podem dar lances.',
      };
    }

    return {
      elegivel: true,
      propostaInicial: Number(propostaItem.valor_total),
    };
  }

  // ============================================================================
  // BUSCAR ITENS POR STATUS (3 ABAS)
  // ============================================================================

  /**
   * Busca itens da sessão agrupados por status
   * Retorna 3 listas: aguardando, emDisputa, encerrados
   * @param fornecedorId - Se fornecido, inclui dados específicos do fornecedor (meuMelhorLance, minhaPropostaInicial)
   */
  async getItensPorStatus(sessaoId: string, fornecedorId?: string): Promise<{
    aguardando: ItemDisputa[];
    emDisputa: ItemDisputa[];
    encerrados: ItemDisputa[];
  }> {
    const sessao = await this.sessaoRepo.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessão não encontrada');

    const itens = await this.itemRepo.find({
      where: { licitacao_id: sessao.licitacao_id },
      order: { numero_item: 'ASC' },
    });

    const aguardando: ItemDisputa[] = [];
    const emDisputa: ItemDisputa[] = [];
    const encerrados: ItemDisputa[] = [];

    for (const item of itens) {
      const itemDisputa = await this.mapearItemParaDisputa(item, sessao, fornecedorId);

      switch (item.status_disputa) {
        case StatusDisputaItem.EM_DISPUTA:
        case StatusDisputaItem.TEMPO_ALEATORIO:
          emDisputa.push(itemDisputa);
          break;
        case StatusDisputaItem.ENCERRADO:
        case StatusDisputaItem.NEGOCIACAO:
          encerrados.push(itemDisputa);
          break;
        default:
          aguardando.push(itemDisputa);
      }
    }

    return { aguardando, emDisputa, encerrados };
  }

  /**
   * Mapeia item do banco para formato da disputa
   * @param fornecedorId - Se fornecido, inclui dados específicos do fornecedor (meuMelhorLance, minhaPropostaInicial)
   */
  private async mapearItemParaDisputa(item: ItemLicitacao, sessao: SessaoDisputa, fornecedorId?: string): Promise<ItemDisputa> {
    // Buscar melhor lance
    const melhorLance = await this.lanceRepo.findOne({
      where: { item_id: item.id, cancelado: false },
      order: { valor: 'ASC' },
    });

    // Contar propostas
    const totalPropostas = await this.propostaItemRepo.count({
      where: { item_licitacao_id: item.id },
    });

    // Contar lances
    const totalLances = await this.lanceRepo.count({
      where: { item_id: item.id, cancelado: false },
    });
    
    // Dados específicos do fornecedor logado
    let meuMelhorLance: number | undefined;
    let minhaPosicao: number | undefined;
    let minhaPropostaInicial: number | undefined;
    
    if (fornecedorId) {
      // Buscar meu melhor lance
      const meuLance = await this.lanceRepo.findOne({
        where: { item_id: item.id, fornecedor_id: fornecedorId, cancelado: false },
        order: { valor: 'ASC' },
      });
      if (meuLance) {
        meuMelhorLance = parseFloat(String(meuLance.valor));
      }
      
      // Buscar minha proposta inicial
      const minhaProposta = await this.propostaItemRepo
        .createQueryBuilder('pi')
        .innerJoin('pi.proposta', 'p')
        .where('pi.item_licitacao_id = :itemId', { itemId: item.id })
        .andWhere('p.fornecedor_id = :fornecedorId', { fornecedorId })
        .andWhere('p.status IN (:...status)', { status: ['CLASSIFICADA', 'RECEBIDA'] })
        .getOne();
      if (minhaProposta) {
        minhaPropostaInicial = parseFloat(String(minhaProposta.valor_total));
        // Se não tem lance, usa proposta inicial como meu melhor lance
        if (!meuMelhorLance) {
          meuMelhorLance = minhaPropostaInicial;
        }
      }
      
      // Calcular minha posição (ranking)
      if (meuMelhorLance) {
        const lancesOrdenados = await this.lanceRepo.find({
          where: { item_id: item.id, cancelado: false },
          order: { valor: 'ASC' },
        });
        const posicao = lancesOrdenados.findIndex(l => l.fornecedor_id === fornecedorId);
        if (posicao >= 0) {
          minhaPosicao = posicao + 1;
        }
      }
    }

    // Calcular tempo restante usando regras do Modo Aberto
    // Lei 14.133/2021: 10min inicial + prorrogação de 2min se houver lance nos últimos 2min
    let tempoRestante = 0;
    let emProrrogacao = false;
    
    if (item.status_disputa === StatusDisputaItem.EM_DISPUTA) {
      const agora = Date.now();
      const tempoInicialMs = sessao.tempo_inatividade_minutos * 60 * 1000; // 10 min default
      const tempoProrrogacaoMs = sessao.tempo_prorrogacao_minutos * 60 * 1000; // 2 min default
      
      const inicioDisputa = item.disputa_iniciada_em ? new Date(item.disputa_iniciada_em).getTime() : agora;
      const ultimoLanceEm = item.ultimo_lance_em ? new Date(item.ultimo_lance_em).getTime() : inicioDisputa;
      
      const tempoDecorrido = agora - inicioDisputa;
      const tempoDesdeUltimoLance = agora - ultimoLanceEm;
      
      // Momento em que o último lance foi dado (em relação ao início)
      const momentoUltimoLance = ultimoLanceEm - inicioDisputa;
      
      // Verifica se houve lance nos últimos 2min do tempo inicial (entre 8min e 10min)
      const lanceNosUltimos2minDoInicial = momentoUltimoLance >= (tempoInicialMs - tempoProrrogacaoMs);

      // Se ainda no tempo inicial (10 min) E não houve lance nos últimos 2min
      if (tempoDecorrido < tempoInicialMs && !lanceNosUltimos2minDoInicial) {
        tempoRestante = Math.max(0, Math.floor((tempoInicialMs - tempoDecorrido) / 1000));
        emProrrogacao = false;
      }
      // Se houve lance nos últimos 2min do tempo inicial OU já passou o tempo inicial
      else {
        // PRORROGAÇÃO AUTOMÁTICA
        // O tempo restante é sempre baseado no último lance (2 minutos desde o último lance)
        if (tempoDesdeUltimoLance < tempoProrrogacaoMs) {
          tempoRestante = Math.max(0, Math.floor((tempoProrrogacaoMs - tempoDesdeUltimoLance) / 1000));
          emProrrogacao = true;
        } else {
          // Tempo esgotado - passou 2min sem lance após entrar em prorrogação
          tempoRestante = 0;
          emProrrogacao = false;
        }
      }
    }

    // Mapear status
    let status: 'AGUARDANDO' | 'EM_DISPUTA' | 'ENCERRADO' = 'AGUARDANDO';
    if (item.status_disputa === StatusDisputaItem.EM_DISPUTA || 
        item.status_disputa === StatusDisputaItem.TEMPO_ALEATORIO) {
      status = 'EM_DISPUTA';
    } else if (item.status_disputa === StatusDisputaItem.ENCERRADO ||
               item.status_disputa === StatusDisputaItem.NEGOCIACAO) {
      status = 'ENCERRADO';
    }

    // Aplicar anonimização no melhorLance se ativa E item NÃO está encerrado
    let melhorLanceAnonimizado = melhorLance ? {
      valor: parseFloat(String(melhorLance.valor)),
      fornecedorId: melhorLance.fornecedor_id || melhorLance.fornecedor_identificador || '',
      fornecedorNome: melhorLance.fornecedor_nome || 'Fornecedor',
    } : undefined;

    // Só anonimiza se item NÃO está encerrado (ENCERRADO ou NEGOCIACAO)
    const itemEncerrado = status === 'ENCERRADO';
    
    if (melhorLanceAnonimizado && this.anonimizacaoService && !itemEncerrado) {
      const anonimizacaoAtiva = await this.anonimizacaoService.isAnonimizacaoAtiva(sessao.id);
      if (anonimizacaoAtiva) {
        const codigoAnonimo = await this.anonimizacaoService.obterCodigoAnonimo(
          sessao.id,
          melhorLanceAnonimizado.fornecedorId,
        );
        melhorLanceAnonimizado = {
          ...melhorLanceAnonimizado,
          fornecedorId: `anonimo-${codigoAnonimo.replace('Fornecedor ', '').toLowerCase()}`,
          fornecedorNome: codigoAnonimo,
        };
      }
    }

    return {
      id: item.id,
      numero: item.numero_item,
      descricao: item.descricao_resumida || item.descricao_detalhada || '',
      quantidade: parseFloat(String(item.quantidade)) || 1,
      unidade: item.unidade_medida || 'UN',
      valorReferencia: parseFloat(String(item.valor_unitario_estimado)) || 0,
      valorMaximoAceitavel: undefined,
      status,
      tempoRestante,
      emProrrogacao,
      melhorLance: melhorLanceAnonimizado,
      // Dados específicos do fornecedor logado
      meuMelhorLance,
      minhaPosicao,
      minhaPropostaInicial,
      totalPropostas,
      totalLances,
    };
  }

  // ============================================================================
  // INICIAR DISPUTA DE ITENS
  // ============================================================================

  /**
   * Inicia disputa para um ou mais itens
   * Converte propostas em lances automaticamente
   */
  async iniciarDisputa(sessaoId: string, itensIds: string[]): Promise<{ itensIniciados: number }> {
    const sessao = await this.sessaoRepo.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessão não encontrada');

    if (sessao.status === StatusSessao.SUSPENSA) {
      throw new BadRequestException('Sessão está suspensa. Não é possível iniciar novos itens.');
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
          `A disputa só pode ser iniciada a partir de ${dataFormatada}. Aguarde a data de abertura programada.`
        );
      }
    }

    const agora = new Date();
    let itensIniciados = 0;

    for (const itemId of itensIds) {
      const item = await this.itemRepo.findOneBy({ id: itemId });
      if (!item) continue;

      // Só inicia se estiver aguardando
      if (item.status_disputa && item.status_disputa !== StatusDisputaItem.AGUARDANDO) {
        continue;
      }

      // Converter propostas em lances
      await this.converterPropostasEmLances(itemId, sessao.licitacao_id);

      // Atualizar status do item
      await this.itemRepo.update(itemId, {
        status_disputa: StatusDisputaItem.EM_DISPUTA,
        disputa_iniciada_em: agora,
        ultimo_lance_em: agora,
      });

      // Registrar evento
      await this.registrarEvento(
        sessaoId,
        TipoEvento.DISPUTA_ITEM_INICIADA,
        `Disputa iniciada para o Item ${item.numero_item}`,
        itemId,
      );

      itensIniciados++;
    }

    // Atualizar status da sessão
    if (itensIniciados > 0) {
      await this.sessaoRepo.update(sessaoId, {
        status: StatusSessao.MODO_ABERTO,
        etapa: EtapaSessao.DISPUTA_LANCES,
      });
    }

    return { itensIniciados };
  }

  /**
   * Converte propostas classificadas em lances iniciais
   */
  private async converterPropostasEmLances(itemId: string, licitacaoId: string): Promise<void> {
    const itensProposta = await this.propostaItemRepo.find({
      where: { item_licitacao_id: itemId },
      relations: ['proposta', 'proposta.fornecedor'],
    });

    for (const itemProposta of itensProposta) {
      const proposta = itemProposta.proposta;
      if (!proposta) continue;

      // Apenas propostas classificadas ou recebidas
      if (proposta.status !== 'CLASSIFICADA' && proposta.status !== 'RECEBIDA') {
        continue;
      }

      // Verificar se já existe lance
      const lanceExistente = await this.lanceRepo.findOne({
        where: {
          item_id: itemId,
          fornecedor_id: proposta.fornecedor_id,
        },
      });

      if (!lanceExistente && itemProposta.valor_total) {
        const lance = this.lanceRepo.create({
          licitacao_id: licitacaoId,
          item_id: itemId,
          fornecedor_id: proposta.fornecedor_id,
          fornecedor_identificador: proposta.fornecedor_id,
          fornecedor_nome: proposta.fornecedor?.razao_social || 'Fornecedor',
          valor: itemProposta.valor_total,
          ip_origem: 'SISTEMA',
          cancelado: false,
        });

        await this.lanceRepo.save(lance);
      }
    }
  }

  // ============================================================================
  // REGISTRAR LANCE
  // ============================================================================

  /**
   * Registra um novo lance de fornecedor
   * UTILIZA TRANSAÇÃO E BLOQUEIO PESSIMISTA para evitar race conditions
   */
  async registrarLance(
    sessaoId: string,
    itemId: string,
    fornecedorId: string,
    fornecedorNome: string,
    valor: number,
    ip: string,
  ): Promise<Lance> {
    return this.dataSource.transaction(async (manager) => {
      // 1. Lock Pessimista no Item para garantir fila de processamento
      const item = await manager.findOne(ItemLicitacao, {
        where: { id: itemId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!item) throw new NotFoundException('Item não encontrado');

      // Buscar sessão
      const sessao = await manager.findOne(SessaoDisputa, { where: { id: sessaoId } });
      if (!sessao) throw new NotFoundException('Sessão não encontrada');

      // Validações
      if (item.status_disputa !== StatusDisputaItem.EM_DISPUTA) {
        throw new BadRequestException('Item não está em disputa');
      }

      if (sessao.status === StatusSessao.SUSPENSA) {
        throw new BadRequestException('Sessão está suspensa');
      }

      // =========================================================================
      // VALIDAÇÃO 1: Fornecedor DEVE ter proposta classificada para este item
      // =========================================================================
      const propostaItem = await manager
        .createQueryBuilder(PropostaItem, 'pi')
        .innerJoin('pi.proposta', 'p')
        .where('pi.item_licitacao_id = :itemId', { itemId })
        .andWhere('p.fornecedor_id = :fornecedorId', { fornecedorId })
        .andWhere('p.status IN (:...status)', { status: ['CLASSIFICADA', 'RECEBIDA'] })
        .getOne();

      if (!propostaItem) {
        throw new BadRequestException(
          'Você não possui proposta classificada para este item. Apenas fornecedores com propostas classificadas podem dar lances.'
        );
      }

      const propostaInicial = Number(propostaItem.valor_total);

      // =========================================================================
      // VALIDAÇÃO 2: Lance deve ser MENOR que a proposta inicial do fornecedor
      // =========================================================================
      if (valor >= propostaInicial) {
        throw new BadRequestException(
          `Lance deve ser menor que sua proposta inicial (R$ ${propostaInicial.toFixed(2)})`
        );
      }

      // =========================================================================
      // VALIDAÇÃO 3: Lance NÃO pode ser igual ao melhor lance atual
      // Valores devem ser diferentes para evitar empates
      // =========================================================================
      const melhorLanceAtual = await manager.findOne(Lance, {
        where: { item_id: itemId, cancelado: false },
        order: { valor: 'ASC' },
      });

      if (melhorLanceAtual && valor === Number(melhorLanceAtual.valor)) {
        throw new BadRequestException(
          `Lance não pode ser igual ao melhor lance atual (R$ ${Number(melhorLanceAtual.valor).toFixed(2)}). Informe um valor diferente.`
        );
      }

      // =========================================================================
      // VALIDAÇÃO 4: Lance deve ser menor que meu último lance (autossuperação)
      // =========================================================================
      const meuUltimoLance = await manager.findOne(Lance, {
        where: { item_id: itemId, fornecedor_id: fornecedorId, cancelado: false },
        order: { created_at: 'DESC' },
      });

      if (meuUltimoLance && valor >= Number(meuUltimoLance.valor)) {
        throw new BadRequestException(
          `Lance deve ser menor que seu lance anterior (R$ ${Number(meuUltimoLance.valor).toFixed(2)})`
        );
      }

      // =========================================================================
      // VALIDAÇÃO 5: Intervalo mínimo entre lances do mesmo fornecedor
      // (IN SEGES/ME 73/2022, art. 51 — parametrizável; 0 = desabilitado)
      // =========================================================================
      const intervaloMinMin = Number(sessao.intervalo_minimo_lances_minutos) || 0;
      if (intervaloMinMin > 0 && meuUltimoLance) {
        const intervaloMs = intervaloMinMin * 60 * 1000;
        const desdeUltimo = Date.now() - new Date(meuUltimoLance.created_at).getTime();
        if (desdeUltimo < intervaloMs) {
          const faltaSeg = Math.ceil((intervaloMs - desdeUltimo) / 1000);
          throw new BadRequestException(
            `Intervalo mínimo entre seus lances é de ${intervaloMinMin} min. Aguarde ${faltaSeg}s para enviar outro lance.`
          );
        }
      }

      // Criar lance
      const lance = manager.create(Lance, {
        licitacao_id: sessao.licitacao_id,
        item_id: itemId,
        fornecedor_id: fornecedorId,
        fornecedor_identificador: fornecedorId,
        fornecedor_nome: fornecedorNome,
        valor,
        ip_origem: ip,
        cancelado: false,
      });

      await manager.save(lance);

      // Atualizar último lance do item
      await manager.update(ItemLicitacao, itemId, {
        ultimo_lance_em: new Date(),
      });

      // Registrar evento
      const evento = manager.create(EventoSessao, {
        sessao_id: sessaoId,
        tipo: TipoEvento.LANCE_REGISTRADO,
        descricao: `Lance de R$ ${valor.toFixed(2)} registrado no Item ${item.numero_item}`,
        item_id: itemId,
        fornecedor_id: fornecedorId,
        usuario_nome: 'SISTEMA',
        is_sistema: true,
      });
      await manager.save(evento);

      return lance;
    });
  }

  // ============================================================================
  // VERIFICAR DIFERENÇA ENTRE LANCES (ALERTA 5%)
  // ============================================================================

  /**
   * Verifica se a diferença entre os dois melhores lances é menor que 5%
   * Lei 14.133/2021 - Art. 61: Pregoeiro deve ser alertado para possível empate ficto
   */
  async verificarDiferencaLances(itemId: string): Promise<{
    alertaAtivo: boolean;
    diferencaPercentual?: number;
    primeiroLance?: { valor: number; fornecedorId: string; fornecedorNome: string };
    segundoLance?: { valor: number; fornecedorId: string; fornecedorNome: string };
  }> {
    // Buscar os dois melhores lances distintos por fornecedor
    const lances = await this.lanceRepo
      .createQueryBuilder('l')
      .select('l.fornecedor_id', 'fornecedorId')
      .addSelect('l.fornecedor_nome', 'fornecedorNome')
      .addSelect('MIN(l.valor)', 'melhorValor')
      .where('l.item_id = :itemId', { itemId })
      .andWhere('l.cancelado = false')
      .groupBy('l.fornecedor_id')
      .addGroupBy('l.fornecedor_nome')
      .orderBy('MIN(l.valor)', 'ASC')
      .limit(2)
      .getRawMany();

    if (lances.length < 2) {
      return { alertaAtivo: false };
    }

    const primeiroValor = parseFloat(lances[0].melhorValor);
    const segundoValor = parseFloat(lances[1].melhorValor);

    // Calcular diferença percentual: ((segundo - primeiro) / primeiro) * 100
    const diferencaPercentual = ((segundoValor - primeiroValor) / primeiroValor) * 100;

    const alertaAtivo = diferencaPercentual < 5;

    return {
      alertaAtivo,
      diferencaPercentual: Math.round(diferencaPercentual * 100) / 100, // 2 casas decimais
      primeiroLance: {
        valor: primeiroValor,
        fornecedorId: lances[0].fornecedorId,
        fornecedorNome: lances[0].fornecedorNome,
      },
      segundoLance: {
        valor: segundoValor,
        fornecedorId: lances[1].fornecedorId,
        fornecedorNome: lances[1].fornecedorNome,
      },
    };
  }

  // ============================================================================
  // ENCERRAR DISPUTA DE ITEM
  // ============================================================================

  /**
   * Encerra a disputa de um item específico
   */
  async encerrarItem(sessaoId: string, itemId: string): Promise<{ vencedor?: any }> {
    const sessao = await this.sessaoRepo.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessão não encontrada');

    const item = await this.itemRepo.findOneBy({ id: itemId });
    if (!item) throw new NotFoundException('Item não encontrado');

    // Buscar melhor lance (vencedor)
    const melhorLance = await this.lanceRepo.findOne({
      where: { item_id: itemId, cancelado: false },
      order: { valor: 'ASC' },
    });

    // Atualizar status do item
    await this.itemRepo.update(itemId, {
      status_disputa: StatusDisputaItem.ENCERRADO,
      disputa_encerrada_em: new Date(),
      melhor_lance_valor: melhorLance?.valor,
      melhor_lance_fornecedor_id: melhorLance?.fornecedor_id,
    });

    // Registrar evento
    const descricao = melhorLance
      ? `Item ${item.numero_item} encerrado. Vencedor: ${melhorLance.fornecedor_nome} - R$ ${melhorLance.valor}`
      : `Item ${item.numero_item} encerrado sem lances (DESERTO)`;

    await this.registrarEvento(
      sessaoId,
      TipoEvento.DISPUTA_ITEM_ENCERRADA,
      descricao,
      itemId,
      melhorLance?.fornecedor_id,
    );

    return {
      vencedor: melhorLance ? {
        fornecedorId: melhorLance.fornecedor_id,
        fornecedorNome: melhorLance.fornecedor_nome,
        valor: melhorLance.valor,
      } : undefined,
    };
  }

  // ============================================================================
  // SUSPENDER / RETOMAR SESSÃO
  // ============================================================================

  /**
   * Suspende a sessão pública
   * Itens em disputa continuam até encerrar, mas não abre novos
   */
  async suspenderSessao(
    sessaoId: string,
    motivo: 'ADMINISTRATIVO' | 'CAUTELAR' | 'JUDICIAL',
    justificativa: string,
    dataReabertura?: Date,
  ): Promise<void> {
    const sessao = await this.sessaoRepo.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessão não encontrada');

    await this.sessaoRepo.update(sessaoId, {
      status: StatusSessao.SUSPENSA,
      motivo_suspensao: `${motivo}: ${justificativa}`,
    });

    await this.registrarEvento(
      sessaoId,
      TipoEvento.SESSAO_SUSPENSA,
      `Sessão suspensa. Motivo: ${motivo}. ${justificativa}`,
    );
  }

  /**
   * Retoma sessão suspensa
   */
  async retomarSessao(sessaoId: string): Promise<void> {
    const sessao = await this.sessaoRepo.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessão não encontrada');

    if (sessao.status !== StatusSessao.SUSPENSA) {
      throw new BadRequestException('Sessão não está suspensa');
    }

    await this.sessaoRepo.update(sessaoId, {
      status: StatusSessao.MODO_ABERTO,
      motivo_suspensao: undefined,
    });

    await this.registrarEvento(
      sessaoId,
      TipoEvento.SESSAO_RETOMADA,
      'Sessão retomada',
    );
  }

  // ============================================================================
  // REINICIAR SESSÃO
  // ============================================================================

  /**
   * Reinicia a sessão completamente
   * - Cancela TODOS os lances (inclusive de itens encerrados)
   * - Reseta status de todos os itens para AGUARDANDO
   * - Mantém as propostas originais
   */
  async reiniciarSessao(sessaoId: string, justificativa: string): Promise<{ itensReiniciados: number; lancesCancelados: number }> {
    const sessao = await this.sessaoRepo.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessão não encontrada');

    // 1. Buscar todos os itens da licitação
    const itens = await this.itemRepo.find({
      where: { licitacao_id: sessao.licitacao_id },
    });

    // 2. Cancelar TODOS os lances de todos os itens
    let lancesCancelados = 0;
    for (const item of itens) {
      const resultado = await this.lanceRepo.update(
        { item_id: item.id, cancelado: false },
        { cancelado: true },
      );
      lancesCancelados += resultado.affected || 0;
    }

    // 3. Resetar status de todos os itens para AGUARDANDO
    let itensReiniciados = 0;
    for (const item of itens) {
      await this.itemRepo.update(item.id, {
        status_disputa: StatusDisputaItem.AGUARDANDO,
        disputa_iniciada_em: undefined,
        disputa_encerrada_em: undefined,
        ultimo_lance_em: undefined,
        melhor_lance_valor: undefined,
        melhor_lance_fornecedor_id: undefined,
      });
      itensReiniciados++;
    }

    // 4. Atualizar status da sessão
    await this.sessaoRepo.update(sessaoId, {
      status: StatusSessao.AGUARDANDO_INICIO,
      etapa: EtapaSessao.ANALISE_PROPOSTAS,
    });

    // 5. Registrar evento
    await this.registrarEvento(
      sessaoId,
      TipoEvento.SESSAO_RETOMADA,
      `Sessão reiniciada pelo pregoeiro. Justificativa: ${justificativa}. ${lancesCancelados} lances cancelados, ${itensReiniciados} itens resetados.`,
    );

    return { itensReiniciados, lancesCancelados };
  }

  // ============================================================================
  // CONFIGURAÇÃO DA SESSÃO
  // ============================================================================

  /**
   * Atualiza configurações da sessão de disputa
   * Permite ao pregoeiro ajustar parâmetros antes ou durante a disputa
   */
  async configurarSessao(
    sessaoId: string,
    config: {
      tempo_inatividade_minutos?: number;
      tempo_prorrogacao_minutos?: number;
      intervalo_minimo_lances_minutos?: number;
      tempo_aleatorio_min_minutos?: number;
      tempo_aleatorio_max_minutos?: number;
      chat_desabilitado?: boolean;
    },
  ): Promise<void> {
    const sessao = await this.sessaoRepo.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessão não encontrada');

    // Validações
    if (config.tempo_inatividade_minutos !== undefined && config.tempo_inatividade_minutos < 1) {
      throw new BadRequestException('Tempo de inatividade deve ser pelo menos 1 minuto');
    }
    if (config.tempo_prorrogacao_minutos !== undefined && config.tempo_prorrogacao_minutos < 1) {
      throw new BadRequestException('Tempo de prorrogação deve ser pelo menos 1 minuto');
    }

    await this.sessaoRepo.update(sessaoId, {
      ...(config.tempo_inatividade_minutos !== undefined && { tempo_inatividade_minutos: config.tempo_inatividade_minutos }),
      ...(config.tempo_prorrogacao_minutos !== undefined && { tempo_prorrogacao_minutos: config.tempo_prorrogacao_minutos }),
      ...(config.intervalo_minimo_lances_minutos !== undefined && { intervalo_minimo_lances_minutos: config.intervalo_minimo_lances_minutos }),
      ...(config.tempo_aleatorio_min_minutos !== undefined && { tempo_aleatorio_min_minutos: config.tempo_aleatorio_min_minutos }),
      ...(config.tempo_aleatorio_max_minutos !== undefined && { tempo_aleatorio_max_minutos: config.tempo_aleatorio_max_minutos }),
      ...(config.chat_desabilitado !== undefined && { chat_desabilitado: config.chat_desabilitado }),
    });

    await this.registrarEvento(
      sessaoId,
      TipoEvento.MENSAGEM_PREGOEIRO,
      `Configurações da sessão atualizadas pelo pregoeiro`,
    );
  }

  /**
   * Retorna configurações atuais da sessão
   */
  async getConfiguracoesSessao(sessaoId: string) {
    const sessao = await this.sessaoRepo.findOneBy({ id: sessaoId });
    if (!sessao) throw new NotFoundException('Sessão não encontrada');

    return {
      tempo_inatividade_minutos: sessao.tempo_inatividade_minutos,
      tempo_prorrogacao_minutos: sessao.tempo_prorrogacao_minutos,
      intervalo_minimo_lances_minutos: sessao.intervalo_minimo_lances_minutos,
      tempo_aleatorio_min_minutos: sessao.tempo_aleatorio_min_minutos,
      tempo_aleatorio_max_minutos: sessao.tempo_aleatorio_max_minutos,
      chat_desabilitado: sessao.chat_desabilitado,
      modo_aberto: sessao.modo_aberto,
      modo_aberto_fechado: sessao.modo_aberto_fechado,
      disputa_por_item: sessao.disputa_por_item,
    };
  }

  // ============================================================================
  // LANCES E PROPOSTAS DO ITEM
  // ============================================================================

  /**
   * Resolve sessão e fase do item para aplicar anonimização nos endpoints que só recebem itemId
   * (ex.: GET público /disputa-v2/item/:itemId/lances). Sem isso, nomes reais vazam durante a disputa.
   */
  private async resolveAnonimizacaoParaItem(
    itemId: string,
    sessaoId?: string,
    itemEncerrado?: boolean,
  ): Promise<{ sessaoId?: string; itemEncerrado: boolean }> {
    const item = await this.itemRepo.findOne({
      where: { id: itemId },
      select: ['licitacao_id', 'status_disputa'],
    });

    let resolvedEncerrado: boolean;
    if (itemEncerrado !== undefined) {
      resolvedEncerrado = itemEncerrado;
    } else if (item) {
      resolvedEncerrado = !itemEmFaseComAnonimizacaoObrigatoria(item.status_disputa);
    } else {
      resolvedEncerrado = false;
    }

    let resolvedSessaoId = sessaoId;
    if (!resolvedSessaoId && item) {
      const sessao = await this.sessaoRepo.findOne({
        where: { licitacao_id: item.licitacao_id },
        order: { created_at: 'DESC' },
        select: ['id'],
      });
      resolvedSessaoId = sessao?.id;
    }

    return { sessaoId: resolvedSessaoId, itemEncerrado: resolvedEncerrado };
  }

  /**
   * Busca propostas iniciais do item
   * @param sessaoId - Opcional; quando omitido, é obtido pela licitação do item (para REST/anônimos)
   * @param itemEncerrado - Se true, não aplica anonimização (item já encerrado)
   */
  async getPropostasIniciais(itemId: string, sessaoId?: string, itemEncerrado?: boolean): Promise<any[]> {
    const ctx = await this.resolveAnonimizacaoParaItem(itemId, sessaoId, itemEncerrado);
    sessaoId = ctx.sessaoId;
    itemEncerrado = ctx.itemEncerrado;

    const itensProposta = await this.propostaItemRepo.find({
      where: { item_licitacao_id: itemId },
      relations: ['proposta', 'proposta.fornecedor'],
      order: { valor_total: 'ASC' },
    });

    // Verificar se anonimização está ativa (não aplica se item encerrado)
    let anonimizacaoAtiva = false;
    if (sessaoId && this.anonimizacaoService && !itemEncerrado) {
      anonimizacaoAtiva = await this.anonimizacaoService.isAnonimizacaoAtiva(sessaoId);
    }

    return Promise.all(itensProposta.map(async (ip, index) => {
      let fornecedorNome = ip.proposta?.fornecedor?.razao_social || `Fornecedor ${index + 1}`;
      let fornecedorId = ip.proposta?.fornecedor_id || '';
      
      if (anonimizacaoAtiva && sessaoId && fornecedorId) {
        const codigoAnonimo = await this.anonimizacaoService.obterCodigoAnonimo(sessaoId, fornecedorId);
        fornecedorId = `anonimo-${codigoAnonimo.replace('Fornecedor ', '').toLowerCase()}`;
        fornecedorNome = codigoAnonimo;
      }
      
      return {
        posicao: index + 1,
        fornecedorId,
        fornecedorNome,
        valor: ip.valor_total,
        marca: ip.marca,
        modelo: ip.modelo,
        dataEnvio: ip.proposta?.data_envio,
      };
    }));
  }

  /**
   * Busca melhores valores por fornecedor
   * @param sessaoId - Opcional; quando omitido, é obtido pela licitação do item
   * @param itemEncerrado - Se true, não aplica anonimização (item já encerrado)
   */
  async getMelhoresValoresPorFornecedor(itemId: string, sessaoId?: string, itemEncerrado?: boolean): Promise<any[]> {
    const ctx = await this.resolveAnonimizacaoParaItem(itemId, sessaoId, itemEncerrado);
    sessaoId = ctx.sessaoId;
    itemEncerrado = ctx.itemEncerrado;

    const lances = await this.lanceRepo
      .createQueryBuilder('l')
      .select('l.fornecedor_id', 'fornecedorId')
      .addSelect('l.fornecedor_nome', 'fornecedorNome')
      .addSelect('MIN(l.valor)', 'melhorValor')
      .addSelect('COUNT(l.id)', 'totalLances')
      .where('l.item_id = :itemId', { itemId })
      .andWhere('l.cancelado = false')
      .groupBy('l.fornecedor_id')
      .addGroupBy('l.fornecedor_nome')
      .orderBy('MIN(l.valor)', 'ASC')
      .getRawMany();

    // Verificar se anonimização está ativa (não aplica se item encerrado)
    let anonimizacaoAtiva = false;
    if (sessaoId && this.anonimizacaoService && !itemEncerrado) {
      anonimizacaoAtiva = await this.anonimizacaoService.isAnonimizacaoAtiva(sessaoId);
    }

    return Promise.all(lances.map(async (l, index) => {
      let fornecedorId = l.fornecedorId;
      let fornecedorNome = l.fornecedorNome;
      
      if (anonimizacaoAtiva && sessaoId && fornecedorId) {
        const codigoAnonimo = await this.anonimizacaoService.obterCodigoAnonimo(sessaoId, fornecedorId);
        fornecedorId = `anonimo-${codigoAnonimo.replace('Fornecedor ', '').toLowerCase()}`;
        fornecedorNome = codigoAnonimo;
      }
      
      return {
        posicao: index + 1,
        fornecedorId,
        fornecedorNome,
        melhorValor: parseFloat(l.melhorValor),
        totalLances: parseInt(l.totalLances),
      };
    }));
  }

  /**
   * Busca todos os lances do item (incluindo propostas iniciais)
   * @param sessaoId - Opcional; quando omitido, é obtido pela licitação do item
   * @param itemEncerrado - Se true, não aplica anonimização (item já encerrado)
   */
  async getTodosLances(itemId: string, sessaoId?: string, itemEncerrado?: boolean): Promise<LanceRegistrado[]> {
    const ctx = await this.resolveAnonimizacaoParaItem(itemId, sessaoId, itemEncerrado);
    sessaoId = ctx.sessaoId;
    itemEncerrado = ctx.itemEncerrado;

    // Buscar lances registrados durante a disputa
    const lances = await this.lanceRepo.find({
      where: { item_id: itemId, cancelado: false },
      order: { created_at: 'DESC' },
    });

    // Buscar propostas iniciais para este item
    const propostasIniciais = await this.propostaItemRepo.find({
      where: { item_licitacao_id: itemId },
      relations: ['proposta', 'proposta.fornecedor'],
    });

    // Verificar se anonimização está ativa (não aplica se item encerrado)
    let anonimizacaoAtiva = false;
    if (sessaoId && this.anonimizacaoService && !itemEncerrado) {
      anonimizacaoAtiva = await this.anonimizacaoService.isAnonimizacaoAtiva(sessaoId);
    }

    // Mapear lances
    const lancesFormatados = await Promise.all(lances.map(async l => {
      let fornecedorId = l.fornecedor_id || l.fornecedor_identificador || '';
      let fornecedorNome = l.fornecedor_nome || 'Fornecedor';
      
      if (anonimizacaoAtiva && sessaoId) {
        const codigoAnonimo = await this.anonimizacaoService.obterCodigoAnonimo(sessaoId, fornecedorId);
        fornecedorId = `anonimo-${codigoAnonimo.replace('Fornecedor ', '').toLowerCase()}`;
        fornecedorNome = codigoAnonimo;
      }
      
      return {
        id: l.id,
        valor: parseFloat(String(l.valor)),
        fornecedorId,
        fornecedorNome,
        dataHora: l.created_at,
        origem: 'LANCE' as const,
      };
    }));

    // Mapear propostas iniciais como lances
    const propostasComoLances = await Promise.all(
      propostasIniciais
        .filter(pi => pi.proposta && (pi.proposta.status === 'CLASSIFICADA' || pi.proposta.status === 'RECEBIDA'))
        .map(async pi => {
          let fornecedorId = pi.proposta.fornecedor_id;
          let fornecedorNome = pi.proposta.fornecedor?.razao_social || 'Fornecedor';
          
          if (anonimizacaoAtiva && sessaoId) {
            const codigoAnonimo = await this.anonimizacaoService.obterCodigoAnonimo(sessaoId, fornecedorId);
            fornecedorId = `anonimo-${codigoAnonimo.replace('Fornecedor ', '').toLowerCase()}`;
            fornecedorNome = codigoAnonimo;
          }
          
          return {
            id: `proposta-${pi.id}`,
            valor: parseFloat(String(pi.valor_total)),
            fornecedorId,
            fornecedorNome,
            dataHora: pi.proposta.created_at,
            origem: 'PROPOSTA' as const,
          };
        })
    );

    // Combinar e ordenar por data (mais recente primeiro)
    const todosLances = [...lancesFormatados, ...propostasComoLances];
    todosLances.sort((a, b) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime());

    return todosLances;
  }

  // ============================================================================
  // CHAT / MENSAGENS
  // ============================================================================

  /**
   * Busca mensagens da sessão
   */
  async getMensagens(sessaoId: string, limite: number = 50): Promise<MensagemChat[]> {
    const eventos = await this.eventoRepo.find({
      where: { sessao_id: sessaoId },
      order: { created_at: 'DESC' },
      take: limite,
    });

    return eventos.map(e => ({
      id: e.id,
      tipo: e.is_sistema ? 'SISTEMA' : 'PREGOEIRO',
      remetente: e.usuario_nome || 'SISTEMA',
      conteudo: e.descricao,
      dataHora: e.created_at,
    }));
  }

  /**
   * Envia mensagem do pregoeiro
   */
  async enviarMensagem(sessaoId: string, remetente: string, conteudo: string): Promise<void> {
    await this.registrarEvento(
      sessaoId,
      TipoEvento.MENSAGEM_PREGOEIRO,
      conteudo,
      undefined,
      undefined,
      remetente,
    );
  }

  // ============================================================================
  // DADOS PARA FORNECEDOR
  // ============================================================================

  /**
   * Busca itens para visão do fornecedor
   */
  async getItensParaFornecedor(sessaoId: string, fornecedorId: string): Promise<{
    itens: any[];
    sessao: any;
  }> {
    const sessao = await this.getSessao(sessaoId);
    const { aguardando, emDisputa, encerrados } = await this.getItensPorStatus(sessaoId);

    // Adicionar informações específicas do fornecedor em cada item
    const todosItens = [...aguardando, ...emDisputa, ...encerrados];

    const itensComMeusDados = await Promise.all(
      todosItens.map(async (item) => {
        // Meu melhor lance
        const meuMelhorLance = await this.lanceRepo.findOne({
          where: { item_id: item.id, fornecedor_id: fornecedorId, cancelado: false },
          order: { valor: 'ASC' },
        });

        // Minha posição
        let minhaPosicao: number | null = null;
        if (meuMelhorLance) {
          const lancesAcima = await this.lanceRepo
            .createQueryBuilder('l')
            .where('l.item_id = :itemId', { itemId: item.id })
            .andWhere('l.cancelado = false')
            .andWhere('l.valor < :meuValor', { meuValor: meuMelhorLance.valor })
            .select('COUNT(DISTINCT l.fornecedor_id)', 'count')
            .getRawOne();

          minhaPosicao = parseInt(lancesAcima?.count || '0') + 1;
        }

        return {
          ...item,
          meuMelhorLance: meuMelhorLance ? parseFloat(String(meuMelhorLance.valor)) : null,
          minhaPosicao,
        };
      })
    );

    return {
      itens: itensComMeusDados,
      sessao,
    };
  }

  // ============================================================================
  // CANCELAMENTO DE LANCE (V3: 15s fornecedor; depois solicitação + pregoeiro)
  // ============================================================================

  private async sincronizarUltimoLanceNoItem(
    manager: EntityManager,
    itemId: string,
  ): Promise<void> {
    const ultimo = await manager.findOne(Lance, {
      where: { item_id: itemId, cancelado: false },
      order: { created_at: 'DESC' },
    });
    await manager.update(ItemLicitacao, itemId, {
      ultimo_lance_em: ultimo?.created_at ?? null,
    });
  }

  async listarLancesFornecedorParaCancelamentoV3(
    sessaoId: string,
    itemId: string,
    fornecedorId: string,
  ): Promise<LancePainelCancelamentoV3[]> {
    const sessao = await this.sessaoRepo.findOne({ where: { id: sessaoId } });
    if (!sessao) throw new NotFoundException('Sessão não encontrada');

    const item = await this.itemRepo.findOne({ where: { id: itemId } });
    if (!item || item.licitacao_id !== sessao.licitacao_id) {
      throw new BadRequestException('Item inválido para esta sessão');
    }

    const lances = await this.lanceRepo.find({
      where: { item_id: itemId, fornecedor_id: fornecedorId },
      order: { created_at: 'DESC' },
      take: 30,
    });

    const emDisputa = item.status_disputa === StatusDisputaItem.EM_DISPUTA;
    const agora = Date.now();

    return lances.map((l) => {
      const criado = new Date(l.created_at).getTime();
      const limiteDireto = criado + CANCELAMENTO_LANCE_FORNECEDOR_SEGUNDOS * 1000;
      const segundosRestantes = Math.max(
        0,
        Math.floor((limiteDireto - agora) / 1000),
      );
      const pode =
        emDisputa &&
        !l.cancelado &&
        !l.solicitacao_cancelamento_pendente &&
        segundosRestantes > 0;

      return {
        id: l.id,
        valor: parseFloat(String(l.valor)),
        criadoEm: l.created_at.toISOString(),
        cancelado: l.cancelado,
        solicitacaoPendente: l.solicitacao_cancelamento_pendente,
        podeCancelarDireto: pode,
        segundosRestantesCancelamentoDireto: pode ? segundosRestantes : 0,
      };
    });
  }

  async listarSolicitacoesCancelamentoPendentesV3(
    sessaoId: string,
  ): Promise<SolicitacaoCancelamentoPendenteV3[]> {
    const sessao = await this.sessaoRepo.findOne({ where: { id: sessaoId } });
    if (!sessao) throw new NotFoundException('Sessão não encontrada');

    const candidatos = await this.lanceRepo.find({
      where: {
        solicitacao_cancelamento_pendente: true,
        cancelado: false,
      },
      relations: ['item'],
    });

    const filtrados = candidatos.filter(
      (l) => l.item && l.item.licitacao_id === sessao.licitacao_id,
    );
    filtrados.sort((a, b) => {
      const ta = a.solicitacao_cancelamento_em?.getTime() ?? 0;
      const tb = b.solicitacao_cancelamento_em?.getTime() ?? 0;
      return ta - tb;
    });

    return filtrados.map((l) => ({
        lanceId: l.id,
        itemId: l.item_id,
        itemNumero: l.item?.numero_item ?? 0,
        fornecedorId: l.fornecedor_id || '',
        fornecedorNome: l.fornecedor_nome || 'Fornecedor',
        valor: parseFloat(String(l.valor)),
        motivo: l.solicitacao_cancelamento_motivo ?? null,
        solicitadoEm: l.solicitacao_cancelamento_em
          ? l.solicitacao_cancelamento_em.toISOString()
          : '',
      }));
  }

  async cancelarLanceFornecedorImediatoV3(
    sessaoId: string,
    itemId: string,
    lanceId: string,
    fornecedorId: string,
  ): Promise<{ ok: true }> {
    await this.dataSource.transaction(async (manager) => {
      const sessao = await manager.findOne(SessaoDisputa, {
        where: { id: sessaoId },
      });
      if (!sessao) throw new NotFoundException('Sessão não encontrada');

      const item = await manager.findOne(ItemLicitacao, { where: { id: itemId } });
      if (!item || item.licitacao_id !== sessao.licitacao_id) {
        throw new BadRequestException('Item inválido para esta sessão');
      }
      if (item.status_disputa !== StatusDisputaItem.EM_DISPUTA) {
        throw new BadRequestException('Item não está em disputa');
      }

      const lance = await manager.findOne(Lance, { where: { id: lanceId } });
      if (!lance || lance.item_id !== itemId) {
        throw new NotFoundException('Lance não encontrado');
      }
      if (lance.fornecedor_id !== fornecedorId) {
        throw new ForbiddenException('Este lance não pertence ao fornecedor');
      }
      if (lance.cancelado) {
        throw new BadRequestException('Lance já está cancelado');
      }
      if (lance.solicitacao_cancelamento_pendente) {
        throw new BadRequestException(
          'Já existe solicitação de cancelamento pendente para este lance',
        );
      }

      const decorrido = Date.now() - new Date(lance.created_at).getTime();
      if (decorrido > CANCELAMENTO_LANCE_FORNECEDOR_SEGUNDOS * 1000) {
        throw new BadRequestException(
          `Prazo de ${CANCELAMENTO_LANCE_FORNECEDOR_SEGUNDOS} segundos para cancelamento direto expirou. Solicite ao pregoeiro.`,
        );
      }

      lance.cancelado = true;
      await manager.save(Lance, lance);
      await this.sincronizarUltimoLanceNoItem(manager, itemId);
    });

    await this.registrarEvento(
      sessaoId,
      TipoEvento.LANCE_CANCELADO,
      `Lance cancelado pelo próprio fornecedor (até ${CANCELAMENTO_LANCE_FORNECEDOR_SEGUNDOS}s)`,
      itemId,
      fornecedorId,
    );

    return { ok: true };
  }

  async solicitarCancelamentoLanceV3(
    sessaoId: string,
    itemId: string,
    lanceId: string,
    fornecedorId: string,
    motivo?: string,
  ): Promise<{ ok: true }> {
    await this.dataSource.transaction(async (manager) => {
      const sessao = await manager.findOne(SessaoDisputa, {
        where: { id: sessaoId },
      });
      if (!sessao) throw new NotFoundException('Sessão não encontrada');

      const item = await manager.findOne(ItemLicitacao, { where: { id: itemId } });
      if (!item || item.licitacao_id !== sessao.licitacao_id) {
        throw new BadRequestException('Item inválido para esta sessão');
      }
      if (item.status_disputa !== StatusDisputaItem.EM_DISPUTA) {
        throw new BadRequestException('Item não está em disputa');
      }

      const lance = await manager.findOne(Lance, { where: { id: lanceId } });
      if (!lance || lance.item_id !== itemId) {
        throw new NotFoundException('Lance não encontrado');
      }
      if (lance.fornecedor_id !== fornecedorId) {
        throw new ForbiddenException('Este lance não pertence ao fornecedor');
      }
      if (lance.cancelado) {
        throw new BadRequestException('Lance já está cancelado');
      }
      if (lance.solicitacao_cancelamento_pendente) {
        throw new BadRequestException('Solicitação de cancelamento já registrada');
      }

      const decorrido = Date.now() - new Date(lance.created_at).getTime();
      if (decorrido <= CANCELAMENTO_LANCE_FORNECEDOR_SEGUNDOS * 1000) {
        throw new BadRequestException(
          `Ainda dentro do prazo de ${CANCELAMENTO_LANCE_FORNECEDOR_SEGUNDOS} segundos: use o cancelamento direto.`,
        );
      }

      lance.solicitacao_cancelamento_pendente = true;
      lance.solicitacao_cancelamento_em = new Date();
      lance.solicitacao_cancelamento_motivo = motivo?.trim() || null;
      await manager.save(Lance, lance);
    });

    await this.registrarEvento(
      sessaoId,
      TipoEvento.MENSAGEM_SISTEMA,
      `Fornecedor solicitou cancelamento de lance (aguardando pregoeiro). Motivo: ${motivo?.trim() || 'não informado'}`,
      itemId,
      fornecedorId,
    );

    return { ok: true };
  }

  async pregoeiroCancelarLanceV3(
    sessaoId: string,
    itemId: string,
    lanceId: string,
    orgaoId: string,
    justificativa: string,
  ): Promise<{ ok: true }> {
    const j = justificativa?.trim();
    if (!j) {
      throw new BadRequestException('Justificativa é obrigatória');
    }

    await this.dataSource.transaction(async (manager) => {
      const sessao = await manager.findOne(SessaoDisputa, {
        where: { id: sessaoId },
      });
      if (!sessao) throw new NotFoundException('Sessão não encontrada');

      const licitacao = await manager.findOne(Licitacao, {
        where: { id: sessao.licitacao_id },
      });
      if (!licitacao || licitacao.orgao_id !== orgaoId) {
        throw new ForbiddenException('Apenas o órgão da licitação pode cancelar lances');
      }

      const item = await manager.findOne(ItemLicitacao, { where: { id: itemId } });
      if (!item || item.licitacao_id !== sessao.licitacao_id) {
        throw new BadRequestException('Item inválido para esta sessão');
      }
      if (item.status_disputa !== StatusDisputaItem.EM_DISPUTA) {
        throw new BadRequestException('Item não está em disputa');
      }

      const lance = await manager.findOne(Lance, { where: { id: lanceId } });
      if (!lance || lance.item_id !== itemId) {
        throw new NotFoundException('Lance não encontrado');
      }
      if (lance.cancelado) {
        throw new BadRequestException('Lance já está cancelado');
      }

      lance.cancelado = true;
      lance.solicitacao_cancelamento_pendente = false;
      lance.solicitacao_cancelamento_em = null;
      lance.solicitacao_cancelamento_motivo = null;
      await manager.save(Lance, lance);
      await this.sincronizarUltimoLanceNoItem(manager, itemId);
    });

    await this.registrarEvento(
      sessaoId,
      TipoEvento.LANCE_CANCELADO,
      `Lance cancelado pelo pregoeiro/órgão. ${j}`,
      itemId,
      undefined,
      'PREGOEIRO',
    );

    return { ok: true };
  }

  // ============================================================================
  // UTILITÁRIOS
  // ============================================================================

  /**
   * Registra evento na sessão
   */
  private async registrarEvento(
    sessaoId: string,
    tipo: TipoEvento,
    descricao: string,
    itemId?: string,
    fornecedorId?: string,
    usuario?: string,
  ): Promise<void> {
    const evento = this.eventoRepo.create({
      sessao_id: sessaoId,
      tipo,
      descricao,
      item_id: itemId,
      fornecedor_id: fornecedorId,
      usuario_nome: usuario || 'SISTEMA',
      is_sistema: !usuario || usuario === 'SISTEMA',
    });

    await this.eventoRepo.save(evento);
  }
}

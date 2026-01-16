import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemLicitacao, StatusDisputaItem } from '../itens/entities/item-licitacao.entity';
import { SessaoDisputa, StatusSessao } from '../sessao/entities/sessao-disputa.entity';
import { DisputaGateway } from './disputa.gateway';
import { DisputaService } from './disputa.service';

/**
 * ============================================================================
 * DISPUTA TIMER SERVICE
 * ============================================================================
 * 
 * Implementa as regras de tempo do Modo Aberto conforme Lei 14.133/2021:
 * 
 * 1. Duração inicial: 10 minutos (configurável via tempo_inatividade_minutos)
 * 2. Prorrogação automática: Se houver lance nos últimos 2 minutos do período,
 *    prorroga automaticamente por mais 2 minutos (configurável via tempo_prorrogacao_minutos)
 * 3. Prorrogação é SUCESSIVA: ocorre sempre que houver lance no período de prorrogação
 * 4. Encerramento: Quando não houver novos lances no período de prorrogação
 * 
 * ============================================================================
 */
@Injectable()
export class DisputaTimerService {
  private readonly logger = new Logger(DisputaTimerService.name);

  constructor(
    @InjectRepository(ItemLicitacao)
    private readonly itemRepo: Repository<ItemLicitacao>,
    @InjectRepository(SessaoDisputa)
    private readonly sessaoRepo: Repository<SessaoDisputa>,
    private readonly disputaGateway: DisputaGateway,
    private readonly disputaService: DisputaService,
  ) {}

  /**
   * Verifica itens em disputa a cada segundo
   * Aplica regras de prorrogação e encerramento automático
   * Emite atualização de tempo para todos os clientes via WebSocket
   */
  @Cron(CronExpression.EVERY_SECOND)
  async verificarItensEmDisputa() {
    // Buscar sessões ativas (MODO_ABERTO)
    const sessoesAtivas = await this.sessaoRepo.find({
      where: { status: StatusSessao.MODO_ABERTO },
    });

    if (sessoesAtivas.length === 0) return;

    for (const sessao of sessoesAtivas) {
      await this.processarSessaoModoAberto(sessao);
      
      // Emitir atualização de tempo para todos os clientes na sala
      await this.emitirAtualizacaoTempo(sessao);
    }
  }
  
  /**
   * Emite atualização de tempo para todos os clientes via WebSocket
   * Garante sincronização perfeita entre pregoeiro e fornecedores
   */
  private async emitirAtualizacaoTempo(sessao: SessaoDisputa) {
    try {
      const itens = await this.disputaService.getItensPorStatus(sessao.id);
      
      // Emitir apenas os tempos atualizados (payload leve)
      const temposItens = [
        ...itens.emDisputa.map(item => ({
          id: item.id,
          tempoRestante: item.tempoRestante,
          emProrrogacao: item.emProrrogacao,
        })),
      ];
      
      // Emitir para todos na sala
      this.disputaGateway.server.to(`sessao:${sessao.id}`).emit('tempo_atualizado', {
        timestamp: Date.now(),
        itens: temposItens,
      });
    } catch (error) {
      // Silenciar erros de emissão para não travar o cron
    }
  }

  /**
   * Processa sessão no Modo Aberto
   * 
   * Regras:
   * - Tempo inicial: tempo_inatividade_minutos (default: 10 min)
   * - Se houver lance nos últimos tempo_prorrogacao_minutos (default: 2 min), prorroga
   * - Prorrogação é de tempo_prorrogacao_minutos
   * - Encerra quando passar tempo_prorrogacao_minutos sem lance após tempo inicial
   */
  private async processarSessaoModoAberto(sessao: SessaoDisputa) {
    const agora = Date.now();
    const tempoInicialMs = sessao.tempo_inatividade_minutos * 60 * 1000; // 10 min default
    const tempoProrrogacaoMs = sessao.tempo_prorrogacao_minutos * 60 * 1000; // 2 min default

    // Buscar itens EM_DISPUTA
    const itensEmDisputa = await this.itemRepo.find({
      where: { 
        licitacao_id: sessao.licitacao_id,
        status_disputa: StatusDisputaItem.EM_DISPUTA,
      },
    });

    for (const item of itensEmDisputa) {
      await this.verificarItemModoAberto(sessao.id, item, agora, tempoInicialMs, tempoProrrogacaoMs);
    }
  }

  /**
   * Verifica se um item deve ser encerrado ou se está em período de prorrogação
   * 
   * Regra Lei 14.133/2021:
   * - Se houve lance nos últimos 2min do tempo inicial (entre 8min e 10min), entra em prorrogação
   * - Na prorrogação: 2 minutos, reseta a cada novo lance
   * - Encerra quando passar 2min sem lance após entrar em prorrogação
   */
  private async verificarItemModoAberto(
    sessaoId: string,
    item: ItemLicitacao,
    agora: number,
    tempoInicialMs: number,
    tempoProrrogacaoMs: number,
  ) {
    const inicioDisputa = item.disputa_iniciada_em ? new Date(item.disputa_iniciada_em).getTime() : agora;
    const ultimoLance = item.ultimo_lance_em ? new Date(item.ultimo_lance_em).getTime() : inicioDisputa;
    
    // Tempo decorrido desde o início da disputa
    const tempoDecorrido = agora - inicioDisputa;
    
    // Tempo desde o último lance
    const tempoDesdeUltimoLance = agora - ultimoLance;
    
    // Momento em que o último lance foi dado (em relação ao início)
    const momentoUltimoLance = ultimoLance - inicioDisputa;
    
    // Verifica se houve lance nos últimos 2min do tempo inicial (entre 8min e 10min)
    const lanceNosUltimos2minDoInicial = momentoUltimoLance >= (tempoInicialMs - tempoProrrogacaoMs);

    // Fase 1: Tempo inicial (10 min) E não houve lance nos últimos 2min
    if (tempoDecorrido < tempoInicialMs && !lanceNosUltimos2minDoInicial) {
      // Ainda no tempo inicial sem lance nos últimos 2min, não faz nada
      return;
    }

    // Fase 2: Prorrogação automática
    // Se houve lance nos últimos 2min do tempo inicial OU já passou o tempo inicial
    // Verifica se ainda há tempo de prorrogação (2min desde último lance)
    if (tempoDesdeUltimoLance < tempoProrrogacaoMs) {
      // Lance recente - item continua em disputa (prorrogação automática)
      return;
    }

    // Fase 3: Passou tempo de prorrogação sem lance
    // ENCERRA o item
    this.logger.log(`Item ${item.numero_item} expirou: ${Math.floor(tempoDecorrido/1000)}s desde início, ${Math.floor(tempoDesdeUltimoLance/1000)}s desde último lance, lanceNosUltimos2min: ${lanceNosUltimos2minDoInicial}`);
    await this.encerrarItemExpirado(sessaoId, item);
  }

  /**
   * Encerra item e notifica via WebSocket
   */
  private async encerrarItemExpirado(sessaoId: string, item: ItemLicitacao) {
    try {
      const resultado = await this.disputaService.encerrarItem(sessaoId, item.id);
      const itens = await this.disputaService.getItensPorStatus(sessaoId);
      
      this.disputaGateway.server.to(`sessao:${sessaoId}`).emit('item_encerrado', {
        itemId: item.id,
        vencedor: resultado.vencedor,
        itens,
      });

      this.logger.log(`Item ${item.numero_item} encerrado automaticamente por tempo`);
    } catch (error) {
      this.logger.error(`Erro ao encerrar item ${item.id}: ${error.message}`);
    }
  }

  /**
   * Calcula o tempo restante de um item em disputa
   * Usado pelo frontend para exibir o cronômetro
   * 
   * Regra Lei 14.133/2021:
   * - Se houve lance nos últimos 2min do tempo inicial, entra em prorrogação
   * - Na prorrogação: 2 minutos desde o último lance
   */
  calcularTempoRestante(
    item: ItemLicitacao,
    tempoInicialMinutos: number,
    tempoProrrogacaoMinutos: number,
  ): number {
    const agora = Date.now();
    const tempoInicialMs = tempoInicialMinutos * 60 * 1000;
    const tempoProrrogacaoMs = tempoProrrogacaoMinutos * 60 * 1000;
    
    const inicioDisputa = item.disputa_iniciada_em ? new Date(item.disputa_iniciada_em).getTime() : agora;
    const ultimoLance = item.ultimo_lance_em ? new Date(item.ultimo_lance_em).getTime() : inicioDisputa;
    
    const tempoDecorrido = agora - inicioDisputa;
    const tempoDesdeUltimoLance = agora - ultimoLance;
    
    // Momento em que o último lance foi dado (em relação ao início)
    const momentoUltimoLance = ultimoLance - inicioDisputa;
    
    // Verifica se houve lance nos últimos 2min do tempo inicial
    const lanceNosUltimos2minDoInicial = momentoUltimoLance >= (tempoInicialMs - tempoProrrogacaoMs);

    // Se ainda no tempo inicial E não houve lance nos últimos 2min
    if (tempoDecorrido < tempoInicialMs && !lanceNosUltimos2minDoInicial) {
      return Math.max(0, Math.floor((tempoInicialMs - tempoDecorrido) / 1000));
    }

    // Se em período de prorrogação (houve lance recente)
    if (tempoDesdeUltimoLance < tempoProrrogacaoMs) {
      return Math.max(0, Math.floor((tempoProrrogacaoMs - tempoDesdeUltimoLance) / 1000));
    }

    // Tempo esgotado
    return 0;
  }
}

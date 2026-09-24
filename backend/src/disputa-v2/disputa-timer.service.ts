import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ItemLicitacao, StatusDisputaItem } from '../itens/entities/item-licitacao.entity';
import { SessaoDisputa, StatusSessao } from '../sessao/entities/sessao-disputa.entity';
import { DisputaGateway } from './disputa.gateway';
import { DisputaService } from './disputa.service';
import { atorSistema } from '../licitacoes/transicoes/transicoes.tipos';
import { calcularRelogio } from './relogio-disputa';

/**
 * ============================================================================
 * DISPUTA TIMER SERVICE — o ÚNICO relógio da disputa (plano E2 item 3)
 * ============================================================================
 *
 * A cada segundo, para cada sessão em MODO_ABERTO com a licitação ATIVA:
 *  - calcula o tempo de cada item em disputa pela fórmula única
 *    (`relogio-disputa.ts` — IN 73 art. 23: 10 min + prorrogações de 2 min;
 *    status TEMPO_ALEATORIO como gancho dos modos aberto-fechado);
 *  - encerra o item cujo relógio zerou (DisputaService.encerrarItem) e difunde
 *    `item_encerrado` pelo gateway (sem identidade enquanto houver item na
 *    etapa de lances);
 *  - difunde `tempo_atualizado` (só tempos — payload leve).
 *
 * Tempos lidos do resolvedor de parâmetros (a sessão guarda a cópia).
 * O antigo relógio do `sessao` (inatividade → tempo aleatório, setInterval do
 * módulo `lances`) foi apagado.
 */
@Injectable()
export class DisputaTimerService {
  private readonly logger = new Logger(DisputaTimerService.name);
  /** Itens com encerramento em curso (um tique lento não dispara o mesmo item de novo). */
  private readonly encerrando = new Set<string>();

  constructor(
    @InjectRepository(ItemLicitacao)
    private readonly itemRepo: Repository<ItemLicitacao>,
    @InjectRepository(SessaoDisputa)
    private readonly sessaoRepo: Repository<SessaoDisputa>,
    private readonly disputaGateway: DisputaGateway,
    private readonly disputaService: DisputaService,
  ) {}

  @Cron(CronExpression.EVERY_SECOND)
  async verificarItensEmDisputa() {
    const sessoesAtivas = await this.sessaoRepo.find({ where: { status: StatusSessao.MODO_ABERTO } });
    for (const sessao of sessoesAtivas) {
      try {
        await this.processarSessao(sessao);
      } catch (e: any) {
        this.logger.error(`Relógio da sessão ${sessao.id}: ${e?.message ?? e}`);
      }
    }
  }

  private async processarSessao(sessao: SessaoDisputa) {
    // Licitação suspensa/encerrada (E1): o relógio não encerra itens nem pede transições
    if (!(await this.disputaService.licitacaoAtiva(sessao.licitacao_id))) return;

    const params = await this.disputaService.parametrosDaSessao(sessao.id);
    const itens = await this.itemRepo.find({
      where: {
        licitacao_id: sessao.licitacao_id,
        status_disputa: In([StatusDisputaItem.EM_DISPUTA, StatusDisputaItem.TEMPO_ALEATORIO]),
      },
    });

    const tempos: Array<{ id: string; tempoRestante: number; emProrrogacao: boolean }> = [];
    for (const item of itens) {
      const relogio = calcularRelogio({
        status: item.status_disputa,
        disputaIniciadaEm: item.disputa_iniciada_em,
        ultimoLanceEm: item.ultimo_lance_em,
        tempoInicialMinutos: params.tempoInicialMinutos,
        prorrogacaoMinutos: params.prorrogacaoMinutos,
        inicioTempoAleatorio: item.inicio_tempo_aleatorio,
        tempoAleatorioSorteadoSegundos: item.tempo_aleatorio_sorteado,
      });
      if (relogio.expirado) {
        await this.encerrarItemExpirado(sessao, item);
      } else {
        tempos.push({ id: item.id, tempoRestante: relogio.restanteSegundos, emProrrogacao: relogio.emProrrogacao });
      }
    }

    if (tempos.length) {
      this.disputaGateway.server?.to(`sessao:${sessao.id}`).emit('tempo_atualizado', { timestamp: Date.now(), itens: tempos });
    }
  }

  private async encerrarItemExpirado(sessao: SessaoDisputa, item: ItemLicitacao) {
    if (this.encerrando.has(item.id)) return;
    this.encerrando.add(item.id);
    try {
      // Ator SISTEMA: o último item encerrado pede ENCERRAR_DISPUTA (fim do B7)
      const resultado = await this.disputaService.encerrarItem(sessao.id, item.id, atorSistema('disputa-timer'));
      if (resultado.jaEstavaEncerrado) return;
      await this.disputaGateway.difundirItemEncerrado(sessao.id, sessao.licitacao_id, item.id, resultado);
      this.logger.log(`Item ${item.numero_item} encerrado automaticamente por tempo`);
    } catch (error: any) {
      this.logger.error(`Erro ao encerrar item ${item.id}: ${error?.message ?? error}`);
    } finally {
      this.encerrando.delete(item.id);
    }
  }
}

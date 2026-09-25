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
import { relogioDaUnidade } from './unidade-disputa';
import { BaseLance } from './modelo-lance';
import { LoteLicitacao } from '../lotes/entities/lote-licitacao.entity';
import { ParametrosDisputa } from './parametros-disputa';
import { JanelaDispensaService } from './janela-dispensa.service';
import { ModoDisputaService, MudancaFase } from './modo-disputa.service';
import { AcaoExpiracao } from './modos-disputa';

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
    private readonly janelaDispensa: JanelaDispensaService,
    private readonly modos: ModoDisputaService,
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
    // Dispensa eletrônica: modo JANELA (uma janela para a licitação, fim + prorrogação) — mesmo relógio
    if (await this.janelaDispensa.processarRelogio(sessao)) return;

    const params = await this.disputaService.parametrosDaSessao(sessao.id);
    // Disputa por LOTE: a unidade com relógio é o lote (mesma fórmula — unidade-disputa.ts)
    if (params.baseLance === BaseLance.TOTAL_LOTE) return this.processarLotes(sessao, params);
    const itens = await this.itemRepo.find({
      where: {
        licitacao_id: sessao.licitacao_id,
        status_disputa: In([StatusDisputaItem.EM_DISPUTA, StatusDisputaItem.TEMPO_ALEATORIO]),
      },
    });

    // Relógio POR MODO (modos-disputa.ts): art. 23 no aberto/fechado-aberto/reinício;
    // aberto-fechado: etapa fixa → tempo aleatório (OCULTO) → prazo do lance fechado
    const relogios = await this.modos.relogiosDaSessao(sessao, itens, params);
    const tempos: Array<{ id: string; tempoRestante: number; emProrrogacao: boolean; fase?: string; oculto?: boolean }> = [];
    for (const item of itens) {
      const relogio = relogios.get(item.id)!;
      if (relogio.expirado) {
        if (relogio.aoExpirar === 'ENCERRAR') await this.encerrarItemExpirado(sessao, item);
        else if (relogio.aoExpirar) await this.avancarFaseExpirada(sessao, item, relogio.aoExpirar);
      } else {
        // Tempo aleatório: o restante NUNCA sai do servidor (IN 73 art. 24 §1º — sigiloso)
        tempos.push({
          id: item.id,
          tempoRestante: relogio.oculto ? 0 : relogio.restanteSegundos,
          emProrrogacao: relogio.emProrrogacao,
          fase: relogio.fase,
          oculto: relogio.oculto,
        });
      }
    }

    if (tempos.length) {
      this.disputaGateway.server?.to(`sessao:${sessao.id}`).emit('tempo_atualizado', { timestamp: Date.now(), itens: tempos });
    }
  }

  /** Relógio dos LOTES em disputa (base TOTAL_LOTE): encerra o que zerou e difunde os tempos. */
  private async processarLotes(sessao: SessaoDisputa, params: ParametrosDisputa) {
    const lotes = await this.itemRepo.manager.find(LoteLicitacao, {
      where: {
        licitacao_id: sessao.licitacao_id,
        status_disputa: In([StatusDisputaItem.EM_DISPUTA, StatusDisputaItem.TEMPO_ALEATORIO]),
      },
    });
    // Mesmo relógio POR MODO do item (E2.4): a unidade é o lote
    const relogios = await this.modos.relogiosDaSessao(sessao, lotes, params);
    const tempos: Array<{ id: string; tempoRestante: number; emProrrogacao: boolean; fase?: string; oculto?: boolean }> = [];
    for (const lote of lotes) {
      const relogio = relogios.get(lote.id)!;
      if (relogio.expirado) {
        if (relogio.aoExpirar === 'ENCERRAR') await this.encerrarItemExpirado(sessao, { id: lote.id, numero_item: lote.numero }, 'Lote');
        else if (relogio.aoExpirar) await this.avancarFaseExpirada(sessao, { id: lote.id }, relogio.aoExpirar);
      } else {
        // Tempo aleatório: o restante NUNCA sai do servidor (IN 73 art. 24 §1º — sigiloso)
        tempos.push({
          id: lote.id,
          tempoRestante: relogio.oculto ? 0 : relogio.restanteSegundos,
          emProrrogacao: relogio.emProrrogacao,
          fase: relogio.fase,
          oculto: relogio.oculto,
        });
      }
    }
    if (tempos.length) {
      this.disputaGateway.server?.to(`sessao:${sessao.id}`).emit('tempo_atualizado', { timestamp: Date.now(), itens: tempos });
    }
  }

  /** Troca de fase do aberto-fechado pelo relógio (aviso de fechamento iminente; etapa fechada). */
  private async avancarFaseExpirada(sessao: SessaoDisputa, item: { id: string }, acao: AcaoExpiracao) {
    if (this.encerrando.has(item.id)) return;
    this.encerrando.add(item.id);
    try {
      const mudanca: MudancaFase | null = await this.modos.avancarFase(sessao, item.id, acao);
      if (!mudanca) return;
      await this.disputaGateway.emitirItensPorVisao(sessao.id, sessao.licitacao_id, 'fase_item_alterada', {
        itemId: mudanca.itemId,
        fase: mudanca.fase,
        evento: mudanca.evento,
        terminaEm: mudanca.terminaEm ?? null,
      });
      this.disputaGateway.server?.to(`sessao:${sessao.id}`).emit(mudanca.evento, { itemId: mudanca.itemId, terminaEm: mudanca.terminaEm ?? null });
      this.disputaGateway.server?.to(`sessao:${sessao.id}`).emit('nova_mensagem', {
        id: mudanca.mensagem.id,
        tipo: 'SISTEMA',
        remetente: 'SISTEMA',
        conteudo: mudanca.mensagem.descricao,
        dataHora: mudanca.mensagem.created_at,
      });
      this.logger.log(`${mudanca.tipoUnidade === 'LOTE' ? 'Lote' : 'Item'} ${mudanca.itemNumero}: fase ${mudanca.fase} (aberto-fechado)`);
    } catch (error: any) {
      this.logger.error(`Erro ao trocar a fase do item ${item.id}: ${error?.message ?? error}`);
    } finally {
      this.encerrando.delete(item.id);
    }
  }

  private async encerrarItemExpirado(sessao: SessaoDisputa, item: Pick<ItemLicitacao, 'id' | 'numero_item'>, rotulo = 'Item') {
    if (this.encerrando.has(item.id)) return;
    this.encerrando.add(item.id);
    try {
      // Ator SISTEMA: o último item encerrado pede ENCERRAR_DISPUTA (fim do B7)
      const resultado = await this.disputaService.encerrarItem(sessao.id, item.id, atorSistema('disputa-timer'));
      if (resultado.jaEstavaEncerrado) return;
      await this.disputaGateway.difundirItemEncerrado(sessao.id, sessao.licitacao_id, item.id, resultado);
      this.logger.log(`${rotulo} ${item.numero_item} encerrado automaticamente por tempo`);
    } catch (error: any) {
      this.logger.error(`Erro ao encerrar item ${item.id}: ${error?.message ?? error}`);
    } finally {
      this.encerrando.delete(item.id);
    }
  }
}

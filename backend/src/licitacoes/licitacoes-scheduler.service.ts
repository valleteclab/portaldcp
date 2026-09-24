import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThanOrEqual, MoreThan } from 'typeorm';
import { Licitacao, FaseLicitacao, SituacaoLicitacao } from './entities/licitacao.entity';
import { TransicoesService } from './transicoes/transicoes.service';
import { AtoLicitacao, AtorTransicao, atorSistema } from './transicoes/transicoes.tipos';

/** Fases de onde o relógio inicia o acolhimento (IMPUGNACAO = legado). */
const FASES_ANTES_DO_ACOLHIMENTO = [FaseLicitacao.PUBLICADO, FaseLicitacao.IMPUGNACAO];

/**
 * RELÓGIO DO CRONOGRAMA DA LICITAÇÃO (plano E1 item 6).
 *
 * O scheduler só PEDE transições por prazo ao TransicoesService — nunca grava
 * `fase` direto. Cada pedido é idempotente (`ignorarSeJaAplicado`), passa pelo
 * lock da licitação (cron × usuário não fazem transição dupla) e fica no
 * histórico `licitacao_transicoes` com ator SISTEMA/scheduler:
 *
 *  1. INICIAR_ACOLHIMENTO — PUBLICADO (ou IMPUGNACAO legado) →
 *     ACOLHIMENTO_PROPOSTAS quando `data_inicio_acolhimento` chegou e o prazo
 *     de propostas ainda não terminou;
 *  2. ENCERRAR_ACOLHIMENTO — ACOLHIMENTO_PROPOSTAS → ANALISE_PROPOSTAS quando
 *     `data_fim_acolhimento` chegou. A sessão pública é aberta pelo pregoeiro.
 *
 * Impugnação/esclarecimento NÃO dependem da fase: o prazo do art. 164 (até 3
 * dias úteis antes da abertura, ou `data_limite_impugnacao`) corre em paralelo
 * ao acolhimento e é checado na criação (`impugnacoes/prazo-manifestacao.util`).
 * Por isso o relógio não abre mais a fase IMPUGNACAO (ABRIR_IMPUGNACAO saiu dos
 * fluxos) e mover para o acolhimento não encerra o prazo de impugnação.
 *
 * Só licitações com situação ATIVA andam pelo relógio (suspensa/encerrada
 * mantém a fase). Cada licitação é processada isoladamente: a falha de uma é
 * registrada no log e não interrompe o lote.
 */
@Injectable()
export class LicitacoesSchedulerService {
  private readonly logger = new Logger(LicitacoesSchedulerService.name);

  constructor(
    @InjectRepository(Licitacao)
    private readonly licitacaoRepository: Repository<Licitacao>,
    private readonly transicoes: TransicoesService,
  ) {}

  /**
   * A cada minuto: pede as transições por prazo das licitações ATIVAS cujo
   * cronograma venceu. Devolve quantas licitações mudaram de fase.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async atualizarFasesAutomaticamente(agora: Date = new Date()): Promise<number> {
    let candidatas: Array<Pick<Licitacao, 'id' | 'numero_processo' | 'fase'>>;
    try {
      candidatas = await this.licitacaoRepository.find({
        select: { id: true, numero_processo: true, fase: true },
        where: [
          {
            fase: In(FASES_ANTES_DO_ACOLHIMENTO),
            situacao: SituacaoLicitacao.ATIVA,
            data_inicio_acolhimento: LessThanOrEqual(agora),
            data_fim_acolhimento: MoreThan(agora), // ainda não encerrou
          },
          {
            fase: FaseLicitacao.ACOLHIMENTO_PROPOSTAS,
            situacao: SituacaoLicitacao.ATIVA,
            data_fim_acolhimento: LessThanOrEqual(agora),
          },
        ],
      });
    } catch (error) {
      this.logger.error('Erro ao buscar licitações com prazo vencido:', error);
      return 0;
    }

    let movidas = 0;
    for (const c of candidatas) {
      try {
        const depois = await this.atualizarFaseLicitacao(c.id, atorSistema('scheduler'), agora);
        if (depois.fase !== c.fase) movidas++;
      } catch (error: any) {
        // Uma licitação com problema não pode travar o relógio das outras
        this.logger.error(
          `Transição por prazo falhou na licitação ${c.numero_processo ?? c.id}: ${error?.message ?? error}`,
        );
      }
    }
    if (movidas > 0) this.logger.log(`${movidas} licitação(ões) avançada(s) pelo cronograma`);
    return movidas;
  }

  /**
   * Aplica as transições por prazo de UMA licitação (cron e o endpoint manual
   * PUT /licitacoes/:id/atualizar-fase usam este mesmo caminho). Sem prazo
   * vencido — ou licitação não ATIVA — devolve a licitação sem alterar.
   * Erros do ato (409/400) sobem para quem chamou.
   */
  async atualizarFaseLicitacao(
    licitacaoId: string,
    ator: AtorTransicao = atorSistema('scheduler'),
    agora: Date = new Date(),
  ): Promise<Licitacao> {
    let licitacao = await this.licitacaoRepository.findOne({ where: { id: licitacaoId } });
    if (!licitacao) throw new NotFoundException(`Licitação ${licitacaoId} não encontrada`);

    // E1: suspensa/encerrada não anda pelo cronograma
    if (licitacao.situacao && licitacao.situacao !== SituacaoLicitacao.ATIVA) return licitacao;

    const registro = { origem: 'cronograma' };

    if (
      FASES_ANTES_DO_ACOLHIMENTO.includes(licitacao.fase) &&
      licitacao.data_inicio_acolhimento &&
      new Date(licitacao.data_inicio_acolhimento) <= agora &&
      licitacao.data_fim_acolhimento &&
      new Date(licitacao.data_fim_acolhimento) > agora
    ) {
      licitacao = await this.transicoes.executar(licitacao.id, AtoLicitacao.INICIAR_ACOLHIMENTO, {
        ator,
        ignorarSeJaAplicado: true,
        registro,
      });
    }

    if (
      licitacao.fase === FaseLicitacao.ACOLHIMENTO_PROPOSTAS &&
      (!licitacao.situacao || licitacao.situacao === SituacaoLicitacao.ATIVA) &&
      licitacao.data_fim_acolhimento &&
      new Date(licitacao.data_fim_acolhimento) <= agora
    ) {
      licitacao = await this.transicoes.executar(licitacao.id, AtoLicitacao.ENCERRAR_ACOLHIMENTO, {
        ator,
        ignorarSeJaAplicado: true,
        registro,
      });
    }

    return licitacao;
  }
}

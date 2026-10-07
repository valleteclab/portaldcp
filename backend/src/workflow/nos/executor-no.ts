import { Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { WorkflowAcao, WorkflowInstancia, WorkflowTarefa } from '../workflow.entities';

/**
 * PONTO DE EXTENSÃO DO MOTOR. Cada tipo de nó do catálogo pode ter um
 * executor; quem implementa um nó novo registra o executor no `onModuleInit`
 * do próprio módulo e NÃO mexe no workflow.service:
 *
 *   constructor(private readonly registro: RegistroNos) {}
 *   onModuleInit() { this.registro.registrarExecutor(this); }
 *
 * Avisos (WhatsApp, e-mail, Teams) entram como ouvintes de evento:
 *   onModuleInit() { this.registro.registrarOuvinte(this); }
 */

export interface ContextoNo {
  orgaoId: string;
  instancia: WorkflowInstancia;
  acao: WorkflowAcao;
  tarefa: WorkflowTarefa;
  /** Processo eletrônico ao qual a execução está ligada (vinculo_tipo = 'PROCESSO'). */
  processoId: string | null;
  /** Quem agiu; nulo quando o próprio sistema conclui (nó automático). */
  atorId: string | null;
}

export interface ExecutorNo {
  readonly tipo: string;
  /** O que ainda falta para concluir a etapa (vazio = pode concluir). Vira 400 com a lista. */
  pendencias?(ctx: ContextoNo): Promise<string[]>;
  /** Roda na mesma transação da conclusão: o que falhar aqui desfaz a conclusão. */
  aoConcluir?(ctx: ContextoNo, manager: EntityManager): Promise<void>;
  /** Só nós `automatico` do catálogo: executa ao chegar; o motor conclui em seguida. */
  executarAutomatico?(ctx: ContextoNo): Promise<void>;
}

export type TipoEventoFluxo = 'TAREFA_CRIADA' | 'TAREFA_CONCLUIDA' | 'TAREFA_DEVOLVIDA' | 'FLUXO_CONCLUIDO';

export interface EventoFluxo {
  tipo: TipoEventoFluxo;
  ctx: ContextoNo;
}

export interface OuvinteFluxo {
  aoEvento(evento: EventoFluxo): Promise<void>;
}

export const VINCULO_PROCESSO = 'PROCESSO';

@Injectable()
export class RegistroNos {
  private readonly logger = new Logger(RegistroNos.name);
  private readonly executores = new Map<string, ExecutorNo>();
  private readonly ouvintes: OuvinteFluxo[] = [];

  registrarExecutor(executor: ExecutorNo): void {
    const tipo = executor.tipo.toUpperCase();
    if (this.executores.has(tipo)) throw new Error(`Executor do nó ${tipo} registrado duas vezes`);
    this.executores.set(tipo, executor);
  }

  registrarOuvinte(ouvinte: OuvinteFluxo): void {
    this.ouvintes.push(ouvinte);
  }

  executor(tipo: string | null | undefined): ExecutorNo | null {
    return (tipo && this.executores.get(String(tipo).toUpperCase())) || null;
  }

  async pendencias(ctx: ContextoNo): Promise<string[]> {
    const executor = this.executor(ctx.acao.tipo);
    return executor?.pendencias ? executor.pendencias(ctx) : [];
  }

  /**
   * Avisa os ouvintes DEPOIS de gravado. Falha de aviso nunca desfaz nem
   * trava o fluxo: só vai para o log.
   */
  async emitir(evento: EventoFluxo): Promise<void> {
    for (const ouvinte of this.ouvintes) {
      try {
        await ouvinte.aoEvento(evento);
      } catch (e) {
        this.logger.warn(`Ouvinte falhou em ${evento.tipo} (tarefa ${evento.ctx.tarefa.id}): ${(e as Error).message}`);
      }
    }
  }
}

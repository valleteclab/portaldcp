import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntitySubscriberInterface, InsertEvent, QueryRunner, TransactionCommitEvent, TransactionRollbackEvent, UpdateEvent } from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';
import { DocumentoFaseInterna } from '../entities/documento-fase-interna.entity';
import { TarefasService } from './tarefas.service';

const CHAVE = '__tarefasFaseInterna';
/** Colunas da licitação que mudam etapa ou responsável. */
const COLUNAS_LICITACAO = new Set(['fase', 'situacao', 'pregoeiro_id', 'modalidade']);

/**
 * GATILHO das tarefas: qualquer gravação de peça da fase interna
 * (`documentos_fase_interna` — editor, anexo, "não se aplica", pesquisa de
 * preços, aprovação, espelho da aba Documentos...) ou mudança de fase,
 * situação ou responsável da licitação agenda a sincronização das tarefas do
 * processo DEPOIS do commit (nada roda dentro da transação de quem gravou).
 *
 * Um só lugar em vez de um gancho em cada serviço: nenhum caminho de gravação
 * da peça fica de fora. Atualizações por QueryBuilder sem o id da licitação
 * (ex.: conclusão da assinatura) chamam `TarefasService.agendar` direto.
 * Desligar: FASE_INTERNA_TAREFAS=false.
 */
@Injectable()
export class TarefasSubscriber implements EntitySubscriberInterface {
  constructor(
    @InjectDataSource() dataSource: DataSource,
    private readonly tarefas: TarefasService,
  ) {
    dataSource.subscribers.push(this);
  }

  afterInsert(event: InsertEvent<any>): void {
    if (event.metadata.target === DocumentoFaseInterna) this.anotar(event.queryRunner, event.entity?.licitacao_id, 0);
    else if (event.metadata.target === Licitacao) this.anotar(event.queryRunner, event.entity?.id, 300);
  }

  afterUpdate(event: UpdateEvent<any>): void {
    if (event.metadata.target === DocumentoFaseInterna) {
      this.anotar(event.queryRunner, event.entity?.licitacao_id ?? event.databaseEntity?.licitacao_id, 0);
    } else if (event.metadata.target === Licitacao) {
      const mudou = (event.updatedColumns ?? []).some((c) => COLUNAS_LICITACAO.has(c.propertyName));
      if (mudou) this.anotar(event.queryRunner, event.entity?.id ?? event.databaseEntity?.id, 0);
    }
  }

  afterTransactionCommit(event: TransactionCommitEvent): void {
    // Savepoint liberado não é o commit de verdade: espera a transação de fora
    if (event.queryRunner.isTransactionActive) return;
    this.despachar(event.queryRunner);
  }

  afterTransactionRollback(event: TransactionRollbackEvent): void {
    if (event.queryRunner.isTransactionActive) return;
    if (event.queryRunner.data) delete event.queryRunner.data[CHAVE];
  }

  /**
   * Guarda o processo para depois do commit. `atraso` (ms): na criação da
   * licitação, dá tempo de o chamador registrar a criação (quem criou) e os
   * itens antes de calcular o responsável.
   */
  private anotar(qr: QueryRunner | undefined, licitacaoId: unknown, atraso: number) {
    if (!this.tarefas.ativo() || typeof licitacaoId !== 'string' || !licitacaoId) return;
    if (!qr || !qr.isTransactionActive) {
      this.tarefas.agendar(licitacaoId, atraso);
      return;
    }
    qr.data = qr.data ?? {};
    const pendentes: Map<string, number> = qr.data[CHAVE] ?? new Map();
    pendentes.set(licitacaoId, Math.max(pendentes.get(licitacaoId) ?? 0, atraso));
    qr.data[CHAVE] = pendentes;
  }

  private despachar(qr: QueryRunner) {
    const pendentes: Map<string, number> | undefined = qr.data?.[CHAVE];
    if (!pendentes?.size) return;
    delete qr.data[CHAVE];
    for (const [id, atraso] of pendentes) this.tarefas.agendar(id, atraso);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntitySubscriberInterface, QueryRunner, TransactionCommitEvent, TransactionRollbackEvent, UpdateEvent } from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';
import { MinutasTelaService } from './minutas-tela.service';

const CHAVE = '__minutasFaseInterna';

/** Colunas do processo que as peças geradas por modelo citam. */
const COLUNAS: Record<string, string> = {
  fundamento_legal: 'fundamento legal',
  numero_processo: 'número do processo',
  numero_edital: 'número da dispensa/edital',
  sigilo_orcamento: 'sigilo do orçamento',
  objeto: 'objeto',
  dispensa_com_lances: 'disputa da dispensa (com/sem lances)',
};

/**
 * GATILHO DA REGERAÇÃO DAS MINUTAS (Entrega 3B — critério de aceite da SPEC
 * "mudar `fundamento_legal` atualiza as minutas geradas por modelo"): toda
 * mudança do fundamento, do número, do sigilo ou do objeto da licitação (pela
 * entidade — "Editar processo") agenda, DEPOIS do commit, a regeração das
 * peças geradas pelo modelo e intocadas; as editadas à mão ficam marcadas
 * como desatualizadas. Desligar: FASE_INTERNA_REGERAR_MINUTAS=false.
 */
@Injectable()
export class MinutasSubscriber implements EntitySubscriberInterface {
  private readonly logger = new Logger(MinutasSubscriber.name);

  constructor(
    @InjectDataSource() dataSource: DataSource,
    private readonly minutas: MinutasTelaService,
  ) {
    dataSource.subscribers.push(this);
  }

  private ativo() {
    return process.env.FASE_INTERNA_REGERAR_MINUTAS !== 'false';
  }

  afterUpdate(event: UpdateEvent<any>): void {
    if (!this.ativo() || event.metadata.target !== Licitacao) return;
    const campos = (event.updatedColumns ?? []).map((c) => COLUNAS[c.propertyName]).filter(Boolean);
    const id = event.entity?.id ?? event.databaseEntity?.id;
    if (!campos.length || typeof id !== 'string') return;
    this.anotar(event.queryRunner, id, campos);
  }

  afterTransactionCommit(event: TransactionCommitEvent): void {
    if (event.queryRunner.isTransactionActive) return;
    const pendentes: Map<string, Set<string>> | undefined = event.queryRunner.data?.[CHAVE];
    if (!pendentes?.size) return;
    delete event.queryRunner.data[CHAVE];
    for (const [id, campos] of pendentes) this.disparar(id, [...campos]);
  }

  afterTransactionRollback(event: TransactionRollbackEvent): void {
    if (event.queryRunner.isTransactionActive) return;
    if (event.queryRunner.data) delete event.queryRunner.data[CHAVE];
  }

  private anotar(qr: QueryRunner | undefined, id: string, campos: string[]) {
    if (!qr || !qr.isTransactionActive) {
      this.disparar(id, campos);
      return;
    }
    qr.data = qr.data ?? {};
    const pendentes: Map<string, Set<string>> = qr.data[CHAVE] ?? new Map();
    const set = pendentes.get(id) ?? new Set<string>();
    campos.forEach((c) => set.add(c));
    pendentes.set(id, set);
    qr.data[CHAVE] = pendentes;
  }

  /** Fila por processo (nada em paralelo para o mesmo processo). */
  private readonly filas = new Map<string, Promise<void>>();

  private disparar(id: string, campos: string[]) {
    const anterior = this.filas.get(id) ?? Promise.resolve();
    const prox = anterior
      .then(() => this.minutas.regerarPorMudanca(id, campos))
      .then(() => undefined)
      .catch((e: any) => this.logger.warn(`Minutas do processo ${id} não regeradas: ${e?.message ?? e}`));
    this.filas.set(id, prox);
    prox.finally(() => {
      if (this.filas.get(id) === prox) this.filas.delete(id);
    });
  }

  /** Espera as regerações agendadas (testes e leituras logo depois de gravar). */
  async aguardarPendentes(): Promise<void> {
    for (let i = 0; i < 5 && this.filas.size; i++) await Promise.allSettled([...this.filas.values()]);
  }
}

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';

/**
 * Tipo da operação no PNCP. Desde a E7 cada linha de `pncp_sync` é uma
 * OPERAÇÃO da fila (outbox) — ver `fila/regras-fila.ts`:
 *  - COMPRA: inclusão da contratação (multipart com o edital/aviso);
 *  - ITEM: inclusão dos itens da contratação (os itens vão embutidos na compra;
 *    "número do item já utilizado" = sucesso);
 *  - DOCUMENTO: arquivo anexado à contratação (edital retificado, termo de homologação...);
 *  - RETIFICACAO_COMPRA: retificação parcial da contratação (edital retificado);
 *  - SITUACAO_COMPRA: situação da contratação (suspensa, revogada, anulada,
 *    divulgada) ou dos itens (deserto, fracassado);
 *  - RESULTADO: resultado de UM item (homologação);
 *  - ATA: ata de registro de preços assinada;
 *  - CONTRATO: contrato assinado (art. 94);
 *  - RETIFICACAO_CONTRATO: contrato enviado antes da assinatura (legado) → retificado com o termo assinado.
 * PCA e TERMO continuam como registros de histórico (fora da fila).
 */
export enum TipoSincronizacao {
  PCA = 'PCA',
  COMPRA = 'COMPRA',
  ITEM = 'ITEM',
  DOCUMENTO = 'DOCUMENTO',
  RESULTADO = 'RESULTADO',
  ATA = 'ATA',
  CONTRATO = 'CONTRATO',
  TERMO = 'TERMO',
  RETIFICACAO_COMPRA = 'RETIFICACAO_COMPRA',
  SITUACAO_COMPRA = 'SITUACAO_COMPRA',
  RETIFICACAO_CONTRATO = 'RETIFICACAO_CONTRATO',
}

/**
 * PENDENTE → ENVIANDO → ENVIADO | ERRO_TEMPORARIO (volta à fila com backoff) |
 * ERRO_DEFINITIVO (regra de negócio do PNCP / tentativas esgotadas — só volta
 * pelo "reenviar agora"). EXCLUIDO: a compra foi excluída do PNCP (as
 * operações dela saem da fila). ERRO/ATUALIZADO: registros anteriores à E7.
 */
export enum StatusSincronizacao {
  PENDENTE = 'PENDENTE',
  ENVIANDO = 'ENVIANDO',
  ENVIADO = 'ENVIADO',
  ERRO = 'ERRO',
  ERRO_TEMPORARIO = 'ERRO_TEMPORARIO',
  ERRO_DEFINITIVO = 'ERRO_DEFINITIVO',
  ATUALIZADO = 'ATUALIZADO',
  EXCLUIDO = 'EXCLUIDO'
}

@Entity('pncp_sync')
@Index('IDX_pncp_sync_fila', ['status', 'proximo_envio'])
@Index('IDX_pncp_sync_licitacao', ['licitacao_id'])
export class PncpSync {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: TipoSincronizacao
  })
  tipo: TipoSincronizacao;

  @Column({ nullable: true })
  entidade_id: string;

  @Column({ nullable: true })
  licitacao_id: string;

  @ManyToOne(() => Licitacao, { nullable: true })
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column({ nullable: true })
  orgao_id: string;

  @Column({ nullable: true })
  numero_controle_pncp: string;

  @Column({ nullable: true })
  ano_compra: number;

  @Column({ nullable: true })
  sequencial_compra: number;

  @Column({
    type: 'enum',
    enum: StatusSincronizacao,
    default: StatusSincronizacao.PENDENTE
  })
  status: StatusSincronizacao;

  /** Última mensagem de erro (a do PNCP, quando houver). */
  @Column({ type: 'text', nullable: true })
  erro_mensagem: string;

  @Column({ type: 'int', default: 0 })
  tentativas: number;

  @Column({ type: 'timestamp', nullable: true })
  ultima_tentativa: Date;

  /** Payload efetivamente enviado na última tentativa (montado NA HORA do envio). */
  @Column({ type: 'jsonb', nullable: true })
  payload_enviado: any;

  @Column({ type: 'jsonb', nullable: true })
  resposta_pncp: any;

  @Column({ nullable: true })
  usuario_envio: string;

  // --- Fila (E7) --------------------------------------------------------------

  /**
   * Chave de idempotência da operação (ex.: `COMPRA:<licitação>`,
   * `RESULTADO:<item>:<homologação>`): a mesma operação nunca entra duas vezes.
   * Nula nos registros anteriores à E7 (que o worker ignora).
   */
  @Column({ type: 'varchar', length: 200, nullable: true, unique: true })
  chave_idempotencia: string | null;

  /** Referências da operação (ids, justificativa, ator) — NUNCA o payload pronto. */
  @Column({ type: 'jsonb', nullable: true })
  referencia: Record<string, any> | null;

  /** Ordem de dependência (compra antes de itens/resultados/atas/contratos). */
  @Column({ type: 'int', default: 100 })
  ordem: number;

  /** Próxima tentativa (backoff exponencial). Nulo = assim que possível. */
  @Column({ type: 'timestamptz', nullable: true })
  proximo_envio: Date | null;

  @Column({ type: 'int', default: 8 })
  max_tentativas: number;

  @Column({ type: 'timestamptz', nullable: true })
  enviado_em: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

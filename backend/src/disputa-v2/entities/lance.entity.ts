import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';
import { ItemLicitacao } from '../../itens/entities/item-licitacao.entity';
import { BaseLance, OrigemLance } from '../modelo-lance';

/**
 * Lance da disputa (tabela ÚNICA de lances do pregão/concorrência — plano E2).
 *
 * Escrito SÓ pelo motor (`DisputaService.registrarLance` e a conversão
 * proposta→lance do mesmo serviço). Ver `modelo-lance.ts` para o significado
 * de `valor` × `valor_unitario` × `valor_total` e das origens.
 *
 * Índice único parcial `UQ_lances_proposta_ativa` (item, fornecedor) para
 * origem PROPOSTA ativa: criado pela migração de dados (boot hook /
 * migration 20260925000001) depois de desduplicar as linhas antigas — por isso
 * `synchronize: false` (o synchronize não o cria nem o apaga).
 */
@Entity('lances')
// (item_id, fornecedor_id) WHERE origem = 'PROPOSTA' AND cancelado = false — ver migracao-lances.ts
@Index('UQ_lances_proposta_ativa', { synchronize: false })
@Index('IDX_lances_item_ativo', ['item_id', 'cancelado'])
// (lote_id, fornecedor_id) WHERE origem = 'PROPOSTA' AND cancelado = false AND item_id IS NULL — ver disputa-lote.service.ts
@Index('UQ_lances_lote_proposta_ativa', { synchronize: false })
@Index('IDX_lances_lote_ativo', ['lote_id', 'cancelado'])
export class Lance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Valor COMPARÁVEL, na unidade de `base_lance` (é o que ordena o ranking). */
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor: number;

  /** Preço unitário do lance (4 casas, como itens_licitacao.valor_unitario_*). */
  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  valor_unitario: number | null;

  /** Valor total do item neste lance (unitário × quantidade). */
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_total: number | null;

  /** Base em que `valor` foi dado (cópia da licitação no momento do lance). */
  @Column({ type: 'varchar', length: 20, nullable: true })
  base_lance: BaseLance | null;

  @Column({ type: 'varchar', length: 20, default: OrigemLance.LANCE })
  origem: OrigemLance;

  /**
   * Fornecedor que deu o lance — OBRIGATÓRIO no motor (a chave do licitante).
   * A coluna segue anulável no banco só por causa de linhas legadas sem
   * fornecedor identificável (ver relatório da migração); o NOT NULL entra com
   * o synchronize desligado (E9).
   */
  @Column({ type: 'varchar', nullable: true })
  fornecedor_id: string;

  /** Razão social no momento do lance (ata). Nunca difundida durante a disputa. */
  @Column({ type: 'varchar', nullable: true })
  fornecedor_nome: string;

  /** @deprecated legado (módulo `lances` removido na E2) — só leitura de linhas antigas. */
  @Column({ type: 'varchar', nullable: true })
  fornecedor_identificador: string;

  @Column({ type: 'varchar', nullable: true })
  ip_origem: string;

  /** Cancelamento LÓGICO (nunca DELETE): exclusão pelo licitante, pelo pregoeiro ou reinício. */
  @Column({ default: false })
  cancelado: boolean;

  @Column({ type: 'timestamp', nullable: true })
  cancelado_em: Date | null;

  /** FORNECEDOR (art. 21 §3º), PREGOEIRO (art. 21 §4º) ou REINICIO. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  cancelado_por: string | null;

  @Column({ type: 'text', nullable: true })
  cancelado_motivo: string | null;

  /** Após o prazo de exclusão direta o fornecedor não cancela; fica pendente até o pregoeiro. */
  @Column({ default: false })
  solicitacao_cancelamento_pendente: boolean;

  @Column({ type: 'timestamp', nullable: true })
  solicitacao_cancelamento_em: Date | null;

  @Column({ type: 'text', nullable: true })
  solicitacao_cancelamento_motivo: string | null;

  /** Gravado pelo motor com o relógio da aplicação, DEPOIS da trava do item (ordem de registro). */
  @CreateDateColumn()
  created_at: Date;

  // Relacionamento com Licitação
  @ManyToOne(() => Licitacao)
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column()
  licitacao_id: string;

  @ManyToOne(() => ItemLicitacao, { nullable: true })
  @JoinColumn({ name: 'item_id' })
  item: ItemLicitacao;

  @Column({ nullable: true })
  item_id: string;

  /**
   * DISPUTA POR LOTE (base TOTAL_LOTE — `rateio-lote.ts`):
   *  - lance DO LOTE: `lote_id` preenchido e `item_id` NULO; `valor` =
   *    `valor_total` = valor global do lote (é o que ordena o ranking do lote);
   *  - RATEIO por item: uma linha por item do lote com `item_id`, `lote_id` e
   *    `lance_lote_id` = id do lance do lote; `valor` = valor global do lote
   *    (comparável: o menor valor do item É o do vencedor do lote) e
   *    `valor_total`/`valor_unitario` = parcela rateada do item — o que
   *    homologação/ata/contrato leem. Cancelamento sempre em conjunto.
   */
  @Column({ type: 'uuid', nullable: true })
  lote_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  lance_lote_id: string | null;
}

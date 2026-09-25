import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * ACEITAÇÃO DA PROPOSTA (IN SEGES 73/2022 art. 29; Lei 14.133 art. 59) — uma
 * linha por CONVOCAÇÃO de um licitante numa unidade (item ou lote):
 *
 *   AGUARDANDO_ENVIO → (fornecedor envia a proposta adequada ao último lance) → ENVIADA
 *   ENVIADA → ACEITA | RECUSADA (motivo)          AGUARDANDO_ENVIO (prazo vencido) → RECUSADA
 *   qualquer ativa → CANCELADA (licitante excluído por outro ato / reinício)
 *
 * Prazo ≥ 2 h (parâmetro do órgão), prorrogável UMA vez pelo mesmo período,
 * de ofício ou a pedido justificado do licitante.
 *
 * O ARQUIVO da proposta fica no banco (`arquivo_conteudo`, nunca selecionado
 * por padrão): a pasta de uploads é servida publicamente e a proposta só pode
 * ser lida pelo órgão dono e pelo próprio licitante.
 */
@Entity('aceitacoes_proposta')
@Index('IDX_aceitacoes_unidade', ['unidade_id', 'status'])
@Index('IDX_aceitacoes_licitacao', ['licitacao_id'])
export class AceitacaoProposta {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'uuid' })
  sessao_id: string;

  /** ITEM | LOTE */
  @Column({ type: 'varchar', length: 10 })
  tipo_unidade: string;

  @Column({ type: 'uuid' })
  unidade_id: string;

  @Column({ type: 'varchar' })
  fornecedor_id: string;

  /** StatusAceitacao (regras-julgamento.ts). */
  @Column({ type: 'varchar', length: 20 })
  status: string;

  // --- convocação / prazo ---
  @Column({ type: 'timestamp' })
  convocada_em: Date;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  prazo_horas: number;

  @Column({ type: 'timestamp' })
  prazo_ate: Date;

  @Column({ type: 'timestamp', nullable: true })
  prorrogada_em: Date | null;

  /** DE_OFICIO | PEDIDO */
  @Column({ type: 'varchar', length: 12, nullable: true })
  prorrogacao_origem: string | null;

  @Column({ type: 'text', nullable: true })
  prorrogacao_motivo: string | null;

  @Column({ type: 'timestamp', nullable: true })
  pedido_prorrogacao_em: Date | null;

  @Column({ type: 'text', nullable: true })
  pedido_prorrogacao_motivo: string | null;

  /**
   * Limites da proposta adequada no momento da convocação: valor final da
   * unidade (último lance, em TOTAL) e teto de cada item (rateio, no lote).
   */
  @Column({ type: 'jsonb' })
  limites: {
    valorFinalTotal: number;
    valorFinalNaBase: number;
    baseLance: string;
    itens: Array<{ itemId: string; numero: number; descricao?: string; quantidade: number; valorMaximoTotal: number | null }>;
  };

  // --- proposta adequada enviada ---
  @Column({ type: 'timestamp', nullable: true })
  enviada_em: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  valores_itens: Array<{ itemId: string; numero: number; quantidade: number; valorUnitario: number; valorTotal: number }> | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_total_readequado: number | null;

  @Column({ type: 'text', nullable: true })
  observacao_fornecedor: string | null;

  @Column({ type: 'varchar', nullable: true })
  arquivo_nome: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  arquivo_mime: string | null;

  @Column({ type: 'int', nullable: true })
  arquivo_tamanho: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  arquivo_sha256: string | null;

  @Column({ type: 'bytea', nullable: true, select: false })
  arquivo_conteudo: Buffer | null;

  /** Indício de inexequibilidade (art. 59 §4º / IN 73 art. 34) — alerta, não bloqueio. */
  @Column({ type: 'jsonb', nullable: true })
  alerta_exequibilidade: Record<string, any> | null;

  @Column({ type: 'text', nullable: true })
  justificativa_exequibilidade: string | null;

  // --- decisão ---
  @Column({ type: 'timestamp', nullable: true })
  decidida_em: Date | null;

  @Column({ type: 'text', nullable: true })
  decisao_motivo: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  decidida_por_tipo: string | null;

  @Column({ type: 'varchar', nullable: true })
  decidida_por_id: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  convocada_por_tipo: string | null;

  @Column({ type: 'varchar', nullable: true })
  convocada_por_id: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

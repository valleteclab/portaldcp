import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * LICITANTE NA UNIDADE (plano E3 / §2.3): situação de cada licitante em cada
 * unidade de disputa — ITEM, ou LOTE quando a licitação disputa por lote.
 *
 * É o que o ranking único (`RankingService`) consulta para "chamar o próximo":
 * DESCLASSIFICADO / RECUSADO / INABILITADO saem do ranking; a aceitação marca
 * ACEITO; a habilitação, HABILITADO/INABILITADO; a adjudicação só escolhe quem
 * tem proposta aceita (e nunca um excluído).
 *
 * Criada pelo motor quando a etapa de lances da unidade termina (ranking
 * final → CLASSIFICADO), de forma idempotente (índice único unidade +
 * fornecedor), e atualizada pelos atos. Situação e unidade em varchar (sem
 * enum no banco: novas situações — ex.: desempate ME/EPP — não exigem ALTER TYPE).
 */
@Entity('licitantes_unidade')
@Index('UQ_licitantes_unidade', ['unidade_id', 'fornecedor_id'], { unique: true })
@Index('IDX_licitantes_unidade_licitacao', ['licitacao_id'])
export class LicitanteUnidade {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  /** ITEM | LOTE */
  @Column({ type: 'varchar', length: 10 })
  tipo_unidade: string;

  /** Id do item ou do lote. */
  @Column({ type: 'uuid' })
  unidade_id: string;

  @Column({ type: 'varchar' })
  fornecedor_id: string;

  /** SituacaoLicitante (regras-julgamento.ts). */
  @Column({ type: 'varchar', length: 30 })
  situacao: string;

  @Column({ type: 'text', nullable: true })
  motivo: string | null;

  /** Posição e valor no encerramento da etapa de lances (retrato; o ranking vivo é recalculado). */
  @Column({ type: 'int', nullable: true })
  posicao_final: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  valor_final: number | null;

  /** Quem praticou o último ato (ORGAO/USUARIO/FORNECEDOR/SISTEMA + id). */
  @Column({ type: 'varchar', length: 20, nullable: true })
  ator_tipo: string | null;

  @Column({ type: 'varchar', nullable: true })
  ator_id: string | null;

  @Column({ type: 'timestamp', nullable: true })
  situacao_em: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

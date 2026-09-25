import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * DESEMPATE FICTO ME/EPP DA UNIDADE (LC 123/2006 arts. 44 e 45) — uma linha
 * por UNIDADE (item, ou lote na base TOTAL_LOTE), criada quando a etapa de
 * lances da unidade termina:
 *
 *   NAO_APLICAVEL (motivo)   — sem empate ficto (melhor já ME/EPP, nenhuma
 *                              ME/EPP no intervalo, unidade exclusiva...)
 *   EM_CURSO                 — ME/EPP convocada(s) na ordem; a ACEITAÇÃO da
 *                              unidade fica bloqueada (gancho da aceitação)
 *   EXERCIDO | NAO_EXERCIDO  — uma ME/EPP cobriu a melhor oferta / nenhuma exerceu
 *   CANCELADO                — reinício da disputa
 *
 * `candidatos` guarda a fila (ordem de classificação; iguais por sorteio —
 * art. 45 III, com a semente e os códigos em `sorteio`), o que torna a
 * sequência de convocações auditável e reproduzível.
 */
@Entity('desempates_mpe')
@Index('UQ_desempates_mpe_unidade', ['unidade_id'], { unique: true })
@Index('IDX_desempates_mpe_licitacao', ['licitacao_id', 'status'])
export class DesempateMpe {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'uuid', nullable: true })
  sessao_id: string | null;

  /** ITEM | LOTE */
  @Column({ type: 'varchar', length: 10 })
  tipo_unidade: string;

  @Column({ type: 'uuid' })
  unidade_id: string;

  /** StatusDesempateMpe (regras-me-epp.ts). */
  @Column({ type: 'varchar', length: 20 })
  status: string;

  @Column({ type: 'text', nullable: true })
  motivo: string | null;

  /** Intervalo aplicado (5% pregão / 10% demais — parâmetro). */
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  percentual: number | null;

  @Column({ type: 'varchar', nullable: true })
  melhor_fornecedor_id: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  melhor_valor: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  limite_valor: number | null;

  @Column({ type: 'jsonb', nullable: true })
  candidatos: Array<{ fornecedorId: string; valor: number; posicao: number; ordem: number; sorteado?: boolean }> | null;

  @Column({ type: 'jsonb', nullable: true })
  sorteio: Record<string, any> | null;

  @Column({ type: 'int', nullable: true })
  prazo_minutos: number | null;

  @Column({ type: 'varchar', nullable: true })
  vencedor_fornecedor_id: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  valor_vencedor: number | null;

  @Column({ type: 'timestamp', nullable: true })
  concluido_em: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

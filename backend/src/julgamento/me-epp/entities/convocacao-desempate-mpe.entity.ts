import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * CONVOCAÇÃO DA ME/EPP PARA O DESEMPATE FICTO (LC 123/2006 art. 45 I, II e
 * §3º) — uma por ME/EPP chamada, na ordem da fila do `DesempateMpe`:
 *
 *   AGUARDANDO → (a própria ME/EPP, pelo token) EXERCIDA (lance DESEMPATE_MPE
 *   no motor, estritamente inferior à melhor) | DECLINADA
 *   AGUARDANDO → (prazo de 5 min vencido) EXPIRADA → convoca a próxima
 *   PROCESSANDO: trava curta enquanto o lance é registrado (o prazo não a vence)
 *   qualquer ativa → CANCELADA (reinício)
 */
@Entity('convocacoes_desempate_mpe')
@Index('IDX_conv_desempate_mpe_desempate', ['desempate_id', 'ordem'])
@Index('IDX_conv_desempate_mpe_status', ['status', 'prazo_ate'])
@Index('IDX_conv_desempate_mpe_fornecedor', ['sessao_id', 'fornecedor_id'])
export class ConvocacaoDesempateMpe {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  desempate_id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'uuid', nullable: true })
  sessao_id: string | null;

  @Column({ type: 'varchar', length: 10 })
  tipo_unidade: string;

  @Column({ type: 'uuid' })
  unidade_id: string;

  @Column({ type: 'varchar' })
  fornecedor_id: string;

  /** Posição na fila de convocação (1 = melhor ME/EPP do intervalo). */
  @Column({ type: 'int' })
  ordem: number;

  /** StatusConvocacaoMpe (regras-me-epp.ts). */
  @Column({ type: 'varchar', length: 20 })
  status: string;

  /** Melhor oferta a cobrir no momento da convocação. */
  @Column({ type: 'decimal', precision: 15, scale: 4 })
  valor_a_cobrir: number;

  /** Melhor oferta da própria ME/EPP no momento da convocação. */
  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  valor_proprio: number | null;

  @Column({ type: 'timestamp' })
  convocada_em: Date;

  @Column({ type: 'int' })
  prazo_minutos: number;

  @Column({ type: 'timestamp' })
  prazo_ate: Date;

  @Column({ type: 'timestamp', nullable: true })
  respondida_em: Date | null;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  valor_ofertado: number | null;

  @Column({ type: 'uuid', nullable: true })
  lance_id: string | null;

  @Column({ type: 'text', nullable: true })
  motivo: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

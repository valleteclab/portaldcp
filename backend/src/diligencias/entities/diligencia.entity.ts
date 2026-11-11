import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * DILIGÊNCIA GERAL (regras em `regras-diligencia.ts`): pedido do pregoeiro/
 * agente a um licitante, com prazo. `unidade_id` (item ou lote) é opcional — a
 * diligência pode dizer respeito ao licitante como um todo.
 */
@Entity('diligencias_licitante')
@Index('IDX_diligencias_licitante_licitacao', ['licitacao_id'])
@Index('IDX_diligencias_licitante_fornecedor', ['fornecedor_id'])
export class DiligenciaLicitante {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'uuid', nullable: true })
  sessao_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  unidade_id: string | null;

  /** Rótulo da unidade no momento do pedido ("Item 3", "Lote 1") — para a ata e as telas. */
  @Column({ type: 'varchar', length: 60, nullable: true })
  unidade_rotulo: string | null;

  @Column({ type: 'uuid' })
  fornecedor_id: string;

  /** ACEITACAO | HABILITACAO | DISPENSA | OUTRA */
  @Column({ type: 'varchar', length: 20, default: 'OUTRA' })
  fase: string;

  @Column({ type: 'text' })
  pedido: string;

  @Column({ type: 'numeric', precision: 8, scale: 2 })
  prazo_horas: number;

  @Column({ type: 'timestamp' })
  aberta_em: Date;

  @Column({ type: 'timestamp' })
  prazo_ate: Date;

  /** ABERTA | RESPONDIDA | ENCERRADA (EXPIRADA é calculada pelo prazo) */
  @Column({ type: 'varchar', length: 20, default: 'ABERTA' })
  status: string;

  @Column({ type: 'text', nullable: true })
  resposta: string | null;

  @Column({ type: 'timestamp', nullable: true })
  respondida_em: Date | null;

  /** ATENDIDA | NAO_ATENDIDA */
  @Column({ type: 'varchar', length: 20, nullable: true })
  resultado: string | null;

  @Column({ type: 'text', nullable: true })
  resultado_motivo: string | null;

  @Column({ type: 'timestamp', nullable: true })
  encerrada_em: Date | null;

  /** [{ em, horas, motivo, por }] */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  prorrogacoes: Array<{ em: string; horas: number; motivo: string; por: string | null }>;

  @Column({ type: 'varchar', nullable: true })
  aberta_por_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  aberta_por_nome: string | null;

  @Column({ type: 'varchar', nullable: true })
  encerrada_por_nome: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

/** Anexo da diligência — do licitante (resposta) ou do órgão (parecer técnico, e-mail). O arquivo fica no banco. */
@Entity('diligencias_licitante_anexos')
@Index('IDX_diligencias_anexos_diligencia', ['diligencia_id'])
export class DiligenciaAnexo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  diligencia_id: string;

  /** FORNECEDOR | ORGAO */
  @Column({ type: 'varchar', length: 12 })
  autor: string;

  @Column({ type: 'varchar', nullable: true })
  autor_nome: string | null;

  @Column({ type: 'varchar', length: 220 })
  arquivo_nome: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  arquivo_mime: string | null;

  @Column({ type: 'int' })
  arquivo_tamanho: number;

  @Column({ type: 'varchar', length: 64 })
  arquivo_sha256: string;

  @Column({ type: 'bytea', select: false })
  arquivo_conteudo: Buffer;

  @Column({ type: 'varchar', length: 300, nullable: true })
  descricao: string | null;

  @CreateDateColumn()
  created_at: Date;
}

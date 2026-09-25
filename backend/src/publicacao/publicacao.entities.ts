import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * RETIFICAÇÃO DO EDITAL (Lei 14.133/2021, art. 55 §1º — plano E7a item 4).
 * Uma linha por ato RETIFICAR_EDITAL: o que mudou, a nova versão do edital
 * (documentos_licitacao tipo EDITAL_RETIFICADO), a decisão "afeta a
 * formulação das propostas?" e, se afeta, o cronograma republicado.
 */
@Entity('retificacoes_edital')
@Index(['licitacao_id'])
export class RetificacaoEdital {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  /** 1, 2, 3... por licitação. */
  @Column({ type: 'int' })
  numero: number;

  @Column({ type: 'text' })
  motivo: string;

  /** Descrição do que mudou no edital. */
  @Column({ type: 'text' })
  alteracoes: string;

  @Column({ type: 'boolean' })
  afeta_propostas: boolean;

  /** Justificativa quando NÃO afeta (exceção do art. 55 §1º). */
  @Column({ type: 'text', nullable: true })
  justificativa_nao_afeta: string | null;

  @Column({ type: 'uuid', nullable: true })
  documento_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  documento_anterior_id: string | null;

  @Column({ type: 'int', nullable: true })
  versao_edital: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  hash_edital: string | null;

  /** Divulgação da retificação (início da recontagem do art. 55 quando afeta). */
  @Column({ type: 'timestamp without time zone' })
  data_divulgacao: Date;

  @Column({ type: 'jsonb', nullable: true })
  cronograma_anterior: Record<string, string | null> | null;

  @Column({ type: 'jsonb', nullable: true })
  cronograma_novo: Record<string, string | null> | null;

  /** Campos do cadastro da licitação alterados pela retificação { campo: { de, para } }. */
  @Column({ type: 'jsonb', nullable: true })
  campos_alterados: Record<string, { de: any; para: any }> | null;

  /** Impugnações acolhidas (altera_edital) atendidas por esta retificação. */
  @Column({ type: 'jsonb', nullable: true })
  impugnacao_ids: string[] | null;

  @Column({ type: 'int', default: 0 })
  propostas_notificadas: number;

  @Column({ type: 'varchar', length: 20 })
  ator_tipo: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  ator_id: string | null;

  @CreateDateColumn()
  created_at: Date;
}

export enum TipoExtincao {
  REVOGAR = 'REVOGAR',
  ANULAR = 'ANULAR',
}

export enum StatusExtincao {
  /** Prazo de manifestação dos interessados em curso / decorrido, aguardando o ato. */
  ABERTA = 'ABERTA',
  /** Revogação/anulação praticada. */
  CONCLUIDA = 'CONCLUIDA',
  /** A Administração desistiu (licitação segue). */
  CANCELADA = 'CANCELADA',
}

/**
 * INTENÇÃO DE REVOGAR/ANULAR (art. 71 §3º: "Nos casos de anulação e
 * revogação, deverá ser assegurada a prévia manifestação dos interessados").
 * Primeiro passo do ato em dois tempos: abre o prazo de manifestação e avisa os
 * licitantes; o REVOGAR/ANULAR só depois do prazo, com as manifestações.
 */
@Entity('extincoes_licitacao')
@Index(['licitacao_id', 'status'])
export class ExtincaoLicitacao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'varchar', length: 10 })
  tipo: TipoExtincao;

  @Column({ type: 'varchar', length: 12, default: StatusExtincao.ABERTA })
  status: StatusExtincao;

  @Column({ type: 'text' })
  motivo: string;

  @Column({ type: 'int' })
  prazo_dias_uteis: number;

  @Column({ type: 'timestamp' })
  aberta_em: Date;

  /** Fim do prazo de manifestação (23:59:59, Brasília, do N-ésimo dia útil). */
  @Column({ type: 'timestamp' })
  prazo_fim: Date;

  @Column({ type: 'int', default: 0 })
  licitantes_notificados: number;

  @Column({ type: 'timestamp', nullable: true })
  concluida_em: Date | null;

  @Column({ type: 'text', nullable: true })
  motivo_cancelamento: string | null;

  @Column({ type: 'varchar', length: 20 })
  ator_tipo: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  ator_id: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

/** Manifestação de um licitante no prazo da intenção de revogar/anular. */
@Entity('manifestacoes_extincao')
@Index(['extincao_id', 'fornecedor_id'], { unique: true })
export class ManifestacaoExtincao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  extincao_id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'uuid' })
  fornecedor_id: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  fornecedor_nome: string | null;

  @Column({ type: 'text' })
  texto: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum TipoDocumentoOrgao {
  /** Portaria de designação do agente de contratação e da equipe — uma por exercício, usada em todos os processos do ano. */
  PORTARIA_DESIGNACAO = 'PORTARIA_DESIGNACAO',
}

/**
 * DOCUMENTO DO ÓRGÃO com vigência (Entrega 1) — peça que não é de um
 * processo só. Hoje: a PORTARIA DE DESIGNAÇÃO (agente de contratação/
 * pregoeiro e equipe), anexada uma vez por exercício e REFERENCIADA pelos
 * processos (documentos_fase_interna.documento_orgao_id, peça DP) — sem
 * copiar o arquivo. Nova versão: a anterior fica inativa (`ativo = false`),
 * nunca é apagada. Todas as colunas com `type` explícito (synchronize).
 */
@Entity('documentos_orgao')
@Index(['orgao_id', 'tipo', 'exercicio'])
export class DocumentoOrgao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orgao_id: string;

  @Column({ type: 'varchar', length: 40 })
  tipo: TipoDocumentoOrgao;

  /** Ex.: "Portaria 012/2025". */
  @Column({ type: 'varchar', length: 120 })
  numero: string;

  @Column({ type: 'varchar', length: 255 })
  titulo: string;

  /** Exercício a que a portaria se aplica. */
  @Column({ type: 'int' })
  exercicio: number;

  /** Data que consta na peça (informada; nunca futura). */
  @Column({ type: 'timestamp' })
  data_documento: Date;

  @Column({ type: 'date' })
  vigencia_inicio: string;

  @Column({ type: 'date', nullable: true })
  vigencia_fim: string | null;

  /** Caminho lógico (pasta privada `fase-interna/<orgao>/…`). */
  @Column({ type: 'varchar', length: 500 })
  caminho_arquivo: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  nome_arquivo: string | null;

  @Column({ type: 'varchar', length: 64 })
  hash_arquivo: string;

  @Column({ type: 'bigint', nullable: true })
  tamanho_bytes: number | null;

  @Column({ type: 'int', nullable: true })
  total_paginas: number | null;

  @Column({ type: 'jsonb', nullable: true })
  signatarios_informados: Array<{ nome: string; cargo?: string | null }> | null;

  @Column({ type: 'text', nullable: true })
  observacao: string | null;

  @Column({ type: 'int', default: 1 })
  versao: number;

  /** Versão que esta substitui (a anterior fica ativo = false). */
  @Column({ type: 'uuid', nullable: true })
  substitui_documento_id: string | null;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @Column({ type: 'varchar', length: 64, nullable: true })
  criado_por_id: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

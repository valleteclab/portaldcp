/**
 * ============================================================================
 * ENTIDADE: PRÉ-OS DE PUBLICIDADE (proposta do fornecedor)
 * ============================================================================
 *
 * Contratos de agência de publicidade (Lei 12.232/2010) exigem aprovação
 * prévia POR ESCRITO das despesas (cláusulas 3.6/3.7). A pré-OS digitaliza
 * esse fluxo: a agência monta a proposta no portal do fornecedor
 * (itens SINAPRO com desconto, terceiros com honorário, mídia com desconto
 * de agência), envia ao órgão, o RESPONSÁVEL confere/ajusta (pode devolver
 * com motivo) e, ao aceitar, o sistema gera os itens no contrato para a
 * Requisição/OS seguir o fluxo normal de autorização do gestor.
 *
 * RASCUNHO → ENVIADA → (DEVOLVIDA → reenvio) | ACEITA → CONVERTIDA
 *
 * ============================================================================
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Contrato } from './contrato.entity';

export enum StatusPreOs {
  RASCUNHO = 'RASCUNHO',
  ENVIADA = 'ENVIADA',
  DEVOLVIDA = 'DEVOLVIDA',
  ACEITA = 'ACEITA',
  CONVERTIDA = 'CONVERTIDA',
}

/** Linha da pré-OS — mesmo shape aceito por gerarLinhasPublicidade */
export interface LinhaPreOs {
  tipo: 'SINAPRO' | 'TERCEIROS' | 'MIDIA';
  quantidade?: number;
  item_tabela_id?: string;
  base?: 'total' | 'criacao' | 'finalizacao';
  desconto_pct?: number;
  descricao?: string;
  custo?: number;
  honorario_pct?: number;
  valor_midia?: number;
  desconto_agencia_pct?: number;
  /** Preço unitário calculado no momento da montagem (exibição/registro) */
  preco_unit?: number;
}

@Entity('pre_os_publicidade')
@Index('IDX_pre_os_publicidade_contrato', ['contrato_id'])
export class PreOsPublicidade {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Contrato, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contrato_id' })
  contrato: Contrato;

  @Column()
  contrato_id: string;

  @Column()
  orgao_id: string;

  @Column()
  fornecedor_id: string;

  /** Numeração amigável por contrato: PRE-OS 001, 002... */
  @Column({ type: 'int' })
  sequencial: number;

  @Column()
  titulo: string;

  @Column({ type: 'text', nullable: true })
  justificativa: string | null;

  @Column({ type: 'jsonb' })
  linhas: LinhaPreOs[];

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_total_estimado: number;

  @Column({ type: 'enum', enum: StatusPreOs, default: StatusPreOs.RASCUNHO })
  status: StatusPreOs;

  /** Motivo da devolução pelo responsável (visível ao fornecedor) */
  @Column({ type: 'text', nullable: true })
  motivo_devolucao: string | null;

  @Column({ type: 'timestamp', nullable: true })
  enviada_em: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  respondida_em: Date | null;

  @Column({ type: 'varchar', nullable: true })
  respondida_por_nome: string | null;

  /** Ids dos ItemCronograma gerados no aceite (rastreabilidade) */
  @Column({ type: 'jsonb', nullable: true })
  itens_gerados_ids: string[] | null;

  /** Requisição/OS criada automaticamente no aceite (rascunho p/ o responsável completar) */
  @Column({ type: 'uuid', nullable: true })
  requisicao_id: string | null;

  /** PDF da aprovação prévia (cláusula 3.6) gerado no aceite */
  @Column({ type: 'varchar', nullable: true })
  pdf_url: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

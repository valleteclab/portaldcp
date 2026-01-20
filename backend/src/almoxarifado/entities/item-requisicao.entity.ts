/**
 * ============================================================================
 * ENTIDADE: ITEM DE REQUISIÇÃO
 * ============================================================================
 * 
 * Representa um item solicitado em uma requisição.
 * Pode estar vinculado a um ItemContrato (para controle de saldo).
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
  JoinColumn 
} from 'typeorm';
import { Requisicao } from './requisicao.entity';
import { ItemContrato } from './item-contrato.entity';

export enum StatusItemRequisicao {
  PENDENTE = 'PENDENTE',           // Aguardando processamento
  RESERVADO = 'RESERVADO',         // Saldo reservado no contrato
  ATENDIDO_PARCIAL = 'ATENDIDO_PARCIAL', // Parcialmente atendido
  ATENDIDO = 'ATENDIDO',           // Totalmente atendido
  CANCELADO = 'CANCELADO',         // Cancelado
  SEM_ESTOQUE = 'SEM_ESTOQUE',     // Sem estoque disponível
}

@Entity('itens_requisicao')
export class ItemRequisicao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ============================================================================
  // RELACIONAMENTO COM REQUISIÇÃO
  // ============================================================================

  @ManyToOne(() => Requisicao, requisicao => requisicao.itens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requisicao_id' })
  requisicao: Requisicao;

  @Column()
  requisicao_id: string;

  // ============================================================================
  // RELACIONAMENTO COM ITEM DO CONTRATO
  // ============================================================================

  /**
   * Item do contrato que será consumido
   * Obrigatório quando a requisição está vinculada a um contrato
   */
  @ManyToOne(() => ItemContrato, { nullable: true })
  @JoinColumn({ name: 'item_contrato_id' })
  item_contrato: ItemContrato;

  @Column({ nullable: true })
  item_contrato_id: string;

  // ============================================================================
  // IDENTIFICAÇÃO DO ITEM
  // ============================================================================

  @Column({ type: 'int' })
  numero_item: number;

  @Column({ nullable: true })
  codigo_catalogo: string;

  @Column()
  descricao: string;

  @Column({ nullable: true })
  unidade_medida: string;

  // ============================================================================
  // QUANTIDADES
  // ============================================================================

  /**
   * Quantidade solicitada pelo setor
   */
  @Column({ type: 'decimal', precision: 15, scale: 4 })
  quantidade_solicitada: number;

  /**
   * Quantidade autorizada pelo gestor (pode ser menor que solicitada)
   */
  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  quantidade_autorizada: number;

  /**
   * Quantidade já atendida (recebida)
   */
  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  quantidade_atendida: number;

  // ============================================================================
  // VALORES
  // ============================================================================

  /**
   * Valor unitário (do contrato ou estimado)
   */
  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  valor_unitario: number;

  /**
   * Valor total estimado (quantidade_solicitada * valor_unitario)
   */
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_total_estimado: number;

  // ============================================================================
  // STATUS
  // ============================================================================

  @Column({
    type: 'enum',
    enum: StatusItemRequisicao,
    default: StatusItemRequisicao.PENDENTE
  })
  status: StatusItemRequisicao;

  // ============================================================================
  // OBSERVAÇÕES
  // ============================================================================

  @Column({ type: 'text', nullable: true })
  observacoes: string;

  @Column({ type: 'text', nullable: true })
  motivo_ajuste: string; // Justificativa se quantidade_autorizada != quantidade_solicitada

  // ============================================================================
  // AUDITORIA
  // ============================================================================

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Quantidade pendente de atendimento
   */
  getQuantidadePendente(): number {
    const autorizada = this.quantidade_autorizada ?? this.quantidade_solicitada;
    return Number(autorizada) - Number(this.quantidade_atendida);
  }

  /**
   * Verifica se o item foi totalmente atendido
   */
  isAtendido(): boolean {
    return this.getQuantidadePendente() <= 0;
  }
}

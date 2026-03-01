/**
 * Histórico de movimentação da Requisição (Ordem de Serviço)
 * Timeline como "Movimento do Pedido"
 */

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Requisicao } from './requisicao.entity';

export enum TipoAcaoRequisicao {
  PEDIDO_CRIADO = 'PEDIDO_CRIADO',
  PEDIDO_AUTORIZADO = 'PEDIDO_AUTORIZADO',
  ENVIADA_APROVACAO = 'ENVIADA_APROVACAO',
  NEGADA = 'NEGADA',
  DEVOLVIDA = 'DEVOLVIDA',
  CANCELADA = 'CANCELADA',
}

@Entity('historico_requisicoes')
export class HistoricoRequisicao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Requisicao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requisicao_id' })
  requisicao: Requisicao;

  @Column()
  requisicao_id: string;

  @Column({ type: 'varchar', length: 50 })
  tipo_acao: string;

  @Column({ type: 'text' })
  descricao: string;

  @Column({ type: 'text', nullable: true })
  detalhes: string | null;

  @Column({ type: 'varchar', nullable: true })
  usuario_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  usuario_nome: string | null;

  @Column({ type: 'timestamp', nullable: true })
  data_evento: Date | null;

  @CreateDateColumn()
  created_at: Date;
}

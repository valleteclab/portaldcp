import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Lance da DISPENSA ELETRÔNICA (fase de lances leve, espelhando a IN SEGES
 * 67/2021): após o fim do acolhimento de propostas, o órgão pode abrir uma
 * janela de lances em que cada fornecedor reduz o próprio valor por item.
 * Independente do motor de disputa do pregão (disputa-v2) de propósito —
 * a dispensa não usa sala de sessão, timer por item nem prorrogações.
 */
@Entity('dispensa_lances')
@Index(['licitacao_id', 'item_licitacao_id'])
export class DispensaLance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'uuid' })
  item_licitacao_id: string;

  @Column({ type: 'uuid' })
  fornecedor_id: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  valor_unitario: number;

  @CreateDateColumn()
  created_at: Date;
}

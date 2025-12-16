import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Proposta } from './proposta.entity';
import { ItemLicitacao } from '../../itens/entities/item-licitacao.entity';

@Entity('proposta_itens')
export class PropostaItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Relacionamentos
  @ManyToOne(() => Proposta, (proposta) => proposta.itens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'proposta_id' })
  proposta: Proposta;

  @Column()
  proposta_id: string;

  @ManyToOne(() => ItemLicitacao)
  @JoinColumn({ name: 'item_licitacao_id' })
  item_licitacao: ItemLicitacao;

  @Column()
  item_licitacao_id: string;

  // Valores Propostos
  @Column({ type: 'decimal', precision: 15, scale: 4 })
  valor_unitario: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_total: number;

  // Marca/Modelo oferecido
  @Column({ nullable: true })
  marca: string;

  @Column({ nullable: true })
  modelo: string;

  @Column({ nullable: true })
  fabricante: string;

  // Descrição complementar
  @Column({ type: 'text', nullable: true })
  descricao_complementar: string;

  // Prazo de entrega específico do item (em dias)
  @Column({ type: 'int', nullable: true })
  prazo_entrega_dias: number;

  // Garantia (em meses)
  @Column({ type: 'int', nullable: true })
  garantia_meses: number;

  @CreateDateColumn()
  created_at: Date;
}

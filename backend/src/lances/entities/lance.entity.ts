import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';
import { ItemLicitacao } from '../../itens/entities/item-licitacao.entity';

@Entity('lances')
export class Lance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor: number;

  // Fornecedor que enviou o lance
  @Column({ nullable: true })
  fornecedor_id: string;

  @Column({ nullable: true })
  fornecedor_nome: string;

  // Identificador legado para compatibilidade
  @Column({ nullable: true })
  fornecedor_identificador: string;

  @Column({ nullable: true })
  ip_origem: string;

  @Column({ default: false })
  cancelado: boolean;

  /** Após 15s o fornecedor não cancela direto; fica pendente até o pregoeiro. */
  @Column({ default: false })
  solicitacao_cancelamento_pendente: boolean;

  @Column({ type: 'timestamp', nullable: true })
  solicitacao_cancelamento_em: Date;

  @Column({ type: 'text', nullable: true })
  solicitacao_cancelamento_motivo: string;

  @CreateDateColumn()
  created_at: Date;

  // Relacionamento com Licitação
  @ManyToOne(() => Licitacao)
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column()
  licitacao_id: string;

  // Relacionamento com Item (para lances por item)
  @ManyToOne(() => ItemLicitacao, { nullable: true })
  @JoinColumn({ name: 'item_id' })
  item: ItemLicitacao;

  @Column({ nullable: true })
  item_id: string;
}

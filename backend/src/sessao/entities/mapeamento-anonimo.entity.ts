import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { SessaoDisputa } from './sessao-disputa.entity';

/**
 * Mapeamento de Anonimização por Sessão
 * 
 * Cada fornecedor recebe um código anônimo único por sessão.
 * Ex: "Fornecedor A", "Fornecedor B", etc.
 * 
 * O mapeamento é criado na primeira vez que o fornecedor aparece na sessão
 * e mantido até o fim da sessão para consistência.
 */
@Entity('mapeamento_anonimo')
@Unique(['sessao_id', 'fornecedor_id'])
export class MapeamentoAnonimo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SessaoDisputa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessao_id' })
  sessao: SessaoDisputa;

  @Column()
  sessao_id: string;

  @Column()
  fornecedor_id: string;

  // Código anônimo: "Fornecedor A", "Fornecedor B", etc.
  @Column({ length: 50 })
  codigo_anonimo: string;

  // Índice numérico para ordenação (1, 2, 3...)
  @Column({ type: 'int' })
  indice: number;

  @CreateDateColumn()
  created_at: Date;
}

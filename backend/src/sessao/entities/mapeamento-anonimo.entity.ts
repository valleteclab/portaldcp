import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique, Index } from 'typeorm';
import { SessaoDisputa } from './sessao-disputa.entity';

/**
 * Mapeamento de Anonimização por Sessão
 * 
 * Cada fornecedor recebe um código anônimo único por sessão.
 * Ex: "Fornecedor A", "Fornecedor B", etc.
 * 
 * O mapeamento é criado na primeira vez que o fornecedor aparece na sessão
 * e mantido até o fim da sessão para consistência.
 *
 * E2: atribuição ATÔMICA (AnonimizacaoService — advisory lock por sessão) e
 * código único por sessão: índice único (sessao_id, indice) criado pela
 * migração de dados depois de renumerar as duplicatas antigas (por isso
 * `synchronize: false`).
 */
@Entity('mapeamento_anonimo')
@Unique(['sessao_id', 'fornecedor_id'])
// UNIQUE (sessao_id, indice) — ver disputa-v2/migracao-lances.ts
@Index('UQ_mapeamento_anonimo_sessao_indice', { synchronize: false })
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

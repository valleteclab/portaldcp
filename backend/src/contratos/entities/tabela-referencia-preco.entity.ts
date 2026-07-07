/**
 * ============================================================================
 * ENTIDADE: TABELA DE REFERÊNCIA DE PREÇOS (catálogo por órgão)
 * ============================================================================
 *
 * Representa uma edição de tabela referencial de preços de serviços — o caso
 * principal é a tabela SINAPRO (Sindicato das Agências de Propaganda), usada
 * em contratos de agência de publicidade (Lei 12.232/2010).
 *
 * A tabela é importada UMA vez por órgão (via PDF ou CSV) e reaproveitada em
 * todos os contratos de publicidade daquele órgão. Cada item traz os valores
 * de Criação/Finalização/Total; o desconto contratual (ex.: 34%) é aplicado
 * no momento em que o item é puxado para a lista de itens do contrato.
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
  OneToMany,
} from 'typeorm';
import { Orgao } from '../../orgaos/entities/orgao.entity';
import { ItemTabelaReferencia } from './item-tabela-referencia.entity';

@Entity('tabelas_referencia_preco')
export class TabelaReferenciaPreco {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Orgao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column()
  orgao_id: string;

  /** Nome amigável. Ex.: "SINAPRO-BA — Tabela Referencial de Custos Internos" */
  @Column()
  nome: string;

  /** Fonte/origem da tabela. Ex.: "SINAPRO" */
  @Column({ type: 'varchar', nullable: true })
  fonte: string | null;

  /** UF da tabela quando aplicável. Ex.: "BA" */
  @Column({ type: 'varchar', length: 2, nullable: true })
  uf: string | null;

  /** Edição/vigência textual. Ex.: "2025/2026" */
  @Column({ type: 'varchar', nullable: true })
  edicao: string | null;

  @Column({ type: 'date', nullable: true })
  vigencia_inicio: Date | null;

  @Column({ type: 'date', nullable: true })
  vigencia_fim: Date | null;

  /** Tabela ativa/disponível para uso em contratos */
  @Column({ default: true })
  ativa: boolean;

  @Column({ type: 'text', nullable: true })
  observacoes: string | null;

  @Column({ type: 'varchar', nullable: true })
  usuario_cadastro_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  usuario_cadastro_nome: string | null;

  @OneToMany(() => ItemTabelaReferencia, (item) => item.tabela)
  itens: ItemTabelaReferencia[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

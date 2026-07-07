/**
 * ============================================================================
 * ENTIDADE: ITEM DA TABELA DE REFERÊNCIA DE PREÇOS
 * ============================================================================
 *
 * Cada linha de uma tabela referencial (ex.: SINAPRO). Traz os valores de
 * Criação, Finalização e Total conforme a estrutura da tabela do sindicato.
 * Itens "sob orçamento específico" ficam com todos os valores nulos.
 *
 * O preço efetivamente contratado é derivado destes valores aplicando o
 * desconto do contrato (ex.: valor_total - 34%) no momento em que o item é
 * incluído na lista de itens do contrato (ItemCronograma).
 *
 * ============================================================================
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { TabelaReferenciaPreco } from './tabela-referencia-preco.entity';

@Entity('itens_tabela_referencia')
@Index('IDX_itens_tabela_referencia_tabela', ['tabela_id'])
export class ItemTabelaReferencia {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => TabelaReferenciaPreco, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tabela_id' })
  tabela: TabelaReferenciaPreco;

  @Column()
  tabela_id: string;

  /** Código da categoria/capítulo. Ex.: "3" */
  @Column({ type: 'varchar', nullable: true })
  categoria_codigo: string | null;

  /** Nome da categoria/capítulo. Ex.: "COMUNICAÇÃO EXTERIOR" */
  @Column({ type: 'varchar', nullable: true })
  categoria_nome: string | null;

  /** Código do item na tabela. Ex.: "3p" */
  @Column({ type: 'varchar', nullable: true })
  codigo: string | null;

  @Column({ type: 'text' })
  descricao: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_criacao: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_finalizacao: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_total: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_reformulacao: number | null;

  /** Unidade quando a tabela especifica (ex.: "por lâmina", "por mês"). Default SERVICO. */
  @Column({ type: 'varchar', nullable: true })
  unidade: string | null;

  /** true quando o item é "mediante orçamento específico" (sem valor fixo) */
  @Column({ default: false })
  sob_orcamento: boolean;

  @Column({ type: 'text', nullable: true })
  observacoes: string | null;

  /** Ordem de exibição preservando a sequência da tabela original */
  @Column({ type: 'int', default: 0 })
  ordem: number;

  @CreateDateColumn()
  created_at: Date;
}

/**
 * ============================================================================
 * ENTIDADE: ITEM DE CONTRATO
 * ============================================================================
 * 
 * Controla os saldos de cada item do contrato.
 * 
 * Fluxo de Saldos:
 * - quantidade_contratada: Total contratado (fixo após criação)
 * - quantidade_empenhada: Reservado por requisições aprovadas (aguardando entrega)
 * - quantidade_entregue: Efetivamente recebido/entregue
 * - saldo_disponivel: Calculado = contratada - empenhada - entregue
 * 
 * Fundamentação Legal - Lei 14.133/2021:
 * Art. 106 - "O contrato deverá ser executado fielmente pelas partes, 
 * de acordo com as cláusulas avençadas e as normas desta Lei"
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
  OneToMany 
} from 'typeorm';
import { Contrato } from '../../contratos/entities/contrato.entity';

export enum UnidadeMedidaContrato {
  UNIDADE = 'UNIDADE',
  PECA = 'PECA',
  CAIXA = 'CAIXA',
  PACOTE = 'PACOTE',
  METRO = 'METRO',
  METRO_QUADRADO = 'METRO_QUADRADO',
  METRO_CUBICO = 'METRO_CUBICO',
  LITRO = 'LITRO',
  QUILOGRAMA = 'QUILOGRAMA',
  TONELADA = 'TONELADA',
  HORA = 'HORA',
  DIARIA = 'DIARIA',
  MES = 'MES',
  ANO = 'ANO',
  SERVICO = 'SERVICO',
  GLOBAL = 'GLOBAL',
}

@Entity('itens_contrato')
export class ItemContrato {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ============================================================================
  // RELACIONAMENTO COM CONTRATO
  // ============================================================================

  @ManyToOne(() => Contrato, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contrato_id' })
  contrato: Contrato;

  @Column()
  contrato_id: string;

  // ============================================================================
  // IDENTIFICAÇÃO DO ITEM
  // ============================================================================

  @Column({ type: 'int' })
  numero_item: number;

  @Column({ type: 'varchar', nullable: true })
  codigo_catalogo: string; // CATMAT/CATSER

  @Column({ type: 'varchar', nullable: true })
  codigo_catalogo_proprio: string; // Código do catálogo interno do órgão

  @Column({ type: 'int', nullable: true })
  lote_numero: number; // Número do lote da licitação de origem

  @Column({ type: 'varchar', nullable: true })
  lote_descricao: string; // Descrição do lote

  @Column()
  descricao: string;

  @Column({ type: 'text', nullable: true })
  descricao_detalhada: string;

  @Column({ type: 'varchar', nullable: true })
  marca: string;

  @Column({ type: 'varchar', nullable: true })
  modelo: string;

  @Column({
    type: 'enum',
    enum: UnidadeMedidaContrato,
    default: UnidadeMedidaContrato.UNIDADE
  })
  unidade_medida: UnidadeMedidaContrato;

  // ============================================================================
  // VALORES
  // ============================================================================

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  valor_unitario: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_total: number; // valor_unitario * quantidade_contratada

  // ============================================================================
  // CONTROLE DE SALDOS
  // ============================================================================

  /**
   * Quantidade total contratada (não muda após criação)
   */
  @Column({ type: 'decimal', precision: 15, scale: 4 })
  quantidade_contratada: number;

  /**
   * Quantidade reservada por requisições/ordens aprovadas
   * Aumenta quando: Requisição é aprovada
   * Diminui quando: Requisição é cancelada/negada OU recebimento é feito
   */
  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  quantidade_empenhada: number;

  /**
   * Quantidade efetivamente entregue/recebida
   * Aumenta quando: Recebimento definitivo é realizado
   */
  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  quantidade_entregue: number;

  /**
   * Saldo disponível para novas requisições
   * Calculado: quantidade_contratada - quantidade_empenhada - quantidade_entregue
   * 
   * IMPORTANTE: Este campo é atualizado automaticamente pelo service
   */
  @Column({ type: 'decimal', precision: 15, scale: 4 })
  saldo_disponivel: number;

  // ============================================================================
  // REFERÊNCIA À LICITAÇÃO
  // ============================================================================

  @Column({ type: 'varchar', nullable: true })
  item_licitacao_id: string; // FK para ItemLicitacao (origem do item)

  // ============================================================================
  // OBSERVAÇÕES
  // ============================================================================

  @Column({ type: 'text', nullable: true })
  observacoes: string;

  // ============================================================================
  // AUDITORIA
  // ============================================================================

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // ============================================================================
  // HELPERS (não persistidos)
  // ============================================================================

  /**
   * Calcula o saldo disponível
   * saldo = contratada - empenhada - entregue
   */
  calcularSaldoDisponivel(): number {
    return Number(this.quantidade_contratada) - 
           Number(this.quantidade_empenhada) - 
           Number(this.quantidade_entregue);
  }

  /**
   * Verifica se há saldo suficiente para uma quantidade
   */
  temSaldoSuficiente(quantidade: number): boolean {
    return this.calcularSaldoDisponivel() >= quantidade;
  }

  /**
   * Percentual de execução do item
   */
  getPercentualExecucao(): number {
    if (Number(this.quantidade_contratada) === 0) return 0;
    return (Number(this.quantidade_entregue) / Number(this.quantidade_contratada)) * 100;
  }
}

/**
 * ============================================================================
 * ENTIDADE: ORDEM DE FORNECIMENTO/SERVIÇO
 * ============================================================================
 * 
 * Representa a ordem enviada ao fornecedor para entrega de materiais/serviços.
 * Gerada a partir de uma requisição autorizada.
 * 
 * Fluxo:
 * RASCUNHO → EMITIDA → ENVIADA → EM_ATENDIMENTO → ATENDIDA_PARCIAL → ATENDIDA
 *                              ↘ CANCELADA
 * 
 * Fundamentação Legal - Lei 14.133/2021:
 * Art. 117 - "A execução do contrato deverá ser acompanhada e fiscalizada"
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
import { Orgao } from '../../orgaos/entities/orgao.entity';
import { Contrato } from '../../contratos/entities/contrato.entity';
import { Fornecedor } from '../../fornecedores/entities/fornecedor.entity';
import { Requisicao } from './requisicao.entity';

export enum StatusOrdemFornecimento {
  RASCUNHO = 'RASCUNHO',
  EMITIDA = 'EMITIDA',                    // Gerada, aguardando envio
  ENVIADA = 'ENVIADA',                    // Enviada ao fornecedor
  EM_ATENDIMENTO = 'EM_ATENDIMENTO',      // Fornecedor informou que está atendendo
  ATENDIDA_PARCIAL = 'ATENDIDA_PARCIAL',  // Parcialmente entregue
  ATENDIDA = 'ATENDIDA',                  // Totalmente entregue
  CANCELADA = 'CANCELADA',                // Cancelada
}

export enum TipoOrdem {
  FORNECIMENTO = 'FORNECIMENTO',  // Ordem de Fornecimento (materiais)
  SERVICO = 'SERVICO',            // Ordem de Serviço
}

@Entity('ordens_fornecimento')
export class OrdemFornecimento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ============================================================================
  // RELACIONAMENTOS
  // ============================================================================

  @ManyToOne(() => Orgao)
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column()
  orgao_id: string;

  @ManyToOne(() => Contrato)
  @JoinColumn({ name: 'contrato_id' })
  contrato: Contrato;

  @Column()
  contrato_id: string;

  @ManyToOne(() => Fornecedor)
  @JoinColumn({ name: 'fornecedor_id' })
  fornecedor: Fornecedor;

  @Column()
  fornecedor_id: string;

  /**
   * Requisição que originou esta ordem
   */
  @ManyToOne(() => Requisicao, { nullable: true })
  @JoinColumn({ name: 'requisicao_id' })
  requisicao: Requisicao;

  @Column({ type: 'varchar', nullable: true })
  requisicao_id: string | null;

  // ============================================================================
  // IDENTIFICAÇÃO
  // ============================================================================

  @Column()
  numero: string; // Ex: "OF-001/2026" ou "OS-001/2026"

  @Column({ type: 'int' })
  ano: number;

  @Column({ type: 'int' })
  sequencial: number;

  @Column({
    type: 'enum',
    enum: TipoOrdem,
    default: TipoOrdem.FORNECIMENTO
  })
  tipo: TipoOrdem;

  @Column({
    type: 'enum',
    enum: StatusOrdemFornecimento,
    default: StatusOrdemFornecimento.RASCUNHO
  })
  status: StatusOrdemFornecimento;

  // ============================================================================
  // DADOS DA ORDEM
  // ============================================================================

  @Column({ type: 'text', nullable: true })
  descricao: string | null;

  @Column({ type: 'text', nullable: true })
  local_entrega: string | null;

  @Column({ type: 'date' })
  data_emissao: Date;

  @Column({ type: 'date', nullable: true })
  data_entrega_prevista: Date | null;

  @Column({ type: 'date', nullable: true })
  data_entrega_realizada: Date | null;

  @Column({ type: 'int', nullable: true })
  prazo_entrega_dias: number | null; // Prazo em dias úteis

  // ============================================================================
  // VALORES
  // ============================================================================

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_total: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_entregue: number;

  // ============================================================================
  // ITENS (armazenado como JSON para simplicidade)
  // ============================================================================

  @Column({ type: 'jsonb', default: [] })
  itens: {
    item_contrato_id: string;
    numero_item: number;
    descricao: string;
    unidade_medida: string;
    tipo_item?: string;
    quantidade: number;
    quantidade_entregue: number;
    valor_unitario: number;
    valor_total: number;
  }[];

  // ============================================================================
  // ENVIO
  // ============================================================================

  @Column({ type: 'timestamp', nullable: true })
  data_envio: Date | null;

  @Column({ type: 'varchar', nullable: true })
  email_fornecedor: string | null;

  @Column({ type: 'text', nullable: true })
  observacoes_envio: string | null;

  @Column({ type: 'varchar', nullable: true })
  caminho_pdf: string | null; // Caminho do PDF gerado

  // ============================================================================
  // RESPONSÁVEIS
  // ============================================================================

  @Column()
  usuario_emitente_id: string;

  @Column()
  usuario_emitente_nome: string;

  @Column({ type: 'varchar', nullable: true })
  usuario_fiscal_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  usuario_fiscal_nome: string | null;

  // ============================================================================
  // CANCELAMENTO
  // ============================================================================

  @Column({ type: 'timestamp', nullable: true })
  data_cancelamento: Date | null;

  @Column({ type: 'text', nullable: true })
  motivo_cancelamento: string | null;

  @Column({ type: 'varchar', nullable: true })
  usuario_cancelamento_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  usuario_cancelamento_nome: string | null;

  @Column({ type: 'boolean', default: false })
  fornecedor_notificado_cancelamento: boolean;

  // ============================================================================
  // ACEITE DO FORNECEDOR
  // ============================================================================

  @Column({ type: 'timestamp', nullable: true })
  data_visualizacao_fornecedor: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  data_aceite_fornecedor: Date | null;

  @Column({ type: 'text', nullable: true })
  observacao_fornecedor: string | null;

  // ============================================================================
  // OBSERVAÇÕES
  // ============================================================================

  @Column({ type: 'text', nullable: true })
  observacoes: string | null;

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
   * Calcula percentual de atendimento
   */
  getPercentualAtendimento(): number {
    if (Number(this.valor_total) === 0) return 0;
    return (Number(this.valor_entregue) / Number(this.valor_total)) * 100;
  }

  /**
   * Verifica se a ordem está totalmente atendida
   */
  isAtendida(): boolean {
    return this.itens.every(item => item.quantidade_entregue >= item.quantidade);
  }
}

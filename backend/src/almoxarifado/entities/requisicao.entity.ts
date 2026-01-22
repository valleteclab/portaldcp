/**
 * ============================================================================
 * ENTIDADE: REQUISIÇÃO INTERNA
 * ============================================================================
 * 
 * Representa uma solicitação de materiais/serviços de um setor interno.
 * 
 * Fluxo de Status:
 * RASCUNHO → AGUARDANDO_AUTORIZACAO → AUTORIZADA → ORDEM_GERADA → ATENDIDA
 *                                   ↘ NEGADA
 *                                   ↘ CANCELADA
 * 
 * Controle de Saldo:
 * - Ao AUTORIZAR: Reserva saldo do contrato (quantidade_empenhada += quantidade)
 * - Ao NEGAR/CANCELAR: Libera saldo (quantidade_empenhada -= quantidade)
 * - Ao RECEBER: Baixa definitiva (quantidade_entregue += quantidade, empenhada -= quantidade)
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
import { ItemRequisicao } from './item-requisicao.entity';

export enum StatusRequisicao {
  RASCUNHO = 'RASCUNHO',                           // Ainda não enviada para aprovação
  AGUARDANDO_AUTORIZACAO = 'AGUARDANDO_AUTORIZACAO', // Aguardando aprovação do gestor
  AUTORIZADA = 'AUTORIZADA',                        // Aprovada - saldo reservado
  NEGADA = 'NEGADA',                                // Negada - saldo liberado (se tinha reserva)
  CANCELADA = 'CANCELADA',                          // Cancelada pelo solicitante
  ORDEM_GERADA = 'ORDEM_GERADA',                    // Ordem de fornecimento gerada
  ATENDIDA_PARCIAL = 'ATENDIDA_PARCIAL',            // Parcialmente recebida
  ATENDIDA = 'ATENDIDA',                            // Totalmente recebida
}

export enum PrioridadeRequisicao {
  BAIXA = 'BAIXA',
  NORMAL = 'NORMAL',
  ALTA = 'ALTA',
  URGENTE = 'URGENTE',
}

export enum TipoRequisicao {
  MATERIAL = 'MATERIAL',     // Requisição de materiais de consumo
  SERVICO = 'SERVICO',       // Requisição de serviços
  PERMANENTE = 'PERMANENTE', // Requisição de bens permanentes
}

@Entity('requisicoes')
export class Requisicao {
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

  /**
   * Contrato vinculado (obrigatório para requisições que consomem contrato)
   * Se não tiver contrato, é requisição de estoque existente
   */
  @ManyToOne(() => Contrato, { nullable: true })
  @JoinColumn({ name: 'contrato_id' })
  contrato: Contrato;

  @Column({ type: 'varchar', nullable: true })
  contrato_id: string | null;

  /**
   * Itens da requisição
   */
  @OneToMany(() => ItemRequisicao, item => item.requisicao, { cascade: true })
  itens: ItemRequisicao[];

  // ============================================================================
  // IDENTIFICAÇÃO
  // ============================================================================

  @Column()
  numero: string; // Ex: "REQ-001/2026"

  @Column({ type: 'int' })
  ano: number;

  @Column({ type: 'int' })
  sequencial: number;

  @Column({
    type: 'enum',
    enum: TipoRequisicao,
    default: TipoRequisicao.MATERIAL
  })
  tipo: TipoRequisicao;

  // ============================================================================
  // SETOR SOLICITANTE
  // ============================================================================

  @Column()
  setor_solicitante: string; // Nome do setor

  @Column({ type: 'varchar', nullable: true })
  codigo_setor: string | null; // Código do centro de custo

  @Column({ type: 'varchar', nullable: true })
  local_entrega: string | null; // Onde entregar os materiais

  // ============================================================================
  // SOLICITAÇÃO
  // ============================================================================

  @Column({ type: 'text' })
  justificativa: string;

  @Column({
    type: 'enum',
    enum: PrioridadeRequisicao,
    default: PrioridadeRequisicao.NORMAL
  })
  prioridade: PrioridadeRequisicao;

  @Column({ type: 'date', nullable: true })
  data_necessidade: Date | null; // Data em que precisa do material

  // ============================================================================
  // SOLICITANTE
  // ============================================================================

  @Column()
  usuario_solicitante_id: string;

  @Column()
  usuario_solicitante_nome: string;

  @Column({ type: 'varchar', nullable: true })
  usuario_solicitante_email: string | null;

  @Column({ type: 'timestamp' })
  data_solicitacao: Date;

  // ============================================================================
  // AUTORIZAÇÃO
  // ============================================================================

  @Column({
    type: 'enum',
    enum: StatusRequisicao,
    default: StatusRequisicao.RASCUNHO
  })
  status: StatusRequisicao;

  @Column({ type: 'varchar', nullable: true })
  usuario_autorizador_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  usuario_autorizador_nome: string | null;

  @Column({ type: 'timestamp', nullable: true })
  data_autorizacao: Date | null;

  @Column({ type: 'text', nullable: true })
  observacao_autorizador: string | null; // Justificativa em caso de negativa

  @Column({ 
    type: 'enum', 
    enum: StatusRequisicao, 
    nullable: true 
  })
  status_anterior_cancelamento: StatusRequisicao | null; // Status antes de ser cancelada (para reativação)

  // ============================================================================
  // VALORES (calculados a partir dos itens)
  // ============================================================================

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_total_estimado: number;

  // ============================================================================
  // RASTREAMENTO
  // ============================================================================

  /**
   * Indica se os saldos já foram reservados no contrato
   * True quando status mudou para AUTORIZADA
   * Usado para evitar dupla reserva/liberação
   */
  @Column({ default: false })
  saldo_reservado: boolean;

  @Column({ type: 'varchar', nullable: true })
  ordem_fornecimento_id: string | null; // FK para OrdemFornecimento quando gerada

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
}

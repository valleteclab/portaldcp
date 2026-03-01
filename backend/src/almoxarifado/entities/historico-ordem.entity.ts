/**
 * ============================================================================
 * ENTIDADE: HISTÓRICO DE ORDEM DE FORNECIMENTO
 * ============================================================================
 * 
 * Registra todas as movimentações/ações realizadas em uma ordem de fornecimento.
 * Permite rastrear todo o ciclo de vida da ordem.
 * 
 * ============================================================================
 */

import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  CreateDateColumn, 
  ManyToOne, 
  JoinColumn 
} from 'typeorm';
import { OrdemFornecimento } from './ordem-fornecimento.entity';

export enum TipoAcaoOrdem {
  // Ciclo de vida (timeline como "Movimento do Pedido")
  PEDIDO_CRIADO = 'PEDIDO_CRIADO',
  PEDIDO_AUTORIZADO = 'PEDIDO_AUTORIZADO',
  CRIADA = 'CRIADA',
  EDITADA = 'EDITADA',
  EMITIDA = 'EMITIDA',
  ENVIADA = 'ENVIADA',
  REENVIADA = 'REENVIADA',
  CANCELADA = 'CANCELADA',
  REATIVADA = 'REATIVADA',
  
  // Fornecedor
  VISUALIZADA_FORNECEDOR = 'VISUALIZADA_FORNECEDOR',
  ACEITA_FORNECEDOR = 'ACEITA_FORNECEDOR',
  RECUSADA_FORNECEDOR = 'RECUSADA_FORNECEDOR',
  
  // Entrega
  ENTREGA_REGISTRADA = 'ENTREGA_REGISTRADA',
  ENTREGA_PARCIAL = 'ENTREGA_PARCIAL',
  ENTREGA_COMPLETA = 'ENTREGA_COMPLETA',
  ENTREGA_ESTORNADA = 'ENTREGA_ESTORNADA',
  
  // PDF
  PDF_GERADO = 'PDF_GERADO',
  PDF_BAIXADO = 'PDF_BAIXADO',
  
  // Notificações
  NOTIFICACAO_ENVIADA = 'NOTIFICACAO_ENVIADA',
  EMAIL_ENVIADO = 'EMAIL_ENVIADO',
  
  // Outros
  OBSERVACAO_ADICIONADA = 'OBSERVACAO_ADICIONADA',
  ITEM_ALTERADO = 'ITEM_ALTERADO',
}

@Entity('historico_ordens_fornecimento')
export class HistoricoOrdemFornecimento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ============================================================================
  // RELACIONAMENTO
  // ============================================================================

  @ManyToOne(() => OrdemFornecimento, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ordem_fornecimento_id' })
  ordem_fornecimento: OrdemFornecimento;

  @Column()
  ordem_fornecimento_id: string;

  // ============================================================================
  // DADOS DA AÇÃO
  // ============================================================================

  @Column({
    type: 'enum',
    enum: TipoAcaoOrdem
  })
  tipo_acao: TipoAcaoOrdem;

  @Column({ type: 'text' })
  descricao: string;

  @Column({ type: 'text', nullable: true })
  detalhes: string | null; // JSON com detalhes adicionais

  @Column({ type: 'varchar', nullable: true })
  status_anterior: string | null;

  @Column({ type: 'varchar', nullable: true })
  status_novo: string | null;

  // ============================================================================
  // USUÁRIO QUE REALIZOU A AÇÃO
  // ============================================================================

  @Column({ type: 'varchar', nullable: true })
  usuario_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  usuario_nome: string | null;

  @Column({ type: 'varchar', nullable: true })
  usuario_tipo: string | null; // 'orgao', 'fornecedor', 'sistema'

  // ============================================================================
  // METADADOS
  // ============================================================================

  @Column({ type: 'varchar', nullable: true })
  ip_address: string | null;

  @Column({ type: 'varchar', nullable: true })
  user_agent: string | null;

  // ============================================================================
  // AUDITORIA
  // ============================================================================

  @CreateDateColumn()
  created_at: Date;

  /** Data do evento (para eventos retroativos, ex: PEDIDO_CRIADO usa data da requisição) */
  @Column({ type: 'timestamp', nullable: true })
  data_evento: Date | null;
}

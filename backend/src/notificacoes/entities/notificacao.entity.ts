/**
 * ============================================================================
 * ENTIDADE: NOTIFICAÇÃO
 * ============================================================================
 * 
 * Armazena notificações do sistema para usuários.
 * As notificações podem ser:
 * - Apenas no sistema (in-app)
 * - Email + sistema
 * 
 * Tipos de notificação:
 * - REQUISICAO_CRIADA: Nova requisição aguardando aprovação
 * - REQUISICAO_APROVADA: Requisição foi aprovada
 * - REQUISICAO_NEGADA: Requisição foi negada
 * - ORDEM_ENVIADA: Ordem de fornecimento enviada
 * - RECEBIMENTO_PENDENTE: Material recebido aguardando conferência
 * - etc.
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
  Index
} from 'typeorm';
import { Orgao } from '../../orgaos/entities/orgao.entity';

export enum TipoNotificacao {
  // Requisições
  REQUISICAO_CRIADA = 'REQUISICAO_CRIADA',
  REQUISICAO_AGUARDANDO_APROVACAO = 'REQUISICAO_AGUARDANDO_APROVACAO',
  REQUISICAO_APROVADA = 'REQUISICAO_APROVADA',
  REQUISICAO_NEGADA = 'REQUISICAO_NEGADA',
  REQUISICAO_CANCELADA = 'REQUISICAO_CANCELADA',
  
  // Ordens de Fornecimento
  ORDEM_GERADA = 'ORDEM_GERADA',
  ORDEM_ENVIADA = 'ORDEM_ENVIADA',
  ORDEM_CANCELADA = 'ORDEM_CANCELADA',

  // Ordem de Serviço (OS assinada)
  ORDEM_SERVICO_APROVADA = 'ORDEM_SERVICO_APROVADA',
  
  // Recebimentos
  RECEBIMENTO_PENDENTE = 'RECEBIMENTO_PENDENTE',
  RECEBIMENTO_ACEITO = 'RECEBIMENTO_ACEITO',
  RECEBIMENTO_REJEITADO = 'RECEBIMENTO_REJEITADO',
  
  // Contratos
  CONTRATO_AGUARDANDO_LIBERACAO = 'CONTRATO_AGUARDANDO_LIBERACAO',
  CONTRATO_LIBERADO = 'CONTRATO_LIBERADO',
  CONTRATO_LIBERACAO_REJEITADA = 'CONTRATO_LIBERACAO_REJEITADA',

  // Medições
  MEDICAO_SUBMETIDA = 'MEDICAO_SUBMETIDA',
  MEDICAO_ATESTADA = 'MEDICAO_ATESTADA',
  MEDICAO_PARCIALMENTE_ATESTADA = 'MEDICAO_PARCIALMENTE_ATESTADA',
  MEDICAO_APROVADA = 'MEDICAO_APROVADA',
  MEDICAO_REJEITADA = 'MEDICAO_REJEITADA',
  MEDICAO_DEVOLVIDA = 'MEDICAO_DEVOLVIDA',
  SOLICITACAO_MEDICAO = 'SOLICITACAO_MEDICAO',
  CORRECAO_DISCRIMINACAO_MEDICAO = 'CORRECAO_DISCRIMINACAO_MEDICAO',

  // Geral
  SISTEMA = 'SISTEMA',
  ALERTA = 'ALERTA',
}

export enum PrioridadeNotificacao {
  BAIXA = 'BAIXA',
  NORMAL = 'NORMAL',
  ALTA = 'ALTA',
  URGENTE = 'URGENTE',
}

@Entity('notificacoes')
@Index(['usuario_id', 'lida'])
@Index(['orgao_id', 'created_at'])
export class Notificacao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ============================================================================
  // DESTINATÁRIO
  // ============================================================================

  @ManyToOne(() => Orgao)
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column()
  orgao_id: string;

  /**
   * ID do usuário destinatário
   */
  @Column()
  usuario_id: string;

  @Column({ type: 'varchar', nullable: true })
  usuario_email: string | null;

  @Column({ type: 'varchar', nullable: true })
  usuario_telefone: string | null;

  // ============================================================================
  // CONTEÚDO
  // ============================================================================

  @Column({
    type: 'enum',
    enum: TipoNotificacao,
    default: TipoNotificacao.SISTEMA
  })
  tipo: TipoNotificacao;

  @Column()
  titulo: string;

  @Column({ type: 'text' })
  mensagem: string;

  @Column({
    type: 'enum',
    enum: PrioridadeNotificacao,
    default: PrioridadeNotificacao.NORMAL
  })
  prioridade: PrioridadeNotificacao;

  // ============================================================================
  // REFERÊNCIA (opcional - link para o item relacionado)
  // ============================================================================

  @Column({ type: 'varchar', nullable: true })
  entidade_tipo: string | null; // 'requisicao', 'ordem', 'recebimento', etc.

  @Column({ type: 'varchar', nullable: true })
  entidade_id: string | null; // ID da entidade relacionada

  @Column({ type: 'varchar', nullable: true })
  link: string | null; // URL para onde a notificação deve levar

  // ============================================================================
  // STATUS
  // ============================================================================

  @Column({ default: false })
  lida: boolean;

  @Column({ type: 'timestamp', nullable: true })
  data_leitura: Date | null;

  @Column({ default: false })
  email_enviado: boolean;

  @Column({ type: 'timestamp', nullable: true })
  data_envio_email: Date | null;

  // ============================================================================
  // METADADOS (dados adicionais em JSON)
  // ============================================================================

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  // ============================================================================
  // AUDITORIA
  // ============================================================================

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

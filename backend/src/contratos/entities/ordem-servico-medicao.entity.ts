/**
 * ============================================================================
 * ENTIDADE: ORDEM DE SERVIÇO PARA CONTRATOS DE MEDIÇÃO
 * ============================================================================
 * 
 * Equivalente à Requisição/Pedido nos contratos de Item/Quantidade.
 * É o documento que autoriza o início da execução da obra/serviço.
 * Sem OS emitida e autorizada, não é possível registrar medições.
 * 
 * Fluxo:
 * RASCUNHO → EMITIDA → AUTORIZADA → EM_EXECUCAO → CONCLUIDA
 *                     ↘ CANCELADA
 * 
 * Fundamentação Legal:
 * - Lei 14.133/2021, Art. 115: Formalização dos contratos
 * - Lei 14.133/2021, Art. 134: Cronograma físico-financeiro
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
} from 'typeorm';
import { Contrato } from './contrato.entity';

export enum StatusOSMedicao {
  RASCUNHO = 'RASCUNHO',
  EMITIDA = 'EMITIDA',                   // Emitida, aguardando autorização
  AUTORIZADA = 'AUTORIZADA',             // Autorizada, obra pode iniciar
  EM_EXECUCAO = 'EM_EXECUCAO',           // Obra em andamento (medições sendo feitas)
  CONCLUIDA = 'CONCLUIDA',               // Obra concluída (100% medido)
  CANCELADA = 'CANCELADA',               // OS cancelada
}

@Entity('ordens_servico_medicao')
export class OrdemServicoMedicao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Relacionamento
  @ManyToOne(() => Contrato, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contrato_id' })
  contrato: Contrato;

  @Column()
  contrato_id: string;

  // Identificação
  @Column()
  numero_os: string; // Ex: "OS-001/2026"

  @Column({ type: 'int' })
  ano: number;

  @Column({ type: 'int' })
  sequencial: number;

  // Descrição
  @Column({ type: 'text' })
  descricao: string; // Objeto da OS (ex: "Execução da obra de reforma do prédio sede")

  @Column({ type: 'text', nullable: true })
  local_execucao: string;

  // Datas
  @Column({ type: 'date' })
  data_emissao: Date;

  @Column({ type: 'date', nullable: true })
  data_autorizacao: Date;

  @Column({ type: 'date', nullable: true })
  data_inicio_prevista: Date;

  @Column({ type: 'date', nullable: true })
  data_fim_prevista: Date;

  @Column({ type: 'date', nullable: true })
  data_inicio_real: Date;

  @Column({ type: 'date', nullable: true })
  data_conclusao: Date;

  // Prazo
  @Column({ type: 'int', nullable: true })
  prazo_execucao_dias: number;

  // Responsáveis
  @Column({ nullable: true })
  responsavel_tecnico: string; // Responsável técnico do fornecedor (engenheiro, etc)

  @Column({ nullable: true })
  fiscal_id: string;

  @Column({ nullable: true })
  fiscal_nome: string;

  // Autorização
  @Column({ nullable: true })
  autorizador_id: string;

  @Column({ nullable: true })
  autorizador_nome: string;

  @Column({ type: 'text', nullable: true })
  observacao_autorizador: string;

  // Status
  @Column({
    type: 'enum',
    enum: StatusOSMedicao,
    default: StatusOSMedicao.RASCUNHO,
  })
  status: StatusOSMedicao;

  // Observações
  @Column({ type: 'text', nullable: true })
  observacoes: string;

  // Auditoria
  @Column({ nullable: true })
  usuario_cadastro_id: string;

  @Column({ nullable: true })
  usuario_cadastro_nome: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

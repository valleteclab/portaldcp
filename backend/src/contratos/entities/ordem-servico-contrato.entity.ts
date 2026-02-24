/**
 * ============================================================================
 * ENTIDADE: ORDEM DE SERVIÇO (Modelo Unificado)
 * ============================================================================
 * 
 * Modelo único de OS para todos os tipos de contrato de serviço:
 * - ORDEM_SERVICO (consultoria, fábrica de software)
 * - CONTINUADO (limpeza, vigilância, mão de obra)
 * - LICENCA (software/SaaS)
 * - MEDICAO (obras/engenharia)
 * 
 * Fluxo com aprovação:
 * RASCUNHO → AGUARDANDO_APROVACAO → AUTORIZADA → EM_EXECUCAO → CONCLUIDA
 *                                 ↘ REJEITADA (pode resubmeter)
 *                                   EM_EXECUCAO → ENTREGUE → ACEITA/REJEITADA
 *                                                          ↘ CANCELADA
 * 
 * Fundamentação Legal:
 * - IN SGD/ME nº 94/2022: Contratação de TIC
 * - Lei 14.133/2021, Art. 75, IV, "h": Serviços de TI
 * - Lei 14.133/2021, Art. 117: Fiscalização do contrato
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

export enum MetricaOS {
  UST = 'UST',
  HORA = 'HORA',
  PONTO_FUNCAO = 'PONTO_FUNCAO',
  DEMANDA_FIXA = 'DEMANDA_FIXA',
  UNIDADE = 'UNIDADE',
  VALOR_FIXO = 'VALOR_FIXO',
}

export enum StatusOrdemServico {
  RASCUNHO = 'RASCUNHO',
  AGUARDANDO_APROVACAO = 'AGUARDANDO_APROVACAO',
  AUTORIZADA = 'AUTORIZADA',
  ABERTA = 'ABERTA',
  EM_EXECUCAO = 'EM_EXECUCAO',
  ENTREGUE = 'ENTREGUE',
  EM_ACEITE = 'EM_ACEITE',
  ACEITA = 'ACEITA',
  REJEITADA = 'REJEITADA',
  CANCELADA = 'CANCELADA',
  CONCLUIDA = 'CONCLUIDA',
}

@Entity('ordens_servico_contrato')
export class OrdemServicoContrato {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Contrato, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contrato_id' })
  contrato: Contrato;

  @Column()
  contrato_id: string;

  @Column()
  numero_os: string;

  @Column({ type: 'int' })
  sequencial: number;

  @Column()
  descricao: string;

  @Column({ type: 'text', nullable: true })
  escopo_detalhado: string;

  // Métricas (opcionais para contratos de valor fixo)
  @Column({
    type: 'enum',
    enum: MetricaOS,
    default: MetricaOS.VALOR_FIXO,
  })
  metrica: MetricaOS;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  quantidade_metrica: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  valor_unitario_metrica: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_total: number;

  // Datas
  @Column({ type: 'date' })
  data_abertura: Date;

  @Column({ type: 'date' })
  data_prazo: Date;

  @Column({ type: 'date', nullable: true })
  data_entrega: Date;

  @Column({ type: 'date', nullable: true })
  data_aceite: Date;

  // Responsáveis
  @Column({ nullable: true })
  responsavel_tecnico: string;

  @Column({ nullable: true })
  fiscal_id: string;

  @Column({ nullable: true })
  fiscal_nome: string;

  // Qualidade
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  nota_qualidade: number;

  @Column({ type: 'text', nullable: true })
  criterios_aceite: string;

  @Column({ type: 'text', nullable: true })
  parecer_aceite: string;

  // SLA
  @Column({ type: 'int', nullable: true })
  sla_dias: number;

  @Column({ default: false })
  sla_excedido: boolean;

  // Status
  @Column({
    type: 'enum',
    enum: StatusOrdemServico,
    default: StatusOrdemServico.RASCUNHO,
  })
  status: StatusOrdemServico;

  // Observações e documentos
  @Column({ type: 'text', nullable: true })
  observacoes: string;

  @Column({ type: 'text', nullable: true })
  documentos: string;

  // Aprovação
  @Column({ nullable: true })
  aprovador_id: string;

  @Column({ nullable: true })
  aprovador_nome: string;

  @Column({ type: 'timestamp', nullable: true })
  data_aprovacao: Date;

  @Column({ type: 'text', nullable: true })
  observacao_aprovador: string;

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

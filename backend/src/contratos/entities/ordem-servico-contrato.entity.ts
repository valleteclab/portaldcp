/**
 * ============================================================================
 * ENTIDADE: ORDEM DE SERVIÇO (Contratos por Demanda)
 * ============================================================================
 * 
 * Representa uma Ordem de Serviço dentro de um contrato por demanda.
 * Cada OS tem escopo, prazo, métricas e valor definidos.
 * 
 * Fluxo:
 * ABERTA → EM_EXECUCAO → ENTREGUE → EM_ACEITE → ACEITA → PAGA
 *                                              ↘ REJEITADA → EM_EXECUCAO
 *                                                          ↘ CANCELADA
 * 
 * Fundamentação Legal:
 * - IN SGD/ME nº 94/2022: Contratação de TIC
 * - Lei 14.133/2021, Art. 75, IV, "h": Serviços de TI
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
  UST = 'UST',                     // Unidade de Serviço Técnico
  HORA = 'HORA',                   // Hora técnica
  PONTO_FUNCAO = 'PONTO_FUNCAO',   // Ponto de Função
  DEMANDA_FIXA = 'DEMANDA_FIXA',   // Valor fixo por demanda
  UNIDADE = 'UNIDADE',             // Unidade genérica
}

export enum StatusOrdemServico {
  ABERTA = 'ABERTA',                    // OS criada, aguardando início
  EM_EXECUCAO = 'EM_EXECUCAO',          // Fornecedor executando
  ENTREGUE = 'ENTREGUE',                // Fornecedor entregou, aguardando aceite
  EM_ACEITE = 'EM_ACEITE',              // Fiscal analisando entrega
  ACEITA = 'ACEITA',                    // Fiscal aceitou, saldo consumido
  REJEITADA = 'REJEITADA',              // Fiscal rejeitou, devolver para execução
  CANCELADA = 'CANCELADA',              // OS cancelada
}

@Entity('ordens_servico_contrato')
export class OrdemServicoContrato {
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
  sequencial: number;

  @Column()
  descricao: string;

  @Column({ type: 'text', nullable: true })
  escopo_detalhado: string;

  // Métricas
  @Column({
    type: 'enum',
    enum: MetricaOS,
    default: MetricaOS.UST,
  })
  metrica: MetricaOS;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  quantidade_metrica: number; // Ex: 200 UST

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  valor_unitario_metrica: number; // Ex: R$ 150,00 por UST

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_total: number; // quantidade × valor_unitario

  // Datas
  @Column({ type: 'date' })
  data_abertura: Date;

  @Column({ type: 'date' })
  data_prazo: Date; // Prazo para entrega

  @Column({ type: 'date', nullable: true })
  data_entrega: Date; // Data real de entrega

  @Column({ type: 'date', nullable: true })
  data_aceite: Date; // Data do aceite pelo fiscal

  // Responsáveis
  @Column({ nullable: true })
  responsavel_tecnico: string; // Nome do responsável técnico no fornecedor

  @Column({ nullable: true })
  fiscal_id: string;

  @Column({ nullable: true })
  fiscal_nome: string;

  // Qualidade
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  nota_qualidade: number; // Nota de 0 a 100

  @Column({ type: 'text', nullable: true })
  criterios_aceite: string; // Critérios de aceite definidos na abertura

  @Column({ type: 'text', nullable: true })
  parecer_aceite: string; // Parecer do fiscal no aceite

  // SLA
  @Column({ type: 'int', nullable: true })
  sla_dias: number; // Prazo em dias úteis para execução

  @Column({ default: false })
  sla_excedido: boolean;

  // Status
  @Column({
    type: 'enum',
    enum: StatusOrdemServico,
    default: StatusOrdemServico.ABERTA,
  })
  status: StatusOrdemServico;

  // Observações e documentos
  @Column({ type: 'text', nullable: true })
  observacoes: string;

  @Column({ type: 'text', nullable: true })
  documentos: string; // JSON array de URLs

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

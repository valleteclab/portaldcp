/**
 * ============================================================================
 * ENTIDADE: MEDIÇÃO (Boletim de Medição)
 * ============================================================================
 * 
 * Registra a medição de serviços executados em contratos de obras/engenharia.
 * 
 * Fluxo completo (Lei 14.133/2021):
 * 
 *   FORNECEDOR                    FISCAL (Órgão)              GESTOR (Órgão)
 *       │                              │                          │
 *   RASCUNHO                           │                          │
 *       │                              │                          │
 *   SUBMETIDA ────────────────────►    │                          │
 *       │                     AGUARDANDO_ATESTE                   │
 *       │                              │                          │
 *       │◄── DEVOLVIDA ───────────────┤                          │
 *       │                              │                          │
 *       │                     AGUARDANDO_APROVACAO ──────────►    │
 *       │                              │                     APROVADA / REJEITADA
 * 
 * Fundamentação Legal:
 * - Lei 14.133/2021, Art. 140, I, "a": Recebimento provisório pelo fiscal
 * - Lei 14.133/2021, Art. 134: Cronograma físico-financeiro
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
  OneToMany,
} from 'typeorm';
import { Contrato } from './contrato.entity';
import { OrdemServicoContrato } from './ordem-servico-contrato.entity';
import { Requisicao } from '../../almoxarifado/entities/requisicao.entity';

export enum StatusMedicao {
  RASCUNHO = 'RASCUNHO',                         // Fornecedor ainda editando
  SUBMETIDA = 'SUBMETIDA',                        // Fornecedor submeteu para análise
  AGUARDANDO_ATESTE = 'AGUARDANDO_ATESTE',        // Fiscal do órgão precisa atestar
  PARCIALMENTE_ATESTADA = 'PARCIALMENTE_ATESTADA', // Fiscal atestou alguns itens, faltam outros
  AGUARDANDO_APROVACAO = 'AGUARDANDO_APROVACAO',  // Gestor precisa aprovar (pós-ateste)
  APROVADA = 'APROVADA',                          // Gestor aprovou, saldo consumido
  REJEITADA = 'REJEITADA',                        // Gestor rejeitou
  DEVOLVIDA = 'DEVOLVIDA',                        // Fiscal devolveu ao fornecedor para correção
}

@Entity('medicoes')
export class Medicao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ============ RELACIONAMENTO ============

  @ManyToOne(() => Contrato, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contrato_id' })
  contrato: Contrato;

  @Column()
  contrato_id: string;

  @ManyToOne(() => OrdemServicoContrato, { nullable: true })
  @JoinColumn({ name: 'ordem_servico_id' })
  ordem_servico: OrdemServicoContrato;

  @Column({ type: 'varchar', nullable: true })
  ordem_servico_id: string;

  // Vinculação com Requisição (quando fluxo for REQUISICAO)
  @ManyToOne(() => Requisicao, { nullable: true })
  @JoinColumn({ name: 'requisicao_id' })
  requisicao: Requisicao;

  @Column({ type: 'varchar', nullable: true })
  requisicao_id: string;

  // ============ IDENTIFICAÇÃO ============

  @Column({ type: 'int' })
  numero_medicao: number; // Sequencial: 1ª Medição, 2ª Medição...

  // ============ PERÍODO DA MEDIÇÃO ============

  @Column({ type: 'date' })
  periodo_inicio: Date;

  @Column({ type: 'date' })
  periodo_fim: Date;

  // ============ VALORES ============

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_medido: number; // Valor medido neste período

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_acumulado_anterior: number; // Soma das medições anteriores

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_acumulado_atual: number; // anterior + medido

  // ============ PERCENTUAL FÍSICO ============

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  percentual_fisico_medido: number; // % físico nesta medição

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  percentual_fisico_acumulado: number; // % físico acumulado total

  // ============ EXECUÇÃO FISCAL (TEMPORAL) ============
  // Dados calculados com ano comercial (360 dias)

  @Column({ type: 'json', nullable: true })
  execucao_fiscal: {
    vigencia_inicio: string;
    vigencia_fim: string;
    total_dias: number;
    dias_executados: number;
    dias_restantes: number;
    meses_executados: number;
    dias_executados_extra: number;
    meses_restantes: number;
    dias_restantes_extra: number;
    ano_comercial: boolean;
  };

  @Column({ type: 'json', nullable: true })
  execucao_financeira: {
    itens: Array<{
      etapa_id: string;
      numero_etapa: number;
      descricao: string;
      valor_previsto: number;
      percentual_fisico: number;
      no_periodo: number;
      ate_periodo: number;
      a_executar: number;
    }>;
    totais: {
      valor_previsto: number;
      no_periodo: number;
      ate_periodo: number;
      a_executar: number;
    };
    ajuste_migracao?: number;
  };

  // ============ FORNECEDOR (quem submete) ============

  @Column({ type: 'text', nullable: true })
  competencia?: string; // ex: FEVEREIRO/2026

  @Column({ type: 'text', nullable: true })
  fornecedor_id?: string;

  @Column({ nullable: true })
  fornecedor_nome: string;

  @Column({ type: 'text', nullable: true })
  fornecedor_observacoes: string; // Observações do fornecedor ao submeter

  @Column({ type: 'timestamp', nullable: true })
  data_submissao: Date; // Quando o fornecedor submeteu

  @Column({ type: 'uuid', nullable: true })
  documento_assinatura_id?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  boletim_pdf_url?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  boletim_pdf_assinado_url?: string;

  // ============ NOTA FISCAL ============

  @Column({ nullable: true })
  nota_fiscal_numero: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  nota_fiscal_valor: number;

  @Column({ type: 'date', nullable: true })
  nota_fiscal_data: Date;

  // ============ ATESTE DO FISCAL (órgão) ============

  @Column({ nullable: true })
  ateste_fiscal_id: string;

  @Column({ nullable: true })
  ateste_fiscal_nome: string;

  @Column({ type: 'timestamp', nullable: true })
  ateste_data: Date;

  @Column({ type: 'text', nullable: true })
  ateste_observacoes: string;

  @Column({ default: false })
  ateste_verificado_in_loco: boolean; // Fiscal confirmou verificação presencial

  // ============ FISCAL RESPONSÁVEL (legado / compatibilidade) ============

  @Column({ nullable: true })
  fiscal_id: string;

  @Column({ nullable: true })
  fiscal_nome: string;

  @Column({ type: 'date', nullable: true })
  data_medicao: Date;

  // ============ APROVAÇÃO DO GESTOR ============

  @Column({ nullable: true })
  aprovador_id: string;

  @Column({ nullable: true })
  aprovador_nome: string;

  @Column({ type: 'date', nullable: true })
  data_aprovacao: Date;

  @Column({ type: 'text', nullable: true })
  observacao_aprovador: string;

  // ============ STATUS ============

  @Column({
    type: 'enum',
    enum: StatusMedicao,
    default: StatusMedicao.RASCUNHO,
  })
  status: StatusMedicao;

  // ============ OBSERVAÇÕES E DOCUMENTOS ============

  @Column({ type: 'text', nullable: true })
  observacoes: string;

  @Column({ type: 'text', nullable: true })
  fotos: string; // JSON array de URLs de fotos

  @Column({ type: 'text', nullable: true })
  documentos: string; // JSON array de URLs de documentos

  // ============ DEVOLUÇÃO (quando fiscal devolve ao fornecedor) ============

  @Column({ type: 'text', nullable: true })
  motivo_devolucao: string;

  @Column({ type: 'timestamp', nullable: true })
  data_devolucao: Date;

  // ============ AUDITORIA ============

  @Column({ nullable: true })
  usuario_cadastro_id: string;

  @Column({ nullable: true })
  usuario_cadastro_nome: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

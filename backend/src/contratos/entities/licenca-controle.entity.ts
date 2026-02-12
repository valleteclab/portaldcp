/**
 * ============================================================================
 * ENTIDADE: CONTROLE DE LICENÇAS (Software/SaaS)
 * ============================================================================
 * 
 * Controla licenças de software, assinaturas e serviços SaaS.
 * 
 * Fundamentação Legal:
 * - Lei 14.133/2021, Art. 75, XVI: Contratação de software
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

export enum TipoLicenca {
  USUARIO = 'USUARIO',
  DISPOSITIVO = 'DISPOSITIVO',
  SITE = 'SITE',
  VOLUME = 'VOLUME',
  ASSINATURA = 'ASSINATURA',
}

export enum StatusLicenca {
  ATIVA = 'ATIVA',
  SUSPENSA = 'SUSPENSA',
  EXPIRADA = 'EXPIRADA',
  CANCELADA = 'CANCELADA',
}

export enum PeriodicidadePagamento {
  MENSAL = 'MENSAL',
  TRIMESTRAL = 'TRIMESTRAL',
  SEMESTRAL = 'SEMESTRAL',
  ANUAL = 'ANUAL',
  UNICO = 'UNICO',
}

@Entity('licencas_controle')
export class LicencaControle {
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
  descricao: string; // Ex: "Microsoft 365 Business Basic"

  @Column({ type: 'text', nullable: true })
  descricao_detalhada: string;

  @Column({
    type: 'enum',
    enum: TipoLicenca,
    default: TipoLicenca.USUARIO,
  })
  tipo_licenca: TipoLicenca;

  // Quantidades
  @Column({ type: 'int' })
  quantidade_contratada: number;

  @Column({ type: 'int', default: 0 })
  quantidade_ativa: number;

  // Valores
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_unitario_mensal: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_unitario_anual: number;

  @Column({
    type: 'enum',
    enum: PeriodicidadePagamento,
    default: PeriodicidadePagamento.MENSAL,
  })
  periodicidade_pagamento: PeriodicidadePagamento;

  // Datas
  @Column({ type: 'date' })
  data_ativacao: Date;

  @Column({ type: 'date' })
  data_expiracao: Date;

  @Column({ type: 'date', nullable: true })
  data_proxima_renovacao: Date;

  // Informações técnicas
  @Column({ type: 'text', nullable: true })
  chave_licenca: string; // Pode ser criptografada

  @Column({ nullable: true })
  fornecedor_contato: string;

  @Column({ nullable: true })
  url_painel_admin: string; // URL do painel de administração do fornecedor

  // Status
  @Column({
    type: 'enum',
    enum: StatusLicenca,
    default: StatusLicenca.ATIVA,
  })
  status: StatusLicenca;

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

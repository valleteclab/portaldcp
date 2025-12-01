import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Orgao } from '../../orgaos/entities/orgao.entity';

export enum StatusCredenciamento {
  RASCUNHO = 'RASCUNHO',
  PUBLICADO = 'PUBLICADO',
  EM_ANDAMENTO = 'EM_ANDAMENTO',
  ENCERRADO = 'ENCERRADO',
  SUSPENSO = 'SUSPENSO',
  REVOGADO = 'REVOGADO',
  ANULADO = 'ANULADO'
}

export enum TipoCredenciamento {
  CREDENCIAMENTO = 'CREDENCIAMENTO',
  PRE_QUALIFICACAO = 'PRE_QUALIFICACAO'
}

@Entity('credenciamentos')
export class Credenciamento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Relacionamento com Órgão
  @ManyToOne(() => Orgao)
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column()
  orgao_id: string;

  // Identificação
  @Column()
  numero_edital: string;

  @Column({ type: 'int' })
  ano: number;

  @Column({ type: 'int' })
  sequencial: number;

  @Column()
  numero_processo: string;

  @Column({
    type: 'enum',
    enum: TipoCredenciamento,
    default: TipoCredenciamento.CREDENCIAMENTO
  })
  tipo: TipoCredenciamento;

  @Column({
    type: 'enum',
    enum: StatusCredenciamento,
    default: StatusCredenciamento.RASCUNHO
  })
  status: StatusCredenciamento;

  // Objeto
  @Column({ type: 'text' })
  objeto: string;

  @Column({ type: 'text', nullable: true })
  objeto_detalhado: string;

  @Column({ type: 'text', nullable: true })
  justificativa: string;

  // Requisitos
  @Column({ type: 'text', nullable: true })
  requisitos_habilitacao: string;

  @Column({ type: 'text', nullable: true })
  requisitos_tecnicos: string;

  @Column({ type: 'text', nullable: true })
  documentos_exigidos: string;

  // Valores
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_estimado: number;

  @Column({ nullable: true })
  forma_pagamento: string;

  // Datas
  @Column({ type: 'timestamp', nullable: true })
  data_publicacao: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_inicio_inscricoes: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_fim_inscricoes: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_resultado: Date;

  @Column({ default: false })
  inscricao_permanente: boolean; // Credenciamento aberto permanentemente

  // Responsável
  @Column({ nullable: true })
  responsavel_nome: string;

  @Column({ nullable: true })
  responsavel_cargo: string;

  @Column({ nullable: true })
  responsavel_email: string;

  // Documentos
  @Column({ nullable: true })
  edital_url: string;

  @Column({ nullable: true })
  anexos_url: string;

  // Amparo Legal
  @Column({ nullable: true })
  amparo_legal: string; // Art. 79 da Lei 14.133/2021

  // Integração PNCP
  @Column({ nullable: true })
  numero_controle_pncp: string;

  @Column({ default: false })
  enviado_pncp: boolean;

  @Column({ type: 'timestamp', nullable: true })
  data_envio_pncp: Date;

  // Observações
  @Column({ type: 'text', nullable: true })
  observacoes: string;

  // Credenciados
  @OneToMany(() => Credenciado, credenciado => credenciado.credenciamento)
  credenciados: Credenciado[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

export enum StatusCredenciado {
  INSCRITO = 'INSCRITO',
  EM_ANALISE = 'EM_ANALISE',
  APROVADO = 'APROVADO',
  REPROVADO = 'REPROVADO',
  SUSPENSO = 'SUSPENSO',
  DESCREDENCIADO = 'DESCREDENCIADO'
}

@Entity('credenciados')
export class Credenciado {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Relacionamento com Credenciamento
  @ManyToOne(() => Credenciamento, credenciamento => credenciamento.credenciados, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'credenciamento_id' })
  credenciamento: Credenciamento;

  @Column()
  credenciamento_id: string;

  // Fornecedor
  @Column()
  fornecedor_id: string;

  @Column()
  fornecedor_cnpj: string;

  @Column()
  fornecedor_razao_social: string;

  @Column({
    type: 'enum',
    enum: StatusCredenciado,
    default: StatusCredenciado.INSCRITO
  })
  status: StatusCredenciado;

  // Datas
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  data_inscricao: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_analise: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_aprovacao: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_validade: Date;

  // Análise
  @Column({ nullable: true })
  analista_nome: string;

  @Column({ type: 'text', nullable: true })
  parecer: string;

  @Column({ type: 'text', nullable: true })
  motivo_reprovacao: string;

  // Documentos
  @Column({ type: 'jsonb', nullable: true })
  documentos_enviados: any;

  @Column({ type: 'jsonb', nullable: true })
  documentos_pendentes: string[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

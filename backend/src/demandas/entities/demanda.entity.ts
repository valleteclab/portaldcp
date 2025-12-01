import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';

/**
 * Status da Demanda
 */
export enum StatusDemanda {
  RASCUNHO = 'RASCUNHO',           // Ainda sendo preenchida
  ENVIADA = 'ENVIADA',             // Enviada para aprovação
  EM_ANALISE = 'EM_ANALISE',       // Sendo analisada
  APROVADA = 'APROVADA',           // Aprovada para o PCA
  REJEITADA = 'REJEITADA',         // Rejeitada
  CONSOLIDADA = 'CONSOLIDADA'      // Já incluída no PCA
}

/**
 * Demanda de Contratação
 * Representa uma solicitação de contratação de uma área/setor
 */
@Entity('demandas')
export class Demanda {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orgao_id: string;

  @Column()
  ano_referencia: number; // Ano do PCA que esta demanda será incluída

  @Column()
  unidade_requisitante: string; // Setor/Área que está solicitando

  @Column({ nullable: true })
  responsavel_nome: string;

  @Column({ nullable: true })
  responsavel_email: string;

  @Column({ nullable: true })
  responsavel_telefone: string;

  @Column({ type: 'enum', enum: StatusDemanda, default: StatusDemanda.RASCUNHO })
  status: StatusDemanda;

  @Column({ type: 'text', nullable: true })
  observacoes: string;

  @Column({ type: 'timestamp', nullable: true })
  data_envio: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_aprovacao: Date;

  @Column({ type: 'varchar', nullable: true })
  aprovado_por: string;

  @Column({ type: 'text', nullable: true })
  motivo_rejeicao: string;

  @Column({ nullable: true })
  pca_id: string; // ID do PCA onde foi consolidada

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Relacionamento com itens da demanda
  @OneToMany(() => ItemDemanda, item => item.demanda, { cascade: true })
  itens: ItemDemanda[];
}

/**
 * Item de uma Demanda
 * Representa um material ou serviço solicitado
 */
@Entity('itens_demanda')
export class ItemDemanda {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  demanda_id: string;

  @ManyToOne(() => Demanda, demanda => demanda.itens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'demanda_id' })
  demanda: Demanda;

  // Classificação do item
  @Column({ type: 'enum', enum: ['MATERIAL', 'SERVICO'] })
  categoria: 'MATERIAL' | 'SERVICO';

  @Column({ nullable: true })
  codigo_classe: string; // Código da classificação (ex: 100, 1000)

  @Column({ nullable: true })
  nome_classe: string; // Nome da classificação

  @Column({ nullable: true })
  codigo_item_catalogo: string; // Código do item (ex: S1000001)

  @Column({ type: 'text' })
  descricao_objeto: string;

  @Column({ type: 'text', nullable: true })
  justificativa: string;

  // Quantidades e valores
  @Column({ type: 'decimal', precision: 15, scale: 4, default: 1 })
  quantidade_estimada: number;

  @Column({ default: 'UN' })
  unidade_medida: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_unitario_estimado: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_total_estimado: number;

  // Planejamento
  @Column({ nullable: true })
  trimestre_previsto: number; // 1, 2, 3 ou 4

  @Column({ type: 'date', nullable: true })
  data_desejada_contratacao: Date;

  @Column({ default: false })
  renovacao_contrato: boolean;

  @Column({ default: 3 })
  prioridade: number; // 1 = Muito Alta, 5 = Muito Baixa

  // Catálogo
  @Column({ default: 'OUTROS' })
  catalogo_utilizado: string; // COMPRASGOV ou OUTROS

  // Controle de consolidação
  @Column({ nullable: true })
  item_pca_id: string; // ID do item no PCA após consolidação

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

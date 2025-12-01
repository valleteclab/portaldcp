import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';

/**
 * Classificação do Catálogo Próprio
 * Representa grupos/classes de materiais e serviços
 */
@Entity('classificacoes_catalogo_proprio')
export class ClassificacaoCatalogoProprio {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  codigo: string; // Ex: 100, 200, 1000, 1100

  @Column()
  nome: string; // Ex: SERVIÇOS DE UTILIDADE PÚBLICA

  @Column({ type: 'enum', enum: ['MATERIAL', 'SERVICO'] })
  tipo: 'MATERIAL' | 'SERVICO';

  @Column({ type: 'text', nullable: true })
  descricao: string;

  @Column({ type: 'simple-array', nullable: true })
  palavras_chave: string[]; // Para busca inteligente

  @Column({ nullable: true })
  orgao_id: string; // Se null, é classificação global

  @Column({ default: true })
  ativo: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Relacionamento com itens
  @OneToMany(() => ItemCatalogoProprio, item => item.classificacao)
  itens: ItemCatalogoProprio[];
}

/**
 * Item do Catálogo Próprio
 * Representa um material ou serviço específico
 */
@Entity('itens_catalogo_proprio')
export class ItemCatalogoProprio {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  codigo: string; // Ex: S1000001, M10000001 (gerado automaticamente)

  @Column()
  descricao: string; // Descrição do item

  @Column({ type: 'text', nullable: true })
  descricao_detalhada: string;

  @Column({ type: 'enum', enum: ['MATERIAL', 'SERVICO'] })
  tipo: 'MATERIAL' | 'SERVICO';

  @Column({ nullable: true })
  unidade_padrao: string; // UN, MES, KG, etc.

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  valor_referencia: number; // Valor de referência (opcional)

  @Column({ nullable: true })
  classificacao_id: string;

  @ManyToOne(() => ClassificacaoCatalogoProprio, classificacao => classificacao.itens)
  @JoinColumn({ name: 'classificacao_id' })
  classificacao: ClassificacaoCatalogoProprio;

  @Column({ nullable: true })
  orgao_id: string; // Se null, é item global

  @Column({ default: true })
  ativo: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

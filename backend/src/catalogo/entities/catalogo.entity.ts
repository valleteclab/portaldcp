import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';

// ============ CLASSE/GRUPO DO CATÁLOGO ============

@Entity('classes_catalogo')
export class ClasseCatalogo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  codigo: string; // "859", "800", "831", "100"

  @Column()
  nome: string; // "OUTROS SERVIÇOS DE SUPORTE"

  @Column({ type: 'text', nullable: true })
  descricao: string;

  @Column({
    type: 'enum',
    enum: ['MATERIAL', 'SERVICO'],
  })
  tipo: 'MATERIAL' | 'SERVICO';

  // Hierarquia (classe pai)
  @ManyToOne(() => ClasseCatalogo, { nullable: true })
  @JoinColumn({ name: 'classe_pai_id' })
  classe_pai: ClasseCatalogo;

  @Column({ nullable: true })
  classe_pai_id: string;

  @Column({ default: true })
  ativo: boolean;

  // Origem do dado
  @Column({ default: 'COMPRASGOV' })
  origem: 'COMPRASGOV' | 'MANUAL';

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

// ============ ITEM DO CATÁLOGO (CATMAT/CATSER) ============

@Entity('itens_catalogo')
export class ItemCatalogo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  codigo: string; // "446820" (código CATMAT/CATSER)

  @Column({ type: 'text' })
  @Index()
  descricao: string; // Descrição completa do item

  @Column({ type: 'text', nullable: true })
  descricao_detalhada: string;

  // Relacionamento com classe
  @ManyToOne(() => ClasseCatalogo)
  @JoinColumn({ name: 'classe_id' })
  classe: ClasseCatalogo;

  @Column({ nullable: true })
  classe_id: string;

  @Column({ nullable: true })
  codigo_classe: string; // "1005" - Código da classe para referência rápida

  @Column({ nullable: true })
  nome_classe: string; // "ARMAS DE FOGO DE CALIBRE ATÉ 120MM"

  // Grupo (hierarquia acima da classe)
  @Column({ nullable: true })
  codigo_grupo: string; // "10"

  @Column({ nullable: true })
  nome_grupo: string; // "ARMAMENTO"

  @Column({
    type: 'enum',
    enum: ['MATERIAL', 'SERVICO'],
  })
  @Index()
  tipo: 'MATERIAL' | 'SERVICO';

  // Unidade padrão
  @Column({ nullable: true })
  unidade_padrao: string; // "UN", "M", "KG"

  // PDM (Padrão Descritivo de Materiais)
  @Column({ nullable: true })
  codigo_pdm: string; // "1712"

  @Column({ nullable: true })
  nome_pdm: string; // "PEÇAS / ACESSÓRIOS ARMAMENTO"

  // NCM (Nomenclatura Comum do Mercosul)
  @Column({ nullable: true })
  codigo_ncm: string;

  // Características para busca
  @Column({ type: 'text', nullable: true })
  palavras_chave: string; // Palavras para melhorar busca

  @Column({ default: true })
  ativo: boolean;

  // Sustentabilidade
  @Column({ default: false })
  sustentavel: boolean;

  // Origem e controle
  @Column({ default: 'COMPRASGOV' })
  origem: 'COMPRASGOV' | 'MANUAL';

  @Column({ type: 'timestamp', nullable: true })
  ultima_sincronizacao: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

// ============ UNIDADE DE MEDIDA ============

@Entity('unidades_medida')
export class UnidadeMedida {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  sigla: string; // "UN", "PCT", "M", "KG"

  @Column()
  nome: string; // "Unidade", "Pacote", "Metro"

  @Column({ type: 'text', nullable: true })
  descricao: string;

  @Column({ default: true })
  ativo: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

// ============ LOG DE SINCRONIZAÇÃO ============

@Entity('catalogo_sync_log')
export class CatalogoSyncLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: ['CLASSES', 'MATERIAIS', 'SERVICOS', 'COMPLETA'],
  })
  tipo: 'CLASSES' | 'MATERIAIS' | 'SERVICOS' | 'COMPLETA';

  @Column({
    type: 'enum',
    enum: ['INICIADO', 'SUCESSO', 'ERRO', 'PARCIAL'],
  })
  status: 'INICIADO' | 'SUCESSO' | 'ERRO' | 'PARCIAL';

  @Column({ type: 'int', default: 0 })
  registros_processados: number;

  @Column({ type: 'int', default: 0 })
  registros_novos: number;

  @Column({ type: 'int', default: 0 })
  registros_atualizados: number;

  @Column({ type: 'int', default: 0 })
  registros_erro: number;

  @Column({ type: 'text', nullable: true })
  mensagem_erro: string;

  @Column({ type: 'int', nullable: true })
  duracao_segundos: number;

  @CreateDateColumn()
  created_at: Date;
}

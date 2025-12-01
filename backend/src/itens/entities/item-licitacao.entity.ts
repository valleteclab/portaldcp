import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';

export enum UnidadeMedida {
  UNIDADE = 'UNIDADE',
  PECA = 'PECA',
  CAIXA = 'CAIXA',
  PACOTE = 'PACOTE',
  METRO = 'METRO',
  METRO_QUADRADO = 'METRO_QUADRADO',
  METRO_CUBICO = 'METRO_CUBICO',
  LITRO = 'LITRO',
  QUILOGRAMA = 'QUILOGRAMA',
  TONELADA = 'TONELADA',
  HORA = 'HORA',
  DIARIA = 'DIARIA',
  MES = 'MES',
  ANO = 'ANO',
  SERVICO = 'SERVICO',
  GLOBAL = 'GLOBAL',
}

export enum StatusItem {
  ATIVO = 'ATIVO',
  CANCELADO = 'CANCELADO',
  DESERTO = 'DESERTO',
  FRACASSADO = 'FRACASSADO',
  ADJUDICADO = 'ADJUDICADO',
  HOMOLOGADO = 'HOMOLOGADO',
}

export enum TipoParticipacao {
  AMPLA = 'AMPLA', // Todos podem participar
  EXCLUSIVO_MPE = 'EXCLUSIVO_MPE', // Exclusivo ME/EPP
  COTA_RESERVADA = 'COTA_RESERVADA', // Cota reservada ME/EPP
}

@Entity('itens_licitacao')
export class ItemLicitacao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Relacionamento com Licitação
  @ManyToOne(() => Licitacao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column()
  licitacao_id: string;

  // Identificação
  @Column({ type: 'int' })
  numero_item: number;

  @Column({ nullable: true })
  numero_lote: number; // Se for agrupado em lote

  @Column({ nullable: true })
  codigo_catalogo: string; // Código CATMAT/CATSER

  // Descrição
  @Column()
  descricao_resumida: string;

  @Column({ type: 'text', nullable: true })
  descricao_detalhada: string;

  @Column({ nullable: true })
  marca_referencia: string;

  // Quantidades
  @Column({ type: 'decimal', precision: 15, scale: 4 })
  quantidade: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  quantidade_minima: number; // Para registro de preços

  @Column({
    type: 'enum',
    enum: UnidadeMedida,
    default: UnidadeMedida.UNIDADE
  })
  unidade_medida: UnidadeMedida;

  // Valores
  @Column({ type: 'decimal', precision: 15, scale: 4 })
  valor_unitario_estimado: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_total_estimado: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  valor_unitario_homologado: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_total_homologado: number;

  // Participação
  @Column({
    type: 'enum',
    enum: TipoParticipacao,
    default: TipoParticipacao.AMPLA
  })
  tipo_participacao: TipoParticipacao;

  @Column({ default: false })
  margem_preferencia: boolean;

  @Column({ type: 'int', nullable: true })
  percentual_margem: number;

  // Status
  @Column({
    type: 'enum',
    enum: StatusItem,
    default: StatusItem.ATIVO
  })
  status: StatusItem;

  // Vencedor (preenchido após adjudicação)
  @Column({ nullable: true })
  fornecedor_vencedor_id: string;

  @Column({ nullable: true })
  fornecedor_vencedor_nome: string;

  // Observações
  @Column({ type: 'text', nullable: true })
  observacoes: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';
import { Orgao } from '../../orgaos/entities/orgao.entity';
import { Fornecedor } from '../../fornecedores/entities/fornecedor.entity';

export enum StatusAta {
  VIGENTE = 'VIGENTE',
  ENCERRADA = 'ENCERRADA',
  CANCELADA = 'CANCELADA',
  SUSPENSA = 'SUSPENSA',
  ESGOTADA = 'ESGOTADA'
}

@Entity('atas_registro_preco')
export class AtaRegistroPreco {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Identificação
  @Column()
  numero_ata: string; // Ex: "001/2024"

  @Column({ type: 'int' })
  ano: number;

  @Column({ type: 'int' })
  sequencial: number;

  // Relacionamentos
  @ManyToOne(() => Orgao)
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column()
  orgao_id: string;

  @ManyToOne(() => Licitacao)
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column()
  licitacao_id: string;

  @ManyToOne(() => Fornecedor)
  @JoinColumn({ name: 'fornecedor_id' })
  fornecedor: Fornecedor;

  @Column()
  fornecedor_id: string;

  // Dados do Fornecedor (snapshot)
  @Column()
  fornecedor_cnpj: string;

  @Column()
  fornecedor_razao_social: string;

  // Status
  @Column({
    type: 'enum',
    enum: StatusAta,
    default: StatusAta.VIGENTE
  })
  status: StatusAta;

  // Objeto
  @Column({ type: 'text' })
  objeto: string;

  // Valores
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_total: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_utilizado: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_saldo: number;

  // Datas
  @Column({ type: 'date' })
  data_assinatura: Date;

  @Column({ type: 'date' })
  data_vigencia_inicio: Date;

  @Column({ type: 'date' })
  data_vigencia_fim: Date;

  @Column({ type: 'date', nullable: true })
  data_publicacao: Date;

  // Prazo
  @Column({ type: 'int', default: 12 })
  prazo_vigencia_meses: number;

  // Permite Adesão (Carona)
  @Column({ default: false })
  permite_adesao: boolean;

  @Column({ type: 'int', nullable: true })
  limite_adesao_percentual: number; // Limite de adesão em %

  // Documento
  @Column({ nullable: true })
  arquivo_ata: string;

  // Integração PNCP
  @Column({ nullable: true })
  numero_controle_pncp: string;

  @Column({ type: 'int', nullable: true })
  sequencial_pncp: number;

  @Column({ default: false })
  enviado_pncp: boolean;

  @Column({ type: 'timestamp', nullable: true })
  data_envio_pncp: Date;

  // Observações
  @Column({ type: 'text', nullable: true })
  observacoes: string;

  // Itens da Ata
  @OneToMany(() => ItemAta, item => item.ata)
  itens: ItemAta[];

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

@Entity('itens_ata')
export class ItemAta {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => AtaRegistroPreco, ata => ata.itens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ata_id' })
  ata: AtaRegistroPreco;

  @Column()
  ata_id: string;

  // Identificação do Item
  @Column({ type: 'int' })
  numero_item: number;

  @Column()
  descricao: string;

  @Column({ type: 'text', nullable: true })
  descricao_detalhada: string;

  @Column({ nullable: true })
  codigo_catalogo: string;

  // Unidade e Quantidade
  @Column()
  unidade_medida: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  quantidade_registrada: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  quantidade_utilizada: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  quantidade_saldo: number;

  // Valores
  @Column({ type: 'decimal', precision: 15, scale: 4 })
  valor_unitario: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_total: number;

  // Marca/Modelo (se aplicável)
  @Column({ nullable: true })
  marca: string;

  @Column({ nullable: true })
  modelo: string;

  @Column({ nullable: true })
  fabricante: string;

  // Status
  @Column({ default: true })
  ativo: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

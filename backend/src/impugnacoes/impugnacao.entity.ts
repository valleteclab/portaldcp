import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';

export enum StatusImpugnacao {
  PENDENTE = 'PENDENTE',
  EM_ANALISE = 'EM_ANALISE',
  DEFERIDA = 'DEFERIDA',
  INDEFERIDA = 'INDEFERIDA',
  PARCIALMENTE_DEFERIDA = 'PARCIALMENTE_DEFERIDA'
}

@Entity('impugnacoes')
export class Impugnacao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  licitacao_id: string;

  @ManyToOne(() => Licitacao)
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column({ nullable: true })
  fornecedor_id: string;

  @ManyToOne(() => Fornecedor, { nullable: true })
  @JoinColumn({ name: 'fornecedor_id' })
  fornecedor: Fornecedor;

  @Column({ nullable: true })
  nome_impugnante: string;

  @Column({ nullable: true })
  cpf_cnpj_impugnante: string;

  @Column({ nullable: true })
  email_impugnante: string;

  @Column({ default: false })
  is_cidadao: boolean;

  @Column('text')
  texto_impugnacao: string;

  @Column({ nullable: true })
  item_edital_impugnado: string;

  @Column({ nullable: true })
  fundamentacao_legal: string;

  @Column({
    type: 'varchar',
    default: StatusImpugnacao.PENDENTE
  })
  status: StatusImpugnacao;

  @Column('text', { nullable: true })
  resposta: string;

  @Column({ nullable: true })
  respondido_por: string;

  @Column({ type: 'timestamp', nullable: true })
  data_resposta: Date;

  @Column({ default: false })
  altera_edital: boolean;

  @Column('text', { nullable: true })
  alteracoes_edital: string;

  // Documento anexado (PDF)
  @Column({ nullable: true })
  documento_nome: string; // Nome original do arquivo

  @Column({ nullable: true })
  documento_caminho: string; // Caminho no servidor

  @Column({ nullable: true })
  documento_tamanho: number; // Tamanho em bytes

  @Column({ nullable: true })
  documento_mime_type: string; // Tipo MIME (application/pdf)

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { Fornecedor } from '../fornecedores/entities/fornecedor.entity';

export enum StatusEsclarecimento {
  PENDENTE = 'PENDENTE',
  RESPONDIDO = 'RESPONDIDO',
  ARQUIVADO = 'ARQUIVADO'
}

@Entity('esclarecimentos')
export class Esclarecimento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Licitacao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column()
  licitacao_id: string;

  // Pode ser de um fornecedor cadastrado ou cidadão
  @ManyToOne(() => Fornecedor, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'fornecedor_id' })
  fornecedor: Fornecedor;

  @Column({ nullable: true })
  fornecedor_id: string;

  // Se for cidadão (não cadastrado)
  @Column({ nullable: true })
  nome_solicitante: string;

  @Column({ nullable: true })
  cpf_cnpj_solicitante: string;

  @Column({ nullable: true })
  email_solicitante: string;

  @Column({ default: false })
  is_cidadao: boolean;

  // Conteúdo do pedido
  @Column('text')
  texto_esclarecimento: string;

  @Column({ nullable: true })
  item_edital_referencia: string; // Item do edital que gerou a dúvida

  // Resposta
  @Column({
    type: 'enum',
    enum: StatusEsclarecimento,
    default: StatusEsclarecimento.PENDENTE
  })
  status: StatusEsclarecimento;

  @Column('text', { nullable: true })
  resposta: string;

  @Column({ nullable: true })
  respondido_por: string; // Nome do pregoeiro

  @Column({ type: 'timestamp', nullable: true })
  data_resposta: Date;

  // Documento anexado (PDF)
  @Column({ nullable: true })
  documento_nome: string;

  @Column({ nullable: true })
  documento_caminho: string;

  @Column({ nullable: true })
  documento_tamanho: number;

  @Column({ nullable: true })
  documento_mime_type: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

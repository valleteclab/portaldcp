import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';
import { Fornecedor } from '../../fornecedores/entities/fornecedor.entity';
import { PropostaItem } from './proposta-item.entity';

export enum StatusProposta {
  RASCUNHO = 'RASCUNHO',
  ENVIADA = 'ENVIADA',
  RECEBIDA = 'RECEBIDA', // Confirmada pelo sistema
  EM_ANALISE = 'EM_ANALISE',
  CLASSIFICADA = 'CLASSIFICADA',
  DESCLASSIFICADA = 'DESCLASSIFICADA',
  VENCEDORA = 'VENCEDORA',
  CANCELADA = 'CANCELADA',
}

@Entity('propostas')
export class Proposta {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Relacionamentos
  @ManyToOne(() => Licitacao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column()
  licitacao_id: string;

  @ManyToOne(() => Fornecedor)
  @JoinColumn({ name: 'fornecedor_id' })
  fornecedor: Fornecedor;

  @Column()
  fornecedor_id: string;

  // Status
  @Column({
    type: 'enum',
    enum: StatusProposta,
    default: StatusProposta.RASCUNHO
  })
  status: StatusProposta;

  // Declarações Obrigatórias (Art. 63 da Lei 14.133)
  @Column({ default: false })
  declaracao_termos: boolean; // Aceita termos do edital

  @Column({ default: false })
  declaracao_mpe: boolean; // Declara ser ME/EPP

  @Column({ default: false })
  declaracao_integridade: boolean; // Programa de integridade (Art. 60)

  @Column({ default: false })
  declaracao_inexistencia_fatos: boolean; // Inexistência de fatos impeditivos

  @Column({ default: false })
  declaracao_menor: boolean; // Não emprega menor

  @Column({ default: false })
  declaracao_reserva_cargos: boolean; // Reserva de cargos PCD

  // Endereço de Entrega (se diferente do cadastro)
  @Column({ nullable: true })
  endereco_entrega: string;

  @Column({ nullable: true })
  cidade_entrega: string;

  @Column({ nullable: true })
  uf_entrega: string;

  @Column({ nullable: true })
  cep_entrega: string;

  // Valores Totais (calculados)
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_total_proposta: number;

  // Prazo de Validade da Proposta (em dias)
  @Column({ type: 'int', default: 60 })
  prazo_validade_dias: number;

  // Prazo de Entrega (em dias)
  @Column({ type: 'int', nullable: true })
  prazo_entrega_dias: number;

  // Observações
  @Column({ type: 'text', nullable: true })
  observacoes: string;

  // Motivo de desclassificação
  @Column({ type: 'text', nullable: true })
  motivo_desclassificacao: string;

  // Datas
  @Column({ type: 'timestamp', nullable: true })
  data_envio: Date;

  @Column({ type: 'timestamp', nullable: true })
  data_analise: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => PropostaItem, (item) => item.proposta)
  itens: PropostaItem[];
}

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Licitacao } from '../../licitacoes/entities/licitacao.entity';

@Entity('lances')
export class Lance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor: number;

  // Em um cenário real, seria relacionamento com User/Fornecedor.
  // Por enquanto, usaremos um ID/Nome simulado para permitir testes sem login complexo.
  @Column()
  fornecedor_identificador: string; // Ex: "Fornecedor A" ou CNPJ mascarado

  @Column({ nullable: true })
  ip_origem: string;

  @Column({ default: false })
  cancelado: boolean;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Licitacao)
  @JoinColumn({ name: 'licitacao_id' })
  licitacao: Licitacao;

  @Column()
  licitacao_id: string;
}

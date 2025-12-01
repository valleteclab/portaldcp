import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Fornecedor } from './fornecedor.entity';

@Entity('fornecedor_socios')
export class FornecedorSocio {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  fornecedor_id: string;

  @ManyToOne(() => Fornecedor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fornecedor_id' })
  fornecedor: Fornecedor;

  @Column()
  nome: string;

  @Column({ nullable: true })
  cpf_cnpj: string; // Mascarado pela API

  @Column({ type: 'date', nullable: true })
  data_entrada: Date;

  @Column({ nullable: true })
  qualificacao: string;

  @CreateDateColumn()
  created_at: Date;
}

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Fornecedor } from './fornecedor.entity';

@Entity('fornecedor_atividades')
export class FornecedorAtividade {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  fornecedor_id: string;

  @ManyToOne(() => Fornecedor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fornecedor_id' })
  fornecedor: Fornecedor;

  @Column()
  codigo: string; // Código CNAE

  @Column()
  descricao: string;

  @Column({ default: false })
  principal: boolean; // Se é atividade principal

  @CreateDateColumn()
  created_at: Date;
}

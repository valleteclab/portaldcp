import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Fornecedor } from './fornecedor.entity';

@Entity('password_reset_tokens')
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  fornecedor_id: string;

  @ManyToOne(() => Fornecedor)
  @JoinColumn({ name: 'fornecedor_id' })
  fornecedor: Fornecedor;

  @Column()
  token: string;

  @Column({ type: 'timestamp' })
  expires_at: Date;

  @Column({ default: false })
  used: boolean;

  @CreateDateColumn()
  created_at: Date;
}

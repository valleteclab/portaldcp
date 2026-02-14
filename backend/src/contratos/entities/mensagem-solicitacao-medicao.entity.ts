/**
 * Mensagem de solicitação de medição (órgão → fornecedor).
 * Persiste o histórico no órgão e serve de caixa de entrada para o fornecedor.
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Contrato } from './contrato.entity';

@Entity('mensagens_solicitacao_medicao')
@Index(['orgao_id', 'created_at'])
@Index(['fornecedor_id', 'lida'])
export class MensagemSolicitacaoMedicao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  contrato_id: string;

  @ManyToOne(() => Contrato, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contrato_id' })
  contrato: Contrato;

  @Column()
  orgao_id: string;

  @Column()
  fornecedor_id: string;

  @Column({ length: 7 })
  mes_referencia: string;

  @Column({ length: 255 })
  titulo: string;

  @Column({ type: 'text' })
  mensagem: string;

  @Column()
  solicitado_por: string;

  @Column({ length: 255 })
  solicitado_por_nome: string;

  @CreateDateColumn()
  created_at: Date;

  @Column({ default: false })
  lida: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lida_em: Date | null;
}

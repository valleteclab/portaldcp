import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('links_assinatura_fiscal')
export class LinkAssinaturaFiscal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  token: string;

  @Column()
  medicao_id: string;

  /** Papel do assinante deste link: FISCAL (padrão) | ENGENHEIRO */
  @Column({ type: 'varchar', length: 20, default: 'FISCAL' })
  papel: string;

  /** Nulo quando o assinante não é usuário do sistema (ex.: engenheiro do contrato). */
  @Column({ nullable: true })
  fiscal_usuario_id: string;

  /** CPF do assinante quando não vem de usuário (ex.: engenheiro). */
  @Column({ nullable: true })
  assinante_cpf: string;

  @Column({ nullable: true })
  fiscal_nome: string;

  @Column({ nullable: true })
  fiscal_telefone: string;

  @Column()
  solicitado_por_id: string;

  @Column({ nullable: true })
  solicitado_por_nome: string;

  @Column({ nullable: true })
  solicitado_por_telefone: string;

  /** pendente | assinado | recusado */
  @Column({ type: 'varchar', length: 20, default: 'pendente' })
  status: string;

  @Column({ type: 'timestamp' })
  expira_em: Date;

  @Column({ type: 'text', nullable: true })
  motivo_recusa: string | null;

  @Column({ default: false })
  auto_enviar_aprovacao: boolean;

  @Column({ type: 'int', nullable: true })
  itens_total_medicao: number | null;

  @Column({ type: 'int', nullable: true })
  itens_selecionados_total: number | null;

  @Column({ type: 'simple-array', nullable: true })
  itens_selecionados_ids: string[] | null;

  @CreateDateColumn()
  criado_em: Date;

  @UpdateDateColumn()
  atualizado_em: Date;
}

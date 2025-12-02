import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum StatusSolicitacao {
  PENDENTE = 'PENDENTE',
  APROVADA = 'APROVADA',
  REJEITADA = 'REJEITADA'
}

@Entity('solicitacoes_acesso')
export class SolicitacaoAcesso {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  cnpj: string;

  @Column()
  razao_social: string;

  @Column()
  email: string;

  @Column()
  nome_responsavel: string;

  @Column({ nullable: true })
  telefone: string;

  @Column({ nullable: true })
  cargo_responsavel: string;

  @Column({ nullable: true })
  mensagem: string;

  @Column({
    type: 'varchar',
    default: StatusSolicitacao.PENDENTE
  })
  status: StatusSolicitacao;

  @Column({ nullable: true })
  motivo_rejeicao: string;

  @Column({ nullable: true })
  aprovado_por: string;

  @Column({ nullable: true })
  data_aprovacao: Date;

  @Column({ nullable: true })
  orgao_id: string; // ID do órgão criado após aprovação

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

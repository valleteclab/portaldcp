import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Orgao } from '../../orgaos/entities/orgao.entity';

export enum EntidadeTipo {
  ORDEM_SERVICO = 'ORDEM_SERVICO',
  ORDEM_FORNECIMENTO = 'ORDEM_FORNECIMENTO',
  MEDICAO = 'MEDICAO',
  DOCUMENTO_AVULSO = 'DOCUMENTO_AVULSO',
  COMPROVACAO_ACEITE_RECEBIMENTO = 'COMPROVACAO_ACEITE_RECEBIMENTO',
}

export enum PapelAssinante {
  FORNECEDOR = 'FORNECEDOR',
  FISCAL = 'FISCAL',
  GESTOR = 'GESTOR',
  SIGNATARIO = 'SIGNATARIO',
}

@Entity('assinaturas_digitais')
export class AssinaturaDigital {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'orgao_id', type: 'uuid' })
  orgao_id: string;

  @ManyToOne(() => Orgao)
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column({ type: 'varchar', length: 16, unique: true })
  codigo_validacao: string;

  @Column({ type: 'enum', enum: EntidadeTipo })
  entidade_tipo: EntidadeTipo;

  @Column({ type: 'uuid' })
  entidade_id: string;

  @Column({ type: 'uuid', nullable: true })
  usuario_id: string; // Pode ser nulo se for fornecedor e não tiver ID interno no mesmo formato

  @Column({ type: 'varchar', length: 255 })
  usuario_nome: string;

  @Column({ type: 'varchar', length: 20 })
  usuario_cpf_cnpj: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  usuario_cargo: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  usuario_telefone: string;

  @Column({ type: 'enum', enum: PapelAssinante })
  papel_assinante: PapelAssinante;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip_address: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  user_agent: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  documento_hash: string; // SHA-256

  @CreateDateColumn()
  data_assinatura: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

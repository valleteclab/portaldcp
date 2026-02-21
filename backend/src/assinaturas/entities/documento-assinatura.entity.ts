import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Orgao } from '../../orgaos/entities/orgao.entity';
import { SignatarioDocumento } from './signatario-documento.entity';

export enum StatusDocumentoAssinatura {
  RASCUNHO = 'RASCUNHO',
  AGUARDANDO_ASSINATURAS = 'AGUARDANDO_ASSINATURAS',
  CONCLUIDO = 'CONCLUIDO',
  CANCELADO = 'CANCELADO',
}

@Entity('documentos_assinatura')
export class DocumentoAssinatura {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'orgao_id', type: 'uuid' })
  orgao_id: string;

  @ManyToOne(() => Orgao)
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column({ type: 'varchar', length: 255 })
  titulo: string;

  @Column({ type: 'text', nullable: true })
  descricao: string;

  @Column({ type: 'varchar', length: 500 })
  arquivo_original_url: string; // Caminho do PDF original enviado

  @Column({ type: 'varchar', length: 500, nullable: true })
  arquivo_assinado_url: string; // Caminho do PDF final com todas as assinaturas

  @Column({ type: 'varchar', length: 64, nullable: true })
  documento_hash: string; // SHA-256 do arquivo original

  @Column({ type: 'enum', enum: StatusDocumentoAssinatura, default: StatusDocumentoAssinatura.RASCUNHO })
  status: StatusDocumentoAssinatura;

  @Column({ type: 'uuid', nullable: true })
  criado_por_id: string; // ID do usuário do órgão que fez o upload

  @OneToMany(() => SignatarioDocumento, signatario => signatario.documento, { cascade: true })
  signatarios: SignatarioDocumento[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
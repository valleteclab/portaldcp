import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { DocumentoAssinatura } from './documento-assinatura.entity';

export enum StatusAssinaturaSignatario {
  PENDENTE = 'PENDENTE',
  ASSINADO = 'ASSINADO',
  REJEITADO = 'REJEITADO',
}

@Entity('signatarios_documento')
export class SignatarioDocumento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'documento_id', type: 'uuid' })
  documento_id: string;

  @ManyToOne(() => DocumentoAssinatura, doc => doc.signatarios, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'documento_id' })
  documento: DocumentoAssinatura;

  @Column({ type: 'varchar', length: 255 })
  nome: string;

  @Column({ type: 'varchar', length: 20 })
  cpf_cnpj: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefone: string | null;

  @Column({ type: 'enum', enum: StatusAssinaturaSignatario, default: StatusAssinaturaSignatario.PENDENTE })
  status: StatusAssinaturaSignatario;

  @Column({ type: 'varchar', length: 64, unique: true })
  token_acesso: string; // Token único para o signatário acessar a página de assinatura

  @Column({ type: 'varchar', length: 16, nullable: true })
  codigo_validacao: string; // Gerado após a assinatura

  @Column({ type: 'timestamp', nullable: true })
  data_assinatura: Date;

  @Column({ type: 'int', nullable: true })
  pagina_assinatura: number; // Página onde a assinatura será inserida (1-indexed)

  @Column({ type: 'float', nullable: true })
  pos_x: number; // Posição X relativa (0-1) na página

  @Column({ type: 'float', nullable: true })
  pos_y: number; // Posição Y relativa (0-1) na página

  @Column({ type: 'boolean', default: false })
  is_orgao_user: boolean; // true = signatário é usuário interno do órgão

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip_address: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  user_agent: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
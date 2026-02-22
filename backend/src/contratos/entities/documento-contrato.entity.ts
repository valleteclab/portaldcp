import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Contrato } from './contrato.entity';

export enum TipoDocumentoContrato {
  CONTRATO = 'CONTRATO',
  TERMO_ADITIVO = 'TERMO_ADITIVO',
  APOSTILAMENTO = 'APOSTILAMENTO',
  ANEXO = 'ANEXO',
  ATA = 'ATA',
  OUTROS = 'OUTROS',
}

@Entity('documentos_contrato')
export class DocumentoContrato {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Contrato, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contrato_id' })
  contrato: Contrato;

  @Column()
  contrato_id: string;

  @Column({
    type: 'enum',
    enum: TipoDocumentoContrato,
    default: TipoDocumentoContrato.OUTROS,
  })
  tipo: TipoDocumentoContrato;

  @Column()
  titulo: string;

  @Column({ type: 'text', nullable: true })
  descricao: string;

  @Column()
  nome_arquivo: string;

  @Column()
  nome_original: string;

  @Column()
  caminho_arquivo: string;

  @Column({ default: 'application/pdf' })
  mime_type: string;

  @Column({ type: 'bigint', default: 0 })
  tamanho_bytes: number;

  @CreateDateColumn()
  created_at: Date;
}

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Contrato } from './contrato.entity';
import { TermoAditivo } from './termo-aditivo.entity';

export enum TipoDocumentoContrato {
  CONTRATO = 'CONTRATO',
  TERMO_ADITIVO = 'TERMO_ADITIVO',
  APOSTILAMENTO = 'APOSTILAMENTO',
  ANEXO = 'ANEXO',
  ATA = 'ATA',
  EXTRATO = 'EXTRATO',
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

  @Column({ nullable: true })
  termo_aditivo_id: string | null;

  @ManyToOne(() => TermoAditivo, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'termo_aditivo_id' })
  termo_aditivo: TermoAditivo;

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

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * DONO de um arquivo enviado (upload genérico `/api/uploads` e migração dos
 * documentos do registro cadastral). Fonte AUTORITATIVA de quem pode baixar o
 * arquivo: quando existe, referências em outros registros (ex.: um fornecedor
 * que grave no próprio cadastro a URL do arquivo de outro) não dão acesso.
 */
@Entity('arquivos_upload')
export class ArquivoUpload {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Caminho lógico `tipo/[sub/]nome` (o mesmo da URL `/api/uploads/...`). */
  @Index('UQ_arquivos_upload_caminho', { unique: true })
  @Column({ type: 'varchar', length: 512 })
  caminho: string;

  @Column({ type: 'varchar', length: 64 })
  tipo: string;

  /** Gravado no diretório privado (UPLOAD_PRIVATE_DIR). */
  @Column({ type: 'boolean', default: true })
  privado: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  nome_original: string | null;

  /** ORGAO | USUARIO | FORNECEDOR | ADMIN | MIGRACAO */
  @Column({ type: 'varchar', length: 20, nullable: true })
  enviado_por_tipo: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  enviado_por_id: string | null;

  @Index('IDX_arquivos_upload_orgao')
  @Column({ type: 'uuid', nullable: true })
  orgao_id: string | null;

  @Index('IDX_arquivos_upload_fornecedor')
  @Column({ type: 'uuid', nullable: true })
  fornecedor_id: string | null;

  @CreateDateColumn()
  created_at: Date;
}

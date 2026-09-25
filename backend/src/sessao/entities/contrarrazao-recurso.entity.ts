import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * CONTRARRAZÕES de um recurso (Lei 14.133/2021 art. 165; IN SEGES 73/2022
 * art. 40 §2º) — plano E5.
 *
 * Apresentadas pelo PRÓPRIO licitante (token), que não seja o recorrente, em
 * 3 dias úteis contados do fim do prazo das razões. Uma por licitante e
 * recurso. Arquivo guardado no banco (mesmo padrão da proposta adequada):
 * leitura pelo órgão dono e pelos licitantes da licitação.
 */
@Entity('recursos_contrarrazoes')
@Index('UQ_recursos_contrarrazoes', ['recurso_id', 'fornecedor_id'], { unique: true })
@Index('IDX_recursos_contrarrazoes_licitacao', ['licitacao_id'])
export class ContrarrazaoRecurso {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  recurso_id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'varchar' })
  fornecedor_id: string;

  @Column({ type: 'varchar', nullable: true })
  fornecedor_nome: string | null;

  @Column({ type: 'text' })
  texto: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  arquivo_nome: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  arquivo_mime: string | null;

  @Column({ type: 'int', nullable: true })
  arquivo_tamanho: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  arquivo_sha256: string | null;

  @Column({ type: 'bytea', nullable: true, select: false })
  arquivo_conteudo: Buffer | null;

  /** SALA | MIGRACAO_E5 */
  @Column({ type: 'varchar', length: 20, default: 'SALA' })
  origem: string;

  /** Data da apresentação (na migração, a data do registro antigo). */
  @Column({ type: 'timestamp' })
  apresentada_em: Date;

  @CreateDateColumn()
  created_at: Date;
}

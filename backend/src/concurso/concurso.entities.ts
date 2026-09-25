import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

/**
 * ============================================================================
 * CONCURSO (Lei 14.133/2021 arts. 6º XXXIX, 30, 33 III, 37, 55 IV e 93;
 * plano E7c) — regulamento, trabalhos sob código (sigilo de autoria) e
 * premiação/cessão de direitos. Produção: synchronize (nada a migrar).
 * ============================================================================
 */

export type NaturezaTrabalho = 'TECNICO' | 'CIENTIFICO' | 'ARTISTICO';

/** Regulamento do concurso (art. 30 I a III). */
@Entity('concurso_regulamentos')
export class ConcursoRegulamento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  licitacao_id: string;

  /** Trabalho técnico, científico ou artístico (art. 6º XXXIX). ARTISTICO → "conteúdo artístico" no PNCP. */
  @Column({ type: 'varchar', length: 12, default: 'TECNICO' })
  natureza_trabalho: NaturezaTrabalho;

  /** I — qualificação exigida dos participantes. */
  @Column({ type: 'text', nullable: true })
  qualificacao_exigida: string | null;

  /** II — diretrizes e formas de apresentação do trabalho. */
  @Column({ type: 'text', nullable: true })
  diretrizes_trabalho: string | null;

  @Column({ type: 'text', nullable: true })
  forma_apresentacao: string | null;

  /** III — condições de realização. */
  @Column({ type: 'text', nullable: true })
  condicoes_realizacao: string | null;

  /** III — prêmio ou remuneração ao vencedor. */
  @Column({ type: 'varchar', length: 12, default: 'PREMIO' })
  tipo_retribuicao: 'PREMIO' | 'REMUNERACAO';

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_premio: number | null;

  @Column({ type: 'text', nullable: true })
  descricao_premio: string | null;

  /** Concurso para elaboração de PROJETO → cessão dos direitos patrimoniais obrigatória (art. 30 parágrafo único; art. 93). */
  @Column({ type: 'boolean', default: false })
  elaboracao_projeto: boolean;

  @Column({ type: 'boolean', default: true })
  exige_cessao_direitos: boolean;

  @Column({ type: 'int', default: 20 })
  tamanho_maximo_mb: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

/**
 * Trabalho inscrito. A banca só vê o CÓDIGO e o arquivo do trabalho; a
 * identificação do autor (documentos de qualificação) fica num envelope
 * separado, aberto só depois da publicação do julgamento.
 */
@Entity('concurso_trabalhos')
@Unique('UQ_concurso_trabalho_fornecedor', ['licitacao_id', 'fornecedor_id'])
@Unique('UQ_concurso_trabalho_codigo', ['licitacao_id', 'codigo'])
export class ConcursoTrabalho {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'varchar', length: 64 })
  fornecedor_id: string;

  @Column({ type: 'uuid', nullable: true })
  proposta_id: string | null;

  /** Código aleatório (ex.: "T-7K3Q9") — a única identificação visível à banca. */
  @Column({ type: 'varchar', length: 12 })
  codigo: string;

  @Column({ type: 'varchar', length: 200 })
  titulo: string;

  @Column({ type: 'text', nullable: true })
  resumo: string | null;

  @Column({ type: 'bytea', select: false })
  arquivo: Buffer;

  @Column({ type: 'varchar', length: 100 })
  arquivo_mime: string;

  @Column({ type: 'int' })
  arquivo_tamanho: number;

  @Column({ type: 'varchar', length: 64 })
  arquivo_sha256: string;

  /** Envelope de identificação: documentos da qualificação exigida (art. 30 I). */
  @Column({ type: 'bytea', nullable: true, select: false })
  identificacao: Buffer | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  identificacao_nome: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  identificacao_mime: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  identificacao_sha256: string | null;

  @Column({ type: 'boolean', default: false })
  declaracao_autoria: boolean;

  @Column({ type: 'boolean', default: false })
  declaracao_cessao: boolean;

  @Column({ type: 'varchar', length: 16, default: 'SUBMETIDO' })
  status: 'SUBMETIDO' | 'RETIRADO';

  @Column({ type: 'varchar', length: 16, default: 'PENDENTE' })
  qualificacao: 'PENDENTE' | 'QUALIFICADO' | 'NAO_QUALIFICADO';

  @Column({ type: 'text', nullable: true })
  qualificacao_motivo: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  qualificacao_em: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

/** Premiação do vencedor + termo de cessão de direitos (art. 30 parágrafo único; art. 93). */
@Entity('concurso_premiacoes')
export class ConcursoPremiacao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'varchar', length: 64 })
  fornecedor_id: string;

  @Column({ type: 'uuid' })
  trabalho_id: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor: number;

  @Column({ type: 'varchar', length: 24, default: 'AGUARDANDO_CESSAO' })
  status: 'AGUARDANDO_CESSAO' | 'CESSAO_ACEITA' | 'PAGO';

  @Column({ type: 'boolean', default: true })
  exige_cessao: boolean;

  @Column({ type: 'varchar', length: 400, nullable: true })
  termo_caminho: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  termo_gerado_em: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cessao_aceita_em: Date | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  cessao_aceita_ip: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  pagamento_registrado_em: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  pagamento_registrado_por: string | null;

  @Column({ type: 'text', nullable: true })
  pagamento_observacao: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

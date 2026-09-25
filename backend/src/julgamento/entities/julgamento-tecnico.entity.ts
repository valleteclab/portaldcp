import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * JULGAMENTO TÉCNICO (Lei 14.133/2021 arts. 35–37) — critérios MELHOR_TECNICA e
 * TECNICA_E_PRECO. Tabelas próprias (a licitação não ganha colunas):
 *  - `julgamento_tecnico`   configuração do edital (peso da técnica ≤ 70%,
 *                           nota mínima) + publicação das notas (resultado congelado);
 *  - `quesitos_tecnicos`    quesito, peso, nota máxima (art. 37 II);
 *  - `comissao_julgamento`  banca designada (usuários do órgão; mín. 3 — art. 37 §1º);
 *  - `notas_tecnicas`       nota de CADA membro por quesito e licitante;
 *  - `documentos_tecnicos`  proposta técnica do licitante (arquivo no banco;
 *                           sigilo até a publicação das notas para os demais licitantes).
 * MAIOR_RETORNO_ECONOMICO (art. 39): `propostas_retorno_economico`.
 */
@Entity('julgamento_tecnico')
export class JulgamentoTecnico {
  @PrimaryColumn({ type: 'uuid' })
  licitacao_id: string;

  /** Percentual de valoração da proposta técnica (técnica e preço; ≤ 70). */
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  peso_tecnica: number | null;

  /** Nota técnica mínima (0–100) para seguir na licitação. */
  @Column({ type: 'decimal', precision: 7, scale: 4, nullable: true })
  nota_minima: number | null;

  @Column({ type: 'timestamp', nullable: true })
  publicado_em: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  publicado_por_tipo: string | null;

  @Column({ type: 'varchar', nullable: true })
  publicado_por_id: string | null;

  /** Resultado congelado na publicação: [{ fornecedorId, razaoSocial, notaTecnica, porQuesito, abaixoDoMinimo }]. */
  @Column({ type: 'jsonb', nullable: true })
  resultado: any[] | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

@Entity('quesitos_tecnicos')
@Index('IDX_quesitos_tecnicos_licitacao', ['licitacao_id'])
export class QuesitoTecnico {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'int' })
  ordem: number;

  @Column({ type: 'text' })
  descricao: string;

  @Column({ type: 'text', nullable: true })
  criterio_avaliacao: string | null;

  @Column({ type: 'decimal', precision: 9, scale: 4 })
  peso: number;

  @Column({ type: 'decimal', precision: 9, scale: 4 })
  nota_maxima: number;

  @CreateDateColumn()
  created_at: Date;
}

@Entity('comissao_julgamento')
@Index('UQ_comissao_julgamento', ['licitacao_id', 'usuario_id'], { unique: true })
export class ComissaoJulgamento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  /** Usuário (servidor) do órgão designado. */
  @Column({ type: 'uuid' })
  usuario_id: string;

  @Column({ type: 'varchar', length: 20, default: 'MEMBRO' })
  papel: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  designado_por_tipo: string | null;

  @Column({ type: 'varchar', nullable: true })
  designado_por_id: string | null;

  @CreateDateColumn()
  created_at: Date;
}

@Entity('notas_tecnicas')
@Index('UQ_notas_tecnicas', ['quesito_id', 'fornecedor_id', 'membro_id'], { unique: true })
@Index('IDX_notas_tecnicas_licitacao', ['licitacao_id'])
export class NotaTecnica {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'uuid' })
  quesito_id: string;

  @Column({ type: 'varchar' })
  fornecedor_id: string;

  /** Usuário membro da banca que atribuiu a nota. */
  @Column({ type: 'uuid' })
  membro_id: string;

  @Column({ type: 'decimal', precision: 9, scale: 4 })
  nota: number;

  @Column({ type: 'text', nullable: true })
  justificativa: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

@Entity('documentos_tecnicos')
@Index('IDX_documentos_tecnicos_licitacao', ['licitacao_id', 'fornecedor_id'])
export class DocumentoTecnico {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'varchar' })
  fornecedor_id: string;

  @Column({ type: 'varchar', length: 255 })
  nome: string;

  @Column({ type: 'text', nullable: true })
  descricao: string | null;

  @Column({ type: 'varchar', length: 100 })
  mime: string;

  @Column({ type: 'int' })
  tamanho: number;

  @Column({ type: 'varchar', length: 64 })
  sha256: string;

  @Column({ type: 'bytea', select: false })
  conteudo: Buffer;

  @CreateDateColumn()
  created_at: Date;
}

/** Proposta de trabalho + preço do maior retorno econômico (art. 39 §1º), por unidade. */
@Entity('propostas_retorno_economico')
@Index('UQ_propostas_retorno', ['unidade_id', 'fornecedor_id'], { unique: true })
export class PropostaRetornoEconomico {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  /** Item (ou lote) a que a proposta se refere. */
  @Column({ type: 'uuid' })
  unidade_id: string;

  @Column({ type: 'varchar' })
  fornecedor_id: string;

  /** Economia que se estima gerar, em R$ (art. 39 §1º I). */
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  economia_estimada: number;

  /** Economia na unidade de medida da obra/bem/serviço (art. 39 §1º I), texto livre. */
  @Column({ type: 'text', nullable: true })
  descricao_economia: string | null;

  /** Proposta de preço: percentual sobre a economia (art. 39 §1º II). */
  @Column({ type: 'decimal', precision: 7, scale: 4 })
  percentual_remuneracao: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

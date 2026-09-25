import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * EXIGÊNCIA DE HABILITAÇÃO do edital (Lei 14.133 arts. 62–69), por licitação.
 * Editável na fase interna; congelada a partir da publicação (alteração só por
 * retificação do edital — plano E7). `tipos_documento_cadastro` = tipos do
 * registro cadastral que a atendem (art. 70).
 */
@Entity('exigencias_habilitacao')
@Index('IDX_exigencias_habilitacao_licitacao', ['licitacao_id', 'ordem'])
export class ExigenciaHabilitacao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'int', default: 0 })
  ordem: number;

  /** CategoriaExigencia (regras-habilitacao.ts). */
  @Column({ type: 'varchar', length: 30 })
  categoria: string;

  @Column({ type: 'text' })
  descricao: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  base_legal: string | null;

  @Column({ type: 'boolean', default: true })
  obrigatorio: boolean;

  @Column({ type: 'boolean', default: true })
  aceita_registro_cadastral: boolean;

  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  tipos_documento_cadastro: string[];

  /** O documento precisa estar dentro da validade (certidões). */
  @Column({ type: 'boolean', default: false })
  exige_validade: boolean;

  /** Modelo de origem (BENS/SERVICOS/OBRAS/DISPENSA) ou null se editada à mão. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  modelo: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

/**
 * HABILITAÇÃO DE UM LICITANTE numa licitação (a habilitação é do licitante,
 * não do item — art. 62). Uma linha por convocação (ou por licitante, na
 * inversão de fases):
 *
 *   AGUARDANDO_ENVIO → (entrega: ato do licitante ou fim do prazo) → ENVIADA
 *   ENVIADA ⇄ EM_DILIGENCIA (art. 64)          ENVIADA → HABILITADO | INABILITADO (motivo)
 *   qualquer ativa → CANCELADA (reinício / recurso)
 *
 * Prazo ≥ 2 h (parâmetro do órgão), prorrogável UMA vez pelo mesmo período
 * (IN SEGES 73/2022 art. 39). Na inversão, o prazo é o do acolhimento.
 */
@Entity('habilitacoes_licitante')
@Index('IDX_habilitacoes_licitacao_fornecedor', ['licitacao_id', 'fornecedor_id'])
export class HabilitacaoLicitante {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'uuid', nullable: true })
  sessao_id: string | null;

  @Column({ type: 'varchar' })
  fornecedor_id: string;

  /** OrigemHabilitacao: CONVOCACAO | INVERSAO | MIGRACAO */
  @Column({ type: 'varchar', length: 12 })
  origem: string;

  /** StatusHabilitacao */
  @Column({ type: 'varchar', length: 20 })
  status: string;

  @Column({ type: 'timestamp' })
  convocada_em: Date;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  prazo_horas: number | null;

  @Column({ type: 'timestamp', nullable: true })
  prazo_ate: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  prorrogada_em: Date | null;

  @Column({ type: 'text', nullable: true })
  prorrogacao_motivo: string | null;

  /** Entrega da documentação (ato do licitante) — null se entregue pelo fim do prazo. */
  @Column({ type: 'timestamp', nullable: true })
  enviada_em: Date | null;

  /** Resultado da consulta ao registro cadastral na convocação (art. 70). */
  @Column({ type: 'jsonb', nullable: true })
  pre_checagem: Array<{ exigenciaId: string; coberta: boolean; documentoId: string | null; motivo: string | null }> | null;

  @Column({ type: 'timestamp', nullable: true })
  decidida_em: Date | null;

  @Column({ type: 'text', nullable: true })
  decisao_motivo: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  decidida_por_tipo: string | null;

  @Column({ type: 'varchar', nullable: true })
  decidida_por_id: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  convocada_por_tipo: string | null;

  @Column({ type: 'varchar', nullable: true })
  convocada_por_id: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

/**
 * DOCUMENTO apresentado para uma exigência. Origem CADASTRO (referência ao
 * documento do registro cadastral, com retrato), ENVIO (anexado no prazo) ou
 * COMPLEMENTO (diligência — nunca substitui o original). O ARQUIVO fica no
 * banco (`arquivo_conteudo`, nunca selecionado por padrão): a pasta de uploads
 * é pública; o documento só é lido pelo órgão dono e pelo próprio licitante.
 */
@Entity('documentos_habilitacao')
@Index('IDX_documentos_habilitacao_hab', ['habilitacao_id', 'exigencia_id'])
export class DocumentoHabilitacao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  habilitacao_id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'varchar' })
  fornecedor_id: string;

  @Column({ type: 'uuid' })
  exigencia_id: string;

  /** OrigemDocumento */
  @Column({ type: 'varchar', length: 12 })
  origem: string;

  @Column({ type: 'uuid', nullable: true })
  diligencia_id: string | null;

  // --- cadastro (art. 70) ---
  @Column({ type: 'uuid', nullable: true })
  fornecedor_documento_id: string | null;

  /** Retrato do documento do cadastro no momento da convocação (tipo, número, validade, arquivo). */
  @Column({ type: 'jsonb', nullable: true })
  cadastro: Record<string, any> | null;

  // --- arquivo enviado ---
  @Column({ type: 'varchar', nullable: true })
  arquivo_nome: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  arquivo_mime: string | null;

  @Column({ type: 'int', nullable: true })
  arquivo_tamanho: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  arquivo_sha256: string | null;

  @Column({ type: 'bytea', nullable: true, select: false })
  arquivo_conteudo: Buffer | null;

  /** Validade informada pelo licitante (certidões). */
  @Column({ type: 'date', nullable: true })
  validade: string | null;

  @Column({ type: 'text', nullable: true })
  observacao: string | null;

  @Column({ type: 'timestamp' })
  enviado_em: Date;

  // --- análise ---
  /** ResultadoAnalise */
  @Column({ type: 'varchar', length: 12, default: 'PENDENTE' })
  analise: string;

  @Column({ type: 'text', nullable: true })
  analise_motivo: string | null;

  @Column({ type: 'timestamp', nullable: true })
  analisado_em: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  analisado_por_tipo: string | null;

  @Column({ type: 'varchar', nullable: true })
  analisado_por_id: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

/** DILIGÊNCIA (Lei 14.133 art. 64; IN 73 art. 39 §4º): complementação com motivo e prazo próprios. */
@Entity('diligencias_habilitacao')
@Index('IDX_diligencias_habilitacao_hab', ['habilitacao_id'])
export class DiligenciaHabilitacao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  habilitacao_id: string;

  @Column({ type: 'uuid' })
  licitacao_id: string;

  @Column({ type: 'text' })
  motivo: string;

  @Column({ type: 'jsonb' })
  exigencia_ids: string[];

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  prazo_horas: number;

  @Column({ type: 'timestamp' })
  aberta_em: Date;

  @Column({ type: 'timestamp' })
  prazo_ate: Date;

  /** StatusDiligencia (ABERTA vencida é lida como EXPIRADA). */
  @Column({ type: 'varchar', length: 12 })
  status: string;

  @Column({ type: 'timestamp', nullable: true })
  respondida_em: Date | null;

  @Column({ type: 'text', nullable: true })
  resposta: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  aberta_por_tipo: string | null;

  @Column({ type: 'varchar', nullable: true })
  aberta_por_id: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Situação do DFD consolidado:
 *  - RASCUNHO: a unidade de planejamento monta (junta demandas, ajusta itens);
 *  - AGUARDANDO_APROVACAO: 2ª aprovação ligada no modelo de fluxo — aguarda o aprovador;
 *  - APROVADO: aprovado (2ª aprovação) — pronto para abrir o processo;
 *  - EM_PROCESSO: o processo foi aberto a partir dele (não muda mais);
 *  - CANCELADO: desfeito — as demandas voltam a ficar livres.
 */
export const STATUS_DFD = ['RASCUNHO', 'AGUARDANDO_APROVACAO', 'APROVADO', 'EM_PROCESSO', 'CANCELADO'] as const;
export type StatusDfd = (typeof STATUS_DFD)[number];

/** Situações em que o DFD segura as demandas (não entram em outro DFD nem abrem processo sozinhas). */
export const STATUS_DFD_ATIVO: StatusDfd[] = ['RASCUNHO', 'AGUARDANDO_APROVACAO', 'APROVADO', 'EM_PROCESSO'];

/**
 * DFD CONSOLIDADO (Lei 14.133, art. 12, VII; art. 72, I): feito pela unidade
 * de planejamento a partir de uma ou mais DEMANDAS (pedidos dos setores),
 * com os itens somados e a origem de cada quantidade. Abre UM processo.
 * A ligação com as demandas fica em `dfds_consolidados_demandas` (N:1); a
 * ligação com o processo, em `licitacao_id` (1:1).
 */
@Entity('dfds_consolidados')
@Index('uq_dfd_consolidado_numero', ['orgao_id', 'ano', 'numero'], { unique: true })
@Index('uq_dfd_consolidado_licitacao', ['licitacao_id'], { unique: true, where: 'licitacao_id IS NOT NULL' })
export class DfdConsolidado {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orgao_id: string;

  /** Exercício (o das demandas). */
  @Column({ type: 'int' })
  ano: number;

  /** Número sequencial no órgão e no exercício ("DFD nº 3/2026"). */
  @Column({ type: 'int' })
  numero: number;

  @Column({ type: 'varchar', length: 30, default: 'RASCUNHO' })
  status: StatusDfd;

  /** CONSOLIDACAO (tela do planejamento) | DEMANDA_UNICA ("Iniciar contratação" de uma demanda) | MIGRACAO (processo antigo de 1 demanda). */
  @Column({ type: 'varchar', length: 20, default: 'CONSOLIDACAO' })
  origem: string;

  @Column({ type: 'text' })
  objeto: string;

  /** Justificativa consolidada da necessidade (a de cada setor, revista pelo planejamento). */
  @Column({ type: 'text', nullable: true })
  justificativa: string | null;

  /** MATERIAL | SERVICO (natureza predominante dos itens). */
  @Column({ type: 'varchar', length: 20, default: 'MATERIAL' })
  categoria: string;

  /** Unidade de planejamento (setor do órgão) que formaliza o DFD. */
  @Column({ type: 'uuid', nullable: true })
  unidade_planejamento_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  unidade_planejamento_nome: string | null;

  @Column({ type: 'uuid', nullable: true })
  responsavel_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  responsavel_nome: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  responsavel_cargo: string | null;

  /** AAAA-MM-DD (data, sem fuso). */
  @Column({ type: 'date', nullable: true })
  data_pretendida: string | null;

  /** BAIXA | MEDIA | ALTA | URGENTE (os mesmos da peça DFD). */
  @Column({ type: 'varchar', length: 20, nullable: true })
  prioridade: string | null;

  /** Item do PCA do DFD (quando todas as demandas apontam o mesmo). */
  @Column({ type: 'uuid', nullable: true })
  item_pca_id: string | null;

  /** Itens consolidados (`ItemConsolidado[]` — soma, origem de cada quantidade, ajuste). */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  itens: Record<string, any>[];

  /** Ajustes do planejamento por item (chave → { quantidade, valor_unitario_estimado, descricao, justificativa, remover }). */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  ajustes: Record<string, any>;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_total_estimado: number;

  /** 2ª aprovação exigida (retrato do modelo de fluxo no envio/na abertura). */
  @Column({ type: 'boolean', default: false })
  exige_aprovacao: boolean;

  /** { por_id, por_nome, em, observacao } — 2ª aprovação (quando exigida). */
  @Column({ type: 'jsonb', nullable: true })
  aprovacao: Record<string, any> | null;

  /** { por_id, por_nome, em, motivo } — última devolução (2ª aprovação). */
  @Column({ type: 'jsonb', nullable: true })
  devolucao: Record<string, any> | null;

  /** [{ em, por_id, por_nome, acao, texto }] — histórico do DFD. */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  historico: Record<string, any>[];

  /** Processo aberto a partir deste DFD. */
  @Column({ type: 'uuid', nullable: true })
  licitacao_id: string | null;

  /** Processo eletrônico (fluxo desenhado) em que este DFD foi juntado na etapa DFD — alternativa à licitação. */
  @Column({ type: 'uuid', nullable: true })
  processo_id: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  criado_por_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  criado_por_nome: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

/**
 * LIGAÇÃO demanda ↔ DFD consolidado. Uma demanda está em UM DFD (índice
 * único): enquanto a ligação existe ela fica travada (não entra em outro DFD,
 * não abre processo sozinha, não é editada). Cancelar o DFD (ou tirar a
 * demanda do rascunho) apaga a ligação.
 */
@Entity('dfds_consolidados_demandas')
@Index('uq_dfd_demanda', ['demanda_id'], { unique: true })
export class DfdConsolidadoDemanda {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  dfd_id: string;

  @Column({ type: 'uuid' })
  demanda_id: string;

  @Column({ type: 'uuid' })
  orgao_id: string;

  /** Setor da demanda no momento da consolidação (para o PDF e a tela). */
  @Column({ type: 'varchar', length: 200, nullable: true })
  setor: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
